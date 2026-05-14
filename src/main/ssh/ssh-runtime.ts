import { BrowserWindow } from 'electron';
import { Client } from 'ssh2';
import type { ClientChannel, SFTPWrapper } from 'ssh2';
import type { SshLogDataPayload, SshLogStatusPayload, SshStatusPayload } from '../shared/types';
import { getMainWindow } from '../state/main-window';

let sshClient: Client | null = null;
let sshStream: ClientChannel | null = null;
let sftp: SFTPWrapper | null = null;
const sshLogStreams = new Map<string, ClientChannel>();
let interactiveShellCommandChain: Promise<void> = Promise.resolve();
let currentSshStatus: SshStatusPayload = {
  status: 'disconnected',
  message: 'SSH session is not connected.'
};

type InteractiveShellDisplayState = {
  startMarker: string;
  endMarkerPrefix: string;
  phase: 'waiting-for-start' | 'streaming-output';
  buffer: string;
};

let interactiveShellDisplayState: InteractiveShellDisplayState | null = null;

export function sendSshStatus(window: BrowserWindow, payload: SshStatusPayload): void {
  currentSshStatus = payload;
  window.webContents.send('ssh:status', payload);
}

export function broadcastSshStatus(payload: SshStatusPayload): void {
  currentSshStatus = payload;
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue;
    }
    window.webContents.send('ssh:status', payload);
  }
}

export function broadcastSshData(chunk: string): void {
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('ssh:data', chunk);
}

function normalizeForXterm(chunk: string): string {
  return chunk.replace(/\r?\n/g, '\r\n');
}

export function filterInteractiveShellDisplay(chunk: string): string {
  const state = interactiveShellDisplayState;
  if (!state) {
    return chunk;
  }

  state.buffer += chunk;
  let visible = '';

  if (state.phase === 'waiting-for-start') {
    const startIndex = state.buffer.indexOf(state.startMarker);
    if (startIndex === -1) {
      if (state.buffer.length > 8192) {
        state.buffer = state.buffer.slice(-8192);
      }
      return '';
    }

    state.phase = 'streaming-output';
    state.buffer = state.buffer.slice(startIndex + state.startMarker.length);
    if (state.buffer.startsWith('\r\n')) {
      state.buffer = state.buffer.slice(2);
    } else if (state.buffer.startsWith('\n')) {
      state.buffer = state.buffer.slice(1);
    }
  }

  const endIndex = state.buffer.indexOf(state.endMarkerPrefix);
  if (endIndex === -1) {
    visible += state.buffer;
    state.buffer = '';
    return visible;
  }

  visible += state.buffer.slice(0, endIndex);
  const remainder = state.buffer.slice(endIndex + state.endMarkerPrefix.length);
  const statusMatch = remainder.match(/^(\d+)\r?\n/);
  if (!statusMatch) {
    state.buffer = state.buffer.slice(endIndex);
    return visible;
  }

  interactiveShellDisplayState = null;
  return visible + remainder.slice(statusMatch[0].length);
}

export function broadcastSshLogData(payload: SshLogDataPayload): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue;
    }
    window.webContents.send('ssh:log-data', payload);
  }
}

export function broadcastSshLogStatus(payload: SshLogStatusPayload): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue;
    }
    window.webContents.send('ssh:log-status', payload);
  }
}

export function getSshStatusSnapshot(): SshStatusPayload {
  return currentSshStatus;
}

export function setSshClient(client: Client | null): void {
  sshClient = client;
}

export function setSshStream(stream: ClientChannel | null): void {
  sshStream = stream;
}

export function getSshStream(): ClientChannel | null {
  return sshStream;
}

export function setSftpClient(client: SFTPWrapper | null): void {
  sftp = client;
}

export function setSshLogStream(streamId: string, stream: ClientChannel | null): void {
  if (!stream) {
    sshLogStreams.delete(streamId);
    return;
  }

  sshLogStreams.set(streamId, stream);
}

export function ensureSftp(): SFTPWrapper {
  if (!sftp) {
    throw new Error('SFTP session is not ready.');
  }
  return sftp;
}

export function ensureSshClient(): Client {
  if (!sshClient) {
    throw new Error('SSH client is not ready.');
  }
  return sshClient;
}

export function ensureSshStream(): ClientChannel {
  if (!sshStream) {
    throw new Error('SSH shell is not ready.');
  }
  return sshStream;
}

export function disposeSshLogTail(streamId?: string, payload?: SshLogStatusPayload): void {
  const targets = streamId ? [[streamId, sshLogStreams.get(streamId) ?? null] as const] : [...sshLogStreams];

  for (const [id, stream] of targets) {
    if (!stream) {
      continue;
    }

    stream.removeAllListeners();
    stream.close();
    sshLogStreams.delete(id);
  }

  if (payload) {
    broadcastSshLogStatus(payload);
  }
}

export function sshExec(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    ensureSshClient().exec(command, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }

      let stdout = '';
      let stderr = '';

      stream.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });

      stream.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      stream.on('close', (code) => {
        if (code && code !== 0 && !stdout.trim()) {
          reject(new Error(stderr.trim() || `Command failed with code ${code}`));
          return;
        }

        resolve(stdout.trim());
      });
    });
  });
}

export function sshExecStreaming(
  command: string,
  onData?: (chunk: string) => void
): Promise<{ code: number | null }> {
  return new Promise((resolve, reject) => {
    ensureSshClient().exec(command, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }

      let stderr = '';

      stream.on('data', (chunk: Buffer) => {
        onData?.(chunk.toString('utf8'));
      });

      stream.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        stderr += text;
        onData?.(text);
      });

      stream.on('close', (code) => {
        if (code && code !== 0) {
          reject(new Error(stderr.trim() || `Command failed with code ${code}`));
          return;
        }

        resolve({ code });
      });
    });
  });
}

export function sshExecForAgent(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    broadcastSshData(`${command}\r\n`);

    ensureSshClient().exec(command, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }

      let stdout = '';
      let stderr = '';

      stream.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        stdout += text;
        broadcastSshData(normalizeForXterm(text));
      });

      stream.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        stderr += text;
        broadcastSshData(normalizeForXterm(text));
      });

      stream.on('close', (code) => {
        const combined = `${stdout}${stderr}`.replace(/\r\n/g, '\n').trim();
        broadcastSshData('\r\n');

        if (code && code !== 0) {
          reject(new Error(combined || `Command failed with code ${code}`));
          return;
        }

        resolve(combined || 'Command completed with no output.');
      });
    });
  });
}

export function sshExecInInteractiveShell(command: string): Promise<string> {
  const run = async (): Promise<string> => {
    const stream = ensureSshStream();
    const runId = `COOL_BUDDY_SHELL_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const startMarker = `__CB_START__${runId}__`;
    const endMarkerPrefix = `__CB_END__${runId}__`;
    const startPrefix = '__CB_START__';
    const endPrefix = '__CB_END__';
    const startSuffix = `${runId}__`;
    const endSuffix = `${runId}__`;
    const wrappedCommand =
      `__cb_s0='${startPrefix}'; ` +
      `__cb_s1='${startSuffix}'; ` +
      `__cb_e0='${endPrefix}'; ` +
      `__cb_e1='${endSuffix}'; ` +
      `printf '%s%s\\n' "$__cb_s0" "$__cb_s1"; ` +
      `{ ${command}; }; ` +
      `status=$?; printf '\\n%s%s%s\\n' "$__cb_e0" "$__cb_e1" "$status"\n`;

    interactiveShellDisplayState = {
      startMarker,
      endMarkerPrefix,
      phase: 'waiting-for-start',
      buffer: ''
    };
    broadcastSshData(`${command}\r\n`);

    return await new Promise<string>((resolve, reject) => {
      let buffer = '';
      let collected = '';
      let started = false;

      const cleanup = (): void => {
        stream.off('data', handleData);
        stream.off('close', handleClose);
      };

      const finishWithError = (error: Error): void => {
        interactiveShellDisplayState = null;
        cleanup();
        reject(error);
      };

      const handleClose = (): void => {
        finishWithError(new Error('SSH shell closed while waiting for command output.'));
      };

      const handleData = (chunk: Buffer): void => {
        buffer += chunk.toString('utf8');

        if (!started) {
          const startIndex = buffer.indexOf(startMarker);
          if (startIndex === -1) {
            if (buffer.length > 8192) {
              buffer = buffer.slice(-8192);
            }
            return;
          }

          started = true;
          buffer = buffer.slice(startIndex + startMarker.length);
          if (buffer.startsWith('\r\n')) {
            buffer = buffer.slice(2);
          } else if (buffer.startsWith('\n')) {
            buffer = buffer.slice(1);
          }
        }

        const endIndex = buffer.indexOf(endMarkerPrefix);
        if (endIndex === -1) {
          if (buffer.length > 0) {
            collected += buffer;
            buffer = '';
          }
          return;
        }

        collected += buffer.slice(0, endIndex);
        const remainder = buffer.slice(endIndex + endMarkerPrefix.length);
        const statusMatch = remainder.match(/^(\d+)\r?\n/);
        if (!statusMatch) {
          return;
        }

        cleanup();

        const exitCode = Number(statusMatch[1] ?? '1');
        const normalized = collected.replace(/\r\n/g, '\n').replace(/^\n+/, '').replace(/\n+$/, '');
        if (exitCode !== 0) {
          reject(new Error(normalized || `Command failed with code ${exitCode}`));
          return;
        }

        resolve(normalized || 'Command completed with no output.');
      };

      stream.on('data', handleData);
      stream.on('close', handleClose);
      stream.write(wrappedCommand, 'utf8', (error) => {
        if (error) {
          finishWithError(error);
        }
      });
    });
  };

  const nextRun = interactiveShellCommandChain.then(run, run);
  interactiveShellCommandChain = nextRun.then(
    () => undefined,
    () => undefined
  );
  return nextRun;
}

export async function measureSshLatency(): Promise<number | null> {
  const startedAt = Date.now();

  try {
    await sshExec(':');
    return Date.now() - startedAt;
  } catch {
    return null;
  }
}

export function disposeSsh(window?: BrowserWindow): void {
  disposeSshLogTail();

  if (sshStream) {
    sshStream.removeAllListeners();
    sshStream.close();
    sshStream = null;
  }

  interactiveShellCommandChain = Promise.resolve();

  if (sftp) {
    sftp.end();
    sftp = null;
  }

  if (sshClient) {
    sshClient.removeAllListeners();
    sshClient.end();
    sshClient = null;
  }

  const statusWindow = window ?? getMainWindow();
  if (statusWindow && !statusWindow.isDestroyed()) {
    sendSshStatus(statusWindow, {
      status: 'disconnected',
      message: 'SSH connection closed.'
    });
  }
}
