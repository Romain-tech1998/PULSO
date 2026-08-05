import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  analyzeEventImage,
  fetchInstagramScoutSignals,
  fetchInstagramStoriesSignals,
  normalizeForKey,
  selectInstagramMvp80Targets,
  type EventImageAnalysis
} from '@pulso/ingestion';

/**
 * Unified Pulso Scout pilot: runs the official Graph API Feed/Reels
 * connector AND the Apify Stories connector against the same curated
 * ~80-account MVP watchlist (docs/data/research/instagram-watchlist-mvp80.json),
 * reads every image with the same OpenRouter vision model
 * (analyzeEventImage - see lib/openrouter-vision.ts) rather than Feed's old
 * regex/OCR pipeline, and deduplicates candidates that show up on BOTH
 * surfaces (same account posting the same event to Feed and to a Story)
 * into a single review candidate instead of two.
 *
 * Same DEC-0006 discipline as both predecessors: produces a human-review
 * queue only, never an automatic publication.
 */

// .env only exists for local dev; CI provides these vars directly via
// GitHub Actions secrets, so a missing file here is expected, not an error.
try {
  loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const registryCsvPath = fileURLToPath(
  new URL(
    '../../../docs/data/research/montreal-source-registry.csv',
    import.meta.url
  )
);
const mvp80JsonPath = fileURLToPath(
  new URL(
    '../../../docs/data/research/instagram-watchlist-mvp80.json',
    import.meta.url
  )
);
const outputDirectory = fileURLToPath(
  new URL('../ingestion-output/', import.meta.url)
);

interface UnifiedCandidate {
  reviewId: string;
  seenIn: Array<'feed' | 'story'>;
  sourceId: string;
  handle: string;
  imageUrl?: string | undefined;
  permalink?: string | undefined;
  takenAt?: string | undefined;
  analysis?: EventImageAnalysis | undefined;
  analysisError?: string | undefined;
}

function dedupeKey(
  sourceId: string,
  analysis: EventImageAnalysis | undefined
): string {
  const title = normalizeForKey(analysis?.workingTitle ?? '');
  const date = normalizeForKey(analysis?.dateText ?? '');
  return `${sourceId}|${title}|${date}`;
}

function confidenceRank(
  confidence: EventImageAnalysis['confidence'] | undefined
): number {
  if (confidence === 'high') return 3;
  if (confidence === 'medium') return 2;
  if (confidence === 'low') return 1;
  return 0;
}

async function main(): Promise<void> {
  // Feed/Reels posts are static once published - scanning the same ~220
  // posts with a paid vision call every single day burns budget for zero
  // new signal, so this only fetches feed when explicitly asked (weekly
  // cadence in CI) or when neither flag is given (local/manual default:
  // both). Stories genuinely change day to day (24h expiry) so they run
  // on their own, more frequent cadence via --stories-only.
  const feedOnly = process.argv.includes('--feed-only');
  const storiesOnly = process.argv.includes('--stories-only');
  const runFeed = !storiesOnly;
  const runStories = !feedOnly;

  const registryCsv = await readFile(registryCsvPath, 'utf8');
  const targets = selectInstagramMvp80Targets(
    registryCsv,
    await readFile(mvp80JsonPath, 'utf8')
  );

  const targetErrors: Array<{
    sourceId: string;
    handle: string;
    message: string;
  }> = [];
  const feedSignals = runFeed
    ? await fetchInstagramScoutSignals(targets, {
        onTargetError: (target, message) => {
          targetErrors.push({ ...target, message });
        }
      })
    : [];
  const storySignals = runStories
    ? await fetchInstagramStoriesSignals(targets)
    : [];
  console.error(
    `Unified Scout: ${targets.length} accounts, ${feedSignals.length} feed items, ${storySignals.length} stories`
  );

  const rawCandidates: UnifiedCandidate[] = [];

  for (const signal of feedSignals) {
    const imageUrl =
      signal.mediaAssets?.[0]?.mediaUrl ??
      signal.mediaAssets?.[0]?.thumbnailUrl;
    rawCandidates.push({
      reviewId: `feed:${signal.sourceId}:${signal.mediaId}`,
      seenIn: ['feed'],
      sourceId: signal.sourceId,
      handle: signal.handle,
      imageUrl,
      permalink: signal.permalink,
      takenAt: signal.timestamp
    });
  }
  for (const signal of storySignals) {
    rawCandidates.push({
      reviewId: `story:${signal.sourceId}:${signal.storyId}`,
      seenIn: ['story'],
      sourceId: signal.sourceId,
      handle: signal.handle,
      imageUrl: signal.imageUrl,
      takenAt: signal.takenAt
    });
  }

  let completed = 0;
  for (const candidate of rawCandidates) {
    completed += 1;
    if (!candidate.imageUrl) {
      candidate.analysisError = 'No image URL available for vision analysis';
    } else {
      try {
        candidate.analysis = await analyzeEventImage(candidate.imageUrl);
      } catch (error) {
        candidate.analysisError =
          error instanceof Error ? error.message : String(error);
      }
    }
    if (completed % 10 === 0 || completed === rawCandidates.length) {
      console.error(
        `Unified Scout vision analysis: ${completed}/${rawCandidates.length}`
      );
    }
  }

  // Merge candidates that are the same real-world event seen on both
  // surfaces (same account, same normalized title+date) into one entry
  // instead of presenting the operator two review cards for one event.
  const merged = new Map<string, UnifiedCandidate>();
  for (const candidate of rawCandidates) {
    const key = dedupeKey(candidate.sourceId, candidate.analysis);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, candidate);
      continue;
    }
    const keepNew =
      confidenceRank(candidate.analysis?.confidence) >
      confidenceRank(existing.analysis?.confidence);
    const winner = keepNew ? candidate : existing;
    winner.seenIn = [...new Set([...existing.seenIn, ...candidate.seenIn])];
    merged.set(key, winner);
  }

  const items = [...merged.values()];
  const likelyEventCount = items.filter(
    (item) => item.analysis?.isLikelyEvent
  ).length;
  const mergedAwayCount = rawCandidates.length - items.length;

  const report = {
    generatedAt: new Date().toISOString(),
    publicationAuthorized: false,
    pilot: { accountCount: targets.length },
    targetErrors,
    items
  };

  await mkdir(outputDirectory, { recursive: true });
  const timestamp = report.generatedAt.replace(/[:.]/g, '-');
  const outputPath = join(
    outputDirectory,
    `instagram-unified-pilot-${timestamp}.json`
  );
  await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(
    JSON.stringify({
      outputPath,
      accounts: targets.length,
      feedItems: feedSignals.length,
      storyItems: storySignals.length,
      candidatesAnalyzed: rawCandidates.length,
      mergedAway: mergedAwayCount,
      likelyEventCount,
      publicationAuthorized: false
    })
  );
}

await main();
