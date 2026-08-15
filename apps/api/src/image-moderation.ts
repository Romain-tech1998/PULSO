/**
 * Image screening (DEC-0021).
 *
 * Split in two on purpose. A provider answers one question — "what does this
 * image score on each category" — and knows nothing about what Pulso does
 * with that. This module owns the thresholds and turns scores into one of
 * three decisions, so swapping or adding an engine later cannot quietly
 * change what counts as publishable.
 */

/** Raw per-category scores, 0..1, exactly as the provider reported them. */
export type CategoryScores = Record<string, number>;

export interface ImageModerationProvider {
  /** Recorded on the decision, so a stored verdict says what produced it. */
  readonly name: string;
  moderate(image: Buffer, mimeType: string): Promise<CategoryScores>;
}

export type ImageModerationDecision = 'approved' | 'flagged' | 'rejected';

export interface ImageModerationResult {
  decision: ImageModerationDecision;
  provider: string;
  /** The categories that actually drove the decision, worst first. */
  categories: string[];
  scores: CategoryScores;
  reason: string | undefined;
}

export interface CategoryThreshold {
  /** At or above this, the upload is refused outright. */
  reject: number;
  /** At or above this, a human looks at it before anyone else does. */
  flag: number;
}

/**
 * Every threshold lives here, and nowhere else. A route must never decide
 * what is publishable — it asks this module and acts on the answer.
 *
 * The numbers are deliberately cautious rather than tuned: Pulso has no
 * corpus to tune against yet, and the cost of a false flag is one
 * administrator glance while the cost of a false approve is a published
 * image. `sexual/minors` sits far below everything else because it is the
 * one category where "probably fine" is not an acceptable answer.
 */
export const IMAGE_MODERATION_THRESHOLDS: Record<string, CategoryThreshold> = {
  'sexual/minors': { reject: 0.05, flag: 0.01 },
  sexual: { reject: 0.8, flag: 0.4 },
  'violence/graphic': { reject: 0.85, flag: 0.45 },
  violence: { reject: 0.9, flag: 0.6 },
  'self-harm': { reject: 0.7, flag: 0.35 },
  'self-harm/intent': { reject: 0.7, flag: 0.35 },
  'self-harm/instructions': { reject: 0.7, flag: 0.35 },
  'hate/threatening': { reject: 0.7, flag: 0.35 },
  hate: { reject: 0.85, flag: 0.5 },
  'harassment/threatening': { reject: 0.8, flag: 0.45 },
  harassment: { reject: 0.9, flag: 0.6 },
  illicit: { reject: 0.9, flag: 0.6 },
  'illicit/violent': { reject: 0.8, flag: 0.45 }
};

/**
 * Applied to any category a provider reports that is not named above, so a
 * model gaining a category does not silently gain a free pass.
 */
export const DEFAULT_IMAGE_MODERATION_THRESHOLD: CategoryThreshold = {
  reject: 0.9,
  flag: 0.5
};

function thresholdFor(category: string): CategoryThreshold {
  return (
    IMAGE_MODERATION_THRESHOLDS[category] ?? DEFAULT_IMAGE_MODERATION_THRESHOLD
  );
}

/** Turns provider scores into a decision. Pure, so it is directly testable. */
export function decideFromScores(
  scores: CategoryScores,
  provider: string
): ImageModerationResult {
  const rejecting: Array<[string, number]> = [];
  const flagging: Array<[string, number]> = [];

  for (const [category, score] of Object.entries(scores)) {
    if (typeof score !== 'number' || Number.isNaN(score)) continue;
    const threshold = thresholdFor(category);
    if (score >= threshold.reject) rejecting.push([category, score]);
    else if (score >= threshold.flag) flagging.push([category, score]);
  }

  const worstFirst = (entries: Array<[string, number]>) =>
    entries.sort((a, b) => b[1] - a[1]).map(([category]) => category);

  if (rejecting.length > 0) {
    const categories = worstFirst(rejecting);
    return {
      decision: 'rejected',
      provider,
      categories,
      scores,
      reason: `Refused on ${categories.join(', ')}.`
    };
  }
  if (flagging.length > 0) {
    const categories = worstFirst(flagging);
    return {
      decision: 'flagged',
      provider,
      categories,
      scores,
      reason: `Needs review on ${categories.join(', ')}.`
    };
  }
  return {
    decision: 'approved',
    provider,
    categories: [],
    scores,
    reason: undefined
  };
}

/**
 * Screens one image. Never throws, and never answers `approved` when it did
 * not actually see a verdict: an unavailable, unconfigured or misbehaving
 * provider produces `flagged`, so a third party being down can never become
 * permission to publish (DEC-0021 §3).
 *
 * The consequence is deliberate and worth knowing: with no provider wired,
 * every upload lands in the administration queue.
 */
export async function moderateImage(
  image: Buffer,
  mimeType: string,
  provider: ImageModerationProvider | undefined,
  log?: (message: string) => void
): Promise<ImageModerationResult> {
  if (!provider) {
    return {
      decision: 'flagged',
      provider: 'none',
      categories: [],
      scores: {},
      reason: 'No moderation provider is configured.'
    };
  }
  try {
    const scores = await provider.moderate(image, mimeType);
    return decideFromScores(scores, provider.name);
  } catch (error) {
    // The message only - never the image, never the key, never the caller.
    log?.(
      `image moderation provider failed: ${
        error instanceof Error ? error.message : 'unknown error'
      }`
    );
    return {
      decision: 'flagged',
      provider: provider.name,
      categories: [],
      scores: {},
      reason: 'The moderation provider could not be reached.'
    };
  }
}
