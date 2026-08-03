import {
  mapAndDeduplicateRawEvents,
  type RawIngestedEvent
} from '@pulso/ingestion';

import { createPool } from './client.js';
import { upsertPublicEvents } from './upsert-public-events.js';

/**
 * Verified pilot import for a Pulso Scout Stories candidate
 * (new-city-gas:3955692853343131093_203267420 - a Story image listing New
 * City Gas's upcoming lineup, human-accepted via
 * pulso-scout-stories-decisions.json on 2026-08-03). Same manual-verification
 * precedent as instagram-scout-import-lion-king.ts: the Story image gave
 * dates and lineups but no times, so 22:00 (the confirmed real doors time for the
 * one show checked live on Tixr, Adventure Club) is used as an explicit
 * placeholder for the rest, not a fact read off the image for those - flag
 * for correction once their real showtimes are confirmed. New City Gas is
 * already a curated venue in this database (id ...-023).
 */

const NEW_CITY_GAS = {
  id: '00000000-0000-4000-8000-000000000023',
  name: 'New City Gas',
  address: '950, Rue Ottawa, Montréal, QC H3C 1S4',
  point: { longitude: -73.5575195, latitude: 45.4951304 }
} as const;

const observedAt = new Date().toISOString();
const groupTicketingUrl = 'https://www.tixr.com/groups/newcitygas';
const instagramEvidence = 'https://www.instagram.com/newcitygas/';

// Montréal is on EDT (UTC-4) through this whole window (DST ends in
// November). No time was visible on the Story image for most shows, so
// 22:00 (Adventure Club's own confirmed doors time) is used as an assumed
// placeholder for entries without a confirmed override - not a verified
// fact for those.
const lineup: Array<{
  date: string;
  title: string;
  series: string;
  time?: string;
  ticketingUrl?: string;
  minimumAmount?: number;
}> = [
  {
    // Confirmed live against the real Tixr event page (2026-08-04):
    // doors 22h00, GA $27.76 CAD, VIP $52.51 CAD.
    date: '2026-08-07',
    title:
      'Adventure Club (Throwback Set) w/ Katt2Katt b2b Mholy, Riendo, Joss',
    series: "L'Après îleSoniq",
    time: '22:00:00',
    ticketingUrl:
      'https://www.tixr.com/groups/newcitygas/events/adventure-club-b2b-invit-e-special-e-190147',
    minimumAmount: 27.76
  },
  {
    date: '2026-08-07',
    title: 'HOAX (BE) w/ Duza, Mezz',
    series: 'Nuits Bazart'
  },
  {
    date: '2026-08-08',
    title: 'Deadmau5 w/ Stef Agostino, Mandiz',
    series: "L'Après îleSoniq"
  },
  {
    date: '2026-08-09',
    title: 'Benny Benassi w/ Essentia, Squ4re',
    series: "L'Après îleSoniq"
  },
  {
    date: '2026-08-14',
    title: 'Bohemian w/ The Neighbors, Ensø',
    series: 'Nuits Bazart'
  },
  {
    date: '2026-08-28',
    title: 'Andruss w/ Paskal Daze, Moonart',
    series: 'Nuits Bazart'
  },
  {
    date: '2026-09-04',
    title: 'TRYM, NIFRA w/ Deroz',
    series: 'Prodktworld Festival'
  },
  {
    date: '2026-09-05',
    title: 'Don Diablo (invité surprise) w/ Anna Wilder',
    series: 'Prodktworld Festival'
  },
  {
    date: '2026-09-06',
    title: 'Max Dean b2b Luke Dean, Tommy Phillips w/ Simon Fitch',
    series: 'Prodktworld Festival'
  }
];

const rawEvents: RawIngestedEvent[] = lineup.map(
  ({ date, title, series, time, ticketingUrl, minimumAmount }) => {
    const timeConfirmed = Boolean(time);
    return {
      // Not 'ville-de-montreal-evenements-publics' or 'ticketmaster': this
      // wasn't fetched through either trusted connector, so it must not
      // inherit their KNOWN_SOURCE_AUTHORITY trust label. A distinct id
      // keeps trust at the honest 'to_verify' default for a
      // manually-verified one-off import.
      sourceId: 'pulso-scout-verified-pilot',
      sourceName: 'New City Gas',
      sourceUrl: instagramEvidence,
      ticketingUrl: ticketingUrl ?? groupTicketingUrl,
      observedAt,
      title,
      description: timeConfirmed
        ? `${series} - événement repéré par Pulso Scout Stories sur @newcitygas, heure et prix confirmés sur Tixr.`
        : `${series} - événement repéré par Pulso Scout Stories sur @newcitygas. Heure non visible sur l'affiche : 22h00 utilisé par défaut (showtime standard de club), à corriger si une heure officielle est confirmée.`,
      category: 'music',
      startsAt: `${date}T${time ?? '22:00:00'}-04:00`,
      venueName: NEW_CITY_GAS.name,
      address: NEW_CITY_GAS.address,
      point: NEW_CITY_GAS.point,
      pointResolution: 'source',
      price:
        minimumAmount !== undefined
          ? { kind: 'paid', minimumAmount }
          : { kind: 'paid' },
      raw: {
        scoutReviewId: 'new-city-gas:3955692853343131093_203267420',
        instagramEvidence,
        series
      }
    };
  }
);

const { events, skipped } = mapAndDeduplicateRawEvents(rawEvents, {
  now: new Date()
});
if (skipped.length > 0 || events.length !== rawEvents.length) {
  throw new Error(
    `Verified New City Gas lineup mapping failed: ${events.length} mapped, ${skipped.length} skipped.`
  );
}

const verifiedEvents = events.map(({ event, additionalSources }) => ({
  event: { ...event, venue: { ...event.venue, id: NEW_CITY_GAS.id } },
  additionalSources: [
    ...additionalSources,
    { name: 'Instagram @newcitygas', url: instagramEvidence, observedAt }
  ]
}));

const pool = createPool();
try {
  await upsertPublicEvents(pool, verifiedEvents);
  const persisted = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM events
     WHERE venue_id = $1 AND source_url = $2`,
    [NEW_CITY_GAS.id, instagramEvidence]
  );
  console.log(
    JSON.stringify({
      importedEvents: verifiedEvents.length,
      persistedEvents: Number(persisted.rows[0]?.count ?? 0),
      venue: NEW_CITY_GAS.name
    })
  );
} finally {
  await pool.end();
}
