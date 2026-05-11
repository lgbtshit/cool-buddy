import { ElectronAPI } from '@electron-toolkit/preload'

type SshConnectPayload = {
  host: string
  port: number
  username: string
  password: string
}

type SshCommandBatchPayload = {
  content: string
}

type SshLogTailPayload = {
  path: string
  lineCount: number
}

type SshStatusPayload = {
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  message: string
}

type SshLogStatusPayload = {
  status: 'idle' | 'running' | 'error'
  path: string
  message: string
}

type SessionGroup = 'production' | 'staging' | 'local'

type SessionItem = {
  id: string
  name: string
  group: SessionGroup
  host: string
  port: number
  username: string
  password: string
  status: 'online' | 'warning' | 'offline'
  icon: 'server' | 'database' | 'hardDrive'
}

type CreateSessionPayload = {
  name: string
  group: SessionGroup
  host: string
  port: number
  username: string
  password: string
}

type RemoteEntry = {
  name: string
  path: string
  kind: 'file' | 'directory' | 'symlink'
  size: number
  modifiedAt: number | null
}

type RemoteDirectory = {
  path: string
  entries: RemoteEntry[]
}

type RemotePathCompletionPayload = {
  input: string
  basePath?: string
  filesOnly?: boolean
}

type RemotePathCompletionResult = {
  value: string
  matches: string[]
}

type SystemMetrics = {
  cpuPercent: number
  memoryUsedMb: number
  memoryTotalMb: number
  dockerRunning: number | null
  hostname: string | null
  osName: string | null
  kernelVersion: string | null
  architecture: string | null
  uptime: string | null
}

type LiveSystemMetrics = Pick<SystemMetrics, 'cpuPercent' | 'memoryUsedMb' | 'memoryTotalMb'>

type RemoteApp = {
  id: string
  name: string
  kind: 'service' | 'docker'
  status: string
  runtime: string | null
  image: string | null
  ports: string | null
  description: string | null
}

type AppApi = {
  sessions: {
    list: () => Promise<SessionItem[]>
    create: (payload: CreateSessionPayload) => Promise<SessionItem>
    delete: (sessionId: string) => Promise<{ ok: true }>
  }
  ssh: {
    connect: (payload: SshConnectPayload) => Promise<{ ok: true; remotePath: string }>
    executeCommandBatch: (payload: SshCommandBatchPayload) => Promise<{ ok: true }>
    startLogTail: (payload: SshLogTailPayload) => Promise<{ ok: true }>
    stopLogTail: () => Promise<{ ok: true }>
    disconnect: () => Promise<{ ok: true }>
    listRemote: (payload?: { path?: string; showHidden?: boolean }) => Promise<RemoteDirectory>
    completeRemotePath: (payload: RemotePathCompletionPayload) => Promise<RemotePathCompletionResult>
    readRemoteFile: (payload: { path: string }) => Promise<{ path: string; content: string }>
    uploadRemoteFile: (payload: {
      directory: string
      name: string
      data: Uint8Array
    }) => Promise<{ ok: true; path: string }>
    createRemoteDirectory: (payload: { path: string }) => Promise<{ ok: true; path: string }>
    renameRemoteEntry: (payload: {
      oldPath: string
      newPath: string
    }) => Promise<{ ok: true; path: string }>
    deleteRemoteEntry: (payload: {
      path: string
      recursive?: boolean
    }) => Promise<{ ok: true; path: string }>
    getLatency: () => Promise<number | null>
    getSystemMetrics: () => Promise<SystemMetrics | null>
    getLiveMetrics: () => Promise<LiveSystemMetrics | null>
    getRemoteApps: () => Promise<RemoteApp[]>
    input: (data: string) => void
    resize: (size: { cols: number; rows: number }) => void
    onData: (listener: (data: string) => void) => () => void
    onStatus: (listener: (payload: SshStatusPayload) => void) => () => void
    onLogData: (listener: (data: string) => void) => () => void
    onLogStatus: (listener: (payload: SshLogStatusPayload) => void) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppApi
  }
}
