import { randomUUID } from 'crypto';
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  RemoveMessage,
  SystemMessage,
  ToolMessage
} from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  Annotation,
  Command,
  END,
  INTERRUPT,
  interrupt,
  isGraphInterrupt,
  isInterrupted,
  MemorySaver,
  messagesStateReducer,
  REMOVE_ALL_MESSAGES,
  START,
  StateGraph
} from '@langchain/langgraph';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  createAgentWhitelistItem,
  deleteAgentWhitelistItem,
  getAgentProviderSettings,
  listAgentWhitelist
} from '../data/session-store';
import {
  completeRemotePath,
  createRemoteDirectory,
  deleteRemoteEntry,
  renameRemoteEntry,
  writeRemoteTextFile
} from '../ssh/remote-files';
import { readRemoteApps } from '../ssh/remote-apps';
import { readLiveSystemMetrics, readSystemMetrics } from '../ssh/system-metrics';
import { sshExecInInteractiveShell } from '../ssh/ssh-runtime';
import type {
  AgentApprovalRequest,
  AgentProviderCode,
  AgentRiskLevel,
  AgentRunPhase,
  AgentStateSnapshot,
  AgentThreadMessage,
  AgentWhitelistItem,
  ResolveAgentApprovalPayload,
  RunAgentPayload,
  SaveAgentWhitelistPayload
} from '../shared/types';
import { createAgentModel } from './model';
import { assessCommandRisk, getRiskConfirmCount, requiresRiskApproval } from './risk';
import { broadcastHarmlessAgentEvent } from './runtime-events';

const SYSTEM_PROMPT = `
You are cool-buddy, an operations-focused AI agent embedded in a terminal workbench.

Rules:
- You help with Linux ops, diagnostics, services, logs, remote files, and container checks.
- Use tools whenever a factual check or action is needed.
- Prefer read-only inspection before mutation.
- Be concise, explicit, and operationally careful.
- If a tool reports a user denial or pending approval, adapt the plan instead of insisting.
- Never suggest or attempt permanently destructive commands.
`.trim();

const HISTORY_SUMMARY_PREFIX = '[Compressed conversation summary]\n';
const CONTEXT_COMPRESSION_PROMPT = `
You compress earlier chat history for a tool-using SSH operations agent.

Produce a concise rolling summary that preserves only the information needed to continue safely:
- the user's current goal
- confirmed facts and findings
- commands, paths, services, logs, or files that matter
- tool results, approvals, denials, and write actions
- open questions or next steps

Rules:
- Do not invent details.
- Prefer exact names, commands, paths, and numbers when they matter.
- Drop chit-chat and duplicated detail.
- Return plain text with short bullet points under helpful headings.
`.trim();
const CONTEXT_COMPRESSION_THRESHOLD = 0.8;
const DEFAULT_CONTEXT_WINDOW_TOKENS = 8192;
const MIN_RECENT_MESSAGES_TO_KEEP = 6;
const MAX_CONTEXT_COMPRESSION_PASSES = 3;
const MAX_SUMMARY_BATCH_TOKENS = 12000;
const MAX_AGENT_TURNS = 8;
const CONTEXT_WINDOW_OVERRIDE_ENV = 'COOL_BUDDY_AGENT_CONTEXT_WINDOW_TOKENS';
const CONTEXT_COMPRESSION_THRESHOLD_OVERRIDE_ENV = 'COOL_BUDDY_AGENT_CONTEXT_COMPRESSION_THRESHOLD';

const DEFAULT_CONTEXT_WINDOW_BY_PROVIDER: Record<AgentProviderCode, number> = {
  openai: 128000,
  'azure-openai': 128000,
  anthropic: 200000,
  'google-gemini': 128000,
  deepseek: 64000,
  qwen: 32768,
  zhipu: 32768,
  moonshot: 8192,
  'baidu-qianfan': 8192,
  siliconflow: 64000,
  groq: 32768,
  mistral: 32768,
  openrouter: 128000,
  ollama: DEFAULT_CONTEXT_WINDOW_TOKENS,
  'lm-studio': DEFAULT_CONTEXT_WINDOW_TOKENS,
  xai: 128000,
  perplexity: 32768,
  fireworks: 32768,
  together: 32768,
  'volcengine-ark': 32768,
  'tencent-hunyuan': 32768,
  minimax: 32768,
  '302ai': 128000,
  custom: DEFAULT_CONTEXT_WINDOW_TOKENS
};

type ToolCallShape = {
  id?: string;
  name: string;
  args: unknown;
};

type ToolExecutionResult =
  | {
      type: 'completed';
      content: string;
    }
  | {
      type: 'pending-approval';
      approval: AgentApprovalRequest;
    };

type ToolExecutionOptions = {
  approvalBypass: boolean;
};

type ToolDefinition = {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (input: any, options: ToolExecutionOptions) => Promise<ToolExecutionResult>;
};

const AGENT_GRAPH_STATE = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => []
  }),
  activeToolCalls: Annotation<ToolCallShape[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  toolCallIndex: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 0
  }),
  turnCount: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 0
  })
});

type AgentGraphState = typeof AGENT_GRAPH_STATE.State;
type AgentGraphNodeName = typeof START | 'prepare_context' | 'agent' | 'tool' | 'max_turns';
type ApprovalResumeValue = {
  approvalId: string;
  approve: boolean;
};
type AgentGraphCommand = Command<ApprovalResumeValue, Partial<AgentGraphState>, AgentGraphNodeName>;

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function serializeMessageForLog(message: BaseMessage) {
  const messageType =
    message instanceof SystemMessage
      ? 'system'
      : message instanceof HumanMessage
        ? 'user'
        : message instanceof ToolMessage
          ? 'tool'
          : message instanceof AIMessage
            ? 'assistant'
            : message.getType();

  const serialized: Record<string, unknown> = {
    type: messageType,
    content: getMessageText(message.content)
  };

  if (message instanceof ToolMessage) {
    serialized.toolCallId = message.tool_call_id;
  }

  if (
    message instanceof AIMessage &&
    Array.isArray(message.tool_calls) &&
    message.tool_calls.length
  ) {
    serialized.toolCalls = message.tool_calls.map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.name,
      args: toolCall.args
    }));
  }

  return serialized;
}

function createHistorySummaryMessage(summary: string): SystemMessage {
  return new SystemMessage(`${HISTORY_SUMMARY_PREFIX}${summary.trim()}`);
}

function isHistorySummaryMessage(message: BaseMessage): boolean {
  return (
    message instanceof SystemMessage &&
    getMessageText(message.content).startsWith(HISTORY_SUMMARY_PREFIX)
  );
}

function extractHistorySummary(message: BaseMessage): string {
  if (!isHistorySummaryMessage(message)) {
    return '';
  }

  return getMessageText(message.content).slice(HISTORY_SUMMARY_PREFIX.length).trim();
}

function logLlmRequest(payload: Record<string, unknown>) {
  console.info('[harmless-agent] llm-request', formatJson(payload));
}

function logLlmSuccess(payload: Record<string, unknown>) {
  console.info('[harmless-agent] llm-success', formatJson(payload));
}

function logLlmFailure(payload: Record<string, unknown>) {
  console.error('[harmless-agent] llm-failure', formatJson(payload));
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function getMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
          return item.text;
        }

        return '';
      })
      .join('\n')
      .trim();
  }

  return '';
}

function formatDirectoryListCommand(input: { path?: string; showHidden?: boolean }): string {
  const targetPath = input.path?.trim() || '.';
  const flags = input.showHidden ? '-la' : '-l';
  return `LC_ALL=C ls ${flags} --group-directories-first -- ${quoteShellArg(targetPath)}`;
}

function formatReadFileCommand(path: string): string {
  return `sed -n '1,240p' -- ${quoteShellArg(path.trim())}`;
}

function formatAgentError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Harmless agent failed.';

  if (/MODEL_NOT_FOUND/i.test(message) || /model.*not found/i.test(message)) {
    return (
      'The configured model was not found by the provider. Check the model name in Terminal Settings, ' +
      'or reload the provider model list and pick one that exists.'
    );
  }

  if (/404/.test(message)) {
    return (
      'The provider returned 404. The Base URL may point to a chat endpoint instead of the API root, ' +
      'or the selected model path is unsupported.'
    );
  }

  return message;
}

function readPositiveIntegerEnv(name: string): number | null {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) {
    return null;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
}

function readCompressionThresholdRatio(): number {
  const rawValue = process.env[CONTEXT_COMPRESSION_THRESHOLD_OVERRIDE_ENV]?.trim();
  if (!rawValue) {
    return CONTEXT_COMPRESSION_THRESHOLD;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1) {
    return CONTEXT_COMPRESSION_THRESHOLD;
  }

  return parsed;
}

function inferContextWindowTokens(providerCode: AgentProviderCode, modelName: string): number {
  const explicitOverride = readPositiveIntegerEnv(CONTEXT_WINDOW_OVERRIDE_ENV);
  if (explicitOverride) {
    return explicitOverride;
  }

  const normalizedModelName = modelName.trim().toLowerCase();
  const explicitWindowMatch = normalizedModelName.match(/(?:^|[-_/])(\d+)(k|m)(?:$|[-_/])/i);

  if (explicitWindowMatch) {
    const value = Number(explicitWindowMatch[1]);
    if (Number.isFinite(value) && value > 0) {
      return explicitWindowMatch[2].toLowerCase() === 'm' ? value * 1_000_000 : value * 1_000;
    }
  }

  return DEFAULT_CONTEXT_WINDOW_BY_PROVIDER[providerCode] ?? DEFAULT_CONTEXT_WINDOW_TOKENS;
}

function isContextWindowError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /context length|context window|too many tokens|token limit|maximum context|prompt is too long/i.test(
    message
  );
}

function createApprovalRequest(input: {
  toolName: string;
  riskLevel: AgentRiskLevel;
  summary: string;
  details: string;
  command?: string | null;
}): AgentApprovalRequest {
  return {
    id: randomUUID(),
    toolName: input.toolName,
    riskLevel: input.riskLevel,
    title: `${input.toolName} requires confirmation`,
    summary: input.summary,
    details: input.details,
    command: input.command ?? null,
    confirmCount: getRiskConfirmCount(input.riskLevel),
    createdAt: new Date().toISOString()
  };
}

export class HarmlessAgentRuntime {
  constructor(private readonly sessionId: string) {
    this.toolDefinitions = this.createToolDefinitions();
    this.modelTools = this.toolDefinitions.map((definition) =>
      tool(async () => 'Handled by Harmless runtime.', {
        name: definition.name,
        description: definition.description,
        schema: definition.schema
      })
    );
  }

  private messageHistory: BaseMessage[] = [];

  private threadMessages: AgentThreadMessage[] = [];

  private pendingApproval: AgentApprovalRequest | null = null;

  private running = false;

  private phase: AgentRunPhase = 'idle';

  private lastError = '';

  private historySummary = '';

  private readonly graphCheckpointer = new MemorySaver();

  private readonly toolDefinitions: ToolDefinition[];

  private readonly modelTools;

  getState(): AgentStateSnapshot {
    return this.createSnapshot();
  }

  async run(payload: RunAgentPayload): Promise<AgentStateSnapshot> {
    const prompt = payload.prompt.trim();
    if (!prompt) {
      return this.createSnapshot();
    }

    if (this.pendingApproval) {
      throw new Error('Resolve or reject the pending approval before sending another prompt.');
    }

    if (this.running) {
      throw new Error('Harmless agent is already running.');
    }

    const settings = this.ensureConfigured();
    this.running = true;
    this.phase = 'running';
    this.lastError = '';
    this.pendingApproval = null;
    this.appendThreadMessage('user', prompt);
    this.broadcastState();

    try {
      await this.executeGraphInvocation(settings, {
        messages: [new HumanMessage(prompt)],
        turnCount: 0
      });
    } catch (error) {
      this.lastError = formatAgentError(error);
      this.appendThreadMessage('system', this.lastError);
    } finally {
      this.running = false;
      this.phase = this.pendingApproval ? 'awaiting-approval' : 'idle';
      this.broadcastState();
    }

    return this.createSnapshot();
  }

  async resolveApproval(payload: ResolveAgentApprovalPayload): Promise<AgentStateSnapshot> {
    if (!this.pendingApproval || this.pendingApproval.id !== payload.approvalId) {
      throw new Error('The approval request is no longer active.');
    }

    const settings = this.ensureConfigured();
    this.running = true;
    this.phase = 'running';
    this.lastError = '';
    this.pendingApproval = null;
    this.broadcastState();

    try {
      await this.executeGraphInvocation(
        settings,
        new Command<ApprovalResumeValue, Partial<AgentGraphState>, AgentGraphNodeName>({
          resume: {
            approvalId: payload.approvalId,
            approve: payload.approve
          }
        })
      );
    } catch (error) {
      this.lastError = formatAgentError(error);
      this.appendThreadMessage('system', this.lastError);
    } finally {
      this.running = false;
      this.phase = this.pendingApproval ? 'awaiting-approval' : 'idle';
      this.broadcastState();
    }

    return this.createSnapshot();
  }

  listWhitelist(): AgentWhitelistItem[] {
    return listAgentWhitelist();
  }

  createWhitelistItem(payload: SaveAgentWhitelistPayload): AgentWhitelistItem {
    return createAgentWhitelistItem(payload);
  }

  deleteWhitelistItem(id: string): AgentWhitelistItem[] {
    deleteAgentWhitelistItem(id);
    return listAgentWhitelist();
  }

  private ensureConfigured() {
    const settings = getAgentProviderSettings();
    if (!settings.baseUrl.trim() || !settings.apiKey.trim()) {
      throw new Error('Configure the model provider, base URL, and API key first.');
    }
    return settings;
  }

  private createSnapshot(): AgentStateSnapshot {
    const settings = getAgentProviderSettings();
    return {
      messages: [...this.threadMessages],
      pendingApproval: this.pendingApproval,
      running: this.running,
      phase: this.phase,
      configured: Boolean(settings.baseUrl.trim() && settings.apiKey.trim()),
      lastError: this.lastError
    };
  }

  private broadcastState(): void {
    broadcastHarmlessAgentEvent({
      type: 'state',
      sessionId: this.sessionId,
      snapshot: this.createSnapshot()
    });
  }

  private appendThreadMessage(
    role: AgentThreadMessage['role'],
    content: string,
    toolName: string | null = null
  ): AgentThreadMessage | null {
    const trimmed = content.trim();
    if (!trimmed) {
      return null;
    }

    const message: AgentThreadMessage = {
      id: randomUUID(),
      role,
      content: trimmed,
      createdAt: new Date().toISOString(),
      toolName
    };

    this.threadMessages.push(message);
    broadcastHarmlessAgentEvent({
      sessionId: this.sessionId,
      type: 'message-upsert',
      message
    });
    return message;
  }

  private createThreadMessage(
    role: AgentThreadMessage['role'],
    content: string,
    toolName: string | null = null
  ): AgentThreadMessage {
    const message: AgentThreadMessage = {
      id: randomUUID(),
      role,
      content,
      createdAt: new Date().toISOString(),
      toolName
    };

    this.threadMessages.push(message);
    broadcastHarmlessAgentEvent({
      sessionId: this.sessionId,
      type: 'message-upsert',
      message
    });

    return message;
  }

  private setThreadMessageContent(messageId: string, content: string): void {
    const target = this.threadMessages.find((item) => item.id === messageId);
    if (!target) {
      return;
    }

    target.content = content;
    broadcastHarmlessAgentEvent({
      sessionId: this.sessionId,
      type: 'message-upsert',
      message: { ...target }
    });
  }

  private async executeShellCommandForAgent(command: string): Promise<string> {
    return await sshExecInInteractiveShell(command);
  }

  private setPhase(phase: AgentRunPhase): void {
    if (this.phase === phase) {
      return;
    }

    this.phase = phase;
    this.broadcastState();
  }

  private getGraphConfig() {
    return {
      configurable: {
        thread_id: `harmless-agent:${this.sessionId}`
      }
    };
  }

  private hydrateHistoryState(messages: BaseMessage[]): void {
    const persistedMessages = messages.filter(
      (message) =>
        !(message instanceof SystemMessage && getMessageText(message.content) === SYSTEM_PROMPT)
    );
    const summaryMessage = persistedMessages.find(isHistorySummaryMessage);

    this.historySummary = summaryMessage ? extractHistorySummary(summaryMessage) : '';
    this.messageHistory = [new SystemMessage(SYSTEM_PROMPT), ...persistedMessages];
  }

  private getPersistedMessages(): BaseMessage[] {
    return this.messageHistory.slice(1);
  }

  private createMessageResetUpdate(messages: BaseMessage[]) {
    return {
      messages: [new RemoveMessage({ id: REMOVE_ALL_MESSAGES }), ...messages]
    };
  }

  private getConversationMessages(): BaseMessage[] {
    return this.messageHistory.filter(
      (message, index) =>
        !(index === 0 && message instanceof SystemMessage) && !isHistorySummaryMessage(message)
    );
  }

  private rebuildMessageHistory(recentMessages: BaseMessage[]): void {
    this.messageHistory = [new SystemMessage(SYSTEM_PROMPT)];

    if (this.historySummary.trim()) {
      this.messageHistory.push(createHistorySummaryMessage(this.historySummary));
    }

    this.messageHistory.push(...recentMessages);
  }

  private async getMessageHistoryTokenCount(
    model: BaseChatModel,
    messages: BaseMessage[] = this.messageHistory
  ): Promise<number> {
    const modelWithMessageCounter = model as BaseChatModel & {
      getNumTokensFromMessages?: (
        messages: BaseMessage[]
      ) => Promise<number | { totalCount?: number }>;
    };

    if (typeof modelWithMessageCounter.getNumTokensFromMessages === 'function') {
      try {
        const result = await modelWithMessageCounter.getNumTokensFromMessages(messages);
        if (typeof result === 'number') {
          return result;
        }

        if (typeof result?.totalCount === 'number') {
          return result.totalCount;
        }
      } catch {
        // Fall back to approximate counting below.
      }
    }

    let total = 0;
    for (const message of messages) {
      total += await this.estimateMessageTokenCount(model, message);
    }
    return total;
  }

  private async estimateMessageTokenCount(
    model: BaseChatModel,
    message: BaseMessage
  ): Promise<number> {
    let total = 6;
    const text = getMessageText(message.content);

    if (text) {
      total += await model.getNumTokens(text);
    }

    if (message instanceof ToolMessage && message.tool_call_id) {
      total += await model.getNumTokens(message.tool_call_id);
    }

    if (
      message instanceof AIMessage &&
      Array.isArray(message.tool_calls) &&
      message.tool_calls.length > 0
    ) {
      total += await model.getNumTokens(
        JSON.stringify(
          message.tool_calls.map((toolCall) => ({
            id: toolCall.id,
            name: toolCall.name,
            args: toolCall.args
          }))
        )
      );
    }

    return total;
  }

  private findCompressionSplitIndex(messages: BaseMessage[]): number {
    if (messages.length <= MIN_RECENT_MESSAGES_TO_KEEP) {
      return 0;
    }

    let splitIndex = Math.max(1, messages.length - MIN_RECENT_MESSAGES_TO_KEEP);

    while (splitIndex > 0) {
      const current = messages[splitIndex];
      const previous = messages[splitIndex - 1];

      if (current instanceof ToolMessage) {
        splitIndex -= 1;
        continue;
      }

      if (
        previous instanceof AIMessage &&
        Array.isArray(previous.tool_calls) &&
        previous.tool_calls.length > 0
      ) {
        splitIndex -= 1;
        continue;
      }

      break;
    }

    return splitIndex;
  }

  private formatMessagesForCompression(messages: BaseMessage[]): string {
    return messages
      .flatMap((message) => {
        const text = getMessageText(message.content);

        if (message instanceof HumanMessage) {
          return text ? [`user: ${text}`] : [];
        }

        if (message instanceof ToolMessage) {
          return [`tool(${message.tool_call_id ?? 'unknown'}): ${text}`];
        }

        if (message instanceof AIMessage) {
          const lines = text ? [`assistant: ${text}`] : [];
          if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
            lines.push(
              `assistant_tool_calls: ${JSON.stringify(
                message.tool_calls.map((toolCall) => ({
                  id: toolCall.id,
                  name: toolCall.name,
                  args: toolCall.args
                }))
              )}`
            );
          }
          return lines;
        }

        if (message instanceof SystemMessage) {
          return text ? [`system: ${text}`] : [];
        }

        return text ? [`${message.getType()}: ${text}`] : [];
      })
      .join('\n\n');
  }

  private async buildCompressionBatches(
    model: BaseChatModel,
    messages: BaseMessage[],
    maxTokensPerBatch: number
  ): Promise<BaseMessage[][]> {
    const batches: BaseMessage[][] = [];
    let currentBatch: BaseMessage[] = [];
    let currentBatchTokens = 0;

    for (const message of messages) {
      const messageTokens = await this.estimateMessageTokenCount(model, message);
      const wouldOverflow =
        currentBatch.length > 0 && currentBatchTokens + messageTokens > maxTokensPerBatch;

      if (wouldOverflow) {
        batches.push(currentBatch);
        currentBatch = [message];
        currentBatchTokens = messageTokens;
        continue;
      }

      currentBatch.push(message);
      currentBatchTokens += messageTokens;
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  private async summarizeMessages(
    model: BaseChatModel,
    rollingSummary: string,
    messages: BaseMessage[],
    contextWindowTokens: number
  ): Promise<string> {
    if (messages.length === 0) {
      return rollingSummary.trim();
    }

    const batchTokenLimit = Math.max(
      1200,
      Math.min(MAX_SUMMARY_BATCH_TOKENS, Math.floor(contextWindowTokens * 0.35))
    );
    const batches = await this.buildCompressionBatches(model, messages, batchTokenLimit);
    let nextSummary = rollingSummary.trim();

    for (const batch of batches) {
      const transcript = this.formatMessagesForCompression(batch);
      const prompt = [
        nextSummary ? `Existing summary:\n${nextSummary}` : '',
        `New transcript segment to compress:\n${transcript}`
      ]
        .filter(Boolean)
        .join('\n\n');
      const response = await model.invoke([
        new SystemMessage(CONTEXT_COMPRESSION_PROMPT),
        new HumanMessage(prompt)
      ]);
      const summaryText = getMessageText(response.content);

      if (summaryText) {
        nextSummary = summaryText;
      }
    }

    return nextSummary;
  }

  private async compressHistoryIfNeeded(
    model: BaseChatModel,
    settings: ReturnType<HarmlessAgentRuntime['ensureConfigured']>,
    options?: { force?: boolean }
  ): Promise<boolean> {
    const contextWindowTokens = inferContextWindowTokens(settings.providerCode, settings.modelName);
    const compressionThreshold = Math.floor(contextWindowTokens * readCompressionThresholdRatio());
    const currentTokens = await this.getMessageHistoryTokenCount(model);

    if (!options?.force && currentTokens < compressionThreshold) {
      return false;
    }

    const previousPhase = this.phase === 'awaiting-approval' ? 'awaiting-approval' : 'running';
    this.setPhase('compressing');

    let changed = false;

    try {
      for (let pass = 0; pass < MAX_CONTEXT_COMPRESSION_PASSES; pass += 1) {
        const updatedTokenCount =
          pass === 0 ? currentTokens : await this.getMessageHistoryTokenCount(model);

        if (updatedTokenCount < compressionThreshold && changed) {
          break;
        }

        const conversationMessages = this.getConversationMessages();
        const splitIndex = this.findCompressionSplitIndex(conversationMessages);
        if (splitIndex <= 0) {
          break;
        }

        const messagesToCompress = conversationMessages.slice(0, splitIndex);
        const recentMessages = conversationMessages.slice(splitIndex);
        const summaryBefore = this.historySummary;

        this.historySummary = await this.summarizeMessages(
          model,
          this.historySummary,
          messagesToCompress,
          contextWindowTokens
        );
        this.rebuildMessageHistory(recentMessages);

        changed =
          changed ||
          summaryBefore.trim() !== this.historySummary.trim() ||
          recentMessages.length !== conversationMessages.length;

        const nextTokenCount = await this.getMessageHistoryTokenCount(model);
        console.info(
          '[harmless-agent] context-compression',
          formatJson({
            sessionId: this.sessionId,
            providerCode: settings.providerCode,
            modelName: settings.modelName,
            beforeTokens: updatedTokenCount,
            afterTokens: nextTokenCount,
            thresholdTokens: compressionThreshold,
            compressedMessageCount: messagesToCompress.length,
            remainingMessageCount: recentMessages.length
          })
        );

        if (nextTokenCount < compressionThreshold) {
          break;
        }
      }
    } finally {
      this.setPhase(previousPhase);
    }

    if (options?.force && !changed) {
      throw new Error(
        'The conversation exceeded the model context window and there is not enough older history left to compress.'
      );
    }

    if (options?.force) {
      const tokenCountAfterCompression = await this.getMessageHistoryTokenCount(model);
      if (tokenCountAfterCompression >= contextWindowTokens) {
        throw new Error(
          'The current request is still too large after context compression. Shorten the latest prompt or reduce tool output.'
        );
      }
    }

    return changed;
  }

  private async executeGraphInvocation(
    settings: ReturnType<HarmlessAgentRuntime['ensureConfigured']>,
    input: { messages: BaseMessage[]; turnCount: number } | AgentGraphCommand
  ): Promise<void> {
    const graph = this.createExecutionGraph(settings);
    const config = this.getGraphConfig();
    const result = await graph.invoke(input, config);
    const graphState = await graph.getState(config);
    const values = graphState.values as Partial<AgentGraphState>;

    if (Array.isArray(values.messages)) {
      this.hydrateHistoryState(values.messages);
    }

    if (isInterrupted<AgentApprovalRequest>(result)) {
      this.pendingApproval =
        (result[INTERRUPT][0]?.value as AgentApprovalRequest | undefined) ?? null;
      return;
    }

    this.pendingApproval = null;
  }

  private createExecutionGraph(settings: ReturnType<HarmlessAgentRuntime['ensureConfigured']>) {
    const baseModel = createAgentModel(settings) as BaseChatModel & {
      bindTools?: (tools: unknown[]) => {
        stream: (
          messages: BaseMessage[],
          options?: Record<string, unknown>
        ) => Promise<AsyncIterable<AIMessageChunk>>;
      };
    };
    const model = baseModel.bindTools?.(this.modelTools);

    if (!model) {
      throw new Error('The selected model does not support tool binding.');
    }

    return new StateGraph(AGENT_GRAPH_STATE)
      .addNode('prepare_context', async (state) => {
        this.hydrateHistoryState(state.messages);
        const changed = await this.compressHistoryIfNeeded(baseModel, settings);

        if (!changed) {
          return {};
        }

        return this.createMessageResetUpdate(this.getPersistedMessages());
      })
      .addNode('agent', async (state) => {
        this.hydrateHistoryState(state.messages);

        const assistantMessage = this.createThreadMessage('assistant', '');
        let aggregated: AIMessageChunk | null = null;
        const requestLogPayload = {
          sessionId: this.sessionId,
          turn: state.turnCount + 1,
          providerCode: settings.providerCode,
          providerName: settings.providerName,
          modelName: settings.modelName,
          baseUrl: settings.baseUrl.trim(),
          messages: this.messageHistory.map((message) => serializeMessageForLog(message)),
          tools: this.toolDefinitions.map((definition) => definition.name)
        };

        logLlmRequest(requestLogPayload);

        try {
          const stream = await model.stream(this.messageHistory);

          for await (const chunk of stream) {
            aggregated = aggregated ? aggregated.concat(chunk) : chunk;
            const content = getMessageText(aggregated.content);
            if (content) {
              this.setThreadMessageContent(assistantMessage.id, content);
            }
          }
        } catch (error) {
          this.threadMessages = this.threadMessages.filter(
            (item) => item.id !== assistantMessage.id
          );
          this.broadcastState();
          logLlmFailure({
            ...requestLogPayload,
            error: error instanceof Error ? error.message : String(error)
          });

          if (isContextWindowError(error)) {
            await this.compressHistoryIfNeeded(baseModel, settings, { force: true });
            return new Command({
              goto: 'agent',
              update: this.createMessageResetUpdate(this.getPersistedMessages())
            });
          }

          throw error;
        }

        if (!aggregated) {
          this.threadMessages = this.threadMessages.filter(
            (item) => item.id !== assistantMessage.id
          );
          this.broadcastState();
          return {
            activeToolCalls: [],
            toolCallIndex: 0,
            turnCount: state.turnCount + 1
          };
        }

        const response = aggregated as AIMessage;
        const responseText = getMessageText(response.content);
        const toolCalls = (response.tool_calls ?? []) as ToolCallShape[];

        logLlmSuccess({
          ...requestLogPayload,
          response: {
            content: responseText,
            toolCalls: toolCalls.map((toolCall) => ({
              id: toolCall.id,
              name: toolCall.name,
              args: toolCall.args
            }))
          }
        });

        if (responseText) {
          this.setThreadMessageContent(assistantMessage.id, responseText);
        } else {
          this.threadMessages = this.threadMessages.filter(
            (item) => item.id !== assistantMessage.id
          );
          this.broadcastState();
        }

        return {
          messages: [response],
          activeToolCalls: toolCalls,
          toolCallIndex: 0,
          turnCount: state.turnCount + 1
        };
      })
      .addNode('tool', async (state) => {
        this.hydrateHistoryState(state.messages);
        const toolCall = state.activeToolCalls[state.toolCallIndex];

        if (!toolCall) {
          return {
            activeToolCalls: [],
            toolCallIndex: 0
          };
        }
        const isLastToolCall = state.toolCallIndex + 1 >= state.activeToolCalls.length;
        const nextToolState = isLastToolCall
          ? {
              activeToolCalls: [],
              toolCallIndex: 0
            }
          : {
              activeToolCalls: state.activeToolCalls,
              toolCallIndex: state.toolCallIndex + 1
            };

        try {
          const result = await this.invokeTool(toolCall, { approvalBypass: false });

          if (result.type === 'pending-approval') {
            const resume = interrupt<AgentApprovalRequest, ApprovalResumeValue>(result.approval);

            if (!resume.approve) {
              const deniedMessage = `Execution denied by the user for ${toolCall.name}.`;
              this.appendThreadMessage('system', deniedMessage);
              return {
                messages: [
                  new ToolMessage({
                    content: deniedMessage,
                    tool_call_id: toolCall.id ?? toolCall.name
                  })
                ],
                ...nextToolState
              };
            }

            const approvedResult = await this.invokeTool(toolCall, { approvalBypass: true });
            if (approvedResult.type !== 'completed') {
              throw new Error('Tool approval loop entered an invalid state.');
            }

            return {
              messages: [
                new ToolMessage({
                  content: approvedResult.content,
                  tool_call_id: toolCall.id ?? toolCall.name
                })
              ],
              ...nextToolState
            };
          }

          return {
            messages: [
              new ToolMessage({
                content: result.content,
                tool_call_id: toolCall.id ?? toolCall.name
              })
            ],
            ...nextToolState
          };
        } catch (error) {
          if (isGraphInterrupt(error)) {
            throw error;
          }

          const message = error instanceof Error ? error.message : `Tool ${toolCall.name} failed.`;
          this.appendThreadMessage('system', message);
          return {
            messages: [
              new ToolMessage({
                content: message,
                tool_call_id: toolCall.id ?? toolCall.name
              })
            ],
            ...nextToolState
          };
        }
      })
      .addNode('max_turns', async () => {
        this.appendThreadMessage(
          'assistant',
          'Stopped after the maximum number of tool turns. Please refine the request.'
        );
        return {};
      })
      .addEdge(START, 'prepare_context')
      .addEdge('prepare_context', 'agent')
      .addConditionalEdges('agent', (state) => {
        return state.activeToolCalls.length > 0 ? 'tool' : END;
      })
      .addConditionalEdges('tool', (state) => {
        if (state.activeToolCalls.length > 0) {
          return 'tool';
        }

        return state.turnCount >= MAX_AGENT_TURNS ? 'max_turns' : 'prepare_context';
      })
      .addEdge('max_turns', END)
      .compile({
        checkpointer: this.graphCheckpointer,
        name: 'harmless-agent-runtime'
      });
  }

  private async invokeTool(
    toolCall: ToolCallShape,
    options: ToolExecutionOptions
  ): Promise<ToolExecutionResult> {
    const definition = this.toolDefinitions.find((item) => item.name === toolCall.name);
    if (!definition) {
      throw new Error(`Unknown tool: ${toolCall.name}`);
    }

    const parsed = definition.schema.parse(toolCall.args);
    return definition.execute(parsed, options);
  }

  private isCommandWhitelisted(command: string): boolean {
    return listAgentWhitelist().some((item) => globToRegExp(item.pattern).test(command));
  }

  private createToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'run_command',
        description:
          'Execute an SSH shell command on the currently connected remote host for diagnostics or operations.',
        schema: z.object({
          command: z.string().min(1),
          rationale: z.string().optional()
        }),
        execute: async (
          input: { command: string; rationale?: string },
          options: ToolExecutionOptions
        ) => {
          const command = input.command.trim();
          const risk = assessCommandRisk(command, this.isCommandWhitelisted(command));

          if (!risk.allowed) {
            throw new Error(risk.reason);
          }

          if (!options.approvalBypass && requiresRiskApproval(risk.riskLevel)) {
            return {
              type: 'pending-approval',
              approval: createApprovalRequest({
                toolName: 'run_command',
                riskLevel: risk.riskLevel,
                summary: risk.summary,
                details: input.rationale?.trim() || command,
                command
              })
            };
          }

          return {
            type: 'completed',
            content: await this.executeShellCommandForAgent(command)
          };
        }
      },
      {
        name: 'list_remote_directory',
        description:
          'List files and folders from a remote path with shell-style output. Prefer this or run_command for directory inspection.',
        schema: z.object({
          path: z.string().optional(),
          showHidden: z.boolean().optional()
        }),
        execute: async (input: { path?: string; showHidden?: boolean }) => {
          const command = formatDirectoryListCommand(input);
          return {
            type: 'completed',
            content: await this.executeShellCommandForAgent(command)
          };
        }
      },
      {
        name: 'read_remote_file',
        description:
          'Read the first part of a UTF-8 text file with shell-style output. Prefer this or run_command for inspection.',
        schema: z.object({
          path: z.string().min(1)
        }),
        execute: async (input: { path: string }) => {
          const command = formatReadFileCommand(input.path);
          return {
            type: 'completed',
            content: await this.executeShellCommandForAgent(command)
          };
        }
      },
      {
        name: 'write_remote_text_file',
        description: 'Overwrite or create a UTF-8 text file on the remote host.',
        schema: z.object({
          path: z.string().min(1),
          content: z.string()
        }),
        execute: async (
          input: { path: string; content: string },
          options: ToolExecutionOptions
        ) => {
          if (!options.approvalBypass) {
            return {
              type: 'pending-approval',
              approval: createApprovalRequest({
                toolName: 'write_remote_text_file',
                riskLevel: 'p3',
                summary: 'This will write remote file content.',
                details: input.path
              })
            };
          }

          return {
            type: 'completed',
            content: formatJson(await writeRemoteTextFile(input))
          };
        }
      },
      {
        name: 'create_remote_directory',
        description: 'Create a directory on the remote host.',
        schema: z.object({
          path: z.string().min(1)
        }),
        execute: async (input: { path: string }, options: ToolExecutionOptions) => {
          if (!options.approvalBypass) {
            return {
              type: 'pending-approval',
              approval: createApprovalRequest({
                toolName: 'create_remote_directory',
                riskLevel: 'p3',
                summary: 'This will create a remote directory.',
                details: input.path
              })
            };
          }

          return {
            type: 'completed',
            content: formatJson(await createRemoteDirectory(input))
          };
        }
      },
      {
        name: 'rename_remote_entry',
        description: 'Rename or move a remote file or directory.',
        schema: z.object({
          oldPath: z.string().min(1),
          newPath: z.string().min(1)
        }),
        execute: async (
          input: { oldPath: string; newPath: string },
          options: ToolExecutionOptions
        ) => {
          if (!options.approvalBypass) {
            return {
              type: 'pending-approval',
              approval: createApprovalRequest({
                toolName: 'rename_remote_entry',
                riskLevel: 'p2',
                summary: 'This will rename or move a remote entry.',
                details: `${input.oldPath} -> ${input.newPath}`
              })
            };
          }

          return {
            type: 'completed',
            content: formatJson(await renameRemoteEntry(input))
          };
        }
      },
      {
        name: 'delete_remote_entry',
        description: 'Delete a remote file or directory recursively when needed.',
        schema: z.object({
          path: z.string().min(1),
          recursive: z.boolean().optional()
        }),
        execute: async (
          input: { path: string; recursive?: boolean },
          options: ToolExecutionOptions
        ) => {
          const targetPath = input.path.trim();
          if (targetPath === '/' || targetPath === '.' || targetPath === '..') {
            throw new Error('Deleting the remote root path is permanently blocked.');
          }

          if (!options.approvalBypass) {
            return {
              type: 'pending-approval',
              approval: createApprovalRequest({
                toolName: 'delete_remote_entry',
                riskLevel: 'p2',
                summary: 'This will delete a remote file or directory.',
                details: targetPath
              })
            };
          }

          return {
            type: 'completed',
            content: formatJson(await deleteRemoteEntry(input))
          };
        }
      },
      {
        name: 'complete_remote_path',
        description: 'Complete a remote filesystem path relative to the current location.',
        schema: z.object({
          input: z.string(),
          basePath: z.string().optional(),
          filesOnly: z.boolean().optional()
        }),
        execute: async (input: { input: string; basePath?: string; filesOnly?: boolean }) => ({
          type: 'completed',
          content: formatJson(await completeRemotePath(input))
        })
      },
      {
        name: 'get_system_metrics',
        description: 'Read the current remote host system metrics snapshot.',
        schema: z.object({}),
        execute: async () => ({
          type: 'completed',
          content: formatJson(await readSystemMetrics())
        })
      },
      {
        name: 'get_live_system_metrics',
        description: 'Read the lightweight live CPU and memory metrics.',
        schema: z.object({}),
        execute: async () => ({
          type: 'completed',
          content: formatJson(await readLiveSystemMetrics())
        })
      },
      {
        name: 'get_remote_apps',
        description: 'List detected running services and Docker containers.',
        schema: z.object({}),
        execute: async () => ({
          type: 'completed',
          content: formatJson(await readRemoteApps())
        })
      },
      {
        name: 'read_recent_log_lines',
        description: 'Read the latest lines from a log file without starting a live tail session.',
        schema: z.object({
          path: z.string().min(1),
          lineCount: z.number().int().min(1).max(500).optional()
        }),
        execute: async (input: { path: string; lineCount?: number }) => {
          const lineCount = input.lineCount ?? 80;
          return {
            type: 'completed',
            content: await this.executeShellCommandForAgent(
              `tail -n ${lineCount} -- ${quoteShellArg(input.path.trim())} 2>/dev/null`
            )
          };
        }
      }
    ];
  }
}

class HarmlessAgentRuntimeManager {
  private readonly runtimes = new Map<string, HarmlessAgentRuntime>();

  private getRuntime(sessionId: string): HarmlessAgentRuntime {
    const trimmedSessionId = sessionId.trim();
    if (!trimmedSessionId) {
      throw new Error('A session must be selected before using the agent.');
    }

    let runtime = this.runtimes.get(trimmedSessionId);
    if (!runtime) {
      runtime = new HarmlessAgentRuntime(trimmedSessionId);
      this.runtimes.set(trimmedSessionId, runtime);
    }

    return runtime;
  }

  getState(sessionId: string): AgentStateSnapshot {
    return this.getRuntime(sessionId).getState();
  }

  run(payload: RunAgentPayload): Promise<AgentStateSnapshot> {
    return this.getRuntime(payload.sessionId).run(payload);
  }

  resolveApproval(payload: ResolveAgentApprovalPayload): Promise<AgentStateSnapshot> {
    return this.getRuntime(payload.sessionId).resolveApproval(payload);
  }

  listWhitelist(): AgentWhitelistItem[] {
    return listAgentWhitelist();
  }

  createWhitelistItem(payload: SaveAgentWhitelistPayload): AgentWhitelistItem {
    return createAgentWhitelistItem(payload);
  }

  deleteWhitelistItem(id: string): AgentWhitelistItem[] {
    deleteAgentWhitelistItem(id);
    return listAgentWhitelist();
  }
}

export const harmlessAgentRuntime = new HarmlessAgentRuntimeManager();
