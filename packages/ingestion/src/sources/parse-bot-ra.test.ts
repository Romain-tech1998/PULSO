import { describe, expect, it, vi } from 'vitest';

import {
  createParseBotRaClubsConnector,
  createParseBotRaEventsConnector,
  mapParseBotClub,
  mapParseBotEvent
} from './parse-bot-ra.js';

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body
  } as Response;
}

describe('mapParseBotClub', () => {
  it('maps a well-formed club into a RawIngestedVenue with absolute URLs', () => {
    const venue = mapParseBotClub(
      {
        id: '102279',
        name: 'Newspeak',
        address: '1403 Rue Sainte-Elisabeth, Montréal, QC H2X 3C5',
        content_url: '/clubs/102279',
        logo_url: '/images/clubs/newspeak.jpg'
      },
      '2026-07-27T00:00:00.000Z'
    );

    expect(venue.sourceId).toBe('ra_club_102279');
    expect(venue.name).toBe('Newspeak');
    expect(venue.sourceUrl).toBe('https://ra.co/clubs/102279');
    expect(venue.imageUrl).toBe('https://ra.co/images/clubs/newspeak.jpg');
  });

  it('leaves an already-absolute logo_url untouched', () => {
    const venue = mapParseBotClub(
      {
        id: '828',
        name: 'Stereo',
        logo_url: 'https://static.ra.co/images/clubs/ca-stereo.jpg'
      },
      '2026-07-27T00:00:00.000Z'
    );
    expect(venue.imageUrl).toBe(
      'https://static.ra.co/images/clubs/ca-stereo.jpg'
    );
  });

  it('has no image when the source provides none', () => {
    const venue = mapParseBotClub(
      { id: '1', name: 'X' },
      '2026-07-27T00:00:00.000Z'
    );
    expect(venue.imageUrl).toBeUndefined();
  });

  it('falls back to a placeholder name when RA omits it', () => {
    const venue = mapParseBotClub({}, '2026-07-27T00:00:00.000Z');
    expect(venue.name).toBe('Lieu Inconnu');
    expect(venue.sourceUrl).toBe('https://ra.co/');
  });
});

describe('mapParseBotEvent', () => {
  it('uses start_time directly as startsAt - it is already a full datetime, not a bare time', () => {
    const event = mapParseBotEvent(
      {
        id: '2481150',
        title: '5:14 Sessions: NOS-talgia',
        date: '2026-07-28T00:00:00.000',
        start_time: '2026-07-28T22:00:00.000',
        content_url: '/events/2481150',
        flyer_url: '/images/flyer.png',
        venue: {
          id: '229112',
          name: 'Le Red Room',
          content_url: '/clubs/229112'
        }
      },
      '2026-07-27T00:00:00.000Z'
    );

    expect(event.startsAt).toBe('2026-07-28T22:00:00.000');
    expect(event.category).toBe('nightlife');
    expect(event.venueName).toBe('Le Red Room');
    expect(event.sourceUrl).toBe('https://ra.co/events/2481150');
    expect(event.ticketingUrl).toBe('https://ra.co/events/2481150');
    expect(event.imageUrl).toBe('https://ra.co/images/flyer.png');
  });

  it('falls back to date when start_time is absent', () => {
    const event = mapParseBotEvent(
      { date: '2026-08-01T00:00:00.000' },
      '2026-07-27T00:00:00.000Z'
    );
    expect(event.startsAt).toBe('2026-08-01T00:00:00.000');
  });

  it('falls back to a placeholder title when RA omits it', () => {
    const event = mapParseBotEvent(
      { date: '2026-08-01T00:00:00.000' },
      '2026-07-27T00:00:00.000Z'
    );
    expect(event.title).toBe('Événement RA');
  });

  it('has no venueName when RA reports no venue for the event', () => {
    const event = mapParseBotEvent(
      { date: '2026-08-01T00:00:00.000' },
      '2026-07-27T00:00:00.000Z'
    );
    expect(event.venueName).toBeUndefined();
  });
});

describe('createParseBotRaEventsConnector', () => {
  it('stops after a single request when total_results fits on one page', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        status: 'success',
        data: {
          total_results: 1,
          page: 1,
          page_size: 20,
          events: [{ id: 'evt-1', title: 'One' }]
        }
      })
    );

    const connector = createParseBotRaEventsConnector({
      apiKey: 'test-key',
      fetchImpl
    });
    const events = await connector.fetch();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchImpl.mock.calls[0]!;
    expect(String(calledUrl)).toContain(
      '/scraper/b89b7fc2-7fcb-49f4-8b0d-8ba592c967cc/list_area_events'
    );
    expect(String(calledUrl)).toContain('area_id=40');
    expect((calledInit as RequestInit).headers).toMatchObject({
      'X-API-Key': 'test-key',
      'API-Snapshot-Version': '8'
    });
    expect(events).toHaveLength(1);
  });

  it('follows pagination until total_results is reached', async () => {
    const page1 = Array.from({ length: 2 }, (_, i) => ({
      id: `p1-${i}`,
      title: `P1 ${i}`
    }));
    const page2 = [{ id: 'p2-0', title: 'P2 0' }];

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'success',
          data: { total_results: 3, page: 1, page_size: 2, events: page1 }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'success',
          data: { total_results: 3, page: 2, page_size: 2, events: page2 }
        })
      );

    const connector = createParseBotRaEventsConnector({
      apiKey: 'test-key',
      fetchImpl
    });
    const events = await connector.fetch();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.title)).toEqual(['P1 0', 'P1 1', 'P2 0']);
  });

  it('treats a response with no pagination metadata as a single complete page', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        status: 'success',
        data: { events: [{ id: 'x', title: 'X' }] }
      })
    );

    const connector = createParseBotRaEventsConnector({
      apiKey: 'test-key',
      fetchImpl,
      maxPages: 3
    });
    const events = await connector.fetch();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
  });

  it('never exceeds maxPages even if total_results implies more', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () =>
      jsonResponse({
        status: 'success',
        data: {
          total_results: 1000,
          page: 1,
          page_size: 1,
          events: [{ id: 'x', title: 'X' }]
        }
      })
    );

    const connector = createParseBotRaEventsConnector({
      apiKey: 'test-key',
      fetchImpl,
      maxPages: 3
    });
    const events = await connector.fetch();

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(events).toHaveLength(3);
  });

  it('throws when PARSE_BOT_API_KEY is not set', async () => {
    const connector = createParseBotRaEventsConnector({});
    await expect(connector.fetch()).rejects.toThrow('PARSE_BOT_API_KEY');
  });

  it('throws when the API responds with an error status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false));
    const connector = createParseBotRaEventsConnector({
      apiKey: 'test-key',
      fetchImpl
    });
    await expect(connector.fetch()).rejects.toThrow('status 500');
  });
});

describe('createParseBotRaClubsConnector', () => {
  it('maps every open club returned by a single request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        status: 'success',
        data: {
          area: 'montreal',
          country: 'ca',
          total_clubs: 3,
          clubs: [
            { id: 'c1', name: 'Newspeak', is_closed: null },
            { id: 'c2', name: 'Stereo', is_closed: null },
            { id: 'c3', name: 'Defunct Club', is_closed: true }
          ]
        }
      })
    );

    const connector = createParseBotRaClubsConnector({
      apiKey: 'test-key',
      fetchImpl
    });
    const venues = await connector.fetch();

    expect(venues).toHaveLength(2);
    expect(venues.map((v) => v.name)).toEqual(['Newspeak', 'Stereo']);
  });

  it('throws when PARSE_BOT_API_KEY is not set', async () => {
    const connector = createParseBotRaClubsConnector({});
    await expect(connector.fetch()).rejects.toThrow('PARSE_BOT_API_KEY');
  });
});
