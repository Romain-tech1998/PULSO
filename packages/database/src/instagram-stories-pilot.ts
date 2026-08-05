import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  analyzeEventImage,
  extractInstagramWatchlist,
  fetchInstagramStoriesSignals,
  parseCsv,
  selectInstagramMvp80Targets,
  selectInstagramPilotTargets,
  type EventImageAnalysis,
  type InstagramStorySignal
} from '@pulso/ingestion';

/**
 * Complement to Pulso Scout (instagram-scout-pilot.ts), not a replacement:
 * scrapes Stories via Apify (Meta's official Graph API does not expose
 * Stories - see sources/instagram-stories-apify.ts) and reads each image
 * with an AI vision model (OpenRouter) instead of the regex-based
 * caption/OCR pipeline the Feed/Reels connector uses, since Stories rarely
 * carry a caption to mine text from.
 *
 * Same DEC-0006 discipline applies: this produces a human-review queue
 * only, never an automatic publication.
 */

const defaultSourceIds = [
  'new-city-gas',
  'mtelus',
  'club-soda',
  'newspeak',
  'evenko'
];

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

function requestedSourceIds(): string[] {
  const configured = process.env.INSTAGRAM_STORIES_PILOT_SOURCE_IDS;
  if (!configured) return defaultSourceIds;
  return configured
    .split(',')
    .map((sourceId) => sourceId.trim())
    .filter(Boolean);
}

export interface InstagramStoryReviewItem extends InstagramStorySignal {
  reviewId: string;
  analysis?: EventImageAnalysis | undefined;
  analysisError?: string | undefined;
}

async function main(): Promise<void> {
  const registryCsv = await readFile(registryCsvPath, 'utf8');
  const targets = process.argv.includes('--mvp80')
    ? selectInstagramMvp80Targets(
        registryCsv,
        await readFile(mvp80JsonPath, 'utf8')
      )
    : process.argv.includes('--all')
      ? extractInstagramWatchlist(registryCsv)
      : selectInstagramPilotTargets(registryCsv, requestedSourceIds());

  const signals = await fetchInstagramStoriesSignals(targets);
  console.error(`Instagram Stories: ${signals.length} stories fetched`);

  const items: InstagramStoryReviewItem[] = [];
  let completed = 0;
  for (const signal of signals) {
    const reviewId = `${signal.sourceId}:${signal.storyId}`;
    completed += 1;
    if (!signal.imageUrl) {
      items.push({
        ...signal,
        reviewId,
        analysisError: 'No image URL (video story, unsupported for now)'
      });
      continue;
    }
    try {
      const analysis = await analyzeEventImage(signal.imageUrl);
      items.push({ ...signal, reviewId, analysis });
    } catch (error) {
      items.push({
        ...signal,
        reviewId,
        analysisError: error instanceof Error ? error.message : String(error)
      });
    }
    if (completed % 5 === 0 || completed === signals.length) {
      console.error(
        `Instagram Stories vision analysis: ${completed}/${signals.length}`
      );
    }
  }

  const likelyEventCount = items.filter(
    (item) => item.analysis?.isLikelyEvent
  ).length;
  const errorCount = items.filter((item) => item.analysisError).length;

  const report = {
    generatedAt: new Date().toISOString(),
    publicationAuthorized: false,
    pilot: {
      sourceIds: targets.map((target) => target.sourceId),
      targetCount: targets.length
    },
    items
  };

  await mkdir(outputDirectory, { recursive: true });
  const timestamp = report.generatedAt.replace(/[:.]/g, '-');
  const outputPath = join(
    outputDirectory,
    `instagram-stories-pilot-${timestamp}.json`
  );
  await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(
    JSON.stringify({
      outputPath,
      targets: targets.length,
      storiesFetched: signals.length,
      likelyEventCount,
      errorCount,
      publicationAuthorized: false
    })
  );
}

await main();
