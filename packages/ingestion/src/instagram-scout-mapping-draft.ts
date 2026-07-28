import type { EventCategory } from '@pulso/domain';

import type { InstagramScoutDecisionReconciliation } from './instagram-scout-decision-reconciliation.js';
import type { RawIngestedEvent } from './types.js';

export interface InstagramScoutValidatedEventFacts {
  title: string;
  category: EventCategory;
  startsAt: string;
  endsAt?: string;
  description?: string;
  organizer?: string;
  price?: RawIngestedEvent['price'];
  ticketingUrl?: string;
  imageUrl?: string;
  venue: {
    name: string;
    address: string;
    city: string;
    point: { longitude: number; latitude: number };
  };
  source: {
    sourceId: string;
    sourceName: string;
    sourceUrl: string;
    observedAt: string;
  };
}

export interface InstagramScoutMappingDraftResult {
  reviewId: string;
  status:
    | 'mapping_draft_ready'
    | 'blocked_by_reconciliation'
    | 'blocked_incomplete_validated_facts';
  missingValidatedFacts: Array<
    'title' | 'start' | 'venue_address' | 'venue_point'
  >;
  rawEvent?: RawIngestedEvent;
  databaseWriteAuthorized: false;
  publicationAuthorized: false;
}

export function prepareInstagramScoutMappingDraft(
  reconciliation: InstagramScoutDecisionReconciliation,
  facts: InstagramScoutValidatedEventFacts
): InstagramScoutMappingDraftResult {
  if (reconciliation.resolution !== 'ready_for_mapping') {
    return {
      reviewId: reconciliation.reviewId,
      status: 'blocked_by_reconciliation',
      missingValidatedFacts: [],
      databaseWriteAuthorized: false,
      publicationAuthorized: false
    };
  }

  const missingValidatedFacts: InstagramScoutMappingDraftResult['missingValidatedFacts'] =
    [];
  if (!facts.title.trim()) missingValidatedFacts.push('title');
  if (Number.isNaN(new Date(facts.startsAt).getTime())) {
    missingValidatedFacts.push('start');
  }
  if (!facts.venue.address.trim()) {
    missingValidatedFacts.push('venue_address');
  }
  if (
    !Number.isFinite(facts.venue.point.longitude) ||
    !Number.isFinite(facts.venue.point.latitude)
  ) {
    missingValidatedFacts.push('venue_point');
  }

  if (missingValidatedFacts.length > 0) {
    return {
      reviewId: reconciliation.reviewId,
      status: 'blocked_incomplete_validated_facts',
      missingValidatedFacts,
      databaseWriteAuthorized: false,
      publicationAuthorized: false
    };
  }

  return {
    reviewId: reconciliation.reviewId,
    status: 'mapping_draft_ready',
    missingValidatedFacts: [],
    rawEvent: {
      sourceId: facts.source.sourceId,
      sourceName: facts.source.sourceName,
      sourceUrl: facts.source.sourceUrl,
      observedAt: facts.source.observedAt,
      title: facts.title.trim(),
      category: facts.category,
      startsAt: new Date(facts.startsAt).toISOString(),
      ...(facts.endsAt ? { endsAt: new Date(facts.endsAt).toISOString() } : {}),
      ...(facts.description ? { description: facts.description } : {}),
      ...(facts.organizer ? { organizer: facts.organizer } : {}),
      venueName: facts.venue.name,
      address: `${facts.venue.address}, ${facts.venue.city}`,
      point: facts.venue.point,
      pointResolution: 'source',
      ...(facts.price ? { price: facts.price } : {}),
      ...(facts.ticketingUrl ? { ticketingUrl: facts.ticketingUrl } : {}),
      ...(facts.imageUrl ? { imageUrl: facts.imageUrl } : {}),
      raw: {
        reviewId: reconciliation.reviewId,
        humanOutcome: reconciliation.humanOutcome,
        publicationAuthorized: false
      }
    },
    databaseWriteAuthorized: false,
    publicationAuthorized: false
  };
}
