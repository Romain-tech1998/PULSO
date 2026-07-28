import type { InstagramScoutReviewItem } from './instagram-scout-review.js';
import type { InstagramScoutTriageResult } from './instagram-scout-triage.js';

export type InstagramScoutMissingFact =
  'title' | 'date' | 'time' | 'venue_confirmation';

export interface InstagramScoutExtraction {
  workingTitle?: string | undefined;
  workingTitleConfidence?: number | undefined;
  dateMentions: string[];
  timeMentions: string[];
  priceMentions: string[];
  mentionedAccounts: string[];
  ticketingMentioned: boolean;
  sourceAccount: {
    sourceId: string;
    handle: string;
    role: 'possible_host_or_organizer';
  };
  missingFacts: InstagramScoutMissingFact[];
  evidenceCompleteness: number;
}

const timePattern =
  /\b(?:\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|\d{1,2}\s*h(?:\s*\d{2})?)\b/giu;
const pricePattern =
  /\b(?:gratuit(?:e)?|free)\b|(?:\b\d{1,3}(?:[.,]\d{2})?\s*\$|\$\s*\d{1,3}(?:[.,]\d{2})?)(?=$|\s|[.,;!?])/giu;
const accountPattern = /@[a-z0-9._]+/giu;
const ticketingPattern =
  /\b(?:ticket|tickets|billet|billets|billetterie|on sale|en vente|link in bio|lien en bio)\b/iu;

function uniqueMatches(caption: string, pattern: RegExp): string[] {
  return [...caption.matchAll(pattern)]
    .map((match) => match[0])
    .filter((value, index, values) => values.indexOf(value) === index);
}

function extractWorkingTitle(caption: string): string | undefined {
  const firstMeaningfulLine = caption
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length >= 5);

  if (!firstMeaningfulLine) return undefined;
  return firstMeaningfulLine.slice(0, 140);
}

/**
 * Extracts only facts directly visible in the caption. Raw mentions are kept
 * as evidence; dates are not silently assigned a year and the source account
 * is not treated as a confirmed event venue.
 */
export function extractInstagramScoutFacts(
  item: InstagramScoutReviewItem,
  triage: InstagramScoutTriageResult
): InstagramScoutExtraction {
  const caption = item.caption?.trim() ?? '';
  const workingTitle = extractWorkingTitle(caption);
  const timeMentions = uniqueMatches(caption, timePattern);
  const priceMentions = uniqueMatches(caption, pricePattern);
  const mentionedAccounts = uniqueMatches(caption, accountPattern).filter(
    (account) => account.toLocaleLowerCase() !== `@${item.handle}`.toLowerCase()
  );
  const ticketingMentioned = ticketingPattern.test(caption);
  const missingFacts: InstagramScoutMissingFact[] = [];

  if (!workingTitle) missingFacts.push('title');
  if (triage.dateMentions.length === 0) missingFacts.push('date');
  if (timeMentions.length === 0) missingFacts.push('time');
  missingFacts.push('venue_confirmation');

  const observedFacts = 4 - missingFacts.length;

  return {
    workingTitle,
    workingTitleConfidence: workingTitle ? 0.35 : undefined,
    dateMentions: triage.dateMentions,
    timeMentions,
    priceMentions,
    mentionedAccounts,
    ticketingMentioned,
    sourceAccount: {
      sourceId: item.sourceId,
      handle: item.handle,
      role: 'possible_host_or_organizer'
    },
    missingFacts,
    evidenceCompleteness: observedFacts / 4
  };
}
