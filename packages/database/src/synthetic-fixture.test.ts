import { describe, expect, it } from 'vitest';

import {
  createSyntheticFilterFixtureTimes,
  createSyntheticFixtureTimes
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
