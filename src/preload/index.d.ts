import { ElectronAPI } from '@electron-toolkit/preload'

type SshConnectPayload = {
  host: string
  port: number
  username: string
  password: string
}

type SshStatusPayload = {
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
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

type AppApi = {
  sessions: {
    list: () => Promise<SessionItem[]>
    create: (payload: CreateSessionPayload) => Promise<SessionItem>
  }
  ssh: {
    connect: (payload: SshConnectPayload) => Promise<{ ok: true; remotePath: string }>
    disconnect: () => Promise<{ ok: true }>
    listRemote: (payload?: { path?: string; showHidden?: boolean }) => Promise<RemoteDirectory>
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
    deleteRemoteEntry: (payload: { path: string; recursive?: boolean }) => Promise<{ ok: true; path: string }>
    getSystemMetrics: () => Promise<SystemMetrics | null>
    input: (data: string) => void
    resize: (size: { cols: number; rows: number }) => void
    onData: (listener: (data: string) => void) => () => void
    onStatus: (listener: (payload: SshStatusPayload) => void) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppApi
  }
}
