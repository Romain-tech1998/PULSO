import type { PublicEvent } from '@pulso/contracts';
import { describe, expect, it } from 'vitest';

import { eventPreviewLabel } from './event-view-model.js';

describe('event preview presentation', () => {
  it('keeps event and venue identity visible', () => {
    const event = {
      title: 'Synthetic Montréal Pulse',
      venue: { name: 'Synthetic Montréal Venue' }
    } as PublicEvent;
    expect(eventPreviewLabel(event)).toBe(
      'Synthetic Montréal Pulse — Synthetic Montréal Venue'
    );
  });
});
