import {
  LOCALE_STORAGE_KEY,
  resolveSupportedLocale,
  type SupportedLocale
} from '@pulso/domain/localization';

export interface AsyncLocaleStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export async function loadMobileLocale(
  languageTags: readonly string[],
  storage: Pick<AsyncLocaleStorage, 'getItem'>
): Promise<SupportedLocale> {
  const stored = await storage.getItem(LOCALE_STORAGE_KEY);
  return resolveSupportedLocale(languageTags, stored);
}

export async function persistMobileLocale(
  locale: SupportedLocale,
  storage: Pick<AsyncLocaleStorage, 'setItem'>
): Promise<void> {
  await storage.setItem(LOCALE_STORAGE_KEY, locale);
}
