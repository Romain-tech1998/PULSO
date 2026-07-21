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
const USER_AGENT = 'Pulso/0.0 (Montreal event map; contact via project repo)';
const MIN_DELAY_MS = 1100;

interface NominatimResult {
  lat: string;
  lon: string;
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
