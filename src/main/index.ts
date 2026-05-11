import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import { basename, join, posix } from 'path'
import type { Worker } from 'node:worker_threads'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { Client } from 'ssh2'
import type { ClientChannel, ConnectConfig, SFTPWrapper, FileEntry } from 'ssh2'
import Database from 'better-sqlite3'
import createSystemMetricsWorker from './workers/system-metrics-worker?nodeWorker'
import icon from '../../resources/icon.png?asset'

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

type SessionRecord = {
  id: string
  name: string
  group_name: SessionGroup
  host: string
  port: number
  username: string
  password: string
  created_at: string
}

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

type RemoteListPayload = {
  path?: string
  showHidden?: boolean
}

type RemoteReadPayload = {
  path: string
}

type RemoteUploadPayload = {
  directory: string
  name: string
  data: Uint8Array
}

type RemoteMkdirPayload = {
  path: string
}

type RemoteRenamePayload = {
  oldPath: string
  newPath: string
}

type RemoteDeletePayload = {
  path: string
  recursive?: boolean
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

let sshClient: Client | null = null
let sshStream: ClientChannel | null = null
let sftp: SFTPWrapper | null = null
let sshHandlersRegistered = false
let dataHandlersRegistered = false
let database: Database.Database | null = null
let mainWindowRef: BrowserWindow | null = null

function getSessionStatus(group: SessionGroup): SessionItem['status'] {
  if (group === 'production') return 'online'
  if (group === 'staging') return 'warning'
  return 'offline'
}

function getSessionIcon(group: SessionGroup): SessionItem['icon'] {
  if (group === 'production') return 'server'
  if (group === 'staging') return 'database'
  return 'hardDrive'
}

function mapSession(record: SessionRecord): SessionItem {
  return {
    id: record.id,
    name: record.name,
    group: record.group_name,
    host: record.host,
    port: record.port,
    username: record.username,
    password: record.password,
    status: getSessionStatus(record.group_name),
    icon: getSessionIcon(record.group_name)
  }
}

function getDatabase(): Database.Database {
  if (database) {
    return database
  }

  const dataDir = join(app.getPath('home'), '.cool-buddy')
  mkdirSync(dataDir, { recursive: true })

  database = new Database(join(dataDir, 'cool-buddy.db'))
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      group_name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `)

  return database
}

function registerDataHandlers(): void {
  if (dataHandlersRegistered) {
    return
  }

  ipcMain.handle('sessions:list', async () => {
    const rows = getDatabase()
      .prepare(
        `
          SELECT id, name, group_name, host, port, username, password, created_at
          FROM sessions
          ORDER BY datetime(created_at) ASC, rowid ASC
        `
      )
      .all() as SessionRecord[]

    return rows.map(mapSession)
  })

  ipcMain.handle('sessions:create', async (_event, payload: CreateSessionPayload) => {
    const trimmed = {
      name: payload.name.trim(),
      group: payload.group,
      host: payload.host.trim(),
      port: Number(payload.port),
      username: payload.username.trim(),
      password: payload.password
    }

    if (!trimmed.name || !trimmed.host || !trimmed.username || !trimmed.port) {
      throw new Error('Session fields are incomplete.')
    }

    const record: SessionRecord = {
      id: randomUUID(),
      name: trimmed.name,
      group_name: trimmed.group,
      host: trimmed.host,
      port: trimmed.port,
      username: trimmed.username,
      password: trimmed.password,
      created_at: new Date().toISOString()
    }

    getDatabase()
      .prepare(
        `
          INSERT INTO sessions (id, name, group_name, host, port, username, password, created_at)
          VALUES (@id, @name, @group_name, @host, @port, @username, @password, @created_at)
        `
      )
      .run(record)

    return mapSession(record)
  })

  dataHandlersRegistered = true
}

function sendSshStatus(window: BrowserWindow, payload: SshStatusPayload): void {
  window.webContents.send('ssh:status', payload)
}

function broadcastSshStatus(payload: SshStatusPayload): void {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) {
    return
  }

  sendSshStatus(mainWindowRef, payload)
}

function normalizeRemotePath(inputPath: string): string {
  if (!inputPath) return '.'
  const normalized = posix.normalize(inputPath.replace(/\\/g, '/'))
  return normalized === '' ? '.' : normalized
}

function joinRemotePath(parentPath: string, childName: string): string {
  const normalizedParent = normalizeRemotePath(parentPath)
  if (normalizedParent === '/') {
    return posix.join('/', childName)
  }
  return posix.join(normalizedParent, childName)
}

function getEntryKind(entry: FileEntry): RemoteEntry['kind'] {
  if (entry.longname.startsWith('d')) return 'directory'
  if (entry.longname.startsWith('l')) return 'symlink'
  return 'file'
}

function ensureSftp(): SFTPWrapper {
  if (!sftp) {
    throw new Error('SFTP session is not ready.')
  }
  return sftp
}

function ensureSshClient(): Client {
  if (!sshClient) {
    throw new Error('SSH client is not ready.')
  }
  return sshClient
}

function sshExec(command: string): Promise<string> {
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

async function readSystemMetrics(): Promise<SystemMetrics | null> {
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

function sftpReaddir(pathname: string): Promise<FileEntry[]> {
  return new Promise((resolve, reject) => {
    ensureSftp().readdir(pathname, (error, list) => {
      if (error) {
        reject(error)
        return
      }

      resolve(list)
    })
  })
}

function sftpRealpath(pathname: string): Promise<string> {
  return new Promise((resolve, reject) => {
    ensureSftp().realpath(pathname, (error, resolvedPath) => {
      if (error) {
        reject(error)
        return
      }

      resolve(resolvedPath)
    })
  })
}

function sftpReadFile(pathname: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    ensureSftp().readFile(pathname, (error, buffer) => {
      if (error) {
        reject(error)
        return
      }

      resolve(buffer)
    })
  })
}

function sftpWriteFile(pathname: string, data: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureSftp().writeFile(pathname, Buffer.from(data), (error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

function sftpMkdir(pathname: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureSftp().mkdir(pathname, (error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

function sftpRename(oldPath: string, newPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureSftp().rename(oldPath, newPath, (error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

function sftpUnlink(pathname: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureSftp().unlink(pathname, (error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

function sftpRmdir(pathname: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureSftp().rmdir(pathname, (error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

async function removeRemoteEntry(pathname: string, recursive = false): Promise<void> {
  const entries = await sftpReaddir(pathname).catch(() => null)
  if (!entries) {
    await sftpUnlink(pathname)
    return
  }

  if (entries.length > 0 && !recursive) {
    throw new Error('Directory is not empty.')
  }

  for (const entry of entries) {
    const childPath = joinRemotePath(pathname, entry.filename)
    const kind = getEntryKind(entry)
    if (kind === 'directory') {
      await removeRemoteEntry(childPath, true)
    } else {
      await sftpUnlink(childPath)
    }
  }

  await sftpRmdir(pathname)
}

function disposeSsh(window?: BrowserWindow): void {
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

  const statusWindow = window ?? mainWindowRef
  if (statusWindow && !statusWindow.isDestroyed()) {
    sendSshStatus(statusWindow, {
      status: 'disconnected',
      message: 'SSH connection closed.'
    })
  }
}

function registerSshHandlers(): void {
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
    sshClient = client

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

            sftp = sftpClient
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

                sshStream = stream
                stream.on('data', (chunk: Buffer) => {
                  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
                    mainWindowRef.webContents.send('ssh:data', chunk.toString('utf8'))
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
    sshStream?.write(data)
  })

  ipcMain.on('ssh:resize', (_event, size: { cols: number; rows: number }) => {
    sshStream?.setWindow(size.rows, size.cols, 0, 0)
  })

  ipcMain.handle('ssh:disconnect', async () => {
    disposeSsh()
    return { ok: true }
  })

  ipcMain.handle('ssh:list-remote', async (_event, payload?: RemoteListPayload) => {
    const requestedPath = normalizeRemotePath(payload?.path ?? '.')
    const showHidden = payload?.showHidden ?? false
    const resolvedPath = await sftpRealpath(requestedPath).catch(() => requestedPath)
    const rows = await sftpReaddir(resolvedPath)

    const entries: RemoteEntry[] = rows
      .filter((entry) => {
        if (entry.filename === '.' || entry.filename === '..') {
          return false
        }

        if (!showHidden && entry.filename.startsWith('.')) {
          return false
        }

        return true
      })
      .map((entry) => ({
        name: entry.filename,
        path: joinRemotePath(resolvedPath, entry.filename),
        kind: getEntryKind(entry),
        size: entry.attrs.size,
        modifiedAt: entry.attrs.mtime ? entry.attrs.mtime * 1000 : null
      }))
      .sort((left, right) => {
        if (left.kind !== right.kind) {
          return left.kind === 'directory' ? -1 : 1
        }
        return left.name.localeCompare(right.name)
      })

    return {
      path: resolvedPath,
      entries
    }
  })

  ipcMain.handle('ssh:read-remote-file', async (_event, payload: RemoteReadPayload) => {
    const targetPath = normalizeRemotePath(payload.path)
    const fileBuffer = await sftpReadFile(targetPath)
    return {
      path: targetPath,
      content: fileBuffer.toString('utf8')
    }
  })

  ipcMain.handle('ssh:upload-remote-file', async (_event, payload: RemoteUploadPayload) => {
    const remotePath = joinRemotePath(normalizeRemotePath(payload.directory), basename(payload.name))
    await sftpWriteFile(remotePath, payload.data)
    return { ok: true, path: remotePath }
  })

  ipcMain.handle('ssh:create-remote-directory', async (_event, payload: RemoteMkdirPayload) => {
    const targetPath = normalizeRemotePath(payload.path)
    await sftpMkdir(targetPath)
    return { ok: true, path: targetPath }
  })

  ipcMain.handle('ssh:rename-remote-entry', async (_event, payload: RemoteRenamePayload) => {
    const oldPath = normalizeRemotePath(payload.oldPath)
    const newPath = normalizeRemotePath(payload.newPath)
    await sftpRename(oldPath, newPath)
    return { ok: true, path: newPath }
  })

  ipcMain.handle('ssh:delete-remote-entry', async (_event, payload: RemoteDeletePayload) => {
    const targetPath = normalizeRemotePath(payload.path)
    await removeRemoteEntry(targetPath, payload.recursive ?? true)
    return { ok: true, path: targetPath }
  })

  ipcMain.handle('ssh:get-system-metrics', async () => {
    return readSystemMetrics()
  })

  sshHandlersRegistered = true
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindowRef = mainWindow

  registerSshHandlers()
  registerDataHandlers()

  if (is.dev) {
    mainWindow.webContents.on('before-input-event', (_event, input) => {
      const key = input.key.toLowerCase()

      if (key === 'f5') {
        mainWindow.webContents.reloadIgnoringCache()
      }

      if (key === 'f12') {
        mainWindow.webContents.toggleDevTools()
      }
    })
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    if (mainWindowRef === mainWindow) {
      mainWindowRef = null
    }
    disposeSsh()
  })
}

app
  .whenReady()
  .then(() => {
    electronApp.setAppUserModelId('com.electron')
    getDatabase()

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((error) => {
    console.error('Failed to initialize app:', error)
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  database?.close()
  database = null
})
