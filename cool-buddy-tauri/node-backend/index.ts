import { spawnSync } from 'node:child_process';
import { accessSync, constants, readFileSync, statSync, unwatchFile, watchFile } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';
import { Client } from 'ssh2';
import type { AgentAuthMethod, ConnectConfig, PasswordAuthMethod, PublicKeyAuthMethod } from 'ssh2';
import { BrowserWindow, setElectronWindowSendHandler } from 'electron';
import { setMainWindow } from '../../src/main/state/main-window';
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
  uploadRemoteFile,
  syncLocalFileToRemote,
  writeRemoteTextFile
} from '../../src/main/ssh/remote-files';
import { readRemoteApps } from '../../src/main/ssh/remote-apps';
import {
  broadcastSshData,
  broadcastSshLogData,
  broadcastSshLogStatus,
  broadcastSshStatus,
  disposeSsh,
  disposeSshLogTail,
  ensureSshClient,
  filterInteractiveShellDisplay,
  getSshStatusSnapshot,
  getSshStream,
  measureSshLatency,
  setSftpClient,
  setSshClient,
  setSshLogStream,
  setSshStream,
  sshExecStreaming
} from '../../src/main/ssh/ssh-runtime';
import { harmlessAgentRuntime } from '../../src/main/harmless/runtime';
import { readLiveSystemMetrics, readSystemMetrics } from './system-metrics';
import type {
  ResolveAgentApprovalPayload,
  RunAgentPayload,
  SaveAgentWhitelistPayload,
  SshAuthCapabilities,
  SshCommandBatchPayload,
  SshConnectPayload,
  SshLogTailPayload
} from '../../src/main/shared/types';

type RpcRequest = {
  id: number;
  method: string;
  args?: unknown;
};

type RpcSuccess = {
  type: 'response';
  id: number;
  result: unknown;
};

type RpcFailure = {
  type: 'response';
  id: number;
  error: string;
};

type RpcEvent = {
  type: 'event';
  event: string;
  payload: unknown;
};

type OpenRemoteFileWatch = {
  localPath: string;
  remotePath: string;
  promptInFlight: boolean;
  syncing: boolean;
  lastHandledMtimeMs: number;
  pendingMtimeMs: number | null;
};

const DEFAULT_WINDOWS_AGENT_PIPE = '\\\\.\\pipe\\openssh-ssh-agent';
const DEFAULT_PRIVATE_KEY_FILENAMES = ['id_ed25519', 'id_ecdsa', 'id_rsa', 'id_dsa'] as const;
const openRemoteFileWatches = new Map<string, OpenRemoteFileWatch>();

function writeProtocolMessage(message: RpcSuccess | RpcFailure | RpcEvent): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function emitEvent(event: string, payload: unknown): void {
  writeProtocolMessage({
    type: 'event',
    event,
    payload
  });
}

setElectronWindowSendHandler((channel, payload) => {
  emitEvent(channel, payload);
});
setMainWindow(new BrowserWindow());

function getDefaultPrivateKeyCandidates(): string[] {
  const sshDirectory = join(homedir(), '.ssh');
  return DEFAULT_PRIVATE_KEY_FILENAMES.map((fileName) => join(sshDirectory, fileName));
}

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

function getConfiguredAgentPath(): string | null {
  if (process.env.SSH_AUTH_SOCK?.trim()) {
    return process.env.SSH_AUTH_SOCK.trim();
  }

  if (process.platform === 'win32' && canUseSystemAgentSync()) {
    return DEFAULT_WINDOWS_AGENT_PIPE;
  }

  return null;
}

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

function createCommandBatch(content: string): string {
  const delimiter = `COOL_BUDDY_BATCH_${Date.now().toString(36)}`;
  return `sh -se <<'${delimiter}'\n${content}\n${delimiter}`;
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function normalizeUploadPayload(input: any) {
  if (input?.data instanceof Uint8Array) {
    return input;
  }

  if (Array.isArray(input?.data)) {
    return {
      ...input,
      data: Uint8Array.from(input.data)
    };
  }

  return input;
}

function formatOpenRemoteFileError(
  openError: string,
  localPath: string,
  remotePath: string
): string {
  if (/requested file or directory could not be found/i.test(openError)) {
    return `Unable to open remote file because the local temporary file could not be found.\nRemote file: ${remotePath}\nLocal temp file: ${localPath}`;
  }

  return `Unable to open remote file.\nRemote file: ${remotePath}\nLocal temp file: ${localPath}\nSystem message: ${openError}`;
}

function disposeRemoteOpenFileWatch(localPath: string): void {
  unwatchFile(localPath);
  openRemoteFileWatches.delete(localPath);
}

function registerRemoteOpenFileWatch(localPath: string, remotePath: string): void {
  for (const [trackedPath, trackedWatch] of openRemoteFileWatches.entries()) {
    if (trackedWatch.remotePath === remotePath) {
      disposeRemoteOpenFileWatch(trackedPath);
    }
  }

  const initialMtimeMs = (() => {
    try {
      return statSync(localPath).mtimeMs;
    } catch {
      return 0;
    }
  })();

  const watchState: OpenRemoteFileWatch = {
    localPath,
    remotePath,
    promptInFlight: false,
    syncing: false,
    lastHandledMtimeMs: initialMtimeMs,
    pendingMtimeMs: null
  };

  openRemoteFileWatches.set(localPath, watchState);

  watchFile(localPath, { interval: 800 }, (currentStat, previousStat) => {
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
    currentWatch.pendingMtimeMs = currentMtimeMs;

    emitEvent('ssh:remote-file-sync-request', {
      localPath,
      remotePath
    });
  });
}

async function syncOpenRemoteFile(payload: {
  localPath: string;
}): Promise<{ ok: true; path: string }> {
  const watchState = openRemoteFileWatches.get(payload.localPath);
  if (!watchState) {
    throw new Error('Remote file sync session was not found.');
  }

  watchState.syncing = true;

  try {
    const result = await syncLocalFileToRemote({
      localPath: watchState.localPath,
      remotePath: watchState.remotePath
    });
    watchState.lastHandledMtimeMs = watchState.pendingMtimeMs ?? Date.now();
    watchState.pendingMtimeMs = null;
    watchState.promptInFlight = false;
    return result;
  } finally {
    watchState.syncing = false;
  }
}

function dismissOpenRemoteFileSyncRequest(payload: { localPath: string }): { ok: true } {
  const watchState = openRemoteFileWatches.get(payload.localPath);
  if (!watchState) {
    return { ok: true };
  }

  watchState.lastHandledMtimeMs = watchState.pendingMtimeMs ?? watchState.lastHandledMtimeMs;
  watchState.pendingMtimeMs = null;
  watchState.promptInFlight = false;
  return { ok: true };
}

async function sshConnect(payload: SshConnectPayload) {
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
}

async function startLogTail(payload: SshLogTailPayload) {
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
        broadcastSshLogStatus({
          streamId: payload.streamId,
          status: 'error',
          path,
          message: chunk.toString('utf8')
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

      resolve({ ok: true });
    });
  });
}

const methodHandlers = {
  'ssh.getAuthCapabilities': () => buildSshAuthCapabilities(),
  'ssh.connect': (payload: SshConnectPayload) => sshConnect(payload),
  'ssh.executeCommandBatch': async (payload: SshCommandBatchPayload) => {
    await sshExecStreaming(createCommandBatch(payload.content), (chunk) => {
      broadcastSshData(chunk);
    });
    return { ok: true as const };
  },
  'ssh.startLogTail': (payload: SshLogTailPayload) => startLogTail(payload),
  'ssh.stopLogTail': async (streamId: string) => {
    disposeSshLogTail(streamId, {
      streamId,
      status: 'idle',
      path: '',
      message: 'Log stream stopped.'
    });
    return { ok: true as const };
  },
  'ssh.getStatusSnapshot': () => getSshStatusSnapshot(),
  'ssh.disconnect': async () => {
    disposeSsh();
    return { ok: true as const };
  },
  'ssh.listRemote': (payload?: unknown) => listRemoteDirectory(payload as any),
  'ssh.completeRemotePath': (payload: unknown) => completeRemotePath(payload as any),
  'ssh.readRemoteFile': (payload: unknown) => readRemoteFile(payload as any),
  'ssh.openRemoteFile': async (payload: unknown) => {
    const downloadedFile = await downloadRemoteFileToTemp(payload as any);
    registerRemoteOpenFileWatch(downloadedFile.localPath, downloadedFile.path);
    return downloadedFile;
  },
  'ssh.syncOpenRemoteFile': (payload: unknown) => syncOpenRemoteFile(payload as any),
  'ssh.dismissOpenRemoteFileSyncRequest': (payload: unknown) =>
    dismissOpenRemoteFileSyncRequest(payload as any),
  'ssh.writeRemoteTextFile': (payload: unknown) => writeRemoteTextFile(payload as any),
  'ssh.uploadRemoteFile': (payload: unknown) => uploadRemoteFile(normalizeUploadPayload(payload)),
  'ssh.startRemoteUpload': (payload: unknown) => startRemoteUpload(payload as any),
  'ssh.appendRemoteUploadChunk': (payload: unknown) =>
    appendRemoteUploadChunk(normalizeUploadPayload(payload) as any),
  'ssh.finishRemoteUpload': (payload: unknown) => finishRemoteUpload(payload as any),
  'ssh.cancelRemoteUpload': (payload: unknown) => cancelRemoteUpload(payload as any),
  'ssh.createRemoteDirectory': (payload: unknown) => createRemoteDirectory(payload as any),
  'ssh.renameRemoteEntry': (payload: unknown) => renameRemoteEntry(payload as any),
  'ssh.deleteRemoteEntry': (payload: unknown) => deleteRemoteEntry(payload as any),
  'ssh.getSystemMetrics': () => readSystemMetrics(),
  'ssh.getLiveMetrics': () => readLiveSystemMetrics(),
  'ssh.getLatency': () => measureSshLatency(),
  'ssh.getRemoteApps': () => readRemoteApps(),
  'ssh.input': async (data: string) => {
    getSshStream()?.write(data);
    return null;
  },
  'ssh.resize': async (size: { cols: number; rows: number }) => {
    getSshStream()?.setWindow(size.rows, size.cols, 0, 0);
    return null;
  },
  'harmlessAgent.getState': (sessionId: string) => harmlessAgentRuntime.getState(sessionId),
  'harmlessAgent.run': (payload: RunAgentPayload) => harmlessAgentRuntime.run(payload),
  'harmlessAgent.resolveApproval': (payload: ResolveAgentApprovalPayload) =>
    harmlessAgentRuntime.resolveApproval(payload),
  'harmlessAgent.listWhitelist': () => harmlessAgentRuntime.listWhitelist(),
  'harmlessAgent.createWhitelistItem': (payload: SaveAgentWhitelistPayload) =>
    harmlessAgentRuntime.createWhitelistItem(payload),
  'harmlessAgent.deleteWhitelistItem': (id: string) => harmlessAgentRuntime.deleteWhitelistItem(id)
} satisfies Record<string, (args: any) => Promise<unknown> | unknown>;

const rl = createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on('line', async (line) => {
  if (!line.trim()) {
    return;
  }

  let request: RpcRequest;
  try {
    request = JSON.parse(line) as RpcRequest;
  } catch (error) {
    emitEvent('backend:error', {
      message: error instanceof Error ? error.message : 'Invalid backend request payload.'
    });
    return;
  }

  const handler = methodHandlers[request.method as keyof typeof methodHandlers];
  if (!handler) {
    writeProtocolMessage({
      type: 'response',
      id: request.id,
      error: `Unknown backend method: ${request.method}`
    });
    return;
  }

  try {
    const result = await handler(request.args);
    writeProtocolMessage({
      type: 'response',
      id: request.id,
      result
    });
  } catch (error) {
    writeProtocolMessage({
      type: 'response',
      id: request.id,
      error: error instanceof Error ? error.message : 'Backend command failed.'
    });
  }
});

process.stdin.on('end', () => {
  disposeSsh();
  process.exit(0);
});
