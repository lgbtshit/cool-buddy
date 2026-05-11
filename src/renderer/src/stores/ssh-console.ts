import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { messages, type MessageKey } from '../i18n'
import { httpClient } from '../lib/http-client'
import type {
  ConnectionForm,
  ConnectionState,
  LiveSystemMetrics,
  Locale,
  RemoteApp,
  RemoteDirectory,
  RemoteEntry,
  SessionDraft,
  SessionGroup,
  SessionItem,
  SystemMetrics,
  TabMenuState
} from '../types/ssh-console'

const TAB_STORAGE_KEY = 'cool-buddy:open-tabs'
const LIVE_METRICS_REFRESH_INTERVAL_MS = 2000
const FULL_METRICS_REFRESH_INTERVAL_MS = 15000

function createDefaultForm(): ConnectionForm {
  return {
    host: '',
    port: 22,
    username: '',
    password: ''
  }
}

function createDefaultSessionDraft(): SessionDraft {
  return {
    name: '',
    group: 'production',
    host: '',
    port: 22,
    username: '',
    password: ''
  }
}

function sortRemoteEntries(entries: RemoteEntry[]): RemoteEntry[] {
  return [...entries].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'directory' ? -1 : 1
    }

    return left.name.localeCompare(right.name)
  })
}

export const useSshConsoleStore = defineStore('ssh-console', () => {
  const locale = ref<Locale>('zh-CN')
  const sessions = ref<SessionItem[]>([])
  const openTabIds = ref<string[]>([])
  const activeSessionId = ref('')
  const searchQuery = ref('')
  const status = ref<ConnectionState>('idle')
  const statusMessage = ref<string>(messages['zh-CN'].ready)
  const aiInput = ref('')
  const sessionsLoaded = ref(false)
  const sessionModalOpen = ref(false)
  const tabMenu = ref<TabMenuState | null>(null)
  const remoteDirectory = ref<RemoteDirectory | null>(null)
  const remoteApps = ref<RemoteApp[]>([])
  const remotePreview = ref<{ path: string; content: string } | null>(null)
  const systemMetrics = ref<SystemMetrics | null>(null)
  const showHiddenFiles = ref(false)
  const explorerLoading = ref(false)
  const explorerBusy = ref(false)
  const explorerError = ref('')
  const remoteAppsLoading = ref(false)
  const remoteAppsError = ref('')
  const metricsLoading = ref(false)
  let liveMetricsRefreshTimer: number | null = null
  let fullMetricsRefreshTimer: number | null = null
  let metricsRequestPending = false
  let liveMetricsRequestPending = false
  const form = ref<ConnectionForm>(createDefaultForm())
  const sessionDraft = ref<SessionDraft>(createDefaultSessionDraft())

  const t = (key: MessageKey): string => messages[locale.value][key]

  const filteredSessions = computed(() => {
    const query = searchQuery.value.trim().toLowerCase()
    if (!query) return sessions.value
    return sessions.value.filter((item) => item.name.toLowerCase().includes(query))
  })

  const sessionGroups = computed(() => [
    { key: 'production' as SessionGroup, label: t('production') },
    { key: 'staging' as SessionGroup, label: t('staging') },
    { key: 'local' as SessionGroup, label: t('local') }
  ])

  const activeSession = computed(() => {
    return sessions.value.find((item) => item.id === activeSessionId.value) ?? null
  })

  const openTabs = computed(() => {
    const sessionMap = new Map(sessions.value.map((item) => [item.id, item]))
    return openTabIds.value
      .map((id) => sessionMap.get(id))
      .filter((item): item is SessionItem => Boolean(item))
  })

  const latencyLabel = computed(() => {
    return status.value === 'connected' ? `${t('connected')}: 24ms` : `${t('latency')}: --`
  })

  const connectionLabel = computed(() => {
    if (status.value === 'connected') return t('sessionConnected')
    if (status.value === 'connecting') return t('sessionConnecting')
    if (status.value === 'error') return t('sessionError')
    return t('sessionDisconnected')
  })

  const canSaveSession = computed(() => {
    return Boolean(
      sessionDraft.value.name.trim() &&
      sessionDraft.value.host.trim() &&
      sessionDraft.value.username.trim() &&
      sessionDraft.value.port
    )
  })

  const isConnected = computed(() => status.value === 'connected')

  function applyLocale() {
    httpClient.defaults.headers.common['Accept-Language'] = locale.value

    statusMessage.value =
      status.value === 'connected' && activeSession.value
        ? `${t('connected')} ${activeSession.value.host}:${activeSession.value.port}`
        : status.value === 'connecting'
          ? `${t('sessionConnecting')} ${form.value.host}:${form.value.port}...`
          : status.value === 'error'
            ? statusMessage.value
            : t('ready')
  }

  function persistOpenTabs() {
    window.localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(openTabIds.value))
  }

  function ensureTabOpen(sessionId: string) {
    if (openTabIds.value.includes(sessionId)) return
    openTabIds.value = [...openTabIds.value, sessionId]
    persistOpenTabs()
  }

  function closeTabMenu() {
    tabMenu.value = null
  }

  function selectSession(session: SessionItem, options?: { openTab?: boolean }) {
    activeSessionId.value = session.id
    form.value = {
      host: session.host,
      port: session.port,
      username: session.username,
      password: session.password
    }

    if (options?.openTab !== false) {
      ensureTabOpen(session.id)
    }
  }

  function openTabMenuAt(payload: TabMenuState) {
    if (payload.sessionId !== activeSessionId.value) return
    tabMenu.value = payload
  }

  function removeTab(sessionId: string) {
    openTabIds.value = openTabIds.value.filter((id) => id !== sessionId)
    persistOpenTabs()
    closeTabMenu()
  }

  function resetSessionDraft() {
    sessionDraft.value = createDefaultSessionDraft()
  }

  function openSessionModal() {
    resetSessionDraft()
    sessionModalOpen.value = true
  }

  function closeSessionModal() {
    if (!sessions.value.length) return
    sessionModalOpen.value = false
  }

  async function loadSessions(options?: { connectLastSession?: boolean }) {
    const items = await window.api.sessions.list()
    sessions.value = items
    sessionsLoaded.value = true

    if (items.length > 0) {
      let storedTabs: string[]
      try {
        storedTabs = JSON.parse(window.localStorage.getItem(TAB_STORAGE_KEY) ?? '[]') as string[]
      } catch {
        storedTabs = []
      }

      const validTabIds = storedTabs.filter((id) => items.some((item) => item.id === id))
      openTabIds.value = validTabIds.length > 0 ? validTabIds : [items[0].id]
      persistOpenTabs()

      const defaultSessionId = openTabIds.value[0] ?? items[0].id
      const defaultSession = items.find((item) => item.id === defaultSessionId) ?? items[0]
      selectSession(defaultSession, { openTab: false })
      sessionModalOpen.value = false

      if (options?.connectLastSession) {
        try {
          await connect()
        } catch {
          // Keep the selected session visible even if auto-connect fails.
        }
      }

      return
    }

    openTabIds.value = []
    activeSessionId.value = ''
    sessionModalOpen.value = true
  }

  async function saveSession() {
    if (!canSaveSession.value) return null

    const created = await window.api.sessions.create({
      name: sessionDraft.value.name.trim(),
      group: sessionDraft.value.group,
      host: sessionDraft.value.host.trim(),
      port: Number(sessionDraft.value.port),
      username: sessionDraft.value.username.trim(),
      password: sessionDraft.value.password
    })

    sessions.value = [...sessions.value, created]
    selectSession(created)
    sessionModalOpen.value = false
    return created
  }

  async function connect() {
    status.value = 'connecting'
    statusMessage.value = `${t('sessionConnecting')} ${form.value.host}:${form.value.port}...`
    remoteDirectory.value = null
    remotePreview.value = null
    explorerError.value = ''

    const result = await window.api.ssh.connect({
      host: form.value.host,
      port: Number(form.value.port),
      username: form.value.username,
      password: form.value.password
    })

    status.value = 'connected'
    statusMessage.value = `${t('connected')} ${form.value.host}:${form.value.port}`

    await loadSystemMetrics()
    await loadRemoteApps()
    startMetricsRefresh()
    await loadRemoteDirectory(result.remotePath)
  }

  async function connectToSession(session: SessionItem) {
    closeTabMenu()
    selectSession(session)
    await connect()
  }

  async function disconnect() {
    stopMetricsRefresh()
    await window.api.ssh.disconnect()
  }

  function patchRemoteDirectoryEntries(
    updater: (entries: RemoteEntry[], directory: RemoteDirectory) => RemoteEntry[]
  ) {
    if (!remoteDirectory.value) {
      return
    }

    remoteDirectory.value = {
      ...remoteDirectory.value,
      entries: sortRemoteEntries(updater(remoteDirectory.value.entries, remoteDirectory.value))
    }
  }

  async function loadRemoteDirectory(path?: string, options?: { silent?: boolean }) {
    if (!isConnected.value) {
      remoteDirectory.value = null
      remotePreview.value = null
      explorerError.value = ''
      return
    }

    const silent = options?.silent ?? false

    if (!silent) {
      explorerLoading.value = true
    }

    explorerError.value = ''
    try {
      remoteDirectory.value = await window.api.ssh.listRemote({
        path,
        showHidden: showHiddenFiles.value
      })
      if (remotePreview.value && !remotePreview.value.path.startsWith(remoteDirectory.value.path)) {
        remotePreview.value = null
      }
    } catch (error) {
      explorerError.value = error instanceof Error ? error.message : 'Failed to load remote files.'
    } finally {
      if (!silent) {
        explorerLoading.value = false
      }
    }
  }

  async function openRemoteEntry(entry: RemoteEntry) {
    explorerError.value = ''
    if (entry.kind === 'directory') {
      await loadRemoteDirectory(entry.path)
      return
    }

    explorerBusy.value = true
    try {
      remotePreview.value = await window.api.ssh.readRemoteFile({ path: entry.path })
    } catch (error) {
      explorerError.value = error instanceof Error ? error.message : 'Failed to read file.'
    } finally {
      explorerBusy.value = false
    }
  }

  async function uploadRemoteFiles(files: File[]) {
    if (!remoteDirectory.value || files.length === 0) return

    explorerBusy.value = true
    explorerError.value = ''
    try {
      const nextEntries = [...remoteDirectory.value.entries]

      for (const file of files) {
        const data = new Uint8Array(await file.arrayBuffer())
        const result = await window.api.ssh.uploadRemoteFile({
          directory: remoteDirectory.value.path,
          name: file.name,
          data
        })

        const nextEntry: RemoteEntry = {
          name: file.name,
          path: result.path,
          kind: 'file',
          size: file.size,
          modifiedAt: Date.now()
        }

        const existingIndex = nextEntries.findIndex((entry) => entry.path === result.path)
        if (existingIndex >= 0) {
          nextEntries.splice(existingIndex, 1, nextEntry)
        } else {
          nextEntries.push(nextEntry)
        }
      }

      patchRemoteDirectoryEntries(() => nextEntries)
      void loadRemoteDirectory(remoteDirectory.value.path, { silent: true })
    } catch (error) {
      explorerError.value = error instanceof Error ? error.message : 'Failed to upload files.'
    } finally {
      explorerBusy.value = false
    }
  }

  async function createRemoteDirectory(name: string) {
    if (!remoteDirectory.value || !name.trim()) return

    explorerBusy.value = true
    explorerError.value = ''
    try {
      const trimmedName = name.trim()
      const basePath = remoteDirectory.value.path.replace(/\/$/, '')
      const path = `${basePath}/${trimmedName}`
      await window.api.ssh.createRemoteDirectory({ path })

      patchRemoteDirectoryEntries((entries) => [
        ...entries.filter((entry) => entry.path !== path),
        {
          name: trimmedName,
          path,
          kind: 'directory',
          size: 0,
          modifiedAt: Date.now()
        }
      ])

      void loadRemoteDirectory(remoteDirectory.value.path, { silent: true })
    } catch (error) {
      explorerError.value = error instanceof Error ? error.message : 'Failed to create directory.'
    } finally {
      explorerBusy.value = false
    }
  }

  async function renameRemoteEntry(oldPath: string, newName: string) {
    if (!remoteDirectory.value || !newName.trim()) return

    explorerBusy.value = true
    explorerError.value = ''
    try {
      const entry = remoteDirectory.value.entries.find((item) => item.path === oldPath)
      const parentPath = oldPath.slice(0, oldPath.lastIndexOf('/')) || '/'
      const newPath = parentPath === '/' ? `/${newName.trim()}` : `${parentPath}/${newName.trim()}`
      await window.api.ssh.renameRemoteEntry({ oldPath, newPath })

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
      )

      if (remotePreview.value?.path === oldPath && entry?.kind === 'file') {
        remotePreview.value = {
          ...remotePreview.value,
          path: newPath
        }
      }

      void loadRemoteDirectory(remoteDirectory.value.path, { silent: true })
    } catch (error) {
      explorerError.value = error instanceof Error ? error.message : 'Failed to rename entry.'
    } finally {
      explorerBusy.value = false
    }
  }

  async function deleteRemoteEntry(path: string) {
    if (!remoteDirectory.value) return

    explorerBusy.value = true
    explorerError.value = ''
    try {
      await window.api.ssh.deleteRemoteEntry({ path, recursive: true })

      patchRemoteDirectoryEntries((entries) => entries.filter((entry) => entry.path !== path))

      if (remotePreview.value?.path === path || remotePreview.value?.path.startsWith(`${path}/`)) {
        remotePreview.value = null
      }

      void loadRemoteDirectory(remoteDirectory.value.path, { silent: true })
    } catch (error) {
      explorerError.value = error instanceof Error ? error.message : 'Failed to delete entry.'
    } finally {
      explorerBusy.value = false
    }
  }

  async function toggleHiddenFiles() {
    showHiddenFiles.value = !showHiddenFiles.value
    if (isConnected.value) {
      await loadRemoteDirectory(remoteDirectory.value?.path)
    }
  }

  function stopMetricsRefresh() {
    if (liveMetricsRefreshTimer !== null) {
      window.clearInterval(liveMetricsRefreshTimer)
      liveMetricsRefreshTimer = null
    }

    if (fullMetricsRefreshTimer !== null) {
      window.clearInterval(fullMetricsRefreshTimer)
      fullMetricsRefreshTimer = null
    }
  }

  function startMetricsRefresh() {
    stopMetricsRefresh()
    if (!isConnected.value) return

    liveMetricsRefreshTimer = window.setInterval(() => {
      void loadLiveMetrics()
    }, LIVE_METRICS_REFRESH_INTERVAL_MS)

    fullMetricsRefreshTimer = window.setInterval(() => {
      void loadSystemMetrics({ silent: true })
      void loadRemoteApps({ silent: true })
    }, FULL_METRICS_REFRESH_INTERVAL_MS)
  }

  async function loadLiveMetrics() {
    if (!isConnected.value || liveMetricsRequestPending) {
      return
    }

    liveMetricsRequestPending = true

    try {
      const liveMetrics = await window.api.ssh.getLiveMetrics()
      if (!liveMetrics) {
        return
      }

      systemMetrics.value = systemMetrics.value
        ? {
            ...systemMetrics.value,
            ...liveMetrics
          }
        : createFallbackMetricsSnapshot(liveMetrics)
    } finally {
      liveMetricsRequestPending = false
    }
  }

  async function loadRemoteApps(options?: { silent?: boolean }) {
    if (!isConnected.value) {
      remoteApps.value = []
      remoteAppsLoading.value = false
      remoteAppsError.value = ''
      return
    }

    const silent = options?.silent ?? false
    if (!silent) {
      remoteAppsLoading.value = true
    }

    remoteAppsError.value = ''

    try {
      remoteApps.value = await window.api.ssh.getRemoteApps()
    } catch (error) {
      remoteApps.value = []
      remoteAppsError.value = error instanceof Error ? error.message : 'Failed to load remote apps.'
    } finally {
      if (!silent) {
        remoteAppsLoading.value = false
      }
    }
  }

  async function loadSystemMetrics(options?: { silent?: boolean }) {
    if (!isConnected.value || metricsRequestPending) {
      if (!isConnected.value) {
        systemMetrics.value = null
        metricsLoading.value = false
      }
      return
    }

    metricsRequestPending = true

    const silent = options?.silent ?? false
    if (!silent) {
      metricsLoading.value = true
    }

    try {
      systemMetrics.value = await window.api.ssh.getSystemMetrics()
    } catch {
      systemMetrics.value = null
    } finally {
      metricsRequestPending = false
      if (!silent) {
        metricsLoading.value = false
      }
    }
  }

  function setStatus(payload: { status: ConnectionState; message: string }) {
    status.value = payload.status
    statusMessage.value = payload.message

    if (payload.status === 'disconnected' || payload.status === 'error') {
      stopMetricsRefresh()
      remoteDirectory.value = null
      remoteApps.value = []
      remotePreview.value = null
      systemMetrics.value = null
      explorerBusy.value = false
      explorerLoading.value = false
      remoteAppsLoading.value = false
      metricsLoading.value = false
      remoteAppsError.value = ''
      metricsRequestPending = false
      liveMetricsRequestPending = false
      if (payload.status === 'disconnected') {
        explorerError.value = ''
      }
    }
  }

  function setConnectError(message: string) {
    status.value = 'error'
    statusMessage.value = message
  }

  function setSearchQuery(value: string) {
    searchQuery.value = value
  }

  function setAiInput(value: string) {
    aiInput.value = value
  }

  function toggleLocale() {
    locale.value = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN'
    applyLocale()
  }

  applyLocale()

  return {
    activeSession,
    activeSessionId,
    aiInput,
    canSaveSession,
    closeSessionModal,
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
    latencyLabel,
    loadLiveMetrics,
    loadRemoteApps,
    loadSystemMetrics,
    loadSessions,
    loadRemoteDirectory,
    locale,
    metricsLoading,
    openRemoteEntry,
    openSessionModal,
    openTabIds,
    openTabMenuAt,
    openTabs,
    removeTab,
    remoteApps,
    remoteAppsError,
    remoteAppsLoading,
    remoteDirectory,
    remotePreview,
    renameRemoteEntry,
    saveSession,
    searchQuery,
    selectSession,
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
    toggleHiddenFiles,
    toggleLocale,
    uploadRemoteFiles,
    isConnected
  }
})
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
  }
}
