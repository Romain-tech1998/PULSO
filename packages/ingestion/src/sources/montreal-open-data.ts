import type { IngestionConnector, RawIngestedEvent } from '../types.js';
import { parseCsv } from '../lib/csv.js';
import { normalizeForKey } from '../mapping/dedupe-key.js';

/**
 * City of Montréal open-data "Événements publics" dataset.
 * https://donnees.montreal.ca/dataset/evenements-publics
 *
 * No API key required. Published under the City's open-data license
 * (see https://donnees.montreal.ca/pages/licence-d-utilisation), updated daily.
 * Coverage skews toward city-organized and city-published civic/cultural
 * events (markets, exhibitions, public sessions) rather than nightlife or
 * ticketed concerts - treat this as a supplementary source, not the primary
 * one for Pulso's MVP nightlife scope.
 */
const DATASET_CSV_URL =
  'https://donnees.montreal.ca/dataset/6a4cbf2c-c9b7-413a-86b1-e8f7081e2578/resource/6decf611-6f11-4f34-bb36-324d804c9bad/download/evenements.csv';

const TYPE_TO_CATEGORY: Record<string, RawIngestedEvent['category']> = {
  spectacle: 'show',
  exposition: 'other',
  atelier: 'other',
  marché: 'other',
  'séance publique': 'other',
  // Added after auditing real dataset values (DATA-0003): these are exact or
  // MVP-0001-equivalent ("spectacles") matches to existing Pulso categories,
  // not a scope expansion - musique/humour name the categories directly,
  // and théâtre/cirque/cinéma mirror the show mapping Ticketmaster's own
  // arts&theatre/film segments already get.
  musique: 'music',
  humour: 'comedy',
  théâtre: 'show',
  cirque: 'show',
  cinéma: 'show'
};

function toIsoOrUndefined(value: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/**
 * This CSV export represents missing values as the literal string "nan"
 * (a pandas artifact) rather than an empty cell. Left unfiltered, `|| undefined`
 * treats "nan" as a real value: address/venue-name fields all collapse to the
 * same non-empty string, which (a) hashes every such event onto one fake
 * shared venue in deriveDeterministicEventId, and (b) gets geocoded as a
 * literal "nan, Montréal, QC, Canada" query, producing a real-looking but
 * meaningless coordinate. ~95% of rows in this dataset hit this.
 */
function cleanField(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'nan') return undefined;
  return trimmed;
}

function parsePrice(cout: string): RawIngestedEvent['price'] {
  const normalized = cout.trim().toLowerCase();
  if (!normalized) return { kind: 'unknown' };
  if (normalized.includes('gratuit')) return { kind: 'free' };
  if (normalized.includes('payant')) return { kind: 'paid' };
  return { kind: 'unknown' };
}

// MVP-0001 scopes Pulso to festive/musical/nightlife events - children's/
// family civic programming (library film afternoons, park puppet shows)
// is real, well-formed data but out of that scope, same principle as the
// unmapped-category exclusion below. No structured "audience" column exists
// in this dataset, so this is a best-effort text match on title/description
// rather than a fabricated category.
const FAMILY_AUDIENCE_KEYWORDS = [
  'enfant',
  'jeune public',
  'en famille',
  'tout-petit',
  'tout petit',
  'bébé',
  'pour petits et grands'
];

function looksLikeFamilyOrKidsEvent(
  title: string,
  description: string | undefined
): boolean {
  const haystack = `${title} ${description ?? ''}`.toLowerCase();
  return FAMILY_AUDIENCE_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

export function mapMontrealOpenDataRow(
  row: Record<string, string>,
  observedAt: string
): RawIngestedEvent | undefined {
  const startsAt = toIsoOrUndefined(row.date_debut ?? '');
  if (!startsAt || !row.titre) return undefined;

  const longitude = Number(row.long);
  const latitude = Number(row.lat);
  const hasPoint = Number.isFinite(longitude) && Number.isFinite(latitude);
  const description = cleanField(row.description);
  const address = cleanField(row.adresse_principale);

  return {
    sourceId: 'ville-de-montreal-evenements-publics',
    sourceName: 'Ville de Montréal — Événements publics',
    sourceUrl: row.url_fiche || 'https://montreal.ca/calendrier',
    observedAt,
    title: row.titre,
    description,
    category: looksLikeFamilyOrKidsEvent(row.titre, description)
      ? 'unmapped'
      : (TYPE_TO_CATEGORY[row.type_evenement?.toLowerCase() ?? ''] ??
        'unmapped'),
    startsAt,
    endsAt: toIsoOrUndefined(row.date_fin ?? ''),
    venueName: cleanField(row.titre_adresse),
    address,
    point: hasPoint ? { longitude, latitude } : undefined,
    price: parsePrice(row.cout ?? ''),
    organizer: cleanField(row.arrondissement),
    // This dataset's free-text venue-name column (titre_adresse) has been
    // observed to vary across separate CSV exports for the exact same
    // calendar entry (same url_fiche, same address, same date) - identical
    // real occurrences were getting re-inserted as new event/venue rows on
    // every ingestion run instead of updating the existing ones. The civic
    // address column has not shown that instability, so it anchors identity
    // here instead; titre_adresse is still used above for the prettier
    // display name shown to users.
    identitySeed: address ? normalizeForKey(address) : undefined,
    // Not a ticket purchase, but per product decision this still counts as
    // an actionable external destination: the montreal.ca page is real and
    // useful even for free events, and redirect click-throughs are data
    // Pulso wants to collect regardless of price. mapRawEventToPublicEvent
    // labels this 'event_source' rather than 'ticketing' based on sourceId.
    ticketingUrl: row.url_fiche || 'https://montreal.ca/calendrier',
    raw: row
  };
}

export function createMontrealOpenDataConnector(
  fetchImpl: typeof fetch = fetch
): IngestionConnector {
  return {
    id: 'ville-de-montreal-evenements-publics',
    displayName: 'Ville de Montréal — Événements publics (open data)',
    async fetch(): Promise<RawIngestedEvent[]> {
      const response = await fetchImpl(DATASET_CSV_URL);
      if (!response.ok) {
        throw new Error(
          `Montréal open data request failed with status ${response.status}`
        );
      }
      const observedAt = new Date().toISOString();
      const text = await response.text();
      const rows = parseCsv(text);
      return rows
        .map((row) => mapMontrealOpenDataRow(row, observedAt))
        .filter((event): event is RawIngestedEvent => event !== undefined);
    }
  };
}
