import { homedir } from 'node:os';
import { spawn } from 'node:child_process';

type SendHandler = (channel: string, payload: unknown) => void;

let sendHandler: SendHandler | null = null;

export function setElectronWindowSendHandler(handler: SendHandler | null): void {
  sendHandler = handler;
}

export const app = {
  getPath(name: string): string {
    if (name === 'home') {
      return process.env.COOL_BUDDY_TAURI_HOME_DIR?.trim() || homedir();
    }

    return process.cwd();
  }
};

export class BrowserWindow {
  static windows: BrowserWindow[] = [];

  static getAllWindows(): BrowserWindow[] {
    return [...BrowserWindow.windows];
  }

  webContents = {
    send: (channel: string, payload: unknown) => {
      sendHandler?.(channel, payload);
    }
  };

  constructor() {
    BrowserWindow.windows.push(this);
  }

  isDestroyed(): boolean {
    return false;
  }

  isAlwaysOnTop(): boolean {
    return false;
  }

  isMinimized(): boolean {
    return false;
  }

  restore(): void {}

  setAlwaysOnTop(): void {}

  show(): void {}

  focus(): void {}

  moveTop(): void {}
}

export const dialog = {
  async showMessageBox() {
    return { response: 1 };
  }
};

export const shell = {
  async openPath(target: string): Promise<string> {
    return await new Promise((resolve) => {
      const child = spawn(process.platform === 'win32' ? 'cmd' : 'xdg-open', process.platform === 'win32' ? ['/c', 'start', '', target] : [target], {
        stdio: 'ignore',
        windowsHide: true
      });

      child.once('error', (error) => {
        resolve(error.message);
      });

      child.once('exit', (code) => {
        resolve(code === 0 ? '' : `Failed to open ${target}.`);
      });
    });
  }
};
