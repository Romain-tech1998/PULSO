/**
 * Imports venue candidates from OpenStreetMap around Montréal, with a photo
 * and an address, and publishes the ones that qualify to the map.
 *
 * A batch tool, not a per-request path: Overpass and Nominatim are free
 * volunteer-run services whose usage policies ask for moderate use. Run it
 * when the directory needs refreshing. The only live lookup Pulso performs is
 * the narrow one behind a search that found nothing (see
 * @pulso/ingestion lookup-venue.ts), and that one remembers its misses.
 *
 *   pnpm db:import-osm-venues                    # 30 km around Montréal, dry run
 *   pnpm db:import-osm-venues -- --write         # actually insert
 *   pnpm db:import-osm-venues -- --no-photos     # skip photo resolution
 *   pnpm db:import-osm-venues -- --radius 5000 --lon -73.58 --lat 45.52
 *
 * Publication rule (DEC-0014 + DEC-0006 as amended for third-party reference
 * data): a venue reaches the map only with a name, a real address, usable
 * coordinates and a category Pulso actually recognises. Anything short of
 * that is written as `review_state = 'candidate'`, which search offers as a
 * labelled suggestion and the map never shows. Nothing here invents a fact to
 * clear the bar - a venue with no recoverable address stays a candidate.
 *
 * Data is ODbL: © OpenStreetMap contributors.
 */
import {
  fetchOsmVenues,
  matchVenues,
  OSM_ATTRIBUTION,
  reverseGeocodeAddress,
  resolveVenuePhotos,
  type OsmVenueCandidate,
  type ResolvedVenuePhoto
} from '@pulso/ingestion';

import { createPool } from './client.js';

// The centre Pulso already uses for its Montréal radius rule.
const MONTREAL = { longitude: -73.5673, latitude: 45.5017 };
const DEFAULT_RADIUS_METERS = 30_000;
/** Nominatim's usage policy is one request per second. 1100 ms, not 1000. */
const NOMINATIM_DELAY_MS = 1100;

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const write = process.argv.includes('--write');
const withPhotos = !process.argv.includes('--no-photos');
const radiusMeters = Number(flag('radius') ?? DEFAULT_RADIUS_METERS);
const point = {
  longitude: Number(flag('lon') ?? MONTREAL.longitude),
  latitude: Number(flag('lat') ?? MONTREAL.latitude)
};

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const pool = createPool();

try {
  console.log(
    `Querying Overpass: ${radiusMeters} m around ${point.latitude}, ${point.longitude}`
  );
  const candidates = await fetchOsmVenues(point, radiusMeters);
  const withAddress = candidates.filter((candidate) => candidate.address);
  console.log(
    `${candidates.length} named, categorized places. ${withAddress.length} carry an address in OSM.`
  );

  // Name, address and position weighed together (see matchVenues). Name
  // alone was the earlier rule and it failed both ways on real data: it let
  // OSM's "Cheval Blanc" through next to the existing "Le Cheval Blanc" -
  // the same brewpub - while address strings alone differ far too much
  // between OSM and the event sources ("Rue St-Denis" vs "rue Saint-Denis")
  // to be a key at all.
  //
  // Rows Pulso itself already imported from OSM are excluded from the guard:
  // they are matched by external_ref instead, so a re-import updates them
  // rather than seeing its own previous output as "already known" and
  // skipping every venue it added last time.
  const existing = await pool.query<{
    name: string;
    address: string;
    longitude: number;
    latitude: number;
  }>(
    `SELECT name, address,
            ST_X(location) AS longitude, ST_Y(location) AS latitude
     FROM venues
     WHERE source <> 'openstreetmap'`
  );
  const known = existing.rows.map((row) => ({
    name: row.name,
    address: row.address,
    point: {
      longitude: Number(row.longitude),
      latitude: Number(row.latitude)
    }
  }));
  const fresh = candidates.filter(
    (candidate) => !known.some((venue) => matchVenues(venue, candidate).same)
  );
  console.log(
    `${candidates.length - fresh.length} already known to Pulso, ${fresh.length} to import.`
  );

  // Recover the missing addresses from the coordinate OSM already gives us.
  // This is the difference between importing 59% of Montréal's nightlife and
  // importing all of it, and it is a real lookup rather than a guess.
  const needingAddress = fresh.filter((candidate) => !candidate.address);
  if (needingAddress.length > 0) {
    const seconds = Math.round(
      (needingAddress.length * NOMINATIM_DELAY_MS) / 1000
    );
    console.log(
      `Reverse-geocoding ${needingAddress.length} places without an OSM address (~${seconds}s at Nominatim's 1 req/s policy)...`
    );
    let recovered = 0;
    for (const [index, candidate] of needingAddress.entries()) {
      if (index > 0) await delay(NOMINATIM_DELAY_MS);
      try {
        const resolved = await reverseGeocodeAddress(candidate.point);
        // shortLabel is "123 Rue Example"; display_name repeats the borough,
        // province and country, which is not what belongs under a venue name.
        const address = resolved?.shortLabel ?? resolved?.address;
        if (address) {
          candidate.address = address;
          recovered += 1;
        }
      } catch {
        // One flaky lookup is not a reason to abandon the run; the venue
        // simply stays a candidate instead of reaching the map.
      }
    }
    console.log(`  recovered ${recovered}/${needingAddress.length}.`);
  }

  const photos = new Map<string, ResolvedVenuePhoto>();
  if (withPhotos) {
    const hintedCount = fresh.filter(
      (candidate) =>
        candidate.photoHints.image ||
        candidate.photoHints.wikidata ||
        candidate.photoHints.wikimediaCommons ||
        candidate.photoHints.website
    ).length;
    console.log(`Resolving photos for ${hintedCount} places with a lead...`);
    const resolved = await resolveVenuePhotos(
      fresh.map((candidate) => ({
        key: candidate.osmRef,
        hints: candidate.photoHints
      })),
      {
        onProgress: (done, total) => {
          if (done % 25 === 0 || done === total) {
            console.log(`  websites ${done}/${total}`);
          }
        }
      }
    );
    for (const [key, photo] of resolved) photos.set(key, photo);
    const bySource = new Map<string, number>();
    for (const photo of photos.values()) {
      bySource.set(photo.source, (bySource.get(photo.source) ?? 0) + 1);
    }
    console.log(
      `  ${photos.size} photos: ${[...bySource]
        .map(([source, count]) => `${source}=${count}`)
        .join(' ')}`
    );
  }

  // A photo somebody asked Pulso to stop showing must not come back on the
  // next run. Suppressions are keyed by the venue's external_ref so they
  // survive even if the row is rebuilt.
  const suppressions = await pool.query<{
    external_ref: string;
    image_url: string | null;
  }>(
    `SELECT v.external_ref, s.image_url
     FROM venue_photo_suppressions s
     JOIN venues v ON v.id = s.venue_id
     WHERE v.external_ref IS NOT NULL`
  );
  const blockedAll = new Set<string>();
  const blockedUrls = new Set<string>();
  for (const row of suppressions.rows) {
    if (row.image_url === null) blockedAll.add(row.external_ref);
    else blockedUrls.add(`${row.external_ref}|${row.image_url}`);
  }

  function photoFor(
    candidate: OsmVenueCandidate
  ): ResolvedVenuePhoto | undefined {
    const photo = photos.get(candidate.osmRef);
    if (!photo) return undefined;
    if (blockedAll.has(candidate.osmRef)) return undefined;
    if (blockedUrls.has(`${candidate.osmRef}|${photo.imageUrl}`)) {
      return undefined;
    }
    return photo;
  }

  const publishable = fresh.filter((candidate) => Boolean(candidate.address));
  const heldBack = fresh.length - publishable.length;

  const byCategory = new Map<string, number>();
  for (const candidate of publishable) {
    byCategory.set(
      candidate.category,
      (byCategory.get(candidate.category) ?? 0) + 1
    );
  }
  console.log(
    `\n${publishable.length} qualify for the map, ${heldBack} stay candidates for want of an address.`
  );
  console.log(
    [...byCategory.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([category, count]) => `${category}=${count}`)
      .join(' | ')
  );

  if (!write) {
    console.log('\nDry run. Re-run with --write to import.');
    for (const candidate of publishable.slice(0, 10)) {
      const photo = photoFor(candidate);
      console.log(
        `  ${candidate.category.padEnd(20)} ${candidate.name} — ${candidate.address}${
          photo ? ` [photo: ${photo.source}]` : ''
        }`
      );
    }
  } else {
    let written = 0;
    for (const candidate of fresh) {
      const photo = photoFor(candidate);
      const reviewState = candidate.address ? 'published' : 'candidate';
      // A candidate with no address still has to satisfy the NOT NULL column.
      // The empty string would be a lie dressed as data; naming the gap is
      // honest and makes these rows trivial to find later.
      const address = candidate.address ?? 'Adresse inconnue';
      const result = await pool.query(
        `INSERT INTO venues
           (id, name, address, location, category, secondary_categories,
            source, review_state, external_ref,
            image_url, image_source, image_attribution, image_page_url,
            opening_hours, opening_hours_observed_at)
         VALUES (gen_random_uuid(), $1, $2,
                 ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6,
                 'openstreetmap', $7, $8, $9, $10, $11, $12,
                 $13, CASE WHEN $13::text IS NULL THEN NULL ELSE now() END)
         ON CONFLICT (source, external_ref) WHERE external_ref IS NOT NULL
         DO UPDATE SET name = EXCLUDED.name,
                       address = EXCLUDED.address,
                       location = EXCLUDED.location,
                       category = EXCLUDED.category,
                       secondary_categories = EXCLUDED.secondary_categories,
                       review_state = EXCLUDED.review_state,
                       -- COALESCE so a run made with --no-photos, or one where
                       -- a site was briefly unreachable, does not strip a
                       -- photo an earlier run legitimately found.
                       image_url = COALESCE(EXCLUDED.image_url, venues.image_url),
                       image_source = COALESCE(EXCLUDED.image_source, venues.image_source),
                       image_attribution = COALESCE(EXCLUDED.image_attribution, venues.image_attribution),
                       image_page_url = COALESCE(EXCLUDED.image_page_url, venues.image_page_url),
                       -- Not COALESCE: hours that disappeared from the source
                       -- have to disappear here too. A stale schedule is
                       -- worse than none, because Pulso states "open now"
                       -- from it.
                       opening_hours = EXCLUDED.opening_hours,
                       opening_hours_observed_at = EXCLUDED.opening_hours_observed_at
         RETURNING id`,
        [
          candidate.name,
          address,
          candidate.point.longitude,
          candidate.point.latitude,
          candidate.category,
          candidate.secondaryCategories,
          reviewState,
          candidate.osmRef,
          photo?.imageUrl ?? null,
          photo?.source ?? null,
          photo?.attribution ?? null,
          photo?.pageUrl ?? null,
          candidate.openingHours ?? null
        ]
      );
      written += result.rowCount ?? 0;
    }
    console.log(`\n${written} venues written. ${OSM_ATTRIBUTION}.`);
    console.log(
      `${publishable.length} are on the map; ${heldBack} are search-only suggestions until an address is known.`
    );
    console.log(
      'Remove a borrowed photo with: pnpm db:venue-photos -- --remove <venue-id>'
    );
  }
} finally {
  await pool.end();
}
