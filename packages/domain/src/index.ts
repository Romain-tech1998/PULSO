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

export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type EventStatus = (typeof EVENT_STATUSES)[number];
export type FreshnessState = (typeof FRESHNESS_STATES)[number];
export type LocationConfidence = (typeof LOCATION_CONFIDENCE_STATES)[number];
export type TrustLabel = (typeof TRUST_LABELS)[number];

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
    999
  );
  let instant = localAsUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    instant = localAsUtc - getMontrealOffsetMilliseconds(new Date(instant));
  }
  return new Date(instant);
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
      second: 59
    })
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
