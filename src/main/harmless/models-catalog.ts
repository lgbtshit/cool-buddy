import axios from 'axios';
import type {
  AgentModelOption,
  AgentProviderSettingsItem,
  FetchAgentModelsPayload
} from '../shared/types';
import { inferProviderProtocol } from './model';

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

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function buildModelsUrl(settings: AgentProviderSettingsItem): string {
  const normalized = normalizeBaseUrl(settings.baseUrl);
  if (inferProviderProtocol(settings.providerCode) === 'anthropic') {
    return normalized.endsWith('/v1') ? `${normalized}/models` : `${normalized}/v1/models`;
  }

  return normalized.endsWith('/models') ? normalized : `${normalized}/models`;
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
  const url = buildModelsUrl(settings);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${settings.apiKey.trim()}`
  };

  if (protocol === 'anthropic') {
    delete headers.Authorization;
    headers['x-api-key'] = settings.apiKey.trim();
    headers['anthropic-version'] = '2023-06-01';
  }

  const response = await axios.get<OpenAiModelsResponse | AnthropicModelsResponse>(url, {
    headers,
    timeout: 15000
  });

  const rawModels = Array.isArray(response.data?.data) ? response.data.data : [];
  const models = rawModels
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

  return models;
}
