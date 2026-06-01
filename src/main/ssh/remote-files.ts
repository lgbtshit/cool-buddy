import { basename, join, posix, resolve, sep } from 'path';
import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import type { FileEntry } from 'ssh2';
import { ensureSftp, sshExec } from './ssh-runtime';
import type {
  RemoteDeletePayload,
  RemoteDownloadFilePayload,
  RemoteDownloadPlan,
  RemoteDownloadPreparePayload,
  RemoteEntry,
  RemotePathCompletionPayload,
  RemotePathCompletionResult,
  RemoteListPayload,
  RemoteMkdirPayload,
  RemoteOpenFilePayload,
  RemoteReadPayload,
  RemoteWriteTextPayload,
  RemoteRenamePayload,
  RemoteUploadChunkPayload,
  RemoteUploadPayload,
  RemoteUploadStartPayload
} from '../shared/types';

type RemoteUploadSession = {
  handle: Buffer;
  path: string;
  offset: number;
};

const remoteUploadSessions = new Map<string, RemoteUploadSession>();

/**
 * 标准化远程路径，统一斜杠并兜底空值。
 * @param inputPath 原始远程路径
 * @return string 标准化后的远程路径
 */
export function normalizeRemotePath(inputPath: string): string {
  if (!inputPath) return '.';
  const normalized = posix.normalize(inputPath.replace(/\\/g, '/'));
  return normalized === '' ? '.' : normalized;
}

/**
 * 拼接远程父路径和子名称，保证根目录场景也能得到正确结果。
 * @param parentPath 远程父级路径
 * @param childName 子目录或文件名称
 * @return string 拼接后的远程路径
 */
export function joinRemotePath(parentPath: string, childName: string): string {
  const normalizedParent = normalizeRemotePath(parentPath);
  if (normalizedParent === '/') {
    return posix.join('/', childName);
  }
  return posix.join(normalizedParent, childName);
}

/**
 * 计算多个字符串的最长公共前缀，用于远程路径自动补全。
 * @param values 待比较的字符串列表
 * @return string 最长公共前缀
 */
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

/**
 * 将远程文件名转换为可在当前系统临时目录安全落地的本地文件名。
 * @param remotePath 远程文件完整路径
 * @return string 可安全写入本地文件系统的文件名
 */
function createSafeLocalFileName(remotePath: string): string {
  const rawName = basename(remotePath).trim();
  const fallbackName = 'remote-file';
  const normalizedName = rawName && rawName !== '.' && rawName !== '..' ? rawName : fallbackName;
  return sanitizeLocalPathSegment(normalizedName, fallbackName);
}

/**
 * 清理本地路径片段，避免非法字符导致写入失败。
 * @param segment 原始路径片段
 * @param fallbackName 兜底名称
 * @return string 可安全用于本地路径的片段
 */
function sanitizeLocalPathSegment(segment: string, fallbackName = 'item'): string {
  const sanitizedName = segment
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();

  return sanitizedName || fallbackName;
}

/**
 * 将远程相对路径转换为可安全写入本地的相对路径。
 * @param selectionRoot 用户选中的远程根路径
 * @param targetPath 当前远程文件路径
 * @param rootKind 根路径类型
 * @return string 本地相对路径
 */
function buildDownloadRelativePath(
  selectionRoot: string,
  targetPath: string,
  rootKind: RemoteEntry['kind']
): string {
  const normalizedRoot = normalizeRemotePath(selectionRoot);
  const normalizedTarget = normalizeRemotePath(targetPath);

  if (rootKind === 'file' || rootKind === 'symlink') {
    return createSafeLocalFileName(normalizedTarget);
  }

  const rootFolderName = createSafeLocalFileName(normalizedRoot);
  if (normalizedTarget === normalizedRoot) {
    return rootFolderName;
  }

  const suffix = posix.relative(normalizedRoot, normalizedTarget);
  if (!suffix || suffix === '.') {
    return rootFolderName;
  }

  return posix.join(
    rootFolderName,
    ...suffix.split('/').map((segment) => sanitizeLocalPathSegment(segment))
  );
}

/**
 * 解析并校验本地下载目标路径，防止目录穿越。
 * @param localDirectory 本地下载根目录
 * @param relativePath 相对路径
 * @return string 绝对本地路径
 */
function resolveSafeLocalDownloadPath(localDirectory: string, relativePath: string): string {
  const normalizedRelative = relativePath.replace(/\\/g, '/');
  if (!normalizedRelative || normalizedRelative.includes('..')) {
    throw new Error('Invalid download path.');
  }

  const localPath = join(localDirectory, normalizedRelative);
  const resolvedDirectory = resolve(localDirectory);
  const resolvedPath = resolve(localPath);
  const directoryPrefix = `${resolvedDirectory}${sep}`;
  const isInsideDirectory =
    resolvedPath === resolvedDirectory ||
    resolvedPath.toLowerCase().startsWith(directoryPrefix.toLowerCase());
  if (!isInsideDirectory) {
    throw new Error(`Invalid download path: ${relativePath}`);
  }

  return resolvedPath;
}

/**
 * 递归收集远程下载计划中的文件列表。
 * @param selectionRoot 用户选中的远程根路径
 * @param currentPath 当前遍历路径
 * @param rootKind 根路径类型
 * @param files 收集结果
 * @return Promise<void> 无返回
 */
async function collectRemoteDownloadFilesAt(
  selectionRoot: string,
  currentPath: string,
  rootKind: RemoteEntry['kind'],
  files: RemoteDownloadPlan['files']
): Promise<void> {
  if (rootKind === 'file' || rootKind === 'symlink') {
    const stats = await sftpLstat(currentPath).catch(() => null);
    const size =
      typeof (stats as { size?: unknown })?.size === 'number'
        ? Number((stats as { size: number }).size)
        : 0;
    files.push({
      remotePath: normalizeRemotePath(currentPath),
      relativePath: buildDownloadRelativePath(selectionRoot, currentPath, rootKind),
      size
    });
    return;
  }

  const entries = await sftpReaddir(currentPath);
  for (const entry of entries) {
    if (entry.filename === '.' || entry.filename === '..') {
      continue;
    }

    const childPath = joinRemotePath(currentPath, entry.filename);
    const kind = getEntryKind(entry);
    if (kind === 'directory') {
      await collectRemoteDownloadFilesAt(selectionRoot, childPath, 'directory', files);
      continue;
    }

    files.push({
      remotePath: normalizeRemotePath(childPath),
      relativePath: buildDownloadRelativePath(selectionRoot, childPath, 'directory'),
      size: entry.attrs.size ?? 0
    });
  }
}

/**
 * 根据用户选中的远程条目生成下载计划。
 * @param payload 选中路径与类型
 * @return Promise<RemoteDownloadPlan> 下载计划
 */
export async function prepareRemoteDownload(
  payload: RemoteDownloadPreparePayload
): Promise<RemoteDownloadPlan> {
  const startedAt = performance.now();
  console.log('[remote-download] prepareRemoteDownload:start', {
    pathCount: payload.paths.length,
    paths: payload.paths,
    entryCount: payload.entries.length
  });
  const files: RemoteDownloadPlan['files'] = [];
  const kindByPath = new Map(payload.entries.map((entry) => [normalizeRemotePath(entry.path), entry.kind]));

  for (const rawPath of payload.paths) {
    const path = normalizeRemotePath(rawPath);
    const knownKind = kindByPath.get(path);
    const kind =
      knownKind ??
      (isSftpDirectory(await sftpLstat(path).catch(() => null)) ? 'directory' : 'file');

    console.log('[remote-download] prepareRemoteDownload:collect', { path, kind });
    await collectRemoteDownloadFilesAt(path, path, kind, files);
  }

  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  const plan = {
    files,
    totalBytes,
    totalFiles: files.length
  };
  console.log('[remote-download] prepareRemoteDownload:done', {
    ...plan,
    durationMs: Math.round(performance.now() - startedAt)
  });
  return plan;
}

/**
 * 将远程文件下载到本地目录中的指定相对路径。
 * @param payload 远程路径、本地目录与相对路径
 * @return Promise<{ ok: true; path: string; localPath: string; bytes: number }> 下载结果
 */
export async function downloadRemoteFileToLocal(payload: RemoteDownloadFilePayload) {
  const startedAt = performance.now();
  const remotePath = normalizeRemotePath(payload.remotePath);
  console.log('[remote-download] downloadRemoteFileToLocal:start', {
    remotePath,
    relativePath: payload.relativePath,
    localDirectory: payload.localDirectory
  });
  const localPath = resolveSafeLocalDownloadPath(payload.localDirectory, payload.relativePath);
  const fileBuffer = await sftpReadFile(remotePath);
  await mkdir(resolve(localPath, '..'), { recursive: true });
  await writeFile(localPath, fileBuffer);
  const result = {
    ok: true as const,
    path: remotePath,
    localPath,
    bytes: fileBuffer.byteLength
  };
  console.log('[remote-download] downloadRemoteFileToLocal:done', {
    ...result,
    durationMs: Math.round(performance.now() - startedAt)
  });
  return result;
}

/**
 * 根据 ssh2 的目录项判断远程条目的类型。
 * @param entry ssh2 返回的远程目录项
 * @return RemoteEntry['kind'] 条目类型
 */
export function getEntryKind(entry: FileEntry): RemoteEntry['kind'] {
  if (entry.longname.startsWith('d')) return 'directory';
  if (entry.longname.startsWith('l')) return 'symlink';
  return 'file';
}

/**
 * 读取远程目录内容。
 * @param pathname 远程目录路径
 * @return Promise<FileEntry[]> 目录项列表
 */
function isSftpDirectory(stats: unknown): boolean {
  if (typeof (stats as { isDirectory?: unknown })?.isDirectory === 'function') {
    return (stats as { isDirectory: () => boolean }).isDirectory();
  }

  const mode = (stats as { mode?: unknown })?.mode;
  return typeof mode === 'number' && (mode & 0o170000) === 0o040000;
}

function quoteShellPath(pathname: string): string {
  return `'${pathname.replace(/'/g, `'\\''`)}'`;
}

async function removeRemoteFileFast(pathname: string): Promise<void> {
  try {
    await sshExec(`rm -f -- ${quoteShellPath(pathname)}`);
  } catch {
    await sftpUnlink(pathname);
  }
}

function assertSafeRemoteDeleteTarget(pathname: string) {
  if (!pathname || pathname === '.' || pathname === '/' || pathname === '~') {
    throw new Error(`Refusing to delete unsafe remote path: ${pathname || '(empty)'}`);
  }
}

async function removeRemoteDirectoryFast(pathname: string, recursive: boolean): Promise<void> {
  assertSafeRemoteDeleteTarget(pathname);
  await sshExec(`${recursive ? 'rm -rf' : 'rmdir'} -- ${quoteShellPath(pathname)}`);
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

/**
 * 解析远程真实路径。
 * @param pathname 远程路径
 * @return Promise<string> 远程真实路径
 */
export function sftpLstat(pathname: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    ensureSftp().lstat(pathname, (error, stats) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(stats);
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

/**
 * 读取远程文件二进制内容。
 * @param pathname 远程文件路径
 * @return Promise<Buffer> 文件缓冲区
 */
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

/**
 * 将二进制内容写入远程文件。
 * @param pathname 远程文件路径
 * @param data 待写入的数据
 * @return Promise<void> 无返回
 */
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

function sftpOpen(pathname: string, flags: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    ensureSftp().open(
      pathname,
      flags as Parameters<ReturnType<typeof ensureSftp>['open']>[1],
      (error, handle) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(handle);
      }
    );
  });
}

function sftpWriteHandle(handle: Buffer, data: Uint8Array, position: number): Promise<number> {
  const buffer = Buffer.from(data);
  return new Promise((resolve, reject) => {
    ensureSftp().write(handle, buffer, 0, buffer.length, position, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(buffer.length);
    });
  });
}

function sftpClose(handle: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureSftp().close(handle, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

/**
 * 创建远程目录。
 * @param pathname 远程目录路径
 * @return Promise<void> 无返回
 */
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

/**
 * 重命名或移动远程条目。
 * @param oldPath 原始远程路径
 * @param newPath 新远程路径
 * @return Promise<void> 无返回
 */
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

/**
 * 删除远程文件。
 * @param pathname 远程文件路径
 * @return Promise<void> 无返回
 */
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

/**
 * 删除远程空目录。
 * @param pathname 远程目录路径
 * @return Promise<void> 无返回
 */
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

/**
 * 删除远程文件或目录，目录场景支持递归清理。
 * @param pathname 待删除的远程路径
 * @param recursive 是否递归删除目录
 * @return Promise<void> 无返回
 */
export async function removeRemoteEntry(
  pathname: string,
  recursive = false,
  knownKind?: RemoteEntry['kind']
): Promise<void> {
  if (knownKind === 'file' || knownKind === 'symlink') {
    await removeRemoteFileFast(pathname);
    return;
  }

  const isDirectory =
    knownKind === 'directory' || (!knownKind && isSftpDirectory(await sftpLstat(pathname)));

  if (!isDirectory) {
    await removeRemoteFileFast(pathname);
    return;
  }

  if (recursive) {
    try {
      await removeRemoteDirectoryFast(pathname, true);
      return;
    } catch {
      // Fall back to SFTP recursion when shell deletion is unavailable.
    }
  }

  const entries = await sftpReaddir(pathname);
  if (entries.length > 0 && !recursive) {
    throw new Error('Directory is not empty.');
  }

  for (const entry of entries) {
    const childPath = joinRemotePath(pathname, entry.filename);
    const kind = getEntryKind(entry);
    if (kind === 'directory') {
      await removeRemoteEntry(childPath, true, 'directory');
    } else {
      await sftpUnlink(childPath);
    }
  }

  await sftpRmdir(pathname);
}

/**
 * 列出远程目录内容，并按照目录优先规则排序。
 * @param payload 远程目录查询参数
 * @return Promise<{ path: string; entries: RemoteEntry[] }> 目录与条目列表
 */
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

/**
 * 计算远程路径补全结果。
 * @param payload 路径补全参数
 * @return Promise<RemotePathCompletionResult> 补全后的值和候选列表
 */
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

/**
 * 读取远程文本文件内容，供预览面板显示。
 * @param payload 远程文件读取参数
 * @return Promise<{ path: string; content: string }> 文件路径与文本内容
 */
export async function readRemoteFile(payload: RemoteReadPayload) {
  const targetPath = normalizeRemotePath(payload.path);
  const fileBuffer = await sftpReadFile(targetPath);
  return {
    path: targetPath,
    content: fileBuffer.toString('utf8')
  };
}

/**
 * 下载远程文件到本地临时目录，供系统默认程序打开。
 * @param payload 远程文件打开参数
 * @return Promise<{ path: string; localPath: string }> 远程路径与本地临时文件路径
 */
export async function downloadRemoteFileToTemp(payload: RemoteOpenFilePayload) {
  const targetPath = normalizeRemotePath(payload.path);
  const fileBuffer = await sftpReadFile(targetPath);
  const tempDirectory = await mkdtemp(join(tmpdir(), 'cool-buddy-remote-'));
  const localPath = join(tempDirectory, createSafeLocalFileName(targetPath));
  await writeFile(localPath, fileBuffer);
  return {
    path: targetPath,
    localPath
  };
}

/**
 * 将本地已修改的临时文件重新同步回远程文件。
 * @param payload 本地路径与远程路径
 * @return Promise<{ ok: true; path: string }> 同步结果
 */
export async function syncLocalFileToRemote(payload: { localPath: string; remotePath: string }) {
  const targetPath = normalizeRemotePath(payload.remotePath);
  const fileBuffer = await readFile(payload.localPath);
  await sftpWriteFile(targetPath, fileBuffer);
  return {
    ok: true as const,
    path: targetPath
  };
}

/**
 * 将文本内容直接写入远程文件。
 * @param payload 远程写入参数
 * @return Promise<{ ok: true; path: string }> 写入结果
 */
export async function writeRemoteTextFile(payload: RemoteWriteTextPayload) {
  const targetPath = normalizeRemotePath(payload.path);
  await sftpWriteFile(targetPath, Buffer.from(payload.content, 'utf8'));
  return { ok: true as const, path: targetPath };
}

/**
 * 上传本地选择的文件到远程目录。
 * @param payload 上传参数
 * @return Promise<{ ok: true; path: string }> 上传结果
 */
export async function uploadRemoteFile(payload: RemoteUploadPayload) {
  const remotePath = getRemoteUploadPath(payload);

  await sftpWriteFile(remotePath, payload.data);
  return { ok: true as const, path: remotePath };
}

function getRemoteUploadPath(payload: { directory: string; name: string; relativePath?: string }) {
  if (payload.relativePath && payload.relativePath.trim()) {
    return joinRemotePath(
      normalizeRemotePath(payload.directory),
      normalizeRemotePath(payload.relativePath.trim())
    );
  }

  return joinRemotePath(normalizeRemotePath(payload.directory), basename(payload.name));
}

export async function startRemoteUpload(payload: RemoteUploadStartPayload) {
  const remotePath = getRemoteUploadPath(payload);
  const handle = await sftpOpen(remotePath, 'w');
  remoteUploadSessions.set(payload.uploadId, {
    handle,
    path: remotePath,
    offset: 0
  });
  return { ok: true as const, path: remotePath };
}

export async function appendRemoteUploadChunk(payload: RemoteUploadChunkPayload) {
  const session = remoteUploadSessions.get(payload.uploadId);
  if (!session) {
    throw new Error('Upload session is no longer active.');
  }

  const position = Number.isFinite(payload.offset) ? Number(payload.offset) : session.offset;
  const bytesWritten = await sftpWriteHandle(session.handle, payload.data, position);
  session.offset = Math.max(session.offset, position + bytesWritten);
  return { ok: true as const, path: session.path, bytesWritten, offset: session.offset };
}

export async function finishRemoteUpload(payload: { uploadId: string }) {
  const session = remoteUploadSessions.get(payload.uploadId);
  if (!session) {
    throw new Error('Upload session is no longer active.');
  }

  remoteUploadSessions.delete(payload.uploadId);
  await sftpClose(session.handle);
  return { ok: true as const, path: session.path };
}

export async function cancelRemoteUpload(payload: { uploadId: string }) {
  const session = remoteUploadSessions.get(payload.uploadId);
  if (!session) {
    return { ok: true as const };
  }

  remoteUploadSessions.delete(payload.uploadId);
  await sftpClose(session.handle).catch(() => undefined);
  await sftpUnlink(session.path).catch(() => undefined);
  return { ok: true as const };
}

/**
 * 创建远程目录并返回最终路径。
 * @param payload 远程目录创建参数
 * @return Promise<{ ok: true; path: string }> 创建结果
 */
export async function createRemoteDirectory(payload: RemoteMkdirPayload) {
  const targetPath = normalizeRemotePath(payload.path);
  try {
    await sftpMkdir(targetPath);
  } catch (error) {
    try {
      if (isSftpDirectory(await sftpLstat(targetPath))) {
        return { ok: true as const, path: targetPath };
      }
    } catch {
      // Preserve the original mkdir failure when the path cannot be verified.
    }

    throw error;
  }
  return { ok: true as const, path: targetPath };
}

/**
 * 重命名远程文件或目录并返回新路径。
 * @param payload 远程重命名参数
 * @return Promise<{ ok: true; path: string }> 重命名结果
 */
export async function renameRemoteEntry(payload: RemoteRenamePayload) {
  const oldPath = normalizeRemotePath(payload.oldPath);
  const newPath = normalizeRemotePath(payload.newPath);
  await sftpRename(oldPath, newPath);
  return { ok: true as const, path: newPath };
}

/**
 * 删除远程文件或目录。
 * @param payload 远程删除参数
 * @return Promise<{ ok: true; path: string }> 删除结果
 */
export async function deleteRemoteEntry(payload: RemoteDeletePayload) {
  const targetPath = normalizeRemotePath(payload.path);
  const startedAt = performance.now();
  await removeRemoteEntry(targetPath, payload.recursive ?? true, payload.kind);
  console.log('[remote-delete] backend:deleted', {
    path: targetPath,
    kind: payload.kind ?? 'unknown',
    durationMs: Math.round(performance.now() - startedAt)
  });
  return { ok: true as const, path: targetPath };
}
