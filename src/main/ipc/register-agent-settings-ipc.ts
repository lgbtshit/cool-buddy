import { ipcMain } from 'electron';
import { getAgentProviderSettings, saveAgentProviderSettings } from '../data/session-store';
import { fetchProviderModels } from '../harmless/models-catalog';
import type { FetchAgentModelsPayload, SaveAgentProviderSettingsPayload } from '../shared/types';

let agentSettingsHandlersRegistered = false;

export function registerAgentSettingsIpc(): void {
  if (agentSettingsHandlersRegistered) {
    return;
  }

  ipcMain.handle('agent-settings:get-provider', async () => getAgentProviderSettings());
  ipcMain.handle('agent-settings:list-models', async (_event, payload: FetchAgentModelsPayload) =>
    fetchProviderModels(payload)
  );
  ipcMain.handle(
    'agent-settings:save-provider',
    async (_event, payload: SaveAgentProviderSettingsPayload) => saveAgentProviderSettings(payload)
  );

  agentSettingsHandlersRegistered = true;
}
