import {
  LOCALE_COOKIE_NAME,
  resolveSupportedLocale,
  type SupportedLocale
} from '@pulso/domain/localization';
import { cookies, headers } from 'next/headers';

export async function resolveRequestLocale(): Promise<SupportedLocale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const stored = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const preferences = (headerStore.get('accept-language') ?? '')
    .split(',')
    .map((entry) => entry.split(';', 1)[0]?.trim())
    .filter((value): value is string => Boolean(value));
  return resolveSupportedLocale(preferences, stored);
}
