import { shell, BrowserWindow } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import icon from '../../../resources/icon.png?asset';
import { getIsQuitting } from '../state/app-lifecycle';
import { setMainWindow } from '../state/main-window';
import { disposeSsh } from '../ssh/ssh-runtime';

function isInternalLogWindowUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hash.startsWith('#/log-pane-window');
  } catch {
    return false;
  }
}

export function createMainWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1620,
    height: 1080,
    minWidth: 1620,
    minHeight: 1080,
    show: false,
    autoHideMenuBar: true,
    icon,
    title: 'cool-buddy',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  setMainWindow(mainWindow);

  if (is.dev) {
    mainWindow.webContents.on('before-input-event', (_event, input) => {
      const key = input.key.toLowerCase();

      if (key === 'f5') {
        mainWindow.webContents.reloadIgnoringCache();
      }

      if (key === 'f12') {
        mainWindow.webContents.toggleDevTools();
      }
    });
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isInternalLogWindowUrl(details.url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1080,
          height: 760,
          minWidth: 860,
          minHeight: 560,
          autoHideMenuBar: true,
          icon,
          title: 'cool-buddy logs',
          webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false
          }
        }
      };
    }

    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('close', (event) => {
    if (getIsQuitting() || process.platform === 'darwin') {
      return;
    }

    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('closed', () => {
    setMainWindow(null);
    disposeSsh();
  });
}
