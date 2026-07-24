import type { IngestionConnector, RawIngestedEvent } from '../types.js';

/**
 * Ticketmaster Discovery API v2.
 * https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
 *
 * Requires a free Consumer/API key from https://developer.ticketmaster.com
 * (register an app; the Consumer Key is the apikey query parameter). The
 * default free tier is rate-limited (5 requests/second, 5000/day at the time
 * of writing) - verify current limits in the developer portal before relying
 * on this for production volume.
 *
 * Set TICKETMASTER_API_KEY in the environment to use this connector.
 */
const DISCOVERY_BASE_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';

const SEGMENT_TO_CATEGORY: Record<string, RawIngestedEvent['category']> = {
  music: 'music',
  arts: 'show',
  'arts & theatre': 'show',
  film: 'show',
  sports: 'other',
  comedy: 'comedy'
};

interface TicketmasterEvent {
  id: string;
  name: string;
  url: string;
  info?: string;
  images?: Array<{ ratio?: string; url: string; width?: number; height?: number }>;
  classifications?: Array<{
    segment?: { name?: string };
    genre?: { name?: string };
  }>;
  dates: {
    start: { dateTime?: string; localDate?: string };
    end?: { dateTime?: string };
  };
  priceRanges?: Array<{ min?: number; currency?: string }>;
  _embedded?: {
    venues?: Array<{
      name?: string;
      address?: { line1?: string };
      location?: { longitude?: string; latitude?: string };
    }>;
    attractions?: Array<{ name?: string }>;
  };
}

interface TicketmasterResponse {
  _embedded?: { events?: TicketmasterEvent[] };
  page?: { totalPages?: number; number?: number };
}

/**
 * Ticketmaster returns a dozen-plus crops/resolutions per event. Prefer a
 * real photo (16:9, since that's what every card/hero in the UI is built
 * for) at a size that looks sharp without shipping a multi-megabyte source
 * image - the smallest candidate at or above 640px wide, falling back to
 * the largest available if every image is smaller than that.
 */
function pickImageUrl(images?: TicketmasterEvent['images']): string | undefined {
  if (!images || images.length === 0) return undefined;
  const sixteenByNine = images.filter((img) => img.ratio === '16_9');
  const candidates = sixteenByNine.length > 0 ? sixteenByNine : images;
  const sorted = [...candidates].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  const goodEnough = sorted.find((img) => (img.width ?? 0) >= 640);
  return (goodEnough ?? sorted[sorted.length - 1])?.url;
}

function mapCategory(event: TicketmasterEvent): RawIngestedEvent['category'] {
  const segmentName = event.classifications?.[0]?.segment?.name?.toLowerCase();
  const genreName = event.classifications?.[0]?.genre?.name?.toLowerCase();
  if (genreName?.includes('comedy')) return 'comedy';
  if (segmentName && SEGMENT_TO_CATEGORY[segmentName]) {
    return SEGMENT_TO_CATEGORY[segmentName];
  }
  return 'unmapped';
}

export function mapTicketmasterEvent(
  event: TicketmasterEvent,
  observedAt: string
): RawIngestedEvent {
  const venue = event._embedded?.venues?.[0];
  const longitude = Number(venue?.location?.longitude);
  const latitude = Number(venue?.location?.latitude);
  // Ticketmaster sometimes returns "0"/"0" for a venue's coordinates instead
  // of omitting them (observed on ~26% of a 200-event Montréal sample,
  // including known venues like the Bell Centre). (0, 0) is the Gulf of
  // Guinea, never a real Montréal venue, so treat it as "no coordinates"
  // rather than a valid point - see DATA-0003.
  const isNullIsland = longitude === 0 && latitude === 0;
  const hasPoint =
    !isNullIsland && Number.isFinite(longitude) && Number.isFinite(latitude);
  const priceRange = event.priceRanges?.[0];

  return {
    sourceId: 'ticketmaster',
    sourceName: 'Ticketmaster',
    sourceUrl: event.url,
    observedAt,
    title: event.name,
    description: event.info,
    category: mapCategory(event),
    startsAt: event.dates.start.dateTime ?? `${event.dates.start.localDate}T00:00:00Z`,
    endsAt: event.dates.end?.dateTime,
    venueName: venue?.name,
    address: venue?.address?.line1,
    point: hasPoint ? { longitude, latitude } : undefined,
    pointResolution: hasPoint ? 'source' : undefined,
    // Ticketmaster often omits priceRanges entirely for dynamically-priced or
    // resale-controlled listings (observed on e.g. every Canadiens game in a
    // real sample - never an empty array, the field is just absent). Per
    // product decision: Ticketmaster is inherently a paid ticketing
    // platform, so treat a missing price range as "paid, amount
    // undetermined" rather than lumping it in with genuinely uncertain
    // sources under "unknown".
    price: priceRange
      ? { kind: 'paid', minimumAmount: priceRange.min }
      : { kind: 'paid' },
    ticketingUrl: event.url,
    imageUrl: pickImageUrl(event.images),
    organizer: event._embedded?.attractions?.[0]?.name,
    raw: event
  };
}

export function createTicketmasterConnector(
  options: {
    apiKey?: string;
    city?: string;
    fetchImpl?: typeof fetch;
    maxPages?: number;
  } = {}
): IngestionConnector {
  const apiKey = options.apiKey ?? process.env.TICKETMASTER_API_KEY;
  const city = options.city ?? 'Montreal';
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxPages = options.maxPages ?? 5;

  return {
    id: 'ticketmaster',
    displayName: 'Ticketmaster Discovery API',
    async fetch(): Promise<RawIngestedEvent[]> {
      if (!apiKey) {
        throw new Error(
          'TICKETMASTER_API_KEY is not set. Register at https://developer.ticketmaster.com to obtain a free key.'
        );
      }
      const observedAt = new Date().toISOString();
      const events: RawIngestedEvent[] = [];

      for (let page = 0; page < maxPages; page += 1) {
        const url = new URL(DISCOVERY_BASE_URL);
        url.searchParams.set('apikey', apiKey);
        url.searchParams.set('city', city);
        url.searchParams.set('countryCode', 'CA');
        url.searchParams.set('size', '200');
        url.searchParams.set('page', String(page));

        const response = await fetchImpl(url.toString());
        if (!response.ok) {
          throw new Error(
            `Ticketmaster Discovery API request failed with status ${response.status}`
          );
        }
        const body = (await response.json()) as TicketmasterResponse;
        const pageEvents = body._embedded?.events ?? [];
        events.push(...pageEvents.map((event) => mapTicketmasterEvent(event, observedAt)));

        const totalPages = body.page?.totalPages ?? 1;
        if (page + 1 >= totalPages) break;
      }

      return events;
    }
  };
}
