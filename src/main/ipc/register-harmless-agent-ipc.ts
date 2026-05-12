import { ipcMain } from 'electron';
import { harmlessAgentRuntime } from '../harmless/runtime';
import type {
  ResolveAgentApprovalPayload,
  RunAgentPayload,
  SaveAgentWhitelistPayload
} from '../shared/types';

let harmlessAgentHandlersRegistered = false;

export function registerHarmlessAgentIpc(): void {
  if (harmlessAgentHandlersRegistered) {
    return;
  }

  ipcMain.handle('harmless-agent:get-state', async () => harmlessAgentRuntime.getState());
  ipcMain.handle('harmless-agent:run', async (_event, payload: RunAgentPayload) =>
    harmlessAgentRuntime.run(payload)
  );
  ipcMain.handle(
    'harmless-agent:resolve-approval',
    async (_event, payload: ResolveAgentApprovalPayload) =>
      harmlessAgentRuntime.resolveApproval(payload)
  );
  ipcMain.handle('harmless-agent:list-whitelist', async () => harmlessAgentRuntime.listWhitelist());
  ipcMain.handle(
    'harmless-agent:create-whitelist-item',
    async (_event, payload: SaveAgentWhitelistPayload) =>
      harmlessAgentRuntime.createWhitelistItem(payload)
  );
  ipcMain.handle('harmless-agent:delete-whitelist-item', async (_event, id: string) =>
    harmlessAgentRuntime.deleteWhitelistItem(id)
  );

  harmlessAgentHandlersRegistered = true;
}
