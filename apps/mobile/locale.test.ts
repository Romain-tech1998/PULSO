import { describe, expect, it } from 'vitest';

import { loadMobileLocale, persistMobileLocale } from './locale';

describe('Android locale detection and persistence', () => {
  it('normalizes supported device locales and falls back to French', async () => {
    const storage = { getItem: async () => null };
    await expect(loadMobileLocale(['fr-CA'], storage)).resolves.toBe('fr');
    await expect(loadMobileLocale(['en-US'], storage)).resolves.toBe('en');
    await expect(loadMobileLocale(['es-MX'], storage)).resolves.toBe('fr');
  });

  it('uses and preserves the manual choice across relaunches', async () => {
    let stored: string | null = 'en';
    const storage = {
      getItem: async () => stored,
      setItem: async (_key: string, value: string) => {
        stored = value;
      }
    };
    await expect(loadMobileLocale(['fr-FR'], storage)).resolves.toBe('en');
    await persistMobileLocale('fr', storage);
    await expect(loadMobileLocale(['en-CA'], storage)).resolves.toBe('fr');
  });
});
