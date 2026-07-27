export const EVENT_CATEGORIES = [
  'music',
  'nightlife',
  'festival',
  'show',
  'comedy',
  'other'
] as const;

export const EVENT_STATUSES = ['scheduled', 'cancelled', 'postponed'] as const;
export const FRESHNESS_STATES = ['fresh', 'stale', 'unknown'] as const;
export const LOCATION_CONFIDENCE_STATES = ['confirmed', 'uncertain'] as const;
export const TRUST_LABELS = [
  'confirmed',
  'probable',
  'to_verify',
  'conflicting'
] as const;
export const MONTREAL_TIMEZONE = 'America/Toronto' as const;
export const DATE_FILTER_VALUES = [
  'next7',
  'today',
  'tonight',
  'tomorrow',
  'weekend',
  'custom'
] as const;
export const PRICE_FILTER_VALUES = ['all', 'free', 'paid'] as const;

// A venue's own type - distinct from EVENT_CATEGORIES above, which describes
// what kind of event is happening, not what kind of place it happens at.
// Genuinely unpopulated for almost every ingested venue at launch (Ville de
// Montréal/Ticketmaster never provide this) - only hand-curated venues
// (see seed-curated-venues.ts) have a real value. Never inferred from a
// venue's name string.
export const VENUE_CATEGORIES = [
  'bar',
  'nightclub',
  'concert_hall',
  'theater',
  'brewery_with_stage',
  'outdoor_festival_site',
  'cafe_concert',
  'gallery_museum',
  'community_space',
  'other'
] as const;

// The four per-event forum sub-discussions named explicitly in the
// original request (DEC-0012) - a fixed, small set of categories, not
// user-created ones, same pattern as EVENT_CATEGORIES.
export const FORUM_CATEGORIES = [
  'find_partners',
  'general',
  'ticket_resale',
  'find_someone'
] as const;

export const FORUM_CATEGORY_LABELS: Record<(typeof FORUM_CATEGORIES)[number], string> = {
  find_partners: 'Trouver des partenaires',
  general: 'Discussion générale',
  ticket_resale: 'Revente de place',
  find_someone: 'Retrouver quelqu’un qui était là'
};

export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type VenueCategory = (typeof VENUE_CATEGORIES)[number];
export type ForumCategory = (typeof FORUM_CATEGORIES)[number];
export type EventStatus = (typeof EVENT_STATUSES)[number];
export type FreshnessState = (typeof FRESHNESS_STATES)[number];
export type LocationConfidence = (typeof LOCATION_CONFIDENCE_STATES)[number];
export type TrustLabel = (typeof TRUST_LABELS)[number];
export type DateFilterValue = (typeof DATE_FILTER_VALUES)[number];
export type PriceFilterValue = (typeof PRICE_FILTER_VALUES)[number];

export const CATEGORY_COLORS: Record<EventCategory, string> = {
  music: '#EA3E81',
  nightlife: '#7336C1',
  festival: '#FE7C5C',
  comedy: '#FFD700',
  show: '#00CED1',
  // Was pure white - on the teardrop pin (white ring + white center dot),
  // that left the whole marker reading as "just a white dot" with no
  // shape definition. A real hue restores the contrast the other five
  // categories already have.
  other: '#94A3B8'
};

export const VENUE_CATEGORY_COLORS: Record<VenueCategory, string> = {
  bar: '#D97706',
  nightclub: '#DB2777',
  concert_hall: '#7C3AED',
  theater: '#DC2626',
  brewery_with_stage: '#B45309',
  outdoor_festival_site: '#16A34A',
  cafe_concert: '#0891B2',
  gallery_museum: '#4F46E5',
  community_space: '#65A30D',
  other: '#94A3B8'
};

export interface DiscoveryFilters {
  date: DateFilterValue;
  categories: EventCategory[];
  price: PriceFilterValue;
  customStartDate?: string;
  customEndDate?: string;
}

// 'today' rather than the originally-specified 'next7' (MAP-003) - revised
// by product decision once real ingestion volume made a 7-day default feel
// too dense to browse. Briefly 'tonight' (see PROJECT_INDEX.md), then
// refined once more to 'today' as the more broadly relevant default while
// 'tonight' stays a distinct, still-selectable option. The 7-day window
// itself is unchanged and still selectable; only the unconfigured default
// moved. See PROJECT_INDEX.md.
export const DEFAULT_DISCOVERY_FILTERS: DiscoveryFilters = {
  date: 'today',
  categories: [],
  price: 'all'
};

export interface DiscoveryWindow {
  startsAt: Date;
  endsAt: Date;
}

export interface GeographicPoint {
  longitude: number;
  latitude: number;
}

export interface SyntheticEvent {
  id: string;
  title: string;
  category: EventCategory;
  status: EventStatus;
  startsAt: string;
  endsAt?: string;
  timezone: typeof MONTREAL_TIMEZONE;
  venue: {
    id: string;
    name: string;
    address: string;
    point: GeographicPoint;
  };
}

export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface DirectDistanceSearch {
  center: GeographicPoint;
  radiusMeters: number;
}

interface MontrealDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond?: number;
}

const montrealPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MONTREAL_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

function getMontrealParts(date: Date): MontrealDateTimeParts {
  const values = Object.fromEntries(
    montrealPartsFormatter
      .formatToParts(date)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)])
  );
  return {
    year: values.year!,
    month: values.month!,
    day: values.day!,
    hour: values.hour!,
    minute: values.minute!,
    second: values.second!
  };
}

function getMontrealOffsetMilliseconds(date: Date): number {
  const parts = getMontrealParts(date);
  return (
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    ) -
    Math.trunc(date.getTime() / 1000) * 1000
  );
}

function montrealLocalToInstant(parts: MontrealDateTimeParts): Date {
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond ?? 0
  );
  let instant = localAsUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    instant = localAsUtc - getMontrealOffsetMilliseconds(new Date(instant));
  }
  return new Date(instant);
}

function addLocalDays(
  parts: MontrealDateTimeParts,
  days: number
): MontrealDateTimeParts {
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days)
  );
  const shifted: MontrealDateTimeParts = {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
  if (parts.millisecond !== undefined) {
    shifted.millisecond = parts.millisecond;
  }
  return shifted;
}

function atLocalTime(
  parts: MontrealDateTimeParts,
  hour: number,
  minute = 0,
  second = 0,
  millisecond = 0
): MontrealDateTimeParts {
  return { ...parts, hour, minute, second, millisecond };
}

function parseLocalDate(value: string): MontrealDateTimeParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Invalid Montréal calendar date.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    throw new Error('Invalid Montréal calendar date.');
  }
  return { year, month, day, hour: 0, minute: 0, second: 0 };
}

export function getMontrealCalendarDate(date: Date): string {
  const parts = getMontrealParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(
    parts.day
  ).padStart(2, '0')}`;
}

/** PRD MAP-003: now through the end of the next seven Montréal calendar days. */
export function createMontrealDiscoveryWindow(now: Date): DiscoveryWindow {
  const localNow = getMontrealParts(now);
  const endDate = new Date(
    Date.UTC(localNow.year, localNow.month - 1, localNow.day + 7)
  );
  return {
    startsAt: new Date(now),
    endsAt: montrealLocalToInstant({
      year: endDate.getUTCFullYear(),
      month: endDate.getUTCMonth() + 1,
      day: endDate.getUTCDate(),
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999
    })
  };
}

/** PRD FILTER-001: accepted Montréal date presets, intersected with MAP-003. */
export function createFilteredDiscoveryWindow(
  now: Date,
  filters: Pick<DiscoveryFilters, 'date' | 'customStartDate' | 'customEndDate'>
): DiscoveryWindow {
  const rolling = createMontrealDiscoveryWindow(now);
  const localNow = getMontrealParts(now);
  let requested: DiscoveryWindow;

  if (filters.date === 'next7') return rolling;

  if (filters.date === 'custom') {
    // Deliberately NOT intersected with the MAP-003 rolling baseline below,
    // unlike every relative preset: a user (or the Calendar view, which
    // always sends 'custom' for its displayed month) explicitly chose this
    // exact date/range, so silently clipping it to "within 7 days from now"
    // would make picking any date beyond a week pointless - previously this
    // fell through to the intersection and produced an inverted, always-
    // empty window for any custom range past the rolling cutoff.
    if (!filters.customStartDate) {
      throw new Error('A selected Montréal date is required.');
    }
    const start = parseLocalDate(filters.customStartDate);
    const end = parseLocalDate(filters.customEndDate ?? filters.customStartDate);
    const custom: DiscoveryWindow = {
      startsAt: montrealLocalToInstant(atLocalTime(start, 0)),
      endsAt: montrealLocalToInstant(atLocalTime(end, 23, 59, 59, 999))
    };
    if (custom.startsAt > custom.endsAt) {
      throw new Error('The selected date range is invalid.');
    }
    return custom;
  }

  if (filters.date === 'today') {
    // Strictly today's Montréal calendar date - unlike 'tonight' below, this
    // does not bleed into tomorrow morning.
    requested = {
      startsAt: new Date(now),
      endsAt: montrealLocalToInstant(atLocalTime(localNow, 23, 59, 59, 999))
    };
  } else if (filters.date === 'tonight') {
    // Ends at 3am the next day rather than local midnight: a late-night
    // event that starts this evening and runs past midnight is still
    // "tonight" to someone browsing, not tomorrow's listing.
    requested = {
      startsAt: new Date(now),
      endsAt: montrealLocalToInstant(atLocalTime(addLocalDays(localNow, 1), 3))
    };
  } else if (filters.date === 'tomorrow') {
    requested = {
      startsAt: montrealLocalToInstant(
        atLocalTime(addLocalDays(localNow, 1), 0)
      ),
      endsAt: montrealLocalToInstant(atLocalTime(addLocalDays(localNow, 2), 5))
    };
  } else {
    // 'weekend' - the only DateFilterValue left after next7/custom (returned
    // above) and today/tonight/tomorrow (handled above).
    const weekday = new Date(
      Date.UTC(localNow.year, localNow.month - 1, localNow.day)
    ).getUTCDay();
    const fridayOffset =
      weekday === 6 ? -1 : weekday === 0 ? -2 : (5 - weekday + 7) % 7;
    const friday = addLocalDays(localNow, fridayOffset);
    requested = {
      startsAt: montrealLocalToInstant(atLocalTime(friday, 17)),
      endsAt: montrealLocalToInstant(atLocalTime(addLocalDays(friday, 3), 5))
    };
  }

  return {
    startsAt:
      requested.startsAt > rolling.startsAt
        ? requested.startsAt
        : rolling.startsAt,
    endsAt:
      requested.endsAt < rolling.endsAt ? requested.endsAt : rolling.endsAt
  };
}

export function isEligibleForActiveDiscovery(
  event: Pick<SyntheticEvent, 'startsAt' | 'status'>,
  window: DiscoveryWindow
): boolean {
  const startsAt = new Date(event.startsAt);
  return (
    event.status !== 'cancelled' &&
    startsAt >= window.startsAt &&
    startsAt <= window.endsAt
  );
}
