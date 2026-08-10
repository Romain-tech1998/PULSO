/**
 * The one live venue lookup Pulso performs, for a search that found nothing.
 *
 * A visitor who types the name of a real Montréal bar and gets an empty
 * screen has been told, wrongly, that the place does not exist. The batch
 * import (import-osm-venues.ts) closes most of that gap in advance, but it
 * only knows what OSM held the day it ran. This closes the rest, at the
 * moment it matters, and writes what it finds so the next visitor gets it
 * from Pulso's own database.
 *
 * Nominatim, not Overpass. Overpass is an extraction API - you hand it a
 * tag filter and a bounding box - and using it to answer "is there a place
 * called X" means downloading a category to grep it. Nominatim is a search
 * API, which is the actual question, and answers it in one small request.
 *
 * Both are volunteer-run and neither is a free-for-all, which is why this
 * path is gated three ways before it ever fires:
 *
 * 1. only when the local directory returned nothing at all;
 * 2. only once per distinct query - `venue_lookup_attempts` remembers the
 *    misses, so a misspelling nobody can match is one request, not one per
 *    visitor who repeats it;
 * 3. bounded to the Montréal viewbox, so it cannot become a world geocoder.
 */
import { distanceKm, matchVenues } from './mapping/venue-identity.js';
import { categoryForOsmTag } from './sources/openstreetmap-venues.js';

import type { VenueCategory } from '@pulso/domain';

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT =
  'Pulso/0.1 (Montreal event directory; contact via pulsonight.com)';

/** The centre and radius Pulso's geographic rule already uses (DEC-0006). */
const MONTREAL = { longitude: -73.5673, latitude: 45.5017 };
const MONTREAL_RADIUS_KM = 30;

/**
 * A live result, in the shape the database needs to persist it.
 *
 * `category` is optional on purpose. Nominatim answers with whatever the
 * place is tagged as, and plenty of real answers ("Complexe Desjardins") map
 * to nothing in Pulso's vocabulary. Those are still worth returning - the
 * visitor asked for them - but an uncategorized venue stays out of the map
 * layer, exactly as a hand-entered one would.
 */
export interface LiveVenueCandidate {
  osmRef: string;
  name: string;
  address: string;
  point: { longitude: number; latitude: number };
  category?: VenueCategory | undefined;
}

interface NominatimPlace {
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  category?: string;
  class?: string;
  type?: string;
  address?: Record<string, string>;
}

/**
 * Builds the one-line address Pulso stores from Nominatim's parts.
 *
 * `display_name` is not used: it ends in "Montréal, Québec, H2X 1Y6, Canada"
 * on every single row, which is noise on a listing that is already entirely
 * Montréal.
 */
export function composeNominatimAddress(
  address: Record<string, string> | undefined
): string | undefined {
  if (!address) return undefined;
  const road = address['road'] ?? address['pedestrian'] ?? address['footway'];
  if (!road) return undefined;
  const line = [address['house_number'], road].filter(Boolean).join(' ');
  const city =
    address['city'] ??
    address['town'] ??
    address['village'] ??
    address['municipality'];
  return [line, city].filter(Boolean).join(', ');
}

export function mapNominatimPlace(
  place: NominatimPlace
): LiveVenueCandidate | undefined {
  const name = place.name?.trim();
  if (!name) return undefined;

  const latitude = Number(place.lat);
  const longitude = Number(place.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return undefined;
  }

  const point = { longitude, latitude };
  // Nominatim honours `bounded=1` for the viewbox, but a viewbox is a
  // rectangle and Pulso's rule is a radius. Re-checking here is what keeps
  // Saint-Jérôme out of a Montréal directory.
  if (distanceKm(MONTREAL, point) > MONTREAL_RADIUS_KM) return undefined;

  const address = composeNominatimAddress(place.address);
  if (!address) return undefined;

  if (!place.osm_type || place.osm_id === undefined) return undefined;

  // jsonv2 calls it `category`; the older format calls it `class`.
  const key = place.category ?? place.class;
  const category =
    key && place.type ? categoryForOsmTag(key, place.type) : undefined;

  return {
    osmRef: `${place.osm_type}/${place.osm_id}`,
    name,
    address,
    point,
    ...(category ? { category } : {})
  };
}

/**
 * Looks a name up against Nominatim, bounded to Montréal.
 *
 * Never throws. This runs inside a visitor's search request: if the endpoint
 * is slow, rate-limiting, or down, the correct outcome is the empty result
 * the search already had, not a 500 on a query that was merely unlucky.
 */
export async function lookupVenueByName(
  text: string,
  options: {
    fetchImpl?: typeof fetch;
    limit?: number;
    timeoutMs?: number;
  } = {}
): Promise<LiveVenueCandidate[]> {
  const query = text.trim();
  // Two characters match half the city and waste a request on a query no
  // human meant as a name.
  if (query.length < 3) return [];

  const fetchImpl = options.fetchImpl ?? fetch;
  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', String(options.limit ?? 5));
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('countrycodes', 'ca');
  // west,north,east,south - roughly the 30 km circle's bounding box.
  url.searchParams.set('viewbox', '-73.99,45.78,-73.15,45.23');
  url.searchParams.set('bounded', '1');

  try {
    const response = await fetchImpl(url.toString(), {
      headers: { 'User-Agent': USER_AGENT },
      // A visitor is waiting. Better a fast empty answer than a slow one.
      signal: AbortSignal.timeout(options.timeoutMs ?? 4000)
    });
    if (!response.ok) return [];
    const places = (await response.json()) as NominatimPlace[];
    if (!Array.isArray(places)) return [];

    const candidates = places
      .map(mapNominatimPlace)
      .filter((c): c is LiveVenueCandidate => c !== undefined);

    // Nominatim can return the node and the way for one building, and can
    // answer a single query with the same chain under two spellings. Same
    // three-signal test as the batch import, so a place is judged the same
    // way whether it arrives live or in bulk.
    const kept: LiveVenueCandidate[] = [];
    for (const candidate of candidates) {
      if (kept.some((existing) => matchVenues(existing, candidate).same)) {
        continue;
      }
      kept.push(candidate);
    }
    return kept;
  } catch {
    return [];
  }
}
