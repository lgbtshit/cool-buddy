import { computed, nextTick, ref } from 'vue';
import { defineStore } from 'pinia';
import { messages, type MessageKey } from '../i18n';
import { httpClient } from '../lib/http-client';
import { fallbackLocale, resolveLocale } from '../../../shared/locale';
import type {
  AgentApprovalRequest,
  AgentModelOption,
  AgentProviderCode,
  AgentProviderOption,
  AgentProviderSettings,
  AgentRuntimeEvent,
  AgentStateSnapshot,
  AgentThreadMessage,
  ConnectionForm,
  ConnectionState,
  LiveSystemMetrics,
  LogTailStream,
  LogTailState,
  Locale,
  RemoteApp,
  RemoteDirectory,
  RemoteEntry,
  SessionDraft,
  SessionAuthMethod,
  SessionGroup,
  SessionItem,
  SessionModalMode,
  SshAuthCapabilities,
  SshKeySource,
  SystemMetrics,
  TabMenuState
} from '../types/ssh-console';

type RemoteUploadItem = {
  file: File;
  relativePath?: string;
};

type RemoteDropPayload = {
  directories: string[];
  files: Array<File | RemoteUploadItem>;
};

type RemoteUploadBatchStatus = 'idle' | 'uploading' | 'success' | 'error' | 'canceled';

type RemoteUploadBatch = {
  id: number;
  status: RemoteUploadBatchStatus;
  totalFiles: number;
  completedFiles: number;
  totalBytes: number;
  completedBytes: number;
  currentFileName: string;
  error: string;
  startedAt: number;
};

type RemoteDeleteBatchStatus = 'deleting' | 'success' | 'error' | 'canceled';

type RemoteDeleteBatch = {
  id: number;
  status: RemoteDeleteBatchStatus;
  totalEntries: number;
  completedEntries: number;
  currentPath: string;
  error: string;
  startedAt: number;
};

const TAB_STORAGE_KEY = 'cool-buddy:open-tabs';
const LOCALE_STORAGE_KEY = 'cool-buddy:locale';
const AGENT_PROVIDER_DRAFTS_STORAGE_KEY = 'cool-buddy:agent-provider-drafts';
const LIVE_METRICS_REFRESH_INTERVAL_MS = 2000;
const FULL_METRICS_REFRESH_INTERVAL_MS = 15000;
const LATENCY_REFRESH_INTERVAL_MS = 5000;
const REMOTE_UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024;
const REMOTE_UPLOAD_CONCURRENCY = 6;
const REMOTE_UPLOAD_WRITE_PIPELINE = 4;
const REMOTE_UPLOAD_PROGRESS_INTERVAL_MS = 100;
const REMOTE_DELETE_CONCURRENCY = 8;

const AGENT_PROVIDER_PRESETS: AgentProviderOption[] = [
  {
    code: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    description: 'OpenAI API, suitable for GPT and compatible agent access.'
  },
  {
    code: 'azure-openai',
    name: 'Azure OpenAI',
    baseUrl: 'https://{resource-name}.openai.azure.com/openai',
    description: 'Azure-hosted OpenAI endpoint.'
  },
  {
    code: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    description: 'Claude and Anthropic-hosted models.'
  },
  {
    code: 'google-gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    description: 'Google Gemini API endpoint.'
  },
  {
    code: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    description: 'DeepSeek official endpoint.'
  },
  {
    code: 'qwen',
    name: 'Qwen / DashScope',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    description: 'Alibaba Cloud DashScope compatible endpoint.'
  },
  {
    code: 'zhipu',
    name: 'Zhipu GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    description: 'Zhipu BigModel GLM endpoint.'
  },
  {
    code: 'moonshot',
    name: 'Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    description: 'Moonshot / Kimi compatible endpoint.'
  },
  {
    code: 'baidu-qianfan',
    name: 'Baidu Qianfan',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    description: 'Baidu Qianfan model service.'
  },
  {
    code: 'siliconflow',
    name: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    description: 'SiliconFlow OpenAI-compatible endpoint.'
  },
  {
    code: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    description: 'Groq OpenAI-compatible endpoint.'
  },
  {
    code: 'mistral',
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    description: 'Mistral API endpoint.'
  },
  {
    code: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    description: 'Unified routing across multiple providers.'
  },
  {
    code: 'ollama',
    name: 'Ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    description: 'Local Ollama OpenAI-compatible endpoint.'
  },
  {
    code: 'lm-studio',
    name: 'LM Studio',
    baseUrl: 'http://127.0.0.1:1234/v1',
    description: 'Local LM Studio OpenAI-compatible endpoint.'
  },
  {
    code: 'xai',
    name: 'xAI',
    baseUrl: 'https://api.x.ai/v1',
    description: 'xAI official endpoint.'
  },
  {
    code: 'perplexity',
    name: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    description: 'Perplexity API endpoint.'
  },
  {
    code: 'fireworks',
    name: 'Fireworks',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    description: 'Fireworks inference endpoint.'
  },
  {
    code: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    description: 'Together AI compatible endpoint.'
  },
  {
    code: 'volcengine-ark',
    name: 'Volcengine Ark',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    description: 'Volcengine Ark service endpoint.'
  },
  {
    code: 'tencent-hunyuan',
    name: 'Tencent Hunyuan',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    description: 'Tencent Hunyuan API endpoint.'
  },
  {
    code: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    description: 'MiniMax official endpoint.'
  },
  {
    code: '302ai',
    name: '302.AI',
    baseUrl: 'https://api.302.ai/v1',
    description: '302.AI OpenAI-compatible endpoint.'
  },
  {
    code: 'custom',
    name: 'Custom',
    baseUrl: '',
    description: 'Any custom or OpenAI-compatible endpoint.'
  }
];

const DEFAULT_MODEL_BY_PROVIDER: Record<AgentProviderCode, string> = {
  openai: 'gpt-4.1-mini',
  'azure-openai': 'gpt-4.1-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  'google-gemini': 'gemini-2.5-flash',
  deepseek: 'deepseek-chat',
  qwen: 'qwen-plus',
  zhipu: 'glm-4.7',
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

function getDefaultAgentModelName(providerCode: AgentProviderCode): string {
  return DEFAULT_MODEL_BY_PROVIDER[providerCode] ?? DEFAULT_MODEL_BY_PROVIDER.custom;
}

/**
 * Function: createDefaultSshAuthCapabilities
 * Purpose:
 *   Creates the initial local SSH capability snapshot used before the main
 *   process reports whether a system agent or default private keys are
 *   available.
 * Parameters:
 *   None.
 * Returns:
 *   A conservative capability object that defaults new sessions to password
 *   authentication until real capability data is loaded.
 * Example:
 *   Initial state -> no agent, no detected keys, recommended auth is
 *   "password".
 */
function createDefaultSshAuthCapabilities(): SshAuthCapabilities {
  return {
    hasAgent: false,
    detectedDefaultKeyPaths: [],
    defaultKeyCandidates: [],
    recommendedAuthMethod: 'password'
  };
}

/**
 * Function: createDefaultForm
 * Purpose:
 *   Creates the default live connection form used by the active SSH session.
 * Parameters:
 *   authMethod:
 *     The preferred authentication method to preselect for the form.
 *   keySource:
 *     The preferred SSH key source to preselect when key authentication is in
 *     use.
 * Returns:
 *   A new connection form object with empty credentials and the provided auth
 *   defaults.
 * Example:
 *   `createDefaultForm('systemKey', 'default')` creates a blank form that will
 *   try the local SSH agent and default `~/.ssh` keys before asking for a
 *   custom key path.
 */
function createDefaultForm(
  authMethod: SessionAuthMethod = 'password',
  keySource: SshKeySource = 'default'
): ConnectionForm {
  return {
    host: '',
    port: 22,
    username: '',
    password: '',
    authMethod,
    keySource,
    privateKeyPath: '',
    passphrase: ''
  };
}

/**
 * Function: createDefaultSessionDraft
 * Purpose:
 *   Creates the default session draft used by the "new session" modal,
 *   including the preferred authentication defaults inferred from local SSH
 *   capabilities.
 * Parameters:
 *   authMethod:
 *     The preferred authentication method to preselect for the new session.
 *   keySource:
 *     The preferred SSH key source to preselect when key authentication is in
 *     use.
 * Returns:
 *   A fresh session draft object with empty connection details and the provided
 *   auth defaults.
 * Example:
 *   `createDefaultSessionDraft('systemKey', 'default')` yields a new draft that
 *   assumes the user wants to reuse local SSH keys.
 */
function createDefaultSessionDraft(
  authMethod: SessionAuthMethod = 'password',
  keySource: SshKeySource = 'default'
): SessionDraft {
  return {
    name: '',
    group: 'production',
    host: '',
    port: 22,
    username: '',
    password: '',
    authMethod,
    keySource,
    privateKeyPath: '',
    passphrase: ''
  };
}

function createLogTailStreamId(): string {
  return `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createLogTailStream(path = ''): LogTailStream {
  return {
    id: createLogTailStreamId(),
    path,
    lines: [],
    state: 'idle',
    error: '',
    statusMessage: ''
  };
}

function createDefaultAgentProviderSettings(): AgentProviderSettings {
  const preset = AGENT_PROVIDER_PRESETS[0];
  return {
    providerCode: preset.code,
    providerName: preset.name,
    baseUrl: preset.baseUrl,
    apiKey: '',
    modelName: getDefaultAgentModelName(preset.code),
    updatedAt: null
  };
}

function createAgentProviderSettingsFromPreset(
  providerCode: AgentProviderCode,
  overrides?: Partial<AgentProviderSettings>
): AgentProviderSettings {
  const preset = getAgentProviderPreset(providerCode);
  const nextSettings: AgentProviderSettings = {
    providerCode: preset.code,
    providerName: preset.name,
    baseUrl: preset.baseUrl,
    apiKey: '',
    modelName: getDefaultAgentModelName(preset.code),
    updatedAt: null
  };

  return {
    ...nextSettings,
    ...overrides,
    providerCode: preset.code,
    providerName: preset.name
  };
}

function createDefaultAgentStateSnapshot(): AgentStateSnapshot {
  return {
    messages: [],
    pendingApproval: null,
    running: false,
    phase: 'idle',
    configured: false,
    lastError: ''
  };
}

function getAgentProviderPreset(code: AgentProviderCode): AgentProviderOption {
  return AGENT_PROVIDER_PRESETS.find((item) => item.code === code) ?? AGENT_PROVIDER_PRESETS[0];
}

function sortRemoteEntries(entries: RemoteEntry[]): RemoteEntry[] {
  return [...entries].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'directory' ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

function getInitialLocale(): Locale {
  const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (storedLocale) {
    return resolveLocale(storedLocale);
  }

  const browserLocale = navigator.languages?.[0] ?? navigator.language;
  return resolveLocale(browserLocale);
}

function formatMessage(template: string, params?: Record<string, string | number>): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

type AgentProviderDraftMap = Partial<Record<AgentProviderCode, AgentProviderSettings>>;

function getStoredAgentProviderDrafts(): AgentProviderDraftMap {
  try {
    const raw = window.localStorage.getItem(AGENT_PROVIDER_DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as AgentProviderDraftMap;
  } catch {
    return {};
  }
}

export const useSshConsoleStore = defineStore('ssh-console', () => {
  const initialLocale = getInitialLocale();
  const locale = ref<Locale>(initialLocale);
  const sessions = ref<SessionItem[]>([]);
  const openTabIds = ref<string[]>([]);
  const activeSessionId = ref('');
  const searchQuery = ref('');
  const status = ref<ConnectionState>('idle');
  const statusMessage = ref<string>(messages[initialLocale].ready);
  const latencyMs = ref<number | null>(null);
  const aiInput = ref('');
  const agentRuntime = ref<AgentStateSnapshot>(createDefaultAgentStateSnapshot());
  const agentModelOptions = ref<AgentModelOption[]>([]);
  const agentModelsLoading = ref(false);
  const agentSettingsOpen = ref(false);
  const agentSettingsLoading = ref(false);
  const agentSettingsSaving = ref(false);
  const agentSettingsLoaded = ref(false);
  const agentSettingsError = ref('');
  const agentSettings = ref<AgentProviderSettings>(createDefaultAgentProviderSettings());
  const agentProviderDrafts = ref<AgentProviderDraftMap>(getStoredAgentProviderDrafts());
  const agentModelOptionsByProvider = ref<Partial<Record<AgentProviderCode, AgentModelOption[]>>>(
    {}
  );
  const sessionsLoaded = ref(false);
  const sessionModalOpen = ref(false);
  const sessionModalMode = ref<SessionModalMode>('create');
  const editingSessionId = ref('');
  const tabMenu = ref<TabMenuState | null>(null);
  const remoteDirectory = ref<RemoteDirectory | null>(null);
  const remoteApps = ref<RemoteApp[]>([]);
  const remotePreview = ref<{ path: string; content: string } | null>(null);
  const systemMetrics = ref<SystemMetrics | null>(null);
  const showHiddenFiles = ref(false);
  const explorerLoading = ref(false);
  const explorerBusy = ref(false);
  const explorerError = ref('');
  const remoteUploadBatch = ref<RemoteUploadBatch | null>(null);
  const remoteDeleteBatch = ref<RemoteDeleteBatch | null>(null);
  const remoteAppsLoading = ref(false);
  const remoteAppsError = ref('');
  const metricsLoading = ref(false);
  const logTailLineLimit = ref(50);
  const logTailStreams = ref<LogTailStream[]>([createLogTailStream()]);
  const logTailRemainders = new Map<string, string>();
  let liveMetricsRefreshTimer: number | null = null;
  let fullMetricsRefreshTimer: number | null = null;
  let latencyRefreshTimer: number | null = null;
  let metricsRequestPending = false;
  let liveMetricsRequestPending = false;
  let latencyRequestPending = false;
  let uploadBatchId = 0;
  let uploadBatchHideTimer: number | null = null;
  let deleteBatchId = 0;
  let deleteBatchHideTimer: number | null = null;
  const canceledUploadBatchIds = new Set<number>();
  const failedUploadBatchIds = new Set<number>();
  const canceledDeleteBatchIds = new Set<number>();
  const sshAuthCapabilities = ref<SshAuthCapabilities>(createDefaultSshAuthCapabilities());
  const form = ref<ConnectionForm>(createDefaultForm());
  const sessionDraft = ref<SessionDraft>(createDefaultSessionDraft());

  const t = (key: MessageKey, params?: Record<string, string | number>): string =>
    formatMessage(messages[locale.value][key] ?? messages[fallbackLocale][key], params);

  const filteredSessions = computed(() => {
    const query = searchQuery.value.trim().toLowerCase();
    if (!query) return sessions.value;
    return sessions.value.filter((item) => item.name.toLowerCase().includes(query));
  });

  const sessionGroups = computed(() => [
    { key: 'production' as SessionGroup, label: t('production') },
    { key: 'staging' as SessionGroup, label: t('staging') },
    { key: 'local' as SessionGroup, label: t('local') }
  ]);

  const agentProviderOptions = computed(() => AGENT_PROVIDER_PRESETS);

  const activeSession = computed(() => {
    return sessions.value.find((item) => item.id === activeSessionId.value) ?? null;
  });

  const openTabs = computed(() => {
    const sessionMap = new Map(sessions.value.map((item) => [item.id, item]));
    return openTabIds.value
      .map((id) => sessionMap.get(id))
      .filter((item): item is SessionItem => Boolean(item));
  });

  const latencyLabel = computed(() => {
    return `${t('latency')}: ${latencyMs.value === null ? '--' : `${latencyMs.value}ms`}`;
  });

  const connectionLabel = computed(() => {
    if (status.value === 'connected') return t('sessionConnected');
    if (status.value === 'connecting') return t('sessionConnecting');
    if (status.value === 'error') return t('sessionError');
    return t('sessionDisconnected');
  });

  const canSaveSession = computed(() => {
    return Boolean(
      sessionDraft.value.name.trim() &&
      sessionDraft.value.host.trim() &&
      sessionDraft.value.username.trim() &&
      sessionDraft.value.port &&
      (sessionDraft.value.authMethod !== 'password' || sessionDraft.value.password !== '') &&
      (sessionDraft.value.keySource !== 'custom' || sessionDraft.value.privateKeyPath.trim())
    );
  });

  const canSaveAgentSettings = computed(() => {
    return Boolean(
      agentSettings.value.providerName.trim() &&
      agentSettings.value.baseUrl.trim() &&
      agentSettings.value.modelName.trim()
    );
  });

  const hasAgentProviderConfigured = computed(() => {
    return agentRuntime.value.configured;
  });

  const agentMessages = computed<AgentThreadMessage[]>(() => agentRuntime.value.messages);
  const pendingAgentApproval = computed<AgentApprovalRequest | null>(
    () => agentRuntime.value.pendingApproval
  );

  const isConnected = computed(() => status.value === 'connected');

  function ensureLogTailStream(streamId: string): LogTailStream | null {
    return logTailStreams.value.find((item) => item.id === streamId) ?? null;
  }

  function ensureAtLeastOneLogTailStream() {
    if (logTailStreams.value.length > 0) {
      return;
    }

    logTailStreams.value = [createLogTailStream()];
  }

  function resetLogTailStream(streamId: string, options?: { clearPath?: boolean }) {
    const stream = ensureLogTailStream(streamId);
    if (!stream) {
      return;
    }

    stream.lines = [];
    stream.state = 'idle';
    stream.error = '';
    stream.statusMessage = '';
    logTailRemainders.delete(streamId);

    if (options?.clearPath) {
      stream.path = '';
    }
  }

  function resetLogTails(options?: { clearPath?: boolean }) {
    for (const stream of logTailStreams.value) {
      resetLogTailStream(stream.id, options);
    }
  }

  function applyLocale() {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale.value);
    httpClient.defaults.headers.common['Accept-Language'] = locale.value;
    void window.api.app.setLocale(locale.value);

    statusMessage.value =
      status.value === 'connected' && activeSession.value
        ? `${t('connected')} ${activeSession.value.host}:${activeSession.value.port}`
        : status.value === 'connecting'
          ? `${t('sessionConnecting')} ${form.value.host}:${form.value.port}...`
          : status.value === 'error'
            ? statusMessage.value
            : t('ready');
  }

  function persistOpenTabs() {
    window.localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(openTabIds.value));
  }

  function persistAgentProviderDrafts() {
    window.localStorage.setItem(
      AGENT_PROVIDER_DRAFTS_STORAGE_KEY,
      JSON.stringify(agentProviderDrafts.value)
    );
  }

  /**
   * Function: syncSessionDraftAuthDefaults
   * Purpose:
   *   Aligns the new-session draft with the locally recommended SSH
   *   authentication defaults so the modal can open in the most likely usable
   *   mode for the current machine.
   * Parameters:
   *   None.
   * Returns:
   *   None. Mutates `sessionDraft.value` in-place.
   * Example:
   *   If a local SSH agent is available, the draft switches to
   *   `authMethod: 'systemKey'` and `keySource: 'default'`.
   */
  function syncSessionDraftAuthDefaults() {
    const preferredAuthMethod = sshAuthCapabilities.value.recommendedAuthMethod;
    sessionDraft.value.authMethod = preferredAuthMethod;
    sessionDraft.value.keySource = 'default';
  }

  /**
   * Function: loadSshAuthCapabilities
   * Purpose:
   *   Loads the current machine's SSH authentication capabilities from the main
   *   process so the UI can recommend password auth or local key auth
   *   intelligently.
   * Parameters:
   *   None.
   * Returns:
   *   A promise that resolves after `sshAuthCapabilities` has been refreshed.
   * Example:
   *   When a running SSH agent and `~/.ssh/id_ed25519` are detected, the store
   *   records both and later opens the session modal in system-key mode.
   */
  async function loadSshAuthCapabilities() {
    sshAuthCapabilities.value = await window.api.ssh.getAuthCapabilities();
  }

  function cacheAgentProviderDraft(settings: AgentProviderSettings) {
    agentProviderDrafts.value = {
      ...agentProviderDrafts.value,
      [settings.providerCode]: {
        ...settings
      }
    };
    persistAgentProviderDrafts();
  }

  function applyAgentSettingsSnapshot(settings: AgentProviderSettings) {
    agentSettings.value = settings;
    agentModelOptions.value = agentModelOptionsByProvider.value[settings.providerCode] ?? [];
  }

  function ensureTabOpen(sessionId: string) {
    if (openTabIds.value.includes(sessionId)) return;
    openTabIds.value = [...openTabIds.value, sessionId];
    persistOpenTabs();
  }

  function closeTabMenu() {
    tabMenu.value = null;
  }

  function resetActiveSession() {
    activeSessionId.value = '';
    form.value = createDefaultForm(sshAuthCapabilities.value.recommendedAuthMethod, 'default');
    agentRuntime.value = createDefaultAgentStateSnapshot();
    status.value = 'idle';
    statusMessage.value = t('ready');
  }

  /**
   * Function: selectSession
   * Purpose:
   *   Makes a saved session active, mirrors its connection details into the
   *   live connection form, and optionally ensures the session is visible as an
   *   open tab.
   * Parameters:
   *   session:
   *     The saved session to activate.
   *   options:
   *     Optional tab behavior override. When `openTab` is false, the function
   *     only updates the active session state.
   * Returns:
   *   None. Mutates the active session and form state in-place.
   * Example:
   *   Selecting a session saved with `authMethod: 'systemKey'` restores its key
   *   mode, key source, custom private key path, and passphrase into the form.
   */
  function selectSession(session: SessionItem, options?: { openTab?: boolean }) {
    activeSessionId.value = session.id;
    form.value = {
      host: session.host,
      port: session.port,
      username: session.username,
      password: session.password,
      authMethod: session.authMethod,
      keySource: session.keySource,
      privateKeyPath: session.privateKeyPath,
      passphrase: session.passphrase
    };

    if (options?.openTab !== false) {
      ensureTabOpen(session.id);
    }

    void loadHarmlessAgentState();
  }

  function openTabMenuAt(payload: TabMenuState) {
    tabMenu.value = payload;
  }

  async function removeTab(sessionId: string) {
    const isClosingActiveTab = sessionId === activeSessionId.value;
    const remainingTabIds = openTabIds.value.filter((id) => id !== sessionId);

    closeTabMenu();

    if (isClosingActiveTab && status.value !== 'idle' && status.value !== 'disconnected') {
      await disconnect();
    }

    openTabIds.value = remainingTabIds;
    persistOpenTabs();

    if (!isClosingActiveTab) {
      return;
    }

    const nextSession =
      openTabs.value.find((item) => item.id === remainingTabIds[0]) ??
      sessions.value.find((item) => item.id === remainingTabIds[0]) ??
      null;

    if (nextSession) {
      await connectToSession(nextSession);
      return;
    }

    resetActiveSession();
  }

  async function removeOtherTabs(sessionId: string) {
    const remainingTabIds = openTabIds.value.filter((id) => id === sessionId);
    const isClosingActiveTab =
      activeSessionId.value !== sessionId && openTabIds.value.includes(activeSessionId.value);

    closeTabMenu();

    if (isClosingActiveTab && status.value !== 'idle' && status.value !== 'disconnected') {
      await disconnect();
    }

    openTabIds.value = remainingTabIds;
    persistOpenTabs();

    const nextSession =
      openTabs.value.find((item) => item.id === sessionId) ??
      sessions.value.find((item) => item.id === sessionId) ??
      null;

    if (nextSession) {
      await connectToSession(nextSession);
      return;
    }

    resetActiveSession();
  }

  async function removeAllTabs() {
    const hadConnectedSession = status.value !== 'idle' && status.value !== 'disconnected';

    closeTabMenu();

    if (hadConnectedSession) {
      await disconnect();
    }

    openTabIds.value = [];
    persistOpenTabs();
    resetActiveSession();
  }

  /**
   * 重置会话表单草稿，并清空当前编辑状态。
   * @param keepMode 是否保留当前弹窗模式
   * @return void 无返回
   */
  function resetSessionDraft(keepMode = false) {
    sessionDraft.value = createDefaultSessionDraft(
      sshAuthCapabilities.value.recommendedAuthMethod,
      'default'
    );
    editingSessionId.value = '';
    if (!keepMode) {
      sessionModalMode.value = 'create';
    }
  }

  /**
   * 将指定会话内容回填到会话表单草稿中。
   * @param session 需要编辑的目标会话
   * @return void 无返回
   */
  function applySessionToDraft(session: SessionItem) {
    sessionDraft.value = {
      name: session.name,
      group: session.group,
      host: session.host,
      port: session.port,
      username: session.username,
      password: session.password,
      authMethod: session.authMethod,
      keySource: session.keySource,
      privateKeyPath: session.privateKeyPath,
      passphrase: session.passphrase
    };
  }

  /**
   * Function: setSessionDraftAuthMethod
   * Purpose:
   *   Updates the new-session draft authentication method and normalizes
   *   related fields so hidden credential inputs do not accidentally leak into
   *   a different auth mode.
   * Parameters:
   *   authMethod:
   *     The authentication method chosen in the session modal.
   * Returns:
   *   None. Mutates `sessionDraft.value` in-place.
   * Example:
   *   Switching from `password` to `systemKey` clears the password field and
   *   defaults the key source back to `default`.
   */
  function setSessionDraftAuthMethod(authMethod: SessionAuthMethod) {
    sessionDraft.value.authMethod = authMethod;

    if (authMethod === 'password') {
      sessionDraft.value.keySource = 'default';
      sessionDraft.value.privateKeyPath = '';
      sessionDraft.value.passphrase = '';
      return;
    }

    sessionDraft.value.password = '';
    sessionDraft.value.keySource = 'default';
  }

  /**
   * Function: setSessionDraftKeySource
   * Purpose:
   *   Updates the SSH key source for the new-session draft and clears any stale
   *   custom key metadata when the user returns to the default system-key
   *   strategy.
   * Parameters:
   *   keySource:
   *     The selected SSH key source.
   * Returns:
   *   None. Mutates `sessionDraft.value` in-place.
   * Example:
   *   Switching from `custom` back to `default` clears the custom private key
   *   path and passphrase fields.
   */
  function setSessionDraftKeySource(keySource: SshKeySource) {
    sessionDraft.value.keySource = keySource;

    if (keySource === 'default') {
      sessionDraft.value.privateKeyPath = '';
      sessionDraft.value.passphrase = '';
    }
  }

  /**
   * Function: chooseSessionDraftPrivateKey
   * Purpose:
   *   Opens the native private-key picker and copies the chosen path into the
   *   new-session draft when the user opts into a custom SSH key file.
   * Parameters:
   *   None.
   * Returns:
   *   A promise that resolves after the picker result has been applied.
   * Example:
   *   After the user chooses `C:\Users\<user>\.ssh\work-key`, the draft stores
   *   that path in `privateKeyPath`.
   */
  async function chooseSessionDraftPrivateKey() {
    const result = await window.api.ssh.pickPrivateKey();
    if (!result.canceled && result.path) {
      sessionDraft.value.privateKeyPath = result.path;
    }
  }

  function applyAgentProviderCode(providerCode: AgentProviderCode) {
    cacheAgentProviderDraft(agentSettings.value);

    const nextSettings =
      agentProviderDrafts.value[providerCode] ??
      createAgentProviderSettingsFromPreset(providerCode);

    applyAgentSettingsSnapshot(nextSettings);
  }

  async function loadAgentSettings(options?: { force?: boolean }) {
    if (agentSettingsLoading.value || (agentSettingsLoaded.value && !options?.force)) {
      return;
    }

    agentSettingsLoading.value = true;
    agentSettingsError.value = '';

    try {
      const loadedSettings = await window.api.agentSettings.getProvider();
      cacheAgentProviderDraft(loadedSettings);

      const preferredSettings =
        agentProviderDrafts.value[loadedSettings.providerCode] ?? loadedSettings;

      applyAgentSettingsSnapshot(preferredSettings);
      agentSettingsLoaded.value = true;
      await loadHarmlessAgentState();
    } catch (error) {
      agentSettingsError.value =
        error instanceof Error ? error.message : 'Failed to load agent settings.';
    } finally {
      agentSettingsLoading.value = false;
    }
  }

  async function openAgentSettingsModal() {
    agentSettingsOpen.value = true;
    await loadAgentSettings();
  }

  function closeAgentSettingsModal() {
    cacheAgentProviderDraft(agentSettings.value);
    agentSettingsOpen.value = false;
    agentSettingsError.value = '';
  }

  function updateAgentBaseUrl(value: string) {
    const nextSettings = {
      ...agentSettings.value,
      baseUrl: value
    };
    agentSettings.value = nextSettings;
    cacheAgentProviderDraft(nextSettings);
  }

  function updateAgentApiKey(value: string) {
    const nextSettings = {
      ...agentSettings.value,
      apiKey: value
    };
    agentSettings.value = nextSettings;
    cacheAgentProviderDraft(nextSettings);
  }

  function updateAgentModelName(value: string) {
    const nextSettings = {
      ...agentSettings.value,
      modelName: value
    };
    agentSettings.value = nextSettings;
    cacheAgentProviderDraft(nextSettings);
  }

  async function loadProviderModels() {
    if (agentModelsLoading.value) {
      return agentModelOptions.value;
    }

    agentModelsLoading.value = true;
    agentSettingsError.value = '';

    try {
      const models = await window.api.agentSettings.listModels({
        providerCode: agentSettings.value.providerCode,
        providerName: agentSettings.value.providerName,
        baseUrl: agentSettings.value.baseUrl.trim(),
        apiKey: agentSettings.value.apiKey.trim()
      });
      agentModelOptionsByProvider.value = {
        ...agentModelOptionsByProvider.value,
        [agentSettings.value.providerCode]: models
      };
      agentModelOptions.value = models;
      if (
        models.length > 0 &&
        !models.some((item) => item.id === agentSettings.value.modelName.trim())
      ) {
        const nextSettings = {
          ...agentSettings.value,
          modelName: models[0].id
        };
        agentSettings.value = nextSettings;
        cacheAgentProviderDraft(nextSettings);
      }
      return models;
    } catch (error) {
      agentSettingsError.value =
        error instanceof Error ? error.message : 'Failed to load provider models.';
      return [];
    } finally {
      agentModelsLoading.value = false;
    }
  }

  async function loadHarmlessAgentState() {
    if (!activeSessionId.value) {
      agentRuntime.value = createDefaultAgentStateSnapshot();
      return agentRuntime.value;
    }

    agentRuntime.value = await window.api.harmlessAgent.getState(activeSessionId.value);
    return agentRuntime.value;
  }

  async function saveAgentSettings() {
    if (!canSaveAgentSettings.value || agentSettingsSaving.value) {
      return null;
    }

    agentSettingsSaving.value = true;
    agentSettingsError.value = '';

    try {
      const saved = await window.api.agentSettings.saveProvider({
        providerCode: agentSettings.value.providerCode,
        providerName: agentSettings.value.providerName,
        baseUrl: agentSettings.value.baseUrl.trim(),
        apiKey: agentSettings.value.apiKey.trim(),
        modelName: agentSettings.value.modelName.trim()
      });
      cacheAgentProviderDraft(saved);
      applyAgentSettingsSnapshot(saved);
      agentSettingsLoaded.value = true;
      agentSettingsOpen.value = false;
      await loadHarmlessAgentState();
      return saved;
    } catch (error) {
      agentSettingsError.value =
        error instanceof Error ? error.message : 'Failed to save agent settings.';
      return null;
    } finally {
      agentSettingsSaving.value = false;
    }
  }

  async function runHarmlessAgentPrompt() {
    const prompt = aiInput.value.trim();
    if (!prompt || agentRuntime.value.running || !activeSessionId.value) {
      return agentRuntime.value;
    }

    aiInput.value = '';
    agentRuntime.value = await window.api.harmlessAgent.run({
      sessionId: activeSessionId.value,
      prompt
    });
    return agentRuntime.value;
  }

  async function resolveHarmlessAgentApproval(payload: { approvalId: string; approve: boolean }) {
    if (!activeSessionId.value) {
      return agentRuntime.value;
    }

    agentRuntime.value = await window.api.harmlessAgent.resolveApproval({
      sessionId: activeSessionId.value,
      ...payload
    });
    return agentRuntime.value;
  }

  function upsertAgentMessage(message: AgentThreadMessage) {
    const existingIndex = agentRuntime.value.messages.findIndex((item) => item.id === message.id);
    if (existingIndex >= 0) {
      agentRuntime.value = {
        ...agentRuntime.value,
        messages: agentRuntime.value.messages.map((item, index) =>
          index === existingIndex ? message : item
        )
      };
      return;
    }

    agentRuntime.value = {
      ...agentRuntime.value,
      messages: [...agentRuntime.value.messages, message]
    };
  }

  function appendAgentMessageDelta(messageId: string, delta: string) {
    if (!delta) {
      return;
    }

    agentRuntime.value = {
      ...agentRuntime.value,
      messages: agentRuntime.value.messages.map((message) =>
        message.id === messageId ? { ...message, content: `${message.content}${delta}` } : message
      )
    };
  }

  function ingestHarmlessAgentEvent(event: AgentRuntimeEvent) {
    if (event.sessionId !== activeSessionId.value) {
      return;
    }

    if (event.type === 'state') {
      agentRuntime.value = event.snapshot;
      return;
    }

    if (event.type === 'message-upsert') {
      upsertAgentMessage(event.message);
      return;
    }

    if (event.type === 'message-delta') {
      appendAgentMessageDelta(event.messageId, event.delta);
    }
  }

  /**
   * Function: openSessionModal
   * Purpose:
   *   Opens the new-session modal after refreshing local SSH capabilities so
   *   the form can default to password auth or system-key auth intelligently.
   * Parameters:
   *   None.
   * Returns:
   *   A promise that resolves after the modal state and draft defaults have
   *   been prepared.
   * Example:
   *   When a local SSH agent is available, opening the modal preselects
   *   `systemKey` authentication.
   */
  async function openSessionModal() {
    await loadSshAuthCapabilities();
    sessionModalMode.value = 'create';
    resetSessionDraft();
    syncSessionDraftAuthDefaults();
    sessionModalOpen.value = true;
  }

  /**
   * 打开指定会话的编辑弹窗，并将原始配置回填到表单中。
   * @param session 需要修改的会话对象
   * @return Promise<void> 无返回
   */
  async function openEditSessionModal(session: SessionItem) {
    await loadSshAuthCapabilities();
    sessionModalMode.value = 'edit';
    editingSessionId.value = session.id;
    applySessionToDraft(session);
    sessionModalOpen.value = true;
  }

  function closeSessionModal() {
    if (!sessions.value.length) return;
    sessionModalOpen.value = false;
  }

  async function loadSessions(options?: { connectLastSession?: boolean }) {
    const items = await window.api.sessions.list();
    sessions.value = items;
    sessionsLoaded.value = true;

    if (items.length > 0) {
      let storedTabs: string[];
      try {
        storedTabs = JSON.parse(window.localStorage.getItem(TAB_STORAGE_KEY) ?? '[]') as string[];
      } catch {
        storedTabs = [];
      }

      const validTabIds = storedTabs.filter((id) => items.some((item) => item.id === id));
      openTabIds.value = validTabIds.length > 0 ? validTabIds : [items[0].id];
      persistOpenTabs();

      const defaultSessionId = openTabIds.value[0] ?? items[0].id;
      const defaultSession = items.find((item) => item.id === defaultSessionId) ?? items[0];
      selectSession(defaultSession, { openTab: false });
      sessionModalOpen.value = false;

      if (options?.connectLastSession) {
        try {
          await connect();
        } catch {
          // Keep the selected session visible even if auto-connect fails.
        }
      }

      return;
    }

    openTabIds.value = [];
    activeSessionId.value = '';
    await loadSshAuthCapabilities();
    resetSessionDraft();
    syncSessionDraftAuthDefaults();
    sessionModalOpen.value = true;
  }

  /**
   * Function: saveSession
   * Purpose:
   *   Persists the current new-session draft, including its chosen SSH
   *   authentication strategy, then selects the saved session in the workbench.
   * Parameters:
   *   None.
   * Returns:
   *   A promise that resolves to the created session, or `null` when the draft
   *   is not currently valid.
   * Example:
   *   Saving a session with `authMethod: 'systemKey'` and
   *   `keySource: 'custom'` stores the custom private key path and passphrase
   *   alongside the host metadata.
   */
  async function saveSession() {
    if (!canSaveSession.value) return null;

    const payload = {
      name: sessionDraft.value.name.trim(),
      group: sessionDraft.value.group,
      host: sessionDraft.value.host.trim(),
      port: Number(sessionDraft.value.port),
      username: sessionDraft.value.username.trim(),
      password: sessionDraft.value.password,
      authMethod: sessionDraft.value.authMethod,
      keySource: sessionDraft.value.keySource,
      privateKeyPath: sessionDraft.value.privateKeyPath.trim(),
      passphrase: sessionDraft.value.passphrase
    };

    if (sessionModalMode.value === 'edit') {
      if (!editingSessionId.value) {
        return null;
      }

      const updated = await window.api.sessions.update({
        id: editingSessionId.value,
        ...payload
      });

      sessions.value = sessions.value.map((item) => (item.id === updated.id ? updated : item));
      selectSession(updated, { openTab: openTabIds.value.includes(updated.id) });
      sessionModalOpen.value = false;
      editingSessionId.value = '';
      sessionModalMode.value = 'create';
      return updated;
    }

    const created = await window.api.sessions.create(payload);

    sessions.value = [...sessions.value, created];
    selectSession(created);
    sessionModalOpen.value = false;
    return created;
  }

  async function deleteSession(sessionId: string) {
    const isDeletingActiveSession = sessionId === activeSessionId.value;
    const nextTabIds = openTabIds.value.filter((id) => id !== sessionId);

    closeTabMenu();

    if (isDeletingActiveSession && status.value !== 'idle' && status.value !== 'disconnected') {
      await disconnect();
    }

    await window.api.sessions.delete(sessionId);

    sessions.value = sessions.value.filter((item) => item.id !== sessionId);
    openTabIds.value = nextTabIds;
    persistOpenTabs();

    if (!sessions.value.length) {
      resetActiveSession();
      sessionModalOpen.value = true;
      return;
    }

    if (!isDeletingActiveSession) {
      return;
    }

    const nextSession =
      sessions.value.find((item) => item.id === nextTabIds[0]) ?? sessions.value[0] ?? null;

    if (!nextSession) {
      resetActiveSession();
      sessionModalOpen.value = true;
      return;
    }

    if (!nextTabIds.includes(nextSession.id)) {
      openTabIds.value = [nextSession.id, ...nextTabIds];
      persistOpenTabs();
    }

    await connectToSession(nextSession);
  }

  /**
   * Function: connect
   * Purpose:
   *   Initiates the active SSH connection using the current live connection
   *   form, which may authenticate with a password, the system agent/default
   *   keys, or a user-selected private key file.
   * Parameters:
   *   None.
   * Returns:
   *   A promise that resolves after the SSH session, metrics, apps, and remote
   *   directory state are ready.
   * Example:
   *   When the form is set to `systemKey` with a custom key path, the connect
   *   payload includes that path and optional passphrase instead of a password.
   */
  async function connect() {
    status.value = 'connecting';
    statusMessage.value = `${t('sessionConnecting')} ${form.value.host}:${form.value.port}...`;
    remoteDirectory.value = null;
    remotePreview.value = null;
    explorerError.value = '';

    const result = await window.api.ssh.connect({
      host: form.value.host,
      port: Number(form.value.port),
      username: form.value.username,
      password: form.value.password,
      authMethod: form.value.authMethod,
      keySource: form.value.keySource,
      privateKeyPath: form.value.privateKeyPath.trim(),
      passphrase: form.value.passphrase
    });

    status.value = 'connected';
    statusMessage.value = `${t('connected')} ${form.value.host}:${form.value.port}`;

    await loadSystemMetrics();
    await loadRemoteApps();
    await loadLatency();
    startMetricsRefresh();
    await loadRemoteDirectory(result.remotePath);
  }

  async function connectToSession(session: SessionItem) {
    closeTabMenu();
    selectSession(session);
    await connect();
  }

  async function disconnect() {
    stopMetricsRefresh();
    await stopAllLogTails();
    await window.api.ssh.disconnect();
  }

  function addLogTailStream() {
    const stream = createLogTailStream();
    logTailStreams.value = [...logTailStreams.value, stream];
    return stream.id;
  }

  async function removeLogTailStream(streamId: string) {
    const stream = ensureLogTailStream(streamId);
    if (!stream) {
      return;
    }

    if (stream.state === 'running') {
      await window.api.ssh.stopLogTail(streamId);
    }

    logTailRemainders.delete(streamId);

    if (logTailStreams.value.length === 1) {
      logTailStreams.value = [createLogTailStream()];
      return;
    }

    logTailStreams.value = logTailStreams.value.filter((item) => item.id !== streamId);
    ensureAtLeastOneLogTailStream();
  }

  function setLogTailPath(streamId: string, value: string) {
    const stream = ensureLogTailStream(streamId);
    if (!stream) {
      return;
    }

    stream.path = value;
  }

  function setLogTailLineLimit(value: number) {
    logTailLineLimit.value = Math.max(1, Math.min(500, Math.trunc(value || 50)));

    for (const stream of logTailStreams.value) {
      stream.lines = stream.lines.slice(-logTailLineLimit.value);
    }
  }

  function appendLogTailChunk(payload: { streamId: string; chunk: string }) {
    const stream = ensureLogTailStream(payload.streamId);
    if (!stream) {
      return;
    }

    const normalizedChunk = payload.chunk.replace(/\r\n/g, '\n');
    const combined = `${logTailRemainders.get(payload.streamId) ?? ''}${normalizedChunk}`;
    const parts = combined.split('\n');
    logTailRemainders.set(payload.streamId, parts.pop() ?? '');

    if (!parts.length) {
      return;
    }

    stream.lines = [...stream.lines, ...parts].slice(-logTailLineLimit.value);
  }

  function setLogTailStatus(payload: {
    streamId: string;
    status: LogTailState;
    path: string;
    message: string;
  }) {
    const stream = ensureLogTailStream(payload.streamId);
    if (!stream) {
      return;
    }

    stream.state = payload.status;
    stream.statusMessage = payload.message.trim();

    if (payload.path && payload.path !== stream.path) {
      stream.path = payload.path;
    }

    if (payload.status === 'error') {
      stream.error = payload.message.trim();
      stream.lines = [];
      logTailRemainders.delete(payload.streamId);
      return;
    }

    if (payload.status === 'idle') {
      stream.error = '';
      stream.lines = [];
      logTailRemainders.delete(payload.streamId);
      return;
    }

    stream.error = '';
  }

  async function startLogTail(streamId: string) {
    const stream = ensureLogTailStream(streamId);
    if (!stream) {
      return;
    }

    const path = stream.path.trim();
    if (!path || !isConnected.value) return;

    stream.lines = [];
    stream.error = '';
    stream.statusMessage = '';
    logTailRemainders.delete(streamId);
    await window.api.ssh.startLogTail({ streamId, path, lineCount: logTailLineLimit.value });
  }

  async function stopLogTail(streamId: string) {
    const stream = ensureLogTailStream(streamId);
    if (!stream) {
      return;
    }

    if (stream.state === 'idle' && !stream.lines.length && !stream.error) {
      return;
    }

    await window.api.ssh.stopLogTail(streamId);
    resetLogTailStream(streamId);
  }

  async function stopAllLogTails() {
    for (const stream of logTailStreams.value) {
      if (stream.state === 'running') {
        await window.api.ssh.stopLogTail(stream.id);
      } else {
        resetLogTailStream(stream.id);
      }
    }
  }

  function patchRemoteDirectoryEntries(
    updater: (entries: RemoteEntry[], directory: RemoteDirectory) => RemoteEntry[]
  ) {
    if (!remoteDirectory.value) {
      return;
    }

    remoteDirectory.value = {
      ...remoteDirectory.value,
      entries: sortRemoteEntries(updater(remoteDirectory.value.entries, remoteDirectory.value))
    };
  }

  async function loadRemoteDirectory(path?: string, options?: { silent?: boolean }) {
    if (!isConnected.value) {
      remoteDirectory.value = null;
      remotePreview.value = null;
      explorerError.value = '';
      return;
    }

    const silent = options?.silent ?? false;

    if (!silent) {
      explorerLoading.value = true;
    }

    explorerError.value = '';
    try {
      remoteDirectory.value = await window.api.ssh.listRemote({
        path,
        showHidden: showHiddenFiles.value
      });
      if (remotePreview.value && !remotePreview.value.path.startsWith(remoteDirectory.value.path)) {
        remotePreview.value = null;
      }
    } catch (error) {
      explorerError.value = error instanceof Error ? error.message : 'Failed to load remote files.';
    } finally {
      if (!silent) {
        explorerLoading.value = false;
      }
    }
  }

  async function previewRemoteEntry(entry: RemoteEntry) {
    explorerError.value = '';
    if (entry.kind === 'directory') {
      await loadRemoteDirectory(entry.path);
      return;
    }

    explorerBusy.value = true;
    try {
      remotePreview.value = await window.api.ssh.readRemoteFile({ path: entry.path });
    } catch (error) {
      explorerError.value = error instanceof Error ? error.message : 'Failed to read file.';
    } finally {
      explorerBusy.value = false;
    }
  }

  async function openRemoteEntry(entry: RemoteEntry) {
    explorerError.value = '';
    if (entry.kind === 'directory') {
      await loadRemoteDirectory(entry.path);
      return;
    }

    explorerBusy.value = true;
    try {
      await window.api.ssh.openRemoteFile({ path: entry.path });
    } catch (error) {
      explorerError.value = error instanceof Error ? error.message : 'Failed to open file.';
    } finally {
      explorerBusy.value = false;
    }
  }

  /**
   * 确保远程目录存在，并通过缓存避免重复创建同一路径。
   * @param targetPath 需要确保存在的远程目录路径
   * @param createdDirectories 已创建目录缓存
   * @return Promise<void> 无返回
   */
  async function ensureRemoteDirectoryExists(
    targetPath: string,
    createdDirectories: Set<string>,
    creatingDirectories = new Map<string, Promise<void>>()
  ): Promise<void> {
    if (!targetPath || targetPath === '.' || targetPath === '/') {
      return;
    }

    const normalizedPath = targetPath.endsWith('/') ? targetPath.slice(0, -1) : targetPath;
    if (createdDirectories.has(normalizedPath)) {
      return;
    }

    const pendingCreation = creatingDirectories.get(normalizedPath);
    if (pendingCreation) {
      await pendingCreation;
      createdDirectories.add(normalizedPath);
      return;
    }

    const lastSlashIndex = normalizedPath.lastIndexOf('/');
    const parentPath = lastSlashIndex <= 0 ? '/' : normalizedPath.slice(0, lastSlashIndex);

    if (parentPath && parentPath !== normalizedPath) {
      await ensureRemoteDirectoryExists(parentPath, createdDirectories, creatingDirectories);
    }

    const createTask = window.api.ssh
      .createRemoteDirectory({ path: normalizedPath })
      .catch((error) => {
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        if (
          !message.includes('failure') &&
          !message.includes('already exists') &&
          !message.includes('file exists') &&
          !message.includes('code: 4')
        ) {
          throw error;
        }
      })
      .then(() => {
        createdDirectories.add(normalizedPath);
      })
      .finally(() => {
        creatingDirectories.delete(normalizedPath);
      });

    creatingDirectories.set(normalizedPath, createTask);

    try {
      await createTask;
    } catch (error) {
      if (creatingDirectories.get(normalizedPath) === createTask) {
        creatingDirectories.delete(normalizedPath);
      }
      throw error;
    }
  }

  async function waitForProgressPaint() {
    await nextTick();
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }

  async function runConcurrent<T>(
    items: T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<void>
  ) {
    let nextIndex = 0;
    let firstError: unknown = null;
    const workerCount = Math.min(concurrency, items.length);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length && !firstError) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          try {
            await worker(items[currentIndex], currentIndex);
          } catch (error) {
            firstError = error;
          }
        }
      })
    );

    if (firstError) {
      throw firstError;
    }
  }

  function clearUploadBatchHideTimer() {
    if (uploadBatchHideTimer) {
      window.clearTimeout(uploadBatchHideTimer);
      uploadBatchHideTimer = null;
    }
  }

  function scheduleUploadBatchDismiss() {
    clearUploadBatchHideTimer();
    uploadBatchHideTimer = window.setTimeout(() => {
      if (remoteUploadBatch.value?.status !== 'uploading') {
        remoteUploadBatch.value = null;
      }
      uploadBatchHideTimer = null;
    }, 3200);
  }

  function dismissRemoteUploadBatch() {
    if (remoteUploadBatch.value?.status === 'uploading') {
      return;
    }

    clearUploadBatchHideTimer();
    remoteUploadBatch.value = null;
  }

  function cancelRemoteUploadBatch() {
    const batch = remoteUploadBatch.value;
    if (!batch || batch.status !== 'uploading') {
      return;
    }

    canceledUploadBatchIds.add(batch.id);
    remoteUploadBatch.value = {
      ...batch,
      status: 'canceled',
      error: 'Upload canceled.'
    };
  }

  function clearDeleteBatchHideTimer() {
    if (deleteBatchHideTimer) {
      window.clearTimeout(deleteBatchHideTimer);
      deleteBatchHideTimer = null;
    }
  }

  function scheduleDeleteBatchDismiss() {
    clearDeleteBatchHideTimer();
    deleteBatchHideTimer = window.setTimeout(() => {
      if (remoteDeleteBatch.value?.status !== 'deleting') {
        remoteDeleteBatch.value = null;
      }
      deleteBatchHideTimer = null;
    }, 3200);
  }

  function dismissRemoteDeleteBatch() {
    if (remoteDeleteBatch.value?.status === 'deleting') {
      return;
    }

    clearDeleteBatchHideTimer();
    remoteDeleteBatch.value = null;
  }

  function cancelRemoteDeleteBatch() {
    const batch = remoteDeleteBatch.value;
    if (!batch || batch.status !== 'deleting') {
      return;
    }

    canceledDeleteBatchIds.add(batch.id);
    remoteDeleteBatch.value = {
      ...batch,
      status: 'canceled',
      error: 'Delete canceled.'
    };
  }

  /**
   * 上传文件列表；当文件带相对路径时，会自动补齐远程目录结构。
   * @param files 待上传文件列表
   * @return Promise<void> 无返回
   */
  async function uploadRemoteFiles(files: Array<File | RemoteUploadItem>) {
    if (!remoteDirectory.value || files.length === 0) return;

    explorerBusy.value = true;
    explorerError.value = '';
    try {
      console.log('[remote-upload] uploadRemoteFiles:start', {
        remoteDirectory: remoteDirectory.value.path,
        fileCount: files.length
      });
      const uploadDirectoryPath = remoteDirectory.value.path;
      const nextEntries = [...remoteDirectory.value.entries];
      const createdDirectories = new Set<string>([
        uploadDirectoryPath.endsWith('/') ? uploadDirectoryPath.slice(0, -1) : uploadDirectoryPath
      ]);
      const creatingDirectories = new Map<string, Promise<void>>();
      const normalizedFiles = files.map((item) => {
        if (item instanceof File) {
          return {
            file: item,
            relativePath: item.webkitRelativePath || item.name
          };
        }

        return {
          file: item.file,
          relativePath: item.relativePath?.trim() || item.file.webkitRelativePath || item.file.name
        };
      });
      const totalBytes = normalizedFiles.reduce((total, item) => total + item.file.size, 0);
      const currentBatchId = ++uploadBatchId;
      let uploadedBytes = 0;
      let lastProgressUpdateAt = 0;

      clearUploadBatchHideTimer();
      remoteUploadBatch.value = {
        id: currentBatchId,
        status: 'uploading',
        totalFiles: normalizedFiles.length,
        completedFiles: 0,
        totalBytes,
        completedBytes: 0,
        currentFileName: normalizedFiles[0]?.file.name ?? '',
        error: '',
        startedAt: Date.now()
      };

      console.log('[remote-upload] uploadRemoteFiles:normalized', {
        fileCount: normalizedFiles.length,
        totalBytes,
        concurrency: REMOTE_UPLOAD_CONCURRENCY
      });

      await waitForProgressPaint();

      await runConcurrent(normalizedFiles, REMOTE_UPLOAD_CONCURRENCY, async (item, index) => {
        if (canceledUploadBatchIds.has(currentBatchId)) {
          throw new Error('Upload canceled.');
        }

        const file = item.file;
        const relativePath = item.relativePath.replace(/\\/g, '/');
        const lastSlashIndex = relativePath.lastIndexOf('/');
        if (remoteUploadBatch.value?.id === currentBatchId) {
          remoteUploadBatch.value = {
            ...remoteUploadBatch.value,
            currentFileName: relativePath || file.name
          };
        }
        if (lastSlashIndex > 0) {
          const basePath = uploadDirectoryPath.endsWith('/')
            ? uploadDirectoryPath.slice(0, -1)
            : uploadDirectoryPath;
          const relativeDirectory = relativePath.slice(0, lastSlashIndex);
          await ensureRemoteDirectoryExists(
            `${basePath}/${relativeDirectory}`,
            createdDirectories,
            creatingDirectories
          );
        }

        const uploadId = `${Date.now().toString(36)}-${currentBatchId}-${index}`;
        const result = await window.api.ssh.startRemoteUpload({
          uploadId,
          directory: uploadDirectoryPath,
          name: file.name,
          relativePath
        });

        try {
          const reader = file.stream().getReader();
          const pendingWrites: Promise<void>[] = [];
          let nextRemoteOffset = 0;
          const flushOldestWrite = async () => {
            const pendingWrite = pendingWrites.shift();
            if (pendingWrite) {
              await pendingWrite;
            }
          };

          while (true) {
            if (canceledUploadBatchIds.has(currentBatchId)) {
              throw new Error('Upload canceled.');
            }

            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            for (let offset = 0; offset < value.byteLength; offset += REMOTE_UPLOAD_CHUNK_SIZE) {
              if (canceledUploadBatchIds.has(currentBatchId)) {
                throw new Error('Upload canceled.');
              }

              const chunk = value.slice(offset, offset + REMOTE_UPLOAD_CHUNK_SIZE);
              const chunkOffset = nextRemoteOffset;
              nextRemoteOffset += chunk.byteLength;
              pendingWrites.push(
                window.api.ssh
                  .appendRemoteUploadChunk({
                    uploadId,
                    data: chunk,
                    offset: chunkOffset
                  })
                  .then((chunkResult) => {
                    uploadedBytes += chunkResult.bytesWritten;

                    const now = window.performance.now();
                    const shouldUpdateProgress =
                      now - lastProgressUpdateAt >= REMOTE_UPLOAD_PROGRESS_INTERVAL_MS ||
                      uploadedBytes >= totalBytes;

                    if (shouldUpdateProgress && remoteUploadBatch.value?.id === currentBatchId) {
                      lastProgressUpdateAt = now;
                      remoteUploadBatch.value = {
                        ...remoteUploadBatch.value,
                        completedBytes: Math.min(totalBytes, uploadedBytes)
                      };
                    }
                  })
              );

              if (pendingWrites.length >= REMOTE_UPLOAD_WRITE_PIPELINE) {
                await flushOldestWrite();
              }
            }
          }

          while (pendingWrites.length > 0) {
            await flushOldestWrite();
          }

          await window.api.ssh.finishRemoteUpload({ uploadId });
        } catch (error) {
          if (!canceledUploadBatchIds.has(currentBatchId)) {
            failedUploadBatchIds.add(currentBatchId);
          }
          canceledUploadBatchIds.add(currentBatchId);
          await window.api.ssh.cancelRemoteUpload({ uploadId }).catch(() => undefined);
          throw error;
        }
        if (lastSlashIndex <= 0) {
          const nextEntry: RemoteEntry = {
            name: file.name,
            path: result.path,
            kind: 'file',
            size: file.size,
            modifiedAt: Date.now()
          };
          const existingIndex = nextEntries.findIndex((entry) => entry.path === result.path);
          if (existingIndex >= 0) {
            nextEntries.splice(existingIndex, 1, nextEntry);
          } else {
            nextEntries.push(nextEntry);
          }
        }

        if (remoteUploadBatch.value?.id === currentBatchId) {
          remoteUploadBatch.value = {
            ...remoteUploadBatch.value,
            completedFiles: remoteUploadBatch.value.completedFiles + 1,
            completedBytes: Math.min(totalBytes, uploadedBytes)
          };
        }
      });

      if (remoteUploadBatch.value?.id === currentBatchId) {
        remoteUploadBatch.value = {
          ...remoteUploadBatch.value,
          status: 'success',
          completedFiles: normalizedFiles.length,
          completedBytes: totalBytes,
          currentFileName: ''
        };
        scheduleUploadBatchDismiss();
      }

      patchRemoteDirectoryEntries(() => nextEntries);
      void loadRemoteDirectory(remoteDirectory.value.path, { silent: true });
    } catch (error) {
      console.error('[remote-upload] uploadRemoteFiles:failed', error);
      explorerError.value = error instanceof Error ? error.message : 'Failed to upload files.';
      if (remoteUploadBatch.value?.status === 'uploading') {
        remoteUploadBatch.value = {
          ...remoteUploadBatch.value,
          status: failedUploadBatchIds.has(remoteUploadBatch.value.id)
            ? 'error'
            : canceledUploadBatchIds.has(remoteUploadBatch.value.id)
              ? 'canceled'
              : 'error',
          error: explorerError.value
        };
      }
    } finally {
      explorerBusy.value = false;
    }
  }

  /**
   * 处理拖拽上传的目录和文件，确保空目录也能在远端创建出来。
   * @param payload 拖拽上传解析后的目录与文件信息
   * @return Promise<void> 无返回
   */
  async function uploadRemoteItems(payload: RemoteDropPayload) {
    if (!remoteDirectory.value) {
      return;
    }

    const normalizedDirectories = Array.from(
      new Set(
        payload.directories
          .map((directory) => directory.trim().replace(/\\/g, '/'))
          .filter((directory) => Boolean(directory))
          .sort((left, right) => left.length - right.length)
      )
    );

    console.log('[remote-upload] uploadRemoteItems:start', {
      remoteDirectory: remoteDirectory.value.path,
      directoryCount: normalizedDirectories.length,
      fileCount: payload.files.length
    });

    if (payload.files.length > 0) {
      await uploadRemoteFiles(payload.files);
      if (remoteUploadBatch.value?.status !== 'success') {
        return;
      }
    }

    if (normalizedDirectories.length > 0) {
      explorerBusy.value = true;
      explorerError.value = '';

      try {
        const basePath = remoteDirectory.value.path.endsWith('/')
          ? remoteDirectory.value.path.slice(0, -1)
          : remoteDirectory.value.path;
        const createdDirectories = new Set<string>([basePath]);
        const creatingDirectories = new Map<string, Promise<void>>();

        for (const relativeDirectory of normalizedDirectories) {
          await ensureRemoteDirectoryExists(
            `${basePath}/${relativeDirectory}`,
            createdDirectories,
            creatingDirectories
          );
        }
      } catch (error) {
        console.error('[remote-upload] uploadRemoteItems:create-directories-failed', error);
        explorerError.value =
          error instanceof Error ? error.message : 'Failed to create dropped directories.';
        explorerBusy.value = false;
        return;
      } finally {
        explorerBusy.value = false;
      }
    }

    void loadRemoteDirectory(remoteDirectory.value.path, { silent: true });
  }

  async function createRemoteDirectory(name: string) {
    if (!remoteDirectory.value || !name.trim()) return;

    explorerBusy.value = true;
    explorerError.value = '';
    try {
      const trimmedName = name.trim();
      const basePath = remoteDirectory.value.path.replace(/\/$/, '');
      const path = `${basePath}/${trimmedName}`;
      await window.api.ssh.createRemoteDirectory({ path });

      patchRemoteDirectoryEntries((entries) => [
        ...entries.filter((entry) => entry.path !== path),
        {
          name: trimmedName,
          path,
          kind: 'directory',
          size: 0,
          modifiedAt: Date.now()
        }
      ]);

      void loadRemoteDirectory(remoteDirectory.value.path, { silent: true });
    } catch (error) {
      explorerError.value = error instanceof Error ? error.message : 'Failed to create directory.';
    } finally {
      explorerBusy.value = false;
    }
  }

  async function createRemoteFile(name: string) {
    if (!remoteDirectory.value || !name.trim()) return;

    explorerBusy.value = true;
    explorerError.value = '';
    try {
      const trimmedName = name.trim();
      const basePath = remoteDirectory.value.path.replace(/\/$/, '');
      const path = `${basePath}/${trimmedName}`;
      await window.api.ssh.writeRemoteTextFile({ path, content: '' });

      patchRemoteDirectoryEntries((entries) => [
        ...entries.filter((entry) => entry.path !== path),
        {
          name: trimmedName,
          path,
          kind: 'file',
          size: 0,
          modifiedAt: Date.now()
        }
      ]);

      void loadRemoteDirectory(remoteDirectory.value.path, { silent: true });
    } catch (error) {
      explorerError.value = error instanceof Error ? error.message : 'Failed to create file.';
    } finally {
      explorerBusy.value = false;
    }
  }

  async function renameRemoteEntry(oldPath: string, newName: string) {
    if (!remoteDirectory.value || !newName.trim()) return;

    explorerBusy.value = true;
    explorerError.value = '';
    try {
      const entry = remoteDirectory.value.entries.find((item) => item.path === oldPath);
      const parentPath = oldPath.slice(0, oldPath.lastIndexOf('/')) || '/';
      const newPath = parentPath === '/' ? `/${newName.trim()}` : `${parentPath}/${newName.trim()}`;
      await window.api.ssh.renameRemoteEntry({ oldPath, newPath });

      patchRemoteDirectoryEntries((entries) =>
        entries.map((item) =>
          item.path === oldPath
            ? {
                ...item,
                name: newName.trim(),
                path: newPath
              }
            : item
        )
      );

      if (remotePreview.value?.path === oldPath && entry?.kind === 'file') {
        remotePreview.value = {
          ...remotePreview.value,
          path: newPath
        };
      }

      void loadRemoteDirectory(remoteDirectory.value.path, { silent: true });
    } catch (error) {
      explorerError.value = error instanceof Error ? error.message : 'Failed to rename entry.';
    } finally {
      explorerBusy.value = false;
    }
  }

  async function deleteRemoteEntries(paths: string[]) {
    if (!remoteDirectory.value || !paths.length) return;

    explorerBusy.value = true;
    explorerError.value = '';
    const entryKindByPath = new Map(
      remoteDirectory.value.entries.map((entry) => [entry.path, entry.kind])
    );
    const currentBatchId = ++deleteBatchId;
    clearDeleteBatchHideTimer();
    remoteDeleteBatch.value = {
      id: currentBatchId,
      status: 'deleting',
      totalEntries: paths.length,
      completedEntries: 0,
      currentPath: paths[0],
      error: '',
      startedAt: Date.now()
    };

    const deletedPaths: string[] = [];
    try {
      await waitForProgressPaint();

      await runConcurrent(paths, REMOTE_DELETE_CONCURRENCY, async (path) => {
        if (canceledDeleteBatchIds.has(currentBatchId)) {
          throw new Error('Delete canceled.');
        }

        if (remoteDeleteBatch.value?.id === currentBatchId) {
          remoteDeleteBatch.value = {
            ...remoteDeleteBatch.value,
            currentPath: path
          };
        }

        const deleteStartedAt = window.performance.now();
        await window.api.ssh.deleteRemoteEntry({
          path,
          recursive: true,
          kind: entryKindByPath.get(path)
        });
        console.log('[remote-delete] renderer:deleted', {
          path,
          kind: entryKindByPath.get(path) ?? 'unknown',
          durationMs: Math.round(window.performance.now() - deleteStartedAt)
        });
        deletedPaths.push(path);

        if (remoteDeleteBatch.value?.id === currentBatchId) {
          remoteDeleteBatch.value = {
            ...remoteDeleteBatch.value,
            completedEntries: remoteDeleteBatch.value.completedEntries + 1
          };
        }
      });

      patchRemoteDirectoryEntries((entries) =>
        entries.filter((entry) => !deletedPaths.includes(entry.path))
      );

      if (
        remotePreview.value &&
        deletedPaths.some(
          (path) =>
            remotePreview.value?.path === path || remotePreview.value?.path.startsWith(`${path}/`)
        )
      ) {
        remotePreview.value = null;
      }

      if (remoteDeleteBatch.value?.id === currentBatchId) {
        remoteDeleteBatch.value = {
          ...remoteDeleteBatch.value,
          status: 'success',
          completedEntries: paths.length,
          currentPath: ''
        };
        scheduleDeleteBatchDismiss();
      }

      void loadRemoteDirectory(remoteDirectory.value.path, { silent: true });
    } catch (error) {
      explorerError.value = error instanceof Error ? error.message : 'Failed to delete entry.';
      if (deletedPaths.length) {
        patchRemoteDirectoryEntries((entries) =>
          entries.filter((entry) => !deletedPaths.includes(entry.path))
        );
        void loadRemoteDirectory(remoteDirectory.value.path, { silent: true });
      }
      if (remoteDeleteBatch.value?.id === currentBatchId) {
        remoteDeleteBatch.value = {
          ...remoteDeleteBatch.value,
          status: canceledDeleteBatchIds.has(currentBatchId) ? 'canceled' : 'error',
          error: explorerError.value
        };
      }
    } finally {
      explorerBusy.value = false;
    }
  }

  async function deleteRemoteEntry(path: string) {
    await deleteRemoteEntries([path]);
  }

  async function toggleHiddenFiles() {
    showHiddenFiles.value = !showHiddenFiles.value;
    if (isConnected.value) {
      await loadRemoteDirectory(remoteDirectory.value?.path);
    }
  }

  function stopMetricsRefresh() {
    if (liveMetricsRefreshTimer !== null) {
      window.clearInterval(liveMetricsRefreshTimer);
      liveMetricsRefreshTimer = null;
    }

    if (fullMetricsRefreshTimer !== null) {
      window.clearInterval(fullMetricsRefreshTimer);
      fullMetricsRefreshTimer = null;
    }

    if (latencyRefreshTimer !== null) {
      window.clearInterval(latencyRefreshTimer);
      latencyRefreshTimer = null;
    }
  }

  function startMetricsRefresh() {
    stopMetricsRefresh();
    if (!isConnected.value) return;

    liveMetricsRefreshTimer = window.setInterval(() => {
      void loadLiveMetrics();
    }, LIVE_METRICS_REFRESH_INTERVAL_MS);

    fullMetricsRefreshTimer = window.setInterval(() => {
      void loadSystemMetrics({ silent: true });
      void loadRemoteApps({ silent: true });
    }, FULL_METRICS_REFRESH_INTERVAL_MS);

    latencyRefreshTimer = window.setInterval(() => {
      void loadLatency();
    }, LATENCY_REFRESH_INTERVAL_MS);
  }

  async function loadLatency() {
    if (!isConnected.value || latencyRequestPending) {
      if (!isConnected.value) {
        latencyMs.value = null;
      }
      return;
    }

    latencyRequestPending = true;

    try {
      latencyMs.value = await window.api.ssh.getLatency();
    } finally {
      latencyRequestPending = false;
    }
  }

  async function loadLiveMetrics() {
    if (!isConnected.value || liveMetricsRequestPending) {
      return;
    }

    liveMetricsRequestPending = true;

    try {
      const liveMetrics = await window.api.ssh.getLiveMetrics();
      if (!liveMetrics) {
        return;
      }

      systemMetrics.value = systemMetrics.value
        ? {
            ...systemMetrics.value,
            ...liveMetrics
          }
        : createFallbackMetricsSnapshot(liveMetrics);
    } finally {
      liveMetricsRequestPending = false;
    }
  }

  async function loadRemoteApps(options?: { silent?: boolean }) {
    if (!isConnected.value) {
      remoteApps.value = [];
      remoteAppsLoading.value = false;
      remoteAppsError.value = '';
      return;
    }

    const silent = options?.silent ?? false;
    if (!silent) {
      remoteAppsLoading.value = true;
    }

    remoteAppsError.value = '';

    try {
      remoteApps.value = await window.api.ssh.getRemoteApps();
    } catch (error) {
      remoteApps.value = [];
      remoteAppsError.value =
        error instanceof Error ? error.message : 'Failed to load remote apps.';
    } finally {
      if (!silent) {
        remoteAppsLoading.value = false;
      }
    }
  }

  async function loadSystemMetrics(options?: { silent?: boolean }) {
    if (!isConnected.value || metricsRequestPending) {
      if (!isConnected.value) {
        systemMetrics.value = null;
        metricsLoading.value = false;
      }
      return;
    }

    metricsRequestPending = true;

    const silent = options?.silent ?? false;
    if (!silent) {
      metricsLoading.value = true;
    }

    try {
      systemMetrics.value = await window.api.ssh.getSystemMetrics();
    } catch {
      systemMetrics.value = null;
    } finally {
      metricsRequestPending = false;
      if (!silent) {
        metricsLoading.value = false;
      }
    }
  }

  function setStatus(payload: { status: ConnectionState; message: string }) {
    status.value = payload.status;
    statusMessage.value = payload.message;

    if (payload.status === 'disconnected' || payload.status === 'error') {
      stopMetricsRefresh();
      remoteDirectory.value = null;
      remoteApps.value = [];
      remotePreview.value = null;
      systemMetrics.value = null;
      latencyMs.value = null;
      resetLogTails();
      explorerBusy.value = false;
      explorerLoading.value = false;
      remoteAppsLoading.value = false;
      metricsLoading.value = false;
      remoteAppsError.value = '';
      metricsRequestPending = false;
      liveMetricsRequestPending = false;
      latencyRequestPending = false;
      if (payload.status === 'disconnected') {
        explorerError.value = '';
      }
    }
  }

  function setConnectError(message: string) {
    status.value = 'error';
    statusMessage.value = message;
  }

  function setSearchQuery(value: string) {
    searchQuery.value = value;
  }

  function setAiInput(value: string) {
    aiInput.value = value;
  }

  function setLocale(nextLocale: Locale) {
    locale.value = nextLocale;
    applyLocale();
  }

  applyLocale();

  return {
    activeSession,
    activeSessionId,
    aiInput,
    agentMessages,
    agentModelOptions,
    agentModelsLoading,
    agentProviderOptions,
    agentRuntime,
    agentSettings,
    agentSettingsError,
    agentSettingsLoaded,
    agentSettingsLoading,
    agentSettingsOpen,
    agentSettingsSaving,
    applyAgentProviderCode,
    canSaveSession,
    canSaveAgentSettings,
    cancelRemoteDeleteBatch,
    cancelRemoteUploadBatch,
    chooseSessionDraftPrivateKey,
    hasAgentProviderConfigured,
    ingestHarmlessAgentEvent,
    closeSessionModal,
    closeAgentSettingsModal,
    closeTabMenu,
    connect,
    connectToSession,
    connectionLabel,
    dismissRemoteDeleteBatch,
    dismissRemoteUploadBatch,
    disconnect,
    explorerBusy,
    explorerError,
    explorerLoading,
    filteredSessions,
    form,
    createRemoteFile,
    createRemoteDirectory,
    deleteRemoteEntries,
    deleteRemoteEntry,
    deleteSession,
    addLogTailStream,
    appendLogTailChunk,
    latencyLabel,
    latencyMs,
    loadHarmlessAgentState,
    loadProviderModels,
    loadLiveMetrics,
    loadLatency,
    loadAgentSettings,
    loadSshAuthCapabilities,
    loadRemoteApps,
    loadSystemMetrics,
    loadSessions,
    loadRemoteDirectory,
    locale,
    logTailLineLimit,
    logTailStreams,
    metricsLoading,
    openRemoteEntry,
    previewRemoteEntry,
    openAgentSettingsModal,
    openSessionModal,
    openEditSessionModal,
    openTabIds,
    openTabMenuAt,
    openTabs,
    pendingAgentApproval,
    removeAllTabs,
    removeOtherTabs,
    removeTab,
    remoteApps,
    remoteAppsError,
    remoteAppsLoading,
    remoteDirectory,
    remotePreview,
    removeLogTailStream,
    resolveHarmlessAgentApproval,
    renameRemoteEntry,
    remoteDeleteBatch,
    remoteUploadBatch,
    runHarmlessAgentPrompt,
    saveSession,
    saveAgentSettings,
    searchQuery,
    selectSession,
    setSessionDraftAuthMethod,
    setSessionDraftKeySource,
    setLogTailPath,
    setLogTailLineLimit,
    setLogTailStatus,
    sessionDraft,
    sessionModalMode,
    sessionGroups,
    sessionModalOpen,
    sessions,
    sessionsLoaded,
    sshAuthCapabilities,
    setAiInput,
    setConnectError,
    setSearchQuery,
    setStatus,
    showHiddenFiles,
    status,
    statusMessage,
    startMetricsRefresh,
    stopMetricsRefresh,
    systemMetrics,
    t,
    tabMenu,
    startLogTail,
    stopAllLogTails,
    stopLogTail,
    toggleHiddenFiles,
    setLocale,
    updateAgentApiKey,
    updateAgentBaseUrl,
    updateAgentModelName,
    uploadRemoteFiles,
    uploadRemoteItems,
    isConnected
  };
});
function createFallbackMetricsSnapshot(liveMetrics: LiveSystemMetrics): SystemMetrics {
  return {
    cpuPercent: liveMetrics.cpuPercent,
    memoryUsedMb: liveMetrics.memoryUsedMb,
    memoryTotalMb: liveMetrics.memoryTotalMb,
    dockerRunning: null,
    hostname: null,
    osName: null,
    kernelVersion: null,
    architecture: null,
    uptime: null
  };
}
