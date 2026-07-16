import type { EventCategory, EventStatus, TrustLabel } from '@pulso/domain';

import { createPool } from './client.js';
import { createSyntheticFilterFixtureTimes } from './synthetic-fixture.js';

const pool = createPool();
const clock = new Date();
const times = createSyntheticFilterFixtureTimes(clock);

interface Fixture {
  id: string;
  venueId: string;
  title: string;
  category: EventCategory;
  status: EventStatus;
  startsAt: Date;
  priceKind: 'free' | 'paid' | 'unknown';
  venueName: string;
  address: string;
  longitude: number;
  latitude: number;
  description?: string;
  organizer?: string;
  trustLabel: TrustLabel;
  locationConfidence: 'confirmed' | 'uncertain';
  accessInformation: string;
  externalDestination?: string;
}

const fixtures: Fixture[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    venueId: '00000000-0000-4000-8000-000000000002',
    title: 'Synthetic Montréal Pulse',
    category: 'music',
    status: 'scheduled',
    startsAt: times.tonight,
    priceKind: 'free',
    venueName: 'Synthetic Montréal Venue',
    address: '1000 Rue Synthétique, Montréal, QC',
    longitude: -73.5673,
    latitude: 45.5017,
    description: 'A fictional music event used only to validate Pulso.',
    organizer: 'Synthetic Montréal Organizer',
    trustLabel: 'confirmed',
    locationConfidence: 'confirmed',
    accessInformation:
      'Free entry. No reservation is required for this fictional fixture.',
    externalDestination: 'pulso-synthetic-event'
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    venueId: '00000000-0000-4000-8000-000000000010',
    title: 'Fictional Tomorrow DJ Session',
    category: 'nightlife',
    status: 'scheduled',
    startsAt: times.tomorrow,
    priceKind: 'paid',
    venueName: 'Imaginary Night Hall',
    address: '1100 Rue Fictive, Montréal, QC',
    longitude: -73.579,
    latitude: 45.509,
    description: 'A fictional nightlife fixture for filter validation.',
    organizer: 'Imaginary Night Organizer',
    trustLabel: 'probable',
    locationConfidence: 'confirmed',
    accessInformation: 'Paid access; exact price is not confirmed.',
    externalDestination: 'fictional-tomorrow-dj'
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    venueId: '00000000-0000-4000-8000-000000000011',
    title: 'Invented Weekend Festival',
    category: 'festival',
    status: 'postponed',
    startsAt: times.weekend,
    priceKind: 'unknown',
    venueName: 'Fictional Festival Yard',
    address: '1200 Avenue Imaginaire, Montréal, QC',
    longitude: -73.55,
    latitude: 45.52,
    trustLabel: 'to_verify',
    locationConfidence: 'uncertain',
    accessInformation:
      'Access details and the revised schedule remain unconfirmed.'
  },
  {
    id: '00000000-0000-4000-8000-000000000005',
    venueId: '00000000-0000-4000-8000-000000000012',
    title: 'Fictional Lantern Show',
    category: 'show',
    status: 'scheduled',
    startsAt: times.later[0]!,
    priceKind: 'paid',
    venueName: 'Made-up Performance Room',
    address: '1300 Boulevard Fictif, Montréal, QC',
    longitude: -73.59,
    latitude: 45.49,
    description: 'A fictional show fixture for Pulso tests.',
    trustLabel: 'confirmed',
    locationConfidence: 'confirmed',
    accessInformation: 'Paid entry through the fictional event source.',
    externalDestination: 'fictional-lantern-show'
  },
  {
    id: '00000000-0000-4000-8000-000000000006',
    venueId: '00000000-0000-4000-8000-000000000013',
    title: 'Imaginary Montréal Comedy Hour',
    category: 'comedy',
    status: 'scheduled',
    startsAt: times.later[1]!,
    priceKind: 'free',
    venueName: 'Invented Comedy Room',
    address: '1400 Rue Inventée, Montréal, QC',
    longitude: -73.61,
    latitude: 45.53,
    description: 'A fictional comedy event used only by Pulso.',
    organizer: 'Fictional Laughs Collective',
    trustLabel: 'confirmed',
    locationConfidence: 'confirmed',
    accessInformation: 'Free entry for this fictional fixture.',
    externalDestination: 'imaginary-comedy-hour'
  },
  {
    id: '00000000-0000-4000-8000-000000000007',
    venueId: '00000000-0000-4000-8000-000000000014',
    title: 'Synthetic Scheduled Gathering',
    category: 'other',
    status: 'scheduled',
    startsAt: times.later[2]!,
    priceKind: 'unknown',
    venueName: 'Fictional Community Stage',
    address: '1500 Rue Exemple, Montréal, QC',
    longitude: -73.54,
    latitude: 45.48,
    trustLabel: 'to_verify',
    locationConfidence: 'confirmed',
    accessInformation: 'Access conditions are not confirmed.'
  },
  {
    id: '00000000-0000-4000-8000-000000000008',
    venueId: '00000000-0000-4000-8000-000000000015',
    title: 'Cancelled Fictional Music Night',
    category: 'music',
    status: 'cancelled',
    startsAt: times.later[3]!,
    priceKind: 'paid',
    venueName: 'Imaginary Cancelled Hall',
    address: '1600 Rue Annulée, Montréal, QC',
    longitude: -73.62,
    latitude: 45.5,
    trustLabel: 'confirmed',
    locationConfidence: 'confirmed',
    accessInformation: 'This fictional event is cancelled.',
    externalDestination: 'cancelled-fictional-music-night'
  }
];

try {
  for (const fixture of fixtures) {
    await pool.query(
      `INSERT INTO venues (id, name, address, location)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326))
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         address = EXCLUDED.address,
         location = EXCLUDED.location`,
      [
        fixture.venueId,
        fixture.venueName,
        fixture.address,
        fixture.longitude,
        fixture.latitude
      ]
    );

    await pool.query(
      `INSERT INTO events (
         id, venue_id, title, category, status, starts_at, ends_at, timezone,
         source_name, source_url, observed_at, freshness, location_confidence, price_kind,
         description, organizer_name, access_information, external_destination_label,
         external_destination_url, external_destination_status, trust_label
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, 'America/Toronto',
         'Synthetic source', $8, $9, 'unknown', $10, $11,
         $12, $13, $14, $15, $8, $16, $17
       )
       ON CONFLICT (id) DO UPDATE SET
         venue_id = EXCLUDED.venue_id,
         title = EXCLUDED.title,
         category = EXCLUDED.category,
         status = EXCLUDED.status,
         starts_at = EXCLUDED.starts_at,
         ends_at = EXCLUDED.ends_at,
         source_name = EXCLUDED.source_name,
         source_url = EXCLUDED.source_url,
         observed_at = EXCLUDED.observed_at,
         freshness = EXCLUDED.freshness,
         location_confidence = EXCLUDED.location_confidence,
         price_kind = EXCLUDED.price_kind,
         description = EXCLUDED.description,
         organizer_name = EXCLUDED.organizer_name,
         access_information = EXCLUDED.access_information,
         external_destination_label = EXCLUDED.external_destination_label,
         external_destination_url = EXCLUDED.external_destination_url,
         external_destination_status = EXCLUDED.external_destination_status,
         trust_label = EXCLUDED.trust_label`,
      [
        fixture.id,
        fixture.venueId,
        fixture.title,
        fixture.category,
        fixture.status,
        fixture.startsAt,
        new Date(fixture.startsAt.getTime() + 3 * 60 * 60 * 1000),
        `https://example.com/${fixture.externalDestination ?? `source-${fixture.id}`}`,
        times.observedAt,
        fixture.locationConfidence,
        fixture.priceKind,
        fixture.description ?? null,
        fixture.organizer ?? null,
        fixture.accessInformation,
        fixture.externalDestination
          ? 'Synthetic event source (example.com)'
          : null,
        fixture.externalDestination ? 'available' : null,
        fixture.trustLabel
      ]
    );
  }
} finally {
  await pool.end();
}
