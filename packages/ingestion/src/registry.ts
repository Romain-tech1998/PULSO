import { parseCsv } from './lib/csv.js';
import type { InstagramScoutTarget } from './sources/instagram-scout.js';

/**
 * Reads docs/data/research/montreal-source-registry.csv (already produced by
 * DATA-0002) and extracts the fixed watchlist of Instagram handles Pulso
 * Scout is allowed to check. This is the "defined, pre-approved list" boundary
 * from DEC-0006: no handle outside this registry should be queried without
 * updating the registry first.
 */
export function extractInstagramWatchlist(
  registryCsvText: string
): InstagramScoutTarget[] {
  const rows = parseCsv(registryCsvText);
  const targets: InstagramScoutTarget[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const handle = row.instagram_handle?.trim();
    const sourceId = row.source_id?.trim();
    if (!handle || !sourceId || seen.has(sourceId)) continue;
    seen.add(sourceId);
    targets.push({ sourceId, handle });
  }

  return targets;
}
