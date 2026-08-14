import { describe, expect, it } from 'vitest';

import {
  describeOpeningSchedule,
  montrealDayAndMinute,
  parseOpeningHours,
  resolveOpeningState
} from './opening-hours.js';

/** A Montréal wall-clock moment, expressed as the UTC instant it really is. */
function montreal(iso: string): Date {
  return new Date(iso);
}

describe('parseOpeningHours', () => {
  it('reads a plain daily rule', () => {
    const schedule = parseOpeningHours('Mo-Su 16:00-23:00');
    expect(schedule?.intervals).toHaveLength(7);
    expect(schedule?.intervals[0]).toEqual({
      day: 0,
      startMinute: 960,
      endMinute: 1380
    });
  });

  it('carries an overnight span past midnight instead of collapsing it', () => {
    // The case the whole module exists for: Montréal bars close at 03:00, and
    // reading 16:00-03:00 as a same-day range yields an empty interval and
    // marks every bar in the city permanently closed.
    const schedule = parseOpeningHours('Mo-Su 16:00-03:00');
    expect(schedule?.intervals[0]).toEqual({
      day: 0,
      startMinute: 960,
      endMinute: 1620
    });
  });

  it('reads the single-digit hours real OSM data contains', () => {
    // Verified in the live extract: McKibbins Irish Pub publishes "11:30-3:00".
    const schedule = parseOpeningHours('Mo-Su 11:30-3:00');
    expect(schedule?.intervals[0]).toEqual({
      day: 0,
      startMinute: 690,
      endMinute: 1620
    });
  });

  it('lets a later rule override an earlier one for the same day', () => {
    const schedule = parseOpeningHours('Tu-Su 10:00-17:00; We 17:00-21:00');
    const wednesday = schedule?.intervals.filter(
      (interval) => interval.day === 2
    );
    expect(wednesday).toHaveLength(2);
  });

  it('removes a day marked off', () => {
    const schedule = parseOpeningHours('Mo-Su 16:00-03:00; Tu off');
    expect(schedule?.intervals.some((i) => i.day === 1)).toBe(false);
    expect(schedule?.intervals).toHaveLength(6);
  });

  it('reads the mixed off/open rule real venues publish', () => {
    // L'Idéal, from the live extract.
    const schedule = parseOpeningHours(
      'Mo off; Tu off; We-Th 16:00-24:00; Fr-Sa 16:00-03:00; Su off'
    );
    expect(schedule?.intervals.map((i) => i.day).sort()).toEqual([2, 3, 4, 5]);
  });

  it('expands 24/7', () => {
    const schedule = parseOpeningHours('24/7');
    expect(schedule?.intervals).toHaveLength(7);
    expect(schedule?.intervals[0]).toEqual({
      day: 0,
      startMinute: 0,
      endMinute: 1440
    });
  });

  it('wraps a day range that crosses the end of the week', () => {
    const schedule = parseOpeningHours('Sa-Mo 20:00-23:00');
    expect(schedule?.intervals.map((i) => i.day).sort()).toEqual([0, 5, 6]);
  });

  it('reads a comma as a rule separator, not only as a time separator', () => {
    // Vices & Versa, from the live directory. The comma does three jobs in
    // this syntax and splitting on ';' alone rejected 41 of the 193 real
    // rules - the single largest cause of lost hours.
    const schedule = parseOpeningHours('Su-Th 11:30-01:00, Fr,Sa 11:30-03:00');
    const friday = schedule?.intervals.find((i) => i.day === 4);
    expect(friday).toEqual({ day: 4, startMinute: 690, endMinute: 1620 });
    const sunday = schedule?.intervals.find((i) => i.day === 6);
    expect(sunday?.endMinute).toBe(1500);
  });

  it('attaches a bare day list to the rule that follows it', () => {
    // "Sa" belongs to Sunday's rule, not to Friday's. Getting this backwards
    // produced a rule whose time list ended in "sa" and rejected the value.
    const schedule = parseOpeningHours('Mo-Fr 09:30-02:00; Sa, Su 10:00-02:00');
    const saturday = schedule?.intervals.find((i) => i.day === 5);
    expect(saturday).toEqual({ day: 5, startMinute: 600, endMinute: 1560 });
    const monday = schedule?.intervals.find((i) => i.day === 0);
    expect(monday?.startMinute).toBe(570);
  });

  it('reads a rule with no day part as every day', () => {
    // Bar Monaco publishes exactly this.
    const schedule = parseOpeningHours('08:00-03:00');
    expect(schedule?.intervals).toHaveLength(7);
    expect(schedule?.intervals[0]).toEqual({
      day: 0,
      startMinute: 480,
      endMinute: 1620
    });
  });

  it('keeps several time spans in one day', () => {
    const schedule = parseOpeningHours('Su 10:00-13:00, 15:00-20:40');
    expect(schedule?.intervals.filter((i) => i.day === 6)).toHaveLength(2);
  });

  it('tolerates spaces around the time dash', () => {
    // Tonic Resto Bar publishes "08:00 - 03:00".
    expect(parseOpeningHours('08:00 - 03:00')?.intervals[0]).toEqual({
      day: 0,
      startMinute: 480,
      endMinute: 1620
    });
  });

  it('refuses a rule carrying syntax it does not read', () => {
    // Parsing the recognizable half and dropping the exception would produce
    // a schedule that looks complete and is wrong exactly where it matters.
    expect(parseOpeningHours('Mo-Fr 09:00-17:00; PH off')).toBeUndefined();
    expect(parseOpeningHours('sunrise-sunset')).toBeUndefined();
    expect(parseOpeningHours('Mo-Fr 09:00-17:00; SH off')).toBeUndefined();
    expect(parseOpeningHours('week 1-53/2 Mo 10:00-12:00')).toBeUndefined();
    // Real refusals from the live directory, all correct: an open-ended
    // "19:00+", a month range, and free text in place of hours.
    expect(parseOpeningHours('Th-Sa 19:00+')).toBeUndefined();
    expect(parseOpeningHours('May-Aug: Mo-Su,PH 09:00-18:00')).toBeUndefined();
    expect(parseOpeningHours('"under renovations"')).toBeUndefined();
  });

  it('refuses nonsense rather than inventing a schedule', () => {
    expect(parseOpeningHours('')).toBeUndefined();
    expect(parseOpeningHours('ouvert le soir')).toBeUndefined();
    expect(parseOpeningHours('Mo-Su 25:00-99:00')).toBeUndefined();
    expect(parseOpeningHours('Xx 10:00-12:00')).toBeUndefined();
  });
});

describe('montrealDayAndMinute', () => {
  it('reads the venue clock, not the viewer one', () => {
    // 2026-08-11T02:30Z is 22:30 on Monday 10 August in Montréal (EDT).
    const { day, minute } = montrealDayAndMinute(
      montreal('2026-08-11T02:30:00.000Z')
    );
    expect(day).toBe(0);
    expect(minute).toBe(22 * 60 + 30);
  });

  it('renders midnight as minute zero rather than 1440', () => {
    // 2026-08-11T04:00Z is exactly midnight in Montréal.
    expect(montrealDayAndMinute(montreal('2026-08-11T04:00:00.000Z'))).toEqual({
      day: 1,
      minute: 0
    });
  });
});

describe('resolveOpeningState', () => {
  const bar = parseOpeningHours('Mo-Su 16:00-03:00');

  it('is open during the evening', () => {
    // Monday 22:30 Montréal.
    expect(resolveOpeningState(bar, montreal('2026-08-11T02:30:00.000Z'))).toBe(
      'open'
    );
  });

  it('is still open after midnight, on the previous day rule', () => {
    // Tuesday 01:30 Montréal - what is open is Monday's 16:00-03:00 span.
    expect(resolveOpeningState(bar, montreal('2026-08-11T05:30:00.000Z'))).toBe(
      'open'
    );
  });

  it('is closed after last call', () => {
    // Tuesday 04:00 Montréal, an hour past closing.
    expect(resolveOpeningState(bar, montreal('2026-08-11T08:00:00.000Z'))).toBe(
      'closed'
    );
  });

  it('is closed in the afternoon, before opening', () => {
    // Monday 14:00 Montréal.
    expect(resolveOpeningState(bar, montreal('2026-08-10T18:00:00.000Z'))).toBe(
      'closed'
    );
  });

  it('answers unknown when there is nothing to answer from', () => {
    // Not the same statement as "closed", which claims the place is shut.
    // 76% of Montréal's mapped venues publish no hours at all.
    expect(resolveOpeningState(undefined, new Date())).toBe('unknown');
  });

  it('respects a weekly closing day', () => {
    const schedule = parseOpeningHours('Mo-Su 16:00-03:00; Tu off');
    // Tuesday 22:30 Montréal.
    expect(
      resolveOpeningState(schedule, montreal('2026-08-12T02:30:00.000Z'))
    ).toBe('closed');
    // Tuesday 01:30 is still Monday's span, so the bar really is open.
    expect(
      resolveOpeningState(schedule, montreal('2026-08-11T05:30:00.000Z'))
    ).toBe('open');
  });

  it('is always open for a 24/7 venue', () => {
    const schedule = parseOpeningHours('24/7');
    expect(
      resolveOpeningState(schedule, montreal('2026-08-11T08:00:00.000Z'))
    ).toBe('open');
  });
});

describe('describeOpeningSchedule', () => {
  it('lists all seven days, naming the closed ones', () => {
    const schedule = parseOpeningHours('We-Th 16:00-24:00; Fr-Sa 16:00-03:00');
    const described = describeOpeningSchedule(schedule!, 'fr');
    expect(described).toHaveLength(7);
    expect(described[0]).toEqual({ day: 'Lundi', hours: undefined });
    expect(described[2]).toEqual({ day: 'Mercredi', hours: '16h–24h' });
    expect(described[4]).toEqual({ day: 'Vendredi', hours: '16h–03h' });
  });
});
