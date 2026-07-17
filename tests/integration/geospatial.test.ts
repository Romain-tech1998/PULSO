import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../apps/api/src/app.js';
import {
  eventDetailsResponseSchema,
  eventListResponseSchema,
  intelligentSearchResponseSchema
} from '@pulso/contracts';
import { createPool, PostgresEventRepository } from '@pulso/database';
import { createMontrealDiscoveryWindow } from '@pulso/domain';

// Traceability: PRD-0001 MAP-002/003/005, EVENT-001/005/007/008,
// REDIRECT-001/003, and RFC-0001 database-backed API boundaries.

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('PostGIS synthetic Montréal event', () => {
  let pool: ReturnType<typeof createPool>;
  let repository: PostgresEventRepository;

  beforeAll(() => {
    pool = createPool(databaseUrl);
    repository = new PostgresEventRepository(pool);
  });

  afterAll(async () => pool.end());

  it('has PostGIS enabled and the expected spatial indexes', async () => {
    const extension = await pool.query<{ extversion: string }>(
      `SELECT extversion FROM pg_extension WHERE extname = 'postgis'`
    );
    expect(extension.rows[0]?.extversion).toMatch(/^3\.6\./);

    const indexes = await pool.query<{ indexname: string }>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'venues'`
    );
    expect(indexes.rows.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        'venues_location_gist_idx',
        'venues_location_geography_gist_idx'
      ])
    );
  });

  it('stores the explicitly fictional event and venue', async () => {
    const result = await pool.query<{
      title: string;
      category: string;
      status: string;
      venue_name: string;
      address: string;
      source_url: string;
    }>(
      `SELECT e.title, e.category, e.status, e.source_url,
              v.name AS venue_name, v.address
       FROM events e
       JOIN venues v ON v.id = e.venue_id
       WHERE e.id = $1`,
      ['00000000-0000-4000-8000-000000000001']
    );
    expect(result.rows[0]).toEqual({
      title: 'Synthetic Montréal Pulse',
      category: 'music',
      status: 'scheduled',
      venue_name: 'Synthetic Montréal Venue',
      address: '1000 Rue Synthétique, Montréal, QC',
      source_url: 'https://example.com/pulso-synthetic-event'
    });
  });

  it('returns the event in Montréal bounds using the geometry GiST index', async () => {
    const events = await repository.findInBounds(
      {
        west: -73.7,
        south: 45.4,
        east: -73.4,
        north: 45.7,
        date: 'next7',
        categories: [],
        price: 'all'
      },
      createMontrealDiscoveryWindow(new Date())
    );
    expect(events.map((event) => event.id)).toContain(
      '00000000-0000-4000-8000-000000000001'
    );

    const plan = await pool.query<{ 'QUERY PLAN': string }>(
      `EXPLAIN (FORMAT TEXT)
       SELECT id FROM venues
       WHERE location && ST_MakeEnvelope($1, $2, $3, $4, 4326)`,
      [-73.7, 45.4, -73.4, 45.7]
    );
    expect(plan.rows.map((row) => row['QUERY PLAN']).join('\n')).toMatch(
      /venues_location_gist_idx/i
    );
  });

  it('uses direct distance in meters and the geography GiST index', async () => {
    const events = await repository.findWithinDirectDistance({
      longitude: -73.5673,
      latitude: 45.5017,
      radiusMeters: 250
    });
    expect(events[0]?.distanceMeters).toBeLessThan(1);

    const plan = await pool.query<{ 'QUERY PLAN': string }>(
      `EXPLAIN (FORMAT TEXT)
       SELECT id FROM venues
       WHERE ST_DWithin(
         location::geography,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $3
       )`,
      [-73.5673, 45.5017, 250]
    );
    expect(plan.rows.map((row) => row['QUERY PLAN']).join('\n')).toMatch(
      /venues_location_geography_gist_idx/i
    );
  });

  it('round-trips SRID 4326 coordinates', async () => {
    const result = await pool.query<{
      srid: number;
      longitude: number;
      latitude: number;
    }>(
      `SELECT ST_SRID(location) AS srid,
              ST_X(location) AS longitude,
              ST_Y(location) AS latitude
       FROM venues WHERE id = $1`,
      ['00000000-0000-4000-8000-000000000002']
    );
    expect(result.rows[0]).toMatchObject({
      srid: 4326,
      longitude: -73.5673,
      latitude: 45.5017
    });
  });

  it('serves database-backed bounds and proximity responses through the shared contracts', async () => {
    const app = buildApp(repository);

    try {
      const boundsResponse = await app.inject({
        method: 'GET',
        url: '/events?west=-73.7&south=45.4&east=-73.4&north=45.7'
      });
      expect(boundsResponse.statusCode).toBe(200);
      const boundsBody = eventListResponseSchema.parse(boundsResponse.json());
      expect(boundsBody.data[0]?.id).toBe(
        '00000000-0000-4000-8000-000000000001'
      );
      expect(boundsBody.data[0]).toMatchObject({
        accessInformation:
          'Free entry. No reservation is required for this fictional fixture.',
        trust: { label: 'confirmed' },
        externalDestination: {
          label: 'Synthetic event source (example.com)',
          status: 'available'
        }
      });

      const detailsResponse = await app.inject({
        method: 'GET',
        url: '/events/00000000-0000-4000-8000-000000000001'
      });
      expect(detailsResponse.statusCode).toBe(200);
      const details = eventDetailsResponseSchema.parse(detailsResponse.json());
      expect(details.data.title).toBe('Synthetic Montréal Pulse');
      expect(details.data.organizer).toBe('Synthetic Montréal Organizer');

      const externalResponse = await app.inject({
        method: 'GET',
        url: '/events/00000000-0000-4000-8000-000000000001/external'
      });
      expect(externalResponse.statusCode).toBe(302);
      expect(externalResponse.headers.location).toBe(
        'https://example.com/pulso-synthetic-event'
      );

      const proximityResponse = await app.inject({
        method: 'GET',
        url: '/events/near?longitude=-73.5673&latitude=45.5019&radiusMeters=1000'
      });
      expect(proximityResponse.statusCode).toBe(200);
      const proximityBody = eventListResponseSchema.parse(
        proximityResponse.json()
      );
      expect(proximityBody.data[0]?.distanceMeters).toBeGreaterThan(22);
      expect(proximityBody.data[0]?.distanceMeters).toBeLessThan(23);
      expect(proximityBody.data[0]).not.toHaveProperty('route');
      expect(proximityBody.data[0]).not.toHaveProperty('travelTime');
      expect(proximityBody.data[0]).not.toHaveProperty('itinerary');
    } finally {
      await app.close();
    }
  });

  it('applies OR within categories and AND between category and price in Postgres', async () => {
    const app = buildApp(repository);
    try {
      const categoryResponse = await app.inject({
        method: 'GET',
        url: '/events?west=-73.7&south=45.4&east=-73.4&north=45.7&categories=music,comedy'
      });
      const categoryEvents = eventListResponseSchema.parse(
        categoryResponse.json()
      ).data;
      expect(categoryEvents.map(({ category }) => category)).toEqual(
        expect.arrayContaining(['music', 'comedy'])
      );
      expect(
        categoryEvents.every(({ category }) =>
          ['music', 'comedy'].includes(category)
        )
      ).toBe(true);

      const andResponse = await app.inject({
        method: 'GET',
        url: '/events?west=-73.7&south=45.4&east=-73.4&north=45.7&categories=comedy&price=paid'
      });
      expect(eventListResponseSchema.parse(andResponse.json()).data).toEqual(
        []
      );
    } finally {
      await app.close();
    }
  });

  it('implements All, Free, and Paid while keeping unknown price only under All', async () => {
    const app = buildApp(repository);
    try {
      const load = async (price: 'all' | 'free' | 'paid') => {
        const response = await app.inject({
          method: 'GET',
          url: `/events?west=-73.7&south=45.4&east=-73.4&north=45.7&price=${price}`
        });
        return eventListResponseSchema.parse(response.json()).data;
      };
      const all = await load('all');
      const free = await load('free');
      const paid = await load('paid');
      expect(all.some(({ price }) => price.kind === 'unknown')).toBe(true);
      expect(free.length).toBeGreaterThan(0);
      expect(free.every(({ price }) => price.kind === 'free')).toBe(true);
      expect(paid.length).toBeGreaterThan(0);
      expect(paid.every(({ price }) => price.kind === 'paid')).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('covers all six categories, includes postponed, and excludes cancelled discovery events', async () => {
    const app = buildApp(repository);
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/events?west=-73.7&south=45.4&east=-73.4&north=45.7'
      });
      const events = eventListResponseSchema.parse(response.json()).data;
      expect(new Set(events.map(({ category }) => category))).toEqual(
        new Set(['music', 'nightlife', 'festival', 'show', 'comedy', 'other'])
      );
      expect(events.some(({ status }) => status === 'postponed')).toBe(true);
      expect(events.some(({ status }) => status === 'cancelled')).toBe(false);
      expect(events.map(({ id }) => id)).not.toContain(
        '00000000-0000-4000-8000-000000000008'
      );
    } finally {
      await app.close();
    }
  });

  it('applies deterministic search constraints in Postgres and returns explanations', async () => {
    const app = buildApp(repository);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/search',
        payload: {
          query: 'free music tonight starting soon',
          bounds: { west: -73.7, south: 45.4, east: -73.4, north: 45.7 },
          manualFilters: { date: 'next7', categories: [], price: 'all' },
          disabledDerivedKeys: []
        }
      });
      expect(response.statusCode).toBe(200);
      const result = intelligentSearchResponseSchema.parse(response.json());
      expect(result.condition).toBe('exact');
      expect(result.data.map(({ event }) => event.id)).toContain(
        '00000000-0000-4000-8000-000000000001'
      );
      expect(
        result.data.every(
          ({ event }) =>
            event.category === 'music' && event.price.kind === 'free'
        )
      ).toBe(true);
      expect(result.data[0]?.reasons).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Category matches'),
          expect.stringContaining('Price matches'),
          expect.stringContaining('Date matches')
        ])
      );
      expect(JSON.stringify(result)).not.toContain(
        'free music tonight starting soon'
      );
    } finally {
      await app.close();
    }
  });

  it('applies explicit category exclusions in SQL and labels one-step alternatives', async () => {
    const app = buildApp(repository);
    try {
      const excludedResponse = await app.inject({
        method: 'POST',
        url: '/search',
        payload: {
          query: 'not comedy',
          bounds: { west: -73.7, south: 45.4, east: -73.4, north: 45.7 },
          manualFilters: { date: 'next7', categories: [], price: 'all' },
          disabledDerivedKeys: []
        }
      });
      const excluded = intelligentSearchResponseSchema.parse(
        excludedResponse.json()
      );
      expect(excluded.condition).toBe('exact');
      expect(
        excluded.data.some(({ event }) => event.category === 'comedy')
      ).toBe(false);

      const alternativeResponse = await app.inject({
        method: 'POST',
        url: '/search',
        payload: {
          query: 'paid comedy',
          bounds: { west: -73.7, south: 45.4, east: -73.4, north: 45.7 },
          manualFilters: { date: 'next7', categories: [], price: 'all' },
          disabledDerivedKeys: []
        }
      });
      const alternative = intelligentSearchResponseSchema.parse(
        alternativeResponse.json()
      );
      expect(alternative.condition).toBe('alternative');
      expect(alternative.data[0]?.matchType).toBe('alternative');
      expect(alternative.data[0]?.differences).toContain(
        'Price differs from paid.'
      );
    } finally {
      await app.close();
    }
  });

  it('returns a safe 400 for invalid live filter query parameters', async () => {
    const app = buildApp(repository);
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/events?west=-73.7&south=45.4&east=-73.4&north=45.7&categories=music,not-real'
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_REQUEST');
    } finally {
      await app.close();
    }
  });
});
