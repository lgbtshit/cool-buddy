import { app } from 'electron';
import { autoUpdater } from 'electron-updater';

export const APP_UPDATE_BASE_URL = 'https://tenxll.oss-cn-shanghai.aliyuncs.com/cool-buddy/';

export type AppVersionInfo = {
  name: string;
  version: string;
  isPackaged: boolean;
  updateBaseUrl: string;
};

export type AppUpdateCheckStatus = 'up-to-date' | 'update-available' | 'not-supported' | 'error';

export type AppUpdateCheckResult = {
  status: AppUpdateCheckStatus;
  currentVersion: string;
  latestVersion: string | null;
  message: string;
  checkedAt: string;
  updateBaseUrl: string;
};

let updaterConfigured = false;
let updateCheckTask: Promise<AppUpdateCheckResult> | null = null;

/**
 * 配置应用更新器，统一手动检查更新时使用的更新源与下载策略。
 * @param void 无参数
 * @return void 无返回
 */
export function ensureUpdaterConfigured(): void {
  if (updaterConfigured) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL(APP_UPDATE_BASE_URL);
  updaterConfigured = true;
}

/**
 * 构建一次标准化的检查更新结果，保证渲染层拿到的字段结构固定。
 * @param payload 检查结果的各项字段
 * @return AppUpdateCheckResult 标准化后的检查更新结果
 */
function createUpdateCheckResult(payload: {
  status: AppUpdateCheckStatus;
  currentVersion: string;
  latestVersion?: string | null;
  message: string;
}): AppUpdateCheckResult {
  return {
    status: payload.status,
    currentVersion: payload.currentVersion,
    latestVersion: payload.latestVersion ?? null,
    message: payload.message,
    checkedAt: new Date().toISOString(),
    updateBaseUrl: APP_UPDATE_BASE_URL
  };
}

/**
 * 读取当前应用的版本信息，供设置面板展示安装版本与更新源地址。
 * @param void 无参数
 * @return AppVersionInfo 当前应用的版本信息
 */
export function getAppVersionInfo(): AppVersionInfo {
  return {
    name: app.getName(),
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    updateBaseUrl: APP_UPDATE_BASE_URL
  };
}

/**
 * 真正执行一次更新检查，并把不同结果统一转换成前端可直接展示的文本。
 * @param void 无参数
 * @return Promise<AppUpdateCheckResult> 检查更新结果
 */
async function runUpdateCheck(): Promise<AppUpdateCheckResult> {
  const currentVersion = app.getVersion();

  if (!app.isPackaged) {
    return createUpdateCheckResult({
      status: 'not-supported',
      currentVersion,
      message: '当前为开发环境，请打包后再检查更新。'
    });
  }

  ensureUpdaterConfigured();

  const result = await autoUpdater.checkForUpdates();
  if (!result) {
    return createUpdateCheckResult({
      status: 'error',
      currentVersion,
      message: '当前无法检查更新，请稍后重试。'
    });
  }

  if (result.isUpdateAvailable) {
    return createUpdateCheckResult({
      status: 'update-available',
      currentVersion,
      latestVersion: result.updateInfo.version,
      message: `发现新版本 ${result.updateInfo.version}，可以准备更新。`
    });
  }

  return createUpdateCheckResult({
    status: 'up-to-date',
    currentVersion,
    latestVersion: result.updateInfo.version,
    message: '当前已经是最新版本。'
  });
}

/**
 * 对外提供串行化的检查更新能力，避免用户连续点击造成重复请求。
 * @param void 无参数
 * @return Promise<AppUpdateCheckResult> 检查更新结果
 */
export function checkAppUpdates(): Promise<AppUpdateCheckResult> {
  if (updateCheckTask) {
    return updateCheckTask;
  }

  updateCheckTask = runUpdateCheck()
    .catch((error: unknown) => {
      const currentVersion = app.getVersion();
      const message = error instanceof Error ? error.message : '检查更新失败，请稍后重试。';
      return createUpdateCheckResult({
        status: 'error',
        currentVersion,
        message
      });
    })
    .finally(() => {
      updateCheckTask = null;
    });

  return updateCheckTask;
}
