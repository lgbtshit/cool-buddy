import { app, Menu, Tray, nativeImage } from 'electron'
import trayIconPath from '../../../resources/tray-icon.png?asset'
import { getMainWindow } from '../state/main-window'
import { createMainWindow } from '../windows/create-main-window'

let tray: Tray | null = null

function showMainWindow() {
  const mainWindow = getMainWindow()

  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow()
    return
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.show()
  mainWindow.focus()
}

export function createAppTray(): void {
  if (tray) {
    return
  }

  const iconSize = process.platform === 'win32' ? 18 : 16
  const trayIcon = nativeImage.createFromPath(trayIconPath).resize({
    width: iconSize,
    height: iconSize
  })

  tray = new Tray(trayIcon)
  tray.setToolTip('cool-buddy')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open cool-buddy',
        click: () => showMainWindow()
      },
      {
        type: 'separator'
      },
      {
        label: 'Quit',
        click: () => app.quit()
      }
    ])
  )

  tray.on('click', () => {
    showMainWindow()
  })
}

export function destroyAppTray(): void {
  tray?.destroy()
  tray = null
}
