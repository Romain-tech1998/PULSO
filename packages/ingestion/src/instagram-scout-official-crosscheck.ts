import type { InstagramScoutSignal } from './sources/instagram-scout.js';

export interface InstagramScoutVenueCandidate {
  reviewId: string;
  venueSourceId: string;
  venueName: string;
  evidenceText: string;
  dateMentions: string[];
}

export interface InstagramScoutOfficialCrosscheck {
  reviewId: string;
  venueSourceId: string;
  venueName: string;
  status: 'confirmed_by_official_venue_account' | 'no_official_match';
  matchedMediaId?: string;
  matchedPermalink?: string;
  sharedDates: string[];
  sharedDistinctiveTerms: string[];
  publicationAuthorized: false;
}

const months: Record<string, string> = {
  janvier: '01',
  january: '01',
  fevrier: '02',
  february: '02',
  mars: '03',
  march: '03',
  avril: '04',
  april: '04',
  mai: '05',
  may: '05',
  juin: '06',
  june: '06',
  juillet: '07',
  july: '07',
  aout: '08',
  august: '08',
  septembre: '09',
  september: '09',
  octobre: '10',
  october: '10',
  novembre: '11',
  november: '11',
  decembre: '12',
  december: '12'
};

const ignoredTerms = new Set([
  'avec',
  'bell',
  'billet',
  'billets',
  'centre',
  'concert',
  'evenko',
  'event',
  'glace',
  'juillet',
  'june',
  'july',
  'novembre',
  'november',
  'place',
  'presente',
  'presents',
  'show',
  'spectacle',
  'ticket',
  'tickets'
]);

function normalized(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function canonicalDates(text: string): Set<string> {
  const value = normalized(text);
  const dates = new Set<string>();
  const monthNames = Object.keys(months).join('|');
  const dayFirst = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})\\b`,
    'giu'
  );
  const monthFirst = new RegExp(
    `\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`,
    'giu'
  );
  for (const match of value.matchAll(dayFirst)) {
    const month = months[match[2] ?? ''];
    if (month) dates.add(`${month}-${(match[1] ?? '').padStart(2, '0')}`);
  }
  for (const match of value.matchAll(monthFirst)) {
    const month = months[match[1] ?? ''];
    if (month) dates.add(`${month}-${(match[2] ?? '').padStart(2, '0')}`);
  }
  return dates;
}

function distinctiveTerms(text: string): Set<string> {
  return new Set(
    normalized(text)
      .split(/[^a-z0-9]+/u)
      .filter((term) => term.length >= 4 && !ignoredTerms.has(term))
  );
}

export function crosscheckInstagramScoutVenueCandidates(
  candidates: InstagramScoutVenueCandidate[],
  officialVenueSignals: InstagramScoutSignal[]
): InstagramScoutOfficialCrosscheck[] {
  return candidates.map((candidate) => {
    const candidateDates = canonicalDates(candidate.dateMentions.join(' '));
    const candidateTerms = distinctiveTerms(candidate.evidenceText);
    let best:
      | {
          signal: InstagramScoutSignal;
          sharedDates: string[];
          sharedTerms: string[];
        }
      | undefined;

    for (const signal of officialVenueSignals.filter(
      (item) => item.sourceId === candidate.venueSourceId
    )) {
      const caption = signal.caption ?? '';
      const sharedDates = [...canonicalDates(caption)].filter((date) =>
        candidateDates.has(date)
      );
      const sharedTerms = [...distinctiveTerms(caption)].filter((term) =>
        candidateTerms.has(term)
      );
      if (
        sharedDates.length > 0 &&
        sharedTerms.length > 0 &&
        (!best ||
          sharedDates.length + sharedTerms.length >
            best.sharedDates.length + best.sharedTerms.length)
      ) {
        best = { signal, sharedDates, sharedTerms };
      }
    }

    return {
      reviewId: candidate.reviewId,
      venueSourceId: candidate.venueSourceId,
      venueName: candidate.venueName,
      status: best
        ? 'confirmed_by_official_venue_account'
        : 'no_official_match',
      ...(best
        ? {
            matchedMediaId: best.signal.mediaId,
            ...(best.signal.permalink
              ? { matchedPermalink: best.signal.permalink }
              : {})
          }
        : {}),
      sharedDates: best?.sharedDates ?? [],
      sharedDistinctiveTerms: best?.sharedTerms ?? [],
      publicationAuthorized: false
    };
  });
}
