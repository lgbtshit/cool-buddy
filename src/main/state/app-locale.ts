import { defaultLocale, type Locale } from '../../shared/locale';

export type AppLocale = Locale;

let appLocale: AppLocale = defaultLocale;

export function getAppLocale(): AppLocale {
  return appLocale;
}

export function setAppLocale(locale: AppLocale): void {
  appLocale = locale;
}
