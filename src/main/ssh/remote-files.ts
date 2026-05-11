import { basename, posix } from 'path'
import type { FileEntry } from 'ssh2'
import { ensureSftp } from './ssh-runtime'
import type {
  RemoteDeletePayload,
  RemoteEntry,
  RemoteListPayload,
  RemoteMkdirPayload,
  RemoteReadPayload,
  RemoteRenamePayload,
  RemoteUploadPayload
} from '../shared/types'

export function normalizeRemotePath(inputPath: string): string {
  if (!inputPath) return '.'
  const normalized = posix.normalize(inputPath.replace(/\\/g, '/'))
  return normalized === '' ? '.' : normalized
}

export function joinRemotePath(parentPath: string, childName: string): string {
  const normalizedParent = normalizeRemotePath(parentPath)
  if (normalizedParent === '/') {
    return posix.join('/', childName)
  }
  return posix.join(normalizedParent, childName)
}

export function getEntryKind(entry: FileEntry): RemoteEntry['kind'] {
  if (entry.longname.startsWith('d')) return 'directory'
  if (entry.longname.startsWith('l')) return 'symlink'
  return 'file'
}

export function sftpReaddir(pathname: string): Promise<FileEntry[]> {
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

export function sftpRealpath(pathname: string): Promise<string> {
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

export function sftpReadFile(pathname: string): Promise<Buffer> {
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

export function sftpWriteFile(pathname: string, data: Uint8Array): Promise<void> {
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

export function sftpMkdir(pathname: string): Promise<void> {
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

export function sftpRename(oldPath: string, newPath: string): Promise<void> {
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

export function sftpUnlink(pathname: string): Promise<void> {
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

export function sftpRmdir(pathname: string): Promise<void> {
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

export async function removeRemoteEntry(pathname: string, recursive = false): Promise<void> {
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

export async function listRemoteDirectory(payload?: RemoteListPayload) {
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
}

export async function readRemoteFile(payload: RemoteReadPayload) {
  const targetPath = normalizeRemotePath(payload.path)
  const fileBuffer = await sftpReadFile(targetPath)
  return {
    path: targetPath,
    content: fileBuffer.toString('utf8')
  }
}

export async function uploadRemoteFile(payload: RemoteUploadPayload) {
  const remotePath = joinRemotePath(normalizeRemotePath(payload.directory), basename(payload.name))
  await sftpWriteFile(remotePath, payload.data)
  return { ok: true as const, path: remotePath }
}

export async function createRemoteDirectory(payload: RemoteMkdirPayload) {
  const targetPath = normalizeRemotePath(payload.path)
  await sftpMkdir(targetPath)
  return { ok: true as const, path: targetPath }
}

export async function renameRemoteEntry(payload: RemoteRenamePayload) {
  const oldPath = normalizeRemotePath(payload.oldPath)
  const newPath = normalizeRemotePath(payload.newPath)
  await sftpRename(oldPath, newPath)
  return { ok: true as const, path: newPath }
}

export async function deleteRemoteEntry(payload: RemoteDeletePayload) {
  const targetPath = normalizeRemotePath(payload.path)
  await removeRemoteEntry(targetPath, payload.recursive ?? true)
  return { ok: true as const, path: targetPath }
}
