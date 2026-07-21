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
  description?: string;
  /**
   * Best-effort mapping to Pulso's category taxonomy. Connectors that cannot
   * confidently map a source category must use 'unmapped' rather than guessing.
   */
  category: EventCategory | 'unmapped';
  startsAt: string;
  endsAt?: string;
  venueName?: string;
  address?: string;
  point?: { longitude: number; latitude: number };
  price?:
    | { kind: 'free' }
    | { kind: 'paid'; minimumAmount?: number }
    | { kind: 'unknown' };
  ticketingUrl?: string;
  organizer?: string;
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
