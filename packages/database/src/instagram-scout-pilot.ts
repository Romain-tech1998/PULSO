import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  automateInstagramScoutReviewQueue,
  buildInstagramScoutReviewQueue,
  extractInstagramScoutFacts,
  extractInstagramWatchlist,
  fetchInstagramScoutSignals,
  parseCsv,
  selectInstagramMvp80Targets,
  selectInstagramPilotTargets,
  triageInstagramScoutItem,
  type InstagramScoutReviewItem
} from '@pulso/ingestion';
import { extractInstagramScoutVisualEvidence } from './instagram-scout-visual-ocr.js';

const defaultSourceIds = [
  'new-city-gas',
  'mtelus',
  'club-soda',
  'newspeak',
  'evenko'
];

loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));

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
  const configured = process.env.INSTAGRAM_SCOUT_PILOT_SOURCE_IDS;
  if (!configured) return defaultSourceIds;
  return configured
    .split(',')
    .map((sourceId) => sourceId.trim())
    .filter(Boolean);
}

function requestedMediaLimit(): number {
  const flagIndex = process.argv.indexOf('--media-limit');
  const raw = flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined;
  if (!raw) return 10;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
    throw new Error('--media-limit must be an integer between 1 and 25.');
  }
  return limit;
}

function normalizeEvidence(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

function venueNames(registryCsv: string): string[] {
  return parseCsv(registryCsv)
    .filter((row) => row.normalized_source_type === 'venue')
    .map((row) => row.display_name ?? '')
    .filter((name) => normalizeEvidence(name).length >= 4);
}

function analyzeVisualEvidence(
  item: InstagramScoutReviewItem,
  ocrText: string,
  knownVenueNames: string[]
) {
  const combinedItem = {
    ...item,
    caption: [item.caption, ocrText].filter(Boolean).join('\n')
  };
  const triage = triageInstagramScoutItem(combinedItem);
  const extraction = extractInstagramScoutFacts(combinedItem, triage);
  const normalizedText = normalizeEvidence(ocrText);
  const possibleVenueMentions = knownVenueNames.filter((name) =>
    normalizedText.includes(normalizeEvidence(name))
  );
  const captionExtraction = item.extraction;

  return {
    triage,
    extraction,
    possibleVenueMentions,
    gains: {
      date:
        extraction.dateMentions.length >
        (captionExtraction?.dateMentions.length ?? 0),
      time:
        extraction.timeMentions.length >
        (captionExtraction?.timeMentions.length ?? 0),
      price:
        extraction.priceMentions.length >
        (captionExtraction?.priceMentions.length ?? 0),
      ticketing:
        extraction.ticketingMentioned && !captionExtraction?.ticketingMentioned,
      possibleVenue: possibleVenueMentions.length > 0
    },
    venueStillRequiresConfirmation: true,
    publicationAuthorized: false
  } as const;
}

async function main(): Promise<void> {
  const visualOcrEnabled = process.argv.includes('--visual');
  const registryCsv = await readFile(registryCsvPath, 'utf8');
  const targets = process.argv.includes('--mvp80')
    ? selectInstagramMvp80Targets(
        registryCsv,
        await readFile(mvp80JsonPath, 'utf8')
      )
    : process.argv.includes('--all')
      ? extractInstagramWatchlist(registryCsv)
      : selectInstagramPilotTargets(registryCsv, requestedSourceIds());
  const mediaLimitPerTarget = requestedMediaLimit();
  const targetErrors: Array<{
    sourceId: string;
    handle: string;
    message: string;
  }> = [];
  const signals = await fetchInstagramScoutSignals(targets, {
    mediaFieldsLimit: mediaLimitPerTarget,
    onTargetError: (target, message) => {
      targetErrors.push({ ...target, message });
    }
  });
  if (visualOcrEnabled) {
    console.error(`Instagram visual OCR: ${signals.length} signals fetched`);
  }
  const queue = automateInstagramScoutReviewQueue(
    buildInstagramScoutReviewQueue(signals)
  );
  const visualEvidence = visualOcrEnabled
    ? await extractInstagramScoutVisualEvidence(queue.items, {
        workingDirectory: outputDirectory,
        onProgress: (completed, total) => {
          if (completed % 5 === 0 || completed === total) {
            console.error(`Instagram visual OCR: ${completed}/${total}`);
          }
        }
      })
    : new Map();
  const knownVenueNames = venueNames(registryCsv);
  const visualAnalysis = visualOcrEnabled
    ? Object.fromEntries(
        queue.items.map((item) => {
          const evidence = visualEvidence.get(item.reviewId);
          return [
            item.reviewId,
            evidence?.ocrText
              ? analyzeVisualEvidence(item, evidence.ocrText, knownVenueNames)
              : undefined
          ];
        })
      )
    : undefined;
  const automationCounts = queue.items.reduce<Record<string, number>>(
    (counts, item) => {
      const decision = item.automation?.decision ?? 'unclassified';
      counts[decision] = (counts[decision] ?? 0) + 1;
      return counts;
    },
    {}
  );
  const extractionSummary = {
    withWorkingTitle: queue.items.filter(
      (item) => item.extraction?.workingTitle
    ).length,
    withDate: queue.items.filter(
      (item) => (item.extraction?.dateMentions.length ?? 0) > 0
    ).length,
    withTime: queue.items.filter(
      (item) => (item.extraction?.timeMentions.length ?? 0) > 0
    ).length,
    withPrice: queue.items.filter(
      (item) => (item.extraction?.priceMentions.length ?? 0) > 0
    ).length,
    withTicketingSignal: queue.items.filter(
      (item) => item.extraction?.ticketingMentioned
    ).length
  };
  const report = {
    pilot: {
      sourceIds: targets.map((target) => target.sourceId),
      targetCount: targets.length,
      mediaLimitPerTarget
    },
    targetErrors,
    reviewQueue: queue,
    visualEvidence: visualOcrEnabled
      ? Object.fromEntries(visualEvidence.entries())
      : undefined,
    visualAnalysis
  };

  await mkdir(outputDirectory, { recursive: true });
  const timestamp = queue.generatedAt.replace(/[:.]/g, '-');
  const outputPath = join(
    outputDirectory,
    `instagram-scout-pilot-${timestamp}.json`
  );
  await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(
    JSON.stringify({
      outputPath,
      targets: targets.length,
      targetErrors: targetErrors.length,
      reviewItems: queue.itemCount,
      productTypes: queue.productTypeCounts,
      automationDecisions: automationCounts,
      extraction: extractionSummary,
      visualOcr: visualOcrEnabled
        ? {
            attempted: [...visualEvidence.values()].filter(
              (evidence) => evidence.attempted
            ).length,
            withText: [...visualEvidence.values()].filter(
              (evidence) => evidence.ocrText
            ).length,
            errors: [...visualEvidence.values()].filter(
              (evidence) => evidence.error
            ).length
          }
        : undefined,
      visualEvidenceGains: visualAnalysis
        ? {
            date: Object.values(visualAnalysis).filter(
              (analysis) => analysis?.gains.date
            ).length,
            time: Object.values(visualAnalysis).filter(
              (analysis) => analysis?.gains.time
            ).length,
            price: Object.values(visualAnalysis).filter(
              (analysis) => analysis?.gains.price
            ).length,
            ticketing: Object.values(visualAnalysis).filter(
              (analysis) => analysis?.gains.ticketing
            ).length,
            possibleVenue: Object.values(visualAnalysis).filter(
              (analysis) => analysis?.gains.possibleVenue
            ).length
          }
        : undefined,
      publicationAuthorized: queue.publicationAuthorized
    })
  );
}

await main();
