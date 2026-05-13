import { AIMessage, AIMessageChunk, BaseMessage, ToolMessage } from '@langchain/core/messages';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import { convertLangChainToolCallToOpenAI } from '@langchain/core/output_parsers/openai_tools';
import { ChatOpenAICompletions, messageToOpenAIRole } from '@langchain/openai';
import OpenAI from 'openai';
import type { AgentProviderCode } from '../shared/types';

type CompatibleCompletionsMessageParam = {
  role: OpenAI.Chat.Completions.ChatCompletionRole;
  content: string;
  name?: string;
  function_call?: unknown;
  tool_calls?: unknown;
  tool_call_id?: string;
  reasoning_content?: string;
};

function isReasoningModel(model?: string): boolean {
  if (!model) {
    return false;
  }

  return /^o\d/.test(model) || (model.startsWith('gpt-5') && !model.startsWith('gpt-5-chat'));
}

function getMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (
          item &&
          typeof item === 'object' &&
          'text' in item &&
          typeof (item as { text?: unknown }).text === 'string'
        ) {
          return (item as { text: string }).text;
        }

        return '';
      })
      .join('\n');
  }

  return '';
}

function shouldReplayReasoningContent(providerCode: AgentProviderCode): boolean {
  return providerCode === 'deepseek';
}

function convertMessagesToCompatibleCompletionsParams(input: {
  messages: BaseMessage[];
  model: string;
  providerCode: AgentProviderCode;
}): CompatibleCompletionsMessageParam[] {
  const { messages, model, providerCode } = input;

  return messages.map((message) => {
    let role = messageToOpenAIRole(message);
    if (role === 'system' && isReasoningModel(model)) {
      role = 'developer';
    }

    const completionParam: CompatibleCompletionsMessageParam = {
      role,
      content: getMessageText(message.content)
    };

    if (message.name != null) {
      completionParam.name = message.name;
    }

    if (message.additional_kwargs.function_call != null) {
      completionParam.function_call = message.additional_kwargs.function_call;
    }

    if (AIMessage.isInstance(message) && message.tool_calls?.length) {
      completionParam.tool_calls = message.tool_calls.map(convertLangChainToolCallToOpenAI);
    } else {
      if (message.additional_kwargs.tool_calls != null) {
        completionParam.tool_calls = message.additional_kwargs.tool_calls;
      }

      if (ToolMessage.isInstance(message) && message.tool_call_id != null) {
        completionParam.tool_call_id = message.tool_call_id;
      }
    }

    if (
      shouldReplayReasoningContent(providerCode) &&
      typeof message.additional_kwargs.reasoning_content === 'string' &&
      message.additional_kwargs.reasoning_content.trim()
    ) {
      completionParam.reasoning_content = message.additional_kwargs.reasoning_content;
    }

    return completionParam;
  });
}

export class CompatibleChatOpenAICompletions extends ChatOpenAICompletions {
  constructor(
    private readonly providerCode: AgentProviderCode,
    fields: ConstructorParameters<typeof ChatOpenAICompletions>[0]
  ) {
    super(fields);
  }

  async _generate(messages: BaseMessage[], options: any, runManager?: any) {
    options?.signal?.throwIfAborted?.();

    const usageMetadata: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      input_token_details?: Record<string, unknown>;
      output_token_details?: Record<string, unknown>;
    } = {};
    const params = this.invocationParams(options);
    const messagesMapped = convertMessagesToCompatibleCompletionsParams({
      messages,
      model: this.model,
      providerCode: this.providerCode
    });

    if (params.stream) {
      const stream = this._streamResponseChunks(messages, options, runManager);
      const finalChunks: Record<number, ChatGenerationChunk> = {};

      for await (const chunk of stream) {
        chunk.message.response_metadata = {
          ...chunk.generationInfo,
          ...chunk.message.response_metadata
        };

        const index = chunk.generationInfo?.completion ?? 0;
        if (finalChunks[index] === undefined) {
          finalChunks[index] = chunk;
        } else {
          finalChunks[index] = finalChunks[index].concat(chunk);
        }
      }

      const generations = Object.entries(finalChunks)
        .sort(([leftKey], [rightKey]) => Number(leftKey) - Number(rightKey))
        .map(([_, value]) => value);

      const { functions, function_call } = this.invocationParams(options);
      const promptTokenUsage = await this._getEstimatedTokenCountFromPrompt(
        messages,
        functions,
        function_call
      );
      const completionTokenUsage = await this._getNumTokensFromGenerations(generations);
      usageMetadata.input_tokens = promptTokenUsage;
      usageMetadata.output_tokens = completionTokenUsage;
      usageMetadata.total_tokens = promptTokenUsage + completionTokenUsage;

      return {
        generations,
        llmOutput: {
          estimatedTokenUsage: {
            promptTokens: usageMetadata.input_tokens,
            completionTokens: usageMetadata.output_tokens,
            totalTokens: usageMetadata.total_tokens
          }
        }
      };
    }

    const data = await this.completionWithRetry(
      {
        ...params,
        stream: false as const,
        messages: messagesMapped as OpenAI.Chat.ChatCompletionMessageParam[]
      },
      {
        signal: options?.signal,
        ...options?.options
      }
    );

    const {
      completion_tokens: completionTokens,
      prompt_tokens: promptTokens,
      total_tokens: totalTokens,
      prompt_tokens_details: promptTokensDetails,
      completion_tokens_details: completionTokensDetails
    } = data?.usage ?? {};

    if (completionTokens)
      usageMetadata.output_tokens = (usageMetadata.output_tokens ?? 0) + completionTokens;
    if (promptTokens) usageMetadata.input_tokens = (usageMetadata.input_tokens ?? 0) + promptTokens;
    if (totalTokens) usageMetadata.total_tokens = (usageMetadata.total_tokens ?? 0) + totalTokens;

    if (promptTokensDetails?.audio_tokens !== null || promptTokensDetails?.cached_tokens !== null) {
      usageMetadata.input_token_details = {
        ...(promptTokensDetails?.audio_tokens !== null && {
          audio: promptTokensDetails?.audio_tokens
        }),
        ...(promptTokensDetails?.cached_tokens !== null && {
          cache_read: promptTokensDetails?.cached_tokens
        })
      };
    }

    if (
      completionTokensDetails?.audio_tokens !== null ||
      completionTokensDetails?.reasoning_tokens !== null
    ) {
      usageMetadata.output_token_details = {
        ...(completionTokensDetails?.audio_tokens !== null && {
          audio: completionTokensDetails?.audio_tokens
        }),
        ...(completionTokensDetails?.reasoning_tokens !== null && {
          reasoning: completionTokensDetails?.reasoning_tokens
        })
      };
    }

    const generations: any[] = [];
    for (const part of data?.choices ?? []) {
      const generation: any = {
        text: part.message?.content ?? '',
        message: this._convertCompletionsMessageToBaseMessage(
          part.message ?? { role: 'assistant' },
          data
        )
      };

      generation.generationInfo = {
        ...(part.finish_reason ? { finish_reason: part.finish_reason } : {}),
        ...(part.logprobs ? { logprobs: part.logprobs } : {})
      };

      if (AIMessage.isInstance(generation.message)) {
        generation.message.usage_metadata = usageMetadata;
      }

      generation.message = new AIMessage(
        Object.fromEntries(
          Object.entries(generation.message).filter(([key]) => !key.startsWith('lc_'))
        )
      );
      generations.push(generation);
    }

    return {
      generations,
      llmOutput: {
        tokenUsage: {
          promptTokens: usageMetadata.input_tokens,
          completionTokens: usageMetadata.output_tokens,
          totalTokens: usageMetadata.total_tokens
        }
      }
    };
  }

  async *_streamResponseChunks(messages: BaseMessage[], options: any, runManager?: any) {
    const messagesMapped = convertMessagesToCompatibleCompletionsParams({
      messages,
      model: this.model,
      providerCode: this.providerCode
    });

    const params = {
      ...this.invocationParams(options, { streaming: true }),
      messages: messagesMapped as OpenAI.Chat.ChatCompletionMessageParam[],
      stream: true as const
    };

    let defaultRole;
    const streamIterable = await this.completionWithRetry(params, options);
    let usage;

    for await (const data of streamIterable) {
      if (options.signal?.aborted) {
        return;
      }

      const choice = data?.choices?.[0];
      if (data.usage) {
        usage = data.usage;
      }
      if (!choice?.delta) {
        continue;
      }

      const chunk = this._convertCompletionsDeltaToBaseMessageChunk(
        choice.delta,
        data,
        defaultRole
      );
      defaultRole = choice.delta.role ?? defaultRole;

      const newTokenIndices = {
        prompt: options.promptIndex ?? 0,
        completion: choice.index ?? 0
      };

      if (typeof chunk.content !== 'string') {
        continue;
      }

      const generationInfo: Record<string, unknown> = { ...newTokenIndices };
      if (choice.finish_reason != null) {
        generationInfo.finish_reason = choice.finish_reason;
        generationInfo.system_fingerprint = data.system_fingerprint;
        generationInfo.model_name = data.model;
        generationInfo.service_tier = data.service_tier;
      }

      if (this.logprobs) {
        generationInfo.logprobs = choice.logprobs;
      }

      const generationChunk = new ChatGenerationChunk({
        message: chunk,
        text: chunk.content,
        generationInfo
      });

      yield generationChunk;
      await runManager?.handleLLMNewToken(
        generationChunk.text ?? '',
        newTokenIndices,
        undefined,
        undefined,
        undefined,
        { chunk: generationChunk }
      );
    }

    if (usage) {
      const inputTokenDetails = {
        ...(usage.prompt_tokens_details?.audio_tokens !== null && {
          audio: usage.prompt_tokens_details?.audio_tokens
        }),
        ...(usage.prompt_tokens_details?.cached_tokens !== null && {
          cache_read: usage.prompt_tokens_details?.cached_tokens
        })
      };

      const outputTokenDetails = {
        ...(usage.completion_tokens_details?.audio_tokens !== null && {
          audio: usage.completion_tokens_details?.audio_tokens
        }),
        ...(usage.completion_tokens_details?.reasoning_tokens !== null && {
          reasoning: usage.completion_tokens_details?.reasoning_tokens
        })
      };

      const generationChunk = new ChatGenerationChunk({
        message: new AIMessageChunk({
          content: '',
          response_metadata: { usage: { ...usage } },
          usage_metadata: {
            input_tokens: usage.prompt_tokens,
            output_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
            ...(Object.keys(inputTokenDetails).length > 0 && {
              input_token_details: inputTokenDetails
            }),
            ...(Object.keys(outputTokenDetails).length > 0 && {
              output_token_details: outputTokenDetails
            })
          }
        }),
        text: ''
      });

      yield generationChunk;
      await runManager?.handleLLMNewToken(
        generationChunk.text ?? '',
        { prompt: 0, completion: 0 },
        undefined,
        undefined,
        undefined,
        { chunk: generationChunk }
      );
    }

    if (options.signal?.aborted) {
      throw new Error('AbortError');
    }
  }
}
