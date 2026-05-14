export const supportedLocales = [
  'zh-CN',
  'en-US',
  'zh-TW',
  'ja-JP',
  'ko-KR',
  'de-DE',
  'ru-RU',
  'ar-SA'
] as const;

export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = 'zh-CN';
export const fallbackLocale: Locale = 'en-US';

export const localeLabels: Record<Locale, string> = {
  'zh-CN': '简体中文',
  'en-US': 'English',
  'zh-TW': '繁體中文',
  'ja-JP': '日本語',
  'ko-KR': '한국어',
  'de-DE': 'Deutsch',
  'ru-RU': 'Русский',
  'ar-SA': 'العربية'
};

export const localeOptions = supportedLocales.map((value) => ({
  value,
  label: localeLabels[value]
}));

export function resolveLocale(input?: string | null): Locale {
  const normalized = input?.trim().toLowerCase().replace(/_/g, '-') ?? '';

  if (
    normalized === 'zh' ||
    normalized.startsWith('zh-cn') ||
    normalized.startsWith('zh-sg') ||
    normalized.startsWith('zh-hans')
  ) {
    return 'zh-CN';
  }

  if (
    normalized.startsWith('zh-tw') ||
    normalized.startsWith('zh-hk') ||
    normalized.startsWith('zh-mo') ||
    normalized.startsWith('zh-hant')
  ) {
    return 'zh-TW';
  }

  if (normalized.startsWith('ja')) return 'ja-JP';
  if (normalized.startsWith('ko')) return 'ko-KR';
  if (normalized.startsWith('de')) return 'de-DE';
  if (normalized.startsWith('ru')) return 'ru-RU';
  if (normalized.startsWith('ar')) return 'ar-SA';
  if (normalized.startsWith('en')) return 'en-US';

  return defaultLocale;
}
