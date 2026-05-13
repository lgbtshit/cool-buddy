import { computed, ref } from 'vue';
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
  LogTailState,
  Locale,
  RemoteApp,
  RemoteDirectory,
  RemoteEntry,
  SessionDraft,
  SessionGroup,
  SessionItem,
  SystemMetrics,
  TabMenuState
} from '../types/ssh-console';

const TAB_STORAGE_KEY = 'cool-buddy:open-tabs';
const LOCALE_STORAGE_KEY = 'cool-buddy:locale';
const AGENT_PROVIDER_DRAFTS_STORAGE_KEY = 'cool-buddy:agent-provider-drafts';
const LIVE_METRICS_REFRESH_INTERVAL_MS = 2000;
const FULL_METRICS_REFRESH_INTERVAL_MS = 15000;
const LATENCY_REFRESH_INTERVAL_MS = 5000;

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

function createDefaultForm(): ConnectionForm {
  return {
    host: '',
    port: 22,
    username: '',
    password: ''
  };
}

function createDefaultSessionDraft(): SessionDraft {
  return {
    name: '',
    group: 'production',
    host: '',
    port: 22,
    username: '',
    password: ''
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
  const tabMenu = ref<TabMenuState | null>(null);
  const remoteDirectory = ref<RemoteDirectory | null>(null);
  const remoteApps = ref<RemoteApp[]>([]);
  const remotePreview = ref<{ path: string; content: string } | null>(null);
  const systemMetrics = ref<SystemMetrics | null>(null);
  const showHiddenFiles = ref(false);
  const explorerLoading = ref(false);
  const explorerBusy = ref(false);
  const explorerError = ref('');
  const remoteAppsLoading = ref(false);
  const remoteAppsError = ref('');
  const metricsLoading = ref(false);
  const logTailPath = ref('');
  const logTailLineLimit = ref(50);
  const logTailLines = ref<string[]>([]);
  const logTailState = ref<LogTailState>('idle');
  const logTailError = ref('');
  const logTailStatusMessage = ref('');
  let logTailRemainder = '';
  let liveMetricsRefreshTimer: number | null = null;
  let fullMetricsRefreshTimer: number | null = null;
  let latencyRefreshTimer: number | null = null;
  let metricsRequestPending = false;
  let liveMetricsRequestPending = false;
  let latencyRequestPending = false;
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
      sessionDraft.value.port
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
  const canStartLogTail = computed(() => {
    return Boolean(
      isConnected.value && logTailPath.value.trim() && logTailState.value !== 'running'
    );
  });

  function resetLogTail(options?: { clearPath?: boolean }) {
    logTailLines.value = [];
    logTailState.value = 'idle';
    logTailError.value = '';
    logTailStatusMessage.value = '';
    logTailRemainder = '';

    if (options?.clearPath) {
      logTailPath.value = '';
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
    form.value = createDefaultForm();
    agentRuntime.value = createDefaultAgentStateSnapshot();
    status.value = 'idle';
    statusMessage.value = t('ready');
  }

  function selectSession(session: SessionItem, options?: { openTab?: boolean }) {
    activeSessionId.value = session.id;
    form.value = {
      host: session.host,
      port: session.port,
      username: session.username,
      password: session.password
    };

    if (options?.openTab !== false) {
      ensureTabOpen(session.id);
    }

    void loadHarmlessAgentState();
  }

  function openTabMenuAt(payload: TabMenuState) {
    if (payload.sessionId !== activeSessionId.value) return;
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
      selectSession(nextSession, { openTab: false });
      status.value = 'idle';
      statusMessage.value = t('ready');
      return;
    }

    resetActiveSession();
  }

  function resetSessionDraft() {
    sessionDraft.value = createDefaultSessionDraft();
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

  function openSessionModal() {
    resetSessionDraft();
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
    sessionModalOpen.value = true;
  }

  async function saveSession() {
    if (!canSaveSession.value) return null;

    const created = await window.api.sessions.create({
      name: sessionDraft.value.name.trim(),
      group: sessionDraft.value.group,
      host: sessionDraft.value.host.trim(),
      port: Number(sessionDraft.value.port),
      username: sessionDraft.value.username.trim(),
      password: sessionDraft.value.password
    });

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

    selectSession(nextSession, { openTab: false });
    status.value = 'idle';
    statusMessage.value = t('ready');
  }

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
      password: form.value.password
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
    await stopLogTail();
    await window.api.ssh.disconnect();
  }

  function setLogTailPath(value: string) {
    logTailPath.value = value;
  }

  function setLogTailLineLimit(value: number) {
    logTailLineLimit.value = Math.max(1, Math.min(500, Math.trunc(value || 50)));
    logTailLines.value = logTailLines.value.slice(-logTailLineLimit.value);
  }

  function appendLogTailChunk(chunk: string) {
    const normalizedChunk = chunk.replace(/\r\n/g, '\n');
    const combined = `${logTailRemainder}${normalizedChunk}`;
    const parts = combined.split('\n');
    logTailRemainder = parts.pop() ?? '';

    if (!parts.length) {
      return;
    }

    logTailLines.value = [...logTailLines.value, ...parts].slice(-logTailLineLimit.value);
  }

  function setLogTailStatus(payload: { status: LogTailState; path: string; message: string }) {
    logTailState.value = payload.status;
    logTailStatusMessage.value = payload.message.trim();

    if (payload.path && payload.path !== logTailPath.value) {
      logTailPath.value = payload.path;
    }

    if (payload.status === 'error') {
      logTailError.value = payload.message.trim();
      logTailLines.value = [];
      logTailRemainder = '';
      return;
    }

    if (payload.status === 'idle') {
      logTailError.value = '';
      logTailLines.value = [];
      logTailRemainder = '';
      return;
    }

    logTailError.value = '';
  }

  async function startLogTail() {
    const path = logTailPath.value.trim();
    if (!path || !isConnected.value) return;

    logTailLines.value = [];
    logTailError.value = '';
    logTailStatusMessage.value = '';
    logTailRemainder = '';
    await window.api.ssh.startLogTail({ path, lineCount: logTailLineLimit.value });
  }

  async function stopLogTail() {
    if (logTailState.value === 'idle' && !logTailLines.value.length && !logTailError.value) {
      return;
    }

    await window.api.ssh.stopLogTail();
    resetLogTail();
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

  async function uploadRemoteFiles(files: File[]) {
    if (!remoteDirectory.value || files.length === 0) return;

    explorerBusy.value = true;
    explorerError.value = '';
    try {
      const nextEntries = [...remoteDirectory.value.entries];

      for (const file of files) {
        const data = new Uint8Array(await file.arrayBuffer());
        const result = await window.api.ssh.uploadRemoteFile({
          directory: remoteDirectory.value.path,
          name: file.name,
          data
        });

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

      patchRemoteDirectoryEntries(() => nextEntries);
      void loadRemoteDirectory(remoteDirectory.value.path, { silent: true });
    } catch (error) {
      explorerError.value = error instanceof Error ? error.message : 'Failed to upload files.';
    } finally {
      explorerBusy.value = false;
    }
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

  async function deleteRemoteEntry(path: string) {
    if (!remoteDirectory.value) return;

    explorerBusy.value = true;
    explorerError.value = '';
    try {
      await window.api.ssh.deleteRemoteEntry({ path, recursive: true });

      patchRemoteDirectoryEntries((entries) => entries.filter((entry) => entry.path !== path));

      if (remotePreview.value?.path === path || remotePreview.value?.path.startsWith(`${path}/`)) {
        remotePreview.value = null;
      }

      void loadRemoteDirectory(remoteDirectory.value.path, { silent: true });
    } catch (error) {
      explorerError.value = error instanceof Error ? error.message : 'Failed to delete entry.';
    } finally {
      explorerBusy.value = false;
    }
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
      resetLogTail();
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
    hasAgentProviderConfigured,
    ingestHarmlessAgentEvent,
    closeSessionModal,
    closeAgentSettingsModal,
    closeTabMenu,
    connect,
    connectToSession,
    connectionLabel,
    disconnect,
    explorerBusy,
    explorerError,
    explorerLoading,
    filteredSessions,
    form,
    createRemoteDirectory,
    deleteRemoteEntry,
    deleteSession,
    appendLogTailChunk,
    canStartLogTail,
    latencyLabel,
    latencyMs,
    loadHarmlessAgentState,
    loadProviderModels,
    loadLiveMetrics,
    loadLatency,
    loadAgentSettings,
    loadRemoteApps,
    loadSystemMetrics,
    loadSessions,
    loadRemoteDirectory,
    locale,
    logTailError,
    logTailLineLimit,
    logTailLines,
    logTailPath,
    logTailState,
    logTailStatusMessage,
    metricsLoading,
    openRemoteEntry,
    previewRemoteEntry,
    openAgentSettingsModal,
    openSessionModal,
    openTabIds,
    openTabMenuAt,
    openTabs,
    pendingAgentApproval,
    removeTab,
    remoteApps,
    remoteAppsError,
    remoteAppsLoading,
    remoteDirectory,
    remotePreview,
    resolveHarmlessAgentApproval,
    renameRemoteEntry,
    runHarmlessAgentPrompt,
    saveSession,
    saveAgentSettings,
    searchQuery,
    selectSession,
    setLogTailPath,
    setLogTailLineLimit,
    setLogTailStatus,
    sessionDraft,
    sessionGroups,
    sessionModalOpen,
    sessions,
    sessionsLoaded,
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
    stopLogTail,
    toggleHiddenFiles,
    setLocale,
    updateAgentApiKey,
    updateAgentBaseUrl,
    updateAgentModelName,
    uploadRemoteFiles,
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
