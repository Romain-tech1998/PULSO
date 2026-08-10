import {
  type PublicEvent,
  type SearchConstraintKey,
  type SearchExplanation,
  type SearchMessage
} from '@pulso/contracts';
import type {
  DateFilterValue,
  DiscoveryFilters,
  EventCategory,
  PriceFilterValue,
  VenueCategory
} from '@pulso/domain';
import type { SupportedLocale } from '@pulso/domain/localization';

export type SearchResolution = 'ready' | 'clarification' | 'no_reliable_result';

export interface DeterministicInterpretation {
  resolution: SearchResolution;
  derivedFilters: Partial<
    Pick<DiscoveryFilters, 'date' | 'categories' | 'price'>
  >;
  excludedCategories: EventCategory[];
  constraints: SearchExplanation[];
  rankingSignals: SearchExplanation[];
  language: SupportedLocale;
  engine: 'deterministic' | 'intelligent';
  clarification?: SearchMessage;
  message?: SearchMessage;
  suggestedLocation?: { longitude: number; latitude: number };
  suggestedNearMe?: boolean;
  /**
   * A name the visitor typed - a show, an artist, a venue - to be matched
   * against the directory's own text. Absent when the query only described a
   * kind of evening, which the filters already express.
   */
  searchText?: string;
  /**
   * A *kind* of place, as opposed to a named one. "bar", "club", "théâtre"
   * name no venue in particular but are the most natural thing to type, and
   * nothing in the search understood them: "bar" could only ever match a
   * venue whose name happened to contain the word.
   */
  venueCategories?: VenueCategory[];
}

const VENUE_CATEGORY_PATTERNS: ReadonlyArray<{
  category: VenueCategory;
  pattern: RegExp;
}> = [
  { category: 'bar', pattern: /\b(bars?|pubs?|tavernes?|brasseries?)\b/ },
  {
    category: 'nightclub',
    pattern:
      /\b(nightclubs?|night clubs?|clubs?|boites?( de nuit)?|discotheques?)\b/
  },
  {
    category: 'concert_hall',
    pattern: /\b(salles? de (concert|spectacle)|concert halls?|venues?)\b/
  },
  { category: 'theater', pattern: /\b(theatres?|theaters?)\b/ },
  {
    category: 'brewery_with_stage',
    pattern: /\b(microbrasseries?|breweries|brewery|brasseries? artisanales?)\b/
  },
  { category: 'cafe_concert', pattern: /\b(cafes?[ -]?concerts?|cafes?)\b/ },
  {
    category: 'gallery_museum',
    pattern: /\b(galeries?|galleries|gallery|musees?|museums?)\b/
  },
  {
    category: 'community_space',
    pattern:
      /\b(espaces? communautaires?|community (spaces?|centres?|centers?)|maisons? de la culture)\b/
  }
];

const CATEGORY_PATTERNS: ReadonlyArray<{
  category: EventCategory;
  pattern: RegExp;
}> = [
  {
    category: 'music',
    pattern: /\b(music|musique|concerts?|live music|musique live)\b/
  },
  {
    category: 'nightlife',
    pattern:
      /\b(nightlife|vie nocturne|djs?|clubs?|dance party|dance parties|boites? de nuit|soirees? dansantes?)\b/
  },
  {
    category: 'festival',
    pattern: /\b(festivals?|festive events?|evenements? festifs?)\b/
  },
  {
    category: 'comedy',
    // Matches the adjective forms too. `humour` alone missed "humoristique"
    // and "humouristique" - \b requires a boundary right after "humour", so
    // the word carried on and nothing matched. "un evenement humouristique"
    // then fell through as a name to look up and found nothing.
    pattern:
      /\b(comedy|comedian|stand[ -]?up|humou?r(?:istiques?|isues?|istes?)?|comiques?)\b/
  },
  {
    category: 'show',
    pattern: /\b(shows?|theatre|theater|performances?|spectacles?)\b/
  },
  {
    category: 'other',
    pattern:
      /\b(other events?|community events?|gatherings?|autres? evenements?|evenements? communautaires?|rassemblements?)\b/
  }
];

const DATE_PATTERNS: ReadonlyArray<{
  date: DateFilterValue;
  pattern: RegExp;
}> = [
  { date: 'tonight', pattern: /\b(tonight|ce soir)\b/ },
  { date: 'tomorrow', pattern: /\b(tomorrow|demain)\b/ },
  {
    date: 'weekend',
    pattern: /\b((this|ce) week[ -]?end|cette fin de semaine)\b/
  },
  {
    date: 'next7',
    pattern:
      /\b((next|coming) (seven|7) days|(les )?(sept|7) prochains jours|prochains (sept|7) jours)\b/
  }
];

const PRICE_PATTERNS: ReadonlyArray<{
  price: Exclude<PriceFilterValue, 'all'>;
  pattern: RegExp;
}> = [
  { price: 'free', pattern: /\b(free|gratuite?s?)\b/ },
  { price: 'paid', pattern: /\b(paid|payante?s?)\b/ }
];

const rankingSignalDefinitions: ReadonlyArray<{
  id: 'soon' | 'lower_price' | 'higher_trust';
  message: SearchMessage;
  pattern: RegExp;
}> = [
  {
    id: 'soon',
    message: { code: 'search.ranking.soon' },
    pattern:
      /\b(soon|starting soon|earliest|bientot|commence bientot|plus tot)\b/
  },
  {
    id: 'lower_price',
    message: { code: 'search.ranking.lowerPrice' },
    pattern:
      /\b(affordable|lower[ -]?cost|cheap|abordable|pas (trop )?cheres?|moins cheres?|economique)\b/
  },
  {
    id: 'higher_trust',
    message: { code: 'search.ranking.higherTrust' },
    pattern:
      /\b(reliable|well confirmed|confirmed information|fiable|bien confirme|informations? confirmees?)\b/
  }
];

/**
 * Words that carry no search intent on their own. Stripped so what is left
 * of a query, once every recognised filter phrase is removed, is the name
 * the visitor typed - "je veux voir le lion king ce soir" leaves "lion king".
 *
 * The AI engine does this far better. This exists so the fallback is still a
 * search engine rather than a filter builder when the provider is down or
 * unconfigured: without it, naming an event returns nothing at all.
 */
const SEARCH_TEXT_STOPWORDS = new Set([
  'a',
  'au',
  'aux',
  'ce',
  'ces',
  'cet',
  'cette',
  'chercher',
  'dans',
  'de',
  'des',
  'du',
  'en',
  'envie',
  'et',
  'faire',
  'fait',
  'je',
  'la',
  'le',
  'les',
  'lieu',
  'moi',
  'ou',
  'par',
  'pour',
  'quoi',
  'sortir',
  'sur',
  'trouver',
  'un',
  'une',
  'veux',
  'voir',
  'y',
  'aller',
  'assister',
  'evenement',
  'evenements',
  'truc',
  'chose',
  'quelque',
  // Words that describe an outing without naming anything. Left in, they
  // became search terms that match no record - "soirée comique" searched for
  // "soiree" and found nothing.
  'soiree',
  'soirees',
  'soir',
  'nuit',
  'ambiance',
  'sympa',
  'cool',
  'bon',
  'bonne',
  'petit',
  'petite',
  'gros',
  'grosse',
  'super',
  'meilleur',
  'meilleure',
  'night',
  'nice',
  'good',
  'great',
  'best',
  'fun',
  'cheap',
  'and',
  'any',
  'at',
  'attend',
  'event',
  'events',
  'find',
  'for',
  'go',
  'going',
  'i',
  'in',
  'me',
  'of',
  'on',
  'out',
  'search',
  'see',
  'show',
  'something',
  'the',
  'to',
  'want',
  'wanna',
  'what',
  'where',
  'with'
]);

/**
 * Strips a free-text term down to what is worth matching against the
 * directory's own text.
 *
 * The AI engine needs this as much as the deterministic one. Asked for "bar",
 * the model returns both `venueCategories: ['bar']` and `searchText: 'bar'` -
 * and that second half then substring-matches "**Bar**batuques",
 * "**BAR**BRA Streisand" and "Stereo**Bar**", which sort *above* the real
 * bars because a title match outranks a venue kind. A word already expressed
 * as a kind of place is not also a name.
 */
export function refineSearchText(text: string): string | undefined {
  return extractResidualSearchText(normalizeQuery(text));
}

/**
 * Whatever the visitor typed that was not a date, a price, an event
 * category, a kind of place, a ranking hint or a stopword. Matched against
 * event titles, organizers and venue names.
 */
function extractResidualSearchText(normalized: string): string | undefined {
  let residual = normalized;
  for (const { pattern } of [
    ...CATEGORY_PATTERNS,
    ...VENUE_CATEGORY_PATTERNS,
    ...DATE_PATTERNS,
    ...PRICE_PATTERNS,
    ...rankingSignalDefinitions
  ]) {
    residual = residual.replace(new RegExp(pattern.source, 'gi'), ' ');
  }
  residual = residual
    .replace(
      /\b(near me|close to me|around me|nearby|pres de moi|proche de moi|autour de moi)\b/g,
      ' '
    )
    .replace(/[^a-z0-9' ]+/g, ' ');

  const kept = residual
    .split(' ')
    .map((word) => word.trim())
    .filter((word) => word.length > 1 && !SEARCH_TEXT_STOPWORDS.has(word));

  const text = kept.join(' ').trim();
  return text.length >= 2 ? text : undefined;
}

function normalizeQuery(query: string): string {
  return query
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function interpretDeterministicSearch(
  query: string,
  disabledKeys: readonly SearchConstraintKey[] = [],
  preferredLocale: SupportedLocale = 'en'
): DeterministicInterpretation {
  const normalized = normalizeQuery(query);
  const language = detectQueryLanguage(normalized, preferredLocale);
  const disabled = new Set(disabledKeys);
  const constraints: SearchExplanation[] = [];
  const derivedFilters: DeterministicInterpretation['derivedFilters'] = {};

  if (/\b\d+\s*minutes?\b/.test(normalized)) {
    return {
      resolution: 'no_reliable_result',
      derivedFilters,
      excludedCategories: [],
      constraints,
      rankingSignals: [],
      language,
      engine: 'deterministic',
      message: { code: 'search.message.routingUnsupported' }
    };
  }

  // Two different questions hide behind distance phrasing, and they cannot
  // share one answer.
  //
  // "near me" only asks to centre the search on the visitor. Explore now has
  // a real geolocated Distance filter, so the honest answer is to hand the
  // caller `suggestedNearMe` and let it apply that filter - not to stop and
  // ask a question the product can already answer. (This used to return a
  // clarification, which predates the Distance filter.)
  //
  // "within 5 km" also names a radius, and DeterministicInterpretation has
  // nowhere to put one. Answering `ready` would search whatever radius the
  // client happens to have set and present that as an exact match, which is
  // the one thing UX-0001 forbids - so this case still asks.
  const asksNearMe =
    /\b(near me|close to me|around me|nearby|pres de moi|proche de moi|autour de moi)\b/.test(
      normalized
    );
  const namesRadius =
    /\b(?:within|under|less than|a moins de|moins de|dans un rayon de)\s*\d+\s*(?:km|kms|kilomet(?:er|re)s?|miles?|mi)\b/.test(
      normalized
    );
  if (namesRadius) {
    return {
      resolution: 'clarification',
      derivedFilters,
      excludedCategories: [],
      constraints,
      rankingSignals: [],
      language,
      engine: 'deterministic',
      clarification: { code: 'search.clarification.location' }
    };
  }

  const maximumPrice =
    /(?:under|below|less than|max(?:imum)?|up to|moins de|sous|jusqu'a)\s*\$?\s*(\d+(?:[.,]\d{1,2})?)/.exec(
      normalized
    );
  if (maximumPrice) {
    constraints.push({
      key: 'maximum_price',
      kind: 'hard',
      message: {
        code: 'search.constraint.maximumPrice',
        params: { amount: maximumPrice[1]!.replace(',', '.') }
      }
    });
    return {
      resolution: 'no_reliable_result',
      derivedFilters,
      excludedCategories: [],
      constraints,
      rankingSignals: [],
      language,
      engine: 'deterministic',
      message: { code: 'search.message.maximumPriceUnavailable' }
    };
  }

  const dates = DATE_PATTERNS.filter(({ pattern }) =>
    pattern.test(normalized)
  ).map(({ date }) => date);
  if (new Set(dates).size > 1) {
    return {
      resolution: 'clarification',
      derivedFilters,
      excludedCategories: [],
      constraints,
      rankingSignals: [],
      language,
      engine: 'deterministic',
      clarification: { code: 'search.clarification.date' }
    };
  }
  const date = dates[0];
  if (date && !disabled.has('date')) {
    derivedFilters.date = date;
    constraints.push({
      key: 'date',
      kind: 'hard',
      message: { code: 'search.constraint.date', params: { date } }
    });
  }

  const excludedCategories = CATEGORY_PATTERNS.filter(({ pattern }) => {
    const labelPattern = pattern.source;
    return new RegExp(
      `\\b(?:not|no|exclude|without|pas de|sans|exclure)\\s+(?:${labelPattern})`,
      'i'
    ).test(normalized);
  }).map(({ category }) => category);

  const categories = CATEGORY_PATTERNS.filter(
    ({ category, pattern }) =>
      pattern.test(normalized) && !excludedCategories.includes(category)
  ).map(({ category }) => category);
  if (
    categories.includes('comedy') &&
    /\b(comedy show|spectacle d'humour|spectacle humour)\b/.test(normalized)
  ) {
    const showIndex = categories.indexOf('show');
    if (showIndex >= 0) categories.splice(showIndex, 1);
  }
  if (categories.length > 0 && !disabled.has('categories')) {
    derivedFilters.categories = [...new Set(categories)];
    for (const category of derivedFilters.categories) {
      constraints.push({
        key: 'categories',
        kind: 'hard',
        message: {
          code: 'search.constraint.category',
          params: { category }
        }
      });
    }
  }
  const activeExclusions = disabled.has('excluded_categories')
    ? []
    : [...new Set(excludedCategories)];
  for (const category of activeExclusions) {
    constraints.push({
      key: 'excluded_categories',
      kind: 'hard',
      message: {
        code: 'search.constraint.excludeCategory',
        params: { category }
      }
    });
  }

  const prices = PRICE_PATTERNS.filter(({ pattern }) =>
    pattern.test(normalized)
  ).map(({ price }) => price);
  if (new Set(prices).size > 1) {
    return {
      resolution: 'clarification',
      derivedFilters,
      excludedCategories: activeExclusions,
      constraints,
      rankingSignals: [],
      language,
      engine: 'deterministic',
      clarification: { code: 'search.clarification.price' }
    };
  }
  const price = prices[0];
  if (price && !disabled.has('price')) {
    derivedFilters.price = price;
    constraints.push({
      key: 'price',
      kind: 'hard',
      message: { code: 'search.constraint.price', params: { price } }
    });
  }

  constraints.push({
    key: 'status',
    kind: 'hard',
    message: { code: 'search.constraint.status' }
  });
  constraints.push({
    key: 'bounds',
    kind: 'hard',
    message: { code: 'search.constraint.bounds' }
  });

  const rankingSignals = rankingSignalDefinitions
    .filter(({ pattern }) => pattern.test(normalized))
    .map<SearchExplanation>(({ id, message }) => ({
      key: id,
      kind: 'ranking',
      message
    }));

  const venueCategories = VENUE_CATEGORY_PATTERNS.filter(({ pattern }) =>
    pattern.test(normalized)
  ).map(({ category }) => category);
  const searchText = extractResidualSearchText(normalized);
  const hasExpressedCriterion =
    venueCategories.length > 0 ||
    Object.keys(derivedFilters).length > 0 ||
    activeExclusions.length > 0 ||
    rankingSignals.length > 0 ||
    // A bare "lion king" expresses no filter at all, but it is the clearest
    // request Pulso can receive. Before this it fell through to
    // "unsupported", which is why naming an event returned nothing.
    searchText !== undefined;
  if (!hasExpressedCriterion) {
    return {
      resolution: 'no_reliable_result',
      derivedFilters,
      excludedCategories: activeExclusions,
      constraints: constraints.filter(
        ({ key }) => key === 'status' || key === 'bounds'
      ),
      rankingSignals,
      language,
      engine: 'deterministic',
      message: { code: 'search.message.unsupported' }
    };
  }

  return {
    resolution: 'ready',
    derivedFilters,
    excludedCategories: activeExclusions,
    constraints,
    rankingSignals,
    language,
    engine: 'deterministic',
    ...(asksNearMe ? { suggestedNearMe: true } : {}),
    ...(searchText ? { searchText } : {}),
    ...(venueCategories.length > 0
      ? { venueCategories: [...new Set(venueCategories)] }
      : {})
  };
}

/**
 * Exported so the AI engine answers in the same language the deterministic
 * one would: DEC-0003 makes the query's own language win over the UI locale,
 * and two engines disagreeing on that would be visible to the visitor.
 */
export function detectQueryLanguage(
  query: string,
  preferredLocale: SupportedLocale
): SupportedLocale {
  // Normalizing here rather than trusting the caller: normalizeQuery is
  // idempotent, so the deterministic path passing an already-normalized
  // string costs nothing, and the AI path can pass a raw query.
  const normalized = normalizeQuery(query);
  const french = (
    normalized.match(
      /\b(ce soir|demain|cette fin de semaine|prochains jours|musique|vie nocturne|boite|soiree|evenement|spectacle|humour|gratuit|payant|bientot|abordable|fiable|sans|pres de moi|proche de moi|moins de|jusqu'a)\b/g
    ) ?? []
  ).length;
  const english = (
    normalized.match(
      /\b(tonight|tomorrow|weekend|next seven days|music|nightlife|dance party|show|comedy|free|paid|soon|affordable|reliable|without|near me|close to me|under|up to)\b/g
    ) ?? []
  ).length;
  return french > english ? 'fr' : english > french ? 'en' : preferredLocale;
}

const trustScore: Record<NonNullable<PublicEvent['trust']>['label'], number> = {
  confirmed: 3,
  probable: 2,
  to_verify: 1,
  conflicting: 0
};

const priceScore: Record<PublicEvent['price']['kind'], number> = {
  free: 2,
  paid: 1,
  unknown: 0
};

export function rankAndExplainEvents(
  events: readonly PublicEvent[],
  interpretation: DeterministicInterpretation,
  matchType: 'exact' | 'alternative',
  differences: readonly SearchMessage[] = []
): Array<{
  event: PublicEvent;
  matchType: 'exact' | 'alternative';
  reasons: SearchMessage[];
  differences: SearchMessage[];
}> {
  const signals = new Set(interpretation.rankingSignals.map(({ key }) => key));
  return events
    .map((event) => {
      let score = 0;
      const reasons: SearchMessage[] = [];
      if (interpretation.derivedFilters.categories?.includes(event.category)) {
        reasons.push({
          code: 'search.reason.category',
          params: { category: event.category }
        });
      }
      if (interpretation.derivedFilters.price === event.price.kind) {
        reasons.push({
          code: 'search.reason.price',
          params: { price: event.price.kind }
        });
      }
      if (interpretation.derivedFilters.date) {
        reasons.push({
          code: 'search.reason.date',
          params: { date: interpretation.derivedFilters.date }
        });
      }
      // Relevance to what was actually asked for, scored far above the
      // preference signals below. Without this every result scored 0 and the
      // only tiebreak was "soonest first" - so searching "bar" put whatever
      // started next at the top, even when it was held on a festival site
      // that merely has a bar on it, above every real bar in the city.
      const askedKinds = interpretation.venueCategories ?? [];
      if (askedKinds.length > 0) {
        const venueKind = event.venue.category;
        const secondary = event.venue.secondaryCategories ?? [];
        if (venueKind && askedKinds.includes(venueKind)) {
          score += 1_000_000;
          reasons.push({
            code: 'search.reason.venueKind',
            params: { venue: venueKind }
          });
        } else {
          const alsoIs = secondary.find((kind) => askedKinds.includes(kind));
          if (alsoIs) {
            score += 100_000;
            reasons.push({
              code: 'search.reason.venueKindSecondary',
              params: { venue: alsoIs }
            });
          }
        }
      }
      if (interpretation.searchText) {
        const needle = normalizeQuery(interpretation.searchText);
        if (normalizeQuery(event.title).includes(needle)) {
          score += 10_000_000;
          reasons.push({
            code: 'search.reason.nameMatch',
            params: { text: interpretation.searchText }
          });
        }
      }
      if (signals.has('soon')) {
        score +=
          Math.max(0, 10_000_000_000_000 - new Date(event.startsAt).getTime()) /
          1_000_000_000;
        reasons.push({ code: 'search.reason.soon' });
      }
      if (signals.has('lower_price')) {
        score += priceScore[event.price.kind] * 100;
        reasons.push({
          code:
            event.price.kind === 'free'
              ? 'search.reason.lowerPriceFree'
              : event.price.kind === 'paid'
                ? 'search.reason.lowerPricePaid'
                : 'search.reason.lowerPriceUnknown'
        });
      }
      // Account-created events carry no trust label (DEC-0017), so the
      // trust signal simply does not apply to them rather than scoring them
      // as if they were a poorly-corroborated sourced record.
      const eventTrust = event.trust;
      if (signals.has('higher_trust') && eventTrust) {
        score += trustScore[eventTrust.label] * 10;
        reasons.push({
          code: 'search.reason.trust',
          params: { trust: eventTrust.label }
        });
      }
      if (reasons.length === 0) {
        reasons.push({ code: 'search.reason.eligible' });
      }
      return {
        event,
        matchType,
        reasons,
        differences: [...differences],
        score
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        new Date(left.event.startsAt).getTime() -
          new Date(right.event.startsAt).getTime() ||
        left.event.id.localeCompare(right.event.id)
    )
    .map(({ event, matchType, reasons, differences }) => ({
      event,
      matchType,
      reasons,
      differences
    }));
}

export * from './ai.js';
