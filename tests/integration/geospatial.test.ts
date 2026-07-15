import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../apps/api/src/app.js';
import {
  eventDetailsResponseSchema,
  eventListResponseSchema
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
        north: 45.7
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
});
