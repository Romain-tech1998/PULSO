/**
 * Resolves a photo for an imported venue, and says where it came from.
 *
 * Two sources, in very different legal positions, which is why every result
 * carries a `source` the database stores rather than being flattened into a
 * bare URL:
 *
 * - **Wikimedia Commons**, reached from an OSM `wikimedia_commons` tag or a
 *   `wikidata` id whose P18 holds one. Freely licensed, but the licence is
 *   only honoured if the credit line travels with the image, so the artist
 *   and licence name are read from the same API call and stored.
 * - **The venue's own website**, read as its Open Graph preview image. This
 *   is the business's own copyrighted photo, published for exactly this kind
 *   of preview. It is hotlinked, never copied, and any of them can be pulled
 *   permanently with the venue-photos ops command.
 *
 * Coverage, measured on the real 30 km Montréal extract rather than assumed:
 * of 860 named venues, 4 carry `image`, 1 `wikimedia_commons`, and 78 a
 * `wikidata` id of which 49 resolve to a Commons photo. 299 publish a
 * website. So Commons alone answers about 6% and the websites take it to
 * roughly 40%.
 */
import type { OsmPhotoHints } from '../sources/openstreetmap-venues.js';

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT =
  'Pulso/0.1 (Montreal event directory; contact via pulsonight.com)';

/** Both APIs accept up to 50 ids per call for anonymous clients. */
const BATCH_SIZE = 50;

export type VenuePhotoSource =
  'wikimedia_commons' | 'website_og' | 'osm_image_tag';

/**
 * An `image=*` tag points at an arbitrary host under an unstated licence, so
 * it is credited to OSM - which is where the claim actually comes from - and
 * is as removable as any borrowed photo. Kept distinct from
 * `wikimedia_commons` because that one really is freely licensed and this one
 * only might be.
 */
export const OSM_IMAGE_TAG_ATTRIBUTION = 'Photo : © OpenStreetMap contributors';

export interface ResolvedVenuePhoto {
  imageUrl: string;
  source: VenuePhotoSource;
  /** The credit the licence requires. Absent when the source imposes none. */
  attribution?: string | undefined;
  /** The page an operator opens to handle a takedown or check a licence. */
  pageUrl?: string | undefined;
}

interface FetchOptions {
  fetchImpl?: typeof fetch;
  /** Called between outbound calls so callers can honour rate limits. */
  pause?: (milliseconds: number) => Promise<void>;
}

const defaultPause = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function getJson(
  url: string,
  fetchImpl: typeof fetch
): Promise<unknown | undefined> {
  const response = await fetchImpl(url, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) return undefined;
  return (await response.json()) as unknown;
}

/**
 * Wikidata entity id -> Commons file name, via the P18 "image" claim.
 *
 * Batched because it is the difference between 2 requests and 78 on a full
 * Montréal run. Entities without P18 are simply absent from the result;
 * there is nothing to fall back to and nothing to guess.
 */
export async function resolveWikidataImages(
  entityIds: string[],
  options: FetchOptions = {}
): Promise<Map<string, string>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const pause = options.pause ?? defaultPause;
  const found = new Map<string, string>();
  const unique = [...new Set(entityIds.filter(Boolean))];

  for (const [index, batch] of chunk(unique, BATCH_SIZE).entries()) {
    if (index > 0) await pause(200);
    const url = `${WIKIDATA_API}?action=wbgetentities&props=claims&format=json&ids=${batch
      .map(encodeURIComponent)
      .join('|')}`;
    const payload = (await getJson(url, fetchImpl)) as
      | {
          entities?: Record<
            string,
            {
              claims?: Record<
                string,
                Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>
              >;
            }
          >;
        }
      | undefined;
    for (const [entityId, entity] of Object.entries(payload?.entities ?? {})) {
      const value = entity.claims?.['P18']?.[0]?.mainsnak?.datavalue?.value;
      if (typeof value === 'string' && value.trim()) {
        found.set(entityId, value);
      }
    }
  }
  return found;
}

/** Strips the HTML Commons returns in its Artist field down to a name. */
export function plainTextCredit(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Composes the credit line the licence requires, from what Commons returned. */
export function composeCommonsAttribution(
  artist: string | undefined,
  licence: string | undefined
): string | undefined {
  const author = artist ? plainTextCredit(artist) : undefined;
  if (author && licence) return `Photo : ${author} (${licence})`;
  if (author) return `Photo : ${author}`;
  if (licence) return `Photo : Wikimedia Commons (${licence})`;
  return 'Photo : Wikimedia Commons';
}

function normalizeCommonsFileName(value: string): string {
  // Tags appear both as "File:X.jpg" and bare "X.jpg"; the API wants the
  // prefixed form, and some tags carry a category instead of a file, which
  // has no single image behind it and is dropped rather than guessed at.
  const trimmed = value.trim();
  if (/^category:/i.test(trimmed)) return '';
  return /^file:/i.test(trimmed) ? trimmed : `File:${trimmed}`;
}

/**
 * Commons file names -> a usable URL plus the credit its licence requires.
 *
 * `iiurlwidth` asks Commons for a scaled rendition: the originals are
 * routinely 4000 px and several megabytes, which is not what belongs behind a
 * venue thumbnail.
 */
export async function resolveCommonsPhotos(
  fileNames: string[],
  options: FetchOptions & { width?: number } = {}
): Promise<Map<string, ResolvedVenuePhoto>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const pause = options.pause ?? defaultPause;
  const width = options.width ?? 800;
  const resolved = new Map<string, ResolvedVenuePhoto>();

  const titles = [
    ...new Set(fileNames.map(normalizeCommonsFileName).filter(Boolean))
  ];

  for (const [index, batch] of chunk(titles, BATCH_SIZE).entries()) {
    if (index > 0) await pause(200);
    const url =
      `${COMMONS_API}?action=query&format=json&prop=imageinfo` +
      `&iiprop=url|extmetadata&iiurlwidth=${width}&titles=${batch
        .map(encodeURIComponent)
        .join('|')}`;
    const payload = (await getJson(url, fetchImpl)) as
      | {
          query?: {
            pages?: Record<
              string,
              {
                title?: string;
                missing?: unknown;
                imageinfo?: Array<{
                  url?: string;
                  thumburl?: string;
                  descriptionurl?: string;
                  extmetadata?: Record<string, { value?: string }>;
                }>;
              }
            >;
          };
        }
      | undefined;

    for (const page of Object.values(payload?.query?.pages ?? {})) {
      if (page.missing !== undefined || !page.title) continue;
      const info = page.imageinfo?.[0];
      const imageUrl = info?.thumburl ?? info?.url;
      if (!imageUrl) continue;
      const attribution = composeCommonsAttribution(
        info?.extmetadata?.['Artist']?.value,
        info?.extmetadata?.['LicenseShortName']?.value
      );
      resolved.set(page.title, {
        imageUrl,
        source: 'wikimedia_commons',
        ...(attribution ? { attribution } : {}),
        ...(info?.descriptionurl ? { pageUrl: info.descriptionurl } : {})
      });
    }
  }
  return resolved;
}

/**
 * Reads the Open Graph preview image a site publishes about itself.
 *
 * Only `og:image` and `twitter:image` are accepted. Scraping `<img>` tags
 * would pick up logos, spacers and whatever else happens to be in the markup;
 * the Open Graph tag is the one place a site states "this is the picture that
 * represents us", which is both better data and a much narrower claim on
 * someone else's content.
 */
export function extractOpenGraphImage(
  html: string,
  baseUrl: string
): string | undefined {
  const head = html.slice(0, 200_000);
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url|:url)?["'][^>]*>/gi,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]*>/gi
  ];
  for (const pattern of patterns) {
    for (const tag of head.match(pattern) ?? []) {
      const content = /content=["']([^"']+)["']/i.exec(tag)?.[1]?.trim();
      if (!content) continue;
      try {
        const absolute = new URL(content, baseUrl);
        if (absolute.protocol !== 'https:' && absolute.protocol !== 'http:') {
          continue;
        }
        return absolute.toString();
      } catch {
        // A malformed content attribute is not worth failing an import over.
      }
    }
  }
  return undefined;
}

/**
 * Fetches a venue's site and reads its preview image.
 *
 * Never throws: an import of 800 venues will meet dead domains, expired
 * certificates and sites that simply hang, and none of those is a reason to
 * abandon the run. A missing photo is the correct outcome in every one of
 * those cases.
 */
export async function resolveWebsitePhoto(
  website: string,
  options: FetchOptions = {}
): Promise<ResolvedVenuePhoto | undefined> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let target: URL;
  try {
    target = new URL(website);
  } catch {
    return undefined;
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return undefined;
  }

  try {
    const response = await fetchImpl(target.toString(), {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) return undefined;

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('html')) return undefined;
    // A few venue "sites" are a single enormous JS bundle inlined into the
    // document. The Open Graph tags live in <head> either way, so a document
    // this size has nothing extra to offer and is not worth the memory.
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > 5_000_000) return undefined;

    const html = await response.text();
    const imageUrl = extractOpenGraphImage(
      html,
      response.url || target.toString()
    );
    if (!imageUrl) return undefined;

    return {
      imageUrl,
      source: 'website_og',
      // No attribution line: this is the venue's own photo of itself, and
      // captioning it "Photo: <the venue>" under its own listing would be
      // noise rather than a credit anybody needs.
      pageUrl: target.toString()
    };
  } catch {
    return undefined;
  }
}

/**
 * Resolves photos for a whole batch of candidates.
 *
 * Ordered by how well Pulso can stand behind the image: an explicit `image`
 * tag and Commons first, because those are freely licensed and describe the
 * place; the site's own preview last, because it is borrowed. Websites are
 * fetched one at a time with a pause - several hundred unrelated hosts is
 * not a reason to behave like a crawler.
 */
export async function resolveVenuePhotos(
  candidates: ReadonlyArray<{ key: string; hints: OsmPhotoHints }>,
  options: FetchOptions & {
    includeWebsites?: boolean;
    onProgress?: (done: number, total: number) => void;
  } = {}
): Promise<Map<string, ResolvedVenuePhoto>> {
  const pause = options.pause ?? defaultPause;
  const photos = new Map<string, ResolvedVenuePhoto>();

  const wikidataIds = candidates
    .map(({ hints }) => hints.wikidata)
    .filter((value): value is string => Boolean(value));
  const wikidataImages = await resolveWikidataImages(wikidataIds, options);

  const fileNameFor = (hints: OsmPhotoHints): string | undefined =>
    hints.wikimediaCommons ??
    (hints.wikidata ? wikidataImages.get(hints.wikidata) : undefined);

  const commonsPhotos = await resolveCommonsPhotos(
    candidates
      .map(({ hints }) => fileNameFor(hints))
      .filter((value): value is string => Boolean(value)),
    options
  );

  const needingWebsite: Array<{ key: string; website: string }> = [];

  for (const { key, hints } of candidates) {
    if (hints.image) {
      photos.set(key, {
        imageUrl: hints.image,
        source: 'osm_image_tag',
        attribution: OSM_IMAGE_TAG_ATTRIBUTION,
        pageUrl: hints.image
      });
      continue;
    }
    const fileName = fileNameFor(hints);
    const commons = fileName
      ? commonsPhotos.get(normalizeCommonsFileName(fileName))
      : undefined;
    if (commons) {
      photos.set(key, commons);
      continue;
    }
    if (options.includeWebsites !== false && hints.website) {
      needingWebsite.push({ key, website: hints.website });
    }
  }

  for (const [index, { key, website }] of needingWebsite.entries()) {
    if (index > 0) await pause(250);
    const photo = await resolveWebsitePhoto(website, options);
    if (photo) photos.set(key, photo);
    options.onProgress?.(index + 1, needingWebsite.length);
  }

  return photos;
}
