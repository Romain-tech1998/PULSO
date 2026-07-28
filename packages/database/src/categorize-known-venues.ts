import type { VenueCategory } from '@pulso/domain';

import { createPool } from './client.js';

/**
 * Fills in `venues.category` for real venues that already exist through
 * normal ingestion (Ticketmaster events already gave them a name/address)
 * but have never had a type recorded - upsertPublicEvents deliberately
 * never writes this column, so it stays null forever unless something else
 * sets it. Unlike seed-curated-venues.ts, this never inserts a new venue
 * row; it only updates the category on a venue matched by exact name.
 *
 * Source of truth: DATA-0002's Montréal source registry (the tier_1_primary,
 * high-priority slice of it - 81 of 264 rows are "venue"/"nightclub"/"bar"
 * at that tier; the rest are a follow-up), matched against the live venues
 * table by exact name. The registry already classifies each of these with a
 * specific raw category (not a guess made here): everything below tagged
 * "Salles de concert et espaces culturels" maps to concert_hall, "Boîtes de
 * nuit, clubs et cabarets" to nightclub. Evenko, one of the registry's rows,
 * is a promoter with no fixed venue of its own and is intentionally
 * excluded, as are the ~67 tier-1 venue/nightclub/bar rows that don't yet
 * have a matching row in this database (no ingested event has produced them
 * yet, and they haven't been through the same address-confirmation process
 * as seed-curated-venues.ts's hand-picked entries).
 */
const pool = createPool();

interface KnownVenue {
  name: string;
  category: VenueCategory;
  // A real secondary characteristic beyond the main badge (e.g. a dancing
  // bar is category: 'bar' with secondaryCategories: ['nightclub']) - see
  // PublicVenue.secondaryCategories. Never guessed; only added below when a
  // source explicitly described the venue that way.
  secondaryCategories?: VenueCategory[];
}

const knownVenues: KnownVenue[] = [
  { name: 'MTELUS', category: 'concert_hall' },
  { name: 'Club Soda', category: 'concert_hall' },
  { name: 'Newspeak', category: 'nightclub' },
  // New City Gas is deliberately not here - it's already categorized by
  // seed-curated-venues.ts, which is the one that actually inserted it
  // (it had no ingested events yet, unlike everything else in this list).
  { name: 'Centre Bell', category: 'concert_hall' },
  { name: 'Théâtre Beanfield', category: 'concert_hall' },
  { name: "L'Olympia", category: 'concert_hall' },
  { name: 'Foufounes Electriques', category: 'concert_hall' },
  { name: 'La Sala Rossa', category: 'concert_hall' },
  { name: "l'Escogriffe Bar Spectacle", category: 'concert_hall' },
  { name: 'Bar le Ritz PDB', category: 'concert_hall' },
  { name: 'Le Belmont', category: 'concert_hall' },
  { name: 'Le Studio TD', category: 'concert_hall' },
  { name: 'Maison symphonique de Montréal', category: 'concert_hall' },

  // Added from the top of the "no category yet" list by event volume,
  // researched individually (web search where not already well-known) -
  // see PROJECT_INDEX.md for the reasoning behind each one's classification.
  { name: 'CABARET DU CASINO DE MONTREAL', category: 'concert_hall' },
  // Supper-club/cabaret format (multi-course dinner + live music) - a closer
  // fit than concert_hall or theater, which don't capture the dining side.
  { name: 'Le Balcon', category: 'cafe_concert' },
  { name: 'Le Balcon X Terrasse', category: 'cafe_concert' },
  { name: 'Théâtre de Verdure', category: 'theater', secondaryCategories: ['outdoor_festival_site'] },
  {
    name: 'L’Entrepôt',
    category: 'theater',
    secondaryCategories: ['community_space']
  }, // "maison de la culture de Lachine" - municipal performance hall
  { name: 'Centre Culturel Calixa Lavallée', category: 'community_space' },
  { name: 'Bibliothèque Benny', category: 'community_space' },
  { name: 'Bibliothèque Marie-Uguay', category: 'community_space' },
  { name: 'Bibliothèque L’Octogone', category: 'community_space' },
  { name: 'Bibliothèque Saul-Bellow', category: 'community_space' },
  { name: 'Bibliothèque de Mercier', category: 'community_space' },
  { name: 'Brasserie Bernard', category: 'brewery_with_stage' },
  { name: 'Parc des Faubourgs', category: 'outdoor_festival_site' },
  { name: 'Parc Jean-Drapeau', category: 'outdoor_festival_site' },
  { name: 'Marina de Verdun', category: 'outdoor_festival_site' },
  // "Business in the front, party in the back" - a bar with its own
  // nightclub area (7119 Saint-Hubert).
  { name: 'Système', category: 'bar', secondaryCategories: ['nightclub'] },
  { name: 'CENTRE COURT - IGA STADIUM', category: 'other' },
  { name: 'Cinéma Beaubien', category: 'other' },
  { name: 'Théâtre St-Denis', category: 'theater' },
  // A real, currently-operating fire station (Service de sécurité incendie
  // de Montréal) that occasionally hosts civic public events - not a
  // performance venue.
  { name: 'Caserne 34', category: 'community_space' },
  // Seasonal urban beach/public space with a beer garden and live DJ sets.
  {
    name: 'Village au Pied-du-Courant',
    category: 'outdoor_festival_site',
    secondaryCategories: ['bar']
  },
  // Immersive-arts/tech center (dome, exhibitions) that also runs regular
  // electronic-music club nights.
  {
    name: 'Société des arts technologiques',
    category: 'gallery_museum',
    secondaryCategories: ['nightclub']
  },
  { name: 'Fairmount Theatre', category: 'theater' }
];

try {
  for (const venue of knownVenues) {
    const result = await pool.query(
      `UPDATE venues SET category = $1, secondary_categories = $2 WHERE name = $3`,
      [venue.category, venue.secondaryCategories ?? [], venue.name]
    );
    console.log(`${venue.name}: ${result.rowCount} row(s) updated to "${venue.category}".`);
  }
} finally {
  await pool.end();
}
