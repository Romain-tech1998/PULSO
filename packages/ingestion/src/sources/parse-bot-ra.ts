import type {
  IngestionConnector,
  RawIngestedEvent,
  VenueConnector,
  RawIngestedVenue
} from '../types.js';

/**
 * Parse.bot-hosted "ra.co API" scraper.
 *
 * The actual contract - verified live against the Parse.bot dashboard for
 * this scraper - differs from what was originally guessed and committed:
 * GET requests (not POST), the scraper's *canonical* id in the URL path
 * (distinct from the per-account subscription id used by the Parse SDK),
 * an `API-Snapshot-Version` header, and query-string parameters rather than
 * a JSON body. `content_url`/`flyer_url`/`logo_url` are all RA-relative
 * paths (e.g. "/clubs/828"), not absolute URLs.
 */

const CANONICAL_SCRAPER_ID = 'b89b7fc2-7fcb-49f4-8b0d-8ba592c967cc';
const API_SNAPSHOT_VERSION = '8';
const RA_BASE_URL = 'https://ra.co';

interface ParseBotRaClub {
  id?: string;
  name?: string;
  address?: string;
  content_url?: string;
  follower_count?: number;
  is_closed?: boolean | null;
  logo_url?: string | null;
}

interface ParseBotRaClubsResult {
  area?: string;
  country?: string;
  total_clubs?: number;
  clubs?: ParseBotRaClub[];
}

interface ParseBotRaEventVenue {
  id?: string;
  name?: string;
  content_url?: string | null;
}

interface ParseBotRaEvent {
  id?: string;
  title?: string;
  /** Midnight-only date (e.g. "2026-07-28T00:00:00.000") - startsAt uses start_time instead when present. */
  date?: string;
  /** Already a full local datetime, e.g. "2026-07-28T22:00:00.000" - NOT a bare "HH:MM". */
  start_time?: string;
  content_url?: string;
  flyer_url?: string | null;
  interested_count?: number;
  venue?: ParseBotRaEventVenue;
}

interface ParseBotRaEventsResult {
  total_results?: number;
  page?: number;
  page_size?: number;
  events?: ParseBotRaEvent[];
}

interface ParseBotRaResponse<T> {
  status?: string;
  data?: T;
}

function absoluteRaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return path.startsWith('http') ? path : `${RA_BASE_URL}${path}`;
}

export function mapParseBotClub(
  club: ParseBotRaClub,
  observedAt: string
): RawIngestedVenue {
  return {
    sourceId: `ra_club_${club.id || ''}`,
    sourceName: 'Parse.bot RA Scraper',
    sourceUrl: absoluteRaUrl(club.content_url) ?? `${RA_BASE_URL}/`,
    observedAt,
    name: club.name || 'Lieu Inconnu',
    address: club.address,
    imageUrl: absoluteRaUrl(club.logo_url),
    raw: club
  };
}

export function mapParseBotEvent(
  event: ParseBotRaEvent,
  observedAt: string
): RawIngestedEvent {
  const contentUrl = absoluteRaUrl(event.content_url);

  return {
    sourceId: `ra_event_${event.id || ''}`,
    sourceName: 'Parse.bot RA Scraper',
    sourceUrl: contentUrl ?? `${RA_BASE_URL}/`,
    observedAt,
    title: event.title || 'Événement RA',
    category: 'nightlife', // RA events are generally nightlife/music
    startsAt: event.start_time || event.date || '',
    venueName: event.venue?.name,
    ticketingUrl: contentUrl,
    imageUrl: absoluteRaUrl(event.flyer_url),
    raw: event
  };
}

function buildScraperUrl(
  endpoint: string,
  params: Record<string, string>
): URL {
  const url = new URL(
    `https://api.parse.bot/scraper/${CANONICAL_SCRAPER_ID}/${endpoint}`
  );
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function scraperHeaders(apiKey: string): HeadersInit {
  return { 'X-API-Key': apiKey, 'API-Snapshot-Version': API_SNAPSHOT_VERSION };
}

export function createParseBotRaClubsConnector(
  options: {
    apiKey?: string;
    areaName?: string;
    countryCode?: string;
    fetchImpl?: typeof fetch;
  } = {}
): VenueConnector {
  const apiKey = options.apiKey ?? process.env.PARSE_BOT_API_KEY;
  const areaName = options.areaName ?? 'montreal';
  const countryCode = options.countryCode ?? 'ca';
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    id: 'parse_bot_ra_clubs',
    displayName: 'Parse.bot RA Clubs Scraper',
    async fetch(): Promise<RawIngestedVenue[]> {
      if (!apiKey) throw new Error('PARSE_BOT_API_KEY is not set.');

      const observedAt = new Date().toISOString();
      const url = buildScraperUrl('list_clubs', {
        area_name: areaName,
        country_code: countryCode
      });

      const response = await fetchImpl(url.toString(), {
        headers: scraperHeaders(apiKey)
      });
      if (!response.ok) {
        throw new Error(
          `Parse.bot API request failed with status ${response.status}`
        );
      }

      const body =
        (await response.json()) as ParseBotRaResponse<ParseBotRaClubsResult>;
      const clubs = (body.data?.clubs ?? []).filter((club) => !club.is_closed);

      return clubs.map((club) => mapParseBotClub(club, observedAt));
    }
  };
}

export function createParseBotRaEventsConnector(
  options: {
    apiKey?: string;
    areaId?: string;
    fetchImpl?: typeof fetch;
    maxPages?: number;
  } = {}
): IngestionConnector {
  const apiKey = options.apiKey ?? process.env.PARSE_BOT_API_KEY;
  // Fallback to Montreal's RA area ID which is 40
  const areaId = options.areaId ?? '40';
  const fetchImpl = options.fetchImpl ?? fetch;
  // Safety cap in case total_results/page_size are ever missing from a
  // response - real pagination below is driven by the server-reported
  // total_results, not this cap.
  const maxPages = options.maxPages ?? 20;

  return {
    id: 'parse_bot_ra_events',
    displayName: 'Parse.bot RA Events Scraper',
    async fetch(): Promise<RawIngestedEvent[]> {
      if (!apiKey) throw new Error('PARSE_BOT_API_KEY is not set.');

      const observedAt = new Date().toISOString();
      const events: RawIngestedEvent[] = [];

      for (let page = 1; page <= maxPages; page += 1) {
        const url = buildScraperUrl('list_area_events', {
          area_id: areaId,
          page: String(page)
        });

        const response = await fetchImpl(url.toString(), {
          headers: scraperHeaders(apiKey)
        });
        if (!response.ok) {
          throw new Error(
            `Parse.bot API request failed with status ${response.status}`
          );
        }

        const body =
          (await response.json()) as ParseBotRaResponse<ParseBotRaEventsResult>;
        const result = body.data;
        const pageEvents = result?.events ?? [];

        events.push(
          ...pageEvents.map((event) => mapParseBotEvent(event, observedAt))
        );

        const pageSize = result?.page_size ?? pageEvents.length;
        const totalResults = result?.total_results ?? pageEvents.length;
        if (pageEvents.length === 0 || page * pageSize >= totalResults) break;
      }

      return events;
    }
  };
}
