import { presentEvent, type PublicEvent } from '@pulso/contracts';

export function eventPreviewFields(event: PublicEvent) {
  const presentation = presentEvent(event);
  return {
    title: event.title,
    dateTime: presentation.dateTime,
    venue: event.venue.name,
    price: presentation.price,
    category: presentation.category,
    warning: presentation.materialWarning
  };
}

export function eventDetailsFields(event: PublicEvent) {
  return { event, presentation: presentEvent(event) };
}

export function eventPreviewLabel(event: PublicEvent): string {
  return `${event.title} — ${event.venue.name}`;
}
