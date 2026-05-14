import { ipcMain } from 'electron';
import type {
  ResolveAgentApprovalPayload,
  RunAgentPayload,
  SaveAgentWhitelistPayload
} from '../shared/types';

let harmlessAgentHandlersRegistered = false;
let harmlessAgentRuntimePromise: Promise<
  typeof import('../harmless/runtime')['harmlessAgentRuntime']
> | null = null;

async function getHarmlessAgentRuntime() {
  harmlessAgentRuntimePromise ??= import('../harmless/runtime').then(
    (module) => module.harmlessAgentRuntime
  );
  return harmlessAgentRuntimePromise;
}

export function registerHarmlessAgentIpc(): void {
  if (harmlessAgentHandlersRegistered) {
    return;
  }

  ipcMain.handle('harmless-agent:get-state', async (_event, sessionId: string) =>
    (await getHarmlessAgentRuntime()).getState(sessionId)
  );
  ipcMain.handle('harmless-agent:run', async (_event, payload: RunAgentPayload) =>
    (await getHarmlessAgentRuntime()).run(payload)
  );
  ipcMain.handle(
    'harmless-agent:resolve-approval',
    async (_event, payload: ResolveAgentApprovalPayload) =>
      (await getHarmlessAgentRuntime()).resolveApproval(payload)
  );
  ipcMain.handle('harmless-agent:list-whitelist', async () =>
    (await getHarmlessAgentRuntime()).listWhitelist()
  );
  ipcMain.handle(
    'harmless-agent:create-whitelist-item',
    async (_event, payload: SaveAgentWhitelistPayload) =>
      (await getHarmlessAgentRuntime()).createWhitelistItem(payload)
  );
  ipcMain.handle('harmless-agent:delete-whitelist-item', async (_event, id: string) =>
    (await getHarmlessAgentRuntime()).deleteWhitelistItem(id)
  );

  harmlessAgentHandlersRegistered = true;
}
