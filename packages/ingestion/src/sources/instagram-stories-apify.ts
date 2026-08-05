/**
 * Instagram Stories via the "Advanced Instagram Stories Scraper" Apify actor
 * (id `dLL7b34nRrgN6ZV24`, `datavoyantlab/advanced-instagram-stories-scraper`),
 * not Meta's official Graph API: Stories are not exposed by Business
 * Discovery (unlike Feed/Reels, which Pulso Scout reads officially - see
 * sources/instagram-scout.ts). This is a third-party scraper, so it complements
 * rather than replaces Pulso Scout.
 *
 * Verified live against the actor's real build inputSchema before writing
 * this mapping (2026-08-03): input is `{ usernames: string[] }` (max 100),
 * output is one item per story with `image_versions2.candidates[].url` for
 * the actual image, `taken_at`/`expiring_at` as Unix seconds, and
 * `media_type` (1 = photo, 2 = video).
 *
 * Billing: PAY_PER_EVENT - $0.099 one-time actor-start charge plus
 * $0.003/username per run. Some free-tier Apify accounts require allowlist
 * approval from the actor author before use (see the actor's README) - if a
 * run fails with an access-denied message, that is the likely cause, not a
 * code bug.
 *
 * Output is intentionally NOT a RawIngestedEvent: like Pulso Scout, every
 * candidate here must go through human review before ever becoming a Pulso
 * event.
 */

const APIFY_ACTOR_ID = 'dLL7b34nRrgN6ZV24';
const APIFY_RUN_SYNC_URL = `https://api.apify.com/v2/actors/${APIFY_ACTOR_ID}/run-sync-get-dataset-items`;
// The run-sync endpoint itself times out server-side at 300s (see below),
// but a connection-level stall (DNS, TCP) before any response headers
// arrive isn't bounded by that - a client-side timeout covers that gap.
const REQUEST_TIMEOUT_MS = 340_000;
// Verified live (2026-08-03): the actor's input schema rejects more than
// 100 usernames per run with HTTP 400. Separately, the run-sync-get-
// dataset-items endpoint itself has a hard 300s server-side timeout - at
// this actor's observed ~4-5s/account pace, 100 accounts (400-500s)
// exceeds it (confirmed live: HTTP 408 run-timeout-exceeded). 40 keeps a
// single batch comfortably under 300s while still being a small number of
// sequential runs for a ~260-account watchlist.
const MAX_USERNAMES_PER_RUN = 40;

export interface InstagramStoryTarget {
  sourceId: string;
  handle: string;
}

export interface InstagramStorySignal {
  sourceId: string;
  handle: string;
  storyId: string;
  mediaType: 'photo' | 'video' | 'unknown';
  imageUrl?: string | undefined;
  takenAt?: string | undefined;
  expiringAt?: string | undefined;
  linkStickerUrls: string[];
  hashtags: string[];
  locationName?: string | undefined;
  observedAt: string;
}

interface ApifyStoryLinkSticker {
  story_link?: { url?: string };
}

interface ApifyStoryHashtag {
  hashtag?: { name?: string };
}

interface ApifyStoryItem {
  id?: string;
  pk?: number;
  media_type?: number;
  taken_at?: number;
  expiring_at?: number;
  image_versions2?: { candidates?: Array<{ url?: string }> };
  story_link_stickers?: ApifyStoryLinkSticker[];
  story_hashtags?: ApifyStoryHashtag[];
  location?: { name?: string };
  error?: string;
  username?: string;
}

function mapMediaType(
  mediaType: number | undefined
): InstagramStorySignal['mediaType'] {
  if (mediaType === 1) return 'photo';
  if (mediaType === 2) return 'video';
  return 'unknown';
}

export async function fetchInstagramStoriesSignals(
  targets: InstagramStoryTarget[],
  options: {
    apifyApiToken?: string;
    fetchImpl?: typeof fetch;
  } = {}
): Promise<InstagramStorySignal[]> {
  const apifyApiToken = options.apifyApiToken ?? process.env.APIFY_API_TOKEN;
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!apifyApiToken) {
    throw new Error(
      'APIFY_API_TOKEN is required to run the Instagram Stories connector.'
    );
  }
  if (targets.length === 0) return [];

  const handleToSourceId = new Map(
    targets.map((target) => [target.handle.toLowerCase(), target.sourceId])
  );

  const batches: InstagramStoryTarget[][] = [];
  for (let index = 0; index < targets.length; index += MAX_USERNAMES_PER_RUN) {
    batches.push(targets.slice(index, index + MAX_USERNAMES_PER_RUN));
  }

  const observedAt = new Date().toISOString();
  const signals: InstagramStorySignal[] = [];

  for (const batch of batches) {
    const url = new URL(APIFY_RUN_SYNC_URL);
    url.searchParams.set('token', apifyApiToken);

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(
      () => timeoutController.abort(),
      REQUEST_TIMEOUT_MS
    );
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usernames: batch.map((target) => target.handle)
        }),
        signal: timeoutController.signal
      });
    } catch (error) {
      if (timeoutController.signal.aborted) {
        throw new Error(
          `Apify Instagram Stories actor request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(
        `Apify Instagram Stories actor returned HTTP ${response.status}: ${await response.text()}`
      );
    }

    const items = (await response.json()) as ApifyStoryItem[];
    for (const item of items) {
      if (item.error || !item.id) continue;
      const sourceId =
        handleToSourceId.get((item.username ?? '').toLowerCase()) ?? 'unknown';
      signals.push({
        sourceId,
        handle: item.username ?? '',
        storyId: item.id,
        mediaType: mapMediaType(item.media_type),
        imageUrl: item.image_versions2?.candidates?.[0]?.url,
        takenAt: item.taken_at
          ? new Date(item.taken_at * 1000).toISOString()
          : undefined,
        expiringAt: item.expiring_at
          ? new Date(item.expiring_at * 1000).toISOString()
          : undefined,
        linkStickerUrls: (item.story_link_stickers ?? [])
          .map((sticker) => sticker.story_link?.url)
          .filter((linkUrl): linkUrl is string => Boolean(linkUrl)),
        hashtags: (item.story_hashtags ?? [])
          .map((hashtag) => hashtag.hashtag?.name)
          .filter((name): name is string => Boolean(name)),
        locationName: item.location?.name,
        observedAt
      });
    }
  }

  return signals;
}
