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
 * 3. A user or system access token with `instagram_basic`,
 *    `instagram_manage_insights`, `pages_read_engagement`, and
 *    `pages_show_list` permissions for that linked account.
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
  mediaProductType?: string | undefined;
  permalink?: string | undefined;
  timestamp?: string | undefined;
  mediaAssets?: InstagramScoutMediaAsset[] | undefined;
  observedAt: string;
}

export interface InstagramScoutMediaAsset {
  mediaId: string;
  mediaType?: string | undefined;
  mediaUrl?: string | undefined;
  thumbnailUrl?: string | undefined;
}

interface BusinessDiscoveryMedia {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  timestamp?: string;
  media_url?: string;
  thumbnail_url?: string;
  children?: {
    data?: Array<{
      id: string;
      media_type?: string;
      media_url?: string;
      thumbnail_url?: string;
    }>;
  };
}

interface BusinessDiscoveryResponse {
  business_discovery?: {
    media?: { data?: BusinessDiscoveryMedia[] };
  };
  error?: { message: string };
}

const GRAPH_API_VERSION = 'v25.0';

export async function fetchInstagramScoutSignals(
  targets: InstagramScoutTarget[],
  options: {
    queryingInstagramUserId?: string;
    accessToken?: string;
    fetchImpl?: typeof fetch;
    mediaFieldsLimit?: number;
    onTargetError?: (target: InstagramScoutTarget, message: string) => void;
  } = {}
): Promise<InstagramScoutSignal[]> {
  const queryingInstagramUserId =
    options.queryingInstagramUserId ??
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
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
      `business_discovery.username(${target.handle}){media.limit(${mediaLimit}){id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,children{id,media_type,media_url,thumbnail_url}}}`
    );
    url.searchParams.set('access_token', accessToken);

    const response = await fetchImpl(url.toString());
    const body = (await response.json()) as BusinessDiscoveryResponse;
    if (!response.ok || body.error) {
      // A single unreachable/private/renamed account must not abort the whole
      // watchlist run; record nothing for it and continue.
      options.onTargetError?.(
        target,
        body.error?.message ?? `Meta Graph API returned HTTP ${response.status}`
      );
      continue;
    }
    const media = body.business_discovery?.media?.data ?? [];
    for (const item of media) {
      const childAssets = item.children?.data ?? [];
      const mediaAssets =
        childAssets.length > 0
          ? childAssets.map((child) => ({
              mediaId: child.id,
              mediaType: child.media_type,
              mediaUrl: child.media_url,
              thumbnailUrl: child.thumbnail_url
            }))
          : [
              {
                mediaId: item.id,
                mediaType: item.media_type,
                mediaUrl: item.media_url,
                thumbnailUrl: item.thumbnail_url
              }
            ];
      signals.push({
        sourceId: target.sourceId,
        handle: target.handle,
        mediaId: item.id,
        caption: item.caption,
        mediaType: item.media_type,
        mediaProductType: item.media_product_type,
        permalink: item.permalink,
        timestamp: item.timestamp,
        mediaAssets,
        observedAt
      });
    }
  }

  return signals;
}
