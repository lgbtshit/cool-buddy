import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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

const api = {
  sessions: {
    list: (): Promise<SessionItem[]> => ipcRenderer.invoke('sessions:list'),
    create: (payload: CreateSessionPayload): Promise<SessionItem> =>
      ipcRenderer.invoke('sessions:create', payload)
  },
  ssh: {
    connect: (payload: SshConnectPayload): Promise<{ ok: true; remotePath: string }> =>
      ipcRenderer.invoke('ssh:connect', payload),
    disconnect: () => ipcRenderer.invoke('ssh:disconnect'),
    listRemote: (payload?: { path?: string; showHidden?: boolean }): Promise<RemoteDirectory> =>
      ipcRenderer.invoke('ssh:list-remote', payload),
    readRemoteFile: (payload: { path: string }): Promise<{ path: string; content: string }> =>
      ipcRenderer.invoke('ssh:read-remote-file', payload),
    uploadRemoteFile: (payload: {
      directory: string
      name: string
      data: Uint8Array
    }): Promise<{ ok: true; path: string }> => ipcRenderer.invoke('ssh:upload-remote-file', payload),
    createRemoteDirectory: (payload: { path: string }): Promise<{ ok: true; path: string }> =>
      ipcRenderer.invoke('ssh:create-remote-directory', payload),
    renameRemoteEntry: (payload: {
      oldPath: string
      newPath: string
    }): Promise<{ ok: true; path: string }> => ipcRenderer.invoke('ssh:rename-remote-entry', payload),
    deleteRemoteEntry: (payload: {
      path: string
      recursive?: boolean
    }): Promise<{ ok: true; path: string }> => ipcRenderer.invoke('ssh:delete-remote-entry', payload),
    getSystemMetrics: (): Promise<SystemMetrics | null> => ipcRenderer.invoke('ssh:get-system-metrics'),
    input: (data: string) => ipcRenderer.send('ssh:input', data),
    resize: (size: { cols: number; rows: number }) => ipcRenderer.send('ssh:resize', size),
    onData: (listener: (data: string) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, data: string) => listener(data)
      ipcRenderer.on('ssh:data', wrapped)
      return () => ipcRenderer.removeListener('ssh:data', wrapped)
    },
    onStatus: (listener: (payload: SshStatusPayload) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: SshStatusPayload) =>
        listener(payload)
      ipcRenderer.on('ssh:status', wrapped)
      return () => ipcRenderer.removeListener('ssh:status', wrapped)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
