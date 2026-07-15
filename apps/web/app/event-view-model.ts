import type { PublicEvent } from '@pulso/contracts';

export function eventPreviewLabel(event: PublicEvent): string {
  return `${event.title} — ${event.venue.name}`;
}
