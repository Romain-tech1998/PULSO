export interface SyntheticFixtureTimes {
  startsAt: Date;
  endsAt: Date;
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
