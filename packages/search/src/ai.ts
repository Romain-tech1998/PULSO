import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import {
  DATE_FILTER_VALUES,
  EVENT_CATEGORIES,
  PRICE_FILTER_VALUES,
  VENUE_CATEGORIES
} from '@pulso/domain';
import {
  type SearchMessageCode,
  type SupportedLocale
} from '@pulso/domain/localization';
import { z } from 'zod';

import {
  detectQueryLanguage,
  refineSearchText,
  type DeterministicInterpretation
} from './index.js';

/**
 * The only clarifications and messages the model may return.
 *
 * Two constraints shaped this list. Every code here is param-free, so the
 * model never has to interpolate a value into a translated string - the
 * `search.constraint.*` codes that do take params are built from the
 * filters below instead, where the value is known rather than narrated.
 * And `satisfies` ties the list to the domain: renaming a code there breaks
 * this build instead of silently producing a message the contract rejects
 * at the very end of the request.
 */
// `search.clarification.atmosphere` is deliberately gone. It fired on
// "bar" and on "boire un verre" - the two most natural things anyone types -
// and answered a search with a question. Pulso now answers those from the
// venue kind instead.
const CLARIFICATION_CODES = [
  'search.clarification.location',
  'search.clarification.date',
  'search.clarification.price'
] as const satisfies readonly SearchMessageCode[];

const MESSAGE_CODES = [
  'search.message.montrealOnly',
  'search.message.routingUnsupported',
  'search.message.maximumPriceUnavailable',
  'search.message.unsupported'
] as const satisfies readonly SearchMessageCode[];

/**
 * What the model is allowed to say.
 *
 * Values are constrained to the *real* domain enums, not to a list retyped
 * here. An earlier version of this file carried its own copies - 18
 * categories where the domain has 7, `thisWeekend` and `next30` which do not
 * exist, and no `paid` price - so the model produced values that parsed here
 * and then threw in `intelligentSearchResponseSchema` at the end of the
 * request, turning a working search into a 500.
 *
 * Every field is required-but-nullable rather than optional: OpenAI's strict
 * structured-output mode rejects optional properties, and "always emit the
 * key, use null when it does not apply" is the easiest rule for a model to
 * follow. For the same reason nothing here is a free-form record - a
 * `z.record` compiles to `propertyNames`, which strict mode refuses outright.
 */
export const aiInterpretationSchema = z.object({
  resolution: z.enum(['ready', 'clarification', 'no_reliable_result']),
  derivedFilters: z
    .object({
      date: z.enum(DATE_FILTER_VALUES).nullable(),
      categories: z.array(z.enum(EVENT_CATEGORIES)).nullable(),
      price: z.enum(PRICE_FILTER_VALUES).nullable()
    })
    .nullable(),
  excludedCategories: z.array(z.enum(EVENT_CATEGORIES)).nullable(),
  // The named thing the visitor is looking for, when they named one - a
  // show, an artist, a venue, a festival. This is what turns Pulso from a
  // filter builder into something that answers "Lion King" or "Centre Bell",
  // which it simply could not do before: the query text never reached the
  // data at all, it was only ever mined for date/category/price.
  searchText: z.string().nullable(),
  // A *kind* of place rather than a named one. "bar", "club", "théâtre" name
  // nothing in particular but are the most natural thing to type.
  venueCategories: z.array(z.enum(VENUE_CATEGORIES)).nullable(),
  clarification: z.enum(CLARIFICATION_CODES).nullable(),
  message: z.enum(MESSAGE_CODES).nullable(),
  suggestedLocation: z
    .object({
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-90).max(90)
    })
    .nullable(),
  suggestedNearMe: z.boolean().nullable()
});

export type AiInterpretation = z.infer<typeof aiInterpretationSchema>;

const SYSTEM_PROMPT = `You are the search engine for "Pulso", an event directory for Montréal.
A visitor types anything at all. Your job is to answer it, not to interview them.

Default posture: resolution "ready". Asking a question or refusing is the
exception, allowed only by rules 6 to 8. Everything else gets an answer, even
a broad one - a query that only says "musique" is a perfectly good request for
music events.

1. NAMED THINGS -> searchText.
   If the visitor names a specific show, artist, band, festival, venue, hall,
   bar or club, put that name alone in searchText. Not the whole sentence,
   not the date words - just the name.
   "le lion king ce soir" -> searchText "lion king", date "tonight"
   "un concert au centre bell" -> searchText "centre bell", categories ["music"]
   "je veux voir Coldplay" -> searchText "coldplay"
   "quoi faire au newspeak" -> searchText "newspeak"
   Do NOT put generic words in searchText. "un bar sympa" names no place;
   "de la musique" names no artist. Those are categories, not searchText.

2. DESCRIBED EVENINGS -> filters.
   Categories must be exactly one of: ${EVENT_CATEGORIES.join(', ')}.
   Map intent onto them - "rire"/"laugh" is comedy, "danser"/"dance"/"club"/"boîte" is nightlife,
   "concert"/"musique" is music, "théâtre"/"spectacle"/"opéra"/"danse" is show, "match"/"game" is sport.
   Dates must be exactly one of: ${DATE_FILTER_VALUES.join(', ')}.
   Prices must be exactly one of: ${PRICE_FILTER_VALUES.join(', ')}. "gratuit"/"free" is free.

3. Both at once is normal and expected: a named venue AND a category AND a date.

4. NEIGHBOURHOODS -> suggestedLocation.
   If the visitor names a Montréal area (le plateau, vieux-port, griffintown, mile end,
   rosemont, hochelaga, villeray, quartier des spectacles, centre-ville, verdun...),
   put its approximate centre there. Le Plateau is roughly longitude -73.5747,
   latitude 45.5236. A neighbourhood is a location, NOT searchText.

5. "near me", "close to me", "près de moi", "autour de moi": set suggestedNearMe
   to true and interpret the rest normally. Never clarify for this.

6. Another city -> "no_reliable_result", message "search.message.montrealOnly".
7. Travel time ("in 20 minutes", "à 20 minutes") -> "no_reliable_result",
   message "search.message.routingUnsupported".
8. A specific maximum price ("under $20", "moins de 20$") -> "no_reliable_result",
   message "search.message.maximumPriceUnavailable". Note "free"/"gratuit" is
   NOT this - that is price "free" and a perfectly good answer.
9. KINDS OF PLACE -> venueCategories, one of: ${VENUE_CATEGORIES.join(', ')}.
   "bar"/"pub"/"taverne" -> bar. "club"/"boîte"/"discothèque" -> nightclub.
   "théâtre" -> theater. "salle de concert" -> concert_hall. "microbrasserie"
   -> brewery_with_stage. "café" -> cafe_concert. "galerie"/"musée" ->
   gallery_museum. "boire un verre"/"prendre un verre" -> bar (and nightclub).
   Never ask which atmosphere they want - answer with the places.

10. Only if the query is truly empty of intent (gibberish, or a request Pulso
    has no notion of at all) answer "no_reliable_result" with message
    "search.message.unsupported". Prefer a broad ready answer over this.

Always emit every field. Use null where a field does not apply, and [] for empty lists.`;

/** Bounds a slow provider: without it a hung request holds the API's own request open. */
const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * Model id. Overridable through `options.model` rather than read from the
 * environment here: this package is a pure library with no node types, and
 * the API owns its own configuration.
 *
 * Kept small on purpose - this runs on every intelligent search, and the
 * project treats AI as a situational capability, not the default path.
 */
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

/**
 * Shapes a validated model answer into the same interpretation the
 * deterministic engine produces. Pure, so the mapping is testable without
 * calling a provider.
 */
export function toInterpretation(
  raw: AiInterpretation,
  query: string,
  preferredLocale: SupportedLocale
): DeterministicInterpretation {
  const derived = raw.derivedFilters;
  const derivedFilters: DeterministicInterpretation['derivedFilters'] = {};
  if (derived?.date) derivedFilters.date = derived.date;
  if (derived?.categories && derived.categories.length > 0) {
    derivedFilters.categories = [...new Set(derived.categories)];
  }
  if (derived?.price) derivedFilters.price = derived.price;
  const excludedCategories = [...new Set(raw.excludedCategories ?? [])];
  // Run the model's term through the same filter the deterministic engine
  // uses: it drops kind-of-place words, category words and stopwords, so
  // "bar" survives only as a venue kind and never as a substring to match
  // against titles. A one-character fragment matches most of the directory,
  // which reads as "Pulso ignored what I typed" rather than as a search.
  const searchText = raw.searchText
    ? (refineSearchText(raw.searchText) ?? '')
    : '';

  const interpretation: DeterministicInterpretation = {
    resolution: raw.resolution,
    derivedFilters,
    excludedCategories,
    // Built from the filters that were actually derived, not narrated by the
    // model. The visitor reads these as "here is what Pulso applied", so they
    // have to describe the query that ran - and the same shapes the
    // deterministic engine emits, since one UI renders both.
    constraints: [
      ...(derivedFilters.date
        ? [
            {
              key: 'date',
              kind: 'hard' as const,
              message: {
                code: 'search.constraint.date' as const,
                params: { date: derivedFilters.date }
              }
            }
          ]
        : []),
      ...(derivedFilters.categories ?? []).map((category) => ({
        key: 'categories',
        kind: 'hard' as const,
        message: {
          code: 'search.constraint.category' as const,
          params: { category }
        }
      })),
      ...excludedCategories.map((category) => ({
        key: 'excluded_categories',
        kind: 'hard' as const,
        message: {
          code: 'search.constraint.excludeCategory' as const,
          params: { category }
        }
      })),
      ...(derivedFilters.price
        ? [
            {
              key: 'price',
              kind: 'hard' as const,
              message: {
                code: 'search.constraint.price' as const,
                params: { price: derivedFilters.price }
              }
            }
          ]
        : [])
    ],
    // The deterministic engine derives these from explicit phrases ("cheap",
    // "reliable"). Nothing in the model's answer carries that signal, and
    // inventing one would put words in the visitor's mouth.
    rankingSignals: [],
    language: detectQueryLanguage(query, preferredLocale),
    engine: 'intelligent',
    ...(searchText.length >= 2 ? { searchText } : {}),
    ...(raw.venueCategories && raw.venueCategories.length > 0
      ? { venueCategories: [...new Set(raw.venueCategories)] }
      : {}),
    ...(raw.clarification
      ? { clarification: { code: raw.clarification } }
      : {}),
    ...(raw.message ? { message: { code: raw.message } } : {}),
    ...(raw.suggestedLocation
      ? { suggestedLocation: raw.suggestedLocation }
      : {}),
    ...(raw.suggestedNearMe ? { suggestedNearMe: true } : {})
  };

  // A "clarification" with nothing to ask, or a "no_reliable_result" with
  // nothing to say, reaches the visitor as an empty panel. Downgrade to the
  // honest generic message instead of rendering silence.
  if (
    interpretation.resolution === 'clarification' &&
    !interpretation.clarification
  ) {
    interpretation.resolution = 'no_reliable_result';
    interpretation.message = { code: 'search.message.unsupported' };
  }
  if (
    interpretation.resolution === 'no_reliable_result' &&
    !interpretation.message
  ) {
    interpretation.message = { code: 'search.message.unsupported' };
  }

  // Both observed on live answers, and both move the visitor's map for no
  // reason:
  //
  // - a named neighbourhood *and* "near me" at once ("sortir ce soir sur le
  //   plateau" came back with both). The named place is the explicit request,
  //   so it wins; the client acts on each flag separately and would otherwise
  //   recentre twice.
  // - a location hint on an answer that returned no events at all ("boire un
  //   verre" came back as a clarification with suggestedNearMe set). There is
  //   nothing to centre on until the visitor answers the question.
  if (interpretation.suggestedLocation) delete interpretation.suggestedNearMe;
  if (interpretation.resolution !== 'ready') {
    delete interpretation.suggestedLocation;
    delete interpretation.suggestedNearMe;
  }
  return interpretation;
}

export interface IntelligentSearchOptions {
  model?: string;
  timeoutMs?: number;
}

/**
 * Interprets a query with the configured model.
 *
 * Throws on any failure - an unreachable provider, a timeout, or an answer
 * that does not satisfy the schema. The caller is expected to fall back to
 * the deterministic engine and log the cause; swallowing the error here
 * would hide an AI search that fails on every call behind results that still
 * look plausible.
 */
export async function interpretIntelligentSearch(
  query: string,
  openrouterApiKey: string,
  preferredLocale: SupportedLocale,
  options: IntelligentSearchOptions = {}
): Promise<DeterministicInterpretation> {
  const openrouter = createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: openrouterApiKey
  });

  const { object } = await generateObject({
    model: openrouter(options.model ?? DEFAULT_MODEL),
    schema: aiInterpretationSchema,
    system: SYSTEM_PROMPT,
    prompt: query,
    temperature: 0,
    // One retry, not the SDK's default of two: this sits inside a request the
    // visitor is waiting on, and a provider that failed twice is not worth a
    // third wait when a deterministic answer is ready immediately.
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  });

  return toInterpretation(object, query, preferredLocale);
}
