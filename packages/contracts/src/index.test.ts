import { describe, expect, it } from 'vitest';

// Traceability: PRD-0001 MAP-006/007, EVENT-002/004, TRUST-001/003/004,
// REDIRECT-004, and STATE-003.

import { presentEvent, publicEventSchema } from './index.js';

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
