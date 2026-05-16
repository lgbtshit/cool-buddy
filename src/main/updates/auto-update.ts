import { app, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import { setIsQuitting } from '../state/app-lifecycle';

let initialized = false;

export function initializeAutoUpdates(): void {
  if (initialized || !app.isPackaged) {
    return;
  }

  initialized = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (error) => {
    console.error('Auto update failed:', error);
  });

  autoUpdater.on('update-available', (info) => {
    console.info(`Update available: ${info.version}`);
  });

  autoUpdater.on('update-not-available', (info) => {
    console.info(`No update available. Current version: ${info.version}`);
  });

  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `cool-buddy ${info.version} is ready to install.`,
      detail: 'Restart the app to finish the update.'
    });

    if (response === 0) {
      setIsQuitting(true);
      autoUpdater.quitAndInstall();
    }
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error('Failed to check for updates:', error);
    });
  }, 5000);
}
