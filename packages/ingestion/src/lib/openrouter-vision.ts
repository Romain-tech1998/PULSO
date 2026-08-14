/**
 * Reads an event poster/flyer image via OpenRouter's chat completions
 * endpoint (OpenAI-compatible schema). Verified live against OpenRouter's
 * published API reference (2026-08-03): endpoint
 * `https://openrouter.ai/api/v1/chat/completions`, `Authorization: Bearer
 * <key>` header, and a user message with a multi-part `content` array
 * (`{type:'text', text}` + `{type:'image_url', image_url:{url}}`). The
 * image URL can point directly at Instagram's CDN - no need to download or
 * store the binary ourselves.
 *
 * Model defaults to `openai/gpt-4o-mini` (OpenRouter requires the
 * organization-prefixed name). Set OPENROUTER_API_KEY in the environment.
 */

const OPENROUTER_CHAT_COMPLETIONS_URL =
  'https://openrouter.ai/api/v1/chat/completions';
// A single stalled request has no default timeout in Node's fetch, so a
// pipeline processing hundreds of images sequentially can hang forever on
// one bad call (observed live: a CI run stuck >45min with no error). Each
// vision call gets its own budget instead of relying on the caller.
const REQUEST_TIMEOUT_MS = 45_000;

export interface EventImageAnalysis {
  isLikelyEvent: boolean;
  workingTitle?: string | undefined;
  dateText?: string | undefined;
  timeText?: string | undefined;
  venueNameGuess?: string | undefined;
  priceText?: string | undefined;
  ticketingUrlOrHandle?: string | undefined;
  eventIsInFuture?: boolean | undefined;
  confidence: 'low' | 'medium' | 'high';
  reasoning?: string | undefined;
}

function buildAnalysisPrompt(referenceDate: string): string {
  return `Today's date is ${referenceDate}. You are looking at a single Instagram image that may or may not advertise a real-world FUTURE event (concert, show, party, exhibition, etc.) in Montreal, Canada. Pulso only cares about events people can still go to - never past ones.

Reply with ONLY a JSON object (no markdown fences) with this exact shape:
{
  "isLikelyEvent": boolean,
  "workingTitle": string or null,
  "dateText": string or null (the date exactly as written on the image, do not infer a year if absent),
  "timeText": string or null (the time exactly as written),
  "venueNameGuess": string or null,
  "priceText": string or null,
  "ticketingUrlOrHandle": string or null (a URL or @handle mentioned for tickets),
  "eventIsInFuture": boolean or null (compare dateText, inferring the nearest sensible year if none is written, against today's date ${referenceDate}; null if no date is legible at all),
  "confidence": "low" | "medium" | "high",
  "reasoning": string (one sentence explaining your confidence)
}

STRICT rule for isLikelyEvent - set it to true ONLY if ALL of these hold:
1. The image is genuinely advertising a real event, not a mood/lifestyle photo, a solo artist portrait with no other context, a repost, or a product ad.
2. At least ONE of the following is true:
   a. A specific date is legible AND eventIsInFuture is true (a date that is clearly in the past, e.g. last month or last year, means isLikelyEvent MUST be false even if everything else looks like an event ad).
   b. A ticketing link or @handle for buying tickets is visible.
   c. Both an event title AND a venue name are clearly legible together (a structured announcement, not just an artist's name and a nice photo).
If none of 2a/2b/2c hold - for example a photogenic shot of a guitarist or DJ with no date, no venue, and no ticketing info - set isLikelyEvent to false regardless of how "eventy" the vibe looks. Never invent a date, time, or venue that is not visibly present in the image.`;
}

interface OpenRouterChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export async function analyzeEventImage(
  imageUrl: string,
  options: {
    apiKey?: string;
    model?: string;
    fetchImpl?: typeof fetch;
    referenceDate?: string;
  } = {}
): Promise<EventImageAnalysis> {
  const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
  const model = options.model ?? 'openai/gpt-4o-mini';
  const fetchImpl = options.fetchImpl ?? fetch;
  const referenceDate =
    options.referenceDate ?? new Date().toISOString().slice(0, 10);

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is required to analyze event images.');
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(
    () => timeoutController.abort(),
    REQUEST_TIMEOUT_MS
  );
  let response: Response;
  try {
    response = await fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: buildAnalysisPrompt(referenceDate) },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ]
      }),
      signal: timeoutController.signal
    });
  } catch (error) {
    if (timeoutController.signal.aborted) {
      throw new Error(
        `OpenRouter request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`,
        { cause: error }
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const body = (await response.json()) as OpenRouterChatResponse;
  if (!response.ok || body.error) {
    throw new Error(
      `OpenRouter returned an error: ${body.error?.message ?? `HTTP ${response.status}`}`
    );
  }

  const rawContent = body.choices?.[0]?.message?.content ?? '';
  const jsonText = rawContent
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();

  let parsed: Partial<EventImageAnalysis>;
  try {
    parsed = JSON.parse(jsonText) as Partial<EventImageAnalysis>;
  } catch {
    throw new Error(
      `OpenRouter response was not valid JSON: ${rawContent.slice(0, 200)}`
    );
  }

  // Defense in depth: even if the model doesn't perfectly follow the
  // "isLikelyEvent requires eventIsInFuture !== false" rule in the prompt,
  // enforce it in code - Pulso only ever wants future events.
  const isLikelyEvent =
    (parsed.isLikelyEvent ?? false) && parsed.eventIsInFuture !== false;

  return {
    isLikelyEvent,
    workingTitle: parsed.workingTitle ?? undefined,
    dateText: parsed.dateText ?? undefined,
    timeText: parsed.timeText ?? undefined,
    venueNameGuess: parsed.venueNameGuess ?? undefined,
    priceText: parsed.priceText ?? undefined,
    ticketingUrlOrHandle: parsed.ticketingUrlOrHandle ?? undefined,
    eventIsInFuture: parsed.eventIsInFuture ?? undefined,
    confidence: parsed.confidence ?? 'low',
    reasoning: parsed.reasoning ?? undefined
  };
}
