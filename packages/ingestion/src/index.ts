export type {
  RawIngestedEvent,
  IngestionConnector,
  ConnectorRunResult
} from './types.js';
export { runConnector } from './types.js';

export {
  createMontrealOpenDataConnector,
  mapMontrealOpenDataRow
} from './sources/montreal-open-data.js';

export {
  createTicketmasterConnector,
  mapTicketmasterEvent
} from './sources/ticketmaster.js';

export {
  createIcsCalendarConnector,
  parseIcs
} from './sources/ics-calendar.js';

export {
  fetchInstagramScoutSignals,
  type InstagramScoutTarget,
  type InstagramScoutSignal
} from './sources/instagram-scout.js';

export { extractInstagramWatchlist } from './registry.js';
export { parseCsv } from './lib/csv.js';
export {
  geocodeAddress,
  enrichMissingCoordinates
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
