import type { VenueCategory } from '@pulso/domain';

import { createPool } from './client.js';

/**
 * A small, hand-picked set of well-known Montréal dance bars, added as
 * fixed reference points in the Lieux view on explicit user request - a
 * deliberate test of that view working for a real, recognizable venue even
 * before any event connector has ever produced an event there. Unlike
 * seed.ts (fictional fixtures for filter testing), every venue here is real:
 * name, address, and coordinates were each independently confirmed against
 * two sources - a live web search and OpenStreetMap's own `amenity=bar` tag
 * at that exact address via Nominatim - before being included. A fourth
 * candidate (Salon Daomé) was dropped after its address could not be
 * confirmed the same way (conflicting addresses online, no matching OSM tag).
 *
 * No event is inserted for any of these - see the `venues` table's
 * definition, which has never required an event to exist. The Lieux view's
 * /venues endpoint (findVenuesWithoutUpcomingEvents) is what surfaces them.
 */
const pool = createPool();

interface CuratedVenue {
  id: string;
  name: string;
  address: string;
  longitude: number;
  latitude: number;
  category: VenueCategory;
}

const curatedVenues: CuratedVenue[] = [
  {
    id: '00000000-0000-4000-8000-000000000020',
    name: 'Clébard',
    address: '4557, Rue Saint-Denis, Montréal, QC H2J 2L4',
    longitude: -73.5837027,
    latitude: 45.5244711,
    category: 'bar'
  },
  {
    id: '00000000-0000-4000-8000-000000000021',
    name: 'La Rockette',
    address: '4479, Rue Saint-Denis, Montréal, QC H2J 2L2',
    longitude: -73.582482,
    latitude: 45.5239019,
    category: 'bar'
  },
  {
    id: '00000000-0000-4000-8000-000000000022',
    name: 'Pow Pow',
    address: '4459, Rue Saint-Denis, Montréal, QC H2J 2L2',
    longitude: -73.5822324,
    latitude: 45.5238269,
    category: 'bar'
  }
];

try {
  for (const venue of curatedVenues) {
    await pool.query(
      `INSERT INTO venues (id, name, address, location, category)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         address = EXCLUDED.address,
         location = EXCLUDED.location,
         category = EXCLUDED.category`,
      [venue.id, venue.name, venue.address, venue.longitude, venue.latitude, venue.category]
    );
  }
  console.log(`Seeded ${curatedVenues.length} curated venues.`);
} finally {
  await pool.end();
}
