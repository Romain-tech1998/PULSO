import { describe, expect, it } from 'vitest';

import { computeDedupeKey, normalizeForKey } from './dedupe-key.js';
import { deriveDeterministicEventId } from './event-id.js';
import { mapAndDeduplicateRawEvents, mapRawEventToPublicEvent } from './to-public-event.js';
import type { RawIngestedEvent } from '../types.js';

const now = new Date('2026-07-21T12:00:00.000Z');

function ticketmasterEvent(
  overrides: Partial<RawIngestedEvent> = {}
): RawIngestedEvent {
  return {
    sourceId: 'ticketmaster',
    sourceName: 'Ticketmaster',
    sourceUrl: 'https://ticketmaster.ca/event/tm-1',
    observedAt: '2026-07-21T11:00:00.000Z',
    title: 'Charlotte Cardin',
    category: 'music',
    startsAt: '2026-08-01T23:00:00.000Z',
    venueName: 'MTELUS',
    address: '59 Rue Sainte-Catherine E',
    point: { longitude: -73.5605, latitude: 45.5106 },
    pointResolution: 'source',
    price: { kind: 'paid', minimumAmount: 45 },
    ticketingUrl: 'https://ticketmaster.ca/event/tm-1',
    ...overrides
  };
}

describe('normalizeForKey / computeDedupeKey', () => {
  it('normalizes accents, case, and punctuation', () => {
    expect(normalizeForKey('Théâtre Fairmount!')).toBe('theatre fairmount');
  });

  it('produces the same key for the same event regardless of source', () => {
    const a = computeDedupeKey(ticketmasterEvent());
    const b = computeDedupeKey(
      ticketmasterEvent({ sourceId: 'other-source', sourceUrl: 'https://example.com' })
    );
    expect(a).toBe(b);
  });
});

describe('deriveDeterministicEventId', () => {
  it('is stable for the same key and looks like a valid UUID', () => {
    const id1 = deriveDeterministicEventId('same-key');
    const id2 = deriveDeterministicEventId('same-key');
    expect(id1).toBe(id2);
    expect(id1).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('differs for different keys', () => {
    expect(deriveDeterministicEventId('a')).not.toBe(deriveDeterministicEventId('b'));
  });
});

describe('mapRawEventToPublicEvent', () => {
  it('maps a well-formed event with a source-provided point', () => {
    const result = mapRawEventToPublicEvent(ticketmasterEvent(), { now });
    expect('event' in result).toBe(true);
    if (!('event' in result)) throw new Error('expected event');

    expect(result.event.title).toBe('Charlotte Cardin');
    expect(result.event.trust.label).toBe('probable');
    expect(result.event.trust.freshness).toBe('fresh');
    expect(result.event.trust.locationConfidence).toBe('confirmed');
    expect(result.event.venue.point).toEqual({ longitude: -73.5605, latitude: 45.5106 });
  });

  it('marks official sources as confirmed', () => {
    const result = mapRawEventToPublicEvent(
      ticketmasterEvent({
        sourceId: 'ville-de-montreal-evenements-publics',
        sourceName: 'Ville de Montréal'
      }),
      { now }
    );
    if (!('event' in result)) throw new Error('expected event');
    expect(result.event.trust.label).toBe('confirmed');
  });

  it('marks geocoded points as lower location confidence', () => {
    const result = mapRawEventToPublicEvent(
      ticketmasterEvent({ pointResolution: 'geocoded' }),
      { now }
    );
    if (!('event' in result)) throw new Error('expected event');
    expect(result.event.trust.locationConfidence).toBe('uncertain');
  });

  it('marks stale freshness when observedAt is old', () => {
    const result = mapRawEventToPublicEvent(
      ticketmasterEvent({ observedAt: '2026-07-01T00:00:00.000Z' }),
      { now }
    );
    if (!('event' in result)) throw new Error('expected event');
    expect(result.event.trust.freshness).toBe('stale');
  });

  it('skips events with an unmapped category rather than guessing', () => {
    const result = mapRawEventToPublicEvent(
      ticketmasterEvent({ category: 'unmapped' }),
      { now }
    );
    expect('skip' in result).toBe(true);
    if (!('skip' in result)) throw new Error('expected skip');
    expect(result.skip.reason).toBe('unmapped_category');
  });

  it('skips events with no resolved point rather than fabricating one', () => {
    const result = mapRawEventToPublicEvent(
      ticketmasterEvent({ point: undefined, pointResolution: 'needs_research' }),
      { now }
    );
    expect('skip' in result).toBe(true);
    if (!('skip' in result)) throw new Error('expected skip');
    expect(result.skip.reason).toBe('no_resolved_point');
  });

  it('skips events with an invalid start date', () => {
    const result = mapRawEventToPublicEvent(
      ticketmasterEvent({ startsAt: 'not-a-date' }),
      { now }
    );
    expect('skip' in result).toBe(true);
    if (!('skip' in result)) throw new Error('expected skip');
    expect(result.skip.reason).toBe('invalid_start_date');
  });
});

describe('mapAndDeduplicateRawEvents', () => {
  it('merges the same event from two sources, keeping the higher-authority one primary', () => {
    const fromTicketmaster = ticketmasterEvent();
    const fromOfficial = ticketmasterEvent({
      sourceId: 'ville-de-montreal-evenements-publics',
      sourceName: 'Ville de Montréal',
      sourceUrl: 'https://montreal.ca/evenements/charlotte-cardin'
    });

    const result = mapAndDeduplicateRawEvents([fromTicketmaster, fromOfficial], { now });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.event.source.name).toBe('Ville de Montréal');
    expect(result.events[0]?.event.trust.label).toBe('confirmed');
    expect(result.events[0]?.additionalSources).toHaveLength(1);
    expect(result.events[0]?.additionalSources[0]?.name).toBe('Ticketmaster');
  });

  it('keeps distinct events separate and reports skipped ones', () => {
    const eventA = ticketmasterEvent();
    const eventB = ticketmasterEvent({
      title: 'Kaytranada',
      startsAt: '2026-08-02T22:00:00.000Z'
    });
    const unmapped = ticketmasterEvent({ category: 'unmapped', title: 'Marché' });

    const result = mapAndDeduplicateRawEvents([eventA, eventB, unmapped], { now });

    expect(result.events).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toBe('unmapped_category');
  });
});
