import type { VenueCategory } from '@pulso/domain';

import { createPool } from './client.js';

/**
 * Fills in a real `venues.name` for rows that currently have only a bare
 * street/civic address as their name - the reverse-geocoder found no named
 * POI at ingestion time, so `to-public-event.ts` fell back to the address
 * string itself. Per the user's explicit "vraies pages de lieu" request,
 * each row below was individually confirmed to correspond to a real,
 * specific place - never guessed from the address alone. Two kinds of
 * evidence were used, both checked against a live web search before being
 * added here:
 *
 * 1. The venue's own ingested event titles/descriptions directly name the
 *    real place (e.g. "à la bibliothèque Père-Ambroise", "au parc LaSalle")
 *    - the strongest signal, since it's the original source describing
 *    where its own event happens.
 * 2. The exact civic address (matched digit-for-digit against the address
 *    column) is published by Ville de Montréal or another primary source as
 *    the address of one specific named place.
 *
 * A few of these end up sharing a name with an already-categorized venue at
 * a different set of coordinates (e.g. "Parc Lucie-Bruneau", "Le Quai
 * 5160") - the address-fallback row and the already-named row are almost
 * certainly the same real place with two slightly different geocodes from
 * separate ingestion passes, the same root cause documented in
 * merge-duplicate-venues.ts, just not close enough to share an *identical*
 * point for that script's exact-location grouping to catch. Renaming here
 * is intentionally left to also produce these same-name duplicates rather
 * than silently dropping one side - merge-venues-by-name.ts (run
 * afterwards) consolidates every group of venues that now shares a name.
 *
 * Never inserts a new venue row; only updates name/category on a row
 * matched by its current exact name (which, before this runs, is a bare
 * address - safe to match on since it's simply what's in the DB today).
 *
 *   pnpm --filter @pulso/database run db:rename-known-venues
 */

interface RenamedVenue {
  oldName: string;
  newName: string;
  category: VenueCategory;
  secondaryCategories?: VenueCategory[];
}

const renamedVenues: RenamedVenue[] = [
  // Maison de la culture de Côte-des-Neiges - library + 130-seat amphitheatre,
  // exact address match (5290, Chem. de la Côte-des-Neiges).
  {
    oldName: '5290 Chemin de la Côte-des-Neiges',
    newName: 'Maison de la culture de Côte-des-Neiges',
    category: 'community_space'
  },
  // Centre Sanaaq - Inuit community/cultural centre in Ville-Marie; named
  // directly in its own events' descriptions ("gratuitement à Ville-Marie,
  // au Centre Sanaaq").
  {
    oldName: '1180 Rue du Sussex',
    newName: 'Centre Sanaaq',
    category: 'community_space'
  },
  // Maison de la culture Marie-Uguay - named directly in its own events'
  // descriptions ("à la maison de la culture Marie-Uguay").
  {
    oldName: '6030 Boulevard Monk',
    newName: 'Maison de la culture Marie-Uguay',
    category: 'community_space'
  },
  // Parc Wilfrid-Bastien - every event names it directly (concerts/cirque
  // "au parc Wilfrid-Bastien"), on Boulevard Lacordaire in Saint-Léonard.
  {
    oldName: 'Boulevard Lacordaire',
    newName: 'Parc Wilfrid-Bastien',
    category: 'outdoor_festival_site'
  },
  // Le Quai 5160 - Verdun's riverside cultural plaza; three separate
  // address-fallback rows (Rue Wellington, La Station, Place publique
  // Wellington) all host its "programmation culturelle" per their own event
  // descriptions. See merge-venues-by-name.ts note above.
  {
    oldName: 'Rue Wellington',
    newName: 'Le Quai 5160',
    category: 'outdoor_festival_site'
  },
  {
    oldName: 'La Station',
    newName: 'Le Quai 5160',
    category: 'outdoor_festival_site'
  },
  {
    oldName: 'Place publique Wellington',
    newName: 'Le Quai 5160',
    category: 'outdoor_festival_site'
  },
  // Place de la création - corner of Rue Parthenais & Rue Ontario Est,
  // confirmed by Ville de Montréal; matches this row's own events ("Place
  // de la création", "Jeudis de la Place de la Création").
  {
    oldName: 'Rue Parthenais',
    newName: 'Place de la création',
    category: 'outdoor_festival_site'
  },
  // Place de la Gare-Jean-Talon - Parc-Extension's public plaza; named
  // directly by two of this row's own events.
  {
    oldName: 'Rue Hutchison',
    newName: 'Place de la Gare-Jean-Talon',
    category: 'outdoor_festival_site'
  },
  // Parc Ovila-Légaré - Saint-Michel park; named directly by this row's own
  // events (repeated "au parc Ovila-Légaré").
  {
    oldName: '51e Rue',
    newName: 'Parc Ovila-Légaré',
    category: 'outdoor_festival_site'
  },
  // Parc Aimé-Léonard - exact address match (4975 Boulevard Gouin E,
  // Montréal-Nord).
  {
    oldName: '4975 Boulevard Gouin Est',
    newName: 'Parc Aimé-Léonard',
    category: 'outdoor_festival_site'
  },
  // Parc Saint-Joseph - exact address match (9909, 68e Avenue, H1C 1W3).
  {
    oldName: '68e Avenue',
    newName: 'Parc Saint-Joseph',
    category: 'outdoor_festival_site'
  },
  // Halte culturelle de Pointe-aux-Trembles - citizen-built shaded reading/
  // cultural rest area behind the Pointe-aux-Trembles library and maison de
  // la culture, on Boulevard De La Rousselière per Ville de Montréal; this
  // row's own event explicitly names it.
  {
    oldName: 'Boulevard De La Rousselière',
    newName: 'Halte culturelle de Pointe-aux-Trembles',
    category: 'outdoor_festival_site'
  },
  // Parc Clémentine-De La Rousselière - exact address match (14080, Rue
  // Notre-Dame Est) and named directly by this row's own event.
  {
    oldName: 'Terrain Yvon-Lussier',
    newName: 'Parc Clémentine-De La Rousselière',
    category: 'outdoor_festival_site'
  },
  // Bibliothèque Père-Ambroise - exact address match (2093, rue de la
  // Visitation) and named directly by this row's own events. The stored
  // name "Café Bistro 20 93" turned out to be an unrelated nearby business
  // the original geocode pass latched onto, not a real event venue.
  {
    oldName: 'Café Bistro 20 93',
    newName: 'Bibliothèque Père-Ambroise',
    category: 'community_space'
  },
  // Bibliothèque Yves-Ryan - named directly, repeatedly, by this row's own
  // events ("Bibliothèque Yves-Ryan"). The stored name "Circuit électrique"
  // is an EV-charging-network brand name, not a venue at all - same
  // conclusion documented in categorize-known-venues.ts's second batch, but
  // this row (post-merge) turned out to carry real library events under
  // that misleading name rather than being an empty non-venue row.
  {
    oldName: 'Circuit électrique',
    newName: 'Bibliothèque Yves-Ryan',
    category: 'community_space'
  },
  // Bibliothèque Maisonneuve - named directly, repeatedly, by this row's own
  // events ("bibliothèque maisonneuve"). The stored name "Dopamine" does not
  // correspond to any identifiable venue at this address.
  {
    oldName: 'Dopamine',
    newName: 'Bibliothèque Maisonneuve',
    category: 'community_space'
  },
  // Parc Beaudet - named directly by this row's own events ("Maison de la
  // culture Saint-Laurent présente ... au parc Beaudet"); the stored name
  // "Centre des Femmes de Saint-Laurent" is a different, nearby
  // organization, not where these events actually take place.
  {
    oldName: 'Centre des Femmes de Saint-Laurent',
    newName: 'Parc Beaudet',
    category: 'outdoor_festival_site'
  },
  // Maison de la culture Maisonneuve - exact address match (4200, rue
  // Ontario Est). The stored name "La Bolduc" is a public art mural at that
  // same address commemorating the singer, not the venue's own name.
  {
    oldName: 'La Bolduc',
    newName: 'Maison de la culture Maisonneuve',
    category: 'community_space'
  },
  // Place du Village - the Gay Village's outdoor plaza on Sainte-Catherine
  // Est; this row's address (1115) is the same block as the plaza's
  // published address (1114), and 3 of its 4 sampled events name it
  // directly ("à la Place du Village").
  {
    oldName: 'Olympia',
    newName: 'Place du Village',
    category: 'outdoor_festival_site'
  },
  // Parc LaSalle - Lachine's largest park, on Rue Victoria; named directly,
  // twice, by this row's own events ("au parc LaSalle").
  {
    oldName: 'Rue Victoria',
    newName: 'Parc LaSalle',
    category: 'outdoor_festival_site'
  },
  // Parc Lucie-Bruneau - this row's coordinates sit ~80m from the
  // already-named/categorized "Parc Lucie-Bruneau" venue, and one of its own
  // events explicitly names "Parc Lucie-Bruneau" as the location; same
  // real place, separate geocode. See merge-venues-by-name.ts note above.
  {
    oldName: "7051 Avenue de l'Alsace",
    newName: 'Parc Lucie-Bruneau',
    category: 'outdoor_festival_site'
  },
  // Parc Saint-Viateur - on Avenue Bloomfield in Outremont (formerly Parc
  // Bloomfield, per Ville de Montréal); named directly by 3 of this row's
  // own events ("au Parc Saint-Viateur").
  {
    oldName: 'Avenue Bloomfield',
    newName: 'Parc Saint-Viateur',
    category: 'outdoor_festival_site'
  }
];

async function main(): Promise<void> {
  const pool = createPool();
  try {
    for (const venue of renamedVenues) {
      const result = await pool.query(
        `UPDATE venues SET name = $1, category = $2, secondary_categories = $3 WHERE name = $4`,
        [
          venue.newName,
          venue.category,
          venue.secondaryCategories ?? [],
          venue.oldName
        ]
      );
      console.log(
        `${venue.oldName} -> ${venue.newName}: ${result.rowCount} row(s) updated.`
      );
    }
  } finally {
    await pool.end();
  }
}

await main();
