import { describe, expect, it } from 'vitest';

import {
  createFilteredDiscoveryWindow,
  defaultModulesForGroupType,
  GROUP_MODULES,
  normalizeGroupModules,
  createMontrealDiscoveryWindow,
  EVENT_CATEGORIES,
  isEligibleForActiveDiscovery,
  MONTREAL_TIMEZONE,
  VENUE_CATEGORIES
} from './index.js';

// Traceability: PRD-0001 MAP-003, EVENT-004, and EVENT-008.

describe('MVP domain vocabulary', () => {
  it('keeps the accepted compact category family and Montréal timezone', () => {
    expect(EVENT_CATEGORIES).toHaveLength(7);
    expect(MONTREAL_TIMEZONE).toBe('America/Toronto');
  });

  it('keeps the accepted venue category family', () => {
    expect(VENUE_CATEGORIES).toHaveLength(10);
    expect(VENUE_CATEGORIES).toContain('bar');
  });
});

describe('accepted Montréal date filters', () => {
  const now = new Date('2026-07-15T23:00:00.000Z'); // Wednesday 19:00

  it.each([
    ['today', '2026-07-15T23:00:00.000Z', '2026-07-16T03:59:59.999Z'],
    ['tonight', '2026-07-15T21:00:00.000Z', '2026-07-16T07:00:00.000Z'],
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

describe('group module registry', () => {
  it('starts each group type on its own template, with the rest disabled', () => {
    const community = defaultModulesForGroupType('community');
    const event = defaultModulesForGroupType('event');

    // Every group carries the whole registry: modules outside the template
    // start disabled rather than being absent and invented later.
    expect(community).toHaveLength(GROUP_MODULES.length);
    expect(
      community.filter((entry) => entry.enabled).map((entry) => entry.module)
    ).toEqual(['programme', 'attendance']);
    expect(
      event.filter((entry) => entry.enabled).map((entry) => entry.module)
    ).toEqual(['attendance', 'programme', 'meetup_point', 'checklist']);
    expect(community.map((entry) => entry.position)).toEqual([0, 1, 2, 3]);
  });

  it('drops module names the registry no longer has', () => {
    // modules_config is jsonb and predates the current registry, so rows
    // still name the twelve modules DEC-0015 proposed but nobody built.
    const stored = [
      { module: 'ride_coordination', enabled: true, position: 0 },
      { module: 'programme', enabled: true, position: 1 },
      { module: 'expense_split', enabled: true, position: 2 }
    ];

    const normalized = normalizeGroupModules(stored);
    expect(normalized.map((entry) => entry.module)).not.toContain(
      'ride_coordination'
    );
    expect(normalized).toHaveLength(GROUP_MODULES.length);
    expect(normalized[0]).toEqual({
      module: 'programme',
      enabled: true,
      position: 0
    });
    // What survived keeps its order; everything else lands disabled after.
    expect(normalized.slice(1).every((entry) => entry.enabled === false)).toBe(
      true
    );
  });

  it('renumbers positions contiguously and ignores duplicates', () => {
    const normalized = normalizeGroupModules([
      { module: 'checklist', enabled: true, position: 40 },
      { module: 'checklist', enabled: false, position: 41 },
      { module: 'attendance', enabled: true, position: 7 }
    ]);

    expect(normalized.map((entry) => entry.position)).toEqual([0, 1, 2, 3]);
    expect(normalized[0]!.module).toBe('attendance');
    expect(normalized[1]!.module).toBe('checklist');
    // The first entry wins for a duplicated module.
    expect(normalized[1]!.enabled).toBe(true);
  });

  it('falls back to the full disabled registry for anything unusable', () => {
    for (const raw of [undefined, null, 'nope', 42, [], [null], [{}]]) {
      const normalized = normalizeGroupModules(raw);
      expect(normalized).toHaveLength(GROUP_MODULES.length);
      expect(normalized.every((entry) => entry.enabled === false)).toBe(true);
    }
  });
});
