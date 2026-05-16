import { dialog, ipcMain, shell } from 'electron';
import { spawnSync } from 'child_process';
import { accessSync, constants, readFileSync, watchFile, unwatchFile } from 'fs';
import { homedir } from 'os';
import { basename, join } from 'path';
import { Client } from 'ssh2';
import type { AgentAuthMethod, ConnectConfig, PasswordAuthMethod, PublicKeyAuthMethod } from 'ssh2';
import { getAppLocale } from '../state/app-locale';
import { getMainWindow } from '../state/main-window';
import {
  broadcastSshData,
  filterInteractiveShellDisplay,
  getSshStatusSnapshot,
  broadcastSshLogData,
  broadcastSshLogStatus,
  broadcastSshStatus,
  ensureSshClient,
  disposeSshLogTail,
  disposeSsh,
  getSshStream,
  measureSshLatency,
  setSftpClient,
  setSshClient,
  setSshLogStream,
  setSshStream,
  sshExecStreaming
} from '../ssh/ssh-runtime';
import {
  createRemoteDirectory,
  completeRemotePath,
  appendRemoteUploadChunk,
  cancelRemoteUpload,
  deleteRemoteEntry,
  downloadRemoteFileToTemp,
  finishRemoteUpload,
  listRemoteDirectory,
  readRemoteFile,
  renameRemoteEntry,
  sftpRealpath,
  startRemoteUpload,
  syncLocalFileToRemote,
  uploadRemoteFile,
  writeRemoteTextFile
} from '../ssh/remote-files';
import { readRemoteApps } from '../ssh/remote-apps';
import { readLiveSystemMetrics, readSystemMetrics } from '../ssh/system-metrics';
import type {
  SshAuthCapabilities,
  SshCommandBatchPayload,
  SshConnectPayload,
  SshLogTailPayload
} from '../shared/types';

let sshHandlersRegistered = false;

type OpenRemoteFileWatch = {
  localPath: string;
  remotePath: string;
  promptInFlight: boolean;
  syncing: boolean;
  lastHandledMtimeMs: number;
};

const openRemoteFileWatches = new Map<string, OpenRemoteFileWatch>();
const DEFAULT_WINDOWS_AGENT_PIPE = '\\\\.\\pipe\\openssh-ssh-agent';
const DEFAULT_PRIVATE_KEY_FILENAMES = ['id_ed25519', 'id_ecdsa', 'id_rsa', 'id_dsa'] as const;

/**
 * 获取当前用户 `.ssh` 目录下常见默认私钥文件的候选路径。
 * @param 无 无参数
 * @return string[] 默认私钥候选绝对路径列表
 */
function getDefaultPrivateKeyCandidates(): string[] {
  const sshDirectory = join(homedir(), '.ssh');
  return DEFAULT_PRIVATE_KEY_FILENAMES.map((fileName) => join(sshDirectory, fileName));
}

/**
 * 过滤出本机上真实存在且可读取的默认私钥路径。
 * @param 无 无参数
 * @return string[] 可读取的默认私钥绝对路径列表
 */
function getReadableDefaultPrivateKeyPaths(): string[] {
  return getDefaultPrivateKeyCandidates().filter((candidatePath) => {
    try {
      accessSync(candidatePath, constants.R_OK);
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * 检查当前系统 SSH Agent 是否可用，避免仅凭环境变量或管道路径做乐观判断。
 * @param 无 无参数
 * @return boolean 可用时返回 true，否则返回 false
 */
function canUseSystemAgentSync(): boolean {
  const probe = spawnSync('ssh-add', ['-l'], {
    stdio: 'ignore',
    windowsHide: true,
    timeout: 2000
  });

  if (probe.error) {
    return false;
  }

  return probe.status === 0 || probe.status === 1;
}

/**
 * 推断 ssh2 可使用的本地 SSH Agent 连接地址。
 * @param 无 无参数
 * @return string | null 可用的 Agent 地址；无可用地址时返回 null
 */
function getConfiguredAgentPath(): string | null {
  if (process.env.SSH_AUTH_SOCK?.trim()) {
    return process.env.SSH_AUTH_SOCK.trim();
  }

  if (process.platform === 'win32' && canUseSystemAgentSync()) {
    return DEFAULT_WINDOWS_AGENT_PIPE;
  }

  return null;
}

/**
 * 汇总当前机器的 SSH 认证能力，供前端表单决定默认认证方式与提示文案。
 * @param 无 无参数
 * @return Promise<SshAuthCapabilities> SSH 认证能力快照
 */
async function buildSshAuthCapabilities(): Promise<SshAuthCapabilities> {
  const detectedDefaultKeyPaths = getReadableDefaultPrivateKeyPaths();
  const hasAgent = canUseSystemAgentSync();

  return {
    hasAgent,
    detectedDefaultKeyPaths,
    defaultKeyCandidates: getDefaultPrivateKeyCandidates(),
    recommendedAuthMethod: hasAgent || detectedDefaultKeyPaths.length > 0 ? 'systemKey' : 'password'
  };
}

/**
 * 将前端传入的连接参数转换成 ssh2 可直接使用的连接配置。
 * @param payload 前端提交的 SSH 连接参数
 * @return ConnectConfig 组装完成的 ssh2 连接配置
 */
function buildConnectConfig(payload: SshConnectPayload): ConnectConfig {
  const authMethods: Array<PasswordAuthMethod | PublicKeyAuthMethod | AgentAuthMethod> = [];
  const connectConfig: ConnectConfig = {
    host: payload.host,
    port: payload.port,
    username: payload.username,
    keepaliveInterval: 5000,
    keepaliveCountMax: 3,
    tryKeyboard: false,
    readyTimeout: 20000
  };

  if (payload.authMethod === 'password') {
    if (!payload.password) {
      throw new Error('Password authentication requires a password.');
    }

    authMethods.push({
      type: 'password',
      username: payload.username,
      password: payload.password
    });
    connectConfig.password = payload.password;
    connectConfig.authHandler = authMethods;
    return connectConfig;
  }

  if (payload.keySource === 'custom') {
    if (!payload.privateKeyPath.trim()) {
      throw new Error('Please choose a private key file.');
    }

    const privateKey = readFileSync(payload.privateKeyPath.trim());
    authMethods.push({
      type: 'publickey',
      username: payload.username,
      key: privateKey,
      ...(payload.passphrase ? { passphrase: payload.passphrase } : {})
    });
    connectConfig.privateKey = privateKey;
    if (payload.passphrase) {
      connectConfig.passphrase = payload.passphrase;
    }
    connectConfig.authHandler = authMethods;
    return connectConfig;
  }

  for (const defaultKeyPath of getReadableDefaultPrivateKeyPaths()) {
    authMethods.push({
      type: 'publickey',
      username: payload.username,
      key: readFileSync(defaultKeyPath)
    });
  }

  const agentPath = getConfiguredAgentPath();
  if (agentPath) {
    authMethods.push({
      type: 'agent',
      username: payload.username,
      agent: agentPath
    });
    connectConfig.agent = agentPath;
  }

  if (authMethods.length === 0) {
    throw new Error(
      'No system SSH key was found. Start ssh-agent, use a default key under ~/.ssh, or choose a private key file manually.'
    );
  }

  connectConfig.authHandler = authMethods;
  return connectConfig;
}

/**
 * 根据当前界面语言返回远程文件编辑相关弹窗文案。
 * @param 无 无参数
 * @return object 多语言弹窗文案集合
 */
function getRemoteFileDialogCopy() {
  switch (getAppLocale()) {
    case 'zh-CN':
      return {
        upload: '??',
        later: '??',
        ok: '??',
        changedTitle: '???????????',
        changedDetail: (localPath: string, remotePath: string) =>
          `?????????${basename(localPath)}???????

??????
${remotePath}`,
        uploadFailedTitle: '??????????',
        uploadFailedDetail: (message: string) => message,
        unknownUploadError: '???????'
      };
    case 'zh-TW':
      return {
        upload: '??',
        later: '??',
        ok: '??',
        changedTitle: '???????????',
        changedDetail: (localPath: string, remotePath: string) =>
          `?????????${basename(localPath)}?????

??????
${remotePath}`,
        uploadFailedTitle: '??????????',
        uploadFailedDetail: (message: string) => message,
        unknownUploadError: '????????'
      };
    case 'ja-JP':
      return {
        upload: '??????',
        later: '??',
        ok: 'OK',
        changedTitle: '?????????????????????',
        changedDetail: (localPath: string, remotePath: string) =>
          `??????????????${basename(localPath)}??????????

????????????:
${remotePath}`,
        uploadFailedTitle: '??????????????????????',
        uploadFailedDetail: (message: string) => message,
        unknownUploadError: '???????????????'
      };
    case 'ko-KR':
      return {
        upload: '???',
        later: '???',
        ok: '??',
        changedTitle: '?? ??? ???? ???????',
        changedDetail: (localPath: string, remotePath: string) =>
          `??? ?? ?? "${basename(localPath)}"?(?) ???????.

?? ??? ?? ???????
${remotePath}`,
        uploadFailedTitle: '??? ?? ???? ??????',
        uploadFailedDetail: (message: string) => message,
        unknownUploadError: '? ? ?? ??? ?????.'
      };
    case 'de-DE':
      return {
        upload: 'Hochladen',
        later: 'Sp?ter',
        ok: 'OK',
        changedTitle: 'Remote-Datei wurde lokal ge?ndert',
        changedDetail: (localPath: string, remotePath: string) =>
          `Die gespeicherte lokale Datei "${basename(localPath)}" wurde ge?ndert.

Zur?ck hochladen nach:
${remotePath}`,
        uploadFailedTitle: 'Die ge?nderte Datei konnte nicht hochgeladen werden',
        uploadFailedDetail: (message: string) => message,
        unknownUploadError: 'Unbekannter Upload-Fehler.'
      };
    case 'ru-RU':
      return {
        upload: '?????????',
        later: '?????',
        ok: 'OK',
        changedTitle: '????????? ???? ??? ??????? ????????',
        changedDetail: (localPath: string, remotePath: string) =>
          `??????????? ????????? ???? "${basename(localPath)}" ??? ???????.

????????? ??????? ?:
${remotePath}`,
        uploadFailedTitle: '?? ??????? ????????? ?????????? ????',
        uploadFailedDetail: (message: string) => message,
        unknownUploadError: '??????????? ?????? ????????.'
      };
    case 'ar-SA':
      return {
        upload: '???',
        later: '??????',
        ok: '?????',
        changedTitle: '?? ????? ????? ?????? ??????',
        changedDetail: (localPath: string, remotePath: string) =>
          `?? ????? ????? ?????? ??????? "${basename(localPath)}".

?? ???? ???? ??? ???? ???:
${remotePath}`,
        uploadFailedTitle: '??? ??? ????? ??????',
        uploadFailedDetail: (message: string) => message,
        unknownUploadError: '??? ??? ??? ?????.'
      };
    case 'en-US':
    default:
      return {
        upload: 'Upload',
        later: 'Later',
        ok: 'OK',
        changedTitle: 'Remote file changed locally',
        changedDetail: (localPath: string, remotePath: string) =>
          `The saved local file "${basename(localPath)}" has changed.

Upload it back to:
${remotePath}`,
        uploadFailedTitle: 'Failed to upload the modified file',
        uploadFailedDetail: (message: string) => message,
        unknownUploadError: 'Unknown upload error.'
      };
  }
}

/**
 * 将多行命令包装成一次性的 shell 批处理脚本。
 * @param content 命令文本内容
 * @return string 可直接提交到远程 shell 的批处理脚本
 */
function createCommandBatch(content: string): string {
  const delimiter = `COOL_BUDDY_BATCH_${Date.now().toString(36)}`;
  return `sh -se <<'${delimiter}'\n${content}\n${delimiter}`;
}

/**
 * 对 shell 参数做单引号转义，避免远程命令拼接时出现注入或语法错误。
 * @param value 原始参数值
 * @return string 转义后的 shell 参数
 */
function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

/**
 * 将系统返回的打开文件失败消息转换成更容易理解的业务错误提示。
 * @param openError shell.openPath 返回的原始错误文案
 * @param localPath 本地临时文件路径
 * @param remotePath 对应的远程文件路径
 * @return string 可直接展示给用户的错误提示
 */
function formatOpenRemoteFileError(
  openError: string,
  localPath: string,
  remotePath: string
): string {
  if (/requested file or directory could not be found/i.test(openError)) {
    return `无法打开远程文件，系统在处理打开请求时没有找到对应的本地临时文件。\n远程文件：${remotePath}\n本地临时文件：${localPath}`;
  }

  return `无法打开远程文件。\n远程文件：${remotePath}\n本地临时文件：${localPath}\n系统消息：${openError}`;
}

/**
 * 停止监听某个已打开远程文件对应的本地临时文件。
 * @param localPath 本地临时文件路径
 * @return void 无返回
 */
function disposeRemoteOpenFileWatch(localPath: string): void {
  unwatchFile(localPath);
  openRemoteFileWatches.delete(localPath);
}

/**
 * 停止监听所有已打开远程文件对应的本地临时文件。
 * @param 无 无参数
 * @return void 无返回
 */
function disposeRemoteOpenFileWatches(): void {
  for (const localPath of openRemoteFileWatches.keys()) {
    unwatchFile(localPath);
  }

  openRemoteFileWatches.clear();
}

/**
 * 为已打开的远程文件注册本地变更监听，便于用户保存后回传到远端。
 * @param localPath 本地临时文件路径
 * @param remotePath 对应的远程文件路径
 * @return void 无返回
 */
function registerRemoteOpenFileWatch(localPath: string, remotePath: string): void {
  for (const [trackedPath, trackedWatch] of openRemoteFileWatches.entries()) {
    if (trackedWatch.remotePath === remotePath) {
      disposeRemoteOpenFileWatch(trackedPath);
    }
  }

  const watchState: OpenRemoteFileWatch = {
    localPath,
    remotePath,
    promptInFlight: false,
    syncing: false,
    lastHandledMtimeMs: 0
  };

  openRemoteFileWatches.set(localPath, watchState);

  watchFile(localPath, { interval: 800 }, async (currentStat, previousStat) => {
    const currentWatch = openRemoteFileWatches.get(localPath);
    if (!currentWatch) {
      return;
    }

    const currentMtimeMs = currentStat.mtimeMs;
    if (
      currentMtimeMs === 0 ||
      currentMtimeMs === previousStat.mtimeMs ||
      currentMtimeMs <= currentWatch.lastHandledMtimeMs ||
      currentWatch.promptInFlight ||
      currentWatch.syncing
    ) {
      return;
    }

    currentWatch.promptInFlight = true;

    try {
      const copy = getRemoteFileDialogCopy();
      const response = await showTopmostNativeDialog({
        type: 'question',
        buttons: [copy.upload, copy.later],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        message: copy.changedTitle,
        detail: copy.changedDetail(localPath, remotePath)
      });

      currentWatch.lastHandledMtimeMs = currentMtimeMs;

      if (response.response !== 0) {
        return;
      }

      currentWatch.syncing = true;

      try {
        await syncLocalFileToRemote({
          localPath,
          remotePath
        });
      } catch (error) {
        const copy = getRemoteFileDialogCopy();
        await showTopmostNativeDialog({
          type: 'error',
          buttons: [copy.ok],
          defaultId: 0,
          noLink: true,
          message: copy.uploadFailedTitle,
          detail: copy.uploadFailedDetail(
            error instanceof Error ? error.message : copy.unknownUploadError
          )
        });
      } finally {
        currentWatch.syncing = false;
      }
    } finally {
      currentWatch.promptInFlight = false;
    }
  });
}

/**
 * 以始终置顶的方式展示原生弹窗，避免窗口被其他应用遮挡。
 * @param options Electron 消息框配置
 * @return Promise<Electron.MessageBoxReturnValue> 用户操作结果
 */
async function showTopmostNativeDialog(
  options: Electron.MessageBoxOptions
): Promise<Electron.MessageBoxReturnValue> {
  const mainWindow = getMainWindow();

  if (!mainWindow || mainWindow.isDestroyed()) {
    return dialog.showMessageBox(options);
  }

  const wasAlwaysOnTop = mainWindow.isAlwaysOnTop();

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.show();
  mainWindow.focus();
  mainWindow.moveTop();

  try {
    return await dialog.showMessageBox(mainWindow, options);
  } finally {
    mainWindow.setAlwaysOnTop(wasAlwaysOnTop);
  }
}

export function registerSshIpc(): void {
  if (sshHandlersRegistered) {
    return;
  }

  ipcMain.handle('ssh:get-auth-capabilities', async () => {
    return await buildSshAuthCapabilities();
  });

  ipcMain.handle('ssh:pick-private-key', async () => {
    const mainWindow = getMainWindow();
    const dialogOptions: Electron.OpenDialogOptions = {
      title: 'Choose a private key',
      defaultPath: join(homedir(), '.ssh'),
      properties: ['openFile']
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    return {
      canceled: result.canceled,
      path: result.canceled ? '' : (result.filePaths[0] ?? '')
    };
  });

  ipcMain.handle('ssh:connect', async (_event, payload: SshConnectPayload) => {
    disposeRemoteOpenFileWatches();
    disposeSsh();
    broadcastSshStatus({
      status: 'connecting',
      message: `Connecting to ${payload.host}:${payload.port}...`
    });

    const client = new Client();
    setSshClient(client);

    return await new Promise<{ ok: true; remotePath: string }>((resolve, reject) => {
      let settled = false;

      const finalizeError = (message: string): void => {
        if (settled) return;
        settled = true;
        disposeRemoteOpenFileWatches();
        disposeSsh();
        broadcastSshStatus({
          status: 'error',
          message
        });
        reject(new Error(message));
      };

      client
        .on('ready', () => {
          client.sftp((sftpError, sftpClient) => {
            if (sftpError) {
              finalizeError(sftpError.message);
              return;
            }

            setSftpClient(sftpClient);
            client.shell(
              {
                cols: 120,
                rows: 32,
                term: 'xterm-256color'
              },
              async (error, stream) => {
                if (error) {
                  finalizeError(error.message);
                  return;
                }

                setSshStream(stream);
                stream.on('data', (chunk: Buffer) => {
                  const visibleChunk = filterInteractiveShellDisplay(chunk.toString('utf8'));
                  if (visibleChunk) {
                    broadcastSshData(visibleChunk);
                  }
                });

                stream.on('close', () => {
                  disposeSsh();
                });

                settled = true;
                const remotePath = await sftpRealpath('.').catch(() => '.');
                broadcastSshStatus({
                  status: 'connected',
                  message: `Connected to ${payload.host}:${payload.port}`
                });
                resolve({ ok: true, remotePath });
              }
            );
          });
        })
        .on('error', (error) => {
          finalizeError(error.message);
        })
        .on('close', () => {
          if (!settled) {
            finalizeError('Connection closed before the shell was ready.');
            return;
          }

          disposeRemoteOpenFileWatches();
          disposeSsh();
        });

      try {
        client.connect(buildConnectConfig(payload));
      } catch (error) {
        finalizeError(
          error instanceof Error ? error.message : 'Failed to prepare SSH authentication.'
        );
      }
    });
  });

  ipcMain.on('ssh:input', (_event, data: string) => {
    getSshStream()?.write(data);
  });

  ipcMain.on('ssh:resize', (_event, size: { cols: number; rows: number }) => {
    getSshStream()?.setWindow(size.rows, size.cols, 0, 0);
  });

  ipcMain.handle('ssh:disconnect', async () => {
    disposeRemoteOpenFileWatches();
    disposeSsh();
    return { ok: true };
  });

  ipcMain.handle('ssh:execute-command-batch', async (_event, payload: SshCommandBatchPayload) => {
    const mainWindow = getMainWindow();
    const batchCommand = createCommandBatch(payload.content);

    await sshExecStreaming(batchCommand, (chunk) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        broadcastSshData(chunk);
      }
    });

    return { ok: true as const };
  });

  ipcMain.handle('ssh:start-log-tail', async (_event, payload: SshLogTailPayload) => {
    const path = payload.path.trim();
    const lineCount = Math.max(1, Math.min(500, Math.trunc(payload.lineCount || 50)));
    if (!path) {
      throw new Error('Log path is required.');
    }

    disposeSshLogTail(payload.streamId);

    return await new Promise<{ ok: true }>((resolve, reject) => {
      const command = createCommandBatch(
        `
if [ ! -e ${quoteShellArg(path)} ]; then
  echo "Log file does not exist." >&2
  exit 2
fi

if [ ! -f ${quoteShellArg(path)} ]; then
  echo "Log path is not a file." >&2
  exit 3
fi

exec tail -n ${lineCount} -f -- ${quoteShellArg(path)}
      `.trim()
      );

      ensureSshClient().exec(command, (error, stream) => {
        if (error) {
          broadcastSshLogStatus({
            streamId: payload.streamId,
            status: 'error',
            path,
            message: error.message
          });
          reject(error);
          return;
        }

        setSshLogStream(payload.streamId, stream);
        broadcastSshLogStatus({
          streamId: payload.streamId,
          status: 'running',
          path,
          message: `Streaming ${path}`
        });

        stream.on('data', (chunk: Buffer) => {
          broadcastSshLogData({
            streamId: payload.streamId,
            chunk: chunk.toString('utf8')
          });
        });

        stream.stderr.on('data', (chunk: Buffer) => {
          const message = chunk.toString('utf8');
          broadcastSshLogStatus({
            streamId: payload.streamId,
            status: 'error',
            path,
            message
          });
        });

        stream.on('close', () => {
          setSshLogStream(payload.streamId, null);
          broadcastSshLogStatus({
            streamId: payload.streamId,
            status: 'idle',
            path,
            message: `Stopped streaming ${path}`
          });
        });

        resolve({ ok: true as const });
      });
    });
  });

  ipcMain.handle('ssh:stop-log-tail', async (_event, streamId: string) => {
    disposeSshLogTail(streamId, {
      streamId,
      status: 'idle',
      path: '',
      message: 'Log stream stopped.'
    });
    return { ok: true as const };
  });
  ipcMain.handle('ssh:get-status-snapshot', async () => getSshStatusSnapshot());

  ipcMain.handle('ssh:list-remote', async (_event, payload) => listRemoteDirectory(payload));
  ipcMain.handle('ssh:complete-remote-path', async (_event, payload) =>
    completeRemotePath(payload)
  );
  ipcMain.handle('ssh:read-remote-file', async (_event, payload) => readRemoteFile(payload));
  ipcMain.handle('ssh:open-remote-file', async (_event, payload) => {
    const downloadedFile = await downloadRemoteFileToTemp(payload);
    const openError = await shell.openPath(downloadedFile.localPath);
    if (openError) {
      throw new Error(
        formatOpenRemoteFileError(openError, downloadedFile.localPath, downloadedFile.path)
      );
    }
    registerRemoteOpenFileWatch(downloadedFile.localPath, downloadedFile.path);
    return downloadedFile;
  });
  ipcMain.handle('ssh:write-remote-text-file', async (_event, payload) =>
    writeRemoteTextFile(payload)
  );
  ipcMain.handle('ssh:upload-remote-file', async (_event, payload) => uploadRemoteFile(payload));
  ipcMain.handle('ssh:start-remote-upload', async (_event, payload) => startRemoteUpload(payload));
  ipcMain.handle('ssh:append-remote-upload-chunk', async (_event, payload) =>
    appendRemoteUploadChunk(payload)
  );
  ipcMain.handle('ssh:finish-remote-upload', async (_event, payload) =>
    finishRemoteUpload(payload)
  );
  ipcMain.handle('ssh:cancel-remote-upload', async (_event, payload) =>
    cancelRemoteUpload(payload)
  );
  ipcMain.handle('ssh:create-remote-directory', async (_event, payload) =>
    createRemoteDirectory(payload)
  );
  ipcMain.handle('ssh:rename-remote-entry', async (_event, payload) => renameRemoteEntry(payload));
  ipcMain.handle('ssh:delete-remote-entry', async (_event, payload) => deleteRemoteEntry(payload));
  ipcMain.handle('ssh:get-system-metrics', async () => readSystemMetrics());
  ipcMain.handle('ssh:get-live-metrics', async () => readLiveSystemMetrics());
  ipcMain.handle('ssh:get-latency', async () => measureSshLatency());
  ipcMain.handle('ssh:get-remote-apps', async () => readRemoteApps());

  sshHandlersRegistered = true;
}
