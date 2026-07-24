import type { PublicEvent } from '@pulso/contracts';
import type { EventCategory, TrustLabel } from '@pulso/domain';

import type { RawIngestedEvent } from '../types.js';
import { computeDedupeKey } from './dedupe-key.js';
import { deriveDeterministicEventId } from './event-id.js';

/**
 * Maps normalized RawIngestedEvent records into Pulso's PublicEvent contract.
 *
 * This is the pipeline stage DATA-0003 flagged as not yet designed: id
 * assignment, trust/freshness/locationConfidence computation, and
 * deduplication across sources. It stays deliberately conservative because
 * DATA-0001 (the trust model) is still Draft:
 *
 * - Events whose category could not be confidently mapped ('unmapped') are
 *   excluded rather than guessed into 'other'. MVP-0001 scopes Pulso to
 *   festive/musical/nightlife events specifically; blindly accepting every
 *   unmapped raw category (e.g. a civic workshop from the Montréal open-data
 *   connector) would silently expand that scope.
 * - Events with no resolved point (`pointResolution` is 'unresolved' or
 *   'needs_research', or missing point) are excluded, not given a fabricated
 *   coordinate. PublicEvent's `venue.point` is a required field with no
 *   "unknown location" representation today - inventing one would violate
 *   UX-0001's rule that an event without exploitable coordinates must not be
 *   presented as correctly positioned. This is a real contract gap, not a
 *   detail: Pulso currently has no way to show a "location uncertain, not on
 *   the map" event, only to hide it. That gap needs its own product decision
 *   before excluded events can be surfaced at all.
 * - Freshness uses a placeholder 24-hour threshold. DATA-0001 explicitly
 *   leaves exact freshness thresholds to the future PRD; treat this number
 *   as a placeholder, not a decision.
 * - `source` on PublicEvent is a single object, but DATA-0001 allows one
 *   event to carry multiple sources. When merging duplicates, this mapper
 *   keeps the single highest-authority source for the contract field and
 *   preserves the rest as `additionalSources` on the result wrapper - full
 *   multi-source traceability requires a PublicEvent contract change, tracked
 *   as an open item in DATA-0003.
 */

const KNOWN_SOURCE_AUTHORITY: Record<string, 'official' | 'ticketing_platform'> = {
  'ville-de-montreal-evenements-publics': 'official',
  ticketmaster: 'ticketing_platform'
};

const FRESHNESS_THRESHOLD_MS = 24 * 60 * 60 * 1000; // placeholder, see module docs

export interface MappingSkip {
  event: RawIngestedEvent;
  reason: 'unmapped_category' | 'no_resolved_point' | 'invalid_start_date';
}

export interface MergedPublicEvent {
  event: PublicEvent;
  additionalSources: Array<{ name: string; url: string; observedAt: string }>;
}

export interface MappingResult {
  events: MergedPublicEvent[];
  skipped: MappingSkip[];
}

function resolveTrust(
  event: RawIngestedEvent,
  authorityOverride?: 'official' | 'ticketing_platform' | 'unknown'
): TrustLabel {
  const authority =
    authorityOverride ?? KNOWN_SOURCE_AUTHORITY[event.sourceId] ?? 'unknown';
  if (authority === 'official') return 'confirmed';
  if (authority === 'ticketing_platform') return 'probable';
  return 'to_verify';
}

function resolveFreshness(observedAt: string, now: Date): PublicEvent['trust']['freshness'] {
  const observed = new Date(observedAt);
  if (Number.isNaN(observed.getTime())) return 'unknown';
  return now.getTime() - observed.getTime() <= FRESHNESS_THRESHOLD_MS ? 'fresh' : 'stale';
}

function resolveLocationConfidence(
  event: RawIngestedEvent
): PublicEvent['trust']['locationConfidence'] {
  // 'geocoded' points come from Nominatim address lookup, not the source
  // itself, so they carry lower confidence than a source-provided point.
  return event.pointResolution === 'geocoded' ? 'uncertain' : 'confirmed';
}

function buildAccessInformation(event: RawIngestedEvent): string {
  if (event.price?.kind === 'free') return 'Free entry as reported by the source.';
  if (event.price?.kind === 'paid') return 'Paid entry; exact conditions not confirmed.';
  return 'Access conditions are not confirmed.';
}

function isMvpCategory(
  category: RawIngestedEvent['category']
): category is EventCategory {
  return category !== 'unmapped';
}

export function mapRawEventToPublicEvent(
  event: RawIngestedEvent,
  options: {
    now?: Date;
    authorityOverride?: 'official' | 'ticketing_platform' | 'unknown';
  } = {}
): { event: PublicEvent } | { skip: MappingSkip } {
  if (!isMvpCategory(event.category)) {
    return { skip: { event, reason: 'unmapped_category' } };
  }
  if (!event.point) {
    return { skip: { event, reason: 'no_resolved_point' } };
  }
  const startsAtDate = new Date(event.startsAt);
  if (Number.isNaN(startsAtDate.getTime())) {
    return { skip: { event, reason: 'invalid_start_date' } };
  }

  const now = options.now ?? new Date();
  const dedupeKey = computeDedupeKey(event);
  const id = deriveDeterministicEventId(dedupeKey);
  // Falling back to a constant string when name/address are both missing would
  // collapse every such event onto one fake shared venue, each upsert overwriting
  // the last one's (correct, per-event) coordinates - observed in practice
  // grouping 600+ distinct real venues onto a single point. event.point is
  // guaranteed defined here (checked above), so prefer it over a constant.
  const venueKey =
    event.venueName ??
    event.address ??
    `${event.point.latitude.toFixed(5)},${event.point.longitude.toFixed(5)}`;
  const venueId = deriveDeterministicEventId(`venue|${venueKey}`);

  const price: PublicEvent['price'] =
    event.price?.kind === 'free'
      ? { kind: 'free', currency: 'CAD' }
      : event.price?.kind === 'paid'
        ? {
            kind: 'paid',
            currency: 'CAD',
            ...(event.price.minimumAmount !== undefined
              ? { minimumAmount: event.price.minimumAmount }
              : {})
          }
        : { kind: 'unknown', currency: 'CAD' };

  const publicEvent: PublicEvent = {
    id,
    title: event.title,
    category: event.category,
    status: 'scheduled',
    startsAt: startsAtDate.toISOString(),
    ...(event.endsAt ? { endsAt: new Date(event.endsAt).toISOString() } : {}),
    timezone: 'America/Toronto',
    price,
    ...(event.description ? { description: event.description } : {}),
    ...(event.organizer ? { organizer: event.organizer } : {}),
    ...(event.imageUrl ? { imageUrl: event.imageUrl } : {}),
    accessInformation: buildAccessInformation(event),
    venue: {
      id: venueId,
      name: event.venueName ?? 'Unknown venue',
      address: event.address ?? 'Unknown address',
      point: event.point
    },
    source: {
      name: event.sourceName,
      url: event.sourceUrl,
      observedAt: event.observedAt
    },
    trust: {
      label: resolveTrust(event, options.authorityOverride),
      freshness: resolveFreshness(event.observedAt, now),
      locationConfidence: resolveLocationConfidence(event)
    },
    ...(event.ticketingUrl
      ? {
          externalDestination: {
            label: event.sourceName,
            // Only an actual ticketing platform gets labelled 'ticketing' -
            // a civic open-data source's own page is a real, useful redirect
            // (and one Pulso wants click-through data on regardless of
            // price) but it's not a ticket purchase.
            kind:
              KNOWN_SOURCE_AUTHORITY[event.sourceId] === 'ticketing_platform'
                ? ('ticketing' as const)
                : ('event_source' as const),
            status: 'available' as const
          }
        }
      : {})
  };

  return { event: publicEvent };
}

export function mapAndDeduplicateRawEvents(
  events: RawIngestedEvent[],
  options: { now?: Date } = {}
): MappingResult {
  const skipped: MappingSkip[] = [];
  const byKey = new Map<string, { event: PublicEvent; authority: number }>();
  const additionalSourcesByKey = new Map<
    string,
    Array<{ name: string; url: string; observedAt: string }>
  >();

  const authorityRank = (event: RawIngestedEvent): number => {
    const authority = KNOWN_SOURCE_AUTHORITY[event.sourceId] ?? 'unknown';
    return authority === 'official' ? 2 : authority === 'ticketing_platform' ? 1 : 0;
  };

  for (const event of events) {
    const mapped = mapRawEventToPublicEvent(event, options);
    if ('skip' in mapped) {
      skipped.push(mapped.skip);
      continue;
    }

    const key = computeDedupeKey(event);
    const rank = authorityRank(event);
    const existing = byKey.get(key);
    const existingSources = additionalSourcesByKey.get(key) ?? [];

    if (!existing) {
      byKey.set(key, { event: mapped.event, authority: rank });
      additionalSourcesByKey.set(key, []);
      continue;
    }

    if (rank > existing.authority) {
      // The new source outranks the current primary: demote the current
      // primary's source into additionalSources and promote the new one.
      existingSources.push(existing.event.source);
      byKey.set(key, { event: mapped.event, authority: rank });
    } else {
      existingSources.push(mapped.event.source);
    }
    additionalSourcesByKey.set(key, existingSources);
  }

  const result: MergedPublicEvent[] = [];
  for (const [key, entry] of byKey) {
    const publicEvent = entry.event;
    result.push({
      event: publicEvent,
      additionalSources: additionalSourcesByKey.get(key) ?? []
    });
  }

  return { events: result, skipped };
}
