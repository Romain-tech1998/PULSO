import type {
  InstagramScoutMediaAsset,
  InstagramScoutSignal
} from './sources/instagram-scout.js';
import {
  extractInstagramScoutFacts,
  type InstagramScoutExtraction
} from './instagram-scout-extraction.js';
import {
  triageInstagramScoutItem,
  type InstagramScoutTriageResult
} from './instagram-scout-triage.js';

export type InstagramScoutReviewOutcome =
  | 'needs_review'
  | 'accepted'
  | 'duplicate'
  | 'not_an_event'
  | 'outside_mvp'
  | 'insufficient_information'
  | 'stale'
  | 'source_unavailable';

export interface InstagramScoutReviewItem {
  reviewId: string;
  status: InstagramScoutReviewOutcome;
  sourceId: string;
  handle: string;
  mediaId: string;
  mediaProductType?: string | undefined;
  mediaType?: string | undefined;
  caption?: string | undefined;
  permalink?: string | undefined;
  sourceTimestamp?: string | undefined;
  mediaAssets?: InstagramScoutMediaAsset[] | undefined;
  observedAt: string;
  reviewerNotes: string;
  automation?: InstagramScoutTriageResult | undefined;
  extraction?: InstagramScoutExtraction | undefined;
}

export interface InstagramScoutReviewQueue {
  generatedAt: string;
  publicationAuthorized: false;
  itemCount: number;
  sourceCount: number;
  productTypeCounts: Record<string, number>;
  items: InstagramScoutReviewItem[];
}

/**
 * Produces a human-review queue only. It deliberately performs no event
 * extraction or acceptance decision and cannot authorize publication.
 */
export function buildInstagramScoutReviewQueue(
  signals: InstagramScoutSignal[],
  generatedAt = new Date().toISOString()
): InstagramScoutReviewQueue {
  const uniqueSignals = new Map<string, InstagramScoutSignal>();
  for (const signal of signals) {
    uniqueSignals.set(`${signal.sourceId}:${signal.mediaId}`, signal);
  }

  const sortedSignals = [...uniqueSignals.values()].sort((left, right) => {
    const timestampOrder = (right.timestamp ?? '').localeCompare(
      left.timestamp ?? ''
    );
    return timestampOrder || left.sourceId.localeCompare(right.sourceId);
  });

  const productTypeCounts: Record<string, number> = {};
  for (const signal of sortedSignals) {
    const productType = signal.mediaProductType ?? 'UNKNOWN';
    productTypeCounts[productType] = (productTypeCounts[productType] ?? 0) + 1;
  }

  return {
    generatedAt,
    publicationAuthorized: false,
    itemCount: sortedSignals.length,
    sourceCount: new Set(sortedSignals.map((signal) => signal.sourceId)).size,
    productTypeCounts,
    items: sortedSignals.map((signal) => ({
      reviewId: `${signal.sourceId}:${signal.mediaId}`,
      status: 'needs_review',
      sourceId: signal.sourceId,
      handle: signal.handle,
      mediaId: signal.mediaId,
      mediaProductType: signal.mediaProductType,
      mediaType: signal.mediaType,
      caption: signal.caption,
      permalink: signal.permalink,
      sourceTimestamp: signal.timestamp,
      mediaAssets: signal.mediaAssets ?? [],
      observedAt: signal.observedAt,
      reviewerNotes: ''
    }))
  };
}

export function automateInstagramScoutReviewQueue(
  queue: InstagramScoutReviewQueue
): InstagramScoutReviewQueue {
  return {
    ...queue,
    items: queue.items.map((item) => {
      const automation = triageInstagramScoutItem(item);
      return {
        ...item,
        automation,
        extraction: extractInstagramScoutFacts(item, automation)
      };
    })
  };
}
