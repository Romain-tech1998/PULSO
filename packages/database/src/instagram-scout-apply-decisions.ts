import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  reconcileInstagramScoutDecisions,
  type InstagramScoutDecisionCandidate,
  type InstagramScoutOperatorDecision
} from '@pulso/ingestion';

const outputDirectory = fileURLToPath(
  new URL('../ingestion-output/', import.meta.url)
);

interface DecisionExport {
  generatedAt: string;
  sourceCrosscheckGeneratedAt: string;
  publicationAuthorized: false;
  decisions: InstagramScoutOperatorDecision[];
}

interface CrosscheckedReport {
  visualAnalysis: Record<
    string,
    {
      extraction: {
        dateMentions: string[];
        timeMentions: string[];
      };
      possibleVenueMentions: string[];
    }
  >;
}

function decisionPathFromArguments(): string {
  const flagIndex = process.argv.indexOf('--decisions');
  const configured = flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined;
  if (!configured) {
    throw new Error(
      'Provide the exported review file with --decisions <path>.'
    );
  }
  return resolve(configured);
}

async function latestCrosscheckedReportPath(): Promise<string> {
  const names = (await readdir(outputDirectory))
    .filter(
      (name) =>
        name.startsWith('instagram-scout-pilot-') &&
        name.endsWith('-crosschecked.json')
    )
    .sort()
    .reverse();
  const latest = names[0];
  if (!latest) throw new Error('No crosschecked Instagram Scout report found.');
  return join(outputDirectory, latest);
}

async function main(): Promise<void> {
  const decisionsPath = decisionPathFromArguments();
  const reportPath = await latestCrosscheckedReportPath();
  const decisions = JSON.parse(
    await readFile(decisionsPath, 'utf8')
  ) as DecisionExport;
  const report = JSON.parse(
    await readFile(reportPath, 'utf8')
  ) as CrosscheckedReport;
  const candidates: InstagramScoutDecisionCandidate[] = Object.entries(
    report.visualAnalysis
  ).map(([reviewId, analysis]) => ({
    reviewId,
    dateMentions: analysis.extraction.dateMentions,
    timeMentions: analysis.extraction.timeMentions,
    possibleVenueMentions: analysis.possibleVenueMentions
  }));

  // MVP-0001 is Montréal-only. Place Bell's official address is in Laval, so
  // accepted evidence from that venue must be retained but cannot reach the
  // public-event mapper for this launch scope.
  const reconciliations = reconcileInstagramScoutDecisions(
    decisions.decisions,
    candidates,
    { 'Place Bell': 'Laval', 'Centre Bell': 'Montréal' }
  );
  const outputPath = join(
    outputDirectory,
    `instagram-scout-reconciliation-${decisions.generatedAt.replace(/[:.]/gu, '-')}.json`
  );
  const summary = {
    readyForMapping: reconciliations.filter(
      (item) => item.resolution === 'ready_for_mapping'
    ).length,
    blockedOutsideMvp: reconciliations.filter(
      (item) => item.resolution === 'blocked_outside_mvp'
    ).length,
    blockedMissingFacts: reconciliations.filter(
      (item) => item.resolution === 'blocked_missing_facts'
    ).length,
    excludedByReview: reconciliations.filter(
      (item) => item.resolution === 'excluded_by_review'
    ).length
  };

  await writeFile(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        decisionsFile: basename(decisionsPath),
        reportFile: basename(reportPath),
        mvpCity: 'Montréal',
        summary,
        reconciliations,
        databaseWrites: 0,
        publicationAuthorized: false
      },
      null,
      2
    ),
    'utf8'
  );
  console.log(
    JSON.stringify({
      outputPath,
      ...summary,
      databaseWrites: 0,
      publicationAuthorized: false
    })
  );
}

await main();
