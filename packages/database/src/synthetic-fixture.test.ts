import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createSyntheticFilterFixtureTimes,
  createSyntheticFixtureTimes,
  resolveSyntheticSlot,
  SYNTHETIC_FIXTURE_SCHEDULE
} from './synthetic-fixture.js';

describe('fictional event schedule', () => {
  it('derives a deterministic near-future event from an injected clock', () => {
    const fixture = createSyntheticFixtureTimes(
      new Date('2026-07-15T23:00:00.000Z')
    );
    expect(fixture.startsAt.toISOString()).toBe('2026-07-16T01:00:00.000Z');
    expect(fixture.endsAt.toISOString()).toBe('2026-07-16T04:00:00.000Z');
    expect(fixture.observedAt.toISOString()).toBe('2026-07-15T23:00:00.000Z');
  });
});

describe('fictional filter fixture schedule', () => {
  it('covers Tonight, Tomorrow, This weekend and later rolling-window cases deterministically', () => {
    const fixture = createSyntheticFilterFixtureTimes(
      new Date('2026-07-15T23:00:00.000Z')
    );
    expect(fixture.tonight.toISOString()).toBe('2026-07-16T00:00:00.000Z');
    expect(fixture.tomorrow.toISOString()).toBe('2026-07-16T05:00:00.000Z');
    expect(fixture.weekend.toISOString()).toBe('2026-07-17T22:00:00.000Z');
    expect(fixture.later.map((date) => date.toISOString())).toEqual([
      '2026-07-18T23:00:00.000Z',
      '2026-07-19T23:00:00.000Z',
      '2026-07-20T23:00:00.000Z',
      '2026-07-21T23:00:00.000Z'
    ]);
  });
});

describe('the schedule stays in step with the seed', () => {
  // seed.ts runs its work at import time, so its fixture list cannot be
  // imported here. Reading the ids out of the source is crude but pins the
  // one thing that matters: a fixture added to the seed and forgotten here
  // would silently stop being refreshed, which is exactly the staleness this
  // schedule exists to end.
  it('lists every event id the seed inserts', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./seed.ts', import.meta.url)),
      'utf8'
    );
    const seeded = [...source.matchAll(/^\s*id: '([0-9a-f-]{36})',$/gm)].map(
      (match) => match[1]
    );
    expect(seeded.length).toBeGreaterThan(0);
    expect(SYNTHETIC_FIXTURE_SCHEDULE.map(({ id }) => id).sort()).toEqual(
      [...new Set(seeded)].sort()
    );
  });

  it('resolves every slot to a real date', () => {
    const times = createSyntheticFilterFixtureTimes(
      new Date('2026-07-15T23:00:00.000Z')
    );
    for (const { slot } of SYNTHETIC_FIXTURE_SCHEDULE) {
      expect(resolveSyntheticSlot(times, slot)).toBeInstanceOf(Date);
    }
  });
});
