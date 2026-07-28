import type { EventCategory } from '@pulso/domain';

/**
 * Normalized shape produced by every ingestion connector.
 *
 * This is intentionally NOT a PublicEvent (see @pulso/contracts). A connector's
 * job is to fetch and normalize what a source actually published - it must not
 * invent an id, compute trust/freshness labels, or decide deduplication. Those
 * steps depend on DATA-0001 (still Draft) and belong to a later pipeline stage
 * that reads RawIngestedEvent[] from one or more connectors.
 */
export interface RawIngestedEvent {
  /** Stable identifier for the source itself, e.g. a DATA-0002 registry source_id. */
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  /** ISO timestamp of when this connector observed/fetched the data. */
  observedAt: string;
  title: string;
  description?: string | undefined;
  /**
   * Best-effort mapping to Pulso's category taxonomy. Connectors that cannot
   * confidently map a source category must use 'unmapped' rather than guessing.
   */
  category: EventCategory | 'unmapped';
  startsAt: string;
  endsAt?: string | undefined;
  venueName?: string | undefined;
  address?: string | undefined;
  point?: { longitude: number; latitude: number } | undefined;
  /**
   * How `point` was obtained, or why it is still missing. Absent entirely
   * means the connector never even attempted resolution (older/simple
   * connectors). Downstream PublicEvent mapping should treat 'geocoded' as
   * lower location confidence than 'source', and 'unresolved'/'needs_research'
   * as no usable point at all - see DATA-0003.
   */
  pointResolution?:
    'source' | 'geocoded' | 'unresolved' | 'needs_research' | undefined;
  price?:
    | { kind: 'free' }
    | { kind: 'paid'; minimumAmount?: number | undefined }
    | { kind: 'unknown' }
    | undefined;
  ticketingUrl?: string | undefined;
  /** A real photo for the event, when the source actually provides one. */
  imageUrl?: string | undefined;
  organizer?: string | undefined;
  /**
   * Overrides the venue-name component computeDedupeKey/venueKey would
   * otherwise derive from `venueName`/`address`. Only set this when a
   * source's own venue-name field is known to vary across separate fetches
   * of the exact same real occurrence while a different field on the same
   * row is stable (see montreal-open-data.ts, whose free-text `titre_adresse`
   * column has been observed to differ across CSV exports for what is
   * unambiguously the same event+address+time). Left unset, identity
   * computation is unchanged for every other connector.
   */
  identitySeed?: string | undefined;
  /** Original payload fragment, kept for audit/debugging only. */
  raw?: unknown;
}

export interface IngestionConnector {
  /** Matches the source_id convention used in docs/data/research/montreal-source-registry.csv. */
  id: string;
  displayName: string;
  fetch(): Promise<RawIngestedEvent[]>;
}

export interface ConnectorRunResult {
  connectorId: string;
  fetchedAt: string;
  events: RawIngestedEvent[];
  errors: string[];
}

export interface RawIngestedVenue {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  observedAt: string;
  name: string;
  address?: string | undefined;
  point?: { longitude: number; latitude: number } | undefined;
  pointResolution?:
    'source' | 'geocoded' | 'unresolved' | 'needs_research' | undefined;
  /** A real photo of the venue, when the source actually provides one. */
  imageUrl?: string | undefined;
  raw?: unknown;
}

export interface VenueConnector {
  id: string;
  displayName: string;
  fetch(): Promise<RawIngestedVenue[]>;
}

export interface VenueConnectorRunResult {
  connectorId: string;
  fetchedAt: string;
  venues: RawIngestedVenue[];
  errors: string[];
}

export async function runConnector(
  connector: IngestionConnector
): Promise<ConnectorRunResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const events = await connector.fetch();
    return { connectorId: connector.id, fetchedAt, events, errors: [] };
  } catch (error) {
    return {
      connectorId: connector.id,
      fetchedAt,
      events: [],
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}

export async function runVenueConnector(
  connector: VenueConnector
): Promise<VenueConnectorRunResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const venues = await connector.fetch();
    return { connectorId: connector.id, fetchedAt, venues, errors: [] };
  } catch (error) {
    return {
      connectorId: connector.id,
      fetchedAt,
      venues: [],
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}
