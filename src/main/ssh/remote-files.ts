import { basename, join, posix } from 'path';
import { mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import type { FileEntry } from 'ssh2';
import { ensureSftp } from './ssh-runtime';
import type {
  RemoteDeletePayload,
  RemoteEntry,
  RemotePathCompletionPayload,
  RemotePathCompletionResult,
  RemoteListPayload,
  RemoteMkdirPayload,
  RemoteOpenFilePayload,
  RemoteReadPayload,
  RemoteWriteTextPayload,
  RemoteRenamePayload,
  RemoteUploadPayload
} from '../shared/types';

export function normalizeRemotePath(inputPath: string): string {
  if (!inputPath) return '.';
  const normalized = posix.normalize(inputPath.replace(/\\/g, '/'));
  return normalized === '' ? '.' : normalized;
}

export function joinRemotePath(parentPath: string, childName: string): string {
  const normalizedParent = normalizeRemotePath(parentPath);
  if (normalizedParent === '/') {
    return posix.join('/', childName);
  }
  return posix.join(normalizedParent, childName);
}

function getLongestCommonPrefix(values: string[]): string {
  if (!values.length) return '';
  let prefix = values[0];

  for (const value of values.slice(1)) {
    let index = 0;
    const maxLength = Math.min(prefix.length, value.length);
    while (index < maxLength && prefix[index] === value[index]) {
      index += 1;
    }
    prefix = prefix.slice(0, index);
    if (!prefix) {
      break;
    }
  }

  return prefix;
}

export function getEntryKind(entry: FileEntry): RemoteEntry['kind'] {
  if (entry.longname.startsWith('d')) return 'directory';
  if (entry.longname.startsWith('l')) return 'symlink';
  return 'file';
}

export function sftpReaddir(pathname: string): Promise<FileEntry[]> {
  return new Promise((resolve, reject) => {
    ensureSftp().readdir(pathname, (error, list) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(list);
    });
  });
}

export function sftpRealpath(pathname: string): Promise<string> {
  return new Promise((resolve, reject) => {
    ensureSftp().realpath(pathname, (error, resolvedPath) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(resolvedPath);
    });
  });
}

export function sftpReadFile(pathname: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    ensureSftp().readFile(pathname, (error, buffer) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(buffer);
    });
  });
}

export function sftpWriteFile(pathname: string, data: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureSftp().writeFile(pathname, Buffer.from(data), (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function sftpMkdir(pathname: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureSftp().mkdir(pathname, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function sftpRename(oldPath: string, newPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureSftp().rename(oldPath, newPath, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function sftpUnlink(pathname: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureSftp().unlink(pathname, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function sftpRmdir(pathname: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureSftp().rmdir(pathname, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function removeRemoteEntry(pathname: string, recursive = false): Promise<void> {
  const entries = await sftpReaddir(pathname).catch(() => null);
  if (!entries) {
    await sftpUnlink(pathname);
    return;
  }

  if (entries.length > 0 && !recursive) {
    throw new Error('Directory is not empty.');
  }

  for (const entry of entries) {
    const childPath = joinRemotePath(pathname, entry.filename);
    const kind = getEntryKind(entry);
    if (kind === 'directory') {
      await removeRemoteEntry(childPath, true);
    } else {
      await sftpUnlink(childPath);
    }
  }

  await sftpRmdir(pathname);
}

export async function listRemoteDirectory(payload?: RemoteListPayload) {
  const requestedPath = normalizeRemotePath(payload?.path ?? '.');
  const showHidden = payload?.showHidden ?? false;
  const resolvedPath = await sftpRealpath(requestedPath).catch(() => requestedPath);
  const rows = await sftpReaddir(resolvedPath);

  const entries: RemoteEntry[] = rows
    .filter((entry) => {
      if (entry.filename === '.' || entry.filename === '..') {
        return false;
      }

      if (!showHidden && entry.filename.startsWith('.')) {
        return false;
      }

      return true;
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
        return left.kind === 'directory' ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });

  return {
    path: resolvedPath,
    entries
  };
}

export async function completeRemotePath(
  payload: RemotePathCompletionPayload
): Promise<RemotePathCompletionResult> {
  const rawInput = payload.input.replace(/\\/g, '/');
  const basePath = normalizeRemotePath(payload.basePath ?? '.');
  const endsWithSlash = rawInput.endsWith('/');

  let displayPrefix = '';
  let partialName = '';
  let searchDirectoryInput = basePath;

  if (!rawInput) {
    displayPrefix = '';
    partialName = '';
    searchDirectoryInput = basePath;
  } else if (endsWithSlash) {
    displayPrefix = rawInput;
    partialName = '';
    searchDirectoryInput = rawInput.startsWith('/')
      ? normalizeRemotePath(rawInput)
      : joinRemotePath(basePath, rawInput);
  } else {
    const lastSlashIndex = rawInput.lastIndexOf('/');
    if (lastSlashIndex >= 0) {
      displayPrefix = rawInput.slice(0, lastSlashIndex + 1);
      partialName = rawInput.slice(lastSlashIndex + 1);
      const parentInput =
        rawInput.slice(0, lastSlashIndex) || (rawInput.startsWith('/') ? '/' : '.');
      searchDirectoryInput = rawInput.startsWith('/')
        ? normalizeRemotePath(parentInput)
        : joinRemotePath(basePath, parentInput);
    } else {
      displayPrefix = '';
      partialName = rawInput;
      searchDirectoryInput = basePath;
    }
  }

  const searchDirectory = await sftpRealpath(searchDirectoryInput).catch(
    () => searchDirectoryInput
  );
  const rows = await sftpReaddir(searchDirectory);

  const matches = rows
    .filter((entry) => entry.filename !== '.' && entry.filename !== '..')
    .map((entry) => ({
      name: entry.filename,
      kind: getEntryKind(entry)
    }))
    .filter((entry) => entry.name.startsWith(partialName))
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'directory' ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    })
    .map((entry) => `${displayPrefix}${entry.name}${entry.kind === 'directory' ? '/' : ''}`);

  if (!matches.length) {
    return {
      value: rawInput,
      matches: []
    };
  }

  const nextValue = matches.length === 1 ? matches[0] : getLongestCommonPrefix(matches);

  return {
    value: nextValue.length >= rawInput.length ? nextValue : rawInput,
    matches
  };
}

export async function readRemoteFile(payload: RemoteReadPayload) {
  const targetPath = normalizeRemotePath(payload.path);
  const fileBuffer = await sftpReadFile(targetPath);
  return {
    path: targetPath,
    content: fileBuffer.toString('utf8')
  };
}

export async function downloadRemoteFileToTemp(payload: RemoteOpenFilePayload) {
  const targetPath = normalizeRemotePath(payload.path);
  const fileBuffer = await sftpReadFile(targetPath);
  const tempDirectory = await mkdtemp(join(tmpdir(), 'cool-buddy-remote-'));
  const localPath = join(tempDirectory, basename(targetPath));
  await writeFile(localPath, fileBuffer);
  return {
    path: targetPath,
    localPath
  };
}

export async function syncLocalFileToRemote(payload: { localPath: string; remotePath: string }) {
  const targetPath = normalizeRemotePath(payload.remotePath);
  const fileBuffer = await readFile(payload.localPath);
  await sftpWriteFile(targetPath, fileBuffer);
  return {
    ok: true as const,
    path: targetPath
  };
}

export async function writeRemoteTextFile(payload: RemoteWriteTextPayload) {
  const targetPath = normalizeRemotePath(payload.path);
  await sftpWriteFile(targetPath, Buffer.from(payload.content, 'utf8'));
  return { ok: true as const, path: targetPath };
}

export async function uploadRemoteFile(payload: RemoteUploadPayload) {
  const remotePath = joinRemotePath(normalizeRemotePath(payload.directory), basename(payload.name));
  await sftpWriteFile(remotePath, payload.data);
  return { ok: true as const, path: remotePath };
}

export async function createRemoteDirectory(payload: RemoteMkdirPayload) {
  const targetPath = normalizeRemotePath(payload.path);
  await sftpMkdir(targetPath);
  return { ok: true as const, path: targetPath };
}

export async function renameRemoteEntry(payload: RemoteRenamePayload) {
  const oldPath = normalizeRemotePath(payload.oldPath);
  const newPath = normalizeRemotePath(payload.newPath);
  await sftpRename(oldPath, newPath);
  return { ok: true as const, path: newPath };
}

export async function deleteRemoteEntry(payload: RemoteDeletePayload) {
  const targetPath = normalizeRemotePath(payload.path);
  await removeRemoteEntry(targetPath, payload.recursive ?? true);
  return { ok: true as const, path: targetPath };
}
