import { ipcMain } from 'electron'
import { createSession, deleteSession, listSessions } from '../data/session-store'
import type { CreateSessionPayload } from '../shared/types'

let sessionHandlersRegistered = false

export function registerSessionIpc(): void {
  if (sessionHandlersRegistered) {
    return
  }

  ipcMain.handle('sessions:list', async () => listSessions())
  ipcMain.handle('sessions:create', async (_event, payload: CreateSessionPayload) =>
    createSession(payload)
  )
  ipcMain.handle('sessions:delete', async (_event, sessionId: string) => {
    deleteSession(sessionId)
    return { ok: true as const }
  })

  sessionHandlersRegistered = true
}
