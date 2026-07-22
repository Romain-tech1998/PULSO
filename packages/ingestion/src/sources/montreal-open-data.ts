import type { IngestionConnector, RawIngestedEvent } from '../types.js';
import { parseCsv } from '../lib/csv.js';

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

function parsePrice(cout: string): RawIngestedEvent['price'] {
  const normalized = cout.trim().toLowerCase();
  if (!normalized) return { kind: 'unknown' };
  if (normalized.includes('gratuit')) return { kind: 'free' };
  if (normalized.includes('payant')) return { kind: 'paid' };
  return { kind: 'unknown' };
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

  return {
    sourceId: 'ville-de-montreal-evenements-publics',
    sourceName: 'Ville de Montréal — Événements publics',
    sourceUrl: row.url_fiche || 'https://montreal.ca/calendrier',
    observedAt,
    title: row.titre,
    description: row.description || undefined,
    category: TYPE_TO_CATEGORY[row.type_evenement?.toLowerCase() ?? ''] ?? 'unmapped',
    startsAt,
    endsAt: toIsoOrUndefined(row.date_fin ?? ''),
    venueName: row.titre_adresse || undefined,
    address: row.adresse_principale || undefined,
    point: hasPoint ? { longitude, latitude } : undefined,
    price: parsePrice(row.cout ?? ''),
    organizer: row.arrondissement || undefined,
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
