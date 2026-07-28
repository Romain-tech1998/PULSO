import type { InstagramScoutReviewItem } from './instagram-scout-review.js';

export type InstagramScoutAutomationDecision =
  'likely_event' | 'likely_not_event' | 'uncertain';

export type InstagramScoutReviewPriority = 'high' | 'normal' | 'low';

export interface InstagramScoutTriageResult {
  decision: InstagramScoutAutomationDecision;
  reviewPriority: InstagramScoutReviewPriority;
  confidence: number;
  score: number;
  reasons: string[];
  dateMentions: string[];
  manualReviewRequired: boolean;
}

const eventPatterns: Array<[RegExp, string, number]> = [
  [
    /\b(ticket|tickets|billet|billets|billetterie|on sale|en vente)\b/iu,
    'ticketing_language',
    3
  ],
  [
    /\b(concert|festival|show|spectacle|soir[ée]e|party|afterparty|dj set|live)\b/iu,
    'event_language',
    2
  ],
  [
    /\b(lineup|programmation|programme|présente|presents|avec|featuring|feat\.?)\b/iu,
    'lineup_or_programming_language',
    1
  ],
  [
    /\b(ce soir|tonight|demain|tomorrow|vendredi|friday|samedi|saturday|dimanche|sunday)\b/iu,
    'upcoming_time_language',
    2
  ],
  [
    /\b(portes|doors)\s*(?:à|at|:)?\s*\d{1,2}(?::|h)\d{0,2}\b/iu,
    'doors_time',
    2
  ]
];

const recapPatterns: Array<[RegExp, string, number]> = [
  [
    /\b(recap|throwback|last night|hier soir|what a night|souvenirs?|memories)\b/iu,
    'recap_language',
    -4
  ],
  [
    /\b(merci à tous|thank you all|thanks for coming|photos? (?:de|from))\b/iu,
    'past_event_thanks',
    -3
  ]
];

const genericPatterns: Array<[RegExp, string, number]> = [
  [
    /\b(concours|contest|giveaway|à gagner|win (?:a|two|2))\b/iu,
    'contest_language',
    -2
  ],
  [
    /\b(nouveau menu|new menu|merch|merchandise|now hiring|on embauche)\b/iu,
    'generic_promotion',
    -3
  ]
];

const dateMentionPattern =
  /\b(?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{1,2}\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|january|february|march|april|may|june|july|august|september|october|november|december)|(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?)\b/giu;

function normalizedConfidence(score: number): number {
  return Math.min(0.95, Math.max(0.5, 0.5 + Math.abs(score) * 0.08));
}

/**
 * Conservative, explainable first-pass triage. It recommends what a signal
 * most likely is but never accepts or publishes an event.
 */
export function triageInstagramScoutItem(
  item: InstagramScoutReviewItem
): InstagramScoutTriageResult {
  const caption = item.caption?.trim() ?? '';
  const reasons: string[] = [];
  let score = 0;

  for (const [pattern, reason, weight] of [
    ...eventPatterns,
    ...recapPatterns,
    ...genericPatterns
  ]) {
    if (pattern.test(caption)) {
      score += weight;
      reasons.push(reason);
    }
  }

  const dateMentions = [...caption.matchAll(dateMentionPattern)]
    .map((match) => match[0])
    .filter((value, index, values) => values.indexOf(value) === index);
  if (dateMentions.length > 0) {
    score += 2;
    reasons.push('explicit_date');
  }

  if (!caption) {
    score -= 2;
    reasons.push('missing_caption');
  }

  const hasNegativeSignal = reasons.some((reason) =>
    ['recap_language', 'past_event_thanks', 'generic_promotion'].includes(
      reason
    )
  );
  const hasStrongEventSignal = reasons.some((reason) =>
    [
      'ticketing_language',
      'event_language',
      'upcoming_time_language',
      'doors_time',
      'explicit_date'
    ].includes(reason)
  );
  const hasForwardEventSignal = reasons.some((reason) =>
    [
      'ticketing_language',
      'upcoming_time_language',
      'doors_time',
      'explicit_date'
    ].includes(reason)
  );

  if (score >= 4 && hasStrongEventSignal && !hasNegativeSignal) {
    return {
      decision: 'likely_event',
      reviewPriority: 'high',
      confidence: normalizedConfidence(score),
      score,
      reasons,
      dateMentions,
      manualReviewRequired: true
    };
  }

  if (score <= -3 && !hasForwardEventSignal) {
    return {
      decision: 'likely_not_event',
      reviewPriority: 'low',
      confidence: normalizedConfidence(score),
      score,
      reasons,
      dateMentions,
      manualReviewRequired: false
    };
  }

  return {
    decision: 'uncertain',
    reviewPriority: 'normal',
    confidence: normalizedConfidence(score),
    score,
    reasons,
    dateMentions,
    manualReviewRequired: true
  };
}
