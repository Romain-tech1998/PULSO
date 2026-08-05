import {
  mapAndDeduplicateRawEvents,
  type RawIngestedEvent
} from '@pulso/ingestion';

import { createPool } from './client.js';
import { upsertPublicEvents } from './upsert-public-events.js';

/**
 * Verified pilot import for a second batch of Pulso Scout Stories
 * candidates from the 2026-08-05 unified pipeline run (80 MVP accounts,
 * 103 stories, 49 AI-flagged with the new strict future-only prompt),
 * human-reviewed by the operator (41 accepted).
 *
 * Four AI-accepted candidates were dropped as confirmed duplicates of
 * events already imported earlier (New City Gas's HOAX, Stereo
 * Montreal's Jares b2b Simon Sizer and Ostrich, The Wiggle Room's Voix De
 * Ville) - verified by querying existing `events` rows before writing
 * this file. A handful more were dropped for being too vague to act on
 * even after acceptance: two "ce soir" (tonight) posts with no event
 * title that were already in the past relative to the posting date, one
 * with no date at all (Soubois), and one purely recurring/generic
 * community activity with a same-day relative date and no distinguishing
 * details (Mellon Brasserie's running club, Hurley's weekly trivia).
 *
 * Relative dates ("ce vendredi", "ce samedi", etc.) were resolved using
 * each Story's real `takenAt` timestamp (the day the operator saw it),
 * not guessed. Venue addresses for StereoBar, Newspeak, Yoko Luna, École
 * Privée, and Bar Le Cocktail were confirmed via live web search (not
 * findable via Nominatim by name alone) - see individual entries below.
 * Bar Le Cocktail specifically could NOT be geocoded in the previous
 * batch (2026-08 New City Gas lineup import) for lack of an address; it
 * now has one and its 4 accepted events are included.
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
  olympia: {
    id: 'd9425bcc-36df-5eec-b3de-6f77decfc1a5',
    name: "L'Olympia",
    address: '1004 Sainte-Catherine Street East',
    point: { longitude: -73.556874, latitude: 45.51701 }
  },
  salaRossa: {
    name: 'La Sala Rossa',
    address: '4848 Boulevard Saint-Laurent, Montréal, QC H2T 1R7',
    point: { longitude: -73.5952, latitude: 45.5245 }
  },
  stereoBar: {
    name: 'StereoBar',
    address: '856 Rue Sainte-Catherine Est, Montréal, QC H2L 2E3',
    point: { longitude: -73.5581426, latitude: 45.5159252 }
  },
  muzique: {
    id: '00000000-0000-4000-8000-000000000045',
    name: 'Muzique',
    address: '3781 Boulevard Saint-Laurent, Montréal, QC H2W 1Y4',
    point: { longitude: -73.5756478, latitude: 45.5154176 }
  },
  bordElle: {
    name: "Bord'elle",
    address: '390 Rue Saint-Jacques, Montréal, QC H2Y 1S1',
    point: { longitude: -73.5597306, latitude: 45.5019151 }
  },
  yokoLuna: {
    name: 'Yoko Luna',
    address: '1234 Rue de la Montagne, Montréal, QC H3G 1Z2',
    point: { longitude: -73.5747545, latitude: 45.4974007 }
  },
  ecolePrivee: {
    name: 'École Privée',
    address: '3500 Boulevard Saint-Laurent, Montréal, QC H2X 2T6',
    point: { longitude: -73.5710165, latitude: 45.512931 }
  },
  newspeak: {
    name: 'Newspeak',
    address: '1403 Rue Sainte-Élisabeth, Montréal, QC H2X 1L2',
    point: { longitude: -73.5621494, latitude: 45.5124604 }
  },
  cabaretMado: {
    id: '00000000-0000-4000-8000-000000000048',
    name: 'Cabaret Mado',
    address: 'Rue Sainte-Catherine Est, Montréal, QC H2L 2G2',
    point: { longitude: -73.5570202, latitude: 45.5177417 }
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
  barDeCourcelle: {
    name: 'Bar de Courcelle',
    address: '4685 Rue Notre-Dame Ouest, Montréal, QC H4C 1S7',
    point: { longitude: -73.5888085, latitude: 45.4729012 }
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
    venue: VENUES.olympia,
    title: 'Travesty',
    startsAt: '2026-09-30T21:00:00-04:00',
    category: 'nightlife',
    description:
      "Repéré par Pulso Scout Stories sur @olympiamontreal. Heure non visible sur la Story : 21h00 utilisé par défaut. Non retrouvé sur Ticketmaster lors d'une recherche web du 2026-08-05 - à reconfirmer plus près de la date.",
    ticketingUrl: 'https://www.ticketmaster.ca',
    handle: 'olympiamontreal',
    reviewId: 'l-olympia:3957061184912581062_2204368061'
  },
  {
    venue: VENUES.salaRossa,
    title: 'Fine Food Market',
    startsAt: '2026-11-21T10:00:00-05:00',
    category: 'other',
    description:
      "Repéré par Pulso Scout Stories sur @lasalarossa. Billets en vente le vendredi précédent à 10h selon la Story ; heure d'ouverture du marché non confirmée, 10h00 utilisé par défaut.",
    handle: 'lasalarossa',
    reviewId: 'la-sala-rossa:3956541332386983918_54871111866'
  },
  {
    venue: VENUES.salaRossa,
    title: 'Daniel Simonsen',
    startsAt: '2026-09-14T20:00:00-04:00',
    category: 'comedy',
    description:
      "Repéré par Pulso Scout Stories sur @lasalarossa. Heure non visible sur la Story : 20h00 utilisé par défaut. Non retrouvé sur les billetteries habituelles lors d'une recherche web du 2026-08-05.",
    ticketingUrl: 'https://www.instagram.com/silk.screaming',
    handle: 'lasalarossa',
    reviewId: 'la-sala-rossa:3956541787539781840_54871111866'
  },
  {
    venue: VENUES.stereoBar,
    title: 'Pablo Bozzi',
    startsAt: '2026-08-07T21:00:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Stories sur @stereobarmtl (confirmé par deux Stories distinctes). Heure non visible : 21h00 utilisé par défaut.',
    ticketingUrl: 'https://www.tixr.com/groups/stereobar',
    handle: 'stereobarmtl',
    reviewId: 'stereobar:3956942208083066500_58720124305'
  },
  {
    venue: VENUES.stereoBar,
    title: 'LLED',
    startsAt: '2026-08-09T22:00:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Stories sur @stereobarmtl. Heure confirmée sur la Story : 22h à 5h.',
    ticketingUrl: 'https://www.tixr.com/groups/stereobar',
    handle: 'stereobarmtl',
    reviewId: 'stereobar:3957125499302056118_58720124305'
  },
  {
    venue: VENUES.stereoBar,
    title: 'Soirée StereoBar (@JEANLOUISLABRECQUE)',
    startsAt: '2026-08-08T22:00:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Stories sur @stereobarmtl. Date déduite de "SATURDAY" par rapport à la date de la Story (2026-08-05). Heure confirmée : 22h à 3h.',
    ticketingUrl: 'https://www.instagram.com/JEANLOUISLABRECQUE',
    handle: 'stereobarmtl',
    reviewId: 'stereobar:3957125871638830212_58720124305'
  },
  {
    venue: VENUES.muzique,
    title: 'Dulce x Muzique',
    startsAt: '2026-08-08T22:30:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Stories sur @muziquemontreal. Heure confirmée sur la Story : 22h30. Consommations offertes aux dames avant 23h selon la Story.',
    handle: 'muziquemontreal',
    reviewId: 'muzique:3956713225038505947_297846689'
  },
  {
    venue: VENUES.bordElle,
    title: 'Soirée du vendredi',
    startsAt: '2026-08-07T21:00:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Stories sur @bordellemtl. Aucun titre d\'événement visible sur la Story au-delà de "Vendredi" ; heure non visible, 21h00 utilisé par défaut.',
    handle: 'bordellemtl',
    reviewId: 'bord-elle:3956516875836392747_3468292442'
  },
  {
    venue: VENUES.yokoLuna,
    title: 'Soirées Yoko Luna',
    startsAt: '2026-08-07T21:00:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Stories sur @yokolunamtl (deux Stories, 7 au 9 août confirmé). Heure non visible : 21h00 utilisé par défaut.',
    ticketingUrl: 'https://yokoluna.com',
    handle: 'yokolunamtl',
    reviewId: 'yoko-luna:3956539208709944916_45053274518'
  },
  {
    venue: VENUES.ecolePrivee,
    title: 'ROWJAY Showcase',
    startsAt: '2026-08-09T23:00:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Stories sur @ecoleprivee (confirmé par deux Stories distinctes). Heure confirmée : 23h à 3h.',
    ticketingUrl: 'https://www.instagram.com/rapta.events',
    handle: 'ecoleprivee',
    reviewId: 'ecole-privee:3956600728890563070_2082867086'
  },
  {
    venue: VENUES.ecolePrivee,
    title: 'Throwback Edition',
    startsAt: '2026-08-06T23:00:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Stories sur @ecoleprivee. Heure confirmée : 23h à 3h.',
    ticketingUrl: 'https://www.instagram.com/rapta.events',
    handle: 'ecoleprivee',
    reviewId: 'ecole-privee:3957182331232633944_2082867086'
  },
  {
    venue: VENUES.newspeak,
    title: 'Oliver Smith',
    startsAt: '2026-08-07T22:00:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Stories sur @newspeakmtl (confirmé par deux Stories : "ce vendredi" déduit + date explicite "7 août 2026"). Heure confirmée : 22h à 3h.',
    ticketingUrl: 'https://www.instagram.com/oliversmith',
    handle: 'newspeakmtl',
    reviewId: 'newspeak:3957188276901211364_1726816505'
  },
  {
    venue: VENUES.newspeak,
    title: 'Cassian (complet / sold out)',
    startsAt: '2026-08-08T21:00:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Stories sur @newspeakmtl. Date déduite de "ce samedi" par rapport à la date de la Story (2026-08-05). Complet - liste d\'attente uniquement selon la Story. Heure non visible : 21h00 utilisé par défaut.',
    handle: 'newspeakmtl',
    reviewId: 'newspeak:3957188831287523698_1726816505'
  },
  {
    venue: VENUES.newspeak,
    title: "L'après îleSoniq ft. HAMRO",
    startsAt: '2026-08-08T23:00:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Stories sur @newspeakmtl. Heure confirmée : 23h à 5h.',
    ticketingUrl: 'https://www.instagram.com/djhamro',
    handle: 'newspeakmtl',
    reviewId: 'newspeak:3957188883313706942_1726816505'
  },
  {
    venue: VENUES.newspeak,
    title: 'HAMRO',
    startsAt: '2026-08-09T22:30:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Stories sur @newspeakmtl (confirmé par deux Stories : "ce dimanche" déduit + date explicite "9 août 2026"). Heure confirmée : 22h30 à 3h.',
    ticketingUrl: 'https://www.instagram.com/djhamro',
    handle: 'newspeakmtl',
    reviewId: 'newspeak:3957189497603086806_1726816505'
  },
  {
    venue: VENUES.cabaretMado,
    title: 'Best of The Black Eyed Peas (tribute)',
    startsAt: '2026-08-20T21:00:00-04:00',
    category: 'show',
    description:
      'Repéré par Pulso Scout Stories sur @cabaretmado. Spectacle hommage/tribute, pas les artistes originaux. Heure non visible : 21h00 utilisé par défaut.',
    ticketingUrl: 'https://www.instagram.com/cabaretmado',
    handle: 'cabaretmado',
    reviewId: 'cabaret-mado:3957095493888954116_4249676532'
  },
  {
    venue: VENUES.cabaretMado,
    title: 'Kesha (tribute)',
    startsAt: '2026-08-12T21:00:00-04:00',
    category: 'show',
    description:
      "Repéré par Pulso Scout Stories sur @cabaretmado. Spectacle hommage/tribute, pas l'artiste originale. Heure non visible : 21h00 utilisé par défaut.",
    ticketingUrl: 'https://www.lepointdevente.com/lieux/cabaretmado',
    handle: 'cabaretmado',
    reviewId: 'cabaret-mado:3957179996036682557_4249676532'
  },
  {
    venue: VENUES.wiggleRoom,
    title: 'The Silver Room',
    startsAt: '2026-08-23T21:00:00-04:00',
    category: 'show',
    description:
      'Repéré par Pulso Scout Stories sur @wiggleroommtl. Heure non visible : 21h00 utilisé par défaut.',
    ticketingUrl: 'https://www.instagram.com/presentedbypm',
    handle: 'wiggleroommtl',
    reviewId: 'le-wiggle-room:3956484329563601400_1106502105'
  },
  {
    venue: VENUES.wiggleRoom,
    title: 'Britney Burlesque',
    startsAt: '2026-08-06T20:00:00-04:00',
    category: 'show',
    description:
      'Repéré par Pulso Scout Stories sur @wiggleroommtl. Portes 19h00, spectacle 20h00 confirmé sur la Story.',
    ticketingUrl: 'https://www.wiggleroom.ca',
    handle: 'wiggleroommtl',
    reviewId: 'le-wiggle-room:3956484539136175340_1106502105'
  },
  {
    venue: VENUES.wiggleRoom,
    title: 'Rat Pack Burlesque Tribute',
    startsAt: '2026-08-07T20:00:00-04:00',
    category: 'show',
    description:
      'Repéré par Pulso Scout Stories sur @wiggleroommtl. Portes 19h00, spectacle 20h00 confirmé sur la Story.',
    ticketingUrl: 'https://www.instagram.com/wiggleroommtl',
    handle: 'wiggleroommtl',
    reviewId: 'le-wiggle-room:3957116875779800720_1106502105'
  },
  {
    venue: VENUES.barLeCocktail,
    title: "Vendredi c'est exquis",
    startsAt: '2026-08-07T21:00:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Stories sur @barlecocktail. Heure confirmée sur la Story : 21h00. Adresse confirmée par recherche web du 2026-08-05 (introuvable via Nominatim seul).',
    ticketingUrl: 'https://www.instagram.com/barlecocktail',
    handle: 'barlecocktail',
    reviewId: 'bar-le-cocktail:3957160078061613702_12587339793'
  },
  {
    venue: VENUES.barLeCocktail,
    title: 'Soirée Sans Pantalons / No Pants Party',
    startsAt: '2026-08-07T23:59:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Stories sur @barlecocktail. Heure confirmée sur la Story : 23h59.',
    ticketingUrl: 'https://www.instagram.com/barlecocktail',
    handle: 'barlecocktail',
    reviewId: 'bar-le-cocktail:3957160137453021252_12587339793'
  },
  {
    venue: VENUES.barLeCocktail,
    title: 'Dimanche en Délire - Post Parade',
    startsAt: '2026-08-09T17:00:00-04:00',
    category: 'other',
    description:
      'Repéré par Pulso Scout Stories sur @barlecocktail. Heure confirmée : 17h. Entrée gratuite selon la Story.',
    ticketingUrl: 'https://www.instagram.com/umagahd',
    handle: 'barlecocktail',
    reviewId: 'bar-le-cocktail:3957160237545823928_12587339793'
  },
  {
    venue: VENUES.barLeCocktail,
    title: 'Lundi Place à la Relève',
    startsAt: '2026-08-10T19:00:00-04:00',
    category: 'nightlife',
    description:
      'Repéré par Pulso Scout Stories sur @barlecocktail. Heure confirmée : 19h.',
    ticketingUrl: 'https://www.instagram.com/sallyd_drag',
    handle: 'barlecocktail',
    reviewId: 'bar-le-cocktail:3957160336472743963_12587339793'
  },
  {
    venue: VENUES.barDeCourcelle,
    title: 'Trivia Marvel',
    startsAt: '2026-08-10T21:00:00-04:00',
    category: 'other',
    description:
      'Repéré par Pulso Scout Stories sur @bardecourcelle. Série de soirées trivia à thèmes ; heure non visible, 21h00 utilisé par défaut.',
    ticketingUrl: 'https://www.instagram.com/bardecourcelle',
    handle: 'bardecourcelle',
    reviewId: 'bar-de-courcelle:3956532344236479779_254064187'
  },
  {
    venue: VENUES.barDeCourcelle,
    title: 'Mike McKenna Jr.',
    startsAt: '2026-08-22T21:00:00-04:00',
    category: 'music',
    description:
      "Repéré par Pulso Scout Stories sur @bardecourcelle. Date corrigée par l'opérateur (8/22, la Story affichait 08/20 par erreur). Heure non visible : 21h00 utilisé par défaut.",
    handle: 'bardecourcelle',
    reviewId: 'bar-de-courcelle:3957193560139192879_254064187'
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
    `Verified Stories batch 2 mapping failed: ${mapped.length} mapped, ${skipped.length} skipped: ${JSON.stringify(skipped)}`
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
