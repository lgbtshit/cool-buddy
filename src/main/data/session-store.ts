import { app } from 'electron';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { join } from 'path';
import Database from 'better-sqlite3';
import type {
  AgentWhitelistItem,
  AgentWhitelistRecord,
  AgentProviderSettingsItem,
  AgentProviderSettingsRecord,
  CreateSessionPayload,
  SaveAgentWhitelistPayload,
  SaveAgentProviderSettingsPayload,
  SessionGroup,
  SessionItem,
  SessionRecord
} from '../shared/types';

let database: Database.Database | null = null;
const AGENT_SETTINGS_ROW_ID = 'default';
const DEFAULT_AGENT_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: 'gpt-4.1-mini',
  'azure-openai': 'gpt-4.1-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  'google-gemini': 'gemini-2.5-flash',
  deepseek: 'deepseek-chat',
  qwen: 'qwen-plus',
  zhipu: 'glm-4-flash',
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

function getSessionStatus(group: SessionGroup): SessionItem['status'] {
  if (group === 'production') return 'online';
  if (group === 'staging') return 'warning';
  return 'offline';
}

function getSessionIcon(group: SessionGroup): SessionItem['icon'] {
  if (group === 'production') return 'server';
  if (group === 'staging') return 'database';
  return 'hardDrive';
}

function mapSession(record: SessionRecord): SessionItem {
  return {
    id: record.id,
    name: record.name,
    group: record.group_name,
    host: record.host,
    port: record.port,
    username: record.username,
    password: record.password,
    status: getSessionStatus(record.group_name),
    icon: getSessionIcon(record.group_name)
  };
}

function mapAgentProviderSettings(
  record: AgentProviderSettingsRecord | undefined
): AgentProviderSettingsItem {
  if (!record) {
    return {
      providerCode: 'openai',
      providerName: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      modelName: 'gpt-4.1-mini',
      updatedAt: null
    };
  }

  return {
    providerCode: record.provider_code,
    providerName: record.provider_name,
    baseUrl: record.base_url,
    apiKey: record.api_key,
    modelName:
      record.model_name || DEFAULT_AGENT_MODEL_BY_PROVIDER[record.provider_code] || 'gpt-4.1-mini',
    updatedAt: record.updated_at
  };
}

function mapAgentWhitelistRecord(record: AgentWhitelistRecord): AgentWhitelistItem {
  return {
    id: record.id,
    pattern: record.pattern,
    description: record.description,
    createdAt: record.created_at
  };
}

export function getDatabase(): Database.Database {
  if (database) {
    return database;
  }

  const dataDir = join(app.getPath('home'), '.cool-buddy');
  mkdirSync(dataDir, { recursive: true });

  database = new Database(join(dataDir, 'cool-buddy.db'));
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      group_name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_provider_settings (
      id TEXT PRIMARY KEY,
      provider_code TEXT NOT NULL,
      provider_name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      model_name TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_command_whitelist (
      id TEXT PRIMARY KEY,
      pattern TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);

  const settingsColumns = database
    .prepare(`PRAGMA table_info(agent_provider_settings)`)
    .all() as Array<{ name: string }>;
  if (!settingsColumns.some((column) => column.name === 'model_name')) {
    database.exec(
      `ALTER TABLE agent_provider_settings ADD COLUMN model_name TEXT NOT NULL DEFAULT ''`
    );
  }

  return database;
}

export function listSessions(): SessionItem[] {
  const rows = getDatabase()
    .prepare(
      `
        SELECT id, name, group_name, host, port, username, password, created_at
        FROM sessions
        ORDER BY datetime(created_at) ASC, rowid ASC
      `
    )
    .all() as SessionRecord[];

  return rows.map(mapSession);
}

export function createSession(payload: CreateSessionPayload): SessionItem {
  const trimmed = {
    name: payload.name.trim(),
    group: payload.group,
    host: payload.host.trim(),
    port: Number(payload.port),
    username: payload.username.trim(),
    password: payload.password
  };

  if (!trimmed.name || !trimmed.host || !trimmed.username || !trimmed.port) {
    throw new Error('Session fields are incomplete.');
  }

  const record: SessionRecord = {
    id: randomUUID(),
    name: trimmed.name,
    group_name: trimmed.group,
    host: trimmed.host,
    port: trimmed.port,
    username: trimmed.username,
    password: trimmed.password,
    created_at: new Date().toISOString()
  };

  getDatabase()
    .prepare(
      `
        INSERT INTO sessions (id, name, group_name, host, port, username, password, created_at)
        VALUES (@id, @name, @group_name, @host, @port, @username, @password, @created_at)
      `
    )
    .run(record);

  return mapSession(record);
}

export function deleteSession(sessionId: string): void {
  const trimmedId = sessionId.trim();
  if (!trimmedId) {
    throw new Error('Session id is required.');
  }

  getDatabase()
    .prepare(
      `
        DELETE FROM sessions
        WHERE id = ?
      `
    )
    .run(trimmedId);
}

export function getAgentProviderSettings(): AgentProviderSettingsItem {
  const row = getDatabase()
    .prepare(
      `
        SELECT id, provider_code, provider_name, base_url, api_key, updated_at
             , model_name
        FROM agent_provider_settings
        WHERE id = ?
      `
    )
    .get(AGENT_SETTINGS_ROW_ID) as AgentProviderSettingsRecord | undefined;

  return mapAgentProviderSettings(row);
}

export function saveAgentProviderSettings(
  payload: SaveAgentProviderSettingsPayload
): AgentProviderSettingsItem {
  const record: AgentProviderSettingsRecord = {
    id: AGENT_SETTINGS_ROW_ID,
    provider_code: payload.providerCode,
    provider_name: payload.providerName.trim(),
    base_url: payload.baseUrl.trim(),
    api_key: payload.apiKey.trim(),
    model_name:
      payload.modelName.trim() ||
      DEFAULT_AGENT_MODEL_BY_PROVIDER[payload.providerCode] ||
      DEFAULT_AGENT_MODEL_BY_PROVIDER.custom,
    updated_at: new Date().toISOString()
  };

  if (!record.provider_name || !record.base_url) {
    throw new Error('Agent provider settings are incomplete.');
  }

  getDatabase()
    .prepare(
      `
        INSERT INTO agent_provider_settings (id, provider_code, provider_name, base_url, api_key, model_name, updated_at)
        VALUES (@id, @provider_code, @provider_name, @base_url, @api_key, @model_name, @updated_at)
        ON CONFLICT(id) DO UPDATE SET
          provider_code = excluded.provider_code,
          provider_name = excluded.provider_name,
          base_url = excluded.base_url,
          api_key = excluded.api_key,
          model_name = excluded.model_name,
          updated_at = excluded.updated_at
      `
    )
    .run(record);

  return mapAgentProviderSettings(record);
}

export function listAgentWhitelist(): AgentWhitelistItem[] {
  const rows = getDatabase()
    .prepare(
      `
        SELECT id, pattern, description, created_at
        FROM agent_command_whitelist
        ORDER BY datetime(created_at) DESC, rowid DESC
      `
    )
    .all() as AgentWhitelistRecord[];

  return rows.map(mapAgentWhitelistRecord);
}

export function createAgentWhitelistItem(payload: SaveAgentWhitelistPayload): AgentWhitelistItem {
  const pattern = payload.pattern.trim();
  const description = payload.description?.trim() ?? '';

  if (!pattern) {
    throw new Error('Whitelist pattern is required.');
  }

  const record: AgentWhitelistRecord = {
    id: randomUUID(),
    pattern,
    description,
    created_at: new Date().toISOString()
  };

  getDatabase()
    .prepare(
      `
        INSERT INTO agent_command_whitelist (id, pattern, description, created_at)
        VALUES (@id, @pattern, @description, @created_at)
      `
    )
    .run(record);

  return mapAgentWhitelistRecord(record);
}

export function deleteAgentWhitelistItem(id: string): void {
  const trimmedId = id.trim();
  if (!trimmedId) {
    throw new Error('Whitelist id is required.');
  }

  getDatabase()
    .prepare(
      `
        DELETE FROM agent_command_whitelist
        WHERE id = ?
      `
    )
    .run(trimmedId);
}

export function closeDatabase(): void {
  database?.close();
  database = null;
}
