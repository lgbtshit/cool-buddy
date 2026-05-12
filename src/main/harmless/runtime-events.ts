import { getMainWindow } from '../state/main-window';
import type { AgentRuntimeEvent } from '../shared/types';

export function broadcastHarmlessAgentEvent(event: AgentRuntimeEvent): void {
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('harmless-agent:event', event);
}
