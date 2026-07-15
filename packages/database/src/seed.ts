import { createPool } from './client.js';
import { createSyntheticFixtureTimes } from './synthetic-fixture.js';

const pool = createPool();
const fixtureTimes = createSyntheticFixtureTimes(new Date());

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
       source_name, source_url, observed_at, freshness, location_confidence, price_kind,
       description, organizer_name, access_information, external_destination_label,
       external_destination_url, external_destination_status, trust_label
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
       $15, $16, $17, $18, $19, $20, $21
     )
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       starts_at = EXCLUDED.starts_at,
       ends_at = EXCLUDED.ends_at,
       observed_at = EXCLUDED.observed_at,
       description = EXCLUDED.description,
       organizer_name = EXCLUDED.organizer_name,
       access_information = EXCLUDED.access_information,
       external_destination_label = EXCLUDED.external_destination_label,
       external_destination_url = EXCLUDED.external_destination_url,
       external_destination_status = EXCLUDED.external_destination_status,
       trust_label = EXCLUDED.trust_label`,
    [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      'Synthetic Montréal Pulse',
      'music',
      'scheduled',
      fixtureTimes.startsAt,
      fixtureTimes.endsAt,
      'America/Toronto',
      'Synthetic source',
      'https://example.com/pulso-synthetic-event',
      fixtureTimes.observedAt,
      'unknown',
      'confirmed',
      'free',
      'A fictional music event used only to validate Pulso.',
      'Synthetic Montréal Organizer',
      'Free entry. No reservation is required for this fictional fixture.',
      'Synthetic event source (example.com)',
      'https://example.com/pulso-synthetic-event',
      'available',
      'confirmed'
    ]
  );
} finally {
  await pool.end();
}
