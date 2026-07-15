import { describe, expect, it } from 'vitest';

import { createSyntheticFixtureTimes } from './synthetic-fixture.js';

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
