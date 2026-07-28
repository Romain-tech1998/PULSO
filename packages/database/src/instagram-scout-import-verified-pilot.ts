import {
  mapAndDeduplicateRawEvents,
  type RawIngestedEvent
} from '@pulso/ingestion';

import { createPool } from './client.js';
import { upsertPublicEvents } from './upsert-public-events.js';

const PLACE_BELL = {
  id: '00000000-0000-4000-8000-000000000059',
  name: 'Place Bell',
  address: '1950 Rue Claude-Gagné, Laval, QC H7N 0E4',
  point: { longitude: -73.7218, latitude: 45.5558 }
} as const;

const observedAt = new Date().toISOString();
const disneyTicketingUrl =
  'https://www.ticketmaster.ca/disney-on-ice-presents-magic-of-billets/artist/2873404?language=fr-ca';
const evenkoDisneyEvidence = 'https://www.instagram.com/p/Da_spn3x2ed/';

const disneyOccurrences = [
  ['2026-12-17T19:00:00-05:00', 'ENGLISH'],
  ['2026-12-18T11:00:00-05:00', 'FRANÇAIS'],
  ['2026-12-18T15:00:00-05:00', 'ENGLISH'],
  ['2026-12-18T19:00:00-05:00', 'FRANÇAIS'],
  ['2026-12-19T11:00:00-05:00', 'FRANÇAIS'],
  ['2026-12-19T15:00:00-05:00', 'FRANÇAIS'],
  ['2026-12-19T19:00:00-05:00', 'FRANÇAIS'],
  ['2026-12-20T11:00:00-05:00', 'FRANÇAIS'],
  ['2026-12-20T15:00:00-05:00', 'ENGLISH'],
  ['2026-12-20T19:00:00-05:00', 'FRANÇAIS']
] as const;

function atPlaceBell(
  event: Omit<
    RawIngestedEvent,
    | 'sourceId'
    | 'sourceName'
    | 'observedAt'
    | 'venueName'
    | 'address'
    | 'point'
    | 'pointResolution'
  >
): RawIngestedEvent {
  return {
    ...event,
    sourceId: 'ticketmaster',
    sourceName: 'Ticketmaster',
    observedAt,
    venueName: PLACE_BELL.name,
    address: PLACE_BELL.address,
    point: PLACE_BELL.point,
    pointResolution: 'source',
    price: { kind: 'paid' }
  };
}

const rawEvents: RawIngestedEvent[] = [
  atPlaceBell({
    sourceUrl:
      'https://www.ticketmaster.ca/trivium-crown-in-the-grave-world-tour-laval-11-17-2026/event/310064ED98CF36FA',
    ticketingUrl:
      'https://www.ticketmaster.ca/trivium-crown-in-the-grave-world-tour-laval-11-17-2026/event/310064ED98CF36FA',
    title: 'TRIVIUM: Crown in the Grave World Tour',
    description:
      'Événement repéré par Pulso Scout sur @evenko, puis date, heure et lieu confirmés par Ticketmaster.',
    category: 'music',
    startsAt: '2026-11-17T18:35:00-05:00',
    organizer: 'evenko',
    raw: {
      scoutReviewId: 'evenko:18607584688008613',
      instagramEvidence: 'https://www.instagram.com/p/DbDuqcJxrWG/'
    }
  }),
  ...disneyOccurrences.map(([startsAt, language]) =>
    atPlaceBell({
      sourceUrl: disneyTicketingUrl,
      ticketingUrl: disneyTicketingUrl,
      title: `Disney sur Glace présente La Magie en Famille — ${language}`,
      description:
        'Représentation repérée par Pulso Scout sur @evenko, puis date, heure et lieu confirmés par Ticketmaster.',
      category: 'show',
      startsAt,
      organizer: 'Disney On Ice',
      raw: {
        scoutReviewId: 'evenko:18018563378897078',
        instagramEvidence: evenkoDisneyEvidence
      }
    })
  )
];

const { events, skipped } = mapAndDeduplicateRawEvents(rawEvents, {
  now: new Date()
});
if (skipped.length > 0 || events.length !== rawEvents.length) {
  throw new Error(
    `Verified pilot mapping failed: ${events.length} mapped, ${skipped.length} skipped.`
  );
}

const verifiedEvents = events.map(({ event, additionalSources }, index) => ({
  event: {
    ...event,
    venue: { ...event.venue, id: PLACE_BELL.id }
  },
  additionalSources: [
    ...additionalSources,
    {
      name: 'Instagram @evenko',
      url:
        index === 0
          ? 'https://www.instagram.com/p/DbDuqcJxrWG/'
          : evenkoDisneyEvidence,
      observedAt
    }
  ]
}));

const pool = createPool();
try {
  await upsertPublicEvents(pool, verifiedEvents);
  const persisted = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM events
     WHERE venue_id = $1
       AND (
         title = 'TRIVIUM: Crown in the Grave World Tour'
         OR title LIKE 'Disney sur Glace présente La Magie en Famille%'
       )`,
    [PLACE_BELL.id]
  );
  console.log(
    JSON.stringify({
      importedEvents: verifiedEvents.length,
      persistedEvents: Number(persisted.rows[0]?.count ?? 0),
      venue: PLACE_BELL.name,
      instagramAnnouncements: 2,
      corroboratingSource: 'Ticketmaster'
    })
  );
} finally {
  await pool.end();
}
