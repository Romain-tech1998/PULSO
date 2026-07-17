import { describe, expect, it } from 'vitest';

// Traceability: PRD-0001 MAP-006/007, EVENT-002/004, TRUST-001/003/004,
// REDIRECT-004, and STATE-003.

import {
  buildMapEventsQuery,
  intelligentSearchRequestSchema,
  intelligentSearchResponseSchema,
  mapBoundsQuerySchema,
  presentEvent,
  publicEventSchema,
  summarizeActiveFilters
} from './index.js';

describe('intelligent-search contracts', () => {
  const request = {
    query: 'free comedy tonight',
    bounds: { west: -73.7, south: 45.4, east: -73.4, north: 45.7 },
    manualFilters: { date: 'next7', categories: [], price: 'all' },
    disabledDerivedKeys: []
  };

  it('strictly validates transient search input', () => {
    expect(intelligentSearchRequestSchema.parse(request)).toEqual(request);
    expect(() =>
      intelligentSearchRequestSchema.parse({ ...request, unknown: true })
    ).toThrow();
    expect(() =>
      intelligentSearchRequestSchema.parse({ ...request, query: ' '.repeat(4) })
    ).toThrow();
    expect(() =>
      intelligentSearchRequestSchema.parse({
        ...request,
        disabledDerivedKeys: ['price', 'price']
      })
    ).toThrow();
  });

  it('returns structured interpretation without echoing the raw query', () => {
    const response = intelligentSearchResponseSchema.parse({
      interpretation: {
        engine: 'deterministic',
        language: 'en',
        constraints: [{ key: 'price', kind: 'hard', label: 'Free' }],
        rankingSignals: [],
        effectiveFilters: { date: 'next7', categories: [], price: 'free' }
      },
      condition: 'no_reliable_result',
      message: 'No reliable result.',
      data: []
    });
    expect(JSON.stringify(response)).not.toContain(request.query);
  });
});

describe('manual map filter contract', () => {
  const bounds = { west: -73.7, south: 45.4, east: -73.4, north: 45.7 };

  it('parses every Accepted filter value and preserves OR categories', () => {
    for (const date of ['next7', 'tonight', 'tomorrow', 'weekend'] as const) {
      expect(mapBoundsQuerySchema.parse({ ...bounds, date }).date).toBe(date);
    }
    const parsed = mapBoundsQuerySchema.parse({
      ...bounds,
      categories: 'music,comedy',
      price: 'paid',
      date: 'custom',
      dateStart: '2026-07-18',
      dateEnd: '2026-07-20'
    });
    expect(parsed).toMatchObject({
      categories: ['music', 'comedy'],
      price: 'paid',
      date: 'custom'
    });
  });

  it.each([
    { ...bounds, categories: 'music,invalid' },
    { ...bounds, price: 'unknown' },
    { ...bounds, date: 'someday' },
    { ...bounds, unexpected: 'value' },
    { ...bounds, date: 'custom' },
    { ...bounds, date: 'custom', dateStart: '2026-02-30' },
    {
      ...bounds,
      date: 'custom',
      dateStart: '2026-07-20',
      dateEnd: '2026-07-18'
    }
  ])('rejects invalid filter query %#', (query) => {
    expect(mapBoundsQuerySchema.safeParse(query).success).toBe(false);
  });

  it('serializes and summarizes shared client filter state', () => {
    const filters = {
      date: 'tomorrow' as const,
      categories: ['music', 'comedy'] as const,
      price: 'free' as const
    };
    const query = buildMapEventsQuery(bounds, {
      ...filters,
      categories: [...filters.categories]
    });
    expect(query).toContain('date=tomorrow');
    expect(query).toContain('categories=music%2Ccomedy');
    expect(query).toContain('price=free');
    expect(
      summarizeActiveFilters({
        ...filters,
        categories: [...filters.categories]
      })
    ).toHaveLength(4);
  });
});

describe('public event contract', () => {
  it('rejects a point outside valid latitude bounds', () => {
    const result = publicEventSchema.safeParse({
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Synthetic event',
      category: 'music',
      status: 'scheduled',
      startsAt: '2026-08-01T00:00:00.000Z',
      timezone: 'America/Toronto',
      price: { kind: 'free', currency: 'CAD' },
      accessInformation: 'Free entry with no reservation required.',
      venue: {
        id: '00000000-0000-4000-8000-000000000002',
        name: 'Synthetic venue',
        address: 'Montréal',
        point: { longitude: -73.56, latitude: 100 }
      },
      source: {
        name: 'Synthetic',
        url: 'https://example.com/event',
        observedAt: '2026-07-15T12:00:00.000Z'
      },
      trust: {
        label: 'confirmed',
        freshness: 'unknown',
        locationConfidence: 'confirmed'
      }
    });

    expect(result.success).toBe(false);
  });

  it('presents unknown fields and an unavailable destination without inference', () => {
    const event = publicEventSchema.parse({
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Synthetic partial event',
      category: 'music',
      status: 'scheduled',
      startsAt: '2026-07-16T01:00:00.000Z',
      timezone: 'America/Toronto',
      price: { kind: 'unknown', currency: 'CAD' },
      accessInformation: 'Access conditions are not confirmed.',
      venue: {
        id: '00000000-0000-4000-8000-000000000002',
        name: 'Synthetic venue',
        address: '1000 Synthetic Street, Montréal, QC',
        point: { longitude: -73.56, latitude: 45.5 }
      },
      source: {
        name: 'Synthetic source',
        url: 'https://example.com/event',
        observedAt: '2026-07-15T12:00:00.000Z'
      },
      trust: {
        label: 'to_verify',
        freshness: 'unknown',
        locationConfidence: 'uncertain'
      }
    });

    expect(presentEvent(event)).toMatchObject({
      price: 'Price unknown',
      description: 'Description unknown',
      organizer: 'Organizer unknown',
      location: 'Location not confirmed',
      materialWarning: 'Some event information is not confirmed.'
    });
    expect(presentEvent(event).externalAction).toBeUndefined();
  });

  it('suppresses the external action for a cancelled event', () => {
    const cancelled = publicEventSchema.parse({
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Cancelled synthetic event',
      category: 'show',
      status: 'cancelled',
      startsAt: '2026-07-16T01:00:00.000Z',
      timezone: 'America/Toronto',
      price: { kind: 'paid', currency: 'CAD' },
      accessInformation: 'Access is no longer available.',
      venue: {
        id: '00000000-0000-4000-8000-000000000002',
        name: 'Synthetic venue',
        address: 'Montréal',
        point: { longitude: -73.56, latitude: 45.5 }
      },
      source: {
        name: 'Synthetic source',
        url: 'https://example.com/event',
        observedAt: '2026-07-15T12:00:00.000Z'
      },
      trust: {
        label: 'confirmed',
        freshness: 'unknown',
        locationConfidence: 'confirmed'
      },
      externalDestination: {
        label: 'Synthetic event source',
        kind: 'event_source',
        status: 'available'
      }
    });

    expect(presentEvent(cancelled)).toMatchObject({
      materialWarning: 'This event is cancelled.',
      externalUnavailable:
        'The external event or ticket-source action is unavailable because this event is cancelled.'
    });
    expect(presentEvent(cancelled).externalAction).toBeUndefined();
  });
});
