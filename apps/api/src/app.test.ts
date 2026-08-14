import type { PublicEvent } from '@pulso/contracts';
import { describe, expect, it } from 'vitest';

import type { EventRepository } from '@pulso/database';

import { buildApp } from './app.js';
import { fakeEventRepository } from './test-support.js';

const event: PublicEvent = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Synthetic Montréal Pulse',
  category: 'music',
  status: 'scheduled',
  startsAt: '2026-08-01T00:00:00.000Z',
  timezone: 'America/Toronto',
  price: { kind: 'free', currency: 'CAD' },
  accessInformation: 'Free entry. No reservation is required.',
  venue: {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Synthetic Montréal Venue',
    address: 'Montréal',
    point: { longitude: -73.5673, latitude: 45.5017 }
  },
  source: {
    name: 'Synthetic source',
    url: 'https://example.com/event',
    observedAt: '2026-07-15T12:00:00.000Z'
  },
  trust: {
    label: 'confirmed',
    freshness: 'unknown',
    locationConfidence: 'confirmed'
  },
  externalDestination: {
    label: 'Synthetic event source (example.com)',
    kind: 'event_source',
    status: 'available'
  }
};

const repository: EventRepository = {
  ...fakeEventRepository(),
  findInBounds: async () => [event],
  findWithinDirectDistance: async () => [{ ...event, distanceMeters: 0 }],
  findById: async (id) => (id === event.id ? event : undefined),
  findExternalDestination: async (id) =>
    id === event.id
      ? {
          label: 'Synthetic event source (example.com)',
          url: 'https://example.com/pulso-synthetic-event',
          status: 'available',
          eventStatus: 'scheduled'
        }
      : undefined,
  findVenuesWithoutUpcomingEvents: async () => [],
  findByIds: async (ids) => (ids.includes(event.id) ? [event] : [])
};

describe('event discovery API', () => {
  it('returns contract-valid events for map bounds', async () => {
    const app = buildApp(repository, {
      now: () => new Date('2026-07-15T23:00:00.000Z')
    });
    const response = await app.inject({
      method: 'GET',
      url: '/events?west=-73.7&south=45.4&east=-73.4&north=45.7'
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data[0].id).toBe(event.id);
    await app.close();
  });

  it('returns events for a batch of ids, regardless of map bounds', async () => {
    const app = buildApp(repository);
    const response = await app.inject({
      method: 'GET',
      url: `/events/by-ids?ids=${event.id}`
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().data[0].id).toBe(event.id);
    await app.close();
  });

  it('rejects a by-ids request with no ids', async () => {
    const app = buildApp(repository);
    const response = await app.inject({
      method: 'GET',
      url: '/events/by-ids?ids='
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('passes accepted filter semantics and Montréal time windows to the repository', async () => {
    let received:
      | {
          categories: string[];
          price: string;
          startsAt: string;
          endsAt: string;
        }
      | undefined;
    const filteredRepository: EventRepository = {
      ...repository,
      findInBounds: async (query, window) => {
        received = {
          categories: query.categories,
          price: query.price,
          startsAt: window.startsAt.toISOString(),
          endsAt: window.endsAt.toISOString()
        };
        return [event];
      }
    };
    const app = buildApp(filteredRepository, {
      now: () => new Date('2026-07-15T23:00:00.000Z')
    });
    const response = await app.inject({
      method: 'GET',
      url: '/events?west=-73.7&south=45.4&east=-73.4&north=45.7&date=weekend&categories=music,comedy&price=paid'
    });
    expect(response.statusCode).toBe(200);
    expect(received).toEqual({
      categories: ['music', 'comedy'],
      price: 'paid',
      startsAt: '2026-07-17T21:00:00.000Z',
      endsAt: '2026-07-20T09:00:00.000Z'
    });
    await app.close();
  });

  it.each([
    'categories=music,invalid',
    'price=unknown',
    'date=someday',
    'unexpected=value',
    'date=custom',
    'date=custom&dateStart=2026-02-30'
  ])('returns a safe client error for invalid filters: %s', async (filter) => {
    const app = buildApp(repository);
    const response = await app.inject({
      method: 'GET',
      url: `/events?west=-73.7&south=45.4&east=-73.4&north=45.7&${filter}`
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'INVALID_REQUEST',
        message: 'The request parameters are invalid.'
      }
    });
    await app.close();
  });

  it('returns contract-valid anonymous Event Details', async () => {
    const app = buildApp(repository);
    const response = await app.inject({
      method: 'GET',
      url: `/events/${event.id}`
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      id: event.id,
      accessInformation: event.accessInformation,
      externalDestination: event.externalDestination
    });
    await app.close();
  });

  it('redirects only through the stored available destination', async () => {
    const app = buildApp(repository);
    const response = await app.inject({
      method: 'GET',
      url: `/events/${event.id}/external`
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(
      'https://example.com/pulso-synthetic-event'
    );
    await app.close();
  });

  it('keeps the user in Pulso when the external destination is unavailable', async () => {
    const unavailableRepository: EventRepository = {
      ...repository,
      findExternalDestination: async () => undefined
    };
    const app = buildApp(unavailableRepository);
    const response = await app.inject({
      method: 'GET',
      url: `/events/${event.id}/external`
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('DESTINATION_UNAVAILABLE');
    await app.close();
  });

  it('blocks an external destination for a cancelled event', async () => {
    const cancelledRepository: EventRepository = {
      ...repository,
      findExternalDestination: async () => ({
        label: 'Synthetic event source (example.com)',
        url: 'https://example.com/pulso-synthetic-event',
        status: 'available',
        eventStatus: 'cancelled'
      })
    };
    const app = buildApp(cancelledRepository);
    const response = await app.inject({
      method: 'GET',
      url: `/events/${event.id}/external`
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('DESTINATION_UNAVAILABLE');
    await app.close();
  });

  it('rejects an invalid direct-distance radius', async () => {
    const app = buildApp(repository);
    const response = await app.inject({
      method: 'GET',
      url: '/events/near?longitude=-73.56&latitude=45.5&radiusMeters=-1'
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_REQUEST');
    await app.close();
  });
});

describe('venue search API', () => {
  const venue = {
    id: '7c3d1e2f-8a4b-4c5d-9e0f-1a2b3c4d5e6f',
    name: 'Clébard',
    address: '4557 Rue Saint-Denis, Montréal',
    point: { longitude: -73.5687, latitude: 45.5251 },
    category: 'bar' as const
  };

  it('finds a venue with no programming at all', async () => {
    // The whole reason this endpoint exists: the organizer claim and the
    // event form used to list venues from the fourteen-day event window, so a
    // bar nobody had programmed anything at could not be named.
    const app = buildApp(
      fakeEventRepository({ searchVenues: async () => [venue] })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/venues/search?query=clebard'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: [{ name: 'Clébard' }] });
    await app.close();
  });

  it('refuses a query too short to mean a name', async () => {
    let searched = false;
    const app = buildApp(
      fakeEventRepository({
        searchVenues: async () => {
          searched = true;
          return [];
        }
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/venues/search?query=le'
    });

    expect(response.statusCode).toBe(400);
    expect(searched).toBe(false);
    await app.close();
  });

  it('caps how many venues one search returns', async () => {
    let limit: number | undefined;
    const app = buildApp(
      fakeEventRepository({
        searchVenues: async (_query, received) => {
          limit = received;
          return [];
        }
      })
    );
    await app.inject({ method: 'GET', url: '/venues/search?query=bar' });

    expect(limit).toBe(20);
    await app.close();
  });
});

// What the AI engine returns when it cannot map a query onto a date, a price
// or a category. Written out here because that outcome is only reachable
// through the model, and it is the one Pulso has to second-guess.
const refusedInterpretation = {
  resolution: 'no_reliable_result' as const,
  derivedFilters: {},
  excludedCategories: [],
  constraints: [],
  rankingSignals: [],
  language: 'fr' as const,
  engine: 'intelligent' as const,
  message: { code: 'search.message.unsupported' as const }
};

describe('deterministic intelligent-search API', () => {
  const body = {
    query: 'free music tonight starting soon',
    locale: 'en',
    bounds: { west: -73.7, south: 45.4, east: -73.4, north: 45.7 },
    manualFilters: { date: 'next7', categories: [], price: 'all' },
    disabledDerivedKeys: []
  };

  it('permits the public browser preflight without exposing query content', async () => {
    const app = buildApp(repository);
    const response = await app.inject({ method: 'OPTIONS', url: '/search' });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['access-control-allow-headers']).toContain(
      'content-type'
    );
    await app.close();
  });

  // Regression test: app.inject() calls handlers directly and never
  // actually enforces CORS the way a real browser does, so a PUT/DELETE
  // route can pass every other test while still being silently unusable
  // from the browser if this header omits the method - exactly what
  // happened to /me/friends/requests/:id (PUT) and every other mutation
  // route added after /search's original GET/POST/OPTIONS-only allowlist.
  it('allows every HTTP method actually used by a mutation route', async () => {
    const app = buildApp(repository);
    const response = await app.inject({ method: 'OPTIONS', url: '/search' });
    const allowed = response.headers['access-control-allow-methods'];
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      expect(allowed).toContain(method);
    }
    await app.close();
  });

  it('applies cross-family hard constraints in the repository and explains exact results', async () => {
    let received:
      { date: string; categories: string[]; price: string } | undefined;
    const searchRepository: EventRepository = {
      ...repository,
      findInBounds: async (query) => {
        received = {
          date: query.date,
          categories: query.categories,
          price: query.price
        };
        return [event];
      }
    };
    const app = buildApp(searchRepository, {
      now: () => new Date('2026-07-15T23:00:00.000Z')
    });
    const response = await app.inject({
      method: 'POST',
      url: '/search',
      payload: body
    });
    expect(response.statusCode).toBe(200);
    expect(received).toEqual({
      date: 'tonight',
      categories: ['music'],
      price: 'free'
    });
    expect(response.json()).toMatchObject({
      condition: 'exact',
      interpretation: {
        engine: 'deterministic',
        language: 'en',
        effectiveFilters: {
          date: 'tonight',
          categories: ['music'],
          price: 'free'
        }
      },
      data: [
        {
          matchType: 'exact',
          event: { id: event.id },
          reasons: expect.arrayContaining([
            expect.objectContaining({ code: 'search.reason.category' }),
            expect.objectContaining({ code: 'search.reason.price' }),
            expect.objectContaining({ code: 'search.reason.date' })
          ])
        }
      ]
    });
    expect(JSON.stringify(response.json())).not.toContain(body.query);
    await app.close();
  });

  it('answers a named query from the whole directory, not the visible map', async () => {
    // Naming a real event used to return nothing at all: the query text never
    // reached the data, it was only mined for date/category/price filters.
    let boundedCalls = 0;
    let namedText: string | undefined;
    const searchRepository: EventRepository = {
      ...repository,
      findInBounds: async () => {
        boundedCalls += 1;
        return [];
      },
      searchEvents: async (query) => {
        namedText = query.text;
        return [event];
      },
      searchVenues: async () => [
        {
          id: '9f1d0f4a-6c6f-4a0f-9a3e-0f0b1c2d3e4f',
          name: 'Centre Bell',
          address: '1909 Av. des Canadiens-de-la-Flandre',
          point: { longitude: -73.5693, latitude: 45.4961 }
        }
      ]
    };
    const app = buildApp(searchRepository, {
      now: () => new Date('2026-07-15T23:00:00.000Z')
    });
    const response = await app.inject({
      method: 'POST',
      url: '/search',
      payload: { ...body, query: 'centre bell' }
    });

    expect(response.statusCode).toBe(200);
    expect(namedText).toBe('centre bell');
    // The map-bounded query must not run for a named search - that is what
    // used to hide an off-screen venue behind "no result".
    expect(boundedCalls).toBe(0);
    expect(response.json()).toMatchObject({
      condition: 'exact',
      searchText: 'centre bell',
      venues: [{ name: 'Centre Bell' }],
      data: [{ event: { id: event.id } }]
    });
    await app.close();
  });

  it('says so plainly when nothing carries the name that was searched', async () => {
    const searchRepository: EventRepository = {
      ...repository,
      searchEvents: async () => [],
      searchVenues: async () => []
    };
    const app = buildApp(searchRepository, {
      now: () => new Date('2026-07-15T23:00:00.000Z')
    });
    const response = await app.inject({
      method: 'POST',
      url: '/search',
      payload: { ...body, query: 'zzzznotathing' }
    });

    expect(response.json()).toMatchObject({
      condition: 'no_reliable_result',
      searchText: 'zzzznotathing',
      venues: [],
      data: []
    });
    await app.close();
  });

  it('answers a name the interpreter refused, whatever the capitalization', async () => {
    // Observed live: "clébard" dead-ended while "Clébard" was answered - the
    // same bar, found or not found on a capital letter, because the model
    // reads a capitalized word as a proper noun and a lowercase one as
    // vocabulary. A refusal to map the query onto a date, a price or a
    // category is not a claim that nothing by that name exists.
    const found = {
      id: '7c3d1e2f-8a4b-4c5d-9e0f-1a2b3c4d5e6f',
      name: 'Clébard',
      address: '4557 Rue Saint-Denis, Montréal',
      point: { longitude: -73.5687, latitude: 45.5251 },
      category: 'bar' as const
    };
    const searched: string[] = [];
    const searchRepository: EventRepository = {
      ...repository,
      searchEvents: async () => [],
      searchVenues: async (query) => {
        if (query.text) searched.push(query.text);
        return [found];
      }
    };

    for (const query of ['clébard', 'Clébard', 'CLÉBARD']) {
      const app = buildApp(searchRepository, {
        now: () => new Date('2026-07-15T23:00:00.000Z'),
        interpretQuery: async () => refusedInterpretation
      });
      const response = await app.inject({
        method: 'POST',
        url: '/search',
        payload: { ...body, query }
      });
      expect(response.json()).toMatchObject({
        condition: 'exact',
        venues: [{ name: 'Clébard' }]
      });
      await app.close();
    }
    // Every spelling reaches the directory as the same folded term.
    expect(new Set(searched)).toEqual(new Set(['clebard']));
  });

  it('leaves a refusal standing when the directory holds nothing either', async () => {
    // The model's judgement is not overridden on a guess: looking is only
    // worth overriding it when something is actually found.
    const searchRepository: EventRepository = {
      ...repository,
      searchEvents: async () => [],
      searchVenues: async () => []
    };
    const app = buildApp(searchRepository, {
      now: () => new Date('2026-07-15T23:00:00.000Z'),
      interpretQuery: async () => refusedInterpretation
    });
    const response = await app.inject({
      method: 'POST',
      url: '/search',
      payload: { ...body, query: 'clébard' }
    });

    expect(response.json()).toMatchObject({
      condition: 'no_reliable_result',
      message: { code: 'search.message.unsupported' },
      venues: [],
      data: []
    });
    await app.close();
  });

  it('does not second-guess a refusal that says something specific', async () => {
    // "Pulso only covers Montréal" is a real explanation. Replacing it with a
    // substring match on the query would swap an answer for a guess.
    let searchedVenues = false;
    const searchRepository: EventRepository = {
      ...repository,
      searchEvents: async () => [],
      searchVenues: async () => {
        searchedVenues = true;
        return [];
      }
    };
    const app = buildApp(searchRepository, {
      now: () => new Date('2026-07-15T23:00:00.000Z'),
      interpretQuery: async () => ({
        ...refusedInterpretation,
        message: { code: 'search.message.montrealOnly' as const }
      })
    });
    const response = await app.inject({
      method: 'POST',
      url: '/search',
      payload: { ...body, query: 'concerts à paris' }
    });

    expect(searchedVenues).toBe(false);
    expect(response.json()).toMatchObject({
      condition: 'no_reliable_result',
      message: { code: 'search.message.montrealOnly' }
    });
    await app.close();
  });

  it('looks a missing name up live, keeps it, and returns it', async () => {
    // A visitor standing outside a real bar that Pulso has never ingested
    // used to be told, in effect, that it does not exist.
    let lookedUpFor: string | undefined;
    let savedFor: string | undefined;
    const found = {
      id: '2b8e1d3c-7a4f-4b2e-9c1a-5d6e7f8a9b0c',
      name: 'Le Cheval Blanc',
      address: '809 Rue Ontario Est, Montréal',
      point: { longitude: -73.5812, latitude: 45.5231 },
      category: 'bar' as const,
      attribution: '© OpenStreetMap contributors'
    };
    const searchRepository: EventRepository = {
      ...repository,
      searchEvents: async () => [],
      searchVenues: async () => [],
      shouldLookUpVenue: async () => true,
      saveLookedUpVenues: async (text) => {
        savedFor = text;
        return [found];
      }
    };
    const app = buildApp(searchRepository, {
      now: () => new Date('2026-07-15T23:00:00.000Z'),
      lookupVenues: async (text) => {
        lookedUpFor = text;
        return [
          {
            osmRef: 'node/4242',
            name: 'Le Cheval Blanc',
            address: '809 Rue Ontario Est, Montréal',
            point: { longitude: -73.5812, latitude: 45.5231 },
            category: 'bar'
          }
        ];
      }
    });
    const response = await app.inject({
      method: 'POST',
      url: '/search',
      payload: { ...body, query: 'cheval blanc' }
    });

    expect(lookedUpFor).toBe('cheval blanc');
    expect(savedFor).toBe('cheval blanc');
    expect(response.json()).toMatchObject({
      condition: 'exact',
      message: { code: 'search.message.foundLive', params: { count: 1 } },
      searchText: 'cheval blanc',
      venues: [{ name: 'Le Cheval Blanc' }],
      // A place has no programming attached - that is why it was missing -
      // so the event list stays empty rather than being padded.
      data: []
    });
    await app.close();
  });

  it('records the miss even when the live lookup finds nothing', async () => {
    // Remembering "Montréal has no such place" is what stops one unmatchable
    // spelling becoming a request to Nominatim per visitor who repeats it.
    let savedCount: number | undefined;
    const searchRepository: EventRepository = {
      ...repository,
      searchEvents: async () => [],
      searchVenues: async () => [],
      shouldLookUpVenue: async () => true,
      saveLookedUpVenues: async (_text, candidates) => {
        savedCount = candidates.length;
        return [];
      }
    };
    const app = buildApp(searchRepository, {
      now: () => new Date('2026-07-15T23:00:00.000Z'),
      lookupVenues: async () => []
    });
    const response = await app.inject({
      method: 'POST',
      url: '/search',
      payload: { ...body, query: 'zzzznotathing' }
    });

    expect(savedCount).toBe(0);
    expect(response.json()).toMatchObject({
      condition: 'no_reliable_result',
      venues: []
    });
    await app.close();
  });

  it('does not go out to the network for a name already looked up and missed', async () => {
    let lookups = 0;
    const searchRepository: EventRepository = {
      ...repository,
      searchEvents: async () => [],
      searchVenues: async () => [],
      shouldLookUpVenue: async () => false
    };
    const app = buildApp(searchRepository, {
      now: () => new Date('2026-07-15T23:00:00.000Z'),
      lookupVenues: async () => {
        lookups += 1;
        return [];
      }
    });
    await app.inject({
      method: 'POST',
      url: '/search',
      payload: { ...body, query: 'zzzznotathing' }
    });

    expect(lookups).toBe(0);
    await app.close();
  });

  it('returns a one-step alternative with the material difference exposed', async () => {
    let calls = 0;
    const searchRepository: EventRepository = {
      ...repository,
      findInBounds: async () => {
        calls += 1;
        return calls === 1 ? [] : [event];
      }
    };
    const app = buildApp(searchRepository, {
      now: () => new Date('2026-07-15T23:00:00.000Z')
    });
    const response = await app.inject({
      method: 'POST',
      url: '/search',
      payload: { ...body, query: 'paid music tonight' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      condition: 'alternative',
      data: [
        {
          matchType: 'alternative',
          differences: [
            {
              code: 'search.difference.price',
              params: { price: 'paid' }
            }
          ]
        }
      ]
    });
    await app.close();
  });

  it('uses the accepted one-question path for an ambiguous price', async () => {
    const app = buildApp(repository);
    const response = await app.inject({
      method: 'POST',
      url: '/search',
      payload: { ...body, query: 'free or paid comedy' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      condition: 'clarification',
      clarification: { code: 'search.clarification.price' },
      data: []
    });
    await app.close();
  });

  it('rejects unknown request fields and returns no result for unsupported input', async () => {
    const app = buildApp(repository);
    const invalid = await app.inject({
      method: 'POST',
      url: '/search',
      payload: { ...body, rawQueryRetention: true }
    });
    expect(invalid.statusCode).toBe(400);
    const unsupported = await app.inject({
      method: 'POST',
      url: '/search',
      payload: { ...body, query: 'surprise me with magic vibes' }
    });
    expect(unsupported.statusCode).toBe(200);
    expect(unsupported.json()).toMatchObject({
      condition: 'no_reliable_result',
      data: []
    });
    await app.close();
  });

  it('returns equivalent structured French interpretation without persisting the query', async () => {
    const app = buildApp(repository, {
      now: () => new Date('2026-07-15T23:00:00.000Z')
    });
    const query = 'musique gratuite ce soir, commence bientôt';
    const response = await app.inject({
      method: 'POST',
      url: '/search',
      payload: { ...body, query, locale: 'fr' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      condition: 'exact',
      interpretation: {
        engine: 'deterministic',
        language: 'fr',
        effectiveFilters: {
          date: 'tonight',
          categories: ['music'],
          price: 'free'
        }
      }
    });
    expect(JSON.stringify(response.json())).not.toContain(query);
    await app.close();
  });
});
