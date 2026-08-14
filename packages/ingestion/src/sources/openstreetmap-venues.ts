import type { VenueCategory } from '@pulso/domain';

import { matchVenues } from '../mapping/venue-identity.js';

/**
 * Venue candidates from OpenStreetMap, via the public Overpass API.
 *
 * Chosen over Google Places deliberately. Google Maps Platform's terms forbid
 * storing or caching Places content beyond 30 days - only a `place_id` may be
 * kept - so building a permanent Pulso venue record from it would breach
 * them. OpenStreetMap is ODbL: storing, deriving and redistributing are all
 * allowed, provided the attribution below travels with the data.
 *
 * Overpass is a free, shared, volunteer-run service. Its usage policy asks
 * for moderate use, which is why the bulk sweep is a batch import rather than
 * a live lookup on every visitor search - a per-search call would be abusive
 * of a service nobody is paying for, and would put a stranger's uptime in the
 * middle of Pulso's search latency. The narrow live path that does exist, for
 * a search that found nothing, goes to Nominatim instead (see
 * lookup-venue.ts): searching by name is what that API is for, and it
 * remembers each miss so one unmatchable spelling cannot become a stream of
 * requests.
 */
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

/**
 * OSM tag -> Pulso venue category.
 *
 * Only tags whose meaning maps cleanly are listed. Anything else is left out
 * rather than guessed: a wrong category is worse than an absent one, since
 * `category` is what puts a venue on the map at all
 * (findVenuesWithoutUpcomingEvents requires it).
 *
 * The list stays inside DEC-0014's boundary - bars, nightclubs, concert
 * halls, theatres and cultural spaces - because that decision authorizes a
 * map exception for recurring outing destinations, not a general business
 * directory. Adding `amenity=restaurant` here would quietly turn Pulso into
 * one.
 */
const TAG_TO_CATEGORY: ReadonlyArray<{
  key: string;
  value: string;
  category: VenueCategory;
}> = [
  { key: 'amenity', value: 'bar', category: 'bar' },
  { key: 'amenity', value: 'pub', category: 'bar' },
  { key: 'amenity', value: 'biergarten', category: 'bar' },
  { key: 'amenity', value: 'nightclub', category: 'nightclub' },
  { key: 'amenity', value: 'theatre', category: 'theater' },
  { key: 'amenity', value: 'arts_centre', category: 'community_space' },
  { key: 'amenity', value: 'community_centre', category: 'community_space' },
  { key: 'leisure', value: 'music_venue', category: 'concert_hall' },
  { key: 'craft', value: 'brewery', category: 'brewery_with_stage' },
  { key: 'microbrewery', value: 'yes', category: 'brewery_with_stage' },
  { key: 'tourism', value: 'museum', category: 'gallery_museum' },
  { key: 'tourism', value: 'gallery', category: 'gallery_museum' }
];

/**
 * The Pulso category for one OSM key/value pair, or nothing when the pair
 * carries no meaning Pulso can act on.
 *
 * Exported because the live Nominatim lookup behind search classifies its
 * results from the same `class`/`type` vocabulary. Two independent copies of
 * this table would drift, and the drift would show up as the same bar being
 * a `bar` when imported in batch and uncategorized when found live.
 */
export function categoryForOsmTag(
  key: string,
  value: string
): VenueCategory | undefined {
  return TAG_TO_CATEGORY.find(
    (entry) => entry.key === key && entry.value === value
  )?.category;
}

/**
 * The tags a photo can be resolved from later, carried through verbatim.
 *
 * Resolving here would put a Wikidata round trip inside the Overpass mapper,
 * which is both the wrong layer and the wrong number of requests: the batch
 * importer resolves 78 wikidata ids in two batched API calls, where a
 * per-element resolver would make 78.
 */
export interface OsmPhotoHints {
  /** A direct image URL. Rare - 4 venues in the whole Montréal extract. */
  image?: string | undefined;
  /** A Commons file name, e.g. "Musee McCord 02.jpg". */
  wikimediaCommons?: string | undefined;
  /** A Wikidata entity id, e.g. "Q1128578", whose P18 may hold a photo. */
  wikidata?: string | undefined;
  /** The venue's own site, whose og:image is the widest-coverage source. */
  website?: string | undefined;
}

export interface OsmVenueCandidate {
  /** Stable OSM reference, e.g. "node/1234567". Used to re-import idempotently. */
  osmRef: string;
  name: string;
  /**
   * Absent when OSM has no `addr:street`, which is the case for 353 of the
   * 860 named venues around Montréal. Deliberately neither dropped nor
   * invented here: the importer reverse-geocodes the point it already has,
   * which is a real lookup of a real coordinate rather than a guess. Dropping
   * them instead would discard 41% of the directory, and those are
   * disproportionately the small bars a visitor is least likely to find
   * anywhere else.
   */
  address?: string | undefined;
  point: { longitude: number; latitude: number };
  category: VenueCategory;
  secondaryCategories: VenueCategory[];
  photoHints: OsmPhotoHints;
  /**
   * The source's own `opening_hours` rule, carried verbatim. Parsing belongs
   * to @pulso/domain, which is shared with the clients that have to render
   * it - deciding what the rule means here would fix the interpretation at
   * import time and make it un-revisable without a re-import.
   */
  openingHours?: string | undefined;
}

export interface OverpassElement {
  type: string;
  id: number;
  lat?: number | undefined;
  lon?: number | undefined;
  center?: { lat: number; lon: number } | undefined;
  tags?: Record<string, string> | undefined;
}

/**
 * Overpass QL for every mapped kind of place within `radiusMeters` of a
 * point. `out center` makes ways and relations report a single coordinate,
 * so a bar mapped as a building footprint is usable exactly like one mapped
 * as a point.
 */
export function buildOverpassQuery(
  point: { longitude: number; latitude: number },
  radiusMeters: number,
  timeoutSeconds = 60
): string {
  const around = `around:${radiusMeters},${point.latitude},${point.longitude}`;
  const clauses = TAG_TO_CATEGORY.flatMap(({ key, value }) =>
    ['node', 'way', 'relation'].map(
      (kind) => `  ${kind}["${key}"="${value}"](${around});`
    )
  ).join('\n');
  return `[out:json][timeout:${timeoutSeconds}];\n(\n${clauses}\n);\nout center tags;`;
}

/** Composes the OSM address tags into the single line Pulso stores. */
export function composeAddress(
  tags: Record<string, string>
): string | undefined {
  const street = tags['addr:street'];
  if (!street) return undefined;
  const number = tags['addr:housenumber'];
  const city = tags['addr:city'];
  const postcode = tags['addr:postcode'];
  const line = [number, street].filter(Boolean).join(' ');
  return [line, city, postcode].filter(Boolean).join(', ');
}

/** Reads the photo-bearing tags, accepting either spelling of the website tag. */
export function readPhotoHints(tags: Record<string, string>): OsmPhotoHints {
  const website = tags['website'] ?? tags['contact:website'];
  return {
    ...(tags['image'] ? { image: tags['image'] } : {}),
    ...(tags['wikimedia_commons']
      ? { wikimediaCommons: tags['wikimedia_commons'] }
      : {}),
    ...(tags['wikidata'] ? { wikidata: tags['wikidata'] } : {}),
    ...(website ? { website } : {})
  };
}

export function mapOverpassElement(
  element: OverpassElement
): OsmVenueCandidate | undefined {
  const tags = element.tags ?? {};
  const name = tags['name']?.trim();
  // An unnamed pin cannot be presented to a visitor as a place to go.
  if (!name) return undefined;

  const matched = TAG_TO_CATEGORY.filter(
    ({ key, value }) => tags[key] === value
  ).map(({ category }) => category);
  const [category, ...rest] = [...new Set(matched)];
  if (!category) return undefined;

  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (latitude === undefined || longitude === undefined) return undefined;

  const address = composeAddress(tags);
  const openingHours = tags['opening_hours']?.trim();

  return {
    osmRef: `${element.type}/${element.id}`,
    name,
    ...(address ? { address } : {}),
    point: { longitude, latitude },
    category,
    secondaryCategories: rest,
    photoHints: readPhotoHints(tags),
    ...(openingHours ? { openingHours } : {})
  };
}

/**
 * Folds a duplicate into the copy already kept, rather than discarding it.
 *
 * The node and the way for one pub carry different tags often enough that
 * first-one-wins loses real data: typically the node has the address and the
 * way has the wikidata id, so taking either alone costs a photo or a street.
 */
function mergeCandidates(
  kept: OsmVenueCandidate,
  other: OsmVenueCandidate
): OsmVenueCandidate {
  const address = kept.address ?? other.address;
  return {
    ...kept,
    ...(address ? { address } : {}),
    secondaryCategories: [
      ...new Set([...kept.secondaryCategories, ...other.secondaryCategories])
    ].filter((category) => category !== kept.category),
    // `kept` last: a value already accepted is not overwritten by the copy.
    photoHints: { ...other.photoHints, ...kept.photoHints },
    ...((kept.openingHours ?? other.openingHours)
      ? { openingHours: kept.openingHours ?? other.openingHours }
      : {})
  };
}

export async function fetchOsmVenues(
  point: { longitude: number; latitude: number },
  radiusMeters: number,
  options: { endpoint?: string; fetchImpl?: typeof fetch } = {}
): Promise<OsmVenueCandidate[]> {
  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(options.endpoint ?? OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      // Overpass asks callers to identify themselves so abuse can be traced
      // to a project rather than to an anonymous IP.
      'user-agent':
        'Pulso/0.1 (Montreal event directory; contact via pulsonight.com)'
    },
    body: `data=${encodeURIComponent(buildOverpassQuery(point, radiusMeters))}`
  });
  if (!response.ok) {
    throw new Error(
      `Overpass returned ${response.status}. It rate-limits and sheds load under pressure; retry later rather than in a loop.`
    );
  }
  const payload = (await response.json()) as { elements?: OverpassElement[] };
  const candidates = (payload.elements ?? [])
    .map(mapOverpassElement)
    .filter(
      (candidate): candidate is OsmVenueCandidate => candidate !== undefined
    );

  // Pairwise rather than keyed on a normalized string, because the same
  // place is mapped with different names as well as different positions -
  // see matchVenues, which weighs name, address and distance together. The
  // extract is under a thousand rows, so the quadratic scan costs nothing
  // measurable and buys a decision a string key cannot express.
  const kept: OsmVenueCandidate[] = [];
  for (const candidate of candidates) {
    const twinIndex = kept.findIndex(
      (existing) => matchVenues(existing, candidate).same
    );
    if (twinIndex === -1) {
      kept.push(candidate);
      continue;
    }
    kept[twinIndex] = mergeCandidates(kept[twinIndex]!, candidate);
  }
  return kept;
}
