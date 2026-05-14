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
  const sanitizedName = normalizedName
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();

  return sanitizedName || fallbackName;
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
  let remotePath = '';

  if (payload.relativePath && payload.relativePath.trim()) {
    remotePath = joinRemotePath(
      normalizeRemotePath(payload.directory),
      normalizeRemotePath(payload.relativePath.trim())
    );
  } else {
    remotePath = joinRemotePath(normalizeRemotePath(payload.directory), basename(payload.name));
  }

  await sftpWriteFile(remotePath, payload.data);
  return { ok: true as const, path: remotePath };
}

/**
 * 创建远程目录并返回最终路径。
 * @param payload 远程目录创建参数
 * @return Promise<{ ok: true; path: string }> 创建结果
 */
export async function createRemoteDirectory(payload: RemoteMkdirPayload) {
  const targetPath = normalizeRemotePath(payload.path);
  await sftpMkdir(targetPath);
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
  await removeRemoteEntry(targetPath, payload.recursive ?? true);
  return { ok: true as const, path: targetPath };
}
