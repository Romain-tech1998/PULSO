import { describe, expect, it, vi } from 'vitest';

import {
  decideFromScores,
  moderateImage,
  type ImageModerationProvider
} from './image-moderation.js';
import { createOpenAiModerationProvider } from './image-moderation-openai.js';

const clean = { sexual: 0.001, violence: 0.002, hate: 0.0 };

describe('image moderation decisions (DEC-0021)', () => {
  it('approves an image that crosses no threshold', () => {
    const result = decideFromScores(clean, 'test');
    expect(result.decision).toBe('approved');
    expect(result.categories).toEqual([]);
    expect(result.reason).toBeUndefined();
  });

  it('rejects an image above a reject threshold', () => {
    const result = decideFromScores({ ...clean, sexual: 0.95 }, 'test');
    expect(result.decision).toBe('rejected');
    expect(result.categories).toContain('sexual');
    expect(result.reason).toContain('sexual');
  });

  it('flags an ambiguous image rather than deciding for the administrator', () => {
    const result = decideFromScores({ ...clean, violence: 0.7 }, 'test');
    expect(result.decision).toBe('flagged');
    expect(result.categories).toEqual(['violence']);
  });

  it('holds sexual/minors to a far lower bar than anything else', () => {
    // 0.2 is comfortably below every other category's flag threshold and
    // would be approved anywhere else. Here it is a refusal - the one
    // category where "probably fine" is not an acceptable answer.
    const elsewhere = decideFromScores({ violence: 0.2 }, 'test');
    expect(elsewhere.decision).toBe('approved');

    const minors = decideFromScores({ 'sexual/minors': 0.2 }, 'test');
    expect(minors.decision).toBe('rejected');
  });

  it('names the worst category first when several cross', () => {
    const result = decideFromScores(
      { sexual: 0.85, violence: 0.95, hate: 0.9 },
      'test'
    );
    expect(result.decision).toBe('rejected');
    expect(result.categories[0]).toBe('violence');
  });

  it('applies a default threshold to a category it has never heard of', () => {
    // A model gaining a category must not gain a free pass with it.
    const result = decideFromScores({ 'brand-new-category': 0.95 }, 'test');
    expect(result.decision).toBe('rejected');
  });

  it('ignores a non-numeric score rather than treating it as zero', () => {
    const result = decideFromScores(
      { sexual: Number.NaN, violence: 0.95 } as Record<string, number>,
      'test'
    );
    expect(result.decision).toBe('rejected');
    expect(result.categories).toEqual(['violence']);
  });
});

describe('moderateImage fail-closed behaviour (DEC-0021 §3)', () => {
  const image = Buffer.from([1, 2, 3]);

  it('flags when no provider is configured, never approves', async () => {
    const result = await moderateImage(image, 'image/jpeg', undefined);
    expect(result.decision).toBe('flagged');
    expect(result.provider).toBe('none');
  });

  it('flags when the provider throws, and logs without the image', async () => {
    const provider: ImageModerationProvider = {
      name: 'boom',
      moderate: async () => {
        throw new Error('upstream exploded');
      }
    };
    const log = vi.fn();
    const result = await moderateImage(image, 'image/jpeg', provider, log);

    expect(result.decision).toBe('flagged');
    expect(result.provider).toBe('boom');
    expect(log).toHaveBeenCalledTimes(1);
    const logged = String(log.mock.calls[0]![0]);
    expect(logged).toContain('upstream exploded');
    // The log must never carry the bytes it was asked to screen.
    expect(logged).not.toContain(image.toString('base64'));
  });

  it('passes provider scores through to a real decision', async () => {
    const provider: ImageModerationProvider = {
      name: 'scored',
      moderate: async () => ({ sexual: 0.99 })
    };
    const result = await moderateImage(image, 'image/jpeg', provider);
    expect(result.decision).toBe('rejected');
    expect(result.scores).toEqual({ sexual: 0.99 });
  });
});

describe('the OpenAI provider (mocked - never calls the API)', () => {
  const image = Buffer.from([255, 216, 255]);

  it('sends the image inline and reads the category scores back', async () => {
    let seen: { url: string; body: unknown } | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, body: JSON.parse(String(init.body)) };
      return {
        ok: true,
        json: async () => ({
          results: [{ category_scores: { sexual: 0.02, violence: 0.01 } }]
        })
      };
    }) as unknown as typeof fetch;

    const provider = createOpenAiModerationProvider('sk-test', fetchImpl);
    const scores = await provider.moderate(image, 'image/jpeg');

    expect(scores).toEqual({ sexual: 0.02, violence: 0.01 });
    expect(seen?.url).toContain('/v1/moderations');
    const body = seen?.body as { model: string; input: unknown[] };
    expect(body.model).toBe('omni-moderation-latest');
    // Inline data URI: an unpublished file has no public URL to hand out,
    // and it is exactly the file that most needs screening.
    expect(JSON.stringify(body.input)).toContain('data:image/jpeg;base64,');
  });

  it('throws on a non-OK response, so the caller flags rather than approves', async () => {
    const fetchImpl = (async () => ({
      ok: false,
      status: 429,
      json: async () => ({})
    })) as unknown as typeof fetch;
    const provider = createOpenAiModerationProvider('sk-test', fetchImpl);
    await expect(provider.moderate(image, 'image/jpeg')).rejects.toThrow(/429/);
  });

  it('throws on an unreadable answer rather than reading it as clean', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => ({ results: [{}] })
    })) as unknown as typeof fetch;
    const provider = createOpenAiModerationProvider('sk-test', fetchImpl);
    await expect(provider.moderate(image, 'image/jpeg')).rejects.toThrow();
  });
});
