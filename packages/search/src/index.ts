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
  PriceFilterValue
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
  clarification?: SearchMessage;
  message?: SearchMessage;
}

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
    pattern: /\b(comedy|comedian|stand[ -]?up|humour|humoristes?)\b/
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

  if (
    /\b(near me|close to me|pres de moi|proche de moi|within\s+\d+\s*(km|kilomet(?:er|re)s?|miles?)|a moins de\s+\d+\s*(km|kilometres?))\b/.test(
      normalized
    )
  ) {
    return {
      resolution: 'clarification',
      derivedFilters,
      excludedCategories: [],
      constraints,
      rankingSignals: [],
      language,
      clarification: { code: 'search.clarification.location' }
    };
  }

  if (/\b\d+\s*minutes?\b/.test(normalized)) {
    return {
      resolution: 'no_reliable_result',
      derivedFilters,
      excludedCategories: [],
      constraints,
      rankingSignals: [],
      language,
      message: { code: 'search.message.routingUnsupported' }
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

  const hasExpressedCriterion =
    Object.keys(derivedFilters).length > 0 ||
    activeExclusions.length > 0 ||
    rankingSignals.length > 0;
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
      message: { code: 'search.message.unsupported' }
    };
  }

  return {
    resolution: 'ready',
    derivedFilters,
    excludedCategories: activeExclusions,
    constraints,
    rankingSignals,
    language
  };
}

function detectQueryLanguage(
  normalized: string,
  preferredLocale: SupportedLocale
): SupportedLocale {
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

const trustScore: Record<PublicEvent['trust']['label'], number> = {
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
      if (signals.has('higher_trust')) {
        score += trustScore[event.trust.label] * 10;
        reasons.push({
          code: 'search.reason.trust',
          params: { trust: event.trust.label }
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
