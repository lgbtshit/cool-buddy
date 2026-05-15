import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  AgentWhitelistItem,
  AgentProviderSettingsItem,
  SaveAgentWhitelistPayload
} from '../../src/main/shared/types';

type AgentWhitelistRecord = {
  id: string;
  pattern: string;
  description: string;
  created_at: string;
};

type AgentProviderSettingsRecord = {
  provider_code: AgentProviderSettingsItem['providerCode'];
  provider_name: string;
  base_url: string;
  api_key: string;
  model_name: string;
  updated_at: string | null;
};

const DEFAULT_AGENT_SETTINGS: AgentProviderSettingsRecord = {
  provider_code: 'openai',
  provider_name: 'OpenAI',
  base_url: 'https://api.openai.com/v1',
  api_key: '',
  model_name: 'gpt-4.1-mini',
  updated_at: null
};

function ensureDataDir(): string {
  const dir = process.env.COOL_BUDDY_TAURI_DATA_DIR?.trim();
  if (!dir) {
    throw new Error('COOL_BUDDY_TAURI_DATA_DIR is not configured.');
  }

  mkdirSync(dir, { recursive: true });
  return dir;
}

function readJsonFile<T>(name: string, fallback: T): T {
  const filePath = join(ensureDataDir(), name);
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile<T>(name: string, value: T): void {
  const filePath = join(ensureDataDir(), name);
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function mapWhitelistRecord(record: AgentWhitelistRecord): AgentWhitelistItem {
  return {
    id: record.id,
    pattern: record.pattern,
    description: record.description,
    createdAt: record.created_at
  };
}

export function getAgentProviderSettings(): AgentProviderSettingsItem {
  const record = readJsonFile<AgentProviderSettingsRecord>(
    'agent-provider.json',
    DEFAULT_AGENT_SETTINGS
  );

  return {
    providerCode: record.provider_code,
    providerName: record.provider_name,
    baseUrl: record.base_url,
    apiKey: record.api_key,
    modelName: record.model_name || DEFAULT_AGENT_SETTINGS.model_name,
    updatedAt: record.updated_at
  };
}

export function listAgentWhitelist(): AgentWhitelistItem[] {
  const records = readJsonFile<AgentWhitelistRecord[]>('agent-whitelist.json', []);
  return records.map(mapWhitelistRecord);
}

export function createAgentWhitelistItem(payload: SaveAgentWhitelistPayload): AgentWhitelistItem {
  const items = readJsonFile<AgentWhitelistRecord[]>('agent-whitelist.json', []);
  const record: AgentWhitelistRecord = {
    id: randomUUID(),
    pattern: payload.pattern.trim(),
    description: payload.description?.trim() ?? '',
    created_at: new Date().toISOString()
  };

  items.unshift(record);
  writeJsonFile('agent-whitelist.json', items);
  return mapWhitelistRecord(record);
}

export function deleteAgentWhitelistItem(id: string): void {
  const items = readJsonFile<AgentWhitelistRecord[]>('agent-whitelist.json', []);
  writeJsonFile(
    'agent-whitelist.json',
    items.filter((item) => item.id !== id)
  );
}
