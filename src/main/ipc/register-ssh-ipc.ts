import { dialog, ipcMain, shell } from 'electron';
import { watchFile, unwatchFile } from 'fs';
import { basename } from 'path';
import { Client } from 'ssh2';
import type { ConnectConfig } from 'ssh2';
import { getAppLocale } from '../state/app-locale';
import { getMainWindow } from '../state/main-window';
import {
  broadcastSshData,
  filterInteractiveShellDisplay,
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
  deleteRemoteEntry,
  downloadRemoteFileToTemp,
  listRemoteDirectory,
  readRemoteFile,
  renameRemoteEntry,
  sftpRealpath,
  syncLocalFileToRemote,
  uploadRemoteFile
} from '../ssh/remote-files';
import { readRemoteApps } from '../ssh/remote-apps';
import { readLiveSystemMetrics, readSystemMetrics } from '../ssh/system-metrics';
import type { SshCommandBatchPayload, SshConnectPayload, SshLogTailPayload } from '../shared/types';

let sshHandlersRegistered = false;

type OpenRemoteFileWatch = {
  localPath: string;
  remotePath: string;
  promptInFlight: boolean;
  syncing: boolean;
  lastHandledMtimeMs: number;
};

const openRemoteFileWatches = new Map<string, OpenRemoteFileWatch>();

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

function createCommandBatch(content: string): string {
  const delimiter = `COOL_BUDDY_BATCH_${Date.now().toString(36)}`;
  return `sh -se <<'${delimiter}'\n${content}\n${delimiter}`;
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function disposeRemoteOpenFileWatch(localPath: string): void {
  unwatchFile(localPath);
  openRemoteFileWatches.delete(localPath);
}

function disposeRemoteOpenFileWatches(): void {
  for (const localPath of openRemoteFileWatches.keys()) {
    unwatchFile(localPath);
  }

  openRemoteFileWatches.clear();
}

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

      const connectConfig: ConnectConfig = {
        host: payload.host,
        port: payload.port,
        username: payload.username,
        password: payload.password,
        keepaliveInterval: 5000,
        keepaliveCountMax: 3,
        tryKeyboard: false,
        readyTimeout: 20000
      };

      client.connect(connectConfig);
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

    disposeSshLogTail();

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
            status: 'error',
            path,
            message: error.message
          });
          reject(error);
          return;
        }

        setSshLogStream(stream);
        broadcastSshLogStatus({
          status: 'running',
          path,
          message: `Streaming ${path}`
        });

        stream.on('data', (chunk: Buffer) => {
          broadcastSshLogData(chunk.toString('utf8'));
        });

        stream.stderr.on('data', (chunk: Buffer) => {
          const message = chunk.toString('utf8');
          broadcastSshLogStatus({
            status: 'error',
            path,
            message
          });
        });

        stream.on('close', () => {
          setSshLogStream(null);
          broadcastSshLogStatus({
            status: 'idle',
            path,
            message: `Stopped streaming ${path}`
          });
        });

        resolve({ ok: true as const });
      });
    });
  });

  ipcMain.handle('ssh:stop-log-tail', async () => {
    disposeSshLogTail({
      status: 'idle',
      path: '',
      message: 'Log stream stopped.'
    });
    return { ok: true as const };
  });

  ipcMain.handle('ssh:list-remote', async (_event, payload) => listRemoteDirectory(payload));
  ipcMain.handle('ssh:complete-remote-path', async (_event, payload) =>
    completeRemotePath(payload)
  );
  ipcMain.handle('ssh:read-remote-file', async (_event, payload) => readRemoteFile(payload));
  ipcMain.handle('ssh:open-remote-file', async (_event, payload) => {
    const downloadedFile = await downloadRemoteFileToTemp(payload);
    const openError = await shell.openPath(downloadedFile.localPath);
    if (openError) {
      throw new Error(openError);
    }
    registerRemoteOpenFileWatch(downloadedFile.localPath, downloadedFile.path);
    return downloadedFile;
  });
  ipcMain.handle('ssh:upload-remote-file', async (_event, payload) => uploadRemoteFile(payload));
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
