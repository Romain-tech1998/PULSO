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

export interface EventImageAnalysis {
  isLikelyEvent: boolean;
  workingTitle?: string | undefined;
  dateText?: string | undefined;
  timeText?: string | undefined;
  venueNameGuess?: string | undefined;
  priceText?: string | undefined;
  ticketingUrlOrHandle?: string | undefined;
  confidence: 'low' | 'medium' | 'high';
  reasoning?: string | undefined;
}

const ANALYSIS_PROMPT = `You are looking at a single Instagram Story image that may or may not advertise a real-world event (concert, show, party, exhibition, etc.) in Montreal, Canada.

Reply with ONLY a JSON object (no markdown fences) with this exact shape:
{
  "isLikelyEvent": boolean,
  "workingTitle": string or null,
  "dateText": string or null (the date exactly as written on the image, do not infer a year if absent),
  "timeText": string or null (the time exactly as written),
  "venueNameGuess": string or null,
  "priceText": string or null,
  "ticketingUrlOrHandle": string or null (a URL or @handle mentioned for tickets),
  "confidence": "low" | "medium" | "high",
  "reasoning": string (one sentence explaining your confidence)
}

If the image is not an event advertisement (e.g. a personal photo, a repost, an ad for a product), set isLikelyEvent to false and leave the other fields null. Never invent a date, time, or venue that is not visibly present in the image.`;

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
  } = {}
): Promise<EventImageAnalysis> {
  const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
  const model = options.model ?? 'openai/gpt-4o-mini';
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is required to analyze event images.');
  }

  const response = await fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
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
            { type: 'text', text: ANALYSIS_PROMPT },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ]
    })
  });

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

  return {
    isLikelyEvent: parsed.isLikelyEvent ?? false,
    workingTitle: parsed.workingTitle ?? undefined,
    dateText: parsed.dateText ?? undefined,
    timeText: parsed.timeText ?? undefined,
    venueNameGuess: parsed.venueNameGuess ?? undefined,
    priceText: parsed.priceText ?? undefined,
    ticketingUrlOrHandle: parsed.ticketingUrlOrHandle ?? undefined,
    confidence: parsed.confidence ?? 'low',
    reasoning: parsed.reasoning ?? undefined
  };
}
