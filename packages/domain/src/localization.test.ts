import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCALE,
  formatMontrealDate,
  formatMontrealDateTime,
  MESSAGE_CATALOGS,
  normalizeSupportedLocale,
  resolveSupportedLocale,
  translate,
  translatePlural
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
      '6 matching events in this map area.'
    );
    expect(translate('fr', 'map.count.many', { count: 6 })).toBe(
      '6 événements correspondants dans cette zone.'
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

describe('locale-aware pluralisation', () => {
  // The rule the two languages disagree about, and the one hand-written
  // `count > 1` / `count === 1` checks kept getting wrong on one side.
  it('gives zero the singular in French and the plural in English', () => {
    expect(
      translatePlural('fr', 0, 'map.eventCount', 'map.eventCountPlural')
    ).toBe('0 événement dans cette zone');
    expect(
      translatePlural('en', 0, 'map.eventCount', 'map.eventCountPlural')
    ).toBe('0 events in this area');
  });

  it('agrees on one and on many', () => {
    expect(
      translatePlural('fr', 1, 'map.eventCount', 'map.eventCountPlural')
    ).toBe('1 événement dans cette zone');
    expect(
      translatePlural('en', 1, 'map.eventCount', 'map.eventCountPlural')
    ).toBe('1 event in this area');
    expect(
      translatePlural('fr', 7, 'map.eventCount', 'map.eventCountPlural')
    ).toBe('7 événements dans cette zone');
    expect(
      translatePlural('en', 7, 'map.eventCount', 'map.eventCountPlural')
    ).toBe('7 events in this area');
  });
});
