import { normalizeForKey } from './mapping/dedupe-key.js';

export interface InstagramScoutVenueSource {
  sourceId: string;
  displayName: string;
  normalizedName: string;
  instagramHandle: string;
}

export interface InstagramScoutKnownVenue {
  id: string;
  name: string;
  address: string;
  point: { longitude: number; latitude: number };
}

export interface InstagramScoutVenueLink {
  sourceId: string;
  instagramHandle: string;
  venue: InstagramScoutKnownVenue;
  matchMethod: 'exact_normalized_name';
}

export interface InstagramScoutVenueLinkingResult {
  linked: InstagramScoutVenueLink[];
  ambiguousSourceIds: string[];
  unmatchedSourceIds: string[];
}

export function linkInstagramScoutSourcesToKnownVenues(
  sources: InstagramScoutVenueSource[],
  venues: InstagramScoutKnownVenue[]
): InstagramScoutVenueLinkingResult {
  const venuesByName = new Map<string, InstagramScoutKnownVenue[]>();
  for (const venue of venues) {
    const key = normalizeForKey(venue.name);
    venuesByName.set(key, [...(venuesByName.get(key) ?? []), venue]);
  }

  const linked: InstagramScoutVenueLink[] = [];
  const ambiguousSourceIds: string[] = [];
  const unmatchedSourceIds: string[] = [];

  for (const source of sources) {
    const candidateKeys = new Set(
      [source.displayName, source.normalizedName]
        .map(normalizeForKey)
        .filter(Boolean)
    );
    const matches = new Map<string, InstagramScoutKnownVenue>();
    for (const key of candidateKeys) {
      for (const venue of venuesByName.get(key) ?? []) {
        matches.set(venue.id, venue);
      }
    }

    if (matches.size === 1) {
      linked.push({
        sourceId: source.sourceId,
        instagramHandle: source.instagramHandle,
        venue: [...matches.values()][0]!,
        matchMethod: 'exact_normalized_name'
      });
    } else if (matches.size > 1) {
      ambiguousSourceIds.push(source.sourceId);
    } else {
      unmatchedSourceIds.push(source.sourceId);
    }
  }

  return { linked, ambiguousSourceIds, unmatchedSourceIds };
}

export interface InstagramScoutMonthlyVenueDensity {
  venueId: string;
  venueCity: string;
  venuePoint: { longitude: number; latitude: number };
  calendarMonth: string;
  validatedEventCount: number;
}

export interface InstagramScoutGeographicEligibility {
  eligible: boolean;
  reason:
    'inside_mvp_city' | 'inside_maximum_distance' | 'outside_maximum_distance';
  maximumDistanceKm: 30;
  distanceFromDowntownKm: number;
}

export const MONTREAL_DOWNTOWN_CENTER = {
  longitude: -73.5673,
  latitude: 45.5017
} as const;
export const MONTREAL_MAX_DISTANCE_KM = 30 as const;

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function distanceBetweenPointsKm(
  first: { longitude: number; latitude: number },
  second: { longitude: number; latitude: number }
): number {
  const earthRadiusKm = 6371;
  const latitudeDelta = degreesToRadians(second.latitude - first.latitude);
  const longitudeDelta = degreesToRadians(second.longitude - first.longitude);
  const firstLatitude = degreesToRadians(first.latitude);
  const secondLatitude = degreesToRadians(second.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
}

export function evaluateInstagramScoutGeographicEligibility(
  density: InstagramScoutMonthlyVenueDensity,
  mvpCity = 'Montréal'
): InstagramScoutGeographicEligibility {
  const distanceFromDowntownKm = distanceBetweenPointsKm(
    MONTREAL_DOWNTOWN_CENTER,
    density.venuePoint
  );
  const commonResult = {
    maximumDistanceKm: MONTREAL_MAX_DISTANCE_KM,
    distanceFromDowntownKm
  };

  if (density.venueCity === mvpCity) {
    return {
      eligible: true,
      reason: 'inside_mvp_city',
      ...commonResult
    };
  }
  if (distanceFromDowntownKm > MONTREAL_MAX_DISTANCE_KM) {
    return {
      eligible: false,
      reason: 'outside_maximum_distance',
      ...commonResult
    };
  }
  return {
    eligible: true,
    reason: 'inside_maximum_distance',
    ...commonResult
  };
}
