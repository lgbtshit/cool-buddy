import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import type { Locale } from '../shared/locale';

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

const api = {
  app: {
    setLocale: (locale: Locale): Promise<{ ok: true }> =>
      ipcRenderer.invoke('app:set-locale', locale)
  },
  sessions: {
    list: (): Promise<SessionItem[]> => ipcRenderer.invoke('sessions:list'),
    create: (payload: CreateSessionPayload): Promise<SessionItem> =>
      ipcRenderer.invoke('sessions:create', payload),
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
    executeCommandBatch: (payload: SshCommandBatchPayload): Promise<{ ok: true }> =>
      ipcRenderer.invoke('ssh:execute-command-batch', payload),
    startLogTail: (payload: SshLogTailPayload): Promise<{ ok: true }> =>
      ipcRenderer.invoke('ssh:start-log-tail', payload),
    stopLogTail: (): Promise<{ ok: true }> => ipcRenderer.invoke('ssh:stop-log-tail'),
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
    uploadRemoteFile: (payload: {
      directory: string;
      name: string;
      data: Uint8Array;
    }): Promise<{ ok: true; path: string }> =>
      ipcRenderer.invoke('ssh:upload-remote-file', payload),
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
    onLogData: (listener: (data: string) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, data: string) => listener(data);
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
