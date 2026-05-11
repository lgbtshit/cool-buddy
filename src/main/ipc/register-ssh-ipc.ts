import { ipcMain } from 'electron'
import { Client } from 'ssh2'
import type { ConnectConfig } from 'ssh2'
import { getMainWindow } from '../state/main-window'
import {
  broadcastSshStatus,
  disposeSsh,
  getSshStream,
  setSftpClient,
  setSshClient,
  setSshStream
} from '../ssh/ssh-runtime'
import {
  createRemoteDirectory,
  deleteRemoteEntry,
  listRemoteDirectory,
  readRemoteFile,
  renameRemoteEntry,
  sftpRealpath,
  uploadRemoteFile
} from '../ssh/remote-files'
import { readRemoteApps } from '../ssh/remote-apps'
import { readLiveSystemMetrics, readSystemMetrics } from '../ssh/system-metrics'
import type { SshConnectPayload } from '../shared/types'

let sshHandlersRegistered = false

export function registerSshIpc(): void {
  if (sshHandlersRegistered) {
    return
  }

  ipcMain.handle('ssh:connect', async (_event, payload: SshConnectPayload) => {
    disposeSsh()
    broadcastSshStatus({
      status: 'connecting',
      message: `Connecting to ${payload.host}:${payload.port}...`
    })

    const client = new Client()
    setSshClient(client)

    return await new Promise<{ ok: true; remotePath: string }>((resolve, reject) => {
      let settled = false

      const finalizeError = (message: string): void => {
        if (settled) return
        settled = true
        disposeSsh()
        broadcastSshStatus({
          status: 'error',
          message
        })
        reject(new Error(message))
      }

      client
        .on('ready', () => {
          client.sftp((sftpError, sftpClient) => {
            if (sftpError) {
              finalizeError(sftpError.message)
              return
            }

            setSftpClient(sftpClient)
            client.shell(
              {
                cols: 120,
                rows: 32,
                term: 'xterm-256color'
              },
              async (error, stream) => {
                if (error) {
                  finalizeError(error.message)
                  return
                }

                setSshStream(stream)
                stream.on('data', (chunk: Buffer) => {
                  const mainWindow = getMainWindow()
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('ssh:data', chunk.toString('utf8'))
                  }
                })

                stream.on('close', () => {
                  disposeSsh()
                })

                settled = true
                const remotePath = await sftpRealpath('.').catch(() => '.')
                broadcastSshStatus({
                  status: 'connected',
                  message: `Connected to ${payload.host}:${payload.port}`
                })
                resolve({ ok: true, remotePath })
              }
            )
          })
        })
        .on('error', (error) => {
          finalizeError(error.message)
        })
        .on('close', () => {
          if (!settled) {
            finalizeError('Connection closed before the shell was ready.')
            return
          }

          disposeSsh()
        })

      const connectConfig: ConnectConfig = {
        host: payload.host,
        port: payload.port,
        username: payload.username,
        password: payload.password,
        tryKeyboard: false,
        readyTimeout: 20000
      }

      client.connect(connectConfig)
    })
  })

  ipcMain.on('ssh:input', (_event, data: string) => {
    getSshStream()?.write(data)
  })

  ipcMain.on('ssh:resize', (_event, size: { cols: number; rows: number }) => {
    getSshStream()?.setWindow(size.rows, size.cols, 0, 0)
  })

  ipcMain.handle('ssh:disconnect', async () => {
    disposeSsh()
    return { ok: true }
  })

  ipcMain.handle('ssh:list-remote', async (_event, payload) => listRemoteDirectory(payload))
  ipcMain.handle('ssh:read-remote-file', async (_event, payload) => readRemoteFile(payload))
  ipcMain.handle('ssh:upload-remote-file', async (_event, payload) => uploadRemoteFile(payload))
  ipcMain.handle('ssh:create-remote-directory', async (_event, payload) =>
    createRemoteDirectory(payload)
  )
  ipcMain.handle('ssh:rename-remote-entry', async (_event, payload) => renameRemoteEntry(payload))
  ipcMain.handle('ssh:delete-remote-entry', async (_event, payload) => deleteRemoteEntry(payload))
  ipcMain.handle('ssh:get-system-metrics', async () => readSystemMetrics())
  ipcMain.handle('ssh:get-live-metrics', async () => readLiveSystemMetrics())
  ipcMain.handle('ssh:get-remote-apps', async () => readRemoteApps())

  sshHandlersRegistered = true
}
