import { sshExec } from './ssh-runtime'
import type { RemoteApp } from '../shared/types'

const servicesCommand =
  'sh -lc \'if command -v systemctl >/dev/null 2>&1; then systemctl list-units --type=service --state=running --no-legend --no-pager 2>/dev/null | awk \'{print $1 "\\t" $4 "\\t" substr($0, index($0, $5))}\' | head -n 12; fi\''

const dockerCommand = `sh -lc 'if command -v docker >/dev/null 2>&1; then docker ps --format "{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}" 2>/dev/null | head -n 12; fi'`

function parseServices(output: string): RemoteApp[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = '', status = '', description = ''] = line.split('\t')

      return {
        id: `service:${name}`,
        name,
        kind: 'service' as const,
        status,
        runtime: null,
        image: null,
        ports: null,
        description: description || null
      }
    })
}

function parseDocker(output: string): RemoteApp[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id = '', name = '', status = '', image = '', ports = ''] = line.split('\t')

      return {
        id: `docker:${id || name}`,
        name: name || id,
        kind: 'docker' as const,
        status,
        runtime: null,
        image: image || null,
        ports: ports || null,
        description: null
      }
    })
}

export async function readRemoteApps(): Promise<RemoteApp[]> {
  const [servicesRaw, dockerRaw] = await Promise.all([
    sshExec(servicesCommand).catch(() => ''),
    sshExec(dockerCommand).catch(() => '')
  ])

  return [...parseDocker(dockerRaw), ...parseServices(servicesRaw)]
}
