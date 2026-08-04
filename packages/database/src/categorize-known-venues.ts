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
  {
    name: 'Théâtre de Verdure',
    category: 'theater',
    secondaryCategories: ['outdoor_festival_site']
  },
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
  { name: 'Fairmount Theatre', category: 'theater' },

  // Second batch, same method: taken from the top of the "no category yet"
  // list by event volume, after excluding rows the Lieux UI already hides as
  // not-a-real-venue (bare street/address names, `name === address`,
  // "Unknown venue" - see looksLikeBareStreetName/groupEventsByVenue in
  // explore-map.tsx). A few real named places were still skipped here
  // because research didn't turn up a confident, unambiguous match to a
  // single physical venue (Habitations Ahuntsic, Piste cyclable des Berges,
  // La Bolduc, Circuit électrique - the last one is an EV charging network
  // brand name, not a venue at all, despite appearing as one in the data).
  { name: 'Rogers Court', category: 'other' }, // IGA Stadium tennis court (National Bank Open) - no sports-venue category, same as Centre Court
  { name: 'Salle Paul-Desmarais', category: 'concert_hall' }, // Centre Canadien d'Architecture - chamber/classical concert hall
  { name: 'Bibliothèque du Plateau-Mont-Royal', category: 'community_space' },
  { name: "Mairie d'arrondissement Anjou", category: 'community_space' },
  { name: 'Stereo', category: 'nightclub' }, // long-running Montreal after-hours club
  { name: 'Aréna Martin-Lapointe', category: 'other' }, // Lachine ice arena, no sports-venue category
  { name: 'Cafe PEYO', category: 'community_space' }, // Parc-Extension community org's cafeteria, rentable for events, not a nightlife cafe
  { name: 'Wilfrid-Pelletier', category: 'concert_hall' }, // Salle Wilfrid-Pelletier, Place des Arts' main hall
  // Underground electronic-music bar/club in Quartier Latin (RA lists it as
  // a club; the venue itself and Quartier des Spectacles describe it as a bar).
  { name: 'Le Red Room', category: 'bar', secondaryCategories: ['nightclub'] },
  { name: 'Piscine Jarry', category: 'other' }, // outdoor public pool in Parc Jarry, occasional aquatic-activity events
  { name: 'Bibliothèque Robert-Bourassa', category: 'community_space' },
  { name: 'Esplanade Tranquille', category: 'outdoor_festival_site' }, // Quartier des Spectacles outdoor plaza
  { name: 'Théâtre Mirella et Lino Saputo', category: 'theater' }, // 526-seat theater, Leonardo da Vinci Centre, Saint-Léonard
  { name: "Parc d'Escale", category: 'outdoor_festival_site' }, // Parc Noël-Spinelli (formerly Parc de la Marina d'Escale) - waterfront park with an open-air amphitheatre
  { name: 'Salle Émile-Legault', category: 'theater' }, // Cégep de Saint-Laurent's professional performance hall
  { name: 'Bibliothèque de Pierrefonds', category: 'community_space' },
  { name: 'Maison Symphonique de Montréal', category: 'concert_hall' }, // capitalization variant of the already-categorized "Maison symphonique de Montréal"

  // Third batch, same method and same exclusions as the second. Skipped this
  // round for the same reason (no confident single-venue match, or a
  // category that doesn't fit anything in VENUE_CATEGORIES - restaurants,
  // schools, a highway, generic/ambiguous park or trail descriptions):
  // Café Bistro 20 93, Chez Chili, École Les Enfants du Monde, École Saint
  // Anthony, Autoroute Ville-Marie, Terrain Yvon-Lussier, Piste du parc,
  // Parc bord l'eau, Parc à chiens du parc Gouin, ESC, Promenade
  // Jean-Brillant. New City Gas is deliberately excluded too, same reason as
  // the top-of-file note - already categorized by seed-curated-venues.ts.
  { name: 'Vino Disco', category: 'bar', secondaryCategories: ['nightclub'] }, // wine bar with a nightly DJ dance floor, Quartier des Spectacles
  { name: 'Sans Soleil', category: 'bar' }, // vinyl-only listening bar, Chinatown
  {
    name: 'Piranha Bar',
    category: 'bar',
    secondaryCategories: ['concert_hall']
  }, // dive bar with an upstairs live-music stage
  { name: 'Église Notre-Dame-des-Sept-Douleurs', category: 'concert_hall' }, // Verdun church, regular ticketed concert series (Candlelight, Musical Wednesdays)
  { name: 'La Salle Désilets', category: 'concert_hall' }, // 700-seat performance hall, Cégep Marie-Victorin - largest in Eastern Montreal
  { name: 'Espace Projet', category: 'gallery_museum' }, // Mile-End gallery for emerging design/art
  { name: "Centre d'exposition Lethbridge", category: 'gallery_museum' },
  { name: 'Maison de la culture Janine-Sutto', category: 'community_space' },
  { name: 'Bibliothèque de La Petite-Patrie', category: 'community_space' },
  { name: 'Bibliothèque Jean-Corbeil', category: 'community_space' },
  { name: 'Chalet François-Perrault', category: 'community_space' }, // municipal park chalet/community facility
  { name: 'Champ-De-Mars', category: 'outdoor_festival_site' }, // public square, Fête nationale and other festival programming
  { name: 'Esplanade du Parc olympique', category: 'outdoor_festival_site' },
  { name: 'Parc de la Savane', category: 'outdoor_festival_site' },
  { name: 'Parc Marcel-Léger', category: 'outdoor_festival_site' },
  {
    name: "Parc de l'esplanade de la Pointe-Nord",
    category: 'outdoor_festival_site'
  }, // Old Port
  { name: 'Parc Martin-Luther-King', category: 'outdoor_festival_site' },
  {
    name: "Parc Nature de l'Ile-de-la-Visitation",
    category: 'outdoor_festival_site'
  },
  { name: 'Complexe Sportif Claude-Robillard', category: 'other' }, // large multi-sport complex, no sports-venue category
  { name: 'Théâtre Maisonneuve', category: 'theater' }, // Place des Arts
  { name: 'Maison Etienne Nivard de Saint-Dizier', category: 'gallery_museum' }, // Lachine historic house museum
  { name: 'Fab Labs', category: 'community_space' }, // maker/fabrication-lab community space

  // Fourth batch: post merge-duplicate-venues.ts cleanup (see that script -
  // 285 duplicate-location groups collapsed, surfacing many real venues that
  // had been hiding behind bare-address duplicates). Instead of one-by-one
  // research, this batch is every remaining "no category yet" venue with
  // real events that matches a naming pattern already given a unanimous,
  // zero-exception category by name across the first three batches (every
  // prior "Parc X" -> outdoor_festival_site, every "Bibliothèque X" ->
  // community_space, every public pool -> other, every ice arena -> other).
  // "Parc bord l'eau" and "Parc à chiens du parc Gouin" are skipped again,
  // same reason as the third batch (generic/ambiguous description, not a
  // specific named place). Écoles remain excluded (taxonomy doesn't fit
  // operating schools) except "Ancienne école Allion", researched
  // individually below because it's a former school, not an operating one.
  // Églises are never blanket-categorized (only one prior precedent existed:
  // Église Notre-Dame-des-Sept-Douleurs) - the three below were each
  // individually confirmed by web search to run a real recurring concert
  // series before being added.
  { name: 'Parc Henri-Bourassa', category: 'outdoor_festival_site' },
  { name: 'Parc Médéric-Martin', category: 'outdoor_festival_site' },
  { name: 'Parc Georges-Saint-Pierre', category: 'outdoor_festival_site' },
  { name: 'Parc Verdelles', category: 'outdoor_festival_site' },
  { name: 'Parc du Bocage', category: 'outdoor_festival_site' },
  { name: 'Parc du Collège', category: 'outdoor_festival_site' },
  { name: 'Parc de Mésy', category: 'outdoor_festival_site' },
  {
    name: 'Parc Sir-George-Étienne-Cartier',
    category: 'outdoor_festival_site'
  },
  { name: 'Parc Saint-Jean-Baptiste', category: 'outdoor_festival_site' },
  { name: 'Parc Armand-Bombardier', category: 'outdoor_festival_site' },
  { name: 'Parc Beaubien', category: 'outdoor_festival_site' },
  { name: 'Parc Nelson-Mandela', category: 'outdoor_festival_site' },
  { name: 'Parc Lucie-Bruneau', category: 'outdoor_festival_site' },
  { name: 'Parc William-Hurst', category: 'outdoor_festival_site' },
  { name: 'Parc Eugène-Dostie', category: 'outdoor_festival_site' },
  { name: 'Parc Irma-Le Vasseur', category: 'outdoor_festival_site' },
  { name: 'Parc Joseph-Paré', category: 'outdoor_festival_site' },
  { name: 'Parc Gohier', category: 'outdoor_festival_site' },
  { name: "Parc d'A-Ma-Baie", category: 'outdoor_festival_site' },
  { name: 'Parc Nicolas-Tillemont', category: 'outdoor_festival_site' },
  { name: 'Parc Lhasa-De Sela', category: 'outdoor_festival_site' },
  { name: 'Parc du Bassin-à-bois', category: 'outdoor_festival_site' },
  { name: 'Parc Stinson', category: 'outdoor_festival_site' },
  { name: 'Parc Van Horne', category: 'outdoor_festival_site' },
  { name: 'Parc Coubertin', category: 'outdoor_festival_site' },
  { name: 'Parc des Açores', category: 'outdoor_festival_site' },
  { name: 'Parc Delorme', category: 'outdoor_festival_site' },
  { name: 'Parc Baldwin', category: 'outdoor_festival_site' },
  { name: 'parc Hilda-Ramacière', category: 'outdoor_festival_site' },
  { name: 'Parc Luigi-Pirandello', category: 'outdoor_festival_site' },
  { name: 'Parc Sauvé', category: 'outdoor_festival_site' },
  { name: 'Parc Cousineau', category: 'outdoor_festival_site' },
  {
    name: "Parc de l'Honorable-George-O'Reilly",
    category: 'outdoor_festival_site'
  },
  { name: 'Parc Toussaint-Louverture', category: 'outdoor_festival_site' },
  { name: 'Parc Ménard', category: 'outdoor_festival_site' },
  { name: 'Parc Ouellette', category: 'outdoor_festival_site' },
  { name: 'Parc des Roseraies', category: 'outdoor_festival_site' },
  { name: 'Parc Carignan', category: 'outdoor_festival_site' },
  { name: 'Parc Robert-Sauvé', category: 'outdoor_festival_site' },
  { name: 'Parc Dan-Hanganu', category: 'outdoor_festival_site' },
  { name: "Parc de l'Ukraine", category: 'outdoor_festival_site' },
  { name: 'Parc Richelieu', category: 'outdoor_festival_site' },
  { name: 'Parc Outremont', category: 'outdoor_festival_site' },
  { name: 'Parc de Louisbourg', category: 'outdoor_festival_site' },
  { name: 'Parc Ethel-Stark', category: 'outdoor_festival_site' },
  {
    name: 'Parc André-Corbeil-Dit-Tranchemontagne',
    category: 'outdoor_festival_site'
  },
  { name: 'Parc André-Lavallée', category: 'outdoor_festival_site' },
  { name: 'Parc Walter-Stewart', category: 'outdoor_festival_site' },
  { name: 'Parc Ferland', category: 'outdoor_festival_site' },
  { name: 'Parc André-Laurendeau', category: 'outdoor_festival_site' },
  { name: 'Parc rue Lafrance', category: 'outdoor_festival_site' },
  { name: 'Parc Coffee Basketball Court', category: 'outdoor_festival_site' }, // Parc Coffee, 7330 rue Coffee - a real named municipal park, not a generic sports court
  { name: 'Parc Raymond-Préfontaine', category: 'outdoor_festival_site' },
  { name: 'Parc Lefebvre', category: 'outdoor_festival_site' },
  { name: 'Parc de Deauville', category: 'outdoor_festival_site' },
  { name: 'Parc Jean-Amyot', category: 'outdoor_festival_site' },
  { name: 'Parc Leroux', category: 'outdoor_festival_site' },
  { name: 'Parc Olympique de Montréal', category: 'outdoor_festival_site' }, // same treatment as the already-categorized "Esplanade du Parc olympique"
  { name: 'Parc de Taishan', category: 'outdoor_festival_site' },
  {
    name: "Parc de la Capture-d'Ethan-Allen",
    category: 'outdoor_festival_site'
  },
  { name: 'Parc Julie-Hamelin', category: 'outdoor_festival_site' },
  { name: 'Parc Poirier', category: 'outdoor_festival_site' },
  { name: 'Parc Thomas-Chapais', category: 'outdoor_festival_site' },
  { name: 'Parc Félix-Leclerc LaSalle', category: 'outdoor_festival_site' },
  { name: 'Parc Louis-Querbes', category: 'outdoor_festival_site' },

  { name: 'Bibliothèque Serge-Bouchard', category: 'community_space' },
  { name: 'Bibliothèque du Vieux-Saint-Laurent', category: 'community_space' },
  { name: 'Bibliothèque Langelier', category: 'community_space' },
  { name: 'Bibliothèque Mordecai-Richler', category: 'community_space' },
  { name: 'Bibliothèque de Rivière-des-Prairies', category: 'community_space' },
  { name: 'Bibliothèque Bellevile', category: 'community_space' }, // spelling as stored in the DB (missing an "l")
  {
    name: 'Bibliothèque de la Danse Vincent-Warren',
    category: 'community_space'
  }, // dance-archive library, Cinémathèque québécoise
  {
    name: 'Centre Communautaire Rivière-Des-Prairies',
    category: 'community_space'
  },
  {
    name: 'Centre communautaire intergénérationnel',
    category: 'community_space'
  },
  { name: 'Piscine et pataugeoire Laurier', category: 'other' }, // outdoor public pool, same treatment as Piscine Jarry
  { name: 'Piscine René-Goupil', category: 'other' },
  { name: 'Piscine du Parc Dan-Hanganu (Elgar)', category: 'other' },
  { name: 'Aréna Mont-Royal', category: 'other' }, // ice arena, same treatment as Aréna Martin-Lapointe

  // Former primary school, vacant since 2007; now run by the citizen
  // non-profit Allions-Nous as a transitional community site (collective
  // garden, outdoor cinema nights, farmers market, mobile library) - a real
  // community space today, unlike the still-operating schools excluded above.
  { name: 'Ancienne école Allion', category: 'community_space' },
  { name: 'Église Saint-Édouard', category: 'concert_hall' }, // free classical concert series in the chapel
  { name: 'Église Saint-René-Goupil', category: 'concert_hall' }, // Salle de diffusion de Parc-Extension / Hors les murs concert series
  { name: 'Église Saint-Paul-de-la-Croix', category: 'concert_hall' }, // regular choir/concert programming (Chorale Chantevoix, Concert sous les chandelles)

  // Fifth batch: already-real-named venues turned up by the same "no
  // category yet" sweep, needing only a category (found alongside
  // rename-known-venues.ts's research pass, same event-description-driven
  // method - each name below already matched a real place on its own).
  { name: 'La maison de la poésie', category: 'community_space' }, // Maison de la poésie de Montréal, Jean-Talon Est - literary org, exhibitions/readings
  { name: 'Écomuseum de la Pointe-aux-Trembles', category: 'gallery_museum' },
  { name: 'The Comedy Nest', category: 'concert_hall' }, // Montreal comedy club, live stand-up
  { name: 'Impro Montréal / Montreal Improv', category: 'theater' },
  { name: 'Maison Robert-Bélanger', category: 'gallery_museum' }, // heritage house, garden concerts
  { name: 'Centre culturel de Pierrefonds', category: 'community_space' },
  {
    name: "Hurley's Irish Pub",
    category: 'bar',
    secondaryCategories: ['concert_hall']
  }, // Old Montreal Irish pub, also runs stand-up comedy nights
  { name: "L'Espace Public", category: 'bar' }, // Instagram-scouted bar/café, recurring events + art openings
  { name: "L'Illusion, Théâtre de marionnettes", category: 'theater' }, // Rosemont puppet theatre
  {
    name: 'Café La Ligne Verte',
    category: 'bar',
    secondaryCategories: ['concert_hall']
  } // café/bar hosting a recurring live-band swing-dance night
];

try {
  for (const venue of knownVenues) {
    const result = await pool.query(
      `UPDATE venues SET category = $1, secondary_categories = $2 WHERE name = $3`,
      [venue.category, venue.secondaryCategories ?? [], venue.name]
    );
    console.log(
      `${venue.name}: ${result.rowCount} row(s) updated to "${venue.category}".`
    );
  }
} finally {
  await pool.end();
}
