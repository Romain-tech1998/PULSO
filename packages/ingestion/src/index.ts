export type {
  RawIngestedEvent,
  IngestionConnector,
  ConnectorRunResult,
  RawIngestedVenue,
  VenueConnector,
  VenueConnectorRunResult
} from './types.js';
export { runConnector, runVenueConnector } from './types.js';

export {
  createMontrealOpenDataConnector,
  mapMontrealOpenDataRow
} from './sources/montreal-open-data.js';

export {
  createTicketmasterConnector,
  mapTicketmasterEvent
} from './sources/ticketmaster.js';

export {
  createEventbriteConnector,
  mapEventbriteApifyEvent
} from './sources/eventbrite.js';

export {
  createIcsCalendarConnector,
  parseIcs
} from './sources/ics-calendar.js';

export {
  createParseBotRaClubsConnector,
  createParseBotRaEventsConnector,
  mapParseBotEvent,
  mapParseBotClub
} from './sources/parse-bot-ra.js';

export {
  fetchInstagramScoutSignals,
  type InstagramScoutTarget,
  type InstagramScoutSignal,
  type InstagramScoutMediaAsset
} from './sources/instagram-scout.js';

export {
  fetchInstagramStoriesSignals,
  type InstagramStoryTarget,
  type InstagramStorySignal
} from './sources/instagram-stories-apify.js';

export {
  analyzeEventImage,
  type EventImageAnalysis
} from './lib/openrouter-vision.js';

export {
  extractInstagramWatchlist,
  selectInstagramPilotTargets
} from './registry.js';
export {
  automateInstagramScoutReviewQueue,
  buildInstagramScoutReviewQueue,
  type InstagramScoutReviewItem,
  type InstagramScoutReviewOutcome,
  type InstagramScoutReviewQueue
} from './instagram-scout-review.js';
export {
  triageInstagramScoutItem,
  type InstagramScoutAutomationDecision,
  type InstagramScoutReviewPriority,
  type InstagramScoutTriageResult
} from './instagram-scout-triage.js';
export {
  extractInstagramScoutFacts,
  type InstagramScoutExtraction,
  type InstagramScoutMissingFact
} from './instagram-scout-extraction.js';
export {
  crosscheckInstagramScoutVenueCandidates,
  type InstagramScoutOfficialCrosscheck,
  type InstagramScoutVenueCandidate
} from './instagram-scout-official-crosscheck.js';
export {
  reconcileInstagramScoutDecisions,
  type InstagramScoutDecisionCandidate,
  type InstagramScoutDecisionReconciliation,
  type InstagramScoutOperatorDecision
} from './instagram-scout-decision-reconciliation.js';
export {
  prepareInstagramScoutMappingDraft,
  type InstagramScoutMappingDraftResult,
  type InstagramScoutValidatedEventFacts
} from './instagram-scout-mapping-draft.js';
export {
  evaluateInstagramScoutGeographicEligibility,
  linkInstagramScoutSourcesToKnownVenues,
  type InstagramScoutGeographicEligibility,
  type InstagramScoutKnownVenue,
  type InstagramScoutMonthlyVenueDensity,
  type InstagramScoutVenueLink,
  type InstagramScoutVenueLinkingResult,
  type InstagramScoutVenueSource
} from './instagram-scout-venue-linking.js';
export { parseCsv } from './lib/csv.js';
export {
  geocodeAddress,
  geocodeAddressWithFrenchFallback,
  translateStreetToFrench,
  enrichMissingCoordinates,
  reverseGeocodeAddress,
  enrichMissingAddresses
} from './lib/geocode-fallback.js';

export { computeDedupeKey, normalizeForKey } from './mapping/dedupe-key.js';
export { deriveDeterministicEventId } from './mapping/event-id.js';
export {
  mapRawEventToPublicEvent,
  mapAndDeduplicateRawEvents,
  type MappingSkip,
  type MergedPublicEvent,
  type MappingResult
} from './mapping/to-public-event.js';
