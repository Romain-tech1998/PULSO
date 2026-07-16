import { createFilteredDiscoveryWindow } from '@pulso/domain';

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
