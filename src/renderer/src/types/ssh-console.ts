export type Locale = 'zh-CN' | 'en-US'

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
export type SessionGroup = 'production' | 'staging' | 'local'
export type SessionStatus = 'online' | 'warning' | 'offline'
export type SessionIcon = 'server' | 'database' | 'hardDrive'

export type SessionItem = {
  id: string
  name: string
  group: SessionGroup
  host: string
  port: number
  username: string
  password: string
  status: SessionStatus
  icon: SessionIcon
}

export type SessionDraft = {
  name: string
  group: SessionGroup
  host: string
  port: number
  username: string
  password: string
}

export type ConnectionForm = {
  host: string
  port: number
  username: string
  password: string
}

export type TabMenuState = {
  sessionId: string
  x: number
  y: number
}

export type RemoteEntry = {
  name: string
  path: string
  kind: 'file' | 'directory' | 'symlink'
  size: number
  modifiedAt: number | null
}

export type RemoteDirectory = {
  path: string
  entries: RemoteEntry[]
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
