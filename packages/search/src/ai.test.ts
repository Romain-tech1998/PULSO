import { describe, expect, it } from 'vitest';

import {
  aiInterpretationSchema,
  toInterpretation,
  type AiInterpretation
} from './ai.js';

function answer(overrides: Partial<AiInterpretation> = {}): AiInterpretation {
  return {
    resolution: 'ready',
    derivedFilters: { date: null, categories: null, price: null },
    excludedCategories: null,
    searchText: null,
    venueCategories: null,
    clarification: null,
    message: null,
    suggestedLocation: null,
    suggestedNearMe: null,
    ...overrides
  };
}

describe('aiInterpretationSchema', () => {
  // Regression: the schema used to carry its own retyped value lists - 18
  // categories where the domain has 7, plus `thisWeekend` and `next30`. The
  // model's answer parsed here and then threw at response validation,
  // turning an otherwise working search into a 500.
  it('rejects categories the domain does not define', () => {
    const result = aiInterpretationSchema.safeParse(
      answer({
        derivedFilters: {
          date: null,
          categories: ['performing_arts' as never],
          price: null
        }
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects date filters the domain does not define', () => {
    expect(
      aiInterpretationSchema.safeParse(
        answer({
          derivedFilters: {
            date: 'thisWeekend' as never,
            categories: null,
            price: null
          }
        })
      ).success
    ).toBe(false);
  });

  it('accepts "paid", which the earlier hand-written price list omitted', () => {
    expect(
      aiInterpretationSchema.safeParse(
        answer({
          derivedFilters: { date: null, categories: null, price: 'paid' }
        })
      ).success
    ).toBe(true);
  });

  it('rejects an invented message code rather than letting it reach the contract', () => {
    expect(
      aiInterpretationSchema.safeParse(
        answer({
          resolution: 'no_reliable_result',
          message: 'search.message.somethingMadeUp' as never
        })
      ).success
    ).toBe(false);
  });
});

describe('toInterpretation', () => {
  it('maps a ready answer onto the shared interpretation shape', () => {
    const result = toInterpretation(
      answer({
        derivedFilters: {
          date: 'tonight',
          categories: ['music', 'nightlife'],
          price: 'free'
        },
        excludedCategories: ['comedy']
      }),
      'free music tonight',
      'en'
    );

    expect(result.resolution).toBe('ready');
    expect(result.engine).toBe('intelligent');
    expect(result.derivedFilters).toEqual({
      date: 'tonight',
      categories: ['music', 'nightlife'],
      price: 'free'
    });
    expect(result.excludedCategories).toEqual(['comedy']);
  });

  it('omits null filters instead of writing them as keys', () => {
    const result = toInterpretation(answer(), 'music', 'en');
    expect(result.derivedFilters).toEqual({});
    expect(result.clarification).toBeUndefined();
    expect(result.suggestedLocation).toBeUndefined();
    expect(result.suggestedNearMe).toBeUndefined();
  });

  it('de-duplicates repeated categories', () => {
    const result = toInterpretation(
      answer({
        derivedFilters: {
          date: null,
          categories: ['music', 'music', 'show'],
          price: null
        },
        excludedCategories: ['comedy', 'comedy']
      }),
      'music',
      'en'
    );
    expect(result.derivedFilters.categories).toEqual(['music', 'show']);
    expect(result.excludedCategories).toEqual(['comedy']);
  });

  it('answers in the language of the query, not the interface locale', () => {
    // DEC-0003: a French query in an English interface is answered in
    // French. The deterministic engine already did this; the two engines
    // disagreeing would be visible to the visitor.
    expect(
      toInterpretation(answer(), 'musique gratuite ce soir', 'en').language
    ).toBe('fr');
    expect(
      toInterpretation(answer(), 'free music tonight', 'fr').language
    ).toBe('en');
  });

  it('falls back to the interface locale when the query gives no signal', () => {
    expect(toInterpretation(answer(), 'jazz', 'fr').language).toBe('fr');
  });

  it('downgrades a clarification that asks nothing', () => {
    // An empty clarification reaches the visitor as a panel with no question
    // in it. Saying "no reliable result" is at least honest.
    const result = toInterpretation(
      answer({ resolution: 'clarification', clarification: null }),
      'surprends moi',
      'fr'
    );
    expect(result.resolution).toBe('no_reliable_result');
    expect(result.message?.code).toBe('search.message.unsupported');
    expect(result.clarification).toBeUndefined();
  });

  it('keeps a clarification that does ask something', () => {
    const result = toInterpretation(
      answer({
        resolution: 'clarification',
        clarification: 'search.clarification.price'
      }),
      'boire un verre',
      'fr'
    );
    expect(result.resolution).toBe('clarification');
    expect(result.clarification?.code).toBe('search.clarification.price');
  });

  it('never leaves a no_reliable_result without a message', () => {
    const result = toInterpretation(
      answer({ resolution: 'no_reliable_result', message: null }),
      'events in paris',
      'en'
    );
    expect(result.message?.code).toBe('search.message.unsupported');
  });

  it('passes a neighbourhood centre through', () => {
    const result = toInterpretation(
      answer({
        derivedFilters: { date: 'tonight', categories: null, price: null },
        suggestedLocation: { longitude: -73.5747, latitude: 45.5236 }
      }),
      'sortir ce soir sur le plateau',
      'fr'
    );
    expect(result.suggestedLocation).toEqual({
      longitude: -73.5747,
      latitude: 45.5236
    });
  });

  it('lets a named neighbourhood win over "near me"', () => {
    // Observed live: "sortir ce soir sur le plateau" came back with both set.
    // The client acts on each separately and would recentre the map twice.
    const result = toInterpretation(
      answer({
        derivedFilters: { date: 'tonight', categories: null, price: null },
        suggestedLocation: { longitude: -73.5747, latitude: 45.5236 },
        suggestedNearMe: true
      }),
      'sortir ce soir sur le plateau',
      'fr'
    );
    expect(result.suggestedLocation).toBeDefined();
    expect(result.suggestedNearMe).toBeUndefined();
  });

  it('drops location hints when the answer carries no events', () => {
    // Observed live: a clarification came back with suggestedNearMe set.
    // There is nothing to centre on until the visitor answers.
    const result = toInterpretation(
      answer({
        resolution: 'clarification',
        clarification: 'search.clarification.price',
        suggestedNearMe: true
      }),
      'boire un verre',
      'fr'
    );
    expect(result.resolution).toBe('clarification');
    expect(result.suggestedNearMe).toBeUndefined();
    expect(result.suggestedLocation).toBeUndefined();
  });

  it('builds the constraints from the filters rather than from the model', () => {
    // The model is never asked to narrate these: the codes that take params
    // would force it to interpolate values into translated strings.
    const result = toInterpretation(
      answer({
        derivedFilters: {
          date: 'tonight',
          categories: ['music'],
          price: 'free'
        },
        excludedCategories: ['comedy']
      }),
      'musique gratuite ce soir sans humour',
      'fr'
    );
    expect(
      result.constraints.map(({ key, message }) => [key, message.code])
    ).toEqual([
      ['date', 'search.constraint.date'],
      ['categories', 'search.constraint.category'],
      ['excluded_categories', 'search.constraint.excludeCategory'],
      ['price', 'search.constraint.price']
    ]);
    expect(result.constraints[0]?.message.params).toEqual({ date: 'tonight' });
    expect(result.rankingSignals).toEqual([]);
  });

  it('drops message params when the model sends none', () => {
    const result = toInterpretation(
      answer({
        resolution: 'no_reliable_result',
        message: 'search.message.montrealOnly'
      }),
      'events in toronto',
      'en'
    );
    expect(result.message).toEqual({ code: 'search.message.montrealOnly' });
  });
});
