export type SessionAuthMethod = 'password' | 'systemKey';
export type SshKeySource = 'default' | 'custom';

export type SshConnectPayload = {
  host: string;
  port: number;
  username: string;
  password: string;
  authMethod: SessionAuthMethod;
  keySource: SshKeySource;
  privateKeyPath: string;
  passphrase: string;
};

export type SshAuthCapabilities = {
  hasAgent: boolean;
  detectedDefaultKeyPaths: string[];
  defaultKeyCandidates: string[];
  recommendedAuthMethod: SessionAuthMethod;
};

export type SshCommandBatchPayload = {
  content: string;
};

export type SshLogTailPayload = {
  streamId: string;
  path: string;
  lineCount: number;
};

export type SshLogDataPayload = {
  streamId: string;
  chunk: string;
};

export type SshStatusPayload = {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  message: string;
};

export type SshLogStatusPayload = {
  streamId: string;
  status: 'idle' | 'running' | 'error';
  path: string;
  message: string;
};

export type SessionGroup = 'production' | 'staging' | 'local';

export type SessionRecord = {
  id: string;
  name: string;
  group_name: SessionGroup;
  host: string;
  port: number;
  username: string;
  password: string;
  auth_method: SessionAuthMethod;
  key_source: SshKeySource;
  private_key_path: string;
  passphrase: string;
  created_at: string;
};

export type SessionItem = {
  id: string;
  name: string;
  group: SessionGroup;
  host: string;
  port: number;
  username: string;
  password: string;
  authMethod: SessionAuthMethod;
  keySource: SshKeySource;
  privateKeyPath: string;
  passphrase: string;
  status: 'online' | 'warning' | 'offline';
  icon: 'server' | 'database' | 'hardDrive';
};

export type CreateSessionPayload = {
  name: string;
  group: SessionGroup;
  host: string;
  port: number;
  username: string;
  password: string;
  authMethod: SessionAuthMethod;
  keySource: SshKeySource;
  privateKeyPath: string;
  passphrase: string;
};

export type UpdateSessionPayload = CreateSessionPayload & {
  id: string;
};

export type AgentProviderCode =
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

export type AgentProviderSettingsRecord = {
  id: string;
  provider_code: AgentProviderCode;
  provider_name: string;
  base_url: string;
  api_key: string;
  model_name: string;
  updated_at: string;
};

export type AgentProviderSettingsItem = {
  providerCode: AgentProviderCode;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  updatedAt: string | null;
};

export type SaveAgentProviderSettingsPayload = {
  providerCode: AgentProviderCode;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
};

export type FetchAgentModelsPayload = {
  providerCode: AgentProviderCode;
  providerName: string;
  baseUrl: string;
  apiKey: string;
};

export type AgentModelOption = {
  id: string;
  name: string;
  providerCode: AgentProviderCode;
};

export type AgentProviderProtocol = 'openai' | 'anthropic';

export type AgentRiskLevel = 'p0' | 'p1' | 'p2' | 'p3' | 'p4';

export type AgentThreadMessageRole = 'user' | 'assistant' | 'tool' | 'system';

export type AgentThreadMessage = {
  id: string;
  role: AgentThreadMessageRole;
  content: string;
  createdAt: string;
  toolName: string | null;
};

export type AgentApprovalRequest = {
  id: string;
  toolName: string;
  riskLevel: AgentRiskLevel;
  title: string;
  summary: string;
  details: string;
  command: string | null;
  confirmCount: 1 | 2;
  createdAt: string;
};

export type AgentStateSnapshot = {
  messages: AgentThreadMessage[];
  pendingApproval: AgentApprovalRequest | null;
  running: boolean;
  configured: boolean;
  lastError: string;
};

export type AgentRuntimeEvent =
  | {
      type: 'state';
      sessionId: string;
      snapshot: AgentStateSnapshot;
    }
  | {
      type: 'message-upsert';
      sessionId: string;
      message: AgentThreadMessage;
    }
  | {
      type: 'message-delta';
      sessionId: string;
      messageId: string;
      delta: string;
    }
  | {
      type: 'terminal-output';
      sessionId: string;
      content: string;
    };

export type RunAgentPayload = {
  sessionId: string;
  prompt: string;
};

export type ResolveAgentApprovalPayload = {
  sessionId: string;
  approvalId: string;
  approve: boolean;
};

export type AgentWhitelistRecord = {
  id: string;
  pattern: string;
  description: string;
  created_at: string;
};

export type AgentWhitelistItem = {
  id: string;
  pattern: string;
  description: string;
  createdAt: string;
};

export type SaveAgentWhitelistPayload = {
  pattern: string;
  description?: string;
};

export type RemoteEntry = {
  name: string;
  path: string;
  kind: 'file' | 'directory' | 'symlink';
  size: number;
  modifiedAt: number | null;
};

export type RemoteListPayload = {
  path?: string;
  showHidden?: boolean;
};

export type RemotePathCompletionPayload = {
  input: string;
  basePath?: string;
  filesOnly?: boolean;
};

export type RemotePathCompletionResult = {
  value: string;
  matches: string[];
};

export type RemoteOpenFilePayload = {
  path: string;
};

export type RemoteReadPayload = {
  path: string;
};

export type RemoteWriteTextPayload = {
  path: string;
  content: string;
};

export type RemoteUploadPayload = {
  directory: string;
  name: string;
  relativePath?: string;
  data: Uint8Array;
};

export type RemoteMkdirPayload = {
  path: string;
};

export type RemoteRenamePayload = {
  oldPath: string;
  newPath: string;
};

export type RemoteDeletePayload = {
  path: string;
  recursive?: boolean;
};

export type SystemMetrics = {
  cpuPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  dockerRunning: number | null;
  hostname: string | null;
  osName: string | null;
  kernelVersion: string | null;
  architecture: string | null;
  uptime: string | null;
};

export type LiveSystemMetrics = Pick<
  SystemMetrics,
  'cpuPercent' | 'memoryUsedMb' | 'memoryTotalMb'
>;

export type RawSystemMetrics = {
  cpuRaw: string;
  memoryRaw: string;
  dockerRaw: string;
  hostnameRaw: string;
  osNameRaw: string;
  kernelRaw: string;
  architectureRaw: string;
  uptimeRaw: string;
};

export type RemoteAppKind = 'service' | 'docker';

export type RemoteApp = {
  id: string;
  name: string;
  kind: RemoteAppKind;
  status: string;
  runtime: string | null;
  image: string | null;
  ports: string | null;
  description: string | null;
};
