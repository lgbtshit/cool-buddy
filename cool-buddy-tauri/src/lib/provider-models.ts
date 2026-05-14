import axios, { AxiosError } from 'axios';

type AgentProviderCode =
  | 'openai'
  | 'azure-openai'
  | 'anthropic'
  | 'google-gemini'
  | 'deepseek'
  | 'qwen'
  | 'zhipu'
  | 'moonshot'
  | 'baidu-qianfan'
  | 'siliconflow'
  | 'groq'
  | 'mistral'
  | 'openrouter'
  | 'ollama'
  | 'lm-studio'
  | 'xai'
  | 'perplexity'
  | 'fireworks'
  | 'together'
  | 'volcengine-ark'
  | 'tencent-hunyuan'
  | 'minimax'
  | '302ai'
  | 'custom';

type AgentProviderSettingsItem = {
  providerCode: AgentProviderCode;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  updatedAt: string | null;
};

type FetchAgentModelsPayload = {
  providerCode: AgentProviderCode;
  providerName: string;
  baseUrl: string;
  apiKey: string;
};

type AgentModelOption = {
  id: string;
  name: string;
  providerCode: AgentProviderCode;
};

type AgentProviderProtocol = 'openai' | 'anthropic';
type OpenAiModelsResponse = {
  data?: Array<{
    id?: string;
  }>;
};

type AnthropicModelsResponse = {
  data?: Array<{
    id?: string;
    display_name?: string;
  }>;
};

function inferProviderProtocol(providerCode: AgentProviderCode): AgentProviderProtocol {
  return providerCode === 'anthropic' ? 'anthropic' : 'openai';
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function stripKnownInferenceSuffix(normalizedBaseUrl: string): string {
  const suffixes = [
    '/chat/completions',
    '/v1/chat/completions',
    '/messages',
    '/v1/messages',
    '/completions',
    '/responses'
  ];

  for (const suffix of suffixes) {
    if (normalizedBaseUrl.endsWith(suffix)) {
      return normalizedBaseUrl.slice(0, -suffix.length);
    }
  }

  return normalizedBaseUrl;
}

function buildModelsUrlCandidates(settings: AgentProviderSettingsItem): string[] {
  const normalized = stripKnownInferenceSuffix(normalizeBaseUrl(settings.baseUrl));
  if (inferProviderProtocol(settings.providerCode) === 'anthropic') {
    return [normalized.endsWith('/v1') ? `${normalized}/models` : `${normalized}/v1/models`];
  }

  const candidates = new Set<string>();
  candidates.add(normalized.endsWith('/models') ? normalized : `${normalized}/models`);

  if (normalized.endsWith('/v1')) {
    candidates.add(`${normalized.slice(0, -3)}/models`);
  } else if (normalized.endsWith('/v4')) {
    candidates.add(`${normalized.slice(0, -3)}/models`);
  } else if (normalized.includes('/api/paas/v4')) {
    candidates.add(`${normalized.replace(/\/api\/paas\/v4$/, '')}/api/paas/models`);
  }

  return [...candidates];
}

function getReadableFetchError(error: unknown, attemptedUrls: string[]): Error {
  if (!(error instanceof AxiosError)) {
    return error instanceof Error ? error : new Error('Failed to load provider models.');
  }

  const status = error.response?.status;
  if (status === 404) {
    return new Error(
      `Model list endpoint was not found. Tried: ${attemptedUrls.join(', ')}. ` +
        'This provider may not expose a model-list API at that Base URL. You can still enter the model name manually.'
    );
  }

  if (status === 401 || status === 403) {
    return new Error('Model list request was rejected. Check the API key and provider permissions.');
  }

  if (error.code === 'ECONNABORTED') {
    return new Error('Model list request timed out. Check the Base URL and network connectivity.');
  }

  return new Error(error.message || 'Failed to load provider models.');
}

function normalizeSettingsPayload(payload: FetchAgentModelsPayload): AgentProviderSettingsItem {
  return {
    providerCode: payload.providerCode,
    providerName: payload.providerName.trim(),
    baseUrl: payload.baseUrl.trim(),
    apiKey: payload.apiKey.trim(),
    modelName: '',
    updatedAt: null
  };
}

export async function fetchProviderModels(
  payload: FetchAgentModelsPayload
): Promise<AgentModelOption[]> {
  const settings = normalizeSettingsPayload(payload);

  if (!settings.baseUrl.trim() || !settings.apiKey.trim()) {
    throw new Error('Base URL and API key are required before loading models.');
  }

  const protocol = inferProviderProtocol(settings.providerCode);
  const urls = buildModelsUrlCandidates(settings);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${settings.apiKey.trim()}`
  };

  if (protocol === 'anthropic') {
    delete headers.Authorization;
    headers['x-api-key'] = settings.apiKey.trim();
    headers['anthropic-version'] = '2023-06-01';
  }

  let response: { data?: OpenAiModelsResponse | AnthropicModelsResponse } | null = null;
  let lastError: unknown = null;

  for (const url of urls) {
    try {
      response = await axios.get<OpenAiModelsResponse | AnthropicModelsResponse>(url, {
        headers,
        timeout: 15000
      });
      break;
    } catch (error) {
      lastError = error;
      if (!(error instanceof AxiosError) || error.response?.status !== 404) {
        throw getReadableFetchError(error, urls);
      }
    }
  }

  if (!response) {
    throw getReadableFetchError(lastError, urls);
  }

  const rawModels = Array.isArray(response.data?.data) ? response.data.data : [];
  return rawModels
    .map((item) => {
      const id = typeof item?.id === 'string' ? item.id.trim() : '';
      const displayName =
        typeof (item as { display_name?: string } | undefined)?.display_name === 'string'
          ? (item as { display_name: string }).display_name.trim()
          : '';
      const name = displayName || id;

      if (!id) {
        return null;
      }

      return {
        id,
        name: name || id,
        providerCode: settings.providerCode
      } satisfies AgentModelOption;
    })
    .filter((item): item is AgentModelOption => Boolean(item))
    .sort((left, right) => left.name.localeCompare(right.name));
}
