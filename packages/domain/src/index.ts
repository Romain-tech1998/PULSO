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
export const MONTREAL_TIMEZONE = 'America/Toronto' as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type EventStatus = (typeof EVENT_STATUSES)[number];
export type FreshnessState = (typeof FRESHNESS_STATES)[number];
export type LocationConfidence = (typeof LOCATION_CONFIDENCE_STATES)[number];

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
