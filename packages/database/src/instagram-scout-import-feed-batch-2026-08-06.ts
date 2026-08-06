import {
  mapAndDeduplicateRawEvents,
  type RawIngestedEvent
} from '@pulso/ingestion';

import { createPool } from './client.js';
import { upsertPublicEvents } from './upsert-public-events.js';

/**
 * Verified pilot import for Pulso Scout Feed candidates from the
 * 2026-08-06 Feed-only test run (80 MVP accounts, 404 feed items, 47
 * AI-flagged as likely future events). The operator's decisions file for
 * this batch had an identical reviewedAt timestamp across all 48 entries
 * and templated notes - confirmed with the operator this was a bulk
 * accept, not an individual review, so every candidate was independently
 * re-verified here against the real report data (dates, venues,
 * `takenAt`) and the existing `events` table before import, same
 * discipline as every prior batch.
 *
 * Of 47 accepted candidates, only 14 distinct events survive:
 * - 8 were confirmed duplicates of events already in the database
 *   (5 at L'Olympia already captured by the free Ticketmaster connector;
 *   Stereo Montreal's Jares b2b Simon Sizer and Ostrich, StereoBar's
 *   Pablo Bozzi, École Privée's ROWJAY Showcase, and Newspeak's Cassian
 *   already imported in earlier verified batches).
 * - ~20 had dates already in the past relative to 2026-08-06 (the vision
 *   model correctly extracts the date printed on the image, but several
 *   Story/Feed posts advertised events from before the account posted
 *   about them again later, or the date sticker was ambiguous and only
 *   resolvable as a past date - e.g. Salon Daomé's July dates, Foufounes'
 *   July dates, Ausgang Plaza's July 24 match).
 * - ~5 had no legible date, venue, or title at all (Just for Laughs x2,
 *   "Dead to Rights Tour 2026", Sala Rossa's World Cup final post,
 *   Bar de Courcelle's recurring weekly trivia).
 *
 * Deep Purple's date (Place Bell only showed "17" with no month) and
 * Mellon Brasserie's real address were confirmed via live web search.
 */

const observedAt = new Date().toISOString();
const instagramEvidence = 'https://www.instagram.com/';

interface VenueRef {
  id?: string;
  name: string;
  address: string;
  point: { longitude: number; latitude: number };
}

const VENUES = {
  placeBell: {
    id: '00000000-0000-4000-8000-000000000059',
    name: 'Place Bell',
    address: '1950 Rue Claude-Gagné, Laval, QC H7N 0E4',
    point: { longitude: -73.7218, latitude: 45.5558 }
  },
  sat: {
    id: '00000000-0000-4000-8000-000000000027',
    name: 'Société des arts technologiques (SAT)',
    address: '1201 Boulevard Saint-Laurent, Montréal, QC H2X 2S6',
    point: { longitude: -73.562583, latitude: 45.5096562 }
  },
  cabaretLionDor: {
    id: '00000000-0000-4000-8000-000000000041',
    name: "Cabaret Lion d'Or",
    address: '1676 Rue Ontario Est, Montréal, QC H2L 1S7',
    point: { longitude: -73.5575456, latitude: 45.5242415 }
  },
  newCityGas: {
    id: '00000000-0000-4000-8000-000000000023',
    name: 'New City Gas',
    address: '950, Rue Ottawa, Montréal, QC H3C 1S4',
    point: { longitude: -73.5575195, latitude: 45.4951304 }
  },
  newspeak: {
    name: 'Newspeak',
    address: '1403 Rue Sainte-Élisabeth, Montréal, QC H2X 1L2',
    point: { longitude: -73.5621494, latitude: 45.5124604 }
  },
  salonDaome: {
    id: '87263e1d-9282-5097-947f-3418dad1c678',
    name: 'Salon Daomé',
    address: '4465 St Laurent Blvd, Montreal, Quebec H2W 1Z8',
    point: { longitude: -73.585827, latitude: 45.5200679 }
  },
  wiggleRoom: {
    name: 'The Wiggle Room',
    address: '3874 Boulevard Saint-Laurent, Montréal, QC H2W 1Y4',
    point: { longitude: -73.5777882, latitude: 45.5160833 }
  },
  barLeCocktail: {
    name: 'Bar Le Cocktail',
    address: '1669 Rue Sainte-Catherine Est, Montréal, QC H2L 2H7',
    point: { longitude: -73.5530443, latitude: 45.5222297 }
  },
  mellonBrasserie: {
    name: 'Mellön Brasserie',
    address: '7141 Rue Saint-André, Montréal, QC H2S 2M7',
    point: { longitude: -73.6124905, latitude: 45.5409927 }
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
    venue: VENUES.placeBell,
    title: 'Deep Purple (avec Kansas et Jefferson Starship)',
    startsAt: '2026-08-17T18:45:00-04:00',
    category: 'music',
    description:
      'Repéré par Pulso Scout Feed sur @placebell. La Story ne montrait que "17" comme date ; jour et heure confirmés par recherche web (evenko.ca) : portes 17h45, spectacle 18h45.',
    ticketingUrl: 'https://evenko.ca/en/events/place-bell/deep-purple',
    handle: 'placebell',
    reviewId: 'feed:place-bell:18137067697583385'
  },
  {
    venue: VENUES.sat,
    title: 'All Night',
    startsAt: '2026-09-04T22:00:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Feed sur @sat_montreal. Heure confirmée sur le post : 22h à 5h.',
    handle: 'sat_montreal',
    reviewId: 'feed:societe-des-arts-technologiques-sat:18140074780560238'
  },
  {
    venue: VENUES.sat,
    title: "J'aime la SAT",
    startsAt: '2026-10-01T18:00:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Feed sur @sat_montreal. Heure confirmée sur le post : 18h à minuit.',
    handle: 'sat_montreal',
    reviewId: 'feed:societe-des-arts-technologiques-sat:18544032184077150'
  },
  {
    venue: VENUES.cabaretLionDor,
    title: 'MTL Cabaret',
    startsAt: '2026-08-08T18:00:00-04:00',
    category: 'show',
    description:
      'Repéré par Pulso Scout Feed sur @cabaretliondor. Série de trois soirées (8, 21, 28 août), deux représentations chaque soir (18h et 21h) selon le post.',
    handle: 'cabaretliondor',
    reviewId: 'feed:cabaret-lion-d-or:18109915879979319'
  },
  {
    venue: VENUES.cabaretLionDor,
    title: 'MTL Cabaret',
    startsAt: '2026-08-21T18:00:00-04:00',
    category: 'show',
    description:
      'Repéré par Pulso Scout Feed sur @cabaretliondor. Série de trois soirées (8, 21, 28 août), deux représentations chaque soir (18h et 21h) selon le post.',
    handle: 'cabaretliondor',
    reviewId: 'feed:cabaret-lion-d-or:18109915879979319-2'
  },
  {
    venue: VENUES.cabaretLionDor,
    title: 'MTL Cabaret',
    startsAt: '2026-08-28T18:00:00-04:00',
    category: 'show',
    description:
      'Repéré par Pulso Scout Feed sur @cabaretliondor. Série de trois soirées (8, 21, 28 août), deux représentations chaque soir (18h et 21h) selon le post.',
    handle: 'cabaretliondor',
    reviewId: 'feed:cabaret-lion-d-or:18109915879979319-3'
  },
  {
    venue: VENUES.newCityGas,
    title: 'R3HAB',
    startsAt: '2026-09-26T22:00:00-04:00',
    category: 'music',
    description:
      'Repéré par Pulso Scout Feed sur @newcitygas. Heure non visible sur le post : 22h00 utilisé par défaut.',
    handle: 'newcitygas',
    reviewId: 'feed:new-city-gas:18109473910797503'
  },
  {
    venue: VENUES.newspeak,
    title: 'Cult Member',
    startsAt: '2026-10-02T22:00:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Feed sur @newspeakmtl. Date au format MM/JJ/AAAA sur le post (10/02/2026). Heure non visible : 22h00 utilisé par défaut.',
    handle: 'newspeakmtl',
    reviewId: 'feed:newspeak:18338019472281217'
  },
  {
    venue: VENUES.newspeak,
    title: 'Ya Ego',
    startsAt: '2026-11-14T22:00:00-05:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Feed sur @newspeakmtl. Date au format MM/JJ/AAAA sur le post (11/14/2026). Heure non visible : 22h00 utilisé par défaut.',
    handle: 'newspeakmtl',
    reviewId: 'feed:newspeak:18083501780658979'
  },
  {
    venue: VENUES.newspeak,
    title: 'Bushbaby',
    startsAt: '2026-09-04T22:00:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Feed sur @newspeakmtl. Date au format MM/JJ/AAAA sur le post (09/04/2026). Heure non visible : 22h00 utilisé par défaut.',
    handle: 'newspeakmtl',
    reviewId: 'feed:newspeak:18095201918564566'
  },
  {
    venue: VENUES.newspeak,
    title: 'Whipped Cream',
    startsAt: '2026-10-23T22:00:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Feed sur @newspeakmtl. Date au format MM/JJ/AAAA sur le post (10/23/2026). Heure non visible : 22h00 utilisé par défaut.',
    handle: 'newspeakmtl',
    reviewId: 'feed:newspeak:18129238402629213'
  },
  {
    venue: VENUES.newspeak,
    title: 'Linska',
    startsAt: '2026-09-19T22:00:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Feed sur @newspeakmtl. Date au format MM/JJ/AAAA sur le post (09/19/2026). Heure non visible : 22h00 utilisé par défaut.',
    handle: 'newspeakmtl',
    reviewId: 'feed:newspeak:18130343569528852'
  },
  {
    venue: VENUES.salonDaome,
    title: 'Garage à Trois',
    startsAt: '2026-08-07T22:30:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Feed sur @lesalondaome. Heure confirmée sur le post : 22h30 à 6h.',
    handle: 'lesalondaome',
    reviewId: 'feed:salon-daome:18063121349739101'
  },
  {
    venue: VENUES.wiggleRoom,
    title: 'Loud and Proud',
    startsAt: '2026-08-08T20:00:00-04:00',
    category: 'show',
    description:
      'Repéré par Pulso Scout Feed sur @wiggleroommtl. Portes 19h00, spectacle 20h00 confirmé sur le post.',
    handle: 'wiggleroommtl',
    reviewId: 'feed:le-wiggle-room:17925201369161317'
  },
  {
    venue: VENUES.barLeCocktail,
    title: 'Samedi mon Riki!',
    startsAt: '2026-08-08T19:00:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Feed sur @barlecocktail. Deux représentations (19h et 21h) selon le post. Entrée gratuite.',
    handle: 'barlecocktail',
    reviewId: 'feed:bar-le-cocktail:18002776208778755'
  },
  {
    venue: VENUES.mellonBrasserie,
    title: 'Donne-moi ton bon vieux funk',
    startsAt: '2026-08-15T12:00:00-04:00',
    category: 'music',
    description:
      'Repéré par Pulso Scout Feed sur @mellonbrasserie. Le post indique "midi à tard" ; 12h00 utilisé comme heure de début. Adresse confirmée par recherche web (introuvable via Nominatim seul).',
    handle: 'mellonbrasserie',
    reviewId: 'feed:mellon-brasserie:17924792292163587'
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
    `Verified Feed batch mapping failed: ${mapped.length} mapped, ${skipped.length} skipped: ${JSON.stringify(skipped)}`
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
