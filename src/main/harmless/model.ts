import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  AgentProviderCode,
  AgentProviderProtocol,
  AgentProviderSettingsItem
} from '../shared/types';

const DEFAULT_MODEL_BY_PROVIDER: Record<AgentProviderCode, string> = {
  openai: 'gpt-4.1-mini',
  'azure-openai': 'gpt-4.1-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  'google-gemini': 'gemini-2.5-flash',
  deepseek: 'deepseek-chat',
  qwen: 'qwen-plus',
  zhipu: 'glm-4.7',
  moonshot: 'moonshot-v1-8k',
  'baidu-qianfan': 'ernie-4.0-8k',
  siliconflow: 'deepseek-ai/DeepSeek-V3',
  groq: 'llama-3.3-70b-versatile',
  mistral: 'mistral-large-latest',
  openrouter: 'openai/gpt-4.1-mini',
  ollama: 'qwen2.5:7b',
  'lm-studio': 'local-model',
  xai: 'grok-3-mini',
  perplexity: 'sonar',
  fireworks: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
  together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  'volcengine-ark': 'doubao-seed-1-6-flash-250715',
  'tencent-hunyuan': 'hunyuan-lite',
  minimax: 'MiniMax-Text-01',
  '302ai': 'gpt-4.1-mini',
  custom: 'gpt-4.1-mini'
};

export function inferProviderProtocol(providerCode: AgentProviderCode): AgentProviderProtocol {
  return providerCode === 'anthropic' ? 'anthropic' : 'openai';
}

export function getDefaultModelName(providerCode: AgentProviderCode): string {
  return DEFAULT_MODEL_BY_PROVIDER[providerCode] ?? DEFAULT_MODEL_BY_PROVIDER.custom;
}

function normalizeModelBaseUrl(settings: AgentProviderSettingsItem): string {
  const trimmed = settings.baseUrl.trim().replace(/\/+$/, '');

  if (inferProviderProtocol(settings.providerCode) === 'anthropic') {
    return trimmed;
  }

  const suffixes = [
    '/chat/completions',
    '/v1/chat/completions',
    '/messages',
    '/v1/messages',
    '/completions',
    '/responses'
  ];

  for (const suffix of suffixes) {
    if (trimmed.endsWith(suffix)) {
      return trimmed.slice(0, -suffix.length);
    }
  }

  return trimmed;
}

export function createAgentModel(settings: AgentProviderSettingsItem): BaseChatModel {
  const protocol = inferProviderProtocol(settings.providerCode);
  const model = settings.modelName.trim() || getDefaultModelName(settings.providerCode);
  const baseUrl = normalizeModelBaseUrl(settings);

  if (protocol === 'anthropic') {
    return new ChatAnthropic({
      model,
      temperature: 0,
      apiKey: settings.apiKey,
      clientOptions: {
        baseURL: baseUrl
      }
    });
  }

  return new ChatOpenAI({
    model,
    temperature: 0,
    apiKey: settings.apiKey,
    configuration: {
      baseURL: baseUrl
    }
  });
}
