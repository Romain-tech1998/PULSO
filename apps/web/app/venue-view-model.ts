import type { PublicEvent } from '@pulso/contracts';
import { getMontrealCalendarDate } from '@pulso/domain';

export function getVenueDiscoveryDateRange(now: Date): {
  start: string;
  end: string;
} {
  const start = getMontrealCalendarDate(now);
  const [year, month, day] = start.split('-').map(Number);
  const endDate = new Date(Date.UTC(year!, month! - 1, day! + 13));
  const end = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, '0')}-${String(endDate.getUTCDate()).padStart(2, '0')}`;
  return { start, end };
}

export function partitionVenueEvents(
  events: PublicEvent[],
  now: Date
): { today: PublicEvent[]; later: PublicEvent[] } {
  const { start, end } = getVenueDiscoveryDateRange(now);
  const inWindow = [...events]
    .filter((event) => {
      const eventDate = getMontrealCalendarDate(new Date(event.startsAt));
      return eventDate >= start && eventDate <= end;
    })
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    );
  return {
    today: inWindow.filter(
      (event) => getMontrealCalendarDate(new Date(event.startsAt)) === start
    ),
    later: inWindow.filter(
      (event) => getMontrealCalendarDate(new Date(event.startsAt)) !== start
    )
  };
}

/**
 * Administrative tail that OpenStreetMap's reverse geocoder appends to every
 * Montréal address, and that no reader needs.
 *
 * A real one arrives as:
 *
 *   "Bibliothèque Benny, 6400, Avenue de Monkland, Notre-Dame-de-Grâce,
 *    Côte-des-Neiges–Notre-Dame-de-Grâce, Montréal, Agglomération de
 *    Montréal, Montréal (région administrative), Québec, H4B 1H3, Canada"
 *
 * Nine lines on a phone, naming Montréal three times, inside a product that
 * only covers Montréal. 220 of the 1420 venues carry one.
 */
const ADDRESS_NOISE = [
  /^Agglomération de /i,
  /\(région administrative\)/i,
  /^Québec$/i,
  /^Canada$/i,
  /^Montr[ée]al$/i,
  // Canadian postal code, with or without its space.
  /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i
];

/** A street number, possibly with a unit letter ("6400", "12A"). */
const STREET_NUMBER = /^\d+[a-z]?$/i;

/**
 * Marks that only a reverse geocoder produces. Their presence is what makes
 * an address worth rewriting at all.
 *
 * Counting commas was the first rule and it was wrong: "1000 Rue
 * Synthétique, Montréal, QC" has three parts and is a perfectly ordinary
 * hand-entered address, and shortening it to "1000 Rue Synthétique, QC"
 * removed a city a person had deliberately typed. Most of this directory is
 * hand-entered; only the 220 OSM-derived rows carry a tail, and only they
 * should be touched.
 */
const GEOCODED = [
  /Agglom[ée]ration de /i,
  /\(r[ée]gion administrative\)/i,
  /\bCanada\b/i,
  /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i
];

/**
 * The part of an address worth reading: the civic number and street, plus
 * the neighbourhood that situates it. Everything the geocoder adds after
 * that is dropped, as is the venue's own name when the geocoder repeated it.
 *
 * Addresses that are not in this shape are returned untouched - most of the
 * directory is hand-entered and already short.
 */
export function shortenMontrealAddress(
  address: string,
  venueName?: string
): string {
  if (!GEOCODED.some((pattern) => pattern.test(address))) {
    return address.trim();
  }
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 3) return address.trim();

  const kept: string[] = [];
  for (const part of parts) {
    if (ADDRESS_NOISE.some((pattern) => pattern.test(part))) continue;
    // The geocoder often leads with the venue, which the UI already shows
    // directly above the address.
    if (venueName && part.toLowerCase() === venueName.trim().toLowerCase()) {
      continue;
    }
    // Boroughs repeat their own neighbourhoods ("Notre-Dame-de-Grâce" then
    // "Côte-des-Neiges–Notre-Dame-de-Grâce"); one of the two is enough.
    if (kept.some((seen) => part.includes(seen) || seen.includes(part))) {
      continue;
    }
    kept.push(part);
  }
  if (kept.length === 0) return address.trim();

  // "6400", "Avenue de Monkland" reads as one thing, not two.
  if (kept.length > 1 && STREET_NUMBER.test(kept[0]!)) {
    kept.splice(0, 2, `${kept[0]} ${kept[1]}`);
  }

  return kept.slice(0, 2).join(', ');
}
