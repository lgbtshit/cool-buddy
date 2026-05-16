import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { defaultLocale, type Locale } from '../shared/locale';
import { fetchProviderModels } from './provider-models';

type SessionAuthMethod = 'password' | 'systemKey';
type SshStatusPayload = Awaited<ReturnType<Window['api']['ssh']['getStatusSnapshot']>>;
type SshLogStatusPayload = Parameters<Parameters<Window['api']['ssh']['onLogStatus']>[0]>[0];
type SshLogDataPayload = Parameters<Parameters<Window['api']['ssh']['onLogData']>[0]>[0];
type AgentModelOption = Awaited<ReturnType<Window['api']['agentSettings']['listModels']>>[number];
type AgentStateSnapshot = Awaited<ReturnType<Window['api']['harmlessAgent']['getState']>>;
type AgentWhitelistItem = Awaited<
  ReturnType<Window['api']['harmlessAgent']['listWhitelist']>
>[number];
type RemoteDirectory = Awaited<ReturnType<Window['api']['ssh']['listRemote']>>;
type RemotePathCompletionPayload = Parameters<Window['api']['ssh']['completeRemotePath']>[0];
type RemotePathCompletionResult = Awaited<ReturnType<Window['api']['ssh']['completeRemotePath']>>;
type RemoteFileSyncRequest = Parameters<
  Parameters<Window['api']['ssh']['onRemoteFileSyncRequest']>[0]
>[0];

const LOCALE_KEY = 'cool-buddy-tauri:locale';
const DIAGNOSTIC_EVENT = 'cool-buddy:diagnostic';
const sshStatusListeners = new Set<(payload: SshStatusPayload) => void>();
const sshDataListeners = new Set<(data: string) => void>();
const sshLogDataListeners = new Set<(payload: SshLogDataPayload) => void>();
const sshLogStatusListeners = new Set<(payload: SshLogStatusPayload) => void>();
const remoteFileSyncRequestListeners = new Set<(payload: RemoteFileSyncRequest) => void>();
const agentEventListeners = new Set<
  (
    event: Parameters<Window['api']['harmlessAgent']['onEvent']>[0] extends (e: infer E) => void
      ? E
      : never
  ) => void
>();

let sshStatusSnapshot: SshStatusPayload = {
  status: 'disconnected',
  message: 'SSH session is not connected.'
};
let backendEventsReady = false;

function subscribe<T>(listeners: Set<(payload: T) => void>, listener: (payload: T) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitStatus(payload: SshStatusPayload): void {
  sshStatusSnapshot = payload;
  for (const listener of sshStatusListeners) {
    listener(payload);
  }
}

function emitDiagnosticEvent(detail: {
  level: 'info' | 'warning' | 'error';
  source: 'frontend' | 'backend' | 'backend-host' | 'bridge' | 'rust' | 'unknown';
  message: string;
  details: string;
  timestamp?: string;
}): void {
  window.dispatchEvent(
    new CustomEvent(DIAGNOSTIC_EVENT, {
      detail: {
        ...detail,
        timestamp: detail.timestamp ?? new Date().toISOString()
      }
    })
  );
}

function inferTauriVersion(): string {
  const match = navigator.userAgent.match(/Tauri\/([0-9.]+)/i);
  return match?.[1] ?? '2.x';
}

function getDesktopRuntimeInfo() {
  const chromeMatch = navigator.userAgent.match(/Chrome\/([0-9.]+)/i);
  return {
    process: {
      versions: {
        electron: 'replaced-by-tauri',
        chrome: chromeMatch?.[1] ?? 'unknown',
        node: 'sidecar-free',
        tauri: inferTauriVersion()
      }
    }
  };
}

async function invokeCommand<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(cmd, args);
}

async function invokeBackend<T>(method: string, args?: unknown): Promise<T> {
  try {
    return await invokeCommand<T>('backend_invoke', {
      method,
      args
    });
  } catch (error) {
    emitDiagnosticEvent({
      level: 'error',
      source: 'bridge',
      message: `Backend invoke failed: ${method}`,
      details: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

function emitSshData(data: string): void {
  for (const listener of sshDataListeners) {
    listener(data);
  }
}

function emitSshLogData(payload: SshLogDataPayload): void {
  for (const listener of sshLogDataListeners) {
    listener(payload);
  }
}

function emitSshLogStatus(payload: SshLogStatusPayload): void {
  for (const listener of sshLogStatusListeners) {
    listener(payload);
  }
}

function emitRemoteFileSyncRequest(payload: RemoteFileSyncRequest): void {
  for (const listener of remoteFileSyncRequestListeners) {
    listener(payload);
  }
}

function emitAgentEvent(
  event: Parameters<Window['api']['harmlessAgent']['onEvent']>[0] extends (e: infer E) => void
    ? E
    : never
): void {
  for (const listener of agentEventListeners) {
    listener(event);
  }
}

function ensureBackendEventListeners(): void {
  if (backendEventsReady) {
    return;
  }

  backendEventsReady = true;

  void listen<SshStatusPayload>('ssh:status', (event) => {
    emitStatus(event.payload);
  });

  void listen<string>('ssh:data', (event) => {
    emitSshData(event.payload);
  });

  void listen<SshLogDataPayload>('ssh:log-data', (event) => {
    emitSshLogData(event.payload);
  });

  void listen<SshLogStatusPayload>('ssh:log-status', (event) => {
    emitSshLogStatus(event.payload);
  });

  void listen<RemoteFileSyncRequest>('ssh:remote-file-sync-request', (event) => {
    emitRemoteFileSyncRequest(event.payload);
  });

  void listen<
    Parameters<Window['api']['harmlessAgent']['onEvent']>[0] extends (e: infer E) => void
      ? E
      : never
  >('harmless-agent:event', (event) => {
    emitAgentEvent(event.payload);
  });

  void listen<{ message?: string }>('backend:error', (event) => {
    if (event.payload?.message) {
      console.error('[cool-buddy-tauri backend]', event.payload.message);
      emitDiagnosticEvent({
        level: 'error',
        source: 'backend-host',
        message: 'Backend host error',
        details: event.payload.message
      });
    }
  });
}

ensureBackendEventListeners();

const api: Window['api'] = {
  app: {
    async setLocale(locale: Locale) {
      window.localStorage.setItem(LOCALE_KEY, locale);
      await invokeCommand<{ ok: true }>('app_set_locale', { locale });
      return { ok: true };
    },
    openDevtools() {
      return invokeCommand<{ ok: true }>('app_open_devtools');
    }
  },
  sessions: {
    list: () => invokeCommand('sessions_list'),
    create: (payload) => invokeCommand('sessions_create', { payload }),
    update: (payload) => invokeCommand('sessions_update', { payload }),
    delete: (sessionId: string) => invokeCommand('sessions_delete', { sessionId })
  },
  agentSettings: {
    getProvider: () => invokeCommand('agent_settings_get_provider'),
    listModels: (payload) => fetchProviderModels(payload) as Promise<AgentModelOption[]>,
    saveProvider: (payload) => invokeCommand('agent_settings_save_provider', { payload })
  },
  harmlessAgent: {
    getState: (sessionId: string) =>
      invokeBackend<AgentStateSnapshot>('harmlessAgent.getState', sessionId),
    run: (payload) => invokeBackend<AgentStateSnapshot>('harmlessAgent.run', payload),
    resolveApproval: (payload) =>
      invokeBackend<AgentStateSnapshot>('harmlessAgent.resolveApproval', payload),
    listWhitelist: () => invokeBackend<AgentWhitelistItem[]>('harmlessAgent.listWhitelist'),
    createWhitelistItem: (payload) =>
      invokeBackend<AgentWhitelistItem>('harmlessAgent.createWhitelistItem', payload),
    deleteWhitelistItem: (id: string) =>
      invokeBackend<AgentWhitelistItem[]>('harmlessAgent.deleteWhitelistItem', id),
    onEvent(listener) {
      return subscribe(agentEventListeners, listener);
    }
  },
  ssh: {
    async connect(payload) {
      return await invokeBackend('ssh.connect', payload);
    },
    async getAuthCapabilities() {
      return await invokeBackend('ssh.getAuthCapabilities');
    },
    async pickPrivateKey() {
      const selected = await open({
        directory: false,
        multiple: false,
        title: 'Select private key'
      });
      return {
        canceled: !selected,
        path: typeof selected === 'string' ? selected : ''
      };
    },
    async executeCommandBatch(payload) {
      return await invokeBackend('ssh.executeCommandBatch', payload);
    },
    async startLogTail(payload) {
      return await invokeBackend('ssh.startLogTail', payload);
    },
    async stopLogTail(streamId) {
      return await invokeBackend('ssh.stopLogTail', streamId);
    },
    async getStatusSnapshot() {
      const snapshot = await invokeBackend<SshStatusPayload>('ssh.getStatusSnapshot');
      sshStatusSnapshot = snapshot;
      return snapshot;
    },
    async disconnect() {
      return await invokeBackend('ssh.disconnect');
    },
    async listRemote(payload) {
      return await invokeBackend<RemoteDirectory>('ssh.listRemote', payload);
    },
    async completeRemotePath(payload: RemotePathCompletionPayload) {
      return await invokeBackend<RemotePathCompletionResult>('ssh.completeRemotePath', payload);
    },
    async readRemoteFile(payload) {
      return await invokeBackend('ssh.readRemoteFile', payload);
    },
    async openRemoteFile(payload) {
      const opened = await invokeBackend<{ path: string; localPath: string }>(
        'ssh.openRemoteFile',
        payload
      );
      try {
        await openPath(opened.localPath);
      } catch (error) {
        throw new Error(
          `Unable to open remote file.\nRemote file: ${opened.path}\nLocal temp file: ${opened.localPath}\nSystem message: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      return opened;
    },
    async syncOpenRemoteFile(payload) {
      return await invokeBackend('ssh.syncOpenRemoteFile', payload);
    },
    async dismissOpenRemoteFileSyncRequest(payload) {
      return await invokeBackend('ssh.dismissOpenRemoteFileSyncRequest', payload);
    },
    async writeRemoteTextFile(payload) {
      return await invokeBackend('ssh.writeRemoteTextFile', payload);
    },
    async uploadRemoteFile(payload) {
      return await invokeBackend('ssh.uploadRemoteFile', payload);
    },
    async startRemoteUpload(payload) {
      return await invokeBackend('ssh.startRemoteUpload', payload);
    },
    async appendRemoteUploadChunk(payload) {
      return await invokeBackend('ssh.appendRemoteUploadChunk', payload);
    },
    async finishRemoteUpload(payload) {
      return await invokeBackend('ssh.finishRemoteUpload', payload);
    },
    async cancelRemoteUpload(payload) {
      return await invokeBackend('ssh.cancelRemoteUpload', payload);
    },
    async createRemoteDirectory(payload) {
      return await invokeBackend('ssh.createRemoteDirectory', payload);
    },
    async renameRemoteEntry(payload) {
      return await invokeBackend('ssh.renameRemoteEntry', payload);
    },
    async deleteRemoteEntry(payload) {
      return await invokeBackend('ssh.deleteRemoteEntry', payload);
    },
    async getLatency() {
      return await invokeBackend('ssh.getLatency');
    },
    async getSystemMetrics() {
      return await invokeBackend('ssh.getSystemMetrics');
    },
    async getLiveMetrics() {
      return await invokeBackend('ssh.getLiveMetrics');
    },
    async getRemoteApps() {
      return await invokeBackend('ssh.getRemoteApps');
    },
    input(data: string) {
      void invokeBackend('ssh.input', data);
    },
    resize(size) {
      void invokeBackend('ssh.resize', size);
    },
    onData(listener) {
      return subscribe(sshDataListeners, listener);
    },
    onStatus(listener) {
      return subscribe(sshStatusListeners, listener);
    },
    onLogData(listener) {
      return subscribe(sshLogDataListeners, listener);
    },
    onLogStatus(listener) {
      return subscribe(sshLogStatusListeners, listener);
    },
    onRemoteFileSyncRequest(listener) {
      return subscribe(remoteFileSyncRequestListeners, listener);
    }
  }
};

window.electron = getDesktopRuntimeInfo();
window.api = api;

void invokeCommand<string>('app_get_locale')
  .then((locale) => {
    window.localStorage.setItem(LOCALE_KEY, locale || defaultLocale);
    return invokeBackend<SshStatusPayload>('ssh.getStatusSnapshot');
  })
  .then((snapshot) => {
    if (snapshot) {
      sshStatusSnapshot = snapshot;
    }
  })
  .catch(() => {
    if (!window.localStorage.getItem(LOCALE_KEY)) {
      window.localStorage.setItem(LOCALE_KEY, defaultLocale);
    }
  });
