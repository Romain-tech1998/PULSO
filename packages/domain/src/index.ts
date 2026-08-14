export const EVENT_CATEGORIES = [
  'music',
  'nightlife',
  'festival',
  'show',
  'comedy',
  'sport',
  'other'
] as const;

export const EVENT_STATUSES = ['scheduled', 'cancelled', 'postponed'] as const;

// DEC-0017 provenance, deliberately orthogonal to TRUST_LABELS below:
// trust describes how well a *sourced* record was corroborated, origin
// describes where the record came from at all. Every ingested event is
// 'directory'; the other two are account-created and never appear on the
// anonymous surfaces.
export const EVENT_ORIGINS = [
  'directory',
  'verified_organizer',
  'community'
] as const;

// An after starts in the small hours. The window is what actually defines
// one in Montréal (bars close at 03:00), and matching on it means the
// filter also surfaces late-night events already in the ingested directory
// rather than only app-created ones.
export const AFTER_WINDOW_START_HOUR = 2;
export const AFTER_WINDOW_END_HOUR = 6;
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
// "general" leads (live feedback: it's the default/most-used category and
// should be the first tab, not buried second).
export const FORUM_CATEGORIES = [
  'general',
  'find_partners',
  'ticket_resale',
  'find_someone'
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type VenueCategory = (typeof VENUE_CATEGORIES)[number];
export type ForumCategory = (typeof FORUM_CATEGORIES)[number];
export type EventStatus = (typeof EVENT_STATUSES)[number];
export type FreshnessState = (typeof FRESHNESS_STATES)[number];
export type LocationConfidence = (typeof LOCATION_CONFIDENCE_STATES)[number];
export type TrustLabel = (typeof TRUST_LABELS)[number];
export type DateFilterValue = (typeof DATE_FILTER_VALUES)[number];
export type PriceFilterValue = (typeof PRICE_FILTER_VALUES)[number];

/**
 * The configurable modules of a group workspace (DEC-0015).
 *
 * A closed set, like EVENT_CATEGORIES: staff enable, disable and reorder
 * these, they do not invent new ones.
 *
 * This list is deliberately shorter than the sixteen names DEC-0015
 * proposes. It contains exactly the modules that exist, because a switch
 * that turns nothing on is worse than no switch: it promises a capability
 * Pulso does not have. Ride coordination, expense splitting, check-ins,
 * party meetups, the photo gallery and vibe inspiration are each a product
 * of their own and are not built - they come back here when they are real.
 *
 * Discussion, members and the join-request queue are not in the registry
 * either, for the opposite reason: they are not optional. Discussion is a
 * core surface DEC-0015 keeps out of the configurable set, the member list
 * is what a group *is*, and the join-request queue only exists for a
 * restricted group, where it is never unwanted. Announcements is a
 * staff-only channel now (see migration 0037), configured with the other
 * threads rather than as a module.
 */
export const GROUP_MODULES = [
  'programme',
  'attendance',
  'meetup_point',
  'checklist'
] as const;
export type GroupModule = (typeof GROUP_MODULES)[number];

export const GROUP_TYPES = ['community', 'event', 'private_crew'] as const;
export type GroupTypeValue = (typeof GROUP_TYPES)[number];

export interface GroupModuleConfig {
  module: GroupModule;
  enabled: boolean;
  /** Ordinal position in the group home. Contiguous from 0. */
  position: number;
}

/**
 * The starting layout for each group type.
 *
 * Disabling a module hides it and never destroys its data, so every group
 * carries the whole registry - the ones outside its template simply start
 * disabled, rather than being absent and having to be invented later.
 */
const GROUP_TYPE_TEMPLATES: Record<GroupTypeValue, readonly GroupModule[]> = {
  // A permanent community organises outings without one fixed venue, so it
  // starts without the meetup point it could not derive anyway.
  community: ['programme', 'attendance'],
  event: ['attendance', 'programme', 'meetup_point', 'checklist'],
  private_crew: ['attendance', 'checklist']
};

export function defaultModulesForGroupType(
  type: GroupTypeValue
): GroupModuleConfig[] {
  const template = GROUP_TYPE_TEMPLATES[type];
  return [
    ...template.map((module, position) => ({
      module,
      enabled: true,
      position
    })),
    ...GROUP_MODULES.filter((module) => !template.includes(module)).map(
      (module, index) => ({
        module,
        enabled: false,
        position: template.length + index
      })
    )
  ];
}

/**
 * Reads whatever `groups.modules_config` happens to hold and returns a
 * layout the rest of the product can rely on.
 *
 * The column is jsonb and predates this registry, so a stored row can name
 * a module that no longer exists (the twelve DEC-0015 proposed but which
 * were never built), miss one that does, or carry duplicate positions.
 * Rather than let any of that reach the interface, unknown names are
 * dropped, missing modules are appended disabled, and positions are
 * renumbered contiguously from zero.
 */
export function normalizeGroupModules(raw: unknown): GroupModuleConfig[] {
  const known = new Set<string>(GROUP_MODULES);
  const seen = new Set<GroupModule>();
  const kept: GroupModuleConfig[] = [];

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { module, enabled, position } = entry as Record<string, unknown>;
      if (typeof module !== 'string' || !known.has(module)) continue;
      const name = module as GroupModule;
      if (seen.has(name)) continue;
      seen.add(name);
      kept.push({
        module: name,
        enabled: enabled !== false,
        position: typeof position === 'number' ? position : kept.length
      });
    }
  }

  kept.sort((a, b) => a.position - b.position);
  for (const module of GROUP_MODULES) {
    if (!seen.has(module)) {
      kept.push({ module, enabled: false, position: kept.length });
    }
  }
  return kept.map((entry, position) => ({ ...entry, position }));
}

export const CATEGORY_COLORS: Record<EventCategory, string> = {
  music: '#EA3E81',
  nightlife: '#7336C1',
  festival: '#FE7C5C',
  comedy: '#FFD700',
  show: '#00CED1',
  sport: '#22C55E',
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
  // DEC-0017. Honoured only for a signed-in caller - the API ignores it
  // otherwise, since the After filter is a connected-experience surface.
  after?: boolean;
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

  if (filters.date === 'tonight') {
    // Fixed 17h-to-3am window, deliberately NOT intersected with the
    // MAP-003 rolling baseline below (whose startsAt is `now`): unlike the
    // other relative presets, someone checking "tonight" at, say, 9pm must
    // still see an event that started at 18h and is still going - clipping
    // the start to `now` silently dropped most of the evening's events the
    // later it got, which is the opposite of what "tonight" means here.
    return {
      startsAt: montrealLocalToInstant(atLocalTime(localNow, 17)),
      endsAt: montrealLocalToInstant(atLocalTime(addLocalDays(localNow, 1), 3))
    };
  }

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
    const end = parseLocalDate(
      filters.customEndDate ?? filters.customStartDate
    );
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
    // Strictly today's Montréal calendar date - unlike 'tonight' above, this
    // does not bleed into tomorrow morning.
    requested = {
      startsAt: new Date(now),
      endsAt: montrealLocalToInstant(atLocalTime(localNow, 23, 59, 59, 999))
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

// Opening hours are reached as `@pulso/domain/opening-hours`, the same way
// localization is. Re-exporting them from here instead would give this entry
// its first relative import, which the web bundler resolves literally and
// cannot follow to a .ts file.
