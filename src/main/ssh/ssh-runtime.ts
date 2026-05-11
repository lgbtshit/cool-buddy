import type { BrowserWindow } from 'electron'
import { Client } from 'ssh2'
import type { ClientChannel, SFTPWrapper } from 'ssh2'
import { getMainWindow } from '../state/main-window'
import type { SshLogStatusPayload, SshStatusPayload } from '../shared/types'

let sshClient: Client | null = null
let sshStream: ClientChannel | null = null
let sftp: SFTPWrapper | null = null
let sshLogStream: ClientChannel | null = null

export function sendSshStatus(window: BrowserWindow, payload: SshStatusPayload): void {
  window.webContents.send('ssh:status', payload)
}

export function broadcastSshStatus(payload: SshStatusPayload): void {
  const mainWindow = getMainWindow()
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  sendSshStatus(mainWindow, payload)
}

export function broadcastSshLogData(chunk: string): void {
  const mainWindow = getMainWindow()
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  mainWindow.webContents.send('ssh:log-data', chunk)
}

export function broadcastSshLogStatus(payload: SshLogStatusPayload): void {
  const mainWindow = getMainWindow()
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  mainWindow.webContents.send('ssh:log-status', payload)
}

export function setSshClient(client: Client | null): void {
  sshClient = client
}

export function setSshStream(stream: ClientChannel | null): void {
  sshStream = stream
}

export function getSshStream(): ClientChannel | null {
  return sshStream
}

export function setSftpClient(client: SFTPWrapper | null): void {
  sftp = client
}

export function setSshLogStream(stream: ClientChannel | null): void {
  sshLogStream = stream
}

export function ensureSftp(): SFTPWrapper {
  if (!sftp) {
    throw new Error('SFTP session is not ready.')
  }
  return sftp
}

export function ensureSshClient(): Client {
  if (!sshClient) {
    throw new Error('SSH client is not ready.')
  }
  return sshClient
}

export function disposeSshLogTail(payload?: SshLogStatusPayload): void {
  if (sshLogStream) {
    sshLogStream.removeAllListeners()
    sshLogStream.close()
    sshLogStream = null
  }

  if (payload) {
    broadcastSshLogStatus(payload)
  }
}

export function sshExec(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    ensureSshClient().exec(command, (error, stream) => {
      if (error) {
        reject(error)
        return
      }

      let stdout = ''
      let stderr = ''

      stream.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
      })

      stream.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
      })

      stream.on('close', (code) => {
        if (code && code !== 0 && !stdout.trim()) {
          reject(new Error(stderr.trim() || `Command failed with code ${code}`))
          return
        }

        resolve(stdout.trim())
      })
    })
  })
}

export function sshExecStreaming(
  command: string,
  onData?: (chunk: string) => void
): Promise<{ code: number | null }> {
  return new Promise((resolve, reject) => {
    ensureSshClient().exec(command, (error, stream) => {
      if (error) {
        reject(error)
        return
      }

      let stderr = ''

      stream.on('data', (chunk: Buffer) => {
        onData?.(chunk.toString('utf8'))
      })

      stream.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8')
        stderr += text
        onData?.(text)
      })

      stream.on('close', (code) => {
        if (code && code !== 0) {
          reject(new Error(stderr.trim() || `Command failed with code ${code}`))
          return
        }

        resolve({ code })
      })
    })
  })
}

export async function measureSshLatency(): Promise<number | null> {
  const startedAt = Date.now()

  try {
    await sshExec(':')
    return Date.now() - startedAt
  } catch {
    return null
  }
}

export function disposeSsh(window?: BrowserWindow): void {
  disposeSshLogTail({
    status: 'idle',
    path: '',
    message: 'Log stream stopped.'
  })

  if (sshStream) {
    sshStream.removeAllListeners()
    sshStream.close()
    sshStream = null
  }

  if (sftp) {
    sftp.end()
    sftp = null
  }

  if (sshClient) {
    sshClient.removeAllListeners()
    sshClient.end()
    sshClient = null
  }

  const statusWindow = window ?? getMainWindow()
  if (statusWindow && !statusWindow.isDestroyed()) {
    sendSshStatus(statusWindow, {
      status: 'disconnected',
      message: 'SSH connection closed.'
    })
  }
}
