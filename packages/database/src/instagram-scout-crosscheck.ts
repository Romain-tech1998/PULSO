import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  crosscheckInstagramScoutVenueCandidates,
  fetchInstagramScoutSignals,
  parseCsv,
  type InstagramScoutVenueCandidate
} from '@pulso/ingestion';

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
const outputDirectory = fileURLToPath(
  new URL('../ingestion-output/', import.meta.url)
);

interface VisualPilotReport {
  reviewQueue: {
    items: Array<{
      reviewId: string;
      caption?: string;
    }>;
  };
  visualEvidence: Record<string, { ocrText?: string }>;
  visualAnalysis: Record<
    string,
    {
      extraction: { dateMentions: string[] };
      possibleVenueMentions: string[];
    }
  >;
  [key: string]: unknown;
}

async function latestVisualReportPath(): Promise<string> {
  const names = (await readdir(outputDirectory))
    .filter(
      (name) =>
        name.startsWith('instagram-scout-pilot-') &&
        name.endsWith('.json') &&
        !name.includes('-crosschecked')
    )
    .sort()
    .reverse();
  const latest = names[0];
  if (!latest) throw new Error('No Instagram Scout visual report found.');
  return join(outputDirectory, latest);
}

async function main(): Promise<void> {
  const inputPath = await latestVisualReportPath();
  const report = JSON.parse(
    await readFile(inputPath, 'utf8')
  ) as VisualPilotReport;
  const registryRows = parseCsv(await readFile(registryCsvPath, 'utf8'));
  const venueByName = new Map(
    registryRows
      .filter(
        (row) =>
          row.normalized_source_type === 'venue' &&
          row.display_name &&
          row.instagram_handle
      )
      .map((row) => [
        row.display_name?.toLocaleLowerCase(),
        {
          sourceId: row.source_id ?? '',
          handle: row.instagram_handle ?? ''
        }
      ])
  );
  const itemById = new Map(
    report.reviewQueue.items.map((item) => [item.reviewId, item])
  );
  const candidates: InstagramScoutVenueCandidate[] = [];

  for (const [reviewId, analysis] of Object.entries(report.visualAnalysis)) {
    for (const venueName of analysis.possibleVenueMentions) {
      const venue = venueByName.get(venueName.toLocaleLowerCase());
      if (!venue) continue;
      const item = itemById.get(reviewId);
      candidates.push({
        reviewId,
        venueSourceId: venue.sourceId,
        venueName,
        evidenceText: [item?.caption, report.visualEvidence[reviewId]?.ocrText]
          .filter(Boolean)
          .join('\n'),
        dateMentions: analysis.extraction.dateMentions
      });
    }
  }

  const officialTargets = [
    ...new Map(
      candidates.map((candidate) => {
        const venue = venueByName.get(candidate.venueName.toLocaleLowerCase());
        return [
          candidate.venueSourceId,
          {
            sourceId: candidate.venueSourceId,
            handle: venue?.handle ?? ''
          }
        ];
      })
    ).values()
  ].filter((target) => target.handle);
  const targetErrors: Array<{
    sourceId: string;
    handle: string;
    message: string;
  }> = [];
  const officialSignals = await fetchInstagramScoutSignals(officialTargets, {
    mediaFieldsLimit: 25,
    onTargetError: (target, message) =>
      targetErrors.push({ ...target, message })
  });
  const officialCrosschecks = crosscheckInstagramScoutVenueCandidates(
    candidates,
    officialSignals
  );
  const outputPath = inputPath.replace(/\.json$/u, '-crosschecked.json');
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        ...report,
        officialCrosscheck: {
          generatedAt: new Date().toISOString(),
          targetErrors,
          officialSignalsChecked: officialSignals.length,
          results: officialCrosschecks,
          publicationAuthorized: false
        }
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(
    JSON.stringify({
      outputPath,
      candidates: candidates.length,
      officialVenueAccounts: officialTargets.length,
      officialSignalsChecked: officialSignals.length,
      confirmed: officialCrosschecks.filter(
        (result) => result.status === 'confirmed_by_official_venue_account'
      ).length,
      unmatched: officialCrosschecks.filter(
        (result) => result.status === 'no_official_match'
      ).length,
      targetErrors: targetErrors.length,
      publicationAuthorized: false
    })
  );
}

await main();
