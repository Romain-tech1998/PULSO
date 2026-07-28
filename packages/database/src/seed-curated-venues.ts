import type { VenueCategory } from '@pulso/domain';

import { createPool } from './client.js';

/**
 * Hand-picked, real Montréal venues with no ingested events yet, added as
 * fixed reference points in the Lieux view. No event is inserted for any of
 * these - see the `venues` table's definition, which has never required an
 * event to exist. The Lieux view's /venues endpoint
 * (findVenuesWithoutUpcomingEvents) is what surfaces them.
 *
 * Two batches, two verification methods, both real either way:
 *
 * 1. Clébard, La Rockette, Pow Pow, New City Gas - each confirmed against
 *    two independent sources (a live web search plus OpenStreetMap's own
 *    name tag at the exact address via Nominatim) before being included.
 *    A fifth candidate, Salon Daomé, was dropped after its address could
 *    not be confirmed the same way (conflicting addresses online, no
 *    matching OSM tag).
 *
 * 2. The rest - matched against DATA-0002's Montréal source registry
 *    (specifically its tier_1_primary, high-priority "venue"/"nightclub"
 *    slice: 81 of 264 registry rows) that had no existing row in this
 *    database. Each was geocoded by name via Nominatim; only names OSM
 *    independently confirmed with its own matching name tag at a real,
 *    specifically-tagged place (not a generic address point) were kept.
 *    Category comes from OSM's own tag where it maps directly to this
 *    project's taxonomy (amenity=theatre -> theater, tourism=gallery ->
 *    gallery_museum, etc.), except where the registry's own type is
 *    "nightclub" - that classification is trusted over OSM's often-generic
 *    bar/pub/restaurant tagging for the bar/nightclub distinction
 *    specifically. Several likely real registry entries were excluded for
 *    a bad or ambiguous OSM match: "Mila" matched a daycare, "La Shop" an
 *    electronics store,
 *    "Club 649" a street name, and "Pangea" only a plain restaurant tag
 *    with no bar/nightclub signal either way. The remaining ~32 tier-1
 *    venue/nightclub/bar registry rows with no reliable OSM match at all,
 *    plus the ~90 lower-priority ones and the ~93 non-fixed-location rows
 *    (promoters, festivals, media curators), are left for a future pass.
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
  },
  {
    // From DATA-0002's Instagram Scout pilot watchlist (source id
    // "new-city-gas", handle @newcitygas) - a real nightclub with no
    // ingested events yet. Address confirmed both via web search and
    // OpenStreetMap's own building=yes "New City Gas" name tag at the
    // exact address. The pilot's other 4 sources are either already
    // real ingested venues (see categorize-known-venues.ts) or, for
    // Evenko, a promoter with no fixed venue of its own - not added here.
    id: '00000000-0000-4000-8000-000000000023',
    name: 'New City Gas',
    address: '950, Rue Ottawa, Montréal, QC H3C 1S4',
    longitude: -73.5575195,
    latitude: 45.4951304,
    category: 'nightclub'
  },
  {
    id: '00000000-0000-4000-8000-000000000024',
    name: 'Théâtre Fairmount',
    address: '5240 Avenue du Parc, Montréal, QC H2V 4G7',
    longitude: -73.5985094,
    latitude: 45.5204765,
    category: 'theater'
  },
  {
    id: '00000000-0000-4000-8000-000000000025',
    name: 'Rialto Theatre',
    address: '5723 Avenue du Parc, Montréal, QC H2V 4H2',
    longitude: -73.6049468,
    latitude: 45.5235938,
    category: 'theater'
  },
  {
    id: '00000000-0000-4000-8000-000000000026',
    name: 'Le National',
    address: 'Rue Sainte-Catherine Est, Montréal, QC H2L 2H7',
    longitude: -73.5558406,
    latitude: 45.5186229,
    category: 'theater'
  },
  {
    id: '00000000-0000-4000-8000-000000000027',
    name: 'Société des arts technologiques (SAT)',
    address: '1201 Boulevard Saint-Laurent, Montréal, QC H2X 2S6',
    longitude: -73.562583,
    latitude: 45.5096562,
    category: 'theater'
  },
  {
    id: '00000000-0000-4000-8000-000000000028',
    name: 'Usine C',
    address: '1345 Avenue Lalonde, Montréal, QC H2L 5A9',
    longitude: -73.5607171,
    latitude: 45.52202,
    category: 'theater'
  },
  {
    id: '00000000-0000-4000-8000-000000000029',
    name: 'Monument-National',
    address: 'Boulevard Saint-Laurent, Montréal, QC H2X 2S8',
    longitude: -73.5623773,
    latitude: 45.5090115,
    category: 'theater'
  },
  {
    id: '00000000-0000-4000-8000-000000000030',
    name: 'Bain Mathieu',
    address: '2915 Rue Ontario Est, Montréal, QC H2K 1X7',
    longitude: -73.5499132,
    latitude: 45.5374686,
    category: 'theater'
  },
  {
    id: '00000000-0000-4000-8000-000000000031',
    name: "Théâtre de Quat'Sous",
    address: '100 Avenue des Pins, Montréal, QC H2W 1N7',
    longitude: -73.5740437,
    latitude: 45.5160175,
    category: 'theater'
  },
  {
    id: '00000000-0000-4000-8000-000000000032',
    name: 'Théâtre La Licorne',
    address: 'Avenue Papineau, Montréal, QC H1H 1V4',
    longitude: -73.5755649,
    latitude: 45.5335374,
    category: 'theater'
  },
  {
    id: '00000000-0000-4000-8000-000000000033',
    name: 'Théâtre Outremont',
    address: '1248 Avenue Bernard, Montréal, QC H2V 1V6',
    longitude: -73.6085967,
    latitude: 45.5199369,
    category: 'theater'
  },
  {
    id: '00000000-0000-4000-8000-000000000034',
    name: 'Place des Arts',
    address: '175 Rue Sainte-Catherine Ouest, Montréal, QC H5B 1E5',
    longitude: -73.5665434,
    latitude: 45.5084047,
    category: 'concert_hall'
  },
  {
    id: '00000000-0000-4000-8000-000000000035',
    name: 'Centre Phi',
    address: '407 Rue Saint-Pierre, Montréal, QC H2Y 2M3',
    longitude: -73.5563151,
    latitude: 45.5013472,
    category: 'concert_hall'
  },
  {
    id: '00000000-0000-4000-8000-000000000036',
    name: 'Espace St-Denis',
    address: '1594 Rue Saint-Denis, Montréal, QC H2X 3K4',
    longitude: -73.5626594,
    latitude: 45.5145716,
    category: 'concert_hall'
  },
  {
    id: '00000000-0000-4000-8000-000000000037',
    name: 'Le Ministère',
    address: '4521 Boulevard Saint-Laurent, Montréal, QC H2T 1R2',
    longitude: -73.5868242,
    latitude: 45.5204539,
    category: 'community_space'
  },
  {
    id: '00000000-0000-4000-8000-000000000038',
    name: 'Le Livart',
    address: '3980 Rue Saint-Denis, Montréal, QC H2W 2L3',
    longitude: -73.5752457,
    latitude: 45.5202621,
    category: 'gallery_museum'
  },
  {
    id: '00000000-0000-4000-8000-000000000039',
    name: 'Casa del Popolo',
    address: '4873 Boulevard Saint-Laurent, Montréal, QC H2T 1R5',
    longitude: -73.5905643,
    latitude: 45.5221705,
    category: 'bar'
  },
  {
    id: '00000000-0000-4000-8000-000000000040',
    name: 'Quai des Brumes',
    address: '4481 Rue Saint-Denis, Montréal, QC H2J 2L2',
    longitude: -73.5825133,
    latitude: 45.5239167,
    category: 'bar'
  },
  {
    id: '00000000-0000-4000-8000-000000000041',
    name: "Cabaret Lion d'Or",
    address: '1676 Rue Ontario Est, Montréal, QC H2L 1S7',
    longitude: -73.5575456,
    latitude: 45.5242415,
    category: 'bar'
  },
  {
    id: '00000000-0000-4000-8000-000000000042',
    name: 'Stereo Montreal',
    address: '858 Rue Sainte-Catherine Est, Montréal, QC H2L 2E2',
    longitude: -73.5581204,
    latitude: 45.5159988,
    category: 'nightclub'
  },
  {
    id: '00000000-0000-4000-8000-000000000043',
    name: 'Club Pelicano',
    address: '1076 Rue De Bleury, Montréal, QC H2Z 1N4',
    longitude: -73.5634203,
    latitude: 45.5044851,
    category: 'nightclub'
  },
  {
    id: '00000000-0000-4000-8000-000000000044',
    name: 'Le Rouge Bar',
    address: '7 Rue Prince-Arthur Ouest, Montréal, QC H2X 1S4',
    longitude: -73.5728944,
    latitude: 45.5136956,
    category: 'nightclub'
  },
  {
    id: '00000000-0000-4000-8000-000000000045',
    name: 'Muzique',
    address: '3781 Boulevard Saint-Laurent, Montréal, QC H2W 1Y4',
    longitude: -73.5756478,
    latitude: 45.5154176,
    category: 'nightclub'
  },
  {
    id: '00000000-0000-4000-8000-000000000046',
    name: 'Flyjin',
    address: '417 Rue Saint-Pierre, Montréal, QC H2Y 2M4',
    longitude: -73.5566591,
    latitude: 45.5015884,
    category: 'nightclub'
  },
  {
    id: '00000000-0000-4000-8000-000000000047',
    name: 'Club Unity',
    address: '1171 Rue Sainte-Catherine Est, Montréal, QC H2L 3G8',
    longitude: -73.5564576,
    latitude: 45.5183456,
    category: 'nightclub'
  },
  {
    id: '00000000-0000-4000-8000-000000000048',
    name: 'Cabaret Mado',
    address: 'Rue Sainte-Catherine Est, Montréal, QC H2L 2G2',
    longitude: -73.5570202,
    latitude: 45.5177417,
    category: 'nightclub'
  },
  {
    id: '00000000-0000-4000-8000-000000000049',
    name: 'Complexe Sky',
    address: '1488 Rue Sainte-Catherine Est, Montréal, QC H2L 2H7',
    longitude: -73.5536799,
    latitude: 45.5209934,
    category: 'nightclub'
  },
  {
    id: '00000000-0000-4000-8000-000000000050',
    name: 'Le Stud',
    address: '1812 Rue Sainte-Catherine Est, Montréal, QC H2K 2H3',
    longitude: -73.5519554,
    latitude: 45.5225826,
    category: 'nightclub'
  },
  {
    id: '00000000-0000-4000-8000-000000000051',
    name: 'Salsathèque',
    address: '1220 Rue Peel, Montréal, QC H3A 1T5',
    longitude: -73.572379,
    latitude: 45.49954,
    category: 'nightclub'
  },
  {
    id: '00000000-0000-4000-8000-000000000052',
    name: 'Sans Soleil',
    address: '1002 Rue Saint-Urbain, Montréal, QC H2Z 1A1',
    longitude: -73.5605424,
    latitude: 45.5065435,
    category: 'nightclub'
  },
  {
    id: '00000000-0000-4000-8000-000000000053',
    name: 'Velvet Speakeasy',
    address: '426 Rue Saint-Gabriel, Montréal, QC H2Y 1G2',
    longitude: -73.5539371,
    latitude: 45.5063757,
    category: 'nightclub'
  },
  {
    id: '00000000-0000-4000-8000-000000000054',
    name: 'Aigle Noir',
    address: '1315 Rue Sainte-Catherine Est, Montréal, QC H2L 2H7',
    longitude: -73.5553017,
    latitude: 45.5196273,
    category: 'nightclub'
  },
  {
    id: '00000000-0000-4000-8000-000000000055',
    name: 'Hang Bar',
    address: 'Rue Notre-Dame Ouest, Montréal, QC H3C 3X6',
    longitude: -73.5599153,
    latitude: 45.5002252,
    category: 'nightclub'
  },
  {
    id: '00000000-0000-4000-8000-000000000056',
    name: "Bord'Elle",
    address: '390 Rue Saint-Jacques, Montréal, QC H2Y 1S1',
    longitude: -73.5597306,
    latitude: 45.5019151,
    category: 'nightclub'
  },
  {
    id: '00000000-0000-4000-8000-000000000057',
    name: 'Apt. 200',
    address: '3643 Boulevard Saint-Laurent, Montréal, QC H2X 2V5',
    longitude: -73.573248,
    latitude: 45.5146237,
    category: 'nightclub'
  },
  {
    id: '00000000-0000-4000-8000-000000000058',
    name: 'Stock Bar',
    address: 'Rue Sainte-Catherine Est, Montréal, QC H2L 2H7',
    longitude: -73.5565931,
    latitude: 45.5182366,
    category: 'nightclub'
  },
  {
    // Added after a dedicated verification rather than the earlier ambiguous
    // name-only lookup: Place Bell's own site confirms the civic address,
    // while the mapped arena entity independently provides the coordinate.
    id: '00000000-0000-4000-8000-000000000059',
    name: 'Place Bell',
    address: '1950 Rue Claude-Gagné, Laval, QC H7N 0E4',
    longitude: -73.7218,
    latitude: 45.5558,
    category: 'concert_hall'
  },
  {
    // The official venue site confirms this civic address, while the named
    // OpenStreetMap bar entity independently supplies the map coordinate.
    id: '00000000-0000-4000-8000-000000000060',
    name: 'Rouge Gorge',
    address: '1234 Avenue du Mont-Royal Est, Montréal, QC H2J 1Y1',
    longitude: -73.5779547,
    latitude: 45.5291292,
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
      [
        venue.id,
        venue.name,
        venue.address,
        venue.longitude,
        venue.latitude,
        venue.category
      ]
    );
  }
  console.log(`Seeded ${curatedVenues.length} curated venues.`);
} finally {
  await pool.end();
}
