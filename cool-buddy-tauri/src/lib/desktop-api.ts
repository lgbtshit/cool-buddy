import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { defaultLocale, type Locale } from '../shared/locale';
import { fetchProviderModels } from './provider-models';

type SessionAuthMethod = 'password' | 'systemKey';
type SshStatusPayload = Awaited<ReturnType<Window['api']['ssh']['getStatusSnapshot']>>;
type SshLogStatusPayload = Parameters<Parameters<Window['api']['ssh']['onLogStatus']>[0]>[0];
type SshLogDataPayload = Parameters<Parameters<Window['api']['ssh']['onLogData']>[0]>[0];
type AgentModelOption = Awaited<
  ReturnType<Window['api']['agentSettings']['listModels']>
>[number];
type AgentStateSnapshot = Awaited<ReturnType<Window['api']['harmlessAgent']['getState']>>;
type AgentWhitelistItem = Awaited<
  ReturnType<Window['api']['harmlessAgent']['listWhitelist']>
>[number];
type RemoteDirectory = Awaited<ReturnType<Window['api']['ssh']['listRemote']>>;
type RemotePathCompletionPayload = Parameters<Window['api']['ssh']['completeRemotePath']>[0];
type RemotePathCompletionResult = Awaited<ReturnType<Window['api']['ssh']['completeRemotePath']>>;

const LOCALE_KEY = 'cool-buddy-tauri:locale';
const sshStatusListeners = new Set<(payload: SshStatusPayload) => void>();
const sshDataListeners = new Set<(data: string) => void>();
const sshLogDataListeners = new Set<(payload: SshLogDataPayload) => void>();
const sshLogStatusListeners = new Set<(payload: SshLogStatusPayload) => void>();
const agentEventListeners = new Set<
  (
    event: Parameters<Window['api']['harmlessAgent']['onEvent']>[0] extends (e: infer E) => void
      ? E
      : never
  ) => void
>();

let sshStatusSnapshot: SshStatusPayload = {
  status: 'disconnected',
  message: 'Tauri backend scaffold is ready. SSH runtime is pending migration.'
};

function subscribe<T>(listeners: Set<(payload: T) => void>, listener: (payload: T) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notReady(feature: string): Error {
  return new Error(`${feature} is not migrated yet in cool-buddy-tauri.`);
}

function emitStatus(payload: SshStatusPayload): void {
  sshStatusSnapshot = payload;
  for (const listener of sshStatusListeners) {
    listener(payload);
  }
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

const api: Window['api'] = {
  app: {
    async setLocale(locale: Locale) {
      window.localStorage.setItem(LOCALE_KEY, locale);
      await invokeCommand<{ ok: true }>('app_set_locale', { locale });
      return { ok: true };
    }
  },
  sessions: {
    list: () => invokeCommand('sessions_list'),
    create: (payload) => invokeCommand('sessions_create', { payload }),
    delete: (sessionId: string) => invokeCommand('sessions_delete', { sessionId })
  },
  agentSettings: {
    getProvider: () => invokeCommand('agent_settings_get_provider'),
    listModels: (payload) => fetchProviderModels(payload) as Promise<AgentModelOption[]>,
    saveProvider: (payload) => invokeCommand('agent_settings_save_provider', { payload })
  },
  harmlessAgent: {
    getState: (sessionId: string) => invokeCommand<AgentStateSnapshot>('harmless_agent_get_state', { sessionId }),
    run: (payload) => invokeCommand<AgentStateSnapshot>('harmless_agent_run', { payload }),
    resolveApproval: (payload) =>
      invokeCommand<AgentStateSnapshot>('harmless_agent_resolve_approval', { payload }),
    listWhitelist: () => invokeCommand<AgentWhitelistItem[]>('harmless_agent_list_whitelist'),
    createWhitelistItem: (payload) =>
      invokeCommand<AgentWhitelistItem>('harmless_agent_create_whitelist_item', { payload }),
    deleteWhitelistItem: (id: string) =>
      invokeCommand<AgentWhitelistItem[]>('harmless_agent_delete_whitelist_item', { id }),
    onEvent(listener) {
      return subscribe(agentEventListeners, listener);
    }
  },
  ssh: {
    async connect(payload) {
      emitStatus({
        status: 'error',
        message: `SSH migration for ${payload.host}:${payload.port} is not implemented yet.`
      });
      throw notReady('SSH connect');
    },
    async getAuthCapabilities() {
      return {
        hasAgent: false,
        detectedDefaultKeyPaths: [],
        defaultKeyCandidates: [],
        recommendedAuthMethod: 'password' as SessionAuthMethod
      };
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
    async executeCommandBatch() {
      throw notReady('SSH command batch');
    },
    async startLogTail(payload) {
      for (const listener of sshLogStatusListeners) {
        listener({
          streamId: payload.streamId,
          status: 'error',
          path: payload.path,
          message: 'Tauri log tail runtime is pending migration.'
        });
      }
      throw notReady('SSH log tail');
    },
    async stopLogTail(streamId) {
      for (const listener of sshLogStatusListeners) {
        listener({
          streamId,
          status: 'idle',
          path: '',
          message: 'Log stream stopped.'
        });
      }
      return { ok: true };
    },
    async getStatusSnapshot() {
      return sshStatusSnapshot;
    },
    async disconnect() {
      emitStatus({
        status: 'disconnected',
        message: 'Disconnected.'
      });
      return { ok: true };
    },
    async listRemote(payload) {
      return {
        path: payload?.path ?? '.',
        entries: []
      } satisfies RemoteDirectory;
    },
    async completeRemotePath(payload: RemotePathCompletionPayload) {
      return {
        value: payload.input,
        matches: []
      } satisfies RemotePathCompletionResult;
    },
    async readRemoteFile(payload) {
      throw new Error(`Remote preview is not available yet for ${payload.path}.`);
    },
    async openRemoteFile(payload) {
      await openPath(payload.path);
      return {
        path: payload.path,
        localPath: payload.path
      };
    },
    async writeRemoteTextFile(payload) {
      throw new Error(`Remote write is not available yet for ${payload.path}.`);
    },
    async uploadRemoteFile(payload) {
      throw new Error(`Remote upload is not available yet for ${payload.directory}/${payload.name}.`);
    },
    async createRemoteDirectory(payload) {
      throw new Error(`Remote mkdir is not available yet for ${payload.path}.`);
    },
    async renameRemoteEntry(payload) {
      throw new Error(`Remote rename is not available yet for ${payload.oldPath}.`);
    },
    async deleteRemoteEntry(payload) {
      throw new Error(`Remote delete is not available yet for ${payload.path}.`);
    },
    async getLatency() {
      return null;
    },
    async getSystemMetrics() {
      return null;
    },
    async getLiveMetrics() {
      return null;
    },
    async getRemoteApps() {
      return [];
    },
    input(data: string) {
      for (const listener of sshDataListeners) {
        listener(data);
      }
    },
    resize() {},
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
    }
  }
};

window.electron = getDesktopRuntimeInfo();
window.api = api;

void invokeCommand<string>('app_get_locale')
  .then((locale) => {
    window.localStorage.setItem(LOCALE_KEY, locale || defaultLocale);
  })
  .catch(() => {
    if (!window.localStorage.getItem(LOCALE_KEY)) {
      window.localStorage.setItem(LOCALE_KEY, defaultLocale);
    }
  });
