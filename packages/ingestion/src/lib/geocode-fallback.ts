import type { RawIngestedEvent } from '../types.js';

/**
 * Recovers a usable point for events whose source returned missing or
 * clearly-invalid coordinates (see DATA-0003: ~26% of a Ticketmaster Montréal
 * sample returned literal (0, 0) instead of omitting the field).
 *
 * Two tiers, deliberately different in how much they can be trusted:
 *
 * 1. Known address/venue name -> geocode it. Uses OpenStreetMap Nominatim,
 *    the same open geographic stack already used for MapLibre in this repo.
 *    Nominatim is free but has a strict usage policy: max 1 request/second,
 *    a descriptive User-Agent identifying the application, and no heavy
 *    production traffic without self-hosting or a commercial arrangement -
 *    see https://operations.osmfoundation.org/policies/nominatim/. This
 *    connector respects the rate limit by processing events sequentially
 *    with a delay; it must not be parallelized against the public endpoint.
 *
 * 2. No address or venue name at all -> this module does NOT attempt an
 *    open-ended web search to guess one. Automatically inventing an address
 *    from an uncontrolled search result risks placing an event at a wrong
 *    or defunct venue with no way to verify it, which conflicts with
 *    DATA-0001's uncertainty-disclosure rules and DEC-0006's "no candidate
 *    without evidence and review" principle. These events are instead
 *    flagged `pointResolution: 'needs_research'` so they can be queued for
 *    a human (or a separately reviewed, source-specific lookup) rather than
 *    silently mislocated or silently dropped.
 */

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'Pulso/0.0 (Montreal event map; contact via project repo)';
const MIN_DELAY_MS = 1100;

interface NominatimResult {
  lat: string;
  lon: string;
}

interface NominatimReverseResult {
  display_name?: string;
  address?: {
    leisure?: string;
    amenity?: string;
    building?: string;
    tourism?: string;
    house_number?: string;
    road?: string;
  };
}

export async function geocodeAddress(
  query: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ longitude: number; latitude: number } | undefined> {
  const url = new URL(NOMINATIM_SEARCH_URL);
  // Some sources (observed: Parse.bot RA) separate address components with
  // semicolons instead of commas - verified live that Nominatim's free-text
  // parser can fail on an otherwise-correct address purely because of that,
  // while the identical address with commas resolves fine.
  url.searchParams.set('q', query.replace(/;/g, ','));
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'ca');

  const response = await fetchImpl(url.toString(), {
    headers: { 'User-Agent': USER_AGENT }
  });
  if (!response.ok) return undefined;

  const results = (await response.json()) as NominatimResult[];
  const first = results[0];
  if (!first) return undefined;

  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
    return undefined;
  return { longitude, latitude };
}

/**
 * Nominatim's Montréal/Québec coverage is authoritatively in French ("Rue
 * Sainte-Catherine Est"), but some sources format the same street in English
 * ("Saint-Catherine Street East") - verified live that this alone is enough
 * for Nominatim to return nothing, even though the street clearly exists.
 * This is a narrow, position-aware heuristic for the small set of
 * type/direction words actually observed (RA), not a general address
 * parser: it moves a trailing English street-type word to the front in its
 * French form, translates a trailing compass direction, and corrects the
 * handful of well-known Montréal streets named after a woman saint (French
 * "Sainte-" vs. "Saint-") that sources otherwise get wrong indiscriminately.
 * Returns undefined when nothing recognizable was found, so callers know
 * not to bother retrying with it.
 */
const STREET_TYPE_TO_FRENCH: Record<string, string> = {
  street: 'Rue',
  st: 'Rue',
  boulevard: 'Boulevard',
  blvd: 'Boulevard',
  avenue: 'Avenue',
  ave: 'Avenue',
  road: 'Chemin',
  rd: 'Chemin'
};

const DIRECTION_TO_FRENCH: Record<string, string> = {
  east: 'Est',
  e: 'Est',
  west: 'Ouest',
  w: 'Ouest',
  north: 'Nord',
  n: 'Nord',
  south: 'Sud',
  s: 'Sud'
};

// Montréal streets named after a female saint that English sources
// (observed: RA) commonly spell with the masculine "Saint-" instead of the
// correct feminine "Sainte-" - e.g. "Saint-Catherine" instead of
// "Sainte-Catherine", Montréal's main downtown/nightlife street.
const FEMININE_SAINT_STREET_NAMES = new Set([
  'catherine',
  'anne',
  'famille',
  'helene',
  'hélène',
  'cunegonde',
  'cunégonde'
]);

export function translateStreetToFrench(
  streetLine: string
): string | undefined {
  const match = /^(\d+[A-Za-z]?\s+)?(.+)$/.exec(streetLine.trim());
  if (!match) return undefined;
  const houseNumber = match[1] ?? '';
  const words = match[2]!.split(/\s+/);

  let direction: string | undefined;
  const directionKey = words[words.length - 1]!.replace(
    /\.$/,
    ''
  ).toLowerCase();
  if (DIRECTION_TO_FRENCH[directionKey]) {
    direction = DIRECTION_TO_FRENCH[directionKey];
    words.pop();
  }

  let streetType: string | undefined;
  const typeWord = words[words.length - 1];
  if (typeWord) {
    const typeKey = typeWord.replace(/\.$/, '').toLowerCase();
    if (STREET_TYPE_TO_FRENCH[typeKey]) {
      streetType = STREET_TYPE_TO_FRENCH[typeKey];
      words.pop();
    }
  }

  // Nothing recognizable (type or direction) - not worth retrying with.
  if (!streetType && !direction) return undefined;
  // The source omitted the street type entirely (e.g. "Saint Catherine
  // East") - "Rue" is the most common type in Montréal's dense core and is
  // only ever tried as a fallback query, after the original already failed.
  streetType ??= 'Rue';

  let name = words.join(' ');
  name = name
    .replace(/^Ste\.?\s+(?=[A-Z])/, 'Sainte-')
    .replace(/^St\.?\s+(?=[A-Z])/, 'Saint-')
    .replace(/\bSainte\s+(?=[A-Z])/g, 'Sainte-')
    .replace(/\bSaint\s+(?=[A-Z])/g, 'Saint-')
    .replace(/\bSaint-(\w+)/g, (full, saintName: string) =>
      FEMININE_SAINT_STREET_NAMES.has(saintName.toLowerCase())
        ? `Sainte-${saintName}`
        : full
    );

  return [houseNumber.trim(), streetType, name, direction]
    .filter(Boolean)
    .join(' ');
}

/**
 * Retries geocodeAddress with an English->French street-type translation
 * applied to each comma/semicolon-separated segment of the query (a source
 * may put the street segment first, e.g. "858 Main St East, Montreal, ..."
 * or after a venue name, e.g. "Some Venue, 858 Main St East, Montreal,
 * ..."). Only fires the second Nominatim request when the original query
 * failed AND at least one segment actually had something to translate.
 */
export async function geocodeAddressWithFrenchFallback(
  query: string,
  fetchImpl: typeof fetch = fetch,
  delayMs: number = MIN_DELAY_MS
): Promise<{ longitude: number; latitude: number } | undefined> {
  const direct = await geocodeAddress(query, fetchImpl);
  if (direct) return direct;

  const segments = query.split(/[,;]/).map((segment) => segment.trim());
  let translatedAny = false;
  const translatedSegments = segments.map((segment) => {
    const translated = translateStreetToFrench(segment);
    if (translated) translatedAny = true;
    return translated ?? segment;
  });
  if (!translatedAny) return undefined;

  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return geocodeAddress(translatedSegments.join(', '), fetchImpl);
}

/**
 * Inverse of geocodeAddress: recovers a human-readable venue name/address
 * from a point that's already trusted (source-provided or already
 * geocoded), for sources whose structured address fields are missing even
 * though the underlying dataset's own coordinates are fine - observed on
 * ~92% of in-scope Ville de Montréal rows (the CSV export represents a
 * missing address as "nan", not an empty cell; see DATA-0003). The location
 * itself is never in question here, only its name/label.
 */
export async function reverseGeocodeAddress(
  point: { longitude: number; latitude: number },
  fetchImpl: typeof fetch = fetch
): Promise<
  | {
      venueName: string | undefined;
      shortLabel: string | undefined;
      address: string;
    }
  | undefined
> {
  const url = new URL(NOMINATIM_REVERSE_URL);
  url.searchParams.set('lat', String(point.latitude));
  url.searchParams.set('lon', String(point.longitude));
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');

  const response = await fetchImpl(url.toString(), {
    headers: { 'User-Agent': USER_AGENT }
  });
  if (!response.ok) return undefined;

  const result = (await response.json()) as NominatimReverseResult;
  if (!result.display_name) return undefined;

  const venueName =
    result.address?.leisure ??
    result.address?.amenity ??
    result.address?.building ??
    result.address?.tourism;
  // A short "123 Rue Example" label, distinct from the full display_name
  // (which repeats the same street plus borough/city/province/postal code/
  // country) - used as a lighter-weight fallback venue label so "Lieu" and
  // "Adresse" don't show the exact same long string twice.
  const shortLabel = result.address?.road
    ? [result.address.house_number, result.address.road]
        .filter(Boolean)
        .join(' ')
    : undefined;

  return { venueName, shortLabel, address: result.display_name };
}

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const NEARBY_POI_RADIUS_METERS = 120;

// Tags recognized as a real, named place worth surfacing as a venue label
// when the event's exact point itself has no POI name (see
// reverseGeocodeAddress above) - deliberately narrow to the kind of public/
// civic/cultural/recreational facility Ville de Montréal's own open data
// events actually occur at (a park, a pool, a community centre), and
// excludes anything commercial (a shop, an office) or purely
// infrastructural (a bus stop, a bike-share dock) that a raw radius search
// would otherwise happily return.
const NEARBY_POI_LEISURE_VALUES = new Set([
  'park',
  'sports_centre',
  'swimming_pool',
  'stadium',
  'pitch',
  'ice_rink',
  'garden',
  'common'
]);
const NEARBY_POI_AMENITY_VALUES = new Set([
  'community_centre',
  'arts_centre',
  'theatre',
  'social_facility',
  'library',
  'events_venue',
  'conference_centre',
  'marketplace'
]);
const NEARBY_POI_TOURISM_VALUES = new Set(['museum', 'gallery', 'attraction']);

interface OverpassElement {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: {
    name?: string;
    leisure?: string;
    amenity?: string;
    tourism?: string;
  };
}

function haversineMeters(
  a: { longitude: number; latitude: number },
  b: { longitude: number; latitude: number }
): number {
  const earthRadiusMeters = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h));
}

/**
 * Last-resort venue label for a point with no on-point OSM name at all
 * (reverseGeocodeAddress found neither a leisure/amenity/tourism/building
 * tag) - looks for the closest allowlisted named facility within
 * NEARBY_POI_RADIUS_METERS via the Overpass API. Real, OpenStreetMap-sourced
 * data only: never invents a name, and only ever returns one that's already
 * mapped and named by OSM contributors near the event's real coordinates.
 */
export async function findNearbyNamedPlace(
  point: { longitude: number; latitude: number },
  fetchImpl: typeof fetch = fetch
): Promise<string | undefined> {
  const query =
    `[out:json][timeout:15];` +
    `(node(around:${NEARBY_POI_RADIUS_METERS},${point.latitude},${point.longitude})[name];` +
    `way(around:${NEARBY_POI_RADIUS_METERS},${point.latitude},${point.longitude})[name];);` +
    `out center 30;`;

  const response = await fetchImpl(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `data=${encodeURIComponent(query)}`
  });
  if (!response.ok) return undefined;

  const result = (await response.json()) as { elements?: OverpassElement[] };
  const candidates = (result.elements ?? [])
    .map((element) => {
      const tags = element.tags;
      const name = tags?.name;
      if (!name) return undefined;
      const qualifies =
        (tags.leisure !== undefined &&
          NEARBY_POI_LEISURE_VALUES.has(tags.leisure)) ||
        (tags.amenity !== undefined &&
          NEARBY_POI_AMENITY_VALUES.has(tags.amenity)) ||
        (tags.tourism !== undefined &&
          NEARBY_POI_TOURISM_VALUES.has(tags.tourism));
      if (!qualifies) return undefined;
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      if (lat === undefined || lon === undefined) return undefined;
      return {
        name,
        distanceMeters: haversineMeters(point, {
          latitude: lat,
          longitude: lon
        })
      };
    })
    .filter(
      (candidate): candidate is { name: string; distanceMeters: number } =>
        Boolean(candidate)
    );
  if (candidates.length === 0) return undefined;

  candidates.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return candidates[0]!.name;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function enrichMissingCoordinates(
  events: RawIngestedEvent[],
  options: {
    fetchImpl?: typeof fetch;
    delayMs?: number;
    geocodeImpl?: typeof geocodeAddress;
  } = {}
): Promise<RawIngestedEvent[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const delayMs = options.delayMs ?? MIN_DELAY_MS;
  const geocode = options.geocodeImpl ?? geocodeAddress;

  const enriched: RawIngestedEvent[] = [];
  for (const event of events) {
    if (event.point) {
      enriched.push({
        ...event,
        pointResolution: event.pointResolution ?? 'source'
      });
      continue;
    }

    const queryParts = [event.address, event.venueName].filter(
      (part): part is string => Boolean(part && part.trim().length > 0)
    );
    if (queryParts.length === 0) {
      enriched.push({ ...event, pointResolution: 'needs_research' });
      continue;
    }

    const query = `${queryParts.join(', ')}, Montréal, QC, Canada`;
    const point = await geocode(query, fetchImpl);
    enriched.push({
      ...event,
      point,
      pointResolution: point ? 'geocoded' : 'unresolved'
    });

    // Respect Nominatim's 1 request/second policy between calls.
    await delay(delayMs);
  }

  return enriched;
}

/**
 * Backfills venueName/address for events that already have a trusted point
 * but no name/address text at all (both missing, not just one) - run this
 * after enrichMissingCoordinates, since it needs a resolved point as input
 * rather than producing one.
 */
export async function enrichMissingAddresses(
  events: RawIngestedEvent[],
  options: {
    fetchImpl?: typeof fetch;
    delayMs?: number;
    reverseGeocodeImpl?: typeof reverseGeocodeAddress;
    nearbyPlaceImpl?: typeof findNearbyNamedPlace;
    maxAttempts?: number;
  } = {}
): Promise<RawIngestedEvent[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const delayMs = options.delayMs ?? MIN_DELAY_MS;
  const reverseGeocode = options.reverseGeocodeImpl ?? reverseGeocodeAddress;
  const findNearbyPlace = options.nearbyPlaceImpl ?? findNearbyNamedPlace;
  const maxAttempts = options.maxAttempts ?? 3;

  // Recurring events (a multi-date exhibition, a weekly show) commonly share
  // the exact same point - verified in practice, two rows for the same
  // point independently hit Nominatim and got different outcomes (one
  // resolved, one didn't) purely from per-request flakiness. Caching by
  // coordinate means every event at a given point converges on the same
  // answer instead of each rolling its own dice, and cuts real request
  // volume on the rate-limited endpoint.
  type ReverseGeocodeResult = Awaited<ReturnType<typeof reverseGeocodeAddress>>;
  const cache = new Map<string, ReverseGeocodeResult>();
  const nearbyPlaceCache = new Map<string, string | undefined>();

  const enriched: RawIngestedEvent[] = [];
  for (const event of events) {
    const hasVenueName = Boolean(event.venueName && event.venueName.trim());
    const hasAddress = Boolean(event.address && event.address.trim());
    if (hasVenueName || hasAddress || !event.point) {
      enriched.push(event);
      continue;
    }

    const cacheKey = `${event.point.latitude.toFixed(5)},${event.point.longitude.toFixed(5)}`;
    let resolved: ReverseGeocodeResult = cache.get(cacheKey);
    if (!cache.has(cacheKey)) {
      // Verified in practice against the live endpoint: coordinates that
      // came back empty during a large sequential batch resolved correctly
      // moments later on their own - transient failures (rate-limiting,
      // timeouts), not a real absence of data. Retry before giving up
      // rather than settling for "Unknown venue" on what Nominatim can
      // actually answer.
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          resolved = await reverseGeocode(event.point, fetchImpl);
        } catch {
          resolved = undefined;
        }
        if (resolved || attempt === maxAttempts) break;
        await delay(delayMs);
      }
      cache.set(cacheKey, resolved);
      // Respect Nominatim's 1 request/second policy between calls - only
      // needed when this coordinate actually made a request.
      await delay(delayMs);
    }

    // The exact point often has no on-point POI name at all (a park bench,
    // a random street corner) - before settling for a bare street address,
    // check for a real named facility a short walk away (findNearbyNamedPlace
    // above). Still cached per coordinate, still only attempted when nothing
    // better is already known.
    let nearbyPlace: string | undefined;
    if (!resolved?.venueName) {
      if (nearbyPlaceCache.has(cacheKey)) {
        nearbyPlace = nearbyPlaceCache.get(cacheKey);
      } else {
        try {
          nearbyPlace = await findNearbyPlace(event.point, fetchImpl);
        } catch {
          nearbyPlace = undefined;
        }
        nearbyPlaceCache.set(cacheKey, nearbyPlace);
        await delay(delayMs);
      }
    }

    enriched.push({
      ...event,
      // OSM only tags a leisure/amenity/building/tourism name for actual
      // POIs - most reverse-geocoded points (a park bench, a random street
      // corner) resolve to a real, correct address but no named venue at
      // all. A real named facility a short walk away (nearbyPlace) beats the
      // short "123 Rue Example" label (shortLabel), which itself beats the
      // full display_name (which repeats the same street plus borough/city/
      // province/postal code/country) - together they mean the mapper's
      // 'Unknown venue' placeholder (to-public-event.ts) never fires for an
      // event whose location is genuinely known, without making "Lieu" and
      // "Adresse" show the identical long string twice.
      venueName:
        resolved?.venueName ??
        nearbyPlace ??
        resolved?.shortLabel ??
        event.venueName,
      address: resolved?.address ?? event.address
    });
  }

  return enriched;
}
