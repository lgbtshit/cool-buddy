import { ipcMain } from 'electron';
import { setAppLocale, type AppLocale } from '../state/app-locale';
import { resolveLocale } from '../../shared/locale';

let appHandlersRegistered = false;

export function registerAppIpc(): void {
  if (appHandlersRegistered) {
    return;
  }

  ipcMain.handle('app:set-locale', async (_event, locale: AppLocale) => {
    setAppLocale(resolveLocale(locale));
    return { ok: true as const };
  });

  appHandlersRegistered = true;
}
