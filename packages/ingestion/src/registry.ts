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

interface Mvp80WatchlistFile {
  accounts: Array<{ sourceId: string; handle: string }>;
}

/**
 * The curated ~80-account MVP subset (docs/data/research/instagram-watchlist-mvp80.json):
 * venue/nightclub/bar accounts only, selected by scan priority plus real
 * observed yield from a full watchlist run, meant to run far more often
 * than the full ~260-account registry without spending Apify/OpenRouter
 * budget on low-yield accounts (promoters, festivals, media curators).
 * Cross-checked against the full registry so a stale/renamed entry in the
 * curated file is rejected rather than silently queried.
 */
export function selectInstagramMvp80Targets(
  registryCsvText: string,
  mvp80JsonText: string
): InstagramScoutTarget[] {
  const parsed = JSON.parse(mvp80JsonText) as Mvp80WatchlistFile;
  return selectInstagramPilotTargets(
    registryCsvText,
    parsed.accounts.map((account) => account.sourceId)
  );
}
