/**
 * Reading the opening hours OpenStreetMap publishes, and deciding whether a
 * place is open right now.
 *
 * Measured on the live Montréal extract: 204 of 860 named venues carry an
 * `opening_hours` tag - 118 of them a single rule, 86 several. That is the
 * data. This module reads the subset that actually occurs and **refuses
 * everything else**, because the alternative to refusing is telling a
 * visitor a bar is open when it is not.
 *
 * The overnight span is the whole point rather than an edge case. Montréal
 * bars close at 03:00, so `Mo-Su 16:00-03:00` means Monday *evening* through
 * Tuesday *morning*. Reading that as a same-day 16:00→03:00 range yields an
 * empty interval and marks every bar in the city permanently closed.
 *
 * Everything here is evaluated in `America/Toronto`. A visitor in Paris
 * asking what is open in Montréal means open *there*, and the venue's own
 * clock is the only one that matters.
 */

export const OPENING_HOURS_TIMEZONE = 'America/Toronto';

/** Monday = 0, matching the order OSM writes its day ranges in. */
const DAY_TOKENS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const;

export interface OpeningInterval {
  /** Day the interval *starts* on, 0 = Monday. */
  day: number;
  /** Minutes from midnight, 0-1439. */
  startMinute: number;
  /**
   * Minutes from the start day's midnight. Greater than 1440 for a span that
   * runs past midnight, so `16:00-03:00` is 960 → 1620 rather than an empty
   * range. Kept as an offset instead of a second day index because that is
   * what "open until" actually means to somebody standing outside at 01:00.
   */
  endMinute: number;
}

export interface OpeningSchedule {
  intervals: OpeningInterval[];
  /** Verbatim source rule, so the interface can show what was parsed. */
  raw: string;
}

function parseDayToken(token: string): number | undefined {
  const index = DAY_TOKENS.indexOf(
    token.slice(0, 2) as (typeof DAY_TOKENS)[number]
  );
  return index === -1 ? undefined : index;
}

/** "Mo-We", "Fr", "Mo-Su" -> the day indices they cover. */
function parseDays(expression: string): number[] | undefined {
  const days = new Set<number>();
  for (const part of expression.split(',')) {
    const range = part.trim().split('-');
    if (range.length === 1) {
      const day = parseDayToken(range[0]!);
      if (day === undefined) return undefined;
      days.add(day);
      continue;
    }
    if (range.length !== 2) return undefined;
    const from = parseDayToken(range[0]!);
    const to = parseDayToken(range[1]!);
    if (from === undefined || to === undefined) return undefined;
    // "Sa-Mo" wraps around the end of the week.
    for (let index = 0; index < 7; index += 1) {
      const day = (from + index) % 7;
      days.add(day);
      if (day === to) break;
    }
  }
  return [...days];
}

/** "16:00" -> 960. Accepts the single-digit hours OSM data contains ("3:00"). */
function parseClock(value: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  // 24:00 is legal in this syntax and means end-of-day, so hours may reach 24.
  if (hours > 24 || minutes > 59) return undefined;
  return hours * 60 + minutes;
}

/**
 * Parses an OSM `opening_hours` value, or returns nothing.
 *
 * Returning nothing is a first-class outcome, not a failure to handle later.
 * The syntax has holes this does not read - public holidays, month ranges,
 * week numbers, "sunrise", nth-weekday-of-month - and a venue whose rule
 * says `Mo-Fr 09:00-17:00; PH off` must simply have no schedule rather than
 * one that silently ignores the exception.
 */
export function parseOpeningHours(value: string): OpeningSchedule | undefined {
  const raw = value.trim();
  if (!raw) return undefined;

  const normalized = raw.toLowerCase();
  if (normalized === '24/7') {
    return {
      raw,
      intervals: DAY_TOKENS.map((_, day) => ({
        day,
        startMinute: 0,
        endMinute: 1440
      }))
    };
  }

  // Anything carrying syntax this module does not read is refused whole.
  // Parsing the parts it recognizes and dropping the rest would produce a
  // schedule that looks complete and is wrong exactly where the exception was.
  if (
    /(ph|sh|easter|sunrise|sunset|week |[[\]]|open|"|:\s*off)/.test(normalized)
  ) {
    return undefined;
  }

  const intervals: OpeningInterval[] = [];
  for (const rule of splitRules(normalized)) {
    const trimmed = rule.trim();
    if (!trimmed) continue;

    const match = /^([a-z,\- ]+?)\s+(.+)$/.exec(trimmed);
    // A rule with no day part at all applies every day: "08:00-03:00" is how
    // several Montréal bars state that they open daily, and rejecting it lost
    // real hours over a missing prefix.
    const days = match ? parseDays(match[1]!) : [...DAY_TOKENS.keys()];
    if (!days || days.length === 0) return undefined;

    const times = (match ? match[2]! : trimmed).trim();
    // "Mo off" removes those days from everything stated so far, which is how
    // "Mo-Su 16:00-03:00; Tu off" expresses a weekly closing day.
    if (times === 'off' || times === 'closed') {
      for (const day of days) {
        for (let index = intervals.length - 1; index >= 0; index -= 1) {
          if (intervals[index]!.day === day) intervals.splice(index, 1);
        }
      }
      continue;
    }

    for (const span of times.split(',')) {
      const bounds = span.split('-').map((bound) => bound.trim());
      if (bounds.length !== 2) return undefined;
      const start = parseClock(bounds[0]!);
      const end = parseClock(bounds[1]!);
      if (start === undefined || end === undefined) return undefined;
      // The overnight case: an end at or before the start means the next day.
      // 16:00-03:00 becomes 960 → 1620, which is what "until 3am" means.
      const endMinute = end <= start ? end + 1440 : end;
      for (const day of days) {
        intervals.push({ day, startMinute: start, endMinute });
      }
    }
  }

  return intervals.length > 0 ? { raw, intervals } : undefined;
}

/**
 * Splits an opening-hours value into rules.
 *
 * The comma does double duty in this syntax. It separates *times* within one
 * rule ("10:00-13:00, 15:00-20:40"), it separates whole *rules*
 * ("Su-Th 11:30-01:00, Fr-Sa 11:30-03:00"), and it separates *days inside one
 * rule's day list* ("Fr,Sa 11:30-03:00"). Splitting on `;` alone rejected all
 * three, which was 41 of the 193 rules in the live directory - the single
 * largest cause of lost hours.
 *
 * What each fragment starts with tells them apart:
 *
 * - a digit continues the time list of the rule being built;
 * - a day name followed by times starts a new rule;
 * - a bare day name belongs to the day list of the rule that *follows* it,
 *   not the one before. Getting that backwards is what made the first attempt
 *   at this parse "Su-Th 11:30-01:00, Fr, Sa 11:30-03:00" as a rule whose
 *   times ended in "fr", and reject the whole value.
 */
function splitRules(normalized: string): string[] {
  const rules: string[] = [];
  for (const group of normalized.split(';')) {
    let current = '';
    let pendingDays: string[] = [];
    const flush = (): void => {
      if (current) rules.push(current);
      current = '';
    };
    for (const fragment of group.split(',')) {
      const piece = fragment.trim();
      if (!piece) continue;
      if (/^[a-z]{2,3}(\s*-\s*[a-z]{2,3})?$/.test(piece)) {
        pendingDays.push(piece);
        continue;
      }
      if (/^[a-z]/.test(piece)) {
        flush();
        current = [...pendingDays, piece].join(',');
        pendingDays = [];
        continue;
      }
      current = current ? `${current},${piece}` : piece;
    }
    // Days with no rule after them ("Su,Mo" at the very end) are not a rule.
    // Keeping them would produce a day list with no times, which parses to
    // nothing and would reject the whole value.
    flush();
  }
  return rules;
}

/** Montréal wall-clock day (Monday = 0) and minute-of-day for an instant. */
export function montrealDayAndMinute(instant: Date): {
  day: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OPENING_HOURS_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(instant);
  const lookup = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  const day = parseDayToken(lookup('weekday').toLowerCase()) ?? 0;
  // 'en-CA' with hour12:false renders midnight as 24, not 00.
  const hour = Number(lookup('hour')) % 24;
  return { day, minute: hour * 60 + Number(lookup('minute')) };
}

export type OpeningState = 'open' | 'closed' | 'unknown';

/**
 * Whether a venue is open at `instant`.
 *
 * `unknown` whenever there is no schedule to answer from. That is the honest
 * answer for the 76% of venues OSM says nothing about, and it is a different
 * statement from `closed` - which claims the place is shut right now.
 *
 * A day's interval can be entered from the previous day: at 01:00 on Tuesday,
 * what is open is Monday's `16:00-03:00`. Both are checked.
 */
export function resolveOpeningState(
  schedule: OpeningSchedule | undefined,
  instant: Date
): OpeningState {
  if (!schedule || schedule.intervals.length === 0) return 'unknown';
  const { day, minute } = montrealDayAndMinute(instant);
  const previousDay = (day + 6) % 7;

  for (const interval of schedule.intervals) {
    if (
      interval.day === day &&
      minute >= interval.startMinute &&
      minute < interval.endMinute
    ) {
      return 'open';
    }
    // Yesterday's overnight span, still running into today.
    if (
      interval.day === previousDay &&
      interval.endMinute > 1440 &&
      minute < interval.endMinute - 1440
    ) {
      return 'open';
    }
  }
  return 'closed';
}

function formatMinute(minute: number): string {
  // Midnight as a *closing* time reads as 24h, not 00h: "16h–00h" looks like
  // a typo or an empty range, and the source rule said 24:00.
  if (minute > 0 && minute % 1440 === 0) return '24h';
  const normalized = minute % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}h${minutes === 0 ? '' : String(minutes).padStart(2, '0')}`;
}

const DAY_LABELS: Record<'fr' | 'en', string[]> = {
  fr: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'],
  en: [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  ]
};

/**
 * One readable line per day, for the venue sheet.
 *
 * Days with no interval are returned explicitly as closed rather than
 * omitted: a gap in a list of seven reads as "Pulso does not know", and here
 * the schedule genuinely says the place is shut.
 */
export function describeOpeningSchedule(
  schedule: OpeningSchedule,
  locale: 'fr' | 'en'
): Array<{ day: string; hours: string | undefined }> {
  return DAY_LABELS[locale].map((label, day) => {
    const spans = schedule.intervals
      .filter((interval) => interval.day === day)
      .sort((left, right) => left.startMinute - right.startMinute)
      .map(
        (interval) =>
          `${formatMinute(interval.startMinute)}–${formatMinute(interval.endMinute)}`
      );
    return {
      day: label,
      hours: spans.length > 0 ? spans.join(', ') : undefined
    };
  });
}
