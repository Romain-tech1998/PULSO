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
  url.searchParams.set('q', query);
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
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  return { longitude, latitude };
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
  { venueName: string | undefined; address: string } | undefined
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

  return { venueName, address: result.display_name };
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
      enriched.push({ ...event, pointResolution: event.pointResolution ?? 'source' });
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
    maxAttempts?: number;
  } = {}
): Promise<RawIngestedEvent[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const delayMs = options.delayMs ?? MIN_DELAY_MS;
  const reverseGeocode = options.reverseGeocodeImpl ?? reverseGeocodeAddress;
  const maxAttempts = options.maxAttempts ?? 3;

  // Recurring events (a multi-date exhibition, a weekly show) commonly share
  // the exact same point - verified in practice, two rows for the same
  // point independently hit Nominatim and got different outcomes (one
  // resolved, one didn't) purely from per-request flakiness. Caching by
  // coordinate means every event at a given point converges on the same
  // answer instead of each rolling its own dice, and cuts real request
  // volume on the rate-limited endpoint.
  type ReverseGeocodeResult = { venueName: string | undefined; address: string } | undefined;
  const cache = new Map<string, ReverseGeocodeResult>();

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

    enriched.push({
      ...event,
      // OSM only tags a leisure/amenity/building/tourism name for actual
      // POIs - most reverse-geocoded points (a park bench, a random street
      // corner) resolve to a real, correct address but no named venue at
      // all. Falling back to that address rather than leaving venueName
      // unset means the mapper's 'Unknown venue' placeholder (to-public-
      // event.ts) never fires for an event whose location is genuinely
      // known, only for the rarer case of genuinely no data.
      venueName: resolved?.venueName ?? resolved?.address ?? event.venueName,
      address: resolved?.address ?? event.address
    });
  }

  return enriched;
}
