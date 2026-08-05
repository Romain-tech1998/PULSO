import type { IngestionConnector, RawIngestedEvent } from '../types.js';

/**
 * Eventbrite events via the "Eventbrite Scraper — Event & Organizer Data"
 * Apify actor (id `WNUjlCROzqWUGQgfR`), not Eventbrite's own API: Eventbrite
 * retired public event search in February 2020 (see DATA-0003), so this
 * connector scrapes public listing pages through Apify's hosted actor
 * instead. Verified live against a real 3-result run before writing this
 * mapping - every field below is taken from an actual response, not
 * guessed from Apify's generic documentation.
 *
 * Billing: PAY_PER_EVENT, $0.02/result on the free tier (see the actor's
 * pricingInfos) plus a negligible one-time actor-start charge. A run is
 * only meant to be triggered on a slow cadence (weekly), not per ingest -
 * see packages/database/src/ingest.ts's --eventbrite path.
 *
 * Set APIFY_API_TOKEN in the environment to use this connector.
 */

const APIFY_ACTOR_ID = 'WNUjlCROzqWUGQgfR';
const APIFY_RUNS_URL = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs`;
// The convenience run-sync-get-dataset-items endpoint has a hard 300s
// server-side timeout (verified live: a real run returned HTTP 408 after
// exactly 5 minutes even though the actor kept running server-side). This
// actor's real run time varies with Apify/Eventbrite load and can exceed
// that, so runs are submitted asynchronously and polled instead - no
// server-imposed cap on total wait, bounded only by MAX_POLL_MS below.
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_MS = 10 * 60 * 1000;

interface EventbriteTag {
  prefix?: string;
  display_name?: string;
}

interface EventbriteApifyEvent {
  id?: string;
  eventbrite_event_id?: string;
  name?: string;
  summary?: string;
  url?: string;
  tickets_url?: string;
  image_url?: string;
  start_datetime?: string;
  end_time?: string;
  end_date?: string;
  timezone?: string;
  is_online_event?: boolean;
  is_cancelled?: boolean | null;
  venue_address?: string;
  latitude?: string | undefined;
  longitude?: string | undefined;
  primary_venue?: { name?: string };
  primary_organizer?: { name?: string };
  tags?: EventbriteTag[];
  ticket_availability?: {
    is_free?: boolean;
    minimum_ticket_price?: { major_value?: string };
  };
}

// Observed live: EventbriteCategory (e.g. "Music", "Performing & Visual
// Arts") is the general category; EventbriteSubCategory (e.g. "Comedy") is
// more specific and checked first so a comedy show under "Performing &
// Visual Arts" doesn't get mapped to the more generic 'show'.
const SUBCATEGORY_TO_CATEGORY: Record<string, RawIngestedEvent['category']> = {
  comedy: 'comedy'
};
// Sports, Community & Culture, Travel & Outdoor, and Health & Wellness have
// no dedicated Pulso category (EVENT_CATEGORIES is music/nightlife/
// festival/show/comedy/other only) - mapped to the 'other' catch-all
// rather than left unmapped/discarded. Exact display_name strings below
// are NOT yet verified live against a real Apify response (unlike the
// three above, captured from a real run) - confirm/correct against the
// next real Eventbrite run's actual tags.
const CATEGORY_TO_CATEGORY: Record<string, RawIngestedEvent['category']> = {
  music: 'music',
  'performing & visual arts': 'show',
  'film & media': 'show',
  sports: 'other',
  'sports & fitness': 'other',
  'community & culture': 'other',
  community: 'other',
  'travel & outdoor': 'other',
  'health & wellness': 'other',
  health: 'other'
};

function mapCategory(
  tags: EventbriteTag[] | undefined
): RawIngestedEvent['category'] {
  const subcategoryName = tags
    ?.find((tag) => tag.prefix === 'EventbriteSubCategory')
    ?.display_name?.toLowerCase();
  if (subcategoryName && SUBCATEGORY_TO_CATEGORY[subcategoryName]) {
    return SUBCATEGORY_TO_CATEGORY[subcategoryName];
  }
  const categoryName = tags
    ?.find((tag) => tag.prefix === 'EventbriteCategory')
    ?.display_name?.toLowerCase();
  if (categoryName && CATEGORY_TO_CATEGORY[categoryName]) {
    return CATEGORY_TO_CATEGORY[categoryName];
  }
  return 'unmapped';
}

/**
 * Eventbrite returns a naive local datetime ("2026-07-28T19:30:00", no
 * offset) alongside a separate IANA timezone name. Converting it to UTC
 * requires knowing the real UTC offset in effect on that specific date
 * (DST-aware) - a fixed offset would be wrong for roughly half the year.
 */
function localDateTimeToUtcIso(
  localDateTime: string,
  timeZone: string
): string | undefined {
  const naiveAsUtc = new Date(`${localDateTime}Z`);
  if (Number.isNaN(naiveAsUtc.getTime())) return undefined;

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
      .formatToParts(naiveAsUtc)
      .map((part) => [part.type, part.value])
  );
  const reinterpretedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  const offsetMs = reinterpretedAsUtc - naiveAsUtc.getTime();
  return new Date(naiveAsUtc.getTime() - offsetMs).toISOString();
}

export function mapEventbriteApifyEvent(
  event: EventbriteApifyEvent,
  observedAt: string
): RawIngestedEvent {
  const timeZone = event.timezone || 'America/Toronto';
  const startsAt = event.start_datetime
    ? (localDateTimeToUtcIso(event.start_datetime, timeZone) ?? '')
    : '';

  const longitude =
    event.longitude !== undefined ? Number(event.longitude) : undefined;
  const latitude =
    event.latitude !== undefined ? Number(event.latitude) : undefined;
  const hasPoint =
    longitude !== undefined &&
    latitude !== undefined &&
    Number.isFinite(longitude) &&
    Number.isFinite(latitude);

  const minimumAmount = event.ticket_availability?.minimum_ticket_price
    ?.major_value
    ? Number(event.ticket_availability.minimum_ticket_price.major_value)
    : undefined;
  const price: RawIngestedEvent['price'] =
    event.ticket_availability?.is_free === true
      ? { kind: 'free' }
      : event.ticket_availability?.is_free === false
        ? {
            kind: 'paid',
            ...(minimumAmount !== undefined && Number.isFinite(minimumAmount)
              ? { minimumAmount }
              : {})
          }
        : { kind: 'unknown' };

  return {
    sourceId: 'eventbrite',
    sourceName: 'Eventbrite',
    sourceUrl: event.url || 'https://www.eventbrite.com/',
    observedAt,
    title: event.name || 'Événement Eventbrite',
    description: event.summary,
    category: mapCategory(event.tags),
    startsAt,
    venueName: event.primary_venue?.name,
    address: event.venue_address,
    point: hasPoint ? { longitude, latitude } : undefined,
    pointResolution: hasPoint ? 'source' : undefined,
    price,
    ticketingUrl: event.tickets_url || event.url,
    imageUrl: event.image_url,
    organizer: event.primary_organizer?.name,
    raw: event
  };
}

function defaultDateRange(): { startDate: string; endDate: string } {
  const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { startDate: toDateOnly(now), endDate: toDateOnly(in7Days) };
}

export function createEventbriteConnector(
  options: {
    apiToken?: string;
    city?: string;
    country?: string;
    maxResults?: number;
    startDate?: string;
    endDate?: string;
    fetchImpl?: typeof fetch;
  } = {}
): IngestionConnector {
  const apiToken = options.apiToken ?? process.env.APIFY_API_TOKEN;
  const city = options.city ?? 'montreal';
  const country = options.country ?? 'canada';
  const maxResults = options.maxResults ?? 100;
  const fetchImpl = options.fetchImpl ?? fetch;
  // Verified live: leaving startDate/endDate blank does NOT give the 7-day
  // window the actor's own input schema describes as the default - it
  // returns almost exclusively events starting today. Passing an explicit
  // range is required to actually cover the coming week.
  const fallbackRange = defaultDateRange();
  const startDate = options.startDate ?? fallbackRange.startDate;
  const endDate = options.endDate ?? fallbackRange.endDate;

  return {
    id: 'eventbrite',
    displayName: 'Eventbrite (Apify scraper)',
    async fetch(): Promise<RawIngestedEvent[]> {
      if (!apiToken) {
        throw new Error(
          'APIFY_API_TOKEN is not set. Get one from console.apify.com (Settings > Integrations).'
        );
      }

      const observedAt = new Date().toISOString();
      const runsUrl = new URL(APIFY_RUNS_URL);
      runsUrl.searchParams.set('token', apiToken);

      const startResponse = await fetchImpl(runsUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country, city, maxResults, startDate, endDate })
      });
      if (!startResponse.ok) {
        throw new Error(
          `Apify Eventbrite scraper run failed to start with status ${startResponse.status}`
        );
      }
      const startBody = (await startResponse.json()) as {
        data: { id: string; defaultDatasetId: string; status: string };
      };
      const runId = startBody.data.id;
      const datasetId = startBody.data.defaultDatasetId;

      const deadline = Date.now() + MAX_POLL_MS;
      let status = startBody.data.status;
      while (status === 'READY' || status === 'RUNNING') {
        if (Date.now() > deadline) {
          throw new Error(
            `Apify Eventbrite scraper run ${runId} did not finish within ${MAX_POLL_MS / 1000}s (last status: ${status}).`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const pollUrl = new URL(`https://api.apify.com/v2/actor-runs/${runId}`);
        pollUrl.searchParams.set('token', apiToken);
        const pollResponse = await fetchImpl(pollUrl.toString());
        if (!pollResponse.ok) {
          throw new Error(
            `Apify Eventbrite scraper run status check failed with status ${pollResponse.status}`
          );
        }
        const pollBody = (await pollResponse.json()) as {
          data: { status: string };
        };
        status = pollBody.data.status;
      }
      if (status !== 'SUCCEEDED') {
        throw new Error(
          `Apify Eventbrite scraper run ${runId} ended with status ${status}.`
        );
      }

      const datasetUrl = new URL(
        `https://api.apify.com/v2/datasets/${datasetId}/items`
      );
      datasetUrl.searchParams.set('token', apiToken);
      const datasetResponse = await fetchImpl(datasetUrl.toString());
      if (!datasetResponse.ok) {
        throw new Error(
          `Apify Eventbrite scraper dataset fetch failed with status ${datasetResponse.status}`
        );
      }

      const items = (await datasetResponse.json()) as EventbriteApifyEvent[];
      return items.map((item) => mapEventbriteApifyEvent(item, observedAt));
    }
  };
}
