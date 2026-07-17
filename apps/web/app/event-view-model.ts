import { presentEvent, type PublicEvent } from '@pulso/contracts';
import type { SupportedLocale } from '@pulso/domain/localization';

export function eventPreviewFields(
  event: PublicEvent,
  locale: SupportedLocale
) {
  const presentation = presentEvent(event, locale);
  return {
    title: event.title,
    dateTime: presentation.dateTime,
    venue: event.venue.name,
    price: presentation.price,
    category: presentation.category,
    warning: presentation.materialWarning
  };
}

export function eventDetailsFields(
  event: PublicEvent,
  locale: SupportedLocale
) {
  return { event, presentation: presentEvent(event, locale) };
}

export function eventPreviewLabel(event: PublicEvent): string {
  return `${event.title} — ${event.venue.name}`;
}
