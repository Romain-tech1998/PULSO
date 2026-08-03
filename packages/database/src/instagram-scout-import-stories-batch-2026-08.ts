import {
  mapAndDeduplicateRawEvents,
  type RawIngestedEvent
} from '@pulso/ingestion';

import { createPool } from './client.js';
import { upsertPublicEvents } from './upsert-public-events.js';

/**
 * Verified pilot import for a batch of Pulso Scout Stories candidates from
 * the 2026-08-03 full-watchlist run (248 accounts, 223 stories, 161
 * AI-flagged as likely events). Per the operator's explicit instruction not
 * to manually review 160 candidates one by one, only the highest-confidence
 * candidates with concrete, unambiguous facts (title, date, venue all
 * legible) were kept - the rest were rejected as vague festival mentions,
 * already-past dates, an explicitly cancelled event, or (Stereo Montreal's
 * lineup poster) dates whose artist names were genuinely illegible due to
 * overlapping poster typography, same discipline as the New City Gas
 * lineup import.
 *
 * Two AI-flagged candidates (Yoko Luna x2, Bar le Cocktail's Pride drag
 * show) were dropped entirely: no reliable address/coordinates could be
 * found for either venue via OpenStreetMap/Nominatim, and inventing a
 * coordinate is against this codebase's mapping rules (see
 * to-public-event.ts) - they can be added once a real address is
 * confirmed.
 */

const observedAt = new Date().toISOString();
const instagramEvidence = 'https://www.instagram.com/'; // per-account handles noted in each event's raw.handle

interface VenueRef {
  id?: string;
  name: string;
  address: string;
  point: { longitude: number; latitude: number };
}

const VENUES = {
  ritzPdb: {
    id: '2c619101-749e-57a7-9f5a-85155b094c1a',
    name: 'Bar le Ritz PDB',
    address: '179 Jean-Talon Ouest, Montréal, QC',
    point: { longitude: -73.62028, latitude: 45.53277 }
  },
  sat: {
    id: '00000000-0000-4000-8000-000000000027',
    name: 'Société des arts technologiques (SAT)',
    address: '1201 Boulevard Saint-Laurent, Montréal, QC H2X 2S6',
    point: { longitude: -73.562583, latitude: 45.5096562 }
  },
  wiggleRoom: {
    name: 'The Wiggle Room',
    address: '3874 Boulevard Saint-Laurent, Montréal, QC H2W 1Y4',
    point: { longitude: -73.5777882, latitude: 45.5160833 }
  },
  dieuDuCiel: {
    name: 'Dieu du Ciel!',
    address: '29 Avenue Laurier Ouest, Montréal, QC H2T 2N2',
    point: { longitude: -73.5933836, latitude: 45.5226951 }
  },
  hurleys: {
    id: 'a103ac09-db73-506e-9f9a-8c378aaaae22',
    name: "Hurley's Irish Pub",
    address: '1225 Rue Crescent, Montréal, QC H3G 2B1',
    point: { longitude: -73.5747597, latitude: 45.4968805 }
  },
  espacePublic: {
    name: "L'Espace Public",
    address: 'Avenue Letourneux, Montréal, QC H1V 2N9',
    point: { longitude: -73.5439336, latitude: 45.5540857 }
  },
  leTerminal: {
    name: 'Le Terminal',
    address: '1875 Avenue du Mont-Royal Est, Montréal, QC H2N 2N9',
    point: { longitude: -73.5739539, latitude: 45.5337949 }
  },
  parcJeanDrapeau: {
    id: '15473edb-25f7-57f4-bdeb-c325562bb0d2',
    name: 'Parc Jean-Drapeau',
    address: 'Parc Jean-Drapeau, Montréal, QC',
    point: { longitude: -73.5343331, latitude: 45.5138637 }
  },
  stereo: {
    id: '00000000-0000-4000-8000-000000000042',
    name: 'Stereo Montreal',
    address: '858 Rue Sainte-Catherine Est, Montréal, QC H2L 2E2',
    point: { longitude: -73.5581204, latitude: 45.5159988 }
  }
} as const satisfies Record<string, VenueRef>;

interface EventInput {
  venue: VenueRef;
  title: string;
  startsAt: string;
  category: RawIngestedEvent['category'];
  description: string;
  ticketingUrl?: string;
  handle: string;
  reviewId: string;
}

const events: EventInput[] = [
  {
    venue: VENUES.ritzPdb,
    title: 'One of Those Nights Tour',
    startsAt: '2026-08-05T21:00:00-04:00',
    category: 'music',
    description:
      'Repéré par Pulso Scout Stories sur @barleritzpdb. Heure non visible sur la Story : 21h00 utilisé par défaut.',
    ticketingUrl: 'https://greenland.ca',
    handle: 'barleritzpdb',
    reviewId: 'bar-le-ritz-pdb:3955657636205150836_2093396983'
  },
  {
    venue: VENUES.sat,
    title: 'Sunsat',
    startsAt: '2026-08-08T12:00:00-04:00',
    category: 'music',
    description:
      'Repéré par Pulso Scout Stories sur @sat_montreal. Série de journées sur le toit de la SAT, 12h-20h.',
    handle: 'sat_montreal',
    reviewId:
      'societe-des-arts-technologiques-sat:3955653408367544084_65873095007'
  },
  {
    venue: VENUES.sat,
    title: 'Sunsat',
    startsAt: '2026-09-12T12:00:00-04:00',
    category: 'music',
    description:
      'Repéré par Pulso Scout Stories sur @sat_montreal. Série de journées sur le toit de la SAT, 12h-20h.',
    handle: 'sat_montreal',
    reviewId:
      'societe-des-arts-technologiques-sat:3955653408367544084_65873095007'
  },
  {
    venue: VENUES.wiggleRoom,
    title: 'White Lotus Tribute',
    startsAt: '2026-08-22T21:00:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Stories sur @wiggleroommtl. Heure non visible sur la Story : 21h00 utilisé par défaut.',
    ticketingUrl: 'https://www.instagram.com/wiggleroommtl',
    handle: 'wiggleroommtl',
    reviewId: 'le-wiggle-room:3955631875519604253_1106502105'
  },
  {
    venue: VENUES.wiggleRoom,
    title: 'Voix De Ville Variety Show',
    startsAt: '2026-08-05T20:00:00-04:00',
    category: 'show',
    description:
      'Repéré par Pulso Scout Stories sur @wiggleroommtl. Portes 19h00, spectacle 20h00 (confirmé sur la Story).',
    ticketingUrl: 'https://www.wiggleroom.ca',
    handle: 'wiggleroommtl',
    reviewId: 'le-wiggle-room:3955631983517271947_1106502105'
  },
  {
    venue: VENUES.dieuDuCiel,
    title: "Pépé et sa guitare + Noé Talbot (P'tit DDC)",
    startsAt: '2026-08-22T21:00:00-04:00',
    category: 'music',
    description:
      "Repéré par Pulso Scout Stories sur @brasseriedieuduciel (annexe P'tit DDC). Heure non visible sur la Story : 21h00 utilisé par défaut.",
    ticketingUrl: 'https://www.instagram.com/ptitddc',
    handle: 'brasseriedieuduciel',
    reviewId: 'brasserie-dieu-du-ciel:3955772621750290645_2302736988'
  },
  {
    venue: VENUES.hurleys,
    title: "World's Smallest Comedy Fest (Hash's Laff Bash)",
    startsAt: '2026-08-10T20:00:00-04:00',
    category: 'comedy',
    description:
      'Repéré par Pulso Scout Stories sur @hurleysirishpub. Festival du 10 au 17 août 2026, 20h00 chaque soir selon la Story.',
    ticketingUrl: 'https://www.instagram.com/wscomedynight',
    handle: 'hurleysirishpub',
    reviewId: 'hurley-s-irish-pub:3955776332653161574_8121722269'
  },
  {
    venue: VENUES.espacePublic,
    title: 'Les Jeudis Tacos',
    startsAt: '2026-08-06T17:00:00-04:00',
    category: 'other',
    description:
      'Repéré par Pulso Scout Stories sur @lespacepublic. Événement récurrent, dès 17h00.',
    handle: 'lespacepublic',
    reviewId: 'l-espace-public:3955565261020586346_1038632156'
  },
  {
    venue: VENUES.espacePublic,
    title: 'Les Jeudis Tacos',
    startsAt: '2026-08-20T17:00:00-04:00',
    category: 'other',
    description:
      'Repéré par Pulso Scout Stories sur @lespacepublic. Événement récurrent, dès 17h00.',
    handle: 'lespacepublic',
    reviewId: 'l-espace-public:3955565261020586346_1038632156'
  },
  {
    venue: VENUES.espacePublic,
    title: 'Vernissage (gabryco_collage)',
    startsAt: '2026-08-03T17:00:00-04:00',
    category: 'other',
    description:
      'Repéré par Pulso Scout Stories sur @lespacepublic. Exposition à 17h00 (confirmé sur la Story).',
    ticketingUrl: 'https://www.instagram.com/gabryco_collage',
    handle: 'lespacepublic',
    reviewId: 'l-espace-public:3955583156539508353_1038632156'
  },
  {
    venue: VENUES.leTerminal,
    title: 'Josiane Aubuchon en rodage',
    startsAt: '2026-08-05T19:00:00-04:00',
    category: 'comedy',
    description:
      'Repéré par Pulso Scout Stories sur @terminalcomedieclub. Heure 19h00 confirmée sur la Story.',
    ticketingUrl: 'https://www.instagram.com/terminalcomediclub',
    handle: 'terminalcomedieclub',
    reviewId: 'le-terminal-comedie-club:3955610857999314984_10663273282'
  },
  {
    venue: VENUES.parcJeanDrapeau,
    title: 'Off Piknic - Adriatique, Colyn, Kolophane',
    startsAt: '2026-08-28T21:00:00-04:00',
    category: 'music',
    description:
      'Repéré par Pulso Scout Stories sur @piknicmtl. Heure non visible sur la Story : 21h00 utilisé par défaut.',
    handle: 'piknicmtl',
    reviewId: 'piknic-electronik:3955642768261771540_325753180'
  },
  {
    venue: VENUES.stereo,
    title: 'Jares b2b Simon Sizer (All Night Long)',
    startsAt: '2026-08-07T23:59:00-04:00',
    category: 'music',
    description:
      "Repéré par Pulso Scout Stories sur @stereomontreal (affiche de programmation complète - seules les dates avec des noms d'artistes lisibles sans ambiguïté ont été importées).",
    ticketingUrl: 'https://www.tixr.com/groups/stereo',
    handle: 'stereomontreal',
    reviewId: 'stereo-montreal:3955749120837249430_348315968'
  },
  {
    venue: VENUES.stereo,
    title: 'Ostrich (All Night Long)',
    startsAt: '2026-08-08T23:59:00-04:00',
    category: 'music',
    description:
      "Repéré par Pulso Scout Stories sur @stereomontreal (affiche de programmation complète - seules les dates avec des noms d'artistes lisibles sans ambiguïté ont été importées).",
    ticketingUrl: 'https://www.tixr.com/groups/stereo',
    handle: 'stereomontreal',
    reviewId: 'stereo-montreal:3955749120837249430_348315968'
  },
  {
    venue: VENUES.stereo,
    title: 'Abel (Resist, All Night Long)',
    startsAt: '2026-08-09T23:59:00-04:00',
    category: 'music',
    description:
      "Repéré par Pulso Scout Stories sur @stereomontreal (affiche de programmation complète - seules les dates avec des noms d'artistes lisibles sans ambiguïté ont été importées).",
    ticketingUrl: 'https://www.tixr.com/groups/stereo',
    handle: 'stereomontreal',
    reviewId: 'stereo-montreal:3955749120837249430_348315968'
  }
];

const rawEvents: RawIngestedEvent[] = events.map((input) => ({
  // Not 'ville-de-montreal-evenements-publics' or 'ticketmaster': this
  // wasn't fetched through either trusted connector, so it must not inherit
  // their KNOWN_SOURCE_AUTHORITY trust label. A distinct id keeps trust at
  // the honest 'to_verify' default for a manually-verified one-off import.
  sourceId: 'pulso-scout-verified-pilot',
  sourceName: input.venue.name,
  sourceUrl: `${instagramEvidence}${input.handle}/`,
  ticketingUrl: input.ticketingUrl,
  observedAt,
  title: input.title,
  description: input.description,
  category: input.category,
  startsAt: input.startsAt,
  venueName: input.venue.name,
  address: input.venue.address,
  point: input.venue.point,
  pointResolution: 'source',
  price: { kind: 'unknown' },
  raw: { scoutReviewId: input.reviewId, handle: input.handle }
}));

const { events: mapped, skipped } = mapAndDeduplicateRawEvents(rawEvents, {
  now: new Date()
});
if (skipped.length > 0 || mapped.length !== rawEvents.length) {
  throw new Error(
    `Verified Stories batch mapping failed: ${mapped.length} mapped, ${skipped.length} skipped: ${JSON.stringify(skipped)}`
  );
}

const verifiedEvents = mapped.map(({ event, additionalSources }, index) => {
  const venueId = events[index]?.venue.id;
  return {
    event: venueId
      ? { ...event, venue: { ...event.venue, id: venueId } }
      : event,
    additionalSources: [
      ...additionalSources,
      {
        name: `Instagram @${events[index]?.handle}`,
        url: `${instagramEvidence}${events[index]?.handle}/`,
        observedAt
      }
    ]
  };
});

const pool = createPool();
try {
  await upsertPublicEvents(pool, verifiedEvents);
  console.log(
    JSON.stringify({
      importedEvents: verifiedEvents.length,
      venues: [...new Set(events.map((event) => event.venue.name))]
    })
  );
} finally {
  await pool.end();
}
