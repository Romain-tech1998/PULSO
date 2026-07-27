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
  it('maps a well-formed club into a RawIngestedVenue', () => {
    const venue = mapParseBotClub(
      {
        id: 'club-1',
        name: 'Newspeak',
        address: '1403 Rue Sainte-Élisabeth',
        content_url: 'https://ra.co/clubs/club-1'
      },
      '2026-07-27T00:00:00.000Z'
    );

    expect(venue.sourceId).toBe('ra_club_club-1');
    expect(venue.name).toBe('Newspeak');
    expect(venue.address).toBe('1403 Rue Sainte-Élisabeth');
    expect(venue.sourceUrl).toBe('https://ra.co/clubs/club-1');
  });

  it('falls back to a placeholder name when RA omits it', () => {
    const venue = mapParseBotClub({}, '2026-07-27T00:00:00.000Z');
    expect(venue.name).toBe('Lieu Inconnu');
    expect(venue.sourceUrl).toBe('https://ra.co/');
  });
});

describe('mapParseBotEvent', () => {
  it('combines date and start_time into a single ISO-like startsAt', () => {
    const event = mapParseBotEvent(
      {
        id: 'evt-1',
        title: 'Techno Night',
        date: '2026-08-01',
        start_time: '23:00',
        venue_name: 'Newspeak',
        content_url: 'https://ra.co/events/evt-1',
        flyer_url: 'https://ra.co/flyers/evt-1.jpg'
      },
      '2026-07-27T00:00:00.000Z'
    );

    expect(event.startsAt).toBe('2026-08-01T23:00:00');
    expect(event.category).toBe('nightlife');
    expect(event.venueName).toBe('Newspeak');
    expect(event.ticketingUrl).toBe('https://ra.co/events/evt-1');
    expect(event.imageUrl).toBe('https://ra.co/flyers/evt-1.jpg');
  });

  it('falls back to a placeholder title when RA omits it', () => {
    const event = mapParseBotEvent(
      { date: '2026-08-01' },
      '2026-07-27T00:00:00.000Z'
    );
    expect(event.title).toBe('Événement RA');
  });
});

describe('createParseBotRaEventsConnector', () => {
  it('stops after a single request when the page is not full', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: { events: [{ id: 'evt-1', title: 'One' }] } })
      );

    const connector = createParseBotRaEventsConnector({
      apiKey: 'test-key',
      fetchImpl,
      pageSize: 50
    });
    const events = await connector.fetch();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
  });

  it('follows pagination until a page returns fewer events than requested', async () => {
    const fullPage = Array.from({ length: 2 }, (_, i) => ({
      id: `full-${i}`,
      title: `Full ${i}`
    }));
    const partialPage = [{ id: 'last-1', title: 'Last' }];

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { events: fullPage } }))
      .mockResolvedValueOnce(jsonResponse({ data: { events: partialPage } }));

    const connector = createParseBotRaEventsConnector({
      apiKey: 'test-key',
      fetchImpl,
      pageSize: 2
    });
    const events = await connector.fetch();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.title)).toEqual(['Full 0', 'Full 1', 'Last']);
  });

  it('stops at maxPages even if every page stays full', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: { events: [{ id: 'x', title: 'X' }] } })
      );

    const connector = createParseBotRaEventsConnector({
      apiKey: 'test-key',
      fetchImpl,
      pageSize: 1,
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
  it('maps every club returned by a single request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          clubs: [
            { id: 'c1', name: 'Newspeak' },
            { id: 'c2', name: 'Stereo' }
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
