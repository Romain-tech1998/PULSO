import type { PublicEvent } from '@pulso/contracts';
import { describe, expect, it } from 'vitest';

import { deriveVenuePriceTier } from './venue-price-tier.js';

const baseEvent: PublicEvent = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Synthetic Montréal Pulse',
  category: 'music',
  status: 'scheduled',
  startsAt: '2026-07-16T01:00:00.000Z',
  timezone: 'America/Toronto',
  price: { kind: 'free', currency: 'CAD' },
  accessInformation: 'Free entry.',
  venue: {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Synthetic Montréal Venue',
    address: '1000 Rue Synthétique, Montréal, QC',
    point: { longitude: -73.5673, latitude: 45.5017 }
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
  }
};

function paidEvent(minimumAmount: number): PublicEvent {
  return {
    ...baseEvent,
    price: { kind: 'paid', currency: 'CAD', minimumAmount }
  };
}

describe('deriveVenuePriceTier', () => {
  it('returns undefined for a venue with no events at all', () => {
    expect(deriveVenuePriceTier([])).toBeUndefined();
  });

  it('returns undefined for a venue whose events are all free or unknown price', () => {
    const events = [
      baseEvent,
      {
        ...baseEvent,
        price: { kind: 'unknown' as const, currency: 'CAD' as const }
      }
    ];
    expect(deriveVenuePriceTier(events)).toBeUndefined();
  });

  it('buckets a cheap median under $20 as $', () => {
    expect(deriveVenuePriceTier([paidEvent(10), paidEvent(15)])).toBe('$');
  });

  it('buckets a mid-range median as $$', () => {
    expect(deriveVenuePriceTier([paidEvent(25), paidEvent(35)])).toBe('$$');
  });

  it('buckets a high median over $50 as $$$', () => {
    expect(deriveVenuePriceTier([paidEvent(60), paidEvent(80)])).toBe('$$$');
  });

  it('uses the median so one outlier premium show does not skew a cheap bar', () => {
    // Four $10 shows and one $500 show - the average would be well over
    // $100 (=> $$$), but the median stays at $10 (=> $).
    const events = [
      paidEvent(10),
      paidEvent(10),
      paidEvent(10),
      paidEvent(10),
      paidEvent(500)
    ];
    expect(deriveVenuePriceTier(events)).toBe('$');
  });

  it('ignores free/unknown events when computing the median among paid ones', () => {
    const events = [baseEvent, paidEvent(60), paidEvent(70)];
    expect(deriveVenuePriceTier(events)).toBe('$$$');
  });
});
