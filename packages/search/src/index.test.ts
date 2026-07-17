import type { PublicEvent } from '@pulso/contracts';
import { describe, expect, it } from 'vitest';

import { interpretDeterministicSearch, rankAndExplainEvents } from './index.js';

describe('deterministic intelligent-search interpretation', () => {
  it.each([
    ['tonight', 'tonight'],
    ['tomorrow', 'tomorrow'],
    ['this weekend', 'weekend'],
    ['next seven days', 'next7']
  ])('maps the supported date phrase %s', (query, expected) => {
    expect(interpretDeterministicSearch(query).derivedFilters.date).toBe(
      expected
    );
  });

  it.each([
    ['ce soir', 'tonight'],
    ['DEMAIN', 'tomorrow'],
    ['cette fin de semaine', 'weekend'],
    ['les sept prochains jours', 'next7']
  ])('maps the equivalent French date phrase %s', (query, expected) => {
    const result = interpretDeterministicSearch(query, [], 'fr');
    expect(result.derivedFilters.date).toBe(expected);
    expect(result.language).toBe('fr');
  });

  it.each([
    ['music', 'music'],
    ['DJ club', 'nightlife'],
    ['festival', 'festival'],
    ['show', 'show'],
    ['stand-up comedy', 'comedy'],
    ['community event', 'other']
  ])('maps the supported category phrase %s', (query, expected) => {
    expect(
      interpretDeterministicSearch(query).derivedFilters.categories
    ).toEqual([expected]);
  });

  it.each([
    ['musique', 'music'],
    ['soirée dansante DJ', 'nightlife'],
    ['événement festif', 'festival'],
    ['spectacle d’humour', 'comedy'],
    ['spectacle', 'show'],
    ['événement communautaire', 'other']
  ])('maps accented French category phrase %s', (query, expected) => {
    expect(
      interpretDeterministicSearch(query, [], 'fr').derivedFilters.categories
    ).toEqual([expected]);
  });

  it('maps multiple categories with OR-compatible structured values', () => {
    expect(
      interpretDeterministicSearch('music or comedy tonight').derivedFilters
    ).toMatchObject({ date: 'tonight', categories: ['music', 'comedy'] });
  });

  it.each([
    ['free music', 'free'],
    ['paid comedy', 'paid']
  ])('maps the supported price phrase %s', (query, expected) => {
    expect(interpretDeterministicSearch(query).derivedFilters.price).toBe(
      expected
    );
  });

  it.each([
    ['musique gratuite', 'free'],
    ['humour PAYANT', 'paid']
  ])('maps the equivalent French price phrase %s', (query, expected) => {
    expect(
      interpretDeterministicSearch(query, [], 'fr').derivedFilters.price
    ).toBe(expected);
  });

  it('separates hard constraints from ranking signals', () => {
    const result = interpretDeterministicSearch(
      'free music tonight starting soon and reliable'
    );
    expect(result.constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'date', kind: 'hard' }),
        expect.objectContaining({ key: 'categories', kind: 'hard' }),
        expect.objectContaining({ key: 'price', kind: 'hard' })
      ])
    );
    expect(result.rankingSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'soon', kind: 'ranking' }),
        expect.objectContaining({ key: 'higher_trust', kind: 'ranking' })
      ])
    );
  });

  it('recognizes an explicit exclusion as a hard constraint', () => {
    const result = interpretDeterministicSearch('music but not comedy');
    expect(result.excludedCategories).toEqual(['comedy']);
    expect(result.constraints).toContainEqual({
      key: 'excluded_categories',
      kind: 'hard',
      message: {
        code: 'search.constraint.excludeCategory',
        params: { category: 'comedy' }
      }
    });
  });

  it('recognizes French exclusions and ranking with the same semantics', () => {
    const result = interpretDeterministicSearch(
      'musique gratuite ce soir sans humour, abordable et fiable',
      [],
      'fr'
    );
    expect(result.derivedFilters).toEqual({
      date: 'tonight',
      categories: ['music'],
      price: 'free'
    });
    expect(result.excludedCategories).toEqual(['comedy']);
    expect(result.rankingSignals.map(({ key }) => key)).toEqual(
      expect.arrayContaining(['lower_price', 'higher_trust'])
    );
  });

  it('asks one material clarification for missing distance reference', () => {
    const result = interpretDeterministicSearch('comedy within 5 km');
    expect(result.resolution).toBe('clarification');
    expect(result.clarification?.code).toBe('search.clarification.location');
    expect(
      interpretDeterministicSearch('humour à moins de 5 km', [], 'fr')
        .clarification?.code
    ).toBe('search.clarification.location');
  });

  it('rejects routing-time semantics rather than claiming a match', () => {
    const result = interpretDeterministicSearch('music within 20 minutes');
    expect(result.resolution).toBe('no_reliable_result');
    expect(result.message?.code).toBe('search.message.routingUnsupported');
    expect(
      interpretDeterministicSearch('musique à 20 minutes', [], 'fr').message
        ?.code
    ).toBe('search.message.routingUnsupported');
  });

  it('does not claim reliable interpretation for unsupported input', () => {
    const result = interpretDeterministicSearch('surprise me with magic vibes');
    expect(result.resolution).toBe('no_reliable_result');
    expect(result.derivedFilters).toEqual({});
    expect(
      interpretDeterministicSearch('ambiance magique surprise', [], 'fr')
        .message?.code
    ).toBe('search.message.unsupported');
  });

  it('allows a derived criterion to be disabled for manual editing', () => {
    const result = interpretDeterministicSearch('free comedy tonight', [
      'price'
    ]);
    expect(result.derivedFilters).toEqual({
      date: 'tonight',
      categories: ['comedy']
    });
  });
});

describe('deterministic ranking and explanations', () => {
  const event = (overrides: Partial<PublicEvent>): PublicEvent => ({
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Synthetic event',
    category: 'music',
    status: 'scheduled',
    startsAt: '2026-07-17T01:00:00.000Z',
    timezone: 'America/Toronto',
    price: { kind: 'free', currency: 'CAD' },
    accessInformation: 'Fictional access.',
    venue: {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Synthetic venue',
      address: '1000 Fictional Street, Montréal, QC',
      point: { longitude: -73.56, latitude: 45.5 }
    },
    source: {
      name: 'Synthetic source',
      url: 'https://example.com/event',
      observedAt: '2026-07-16T20:00:00.000Z'
    },
    trust: {
      label: 'confirmed',
      freshness: 'unknown',
      locationConfidence: 'confirmed'
    },
    ...overrides
  });

  it('returns stable ranking and explanations derived from actual fields', () => {
    const interpretation = interpretDeterministicSearch(
      'affordable music starting soon'
    );
    const laterPaid = event({
      id: '00000000-0000-4000-8000-000000000003',
      startsAt: '2026-07-17T03:00:00.000Z',
      price: { kind: 'paid', currency: 'CAD' }
    });
    const ranked = rankAndExplainEvents(
      [laterPaid, event({})],
      interpretation,
      'exact'
    );
    expect(ranked[0]!.event.price.kind).toBe('free');
    expect(ranked[0]!.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'search.reason.category' }),
        expect.objectContaining({ code: 'search.reason.soon' }),
        expect.objectContaining({ code: 'search.reason.lowerPriceFree' })
      ])
    );
    expect(
      rankAndExplainEvents([laterPaid, event({})], interpretation, 'exact')
    ).toEqual(ranked);
  });
});
