import { sshExec } from '../../src/main/ssh/ssh-runtime';
import type { LiveSystemMetrics, RawSystemMetrics, SystemMetrics } from '../../src/main/shared/types';

const prettyNameExpansion = '${PRETTY_NAME:-$NAME}';
const osNameCommand = `sh -lc 'if command -v hostnamectl >/dev/null 2>&1; then hostnamectl 2>/dev/null | awk -F: "/Operating System/ {sub(/^[[:space:]]+/, "", $2); print $2; exit}"; fi; if [ -r /etc/os-release ]; then . /etc/os-release 2>/dev/null; printf "%s" "${prettyNameExpansion}"; fi'`;

function normalizeText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatUptimeSeconds(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const segments: string[] = [];

  if (days > 0) segments.push(`${days}d`);
  if (hours > 0) segments.push(`${hours}h`);
  if (minutes > 0) segments.push(`${minutes}m`);

  if (segments.length === 0) {
    segments.push(`${Math.max(totalSeconds, 0)}s`);
  }

  return segments.join(' ');
}

function parseSystemMetrics(payload: RawSystemMetrics): SystemMetrics | null {
  const [memoryUsedRaw = '', memoryTotalRaw = ''] = payload.memoryRaw.split('/');

  const cpuPercent = Number.parseFloat(payload.cpuRaw.trim());
  const memoryUsedMb = Number.parseInt(memoryUsedRaw.trim(), 10);
  const memoryTotalMb = Number.parseInt(memoryTotalRaw.trim(), 10);

  if (![cpuPercent, memoryUsedMb, memoryTotalMb].every(Number.isFinite)) {
    return null;
  }

  const dockerRunning = payload.dockerRaw.trim() ? Number.parseInt(payload.dockerRaw, 10) : null;
  const uptimeText = normalizeText(payload.uptimeRaw.replace(/^up\s+/i, ''));
  const uptimeSeconds = Number.parseInt(payload.uptimeRaw.trim(), 10);
  const uptime =
    uptimeText && /^\d+$/.test(uptimeText)
      ? formatUptimeSeconds(Number.parseInt(uptimeText, 10))
      : (uptimeText ?? (Number.isFinite(uptimeSeconds) ? formatUptimeSeconds(uptimeSeconds) : null));

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
  };
}

function parseLiveMetrics(cpuRaw: string, memoryRaw: string): LiveSystemMetrics | null {
  const [memoryUsedRaw = '', memoryTotalRaw = ''] = memoryRaw.split('/');
  const cpuPercent = Number.parseFloat(cpuRaw.trim());
  const memoryUsedMb = Number.parseInt(memoryUsedRaw.trim(), 10);
  const memoryTotalMb = Number.parseInt(memoryTotalRaw.trim(), 10);

  if (![cpuPercent, memoryUsedMb, memoryTotalMb].every(Number.isFinite)) {
    return null;
  }

  return {
    cpuPercent: Number(cpuPercent.toFixed(1)),
    memoryUsedMb,
    memoryTotalMb
  };
}

async function readCpuAndMemoryRaw(): Promise<{ cpuRaw: string; memoryRaw: string }> {
  const [cpuRaw, memoryRaw] = await Promise.all([
    sshExec(
      `LC_ALL=C top -bn1 2>/dev/null | awk '/Cpu\\(s\\)|%Cpu/ {for (i = 1; i <= NF; i++) if ($i ~ /id,|id/) {print 100 - $(i-1); exit}}'`
    ).catch(() => ''),
    sshExec(
      `free -m 2>/dev/null | awk '/Mem:/ {print $3 "/" $2}' || awk '/MemTotal|MemAvailable/ {print $2}' /proc/meminfo 2>/dev/null`
    )
      .then((output) => {
        const trimmed = output.trim();
        if (trimmed.includes('/')) {
          return trimmed;
        }

        const [totalKbRaw = '', availableKbRaw = ''] = trimmed.split(/\r?\n/);
        const totalKb = Number.parseInt(totalKbRaw, 10);
        const availableKb = Number.parseInt(availableKbRaw, 10);
        if (!Number.isFinite(totalKb) || !Number.isFinite(availableKb)) {
          return '';
        }

        const totalMb = Math.round(totalKb / 1024);
        const usedMb = Math.max(totalMb - Math.round(availableKb / 1024), 0);
        return `${usedMb}/${totalMb}`;
      })
      .catch(() => '')
  ]);

  return { cpuRaw, memoryRaw };
}

export async function readSystemMetrics(): Promise<SystemMetrics | null> {
  const [
    { cpuRaw, memoryRaw },
    dockerRaw,
    hostnameRaw,
    osNameRaw,
    kernelRaw,
    architectureRaw,
    uptimeRaw
  ] = await Promise.all([
    readCpuAndMemoryRaw(),
    sshExec(
      `command -v docker >/dev/null 2>&1 && (docker info -f '{{.ContainersRunning}}' 2>/dev/null || docker ps -q 2>/dev/null | wc -l | tr -d ' ') || printf ''`
    ).catch(() => ''),
    sshExec(`hostname 2>/dev/null || uname -n 2>/dev/null`).catch(() => ''),
    sshExec(osNameCommand).catch(() => ''),
    sshExec(`uname -r 2>/dev/null`).catch(() => ''),
    sshExec(`uname -m 2>/dev/null`).catch(() => ''),
    sshExec(`uptime -p 2>/dev/null || awk '{print int($1)}' /proc/uptime 2>/dev/null`).catch(
      () => ''
    )
  ]);

  return parseSystemMetrics({
    cpuRaw,
    memoryRaw,
    dockerRaw,
    hostnameRaw,
    osNameRaw,
    kernelRaw,
    architectureRaw,
    uptimeRaw
  });
}

export async function readLiveSystemMetrics(): Promise<LiveSystemMetrics | null> {
  const { cpuRaw, memoryRaw } = await readCpuAndMemoryRaw();
  return parseLiveMetrics(cpuRaw, memoryRaw);
}
