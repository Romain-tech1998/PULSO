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
 * Source of truth: DATA-0002's Instagram Scout pilot watchlist, which
 * already classifies each of these as a real venue with a specific type
 * (not a guess made here) - MTELUS and Club Soda as "Salles de concert et
 * espaces culturels", New City Gas and Newspeak as "Boîtes de nuit, clubs
 * et cabarets". Evenko, the pilot's fifth source, is a promoter with no
 * fixed venue of its own and is intentionally excluded.
 */
const pool = createPool();

const knownVenues: Array<{ name: string; category: VenueCategory }> = [
  { name: 'MTELUS', category: 'concert_hall' },
  { name: 'Club Soda', category: 'concert_hall' },
  { name: 'Newspeak', category: 'nightclub' }
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
