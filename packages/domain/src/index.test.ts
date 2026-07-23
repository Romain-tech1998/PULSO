import { describe, expect, it } from 'vitest';

import {
  createFilteredDiscoveryWindow,
  createMontrealDiscoveryWindow,
  EVENT_CATEGORIES,
  isEligibleForActiveDiscovery,
  MONTREAL_TIMEZONE
} from './index.js';

// Traceability: PRD-0001 MAP-003, EVENT-004, and EVENT-008.

describe('MVP domain vocabulary', () => {
  it('keeps the accepted compact category family and Montréal timezone', () => {
    expect(EVENT_CATEGORIES).toHaveLength(6);
    expect(MONTREAL_TIMEZONE).toBe('America/Toronto');
  });
});

describe('accepted Montréal date filters', () => {
  const now = new Date('2026-07-15T23:00:00.000Z'); // Wednesday 19:00

  it.each([
    ['today', '2026-07-15T23:00:00.000Z', '2026-07-16T03:59:59.999Z'],
    ['tonight', '2026-07-15T23:00:00.000Z', '2026-07-16T07:00:00.000Z'],
    ['tomorrow', '2026-07-16T04:00:00.000Z', '2026-07-17T09:00:00.000Z'],
    ['weekend', '2026-07-17T21:00:00.000Z', '2026-07-20T09:00:00.000Z'],
    ['next7', '2026-07-15T23:00:00.000Z', '2026-07-23T03:59:59.999Z']
  ] as const)('applies %s in Montréal time', (date, startsAt, endsAt) => {
    const window = createFilteredDiscoveryWindow(now, { date });
    expect(window.startsAt.toISOString()).toBe(startsAt);
    expect(window.endsAt.toISOString()).toBe(endsAt);
  });

  it('supports a selected Montréal date and range inside the rolling window', () => {
    expect(
      createFilteredDiscoveryWindow(now, {
        date: 'custom',
        customStartDate: '2026-07-18'
      })
    ).toEqual({
      startsAt: new Date('2026-07-18T04:00:00.000Z'),
      endsAt: new Date('2026-07-19T03:59:59.999Z')
    });
    expect(
      createFilteredDiscoveryWindow(now, {
        date: 'custom',
        customStartDate: '2026-07-18',
        customEndDate: '2026-07-20'
      }).endsAt.toISOString()
    ).toBe('2026-07-21T03:59:59.999Z');
  });

  it('does not clip a custom date/range to the rolling 7-day baseline (Calendar view relies on this)', () => {
    // Regression: 'custom' used to fall through to the same rolling-window
    // intersection as the relative presets, so any explicitly chosen range
    // beyond ~7 days from `now` produced an inverted (startsAt > endsAt),
    // always-empty window instead of the actually-requested month.
    expect(
      createFilteredDiscoveryWindow(now, {
        date: 'custom',
        customStartDate: '2026-09-01',
        customEndDate: '2026-09-30'
      })
    ).toEqual({
      startsAt: new Date('2026-09-01T04:00:00.000Z'),
      endsAt: new Date('2026-10-01T03:59:59.999Z')
    });
  });

  it('uses the current weekend on Saturday and intersects past time with now', () => {
    const saturday = new Date('2026-07-18T18:00:00.000Z');
    const window = createFilteredDiscoveryWindow(saturday, { date: 'weekend' });
    expect(window.startsAt).toEqual(saturday);
    expect(window.endsAt.toISOString()).toBe('2026-07-20T09:00:00.000Z');
  });
});

describe('rolling Montréal discovery window', () => {
  const now = new Date('2026-07-15T23:00:00.000Z'); // 19:00 in Montréal
  const window = createMontrealDiscoveryWindow(now);

  it('runs from now through the end of the next seven Montréal calendar days', () => {
    expect(window.startsAt.toISOString()).toBe('2026-07-15T23:00:00.000Z');
    expect(window.endsAt.toISOString()).toBe('2026-07-23T03:59:59.999Z');
  });

  it('includes scheduled and postponed starts in the window', () => {
    expect(
      isEligibleForActiveDiscovery(
        { startsAt: '2026-07-16T01:00:00.000Z', status: 'scheduled' },
        window
      )
    ).toBe(true);
    expect(
      isEligibleForActiveDiscovery(
        { startsAt: '2026-07-22T23:00:00.000Z', status: 'postponed' },
        window
      )
    ).toBe(true);
  });

  it('excludes past, cancelled, and beyond-window events', () => {
    expect(
      isEligibleForActiveDiscovery(
        { startsAt: '2026-07-15T22:59:59.000Z', status: 'scheduled' },
        window
      )
    ).toBe(false);
    expect(
      isEligibleForActiveDiscovery(
        { startsAt: '2026-07-16T01:00:00.000Z', status: 'cancelled' },
        window
      )
    ).toBe(false);
    expect(
      isEligibleForActiveDiscovery(
        { startsAt: '2026-07-23T04:00:00.000Z', status: 'scheduled' },
        window
      )
    ).toBe(false);
  });
});
