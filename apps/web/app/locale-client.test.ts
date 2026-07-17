import { describe, expect, it } from 'vitest';

import { persistBrowserLocale, resolveBrowserLocale } from './locale-client.js';

describe('web locale persistence', () => {
  it('detects a supported browser language and falls back to French', () => {
    const storage = { getItem: () => null };
    expect(resolveBrowserLocale(['fr-FR'], storage)).toBe('fr');
    expect(resolveBrowserLocale(['en-US'], storage)).toBe('en');
    expect(resolveBrowserLocale(['es-MX'], storage)).toBe('fr');
  });

  it('lets the stored manual choice override browser detection and persists changes', () => {
    let stored = 'en';
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      }
    };
    expect(resolveBrowserLocale(['fr-CA'], storage)).toBe('en');
    persistBrowserLocale('fr', storage);
    expect(resolveBrowserLocale(['en-CA'], storage)).toBe('fr');
  });
});
