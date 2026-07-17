import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCALE,
  formatMontrealDate,
  formatMontrealDateTime,
  MESSAGE_CATALOGS,
  normalizeSupportedLocale,
  resolveSupportedLocale,
  translate
} from './localization.js';

describe('MVP locale resolution', () => {
  it.each([
    ['fr-CA', 'fr'],
    ['fr-FR', 'fr'],
    ['FR_ca', 'fr'],
    ['en-CA', 'en'],
    ['en-US', 'en'],
    ['es-MX', undefined]
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeSupportedLocale(input)).toBe(expected);
  });

  it('uses the first supported preference and falls back to French', () => {
    expect(resolveSupportedLocale(['es-MX', 'en-CA'])).toBe('en');
    expect(resolveSupportedLocale(['es-MX', 'de-DE'])).toBe(DEFAULT_LOCALE);
    expect(DEFAULT_LOCALE).toBe('fr');
  });

  it('lets a stored manual selection override device or browser detection', () => {
    expect(resolveSupportedLocale(['fr-CA'], 'en')).toBe('en');
    expect(resolveSupportedLocale(['en-CA'], 'fr')).toBe('fr');
  });
});

describe('typed bilingual catalogue', () => {
  it('has exactly the same keys in French and English', () => {
    expect(Object.keys(MESSAGE_CATALOGS.fr).sort()).toEqual(
      Object.keys(MESSAGE_CATALOGS.en).sort()
    );
  });

  it('interpolates Pulso-owned copy in both languages', () => {
    expect(translate('en', 'map.count.many', { count: 6 })).toBe(
      '6 matching fictional events in this map area.'
    );
    expect(translate('fr', 'map.count.many', { count: 6 })).toBe(
      '6 événements fictifs correspondants dans cette zone.'
    );
  });

  it('formats Montréal-local date and time with fr-CA and en-CA', () => {
    const value = '2026-07-17T01:30:00.000Z';
    const french = formatMontrealDateTime(value, 'fr');
    const english = formatMontrealDateTime(value, 'en');
    expect(french).not.toBe(english);
    expect(french).toContain('21');
    expect(english).toContain('9');
    expect(formatMontrealDate(value, 'fr')).not.toBe(
      formatMontrealDate(value, 'en')
    );
  });
});
