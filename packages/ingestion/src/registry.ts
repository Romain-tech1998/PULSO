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

/**
 * Resolves an explicit pilot subset from the DATA-0002 registry. Unknown ids
 * are rejected instead of silently widening or changing the requested pilot.
 */
export function selectInstagramPilotTargets(
  registryCsvText: string,
  sourceIds: string[]
): InstagramScoutTarget[] {
  const watchlist = extractInstagramWatchlist(registryCsvText);
  const targetsById = new Map(
    watchlist.map((target) => [target.sourceId, target])
  );
  const uniqueIds = [...new Set(sourceIds)];
  const missingIds = uniqueIds.filter((sourceId) => !targetsById.has(sourceId));

  if (missingIds.length > 0) {
    throw new Error(
      `Instagram pilot source id(s) absent from DATA-0002: ${missingIds.join(', ')}`
    );
  }

  return uniqueIds.map((sourceId) => targetsById.get(sourceId)!);
}
