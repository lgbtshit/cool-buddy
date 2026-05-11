import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { closeDatabase, getDatabase } from './data/session-store'
import { registerSessionIpc } from './ipc/register-session-ipc'
import { registerSshIpc } from './ipc/register-ssh-ipc'
import { createMainWindow } from './windows/create-main-window'

app
  .whenReady()
  .then(() => {
    electronApp.setAppUserModelId('com.electron')
    getDatabase()

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    registerSessionIpc()
    registerSshIpc()
    createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })
  .catch((error) => {
    console.error('Failed to initialize app:', error)
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  closeDatabase()
})
