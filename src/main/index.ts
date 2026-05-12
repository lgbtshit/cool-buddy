import { app, BrowserWindow } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { closeDatabase, getDatabase } from './data/session-store';
import { registerAgentSettingsIpc } from './ipc/register-agent-settings-ipc';
import { registerHarmlessAgentIpc } from './ipc/register-harmless-agent-ipc';
import { registerSessionIpc } from './ipc/register-session-ipc';
import { registerSshIpc } from './ipc/register-ssh-ipc';
import { destroyAppTray, createAppTray } from './tray/create-app-tray';
import { setIsQuitting } from './state/app-lifecycle';
import { createMainWindow } from './windows/create-main-window';

app
  .whenReady()
  .then(() => {
    electronApp.setAppUserModelId('com.electron');
    getDatabase();

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    registerSessionIpc();
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
