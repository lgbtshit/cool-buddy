import { parentPort } from 'node:worker_threads'

type RawSystemMetrics = {
  cpuRaw: string
  memoryRaw: string
  dockerRaw: string
  hostnameRaw: string
  osNameRaw: string
  kernelRaw: string
  architectureRaw: string
  uptimeRaw: string
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

function normalizeText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function formatUptimeSeconds(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const segments: string[] = []

  if (days > 0) segments.push(`${days}d`)
  if (hours > 0) segments.push(`${hours}h`)
  if (minutes > 0) segments.push(`${minutes}m`)

  if (segments.length === 0) {
    segments.push(`${Math.max(totalSeconds, 0)}s`)
  }

  return segments.join(' ')
}

function parseSystemMetrics(payload: RawSystemMetrics): SystemMetrics | null {
  const [memoryUsedRaw = '', memoryTotalRaw = ''] = payload.memoryRaw.split('/')

  const cpuPercent = Number.parseFloat(payload.cpuRaw.trim())
  const memoryUsedMb = Number.parseInt(memoryUsedRaw.trim(), 10)
  const memoryTotalMb = Number.parseInt(memoryTotalRaw.trim(), 10)

  if (![cpuPercent, memoryUsedMb, memoryTotalMb].every(Number.isFinite)) {
    return null
  }

  const dockerRunning = payload.dockerRaw.trim() ? Number.parseInt(payload.dockerRaw, 10) : null
  const uptimeText = normalizeText(payload.uptimeRaw.replace(/^up\s+/i, ''))
  const uptimeSeconds = Number.parseInt(payload.uptimeRaw.trim(), 10)
  const uptime =
    uptimeText && /^\d+$/.test(uptimeText)
      ? formatUptimeSeconds(Number.parseInt(uptimeText, 10))
      : (uptimeText ?? (Number.isFinite(uptimeSeconds) ? formatUptimeSeconds(uptimeSeconds) : null))

  return {
    cpuPercent: Number(cpuPercent.toFixed(1)),
    memoryUsedMb,
    memoryTotalMb,
    dockerRunning: Number.isFinite(dockerRunning) ? dockerRunning : null,
    hostname: normalizeText(payload.hostnameRaw),
    osName: normalizeText(payload.osNameRaw),
    kernelVersion: normalizeText(payload.kernelRaw),
    architecture: normalizeText(payload.architectureRaw),
    uptime
  }
}

const metricsPort = parentPort

if (metricsPort) {
  metricsPort.on('message', (payload: RawSystemMetrics) => {
    metricsPort.postMessage(parseSystemMetrics(payload))
  })
}
