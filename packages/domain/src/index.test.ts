import { describe, expect, it } from 'vitest';

import {
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
