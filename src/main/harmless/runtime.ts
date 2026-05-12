import { randomUUID } from 'crypto';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
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
  listRemoteDirectory,
  readRemoteFile,
  renameRemoteEntry,
  writeRemoteTextFile
} from '../ssh/remote-files';
import { readRemoteApps } from '../ssh/remote-apps';
import { readLiveSystemMetrics, readSystemMetrics } from '../ssh/system-metrics';
import { sshExec, sshExecStreaming } from '../ssh/ssh-runtime';
import type {
  AgentApprovalRequest,
  AgentRiskLevel,
  AgentStateSnapshot,
  AgentThreadMessage,
  AgentWhitelistItem,
  ResolveAgentApprovalPayload,
  RunAgentPayload,
  SaveAgentWhitelistPayload
} from '../shared/types';
import { createAgentModel } from './model';
import { assessCommandRisk, getRiskConfirmCount } from './risk';

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
  execute: (input: any, options: ToolExecutionOptions) => Promise<ToolExecutionResult>;
};

type PendingExecution = {
  approval: AgentApprovalRequest;
  toolCalls: ToolCallShape[];
  toolIndex: number;
};

function createCommandBatch(content: string): string {
  const delimiter = `COOL_BUDDY_AGENT_${Date.now().toString(36)}`;
  return `sh -se <<'${delimiter}'\n${content}\n${delimiter}`;
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
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
  private messageHistory: BaseMessage[] = [];

  private threadMessages: AgentThreadMessage[] = [];

  private pendingExecution: PendingExecution | null = null;

  private running = false;

  private lastError = '';

  private readonly toolDefinitions: ToolDefinition[];

  private readonly modelTools;

  constructor() {
    this.toolDefinitions = this.createToolDefinitions();
    this.modelTools = this.toolDefinitions.map((definition) =>
      tool(async () => 'Handled by Harmless runtime.', {
        name: definition.name,
        description: definition.description,
        schema: definition.schema
      })
    );
  }

  getState(): AgentStateSnapshot {
    return this.createSnapshot();
  }

  async run(payload: RunAgentPayload): Promise<AgentStateSnapshot> {
    const prompt = payload.prompt.trim();
    if (!prompt) {
      return this.createSnapshot();
    }

    if (this.running) {
      throw new Error('Harmless agent is already running.');
    }

    const settings = this.ensureConfigured();
    this.running = true;
    this.lastError = '';

    this.ensureSystemPrompt();
    this.messageHistory.push(new HumanMessage(prompt));
    this.appendThreadMessage('user', prompt);

    try {
      await this.runAgentLoop(settings);
    } catch (error) {
      this.lastError = formatAgentError(error);
      this.appendThreadMessage('system', this.lastError);
    } finally {
      if (!this.pendingExecution) {
        this.running = false;
      }
    }

    return this.createSnapshot();
  }

  async resolveApproval(payload: ResolveAgentApprovalPayload): Promise<AgentStateSnapshot> {
    if (!this.pendingExecution || this.pendingExecution.approval.id !== payload.approvalId) {
      throw new Error('The approval request is no longer active.');
    }

    const settings = this.ensureConfigured();
    this.running = true;
    this.lastError = '';

    try {
      const pending = this.pendingExecution;
      const toolCall = pending.toolCalls[pending.toolIndex];
      this.pendingExecution = null;

      let toolResult: string;
      if (payload.approve) {
        const executed = await this.invokeTool(toolCall, { approvalBypass: true });
        if (executed.type !== 'completed') {
          throw new Error('Tool approval loop entered an invalid state.');
        }
        toolResult = executed.content;
      } else {
        toolResult = `Execution denied by the user for ${toolCall.name}.`;
      }

      this.messageHistory.push(
        new ToolMessage({
          content: toolResult,
          tool_call_id: toolCall.id ?? toolCall.name
        })
      );
      this.appendThreadMessage('tool', toolResult, toolCall.name);

      const pausedAgain = await this.processToolCalls(pending.toolCalls, pending.toolIndex + 1);
      if (!pausedAgain) {
        await this.runAgentLoop(settings);
      }
    } catch (error) {
      this.lastError = formatAgentError(error);
      this.appendThreadMessage('system', this.lastError);
    } finally {
      if (!this.pendingExecution) {
        this.running = false;
      }
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

  private ensureSystemPrompt(): void {
    if (this.messageHistory.length === 0) {
      this.messageHistory.push(new SystemMessage(SYSTEM_PROMPT));
    }
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
      pendingApproval: this.pendingExecution?.approval ?? null,
      running: this.running,
      configured: Boolean(settings.baseUrl.trim() && settings.apiKey.trim()),
      lastError: this.lastError
    };
  }

  private appendThreadMessage(
    role: AgentThreadMessage['role'],
    content: string,
    toolName: string | null = null
  ): void {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    this.threadMessages.push({
      id: randomUUID(),
      role,
      content: trimmed,
      createdAt: new Date().toISOString(),
      toolName
    });
  }

  private async runAgentLoop(settings: ReturnType<HarmlessAgentRuntime['ensureConfigured']>) {
    const baseModel = createAgentModel(settings) as {
      bindTools?: (tools: unknown[]) => {
        invoke: (messages: BaseMessage[]) => Promise<AIMessage>;
      };
    };
    const model = baseModel.bindTools?.(this.modelTools);
    if (!model) {
      throw new Error('The selected model does not support tool binding.');
    }

    for (let turn = 0; turn < 8; turn += 1) {
      const response = (await model.invoke(this.messageHistory)) as AIMessage;
      this.messageHistory.push(response);

      const responseText = getMessageText(response.content);
      if (responseText) {
        this.appendThreadMessage('assistant', responseText);
      }

      const toolCalls = (response.tool_calls ?? []) as ToolCallShape[];
      if (!toolCalls.length) {
        return;
      }

      const paused = await this.processToolCalls(toolCalls, 0);
      if (paused) {
        return;
      }
    }

    this.appendThreadMessage(
      'assistant',
      'Stopped after the maximum number of tool turns. Please refine the request.'
    );
  }

  private async processToolCalls(toolCalls: ToolCallShape[], startIndex: number): Promise<boolean> {
    for (let index = startIndex; index < toolCalls.length; index += 1) {
      const toolCall = toolCalls[index];

      try {
        const result = await this.invokeTool(toolCall, { approvalBypass: false });

        if (result.type === 'pending-approval') {
          this.pendingExecution = {
            approval: result.approval,
            toolCalls,
            toolIndex: index
          };
          return true;
        }

        this.messageHistory.push(
          new ToolMessage({
            content: result.content,
            tool_call_id: toolCall.id ?? toolCall.name
          })
        );
        this.appendThreadMessage('tool', result.content, toolCall.name);
      } catch (error) {
        const message = error instanceof Error ? error.message : `Tool ${toolCall.name} failed.`;
        this.messageHistory.push(
          new ToolMessage({
            content: message,
            tool_call_id: toolCall.id ?? toolCall.name
          })
        );
        this.appendThreadMessage('tool', message, toolCall.name);
      }
    }

    return false;
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

          if (!options.approvalBypass && risk.riskLevel !== 'p4') {
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

          let output = '';
          await sshExecStreaming(createCommandBatch(command), (chunk) => {
            output += chunk;
          });

          return {
            type: 'completed',
            content: output.trim() || 'Command completed with no output.'
          };
        }
      },
      {
        name: 'list_remote_directory',
        description: 'List files and folders from a remote path through SFTP.',
        schema: z.object({
          path: z.string().optional(),
          showHidden: z.boolean().optional()
        }),
        execute: async (input: { path?: string; showHidden?: boolean }) => ({
          type: 'completed',
          content: formatJson(await listRemoteDirectory(input))
        })
      },
      {
        name: 'read_remote_file',
        description: 'Read the UTF-8 content of a remote file.',
        schema: z.object({
          path: z.string().min(1)
        }),
        execute: async (input: { path: string }) => ({
          type: 'completed',
          content: formatJson(await readRemoteFile(input))
        })
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
          const output = await sshExec(
            `tail -n ${lineCount} -- ${quoteShellArg(input.path.trim())} 2>/dev/null`
          );
          return {
            type: 'completed',
            content: output.trim() || 'Log file returned no content.'
          };
        }
      }
    ];
  }
}

export const harmlessAgentRuntime = new HarmlessAgentRuntime();
