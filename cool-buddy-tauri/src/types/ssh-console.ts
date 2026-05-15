export type { Locale } from '../shared/locale';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
export type SessionGroup = 'production' | 'staging' | 'local';
export type SessionStatus = 'online' | 'warning' | 'offline';
export type SessionIcon = 'server' | 'database' | 'hardDrive';
export type SessionAuthMethod = 'password' | 'systemKey';
export type SshKeySource = 'default' | 'custom';
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
  status: SessionStatus;
  icon: SessionIcon;
};

export type SessionDraft = {
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

export type SessionModalMode = 'create' | 'edit';

export type ConnectionForm = {
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

export type AgentProviderSettings = {
  providerCode: AgentProviderCode;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  updatedAt: string | null;
};

export type AgentProviderOption = {
  code: AgentProviderCode;
  name: string;
  baseUrl: string;
  description: string;
};

export type AgentModelOption = {
  id: string;
  name: string;
  providerCode: AgentProviderCode;
};

export type AgentRiskLevel = 'p0' | 'p1' | 'p2' | 'p3' | 'p4';

export type AgentThreadMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
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

export type AgentWhitelistItem = {
  id: string;
  pattern: string;
  description: string;
  createdAt: string;
};

export type TabMenuState = {
  sessionId: string;
  x: number;
  y: number;
};

export type RemoteEntry = {
  name: string;
  path: string;
  kind: 'file' | 'directory' | 'symlink';
  size: number;
  modifiedAt: number | null;
};

export type RemoteDirectory = {
  path: string;
  entries: RemoteEntry[];
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

export type RemoteApp = {
  id: string;
  name: string;
  kind: 'service' | 'docker';
  status: string;
  runtime: string | null;
  image: string | null;
  ports: string | null;
  description: string | null;
};

export type LogTailState = 'idle' | 'running' | 'error';

export type LogTailStream = {
  id: string;
  path: string;
  lines: string[];
  state: LogTailState;
  error: string;
  statusMessage: string;
};

export type DiagnosticLevel = 'info' | 'warning' | 'error';

export type DiagnosticSource =
  | 'frontend'
  | 'backend'
  | 'backend-host'
  | 'bridge'
  | 'rust'
  | 'unknown';

export type DiagnosticEntry = {
  id: string;
  level: DiagnosticLevel;
  source: DiagnosticSource;
  message: string;
  details: string;
  timestamp: string;
};

export type RemoteFileSyncRequest = {
  localPath: string;
  remotePath: string;
};
