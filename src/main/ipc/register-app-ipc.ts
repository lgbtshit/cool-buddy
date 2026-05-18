import { ipcMain } from 'electron';
import { setAppLocale, type AppLocale } from '../state/app-locale';
import { resolveLocale } from '../../shared/locale';
import { checkAppUpdates, getAppVersionInfo } from '../updater/app-updater';

let appHandlersRegistered = false;

/**
 * 注册应用级 IPC 能力，负责语言切换、版本信息读取与手动检查更新。
 * @param void 无参数
 * @return void 无返回
 */
export function registerAppIpc(): void {
  if (appHandlersRegistered) {
    return;
  }

  ipcMain.handle('app:set-locale', async (_event, locale: AppLocale) => {
    setAppLocale(resolveLocale(locale));
    return { ok: true as const };
  });
  ipcMain.handle('app:get-version-info', async () => getAppVersionInfo());
  ipcMain.handle('app:check-updates', async () => checkAppUpdates());

  appHandlersRegistered = true;
}
