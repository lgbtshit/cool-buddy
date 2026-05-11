export type SshConnectPayload = {
  host: string
  port: number
  username: string
  password: string
}

export type SshCommandBatchPayload = {
  content: string
}

export type SshStatusPayload = {
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  message: string
}

export type SessionGroup = 'production' | 'staging' | 'local'

export type SessionRecord = {
  id: string
  name: string
  group_name: SessionGroup
  host: string
  port: number
  username: string
  password: string
  created_at: string
}

export type SessionItem = {
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

export type CreateSessionPayload = {
  name: string
  group: SessionGroup
  host: string
  port: number
  username: string
  password: string
}

export type RemoteEntry = {
  name: string
  path: string
  kind: 'file' | 'directory' | 'symlink'
  size: number
  modifiedAt: number | null
}

export type RemoteListPayload = {
  path?: string
  showHidden?: boolean
}

export type RemoteReadPayload = {
  path: string
}

export type RemoteUploadPayload = {
  directory: string
  name: string
  data: Uint8Array
}

export type RemoteMkdirPayload = {
  path: string
}

export type RemoteRenamePayload = {
  oldPath: string
  newPath: string
}

export type RemoteDeletePayload = {
  path: string
  recursive?: boolean
}

export type SystemMetrics = {
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

export type LiveSystemMetrics = Pick<SystemMetrics, 'cpuPercent' | 'memoryUsedMb' | 'memoryTotalMb'>

export type RawSystemMetrics = {
  cpuRaw: string
  memoryRaw: string
  dockerRaw: string
  hostnameRaw: string
  osNameRaw: string
  kernelRaw: string
  architectureRaw: string
  uptimeRaw: string
}

export type RemoteAppKind = 'service' | 'docker'

export type RemoteApp = {
  id: string
  name: string
  kind: RemoteAppKind
  status: string
  runtime: string | null
  image: string | null
  ports: string | null
  description: string | null
}
