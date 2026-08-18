import { createFilteredDiscoveryWindow } from '@pulso/domain';
import type { Pool } from 'pg';

export interface SyntheticFixtureTimes {
  startsAt: Date;
  endsAt: Date;
  observedAt: Date;
}

export interface SyntheticFilterFixtureTimes {
  tonight: Date;
  tomorrow: Date;
  weekend: Date;
  later: Date[];
  observedAt: Date;
}

/** Deterministic when a clock is supplied; the CLI seed supplies the real clock. */
export function createSyntheticFixtureTimes(now: Date): SyntheticFixtureTimes {
  const startsAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + 3 * 60 * 60 * 1000),
    observedAt: new Date(now)
  };
}

function timeInsideWindow(now: Date, startsAt: Date, endsAt: Date): Date {
  const candidate = new Date(
    Math.max(now.getTime(), startsAt.getTime()) + 60 * 60 * 1000
  );
  return candidate <= endsAt
    ? candidate
    : new Date(Math.max(now.getTime(), endsAt.getTime() - 15 * 60 * 1000));
}

/** Deterministic fictional coverage for Accepted filter cases. */
export function createSyntheticFilterFixtureTimes(
  now: Date
): SyntheticFilterFixtureTimes {
  const tonight = createFilteredDiscoveryWindow(now, { date: 'tonight' });
  const tomorrow = createFilteredDiscoveryWindow(now, { date: 'tomorrow' });
  const weekend = createFilteredDiscoveryWindow(now, { date: 'weekend' });
  return {
    tonight: timeInsideWindow(now, tonight.startsAt, tonight.endsAt),
    tomorrow: timeInsideWindow(now, tomorrow.startsAt, tomorrow.endsAt),
    weekend: timeInsideWindow(now, weekend.startsAt, weekend.endsAt),
    later: [72, 96, 120, 144].map(
      (hours) => new Date(now.getTime() + hours * 60 * 60 * 1000)
    ),
    observedAt: new Date(now)
  };
}

/**
 * Which window each seeded fixture event belongs to.
 *
 * The single source of truth for it. `seed.ts` reads this when inserting, and
 * `refreshSyntheticFixtureSchedule` reads it when moving the rows forward, so
 * the two can no longer disagree about what "tonight" means.
 */
export type SyntheticSlot =
  | 'tonight'
  | 'tomorrow'
  | 'weekend'
  | 'later0'
  | 'later1'
  | 'later2'
  | 'later3';

export const SYNTHETIC_FIXTURE_SCHEDULE: ReadonlyArray<{
  id: string;
  slot: SyntheticSlot;
}> = [
  { id: '00000000-0000-4000-8000-000000000001', slot: 'tonight' },
  { id: '00000000-0000-4000-8000-000000000003', slot: 'tomorrow' },
  { id: '00000000-0000-4000-8000-000000000004', slot: 'weekend' },
  { id: '00000000-0000-4000-8000-000000000005', slot: 'later0' },
  { id: '00000000-0000-4000-8000-000000000006', slot: 'later1' },
  { id: '00000000-0000-4000-8000-000000000007', slot: 'later2' },
  { id: '00000000-0000-4000-8000-000000000008', slot: 'later3' }
];

export function resolveSyntheticSlot(
  times: SyntheticFilterFixtureTimes,
  slot: SyntheticSlot
): Date {
  switch (slot) {
    case 'tonight':
      return times.tonight;
    case 'tomorrow':
      return times.tomorrow;
    case 'weekend':
      return times.weekend;
    case 'later0':
      return times.later[0]!;
    case 'later1':
      return times.later[1]!;
    case 'later2':
      return times.later[2]!;
    case 'later3':
      return times.later[3]!;
  }
}

/**
 * Recomputes the seeded fixture's start times against the current clock.
 *
 * These rows are seeded relative to whenever `pnpm db:seed` last ran, and
 * "tonight" stops being tonight a few hours later. The integration suite then
 * fails on a fixture that has gone stale rather than on anything in the code -
 * which happened three times in one afternoon, each time costing a re-seed and
 * a re-run before the real result was visible.
 *
 * Calling this from a test's setup makes the suite self-sufficient: it no
 * longer depends on when a human last ran a script. Rows that do not exist
 * are simply not updated, so a database that was never seeded still skips
 * rather than lying.
 */
export async function refreshSyntheticFixtureSchedule(
  pool: Pool,
  now: Date = new Date()
): Promise<number> {
  const times = createSyntheticFilterFixtureTimes(now);
  let updated = 0;
  for (const { id, slot } of SYNTHETIC_FIXTURE_SCHEDULE) {
    const startsAt = resolveSyntheticSlot(times, slot);
    const result = await pool.query(
      `UPDATE events
       SET starts_at = $2,
           ends_at = $2::timestamptz + interval '3 hours',
           observed_at = $3
       WHERE id = $1`,
      [id, startsAt, times.observedAt]
    );
    updated += result.rowCount ?? 0;
  }
  return updated;
}
