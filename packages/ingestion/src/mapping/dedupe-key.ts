import type { RawIngestedEvent } from '../types.js';

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

/**
 * Normalized identity key per DATA-0001's minimum deduplication signal set
 * (normalized name, venue, date/time, organizer). URLs/external ids are
 * intentionally not part of this key: the same event can carry different
 * ticketing URLs per source and must still be recognized as one event.
 */
export function normalizeForKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function computeDedupeKey(event: RawIngestedEvent): string {
  const parts = [
    normalizeForKey(event.title),
    normalizeForKey(event.venueName ?? ''),
    event.startsAt.slice(0, 16), // minute precision, ignores source-specific seconds jitter
    normalizeForKey(event.organizer ?? '')
  ];
  return parts.join('|');
}
