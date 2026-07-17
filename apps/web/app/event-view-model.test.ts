import { type PublicEvent } from '@pulso/contracts';
import { describe, expect, it } from 'vitest';

import {
  eventDetailsFields,
  eventPreviewFields,
  eventPreviewLabel
} from './event-view-model.js';

const event: PublicEvent = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Synthetic Montréal Pulse',
  category: 'music',
  status: 'scheduled',
  startsAt: '2026-07-16T01:00:00.000Z',
  timezone: 'America/Toronto',
  price: { kind: 'free', currency: 'CAD' },
  description: 'A fictional event.',
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
  },
  externalDestination: {
    label: 'Synthetic event source (example.com)',
    kind: 'event_source',
    status: 'available'
  }
};

describe('event presentation', () => {
  it('prioritizes the Accepted preview fields', () => {
    expect(eventPreviewFields(event, 'en')).toMatchObject({
      title: 'Synthetic Montréal Pulse',
      venue: 'Synthetic Montréal Venue',
      price: 'Free',
      category: 'Music / concerts'
    });
  });

  it('keeps event and venue identity visible', () => {
    expect(eventPreviewLabel(event)).toBe(
      'Synthetic Montréal Pulse — Synthetic Montréal Venue'
    );
  });

  it('presents complete Event Details and explicit unknown fields', () => {
    const {
      description: _description,
      organizer: _organizer,
      externalDestination: _externalDestination,
      ...eventWithoutOptionalDetails
    } = event;
    void _description;
    void _organizer;
    void _externalDestination;
    const details = eventDetailsFields(
      {
        ...eventWithoutOptionalDetails,
        price: { kind: 'unknown', currency: 'CAD' }
      },
      'en'
    );
    expect(details.presentation).toMatchObject({
      price: 'Price unknown',
      description: 'Description unknown',
      organizer: 'Organizer unknown'
    });
    expect(details.presentation.externalAction).toBeUndefined();
  });

  it('uses French Pulso labels without translating event-source content', () => {
    const preview = eventPreviewFields(event, 'fr');
    expect(preview).toMatchObject({
      title: 'Synthetic Montréal Pulse',
      venue: 'Synthetic Montréal Venue',
      price: 'Gratuit',
      category: 'Musique / concerts'
    });
  });
});
