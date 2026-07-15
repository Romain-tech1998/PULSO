import { createPool } from './client.js';

const pool = createPool();

try {
  await pool.query(
    `INSERT INTO venues (id, name, address, location)
     VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326))
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       address = EXCLUDED.address,
       location = EXCLUDED.location`,
    [
      '00000000-0000-4000-8000-000000000002',
      'Synthetic Montréal Venue',
      '1000 Rue Synthétique, Montréal, QC',
      -73.5673,
      45.5017
    ]
  );

  await pool.query(
    `INSERT INTO events (
       id, venue_id, title, category, status, starts_at, ends_at, timezone,
       source_name, source_url, observed_at, freshness, location_confidence, price_kind
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       starts_at = EXCLUDED.starts_at,
       observed_at = EXCLUDED.observed_at`,
    [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      'Synthetic Montréal Pulse',
      'music',
      'scheduled',
      '2026-08-01T00:00:00.000Z',
      '2026-08-01T03:00:00.000Z',
      'America/Toronto',
      'Synthetic source',
      'https://example.com/pulso-synthetic-event',
      '2026-07-15T12:00:00.000Z',
      'unknown',
      'confirmed',
      'free'
    ]
  );
} finally {
  await pool.end();
}
