import {
  CATEGORY_FILTER_OPTIONS,
  DATE_FILTER_OPTIONS,
  PRICE_FILTER_OPTIONS,
  type PublicEvent,
  type SearchConstraintKey,
  type SearchExplanation
} from '@pulso/contracts';
import type {
  DateFilterValue,
  DiscoveryFilters,
  EventCategory,
  PriceFilterValue
} from '@pulso/domain';

export type SearchResolution = 'ready' | 'clarification' | 'no_reliable_result';

export interface DeterministicInterpretation {
  resolution: SearchResolution;
  derivedFilters: Partial<
    Pick<DiscoveryFilters, 'date' | 'categories' | 'price'>
  >;
  excludedCategories: EventCategory[];
  constraints: SearchExplanation[];
  rankingSignals: SearchExplanation[];
  clarification?: string;
  message?: string;
}

const CATEGORY_PATTERNS: ReadonlyArray<{
  category: EventCategory;
  pattern: RegExp;
}> = [
  { category: 'music', pattern: /\b(music|concerts?|live music)\b/ },
  {
    category: 'nightlife',
    pattern: /\b(nightlife|djs?|clubs?|dance party|dance parties)\b/
  },
  { category: 'festival', pattern: /\b(festivals?|festive events?)\b/ },
  { category: 'comedy', pattern: /\b(comedy|comedian|stand[ -]?up)\b/ },
  {
    category: 'show',
    pattern: /\b(shows?|theatre|theater|performances?)\b/
  },
  {
    category: 'other',
    pattern: /\b(other events?|community events?|gatherings?)\b/
  }
];

const DATE_PATTERNS: ReadonlyArray<{
  date: DateFilterValue;
  pattern: RegExp;
}> = [
  { date: 'tonight', pattern: /\btonight\b/ },
  { date: 'tomorrow', pattern: /\btomorrow\b/ },
  { date: 'weekend', pattern: /\b(this )?weekend\b/ },
  { date: 'next7', pattern: /\b(next|coming) (seven|7) days\b/ }
];

const PRICE_PATTERNS: ReadonlyArray<{
  price: Exclude<PriceFilterValue, 'all'>;
  pattern: RegExp;
}> = [
  { price: 'free', pattern: /\bfree\b/ },
  { price: 'paid', pattern: /\bpaid\b/ }
];

const rankingSignalDefinitions: ReadonlyArray<{
  id: 'soon' | 'lower_price' | 'higher_trust';
  label: string;
  pattern: RegExp;
}> = [
  {
    id: 'soon',
    label: 'Prefer events starting sooner',
    pattern: /\b(soon|starting soon|earliest)\b/
  },
  {
    id: 'lower_price',
    label: 'Prefer lower-cost known options',
    pattern: /\b(affordable|lower[ -]?cost|cheap)\b/
  },
  {
    id: 'higher_trust',
    label: 'Prefer more strongly confirmed information',
    pattern: /\b(reliable|well confirmed|confirmed information)\b/
  }
];

function categoryLabel(category: EventCategory): string {
  return CATEGORY_FILTER_OPTIONS.find(({ value }) => value === category)!.label;
}

function dateLabel(date: DateFilterValue): string {
  return DATE_FILTER_OPTIONS.find(({ value }) => value === date)!.label;
}

function priceLabel(price: Exclude<PriceFilterValue, 'all'>): string {
  return PRICE_FILTER_OPTIONS.find(({ value }) => value === price)!.label;
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
  disabledKeys: readonly SearchConstraintKey[] = []
): DeterministicInterpretation {
  const normalized = normalizeQuery(query);
  const disabled = new Set(disabledKeys);
  const constraints: SearchExplanation[] = [];
  const derivedFilters: DeterministicInterpretation['derivedFilters'] = {};

  if (
    /\b(near me|close to me|within\s+\d+\s*(km|kilomet(?:er|re)s?|miles?))\b/.test(
      normalized
    )
  ) {
    return {
      resolution: 'clarification',
      derivedFilters,
      excludedCategories: [],
      constraints,
      rankingSignals: [],
      clarification:
        'Which explicit location should Pulso use as the direct-distance reference? No location is assumed.'
    };
  }

  if (/\b\d+\s*minutes?\b/.test(normalized)) {
    return {
      resolution: 'no_reliable_result',
      derivedFilters,
      excludedCategories: [],
      constraints,
      rankingSignals: [],
      message:
        'Pulso cannot interpret travel time because the MVP provides no routing or implicit location.'
    };
  }

  const maximumPrice =
    /(?:under|below|less than|max(?:imum)?|up to)\s*\$?\s*(\d+(?:\.\d{1,2})?)/.exec(
      normalized
    );
  if (maximumPrice) {
    constraints.push({
      key: 'maximum_price',
      kind: 'hard',
      label: `Maximum price CAD ${maximumPrice[1]}`
    });
    return {
      resolution: 'no_reliable_result',
      derivedFilters,
      excludedCategories: [],
      constraints,
      rankingSignals: [],
      message:
        'Pulso recognized the maximum price, but the current fictional data has no verified numeric prices, so it cannot claim a reliable match.'
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
      clarification: 'Which one date range should Pulso use?'
    };
  }
  const date = dates[0];
  if (date && !disabled.has('date')) {
    derivedFilters.date = date;
    constraints.push({ key: 'date', kind: 'hard', label: dateLabel(date) });
  }

  const excludedCategories = CATEGORY_PATTERNS.filter(({ pattern }) => {
    const labelPattern = pattern.source;
    return new RegExp(
      `\\b(?:not|no|exclude|without)\\s+(?:${labelPattern})`,
      'i'
    ).test(normalized);
  }).map(({ category }) => category);

  const categories = CATEGORY_PATTERNS.filter(
    ({ category, pattern }) =>
      pattern.test(normalized) && !excludedCategories.includes(category)
  ).map(({ category }) => category);
  if (categories.includes('comedy') && /\bcomedy show\b/.test(normalized)) {
    const showIndex = categories.indexOf('show');
    if (showIndex >= 0) categories.splice(showIndex, 1);
  }
  if (categories.length > 0 && !disabled.has('categories')) {
    derivedFilters.categories = [...new Set(categories)];
    for (const category of derivedFilters.categories) {
      constraints.push({
        key: 'categories',
        kind: 'hard',
        label: categoryLabel(category)
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
      label: `Exclude ${categoryLabel(category)}`
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
      clarification: 'Should the price filter be Free or Paid?'
    };
  }
  const price = prices[0];
  if (price && !disabled.has('price')) {
    derivedFilters.price = price;
    constraints.push({ key: 'price', kind: 'hard', label: priceLabel(price) });
  }

  constraints.push({
    key: 'status',
    kind: 'hard',
    label: 'Upcoming scheduled or postponed events; cancelled events excluded'
  });
  constraints.push({
    key: 'bounds',
    kind: 'hard',
    label: 'Current visible Montréal map area'
  });

  const rankingSignals = rankingSignalDefinitions
    .filter(({ pattern }) => pattern.test(normalized))
    .map<SearchExplanation>(({ id, label }) => ({
      key: id,
      kind: 'ranking',
      label
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
      message:
        'Pulso could not reliably map this request to the supported event, date, price, or ranking criteria. Manual filters remain available.'
    };
  }

  return {
    resolution: 'ready',
    derivedFilters,
    excludedCategories: activeExclusions,
    constraints,
    rankingSignals
  };
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
  differences: readonly string[] = []
): Array<{
  event: PublicEvent;
  matchType: 'exact' | 'alternative';
  reasons: string[];
  differences: string[];
}> {
  const signals = new Set(interpretation.rankingSignals.map(({ key }) => key));
  return events
    .map((event) => {
      let score = 0;
      const reasons: string[] = [];
      if (interpretation.derivedFilters.categories?.includes(event.category)) {
        reasons.push(`Category matches: ${categoryLabel(event.category)}`);
      }
      if (interpretation.derivedFilters.price === event.price.kind) {
        reasons.push(
          `Price matches: ${priceLabel(event.price.kind as 'free' | 'paid')}`
        );
      }
      if (interpretation.derivedFilters.date) {
        reasons.push(
          `Date matches: ${dateLabel(interpretation.derivedFilters.date)}`
        );
      }
      if (signals.has('soon')) {
        score +=
          Math.max(0, 10_000_000_000_000 - new Date(event.startsAt).getTime()) /
          1_000_000_000;
        reasons.push(
          'Prioritized because it starts sooner among matching events'
        );
      }
      if (signals.has('lower_price')) {
        score += priceScore[event.price.kind] * 100;
        reasons.push(
          event.price.kind === 'free'
            ? 'Prioritized because the known price is Free'
            : event.price.kind === 'paid'
              ? 'Known as Paid; exact price is not confirmed'
              : 'Price is unknown and was not treated as lower cost'
        );
      }
      if (signals.has('higher_trust')) {
        score += trustScore[event.trust.label] * 10;
        reasons.push(
          `Trust information: ${event.trust.label.replace('_', ' ')}`
        );
      }
      if (reasons.length === 0) {
        reasons.push(
          'Eligible in the current map area and active event window'
        );
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
