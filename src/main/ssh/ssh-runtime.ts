import type { BrowserWindow } from 'electron';
import { Client } from 'ssh2';
import type { ClientChannel, SFTPWrapper } from 'ssh2';
import { getMainWindow } from '../state/main-window';
import type { SshLogStatusPayload, SshStatusPayload } from '../shared/types';

let sshClient: Client | null = null;
let sshStream: ClientChannel | null = null;
let sftp: SFTPWrapper | null = null;
let sshLogStream: ClientChannel | null = null;
let interactiveShellCommandChain: Promise<void> = Promise.resolve();

export function sendSshStatus(window: BrowserWindow, payload: SshStatusPayload): void {
  window.webContents.send('ssh:status', payload);
}

export function broadcastSshStatus(payload: SshStatusPayload): void {
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  sendSshStatus(mainWindow, payload);
}

export function broadcastSshLogData(chunk: string): void {
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('ssh:log-data', chunk);
}

export function broadcastSshLogStatus(payload: SshLogStatusPayload): void {
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('ssh:log-status', payload);
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

export function setSshLogStream(stream: ClientChannel | null): void {
  sshLogStream = stream;
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

export function disposeSshLogTail(payload?: SshLogStatusPayload): void {
  if (sshLogStream) {
    sshLogStream.removeAllListeners();
    sshLogStream.close();
    sshLogStream = null;
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

export function sshExecInInteractiveShell(command: string): Promise<string> {
  const run = async (): Promise<string> => {
    const stream = ensureSshStream();
    const runId = `COOL_BUDDY_SHELL_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const startMarker = `__CB_START__${runId}__`;
    const endMarkerPrefix = `__CB_END__${runId}__`;
    const wrappedCommand =
      `printf '%s\\n' '${startMarker}'; ` +
      `{ ${command}\n}; ` +
      `status=$?; printf '\\n${endMarkerPrefix}%s\\n' "$status"\n`;

    return await new Promise<string>((resolve, reject) => {
      let buffer = '';
      let collected = '';
      let started = false;

      const cleanup = (): void => {
        stream.off('data', handleData);
        stream.off('close', handleClose);
      };

      const finishWithError = (error: Error): void => {
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
  disposeSshLogTail({
    status: 'idle',
    path: '',
    message: 'Log stream stopped.'
  });

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
