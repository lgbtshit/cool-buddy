import type { BrowserWindow } from 'electron'

let mainWindowRef: BrowserWindow | null = null

export function setMainWindow(window: BrowserWindow | null): void {
  mainWindowRef = window
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindowRef
}
