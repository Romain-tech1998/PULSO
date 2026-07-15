import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPool, PostgresEventRepository } from '@pulso/database';

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

  it('returns the event in Montréal bounds', async () => {
    const events = await repository.findInBounds({
      west: -73.7,
      south: 45.4,
      east: -73.4,
      north: 45.7
    });
    expect(events.map((event) => event.id)).toContain(
      '00000000-0000-4000-8000-000000000001'
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
});
