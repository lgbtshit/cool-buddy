import { ElectronAPI } from '@electron-toolkit/preload';

type SshConnectPayload = {
  host: string;
  port: number;
  username: string;
  password: string;
};

type SshCommandBatchPayload = {
  content: string;
};

type SshLogTailPayload = {
  path: string;
  lineCount: number;
};

type SshStatusPayload = {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  message: string;
};

type SshLogStatusPayload = {
  status: 'idle' | 'running' | 'error';
  path: string;
  message: string;
};

type SessionGroup = 'production' | 'staging' | 'local';

type SessionItem = {
  id: string;
  name: string;
  group: SessionGroup;
  host: string;
  port: number;
  username: string;
  password: string;
  status: 'online' | 'warning' | 'offline';
  icon: 'server' | 'database' | 'hardDrive';
};

type CreateSessionPayload = {
  name: string;
  group: SessionGroup;
  host: string;
  port: number;
  username: string;
  password: string;
};

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

type AgentProviderSettings = {
  providerCode: AgentProviderCode;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  updatedAt: string | null;
};

type AgentModelOption = {
  id: string;
  name: string;
  providerCode: AgentProviderCode;
};

type AgentRiskLevel = 'p0' | 'p1' | 'p2' | 'p3' | 'p4';

type AgentThreadMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  createdAt: string;
  toolName: string | null;
};

type AgentApprovalRequest = {
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

type AgentStateSnapshot = {
  messages: AgentThreadMessage[];
  pendingApproval: AgentApprovalRequest | null;
  running: boolean;
  configured: boolean;
  lastError: string;
};

type AgentRuntimeEvent =
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

type AgentWhitelistItem = {
  id: string;
  pattern: string;
  description: string;
  createdAt: string;
};

type RemoteEntry = {
  name: string;
  path: string;
  kind: 'file' | 'directory' | 'symlink';
  size: number;
  modifiedAt: number | null;
};

type RemoteDirectory = {
  path: string;
  entries: RemoteEntry[];
};

type RemotePathCompletionPayload = {
  input: string;
  basePath?: string;
  filesOnly?: boolean;
};

type RemotePathCompletionResult = {
  value: string;
  matches: string[];
};

type SystemMetrics = {
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

type LiveSystemMetrics = Pick<SystemMetrics, 'cpuPercent' | 'memoryUsedMb' | 'memoryTotalMb'>;

type RemoteApp = {
  id: string;
  name: string;
  kind: 'service' | 'docker';
  status: string;
  runtime: string | null;
  image: string | null;
  ports: string | null;
  description: string | null;
};

type AppApi = {
  sessions: {
    list: () => Promise<SessionItem[]>;
    create: (payload: CreateSessionPayload) => Promise<SessionItem>;
    delete: (sessionId: string) => Promise<{ ok: true }>;
  };
  agentSettings: {
    getProvider: () => Promise<AgentProviderSettings>;
    listModels: (payload: {
      providerCode: AgentProviderCode;
      providerName: string;
      baseUrl: string;
      apiKey: string;
    }) => Promise<AgentModelOption[]>;
    saveProvider: (
      payload: Omit<AgentProviderSettings, 'updatedAt'>
    ) => Promise<AgentProviderSettings>;
  };
  harmlessAgent: {
    getState: (sessionId: string) => Promise<AgentStateSnapshot>;
    run: (payload: { sessionId: string; prompt: string }) => Promise<AgentStateSnapshot>;
    resolveApproval: (payload: {
      sessionId: string;
      approvalId: string;
      approve: boolean;
    }) => Promise<AgentStateSnapshot>;
    listWhitelist: () => Promise<AgentWhitelistItem[]>;
    createWhitelistItem: (payload: {
      pattern: string;
      description?: string;
    }) => Promise<AgentWhitelistItem>;
    deleteWhitelistItem: (id: string) => Promise<AgentWhitelistItem[]>;
    onEvent: (listener: (event: AgentRuntimeEvent) => void) => () => void;
  };
  ssh: {
    connect: (payload: SshConnectPayload) => Promise<{ ok: true; remotePath: string }>;
    executeCommandBatch: (payload: SshCommandBatchPayload) => Promise<{ ok: true }>;
    startLogTail: (payload: SshLogTailPayload) => Promise<{ ok: true }>;
    stopLogTail: () => Promise<{ ok: true }>;
    disconnect: () => Promise<{ ok: true }>;
    listRemote: (payload?: { path?: string; showHidden?: boolean }) => Promise<RemoteDirectory>;
    completeRemotePath: (
      payload: RemotePathCompletionPayload
    ) => Promise<RemotePathCompletionResult>;
    readRemoteFile: (payload: { path: string }) => Promise<{ path: string; content: string }>;
    uploadRemoteFile: (payload: {
      directory: string;
      name: string;
      data: Uint8Array;
    }) => Promise<{ ok: true; path: string }>;
    createRemoteDirectory: (payload: { path: string }) => Promise<{ ok: true; path: string }>;
    renameRemoteEntry: (payload: {
      oldPath: string;
      newPath: string;
    }) => Promise<{ ok: true; path: string }>;
    deleteRemoteEntry: (payload: {
      path: string;
      recursive?: boolean;
    }) => Promise<{ ok: true; path: string }>;
    getLatency: () => Promise<number | null>;
    getSystemMetrics: () => Promise<SystemMetrics | null>;
    getLiveMetrics: () => Promise<LiveSystemMetrics | null>;
    getRemoteApps: () => Promise<RemoteApp[]>;
    input: (data: string) => void;
    resize: (size: { cols: number; rows: number }) => void;
    onData: (listener: (data: string) => void) => () => void;
    onStatus: (listener: (payload: SshStatusPayload) => void) => () => void;
    onLogData: (listener: (data: string) => void) => () => void;
    onLogStatus: (listener: (payload: SshLogStatusPayload) => void) => () => void;
  };
};

declare global {
  interface Window {
    electron: ElectronAPI;
    api: AppApi;
  }
}
