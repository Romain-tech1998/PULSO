import type {
  IngestionConnector,
  RawIngestedEvent,
  VenueConnector,
  RawIngestedVenue
} from '../types.js';

interface ParseBotRaClub {
  id?: string;
  name?: string;
  address?: string;
  content_url?: string;
}

interface ParseBotRaEvent {
  id?: string;
  title?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  content_url?: string;
  flyer_url?: string;
  venue_name?: string;
  venue_id?: string;
  interested_count?: string | number;
}

interface ParseBotRaResponse<T> {
  data?: {
    clubs?: T[];
    events?: T[];
  };
}

export function mapParseBotClub(
  club: ParseBotRaClub,
  observedAt: string
): RawIngestedVenue {
  return {
    sourceId: `ra_club_${club.id || ''}`,
    sourceName: 'Parse.bot RA Scraper',
    sourceUrl: club.content_url || 'https://ra.co/',
    observedAt,
    name: club.name || 'Lieu Inconnu',
    address: club.address,
    raw: club
  };
}

export function mapParseBotEvent(
  event: ParseBotRaEvent,
  observedAt: string
): RawIngestedEvent {
  let startsAt = event.date || '';
  if (event.date && event.start_time) {
    startsAt = `${event.date}T${event.start_time}:00`;
  }

  return {
    sourceId: `ra_event_${event.id || ''}`,
    sourceName: 'Parse.bot RA Scraper',
    sourceUrl: event.content_url || 'https://ra.co/',
    observedAt,
    title: event.title || 'Événement RA',
    category: 'nightlife', // RA events are generally nightlife/music
    startsAt,
    venueName: event.venue_name,
    ticketingUrl: event.content_url,
    imageUrl: event.flyer_url,
    raw: event
  };
}

const SCRAPER_ID = '5e7fdf6f-3af4-46ce-8acf-61dd24b968fe';

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

  const API_URL = `https://api.parse.bot/v1/scrapers/${SCRAPER_ID}/run`;

  return {
    id: 'parse_bot_ra_clubs',
    displayName: 'Parse.bot RA Clubs Scraper',
    async fetch(): Promise<RawIngestedVenue[]> {
      if (!apiKey) throw new Error('PARSE_BOT_API_KEY is not set.');

      const observedAt = new Date().toISOString();
      const venues: RawIngestedVenue[] = [];

      const response = await fetchImpl(API_URL, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          endpoint: 'list_clubs',
          area_name: areaName,
          country_code: countryCode
        })
      });

      if (!response.ok) {
        throw new Error(
          `Parse.bot API request failed with status ${response.status}`
        );
      }

      const body =
        (await response.json()) as ParseBotRaResponse<ParseBotRaClub>;
      const pageClubs = body.data?.clubs ?? [];

      venues.push(...pageClubs.map((c) => mapParseBotClub(c, observedAt)));

      return venues;
    }
  };
}

export function createParseBotRaEventsConnector(
  options: {
    apiKey?: string;
    areaId?: string;
    fetchImpl?: typeof fetch;
    pageSize?: number;
    maxPages?: number;
  } = {}
): IngestionConnector {
  const apiKey = options.apiKey ?? process.env.PARSE_BOT_API_KEY;
  // Fallback to Montreal's RA area ID which is 40
  const areaId = options.areaId ?? '40';
  const fetchImpl = options.fetchImpl ?? fetch;
  const pageSize = options.pageSize ?? 50;
  // Safety cap, not an expected real volume: Parse.bot's response has no
  // total-count/next-page field, so pagination below is a heuristic (a full
  // page implies there may be more) rather than a known page count.
  const maxPages = options.maxPages ?? 20;

  const API_URL = `https://api.parse.bot/v1/scrapers/${SCRAPER_ID}/run`;

  return {
    id: 'parse_bot_ra_events',
    displayName: 'Parse.bot RA Events Scraper',
    async fetch(): Promise<RawIngestedEvent[]> {
      if (!apiKey) throw new Error('PARSE_BOT_API_KEY is not set.');

      const observedAt = new Date().toISOString();
      const events: RawIngestedEvent[] = [];

      for (let page = 1; page <= maxPages; page += 1) {
        const response = await fetchImpl(API_URL, {
          method: 'POST',
          headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({
            endpoint: 'list_area_events',
            area_id: areaId,
            page,
            page_size: pageSize
          })
        });

        if (!response.ok) {
          throw new Error(
            `Parse.bot API request failed with status ${response.status}`
          );
        }

        const body =
          (await response.json()) as ParseBotRaResponse<ParseBotRaEvent>;
        const pageEvents = body.data?.events ?? [];

        events.push(...pageEvents.map((e) => mapParseBotEvent(e, observedAt)));

        // A page shorter than requested means this was the last one.
        if (pageEvents.length < pageSize) break;
      }

      return events;
    }
  };
}
