/**
 * Instagram Business Discovery, scoped to Pulso Scout (DEC-0006).
 * https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery/
 *
 * This is deliberately NOT a scraper. It only works against a fixed, known
 * watchlist of public Instagram Business/Creator accounts (the handles already
 * captured in docs/data/research/montreal-source-registry.csv) using Meta's
 * official Graph API endpoint built for exactly this purpose: reading public
 * metadata and recent media of OTHER business accounts by username, from an
 * app you control.
 *
 * Requirements before this can run for real:
 * 1. A Meta developer app with Instagram Graph API access
 *    (https://developers.facebook.com/apps).
 * 2. Your own Instagram professional (Business or Creator) account, linked to
 *    a Facebook Page you manage, used as the querying identity.
 * 3. A user or system access token with `instagram_basic` permission for that
 *    linked account.
 * 4. For anything beyond a handful of test accounts in Development mode, Meta
 *    App Review (Business Verification + Instagram Public Content Access) is
 *    required. Do not assume production-scale access without it.
 *
 * Output is intentionally NOT a RawIngestedEvent: a caption is a lead, not a
 * structured event. Per DEC-0006, candidates from this connector must go
 * through human review/evidence capture before ever becoming a Pulso event.
 */

export interface InstagramScoutTarget {
  sourceId: string;
  handle: string;
}

export interface InstagramScoutSignal {
  sourceId: string;
  handle: string;
  mediaId: string;
  caption?: string | undefined;
  mediaType?: string | undefined;
  permalink?: string | undefined;
  timestamp?: string | undefined;
  observedAt: string;
}

interface BusinessDiscoveryMedia {
  id: string;
  caption?: string;
  media_type?: string;
  permalink?: string;
  timestamp?: string;
}

interface BusinessDiscoveryResponse {
  business_discovery?: {
    media?: { data?: BusinessDiscoveryMedia[] };
  };
  error?: { message: string };
}

const GRAPH_API_VERSION = 'v21.0';

export async function fetchInstagramScoutSignals(
  targets: InstagramScoutTarget[],
  options: {
    queryingInstagramUserId?: string;
    accessToken?: string;
    fetchImpl?: typeof fetch;
    mediaFieldsLimit?: number;
  } = {}
): Promise<InstagramScoutSignal[]> {
  const queryingInstagramUserId =
    options.queryingInstagramUserId ?? process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const accessToken = options.accessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN;
  const fetchImpl = options.fetchImpl ?? fetch;
  const mediaLimit = options.mediaFieldsLimit ?? 10;

  if (!queryingInstagramUserId || !accessToken) {
    throw new Error(
      'INSTAGRAM_BUSINESS_ACCOUNT_ID and INSTAGRAM_ACCESS_TOKEN are required. ' +
        'See the header comment in instagram-scout.ts for the Meta app setup this depends on.'
    );
  }

  const observedAt = new Date().toISOString();
  const signals: InstagramScoutSignal[] = [];

  for (const target of targets) {
    const url = new URL(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${queryingInstagramUserId}`
    );
    url.searchParams.set(
      'fields',
      `business_discovery.username(${target.handle}){media.limit(${mediaLimit}){id,caption,media_type,permalink,timestamp}}`
    );
    url.searchParams.set('access_token', accessToken);

    const response = await fetchImpl(url.toString());
    const body = (await response.json()) as BusinessDiscoveryResponse;
    if (!response.ok || body.error) {
      // A single unreachable/private/renamed account must not abort the whole
      // watchlist run; record nothing for it and continue.
      continue;
    }
    const media = body.business_discovery?.media?.data ?? [];
    for (const item of media) {
      signals.push({
        sourceId: target.sourceId,
        handle: target.handle,
        mediaId: item.id,
        caption: item.caption,
        mediaType: item.media_type,
        permalink: item.permalink,
        timestamp: item.timestamp,
        observedAt
      });
    }
  }

  return signals;
}
