import { app, BrowserWindow } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { closeDatabase } from './data/session-store';
import { registerAppIpc } from './ipc/register-app-ipc';
import { registerAgentSettingsIpc } from './ipc/register-agent-settings-ipc';
import { registerHarmlessAgentIpc } from './ipc/register-harmless-agent-ipc';
import { registerSessionIpc } from './ipc/register-session-ipc';
import { registerSshIpc } from './ipc/register-ssh-ipc';
import { setAppLocale } from './state/app-locale';
import { resolveLocale } from '../shared/locale';
import { destroyAppTray, createAppTray } from './tray/create-app-tray';
import { setIsQuitting } from './state/app-lifecycle';
import { createMainWindow } from './windows/create-main-window';

app
  .whenReady()
  .then(() => {
    electronApp.setAppUserModelId('com.electron');
    setAppLocale(resolveLocale(app.getLocale()));

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    registerSessionIpc();
    registerAppIpc();
    registerAgentSettingsIpc();
    registerHarmlessAgentIpc();
    registerSshIpc();
    createMainWindow();
    createAppTray();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
        return;
      }

      BrowserWindow.getAllWindows()[0]?.show();
    });
  })
  .catch((error) => {
    console.error('Failed to initialize app:', error);
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  setIsQuitting(true);
  destroyAppTray();
  closeDatabase();
});
