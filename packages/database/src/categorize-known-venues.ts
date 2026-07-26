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

const knownVenues: Array<{ name: string; category: VenueCategory }> = [
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
  { name: 'Maison symphonique de Montréal', category: 'concert_hall' }
];

try {
  for (const venue of knownVenues) {
    const result = await pool.query(
      `UPDATE venues SET category = $1 WHERE name = $2`,
      [venue.category, venue.name]
    );
    console.log(`${venue.name}: ${result.rowCount} row(s) updated to "${venue.category}".`);
  }
} finally {
  await pool.end();
}
