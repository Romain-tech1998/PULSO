import { describe, expect, it, vi } from 'vitest';

import {
  createEventbriteConnector,
  mapEventbriteApifyEvent
} from './eventbrite.js';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

// Real item captured live from the Apify "Eventbrite Scraper" actor
// (WNUjlCROzqWUGQgfR) against country=canada, city=montreal.
const REAL_MUSIC_EVENT = {
  id: '1993079620798',
  eventbrite_event_id: '1993079620798',
  name: 'KARNEEF + MAFUBA live at ESCOGRIFFE',
  summary: 'karneef and mafuba, live at escogriffe july 28th',
  url: 'https://www.eventbrite.com/e/karneef-mafuba-live-at-escogriffe-tickets-1993079620798',
  tickets_url: 'https://www.eventbrite.com/checkout-external?eid=1993079620798',
  image_url: 'https://img.evbuc.com/example.jpg',
  start_datetime: '2026-07-28T19:30:00',
  timezone: 'America/Montreal',
  is_online_event: false,
  venue_address: '4461 Rue Saint-Denis, Montréal, QC H2J 2L2',
  latitude: '45.5238749',
  longitude: '-73.58223679999999',
  primary_venue: { name: "L'Escogriffe Bar" },
  primary_organizer: { name: 'sayplus' },
  tags: [
    { prefix: 'EventbriteCategory', display_name: 'Music' },
    { prefix: 'EventbriteFormat', display_name: 'Concert or Performance' }
  ],
  ticket_availability: {
    is_free: false,
    minimum_ticket_price: { major_value: '14.35' }
  }
};

const REAL_COMEDY_EVENT = {
  id: '1986067883503',
  name: 'Tuesday Night English Stand-Up Comedy Open Mic | Comedy on Mackay',
  url: 'https://www.eventbrite.ca/e/tuesday-night-english-stand-up-comedy-open-mic-comedy-on-mackay-tickets-1986067883503',
  start_datetime: '2026-07-28T22:00:00',
  timezone: 'America/Montreal',
  venue_address: '1244 Rue Mackay, Montréal, QC H3G 2H4',
  latitude: '45.4953005',
  longitude: '-73.57623670000001',
  primary_venue: { name: 'NsurMackay' },
  tags: [
    { prefix: 'EventbriteSubCategory', display_name: 'Comedy' },
    { prefix: 'EventbriteCategory', display_name: 'Performing & Visual Arts' }
  ],
  ticket_availability: {
    is_free: false,
    minimum_ticket_price: { major_value: '5.50' }
  }
};

describe('mapEventbriteApifyEvent', () => {
  it('maps a real music event, converting the naive local datetime to UTC', () => {
    const event = mapEventbriteApifyEvent(
      REAL_MUSIC_EVENT,
      '2026-07-28T00:00:00.000Z'
    );

    expect(event.title).toBe('KARNEEF + MAFUBA live at ESCOGRIFFE');
    expect(event.category).toBe('music');
    // 19:30 America/Montreal (EDT, UTC-4) in July -> 23:30 UTC.
    expect(event.startsAt).toBe('2026-07-28T23:30:00.000Z');
    expect(event.venueName).toBe("L'Escogriffe Bar");
    expect(event.point).toEqual({
      longitude: -73.58223679999999,
      latitude: 45.5238749
    });
    expect(event.price).toEqual({ kind: 'paid', minimumAmount: 14.35 });
    expect(event.ticketingUrl).toBe(
      'https://www.eventbrite.com/checkout-external?eid=1993079620798'
    );
  });

  it('prefers the EventbriteSubCategory over the general category (Comedy under Performing & Visual Arts)', () => {
    const event = mapEventbriteApifyEvent(
      REAL_COMEDY_EVENT,
      '2026-07-28T00:00:00.000Z'
    );
    expect(event.category).toBe('comedy');
    expect(event.startsAt).toBe('2026-07-29T02:00:00.000Z');
  });

  it('converts correctly across DST (winter EST vs. summer EDT)', () => {
    const winterEvent = mapEventbriteApifyEvent(
      { ...REAL_MUSIC_EVENT, start_datetime: '2026-01-15T19:30:00' },
      '2026-01-01T00:00:00.000Z'
    );
    // 19:30 America/Montreal (EST, UTC-5) in January -> 00:30 UTC next day.
    expect(winterEvent.startsAt).toBe('2026-01-16T00:30:00.000Z');
  });

  it('falls back to unmapped for an unrecognized category', () => {
    const event = mapEventbriteApifyEvent(
      {
        ...REAL_MUSIC_EVENT,
        tags: [{ prefix: 'EventbriteCategory', display_name: 'Sports' }]
      },
      '2026-07-28T00:00:00.000Z'
    );
    expect(event.category).toBe('unmapped');
  });

  it('has no point when latitude/longitude are missing', () => {
    const event = mapEventbriteApifyEvent(
      { ...REAL_MUSIC_EVENT, latitude: undefined, longitude: undefined },
      '2026-07-28T00:00:00.000Z'
    );
    expect(event.point).toBeUndefined();
    expect(event.pointResolution).toBeUndefined();
  });

  it('marks free events correctly', () => {
    const event = mapEventbriteApifyEvent(
      { ...REAL_MUSIC_EVENT, ticket_availability: { is_free: true } },
      '2026-07-28T00:00:00.000Z'
    );
    expect(event.price).toEqual({ kind: 'free' });
  });
});

// The connector now submits an async run (POST /runs) and polls
// (GET /actor-runs/{id}) before fetching the dataset (GET
// /datasets/{id}/items) - see eventbrite.ts's header comment for why: the
// synchronous run-sync-get-dataset-items endpoint has a hard 300s
// server-side timeout that a real run exceeded live (HTTP 408). Mocking a
// run that's already SUCCEEDED on the first status check skips the poll
// loop's real setTimeout entirely, so these tests run instantly.
function succeededRunSequence(items: unknown[]) {
  return vi
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({
        data: { id: 'run1', defaultDatasetId: 'dataset1', status: 'SUCCEEDED' }
      })
    )
    .mockResolvedValueOnce(jsonResponse(items));
}

describe('createEventbriteConnector', () => {
  it('submits an async run and fetches its dataset once SUCCEEDED', async () => {
    const fetchImpl = succeededRunSequence([REAL_MUSIC_EVENT]);
    const connector = createEventbriteConnector({
      apiToken: 'test-token',
      fetchImpl,
      maxResults: 5,
      startDate: '2026-08-01',
      endDate: '2026-08-08'
    });
    const events = await connector.fetch();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [runUrl, runInit] = fetchImpl.mock.calls[0]!;
    expect(String(runUrl)).toContain('/acts/WNUjlCROzqWUGQgfR/runs');
    expect(String(runUrl)).toContain('token=test-token');
    expect(JSON.parse((runInit as RequestInit).body as string)).toEqual({
      country: 'canada',
      city: 'montreal',
      maxResults: 5,
      startDate: '2026-08-01',
      endDate: '2026-08-08'
    });
    const [datasetUrl] = fetchImpl.mock.calls[1]!;
    expect(String(datasetUrl)).toContain('/datasets/dataset1/items');
    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe('KARNEEF + MAFUBA live at ESCOGRIFFE');
  });

  it('defaults to an explicit today->+7-days range instead of leaving dates blank', async () => {
    // Verified live: leaving startDate/endDate blank returns almost only
    // today's events despite the actor's documented 7-day default, so this
    // connector always sends an explicit range.
    const fetchImpl = succeededRunSequence([]);
    const connector = createEventbriteConnector({
      apiToken: 'test-token',
      fetchImpl
    });
    await connector.fetch();

    const [, runInit] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse((runInit as RequestInit).body as string);
    expect(body.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(body.endDate).getTime()).toBeGreaterThan(
      new Date(body.startDate).getTime()
    );
  });

  it('throws when APIFY_API_TOKEN is not set', async () => {
    const connector = createEventbriteConnector({});
    await expect(connector.fetch()).rejects.toThrow('APIFY_API_TOKEN');
  });

  it('throws when the run fails to start', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false));
    const connector = createEventbriteConnector({
      apiToken: 'test-token',
      fetchImpl
    });
    await expect(connector.fetch()).rejects.toThrow('status 500');
  });

  it('throws when the run ends in a non-SUCCEEDED status', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        data: { id: 'run1', defaultDatasetId: 'dataset1', status: 'FAILED' }
      })
    );
    const connector = createEventbriteConnector({
      apiToken: 'test-token',
      fetchImpl
    });
    await expect(connector.fetch()).rejects.toThrow('ended with status FAILED');
  });
});
