import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import type { DeterministicInterpretation } from './index.js';
import {
  EVENT_CATEGORIES,
  PRICE_FILTER_VALUES,
  DATE_FILTER_VALUES
} from '@pulso/domain';
import type { SupportedLocale } from '@pulso/domain/localization';

const searchOutputSchema = z.object({
  resolution: z.enum(['ready', 'clarification', 'no_reliable_result']),
  derivedFilters: z.object({
    date: z.enum(DATE_FILTER_VALUES).optional(),
    categories: z.array(z.enum(EVENT_CATEGORIES)).optional(),
    price: z.enum(PRICE_FILTER_VALUES).optional()
  }),
  excludedCategories: z.array(z.enum(EVENT_CATEGORIES)),
  constraints: z.array(
    z.object({
      key: z.string(),
      kind: z.enum(['hard', 'ranking']),
      message: z.object({
        code: z.string(),
        params: z
          .record(z.string(), z.union([z.string(), z.number()]))
          .optional()
      })
    })
  ),
  rankingSignals: z.array(
    z.object({
      key: z.string(),
      kind: z.enum(['hard', 'ranking']),
      message: z.object({
        code: z.string(),
        params: z
          .record(z.string(), z.union([z.string(), z.number()]))
          .optional()
      })
    })
  ),
  clarification: z
    .object({
      code: z.string(),
      params: z.record(z.string(), z.union([z.string(), z.number()])).optional()
    })
    .optional(),
  message: z
    .object({
      code: z.string(),
      params: z.record(z.string(), z.union([z.string(), z.number()])).optional()
    })
    .optional()
});

export async function interpretIntelligentSearch(
  query: string,
  preferredLocale: SupportedLocale = 'en'
): Promise<DeterministicInterpretation> {
  const systemPrompt = `You are the intelligent search assistant for Pulso, a nightlife and events application in Montreal.
Your goal is to extract structured search criteria from a user's natural language query.

# Rules:
1. We only support Montreal. If the user asks for another city, set resolution to "no_reliable_result" and add a constraint message "search.constraint.bounds".
2. If the user says "near me", "close by", return resolution "clarification" with clarification code "search.clarification.location".
3. Map the user's intent to these EVENT_CATEGORIES: ${EVENT_CATEGORIES.join(', ')}.
4. Map the user's date to DATE_FILTER_VALUES: ${DATE_FILTER_VALUES.join(', ')}.
5. Map the user's price preference to PRICE_FILTER_VALUES: ${PRICE_FILTER_VALUES.join(', ')}.
6. If the user wants to exclude a category, add it to 'excludedCategories'.
7. 'constraints' should list hard constraints (like date, categories, price). The message codes are e.g., 'search.constraint.category', 'search.constraint.date', 'search.constraint.price'.
8. 'rankingSignals' should list soft preferences (like 'soon', 'lower_price', 'higher_trust'). The message codes are e.g., 'search.ranking.soon', 'search.ranking.lowerPrice'.
9. The application language is ${preferredLocale}.

Output the JSON strictly matching the schema.`;

  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: searchOutputSchema,
      prompt: query,
      system: systemPrompt
    });

    return {
      ...object,
      language: preferredLocale
    } as DeterministicInterpretation;
  } catch (error) {
    throw new Error('AI interpretation failed.', { cause: error });
  }
}
