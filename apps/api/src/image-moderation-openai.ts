import type {
  CategoryScores,
  ImageModerationProvider
} from './image-moderation.js';

/**
 * OpenAI's `omni-moderation-latest`, the only provider built today
 * (DEC-0021 §6).
 *
 * A purpose-built moderation endpoint rather than a general vision model
 * behind a prompt: the categories and their scores are a defined response
 * shape instead of free text that would have to be coaxed out and re-parsed,
 * and there is no prompt for an uploaded image to argue with.
 *
 * Uses `fetch` rather than an SDK. The project already depends on
 * `@ai-sdk/openai` for search, but that wraps the chat/completions surface
 * pointed at OpenRouter — which does not proxy `/moderations`. One POST is
 * not worth a second client library.
 */
const ENDPOINT = 'https://api.openai.com/v1/moderations';
const MODEL = 'omni-moderation-latest';

interface ModerationResponse {
  results?: Array<{ category_scores?: Record<string, unknown> }>;
}

export function createOpenAiModerationProvider(
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): ImageModerationProvider {
  return {
    name: MODEL,
    async moderate(image: Buffer, mimeType: string): Promise<CategoryScores> {
      // Sent inline as a data URI: Pulso keeps uploads on its own disk and
      // has no public URL to hand out for a file that is not published yet -
      // which is precisely the file that most needs screening.
      const dataUri = `data:${mimeType};base64,${image.toString('base64')}`;

      const response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL,
          input: [{ type: 'image_url', image_url: { url: dataUri } }]
        })
      });

      if (!response.ok) {
        // Status only. The body can echo request content, and this message
        // reaches the logs.
        throw new Error(`moderation request failed with ${response.status}`);
      }

      const body = (await response.json()) as ModerationResponse;
      const raw = body.results?.[0]?.category_scores;
      if (!raw || typeof raw !== 'object') {
        // Rather than treat an unreadable answer as a clean bill of health,
        // fail loudly: moderateImage turns any throw into `flagged`.
        throw new Error('moderation response carried no category scores');
      }

      const scores: CategoryScores = {};
      for (const [category, value] of Object.entries(raw)) {
        if (typeof value === 'number' && !Number.isNaN(value)) {
          scores[category] = value;
        }
      }
      if (Object.keys(scores).length === 0) {
        throw new Error('moderation response carried no usable scores');
      }
      return scores;
    }
  };
}
