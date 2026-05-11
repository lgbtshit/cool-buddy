import type { Worker } from 'node:worker_threads'
import createSystemMetricsWorker from '../workers/system-metrics-worker?nodeWorker'
import { sshExec } from './ssh-runtime'
import type { RawSystemMetrics, SystemMetrics } from '../shared/types'

function parseSystemMetricsWithWorker(payload: RawSystemMetrics): Promise<SystemMetrics | null> {
  return new Promise((resolve, reject) => {
    const worker: Worker = createSystemMetricsWorker({})

    const cleanup = () => {
      worker.removeAllListeners()
      void worker.terminate()
    }

    worker.once('message', (message: SystemMetrics | null) => {
      cleanup()
      resolve(message)
    })

    worker.once('error', (error) => {
      cleanup()
      reject(error)
    })

    worker.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Metrics worker stopped with exit code ${code}`))
      }
    })

    worker.postMessage(payload)
  })
}

export async function readSystemMetrics(): Promise<SystemMetrics | null> {
  const [cpuRaw, memoryRaw, dockerRaw, hostnameRaw, osNameRaw, kernelRaw, architectureRaw, uptimeRaw] =
    await Promise.all([
      sshExec(
        `LC_ALL=C top -bn1 2>/dev/null | awk '/Cpu\\(s\\)|%Cpu/ {for (i = 1; i <= NF; i++) if ($i ~ /id,|id/) {print 100 - $(i-1); exit}}'`
      ).catch(() => ''),
      sshExec(
        `free -m 2>/dev/null | awk '/Mem:/ {print $3 "/" $2}' || awk '/MemTotal|MemAvailable/ {print $2}' /proc/meminfo 2>/dev/null`
      )
        .then((output) => {
          const trimmed = output.trim()
          if (trimmed.includes('/')) {
            return trimmed
          }

          const [totalKbRaw = '', availableKbRaw = ''] = trimmed.split(/\r?\n/)
          const totalKb = Number.parseInt(totalKbRaw, 10)
          const availableKb = Number.parseInt(availableKbRaw, 10)
          if (!Number.isFinite(totalKb) || !Number.isFinite(availableKb)) {
            return ''
          }

          const totalMb = Math.round(totalKb / 1024)
          const usedMb = Math.max(totalMb - Math.round(availableKb / 1024), 0)
          return `${usedMb}/${totalMb}`
        })
        .catch(() => ''),
      sshExec(
        `command -v docker >/dev/null 2>&1 && (docker info -f '{{.ContainersRunning}}' 2>/dev/null || docker ps -q 2>/dev/null | wc -l | tr -d ' ') || printf ''`
      ).catch(() => ''),
      sshExec(`hostname 2>/dev/null || uname -n 2>/dev/null`).catch(() => ''),
      sshExec(
        `sh -lc 'if command -v hostnamectl >/dev/null 2>&1; then hostnamectl 2>/dev/null | awk -F: "/Operating System/ {sub(/^[[:space:]]+/, \"\", \\$2); print \\$2; exit}"; fi; if [ -r /etc/os-release ]; then . /etc/os-release 2>/dev/null; printf "%s" "\${PRETTY_NAME:-\$NAME}"; fi'`
      ).catch(() => ''),
      sshExec(`uname -r 2>/dev/null`).catch(() => ''),
      sshExec(`uname -m 2>/dev/null`).catch(() => ''),
      sshExec(`uptime -p 2>/dev/null || awk '{print int($1)}' /proc/uptime 2>/dev/null`).catch(
        () => ''
      )
    ])

  return parseSystemMetricsWithWorker({
    cpuRaw,
    memoryRaw,
    dockerRaw,
    hostnameRaw,
    osNameRaw,
    kernelRaw,
    architectureRaw,
    uptimeRaw
  }).catch(() => null)
}
