import {
  mapAndDeduplicateRawEvents,
  type RawIngestedEvent
} from '@pulso/ingestion';

import { createPool } from './client.js';
import { upsertPublicEvents } from './upsert-public-events.js';

/**
 * Verified pilot import for a Pulso Scout candidate (evenko:18101402465523213
 * - "La magie du Lion King de Disney débarque à Montréal le mois prochain"),
 * following the same manual-verification precedent as
 * instagram-scout-import-verified-pilot.ts: the Instagram post alone had no
 * date, time, or confirmed venue (missingFacts: date, time,
 * venue_confirmation), so the real schedule was found and cross-checked
 * against the official Place des Arts event page
 * (https://www.placedesarts.com/en/event/the-lion-king) and evenko
 * (https://evenko.ca/en/events/salle-wilfrid-pelletier-place-des-arts/the-lion-king)
 * before being entered here. Unlike the Place Bell (Laval) precedent, Place
 * des Arts is already a real Montréal venue in this database
 * (id ...-034, curated), so no MVP-boundary block applies.
 */

const PLACE_DES_ARTS = {
  id: '00000000-0000-4000-8000-000000000034',
  name: 'Place des Arts',
  address: '175 Rue Sainte-Catherine Ouest, Montréal, QC H5B 1E5',
  point: { longitude: -73.5665434, latitude: 45.5084047 }
} as const;

const observedAt = new Date().toISOString();
const sourceUrl = 'https://www.placedesarts.com/en/event/the-lion-king';
const instagramEvidence = 'https://www.instagram.com/p/Da_teBwkdAe/';

// Full 24-performance run, August 19 - September 6, 2026, Salle
// Wilfrid-Pelletier - verified against placedesarts.com. Montréal is on EDT
// (UTC-4) for the entire run (DST ends in early November).
const lionKingOccurrences = [
  '2026-08-19T19:30:00-04:00',
  '2026-08-20T13:00:00-04:00',
  '2026-08-20T19:30:00-04:00',
  '2026-08-21T19:30:00-04:00',
  '2026-08-22T13:00:00-04:00',
  '2026-08-22T19:30:00-04:00',
  '2026-08-23T13:00:00-04:00',
  '2026-08-23T18:30:00-04:00',
  '2026-08-25T19:30:00-04:00',
  '2026-08-26T19:30:00-04:00',
  '2026-08-27T19:30:00-04:00',
  '2026-08-28T19:30:00-04:00',
  '2026-08-29T13:00:00-04:00',
  '2026-08-29T19:30:00-04:00',
  '2026-08-30T13:00:00-04:00',
  '2026-08-30T18:30:00-04:00',
  '2026-09-01T19:30:00-04:00',
  '2026-09-02T19:30:00-04:00',
  '2026-09-03T19:30:00-04:00',
  '2026-09-04T13:00:00-04:00',
  '2026-09-04T19:30:00-04:00',
  '2026-09-05T13:00:00-04:00',
  '2026-09-05T19:30:00-04:00',
  '2026-09-06T13:00:00-04:00'
] as const;

const rawEvents: RawIngestedEvent[] = lionKingOccurrences.map((startsAt) => ({
  // Not 'ville-de-montreal-evenements-publics' or 'ticketmaster': this
  // wasn't fetched through either trusted connector, so it must not inherit
  // their KNOWN_SOURCE_AUTHORITY trust label. A distinct id keeps trust at
  // the honest 'to_verify' default for a manually-verified one-off import.
  sourceId: 'pulso-scout-verified-pilot',
  sourceName: 'Place des Arts',
  sourceUrl,
  ticketingUrl: sourceUrl,
  observedAt,
  title: "Disney's The Lion King",
  description:
    'Événement repéré par Pulso Scout sur @evenko, puis date, heure et lieu confirmés auprès de Place des Arts.',
  category: 'show',
  startsAt,
  organizer: 'Disney Theatrical Productions',
  venueName: PLACE_DES_ARTS.name,
  address: PLACE_DES_ARTS.address,
  point: PLACE_DES_ARTS.point,
  pointResolution: 'source',
  price: { kind: 'paid' },
  raw: {
    scoutReviewId: 'evenko:18101402465523213',
    instagramEvidence
  }
}));

const { events, skipped } = mapAndDeduplicateRawEvents(rawEvents, {
  now: new Date()
});
if (skipped.length > 0 || events.length !== rawEvents.length) {
  throw new Error(
    `Verified Lion King mapping failed: ${events.length} mapped, ${skipped.length} skipped.`
  );
}

const verifiedEvents = events.map(({ event, additionalSources }) => ({
  event: { ...event, venue: { ...event.venue, id: PLACE_DES_ARTS.id } },
  additionalSources: [
    ...additionalSources,
    { name: 'Instagram @evenko', url: instagramEvidence, observedAt }
  ]
}));

const pool = createPool();
try {
  await upsertPublicEvents(pool, verifiedEvents);
  const persisted = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM events
     WHERE venue_id = $1 AND title = 'Disney''s The Lion King'`,
    [PLACE_DES_ARTS.id]
  );
  console.log(
    JSON.stringify({
      importedEvents: verifiedEvents.length,
      persistedEvents: Number(persisted.rows[0]?.count ?? 0),
      venue: PLACE_DES_ARTS.name,
      instagramAnnouncement: 1,
      corroboratingSource: 'Place des Arts (placedesarts.com)'
    })
  );
} finally {
  await pool.end();
}
