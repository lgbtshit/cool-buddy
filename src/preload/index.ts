import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import type { Locale } from '../shared/locale';

type SessionAuthMethod = 'password' | 'systemKey';
type SshKeySource = 'default' | 'custom';

type SshConnectPayload = {
  host: string;
  port: number;
  username: string;
  password: string;
  authMethod: SessionAuthMethod;
  keySource: SshKeySource;
  privateKeyPath: string;
  passphrase: string;
};

type SshAuthCapabilities = {
  hasAgent: boolean;
  detectedDefaultKeyPaths: string[];
  defaultKeyCandidates: string[];
  recommendedAuthMethod: SessionAuthMethod;
};

type SshCommandBatchPayload = {
  content: string;
};

type SshLogTailPayload = {
  streamId: string;
  path: string;
  lineCount: number;
};

type SshLogDataPayload = {
  streamId: string;
  chunk: string;
};

type SshStatusPayload = {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  message: string;
};

type SshLogStatusPayload = {
  streamId: string;
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
  authMethod: SessionAuthMethod;
  keySource: SshKeySource;
  privateKeyPath: string;
  passphrase: string;
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
  authMethod: SessionAuthMethod;
  keySource: SshKeySource;
  privateKeyPath: string;
  passphrase: string;
};

type UpdateSessionPayload = CreateSessionPayload & {
  id: string;
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

type AgentRunPhase = 'idle' | 'running' | 'compressing' | 'awaiting-approval';

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
  phase: AgentRunPhase;
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

type AppVersionInfo = {
  name: string;
  version: string;
  isPackaged: boolean;
  updateBaseUrl: string;
};

type AppUpdateCheckStatus = 'up-to-date' | 'update-available' | 'not-supported' | 'error';

type AppUpdateCheckResult = {
  status: AppUpdateCheckStatus;
  currentVersion: string;
  latestVersion: string | null;
  message: string;
  checkedAt: string;
  updateBaseUrl: string;
};

const api = {
  app: {
    setLocale: (locale: Locale): Promise<{ ok: true }> =>
      ipcRenderer.invoke('app:set-locale', locale),
    getVersionInfo: (): Promise<AppVersionInfo> => ipcRenderer.invoke('app:get-version-info'),
    checkUpdates: (): Promise<AppUpdateCheckResult> => ipcRenderer.invoke('app:check-updates')
  },
  sessions: {
    list: (): Promise<SessionItem[]> => ipcRenderer.invoke('sessions:list'),
    create: (payload: CreateSessionPayload): Promise<SessionItem> =>
      ipcRenderer.invoke('sessions:create', payload),
    update: (payload: UpdateSessionPayload): Promise<SessionItem> =>
      ipcRenderer.invoke('sessions:update', payload),
    delete: (sessionId: string): Promise<{ ok: true }> =>
      ipcRenderer.invoke('sessions:delete', sessionId)
  },
  agentSettings: {
    getProvider: (): Promise<AgentProviderSettings> =>
      ipcRenderer.invoke('agent-settings:get-provider'),
    listModels: (payload: {
      providerCode: AgentProviderCode;
      providerName: string;
      baseUrl: string;
      apiKey: string;
    }): Promise<AgentModelOption[]> => ipcRenderer.invoke('agent-settings:list-models', payload),
    saveProvider: (
      payload: Omit<AgentProviderSettings, 'updatedAt'>
    ): Promise<AgentProviderSettings> => ipcRenderer.invoke('agent-settings:save-provider', payload)
  },
  harmlessAgent: {
    getState: (sessionId: string): Promise<AgentStateSnapshot> =>
      ipcRenderer.invoke('harmless-agent:get-state', sessionId),
    run: (payload: { sessionId: string; prompt: string }): Promise<AgentStateSnapshot> =>
      ipcRenderer.invoke('harmless-agent:run', payload),
    resolveApproval: (payload: {
      sessionId: string;
      approvalId: string;
      approve: boolean;
    }): Promise<AgentStateSnapshot> =>
      ipcRenderer.invoke('harmless-agent:resolve-approval', payload),
    listWhitelist: (): Promise<AgentWhitelistItem[]> =>
      ipcRenderer.invoke('harmless-agent:list-whitelist'),
    createWhitelistItem: (payload: {
      pattern: string;
      description?: string;
    }): Promise<AgentWhitelistItem> =>
      ipcRenderer.invoke('harmless-agent:create-whitelist-item', payload),
    deleteWhitelistItem: (id: string): Promise<AgentWhitelistItem[]> =>
      ipcRenderer.invoke('harmless-agent:delete-whitelist-item', id),
    onEvent: (listener: (event: AgentRuntimeEvent) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: AgentRuntimeEvent) =>
        listener(payload);
      ipcRenderer.on('harmless-agent:event', wrapped);
      return () => ipcRenderer.removeListener('harmless-agent:event', wrapped);
    }
  },
  ssh: {
    connect: (payload: SshConnectPayload): Promise<{ ok: true; remotePath: string }> =>
      ipcRenderer.invoke('ssh:connect', payload),
    getAuthCapabilities: (): Promise<SshAuthCapabilities> =>
      ipcRenderer.invoke('ssh:get-auth-capabilities'),
    pickPrivateKey: (): Promise<{ canceled: boolean; path: string }> =>
      ipcRenderer.invoke('ssh:pick-private-key'),
    executeCommandBatch: (payload: SshCommandBatchPayload): Promise<{ ok: true }> =>
      ipcRenderer.invoke('ssh:execute-command-batch', payload),
    startLogTail: (payload: SshLogTailPayload): Promise<{ ok: true }> =>
      ipcRenderer.invoke('ssh:start-log-tail', payload),
    stopLogTail: (streamId: string): Promise<{ ok: true }> =>
      ipcRenderer.invoke('ssh:stop-log-tail', streamId),
    getStatusSnapshot: (): Promise<SshStatusPayload> =>
      ipcRenderer.invoke('ssh:get-status-snapshot'),
    disconnect: () => ipcRenderer.invoke('ssh:disconnect'),
    listRemote: (payload?: { path?: string; showHidden?: boolean }): Promise<RemoteDirectory> =>
      ipcRenderer.invoke('ssh:list-remote', payload),
    completeRemotePath: (
      payload: RemotePathCompletionPayload
    ): Promise<RemotePathCompletionResult> =>
      ipcRenderer.invoke('ssh:complete-remote-path', payload),
    readRemoteFile: (payload: { path: string }): Promise<{ path: string; content: string }> =>
      ipcRenderer.invoke('ssh:read-remote-file', payload),
    openRemoteFile: (payload: { path: string }): Promise<{ path: string; localPath: string }> =>
      ipcRenderer.invoke('ssh:open-remote-file', payload),
    writeRemoteTextFile: (payload: {
      path: string;
      content: string;
    }): Promise<{ ok: true; path: string }> =>
      ipcRenderer.invoke('ssh:write-remote-text-file', payload),
    uploadRemoteFile: (payload: {
      directory: string;
      name: string;
      relativePath?: string;
      data: Uint8Array;
    }): Promise<{ ok: true; path: string }> =>
      ipcRenderer.invoke('ssh:upload-remote-file', payload),
    startRemoteUpload: (payload: {
      uploadId: string;
      directory: string;
      name: string;
      relativePath?: string;
    }): Promise<{ ok: true; path: string }> =>
      ipcRenderer.invoke('ssh:start-remote-upload', payload),
    appendRemoteUploadChunk: (payload: {
      uploadId: string;
      data: Uint8Array;
      offset?: number;
    }): Promise<{ ok: true; path: string; bytesWritten: number; offset: number }> =>
      ipcRenderer.invoke('ssh:append-remote-upload-chunk', payload),
    finishRemoteUpload: (payload: { uploadId: string }): Promise<{ ok: true; path: string }> =>
      ipcRenderer.invoke('ssh:finish-remote-upload', payload),
    cancelRemoteUpload: (payload: { uploadId: string }): Promise<{ ok: true }> =>
      ipcRenderer.invoke('ssh:cancel-remote-upload', payload),
    createRemoteDirectory: (payload: { path: string }): Promise<{ ok: true; path: string }> =>
      ipcRenderer.invoke('ssh:create-remote-directory', payload),
    renameRemoteEntry: (payload: {
      oldPath: string;
      newPath: string;
    }): Promise<{ ok: true; path: string }> =>
      ipcRenderer.invoke('ssh:rename-remote-entry', payload),
    deleteRemoteEntry: (payload: {
      path: string;
      recursive?: boolean;
      kind?: 'file' | 'directory' | 'symlink';
    }): Promise<{ ok: true; path: string }> =>
      ipcRenderer.invoke('ssh:delete-remote-entry', payload),
    getLatency: (): Promise<number | null> => ipcRenderer.invoke('ssh:get-latency'),
    getSystemMetrics: (): Promise<SystemMetrics | null> =>
      ipcRenderer.invoke('ssh:get-system-metrics'),
    getLiveMetrics: (): Promise<LiveSystemMetrics | null> =>
      ipcRenderer.invoke('ssh:get-live-metrics'),
    getRemoteApps: (): Promise<RemoteApp[]> => ipcRenderer.invoke('ssh:get-remote-apps'),
    input: (data: string) => ipcRenderer.send('ssh:input', data),
    resize: (size: { cols: number; rows: number }) => ipcRenderer.send('ssh:resize', size),
    onData: (listener: (data: string) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, data: string) => listener(data);
      ipcRenderer.on('ssh:data', wrapped);
      return () => ipcRenderer.removeListener('ssh:data', wrapped);
    },
    onStatus: (listener: (payload: SshStatusPayload) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: SshStatusPayload) =>
        listener(payload);
      ipcRenderer.on('ssh:status', wrapped);
      return () => ipcRenderer.removeListener('ssh:status', wrapped);
    },
    onLogData: (listener: (payload: SshLogDataPayload) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: SshLogDataPayload) =>
        listener(payload);
      ipcRenderer.on('ssh:log-data', wrapped);
      return () => ipcRenderer.removeListener('ssh:log-data', wrapped);
    },
    onLogStatus: (listener: (payload: SshLogStatusPayload) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: SshLogStatusPayload) =>
        listener(payload);
      ipcRenderer.on('ssh:log-status', wrapped);
      return () => ipcRenderer.removeListener('ssh:log-status', wrapped);
    }
  }
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
