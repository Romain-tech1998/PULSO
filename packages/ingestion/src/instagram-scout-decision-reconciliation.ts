import type { InstagramScoutReviewOutcome } from './instagram-scout-review.js';

export interface InstagramScoutOperatorDecision {
  reviewId: string;
  outcome: InstagramScoutReviewOutcome;
  reviewerNotes: string;
  reviewedAt?: string;
}

export interface InstagramScoutDecisionCandidate {
  reviewId: string;
  dateMentions: string[];
  timeMentions: string[];
  possibleVenueMentions: string[];
}

export interface InstagramScoutDecisionReconciliation {
  reviewId: string;
  humanOutcome: InstagramScoutReviewOutcome;
  resolution:
    | 'excluded_by_review'
    | 'blocked_outside_mvp'
    | 'blocked_missing_facts'
    | 'ready_for_mapping';
  venueName?: string;
  venueCity?: string;
  missingFacts: Array<'date' | 'time' | 'venue'>;
  publicationAuthorized: false;
}

export function reconcileInstagramScoutDecisions(
  decisions: InstagramScoutOperatorDecision[],
  candidates: InstagramScoutDecisionCandidate[],
  venueCities: Readonly<Record<string, string>>,
  mvpCity = 'Montréal'
): InstagramScoutDecisionReconciliation[] {
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.reviewId, candidate])
  );

  return decisions.map((decision) => {
    const candidate = candidateById.get(decision.reviewId);
    const venueName = candidate?.possibleVenueMentions[0];
    const venueCity = venueName ? venueCities[venueName] : undefined;
    const missingFacts: InstagramScoutDecisionReconciliation['missingFacts'] =
      [];
    if (!candidate?.dateMentions.length) missingFacts.push('date');
    if (!candidate?.timeMentions.length) missingFacts.push('time');
    if (!venueName) missingFacts.push('venue');

    if (decision.outcome !== 'accepted') {
      return {
        reviewId: decision.reviewId,
        humanOutcome: decision.outcome,
        resolution: 'excluded_by_review',
        ...(venueName ? { venueName } : {}),
        ...(venueCity ? { venueCity } : {}),
        missingFacts,
        publicationAuthorized: false
      };
    }

    if (venueCity && venueCity !== mvpCity) {
      return {
        reviewId: decision.reviewId,
        humanOutcome: decision.outcome,
        resolution: 'blocked_outside_mvp',
        ...(venueName ? { venueName } : {}),
        venueCity,
        missingFacts,
        publicationAuthorized: false
      };
    }

    return {
      reviewId: decision.reviewId,
      humanOutcome: decision.outcome,
      resolution:
        missingFacts.length > 0 ? 'blocked_missing_facts' : 'ready_for_mapping',
      ...(venueName ? { venueName } : {}),
      ...(venueCity ? { venueCity } : {}),
      missingFacts,
      publicationAuthorized: false
    };
  });
}
