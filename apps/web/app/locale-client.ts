import {
  LOCALE_STORAGE_KEY,
  resolveSupportedLocale,
  type SupportedLocale
} from '@pulso/domain/localization';

export interface LocalLocaleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function resolveBrowserLocale(
  languages: readonly string[],
  storage: Pick<LocalLocaleStorage, 'getItem'>
): SupportedLocale {
  return resolveSupportedLocale(languages, storage.getItem(LOCALE_STORAGE_KEY));
}

export function persistBrowserLocale(
  locale: SupportedLocale,
  storage: Pick<LocalLocaleStorage, 'setItem'>
): void {
  storage.setItem(LOCALE_STORAGE_KEY, locale);
}
