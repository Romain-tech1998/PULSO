import { describe, expect, it, vi } from 'vitest';

import { analyzeEventImage } from './openrouter-vision.js';

function chatResponse(content: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }]
    })
  } as Response;
}

describe('analyzeEventImage', () => {
  it('sends the reference date in the prompt for the model to reason about', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      chatResponse({
        isLikelyEvent: true,
        dateText: '15 août',
        eventIsInFuture: true,
        confidence: 'high'
      })
    );
    await analyzeEventImage('https://example.com/a.jpg', {
      apiKey: 'test-key',
      fetchImpl,
      referenceDate: '2026-08-05'
    });

    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    const promptText = body.messages[0].content[0].text as string;
    expect(promptText).toContain("Today's date is 2026-08-05");
  });

  it('forces isLikelyEvent to false when the model flags the date as in the past, even if it said true', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      chatResponse({
        isLikelyEvent: true,
        workingTitle: 'Old Show',
        dateText: '3 janvier',
        eventIsInFuture: false,
        confidence: 'high'
      })
    );
    const analysis = await analyzeEventImage('https://example.com/a.jpg', {
      apiKey: 'test-key',
      fetchImpl
    });

    expect(analysis.isLikelyEvent).toBe(false);
    expect(analysis.eventIsInFuture).toBe(false);
  });

  it('keeps isLikelyEvent true when the model says the event is in the future', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      chatResponse({
        isLikelyEvent: true,
        workingTitle: 'Upcoming Show',
        dateText: '28 août',
        eventIsInFuture: true,
        confidence: 'medium'
      })
    );
    const analysis = await analyzeEventImage('https://example.com/a.jpg', {
      apiKey: 'test-key',
      fetchImpl
    });

    expect(analysis.isLikelyEvent).toBe(true);
  });

  it('does not force false when eventIsInFuture is null/absent (no date on the image at all)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      chatResponse({
        isLikelyEvent: true,
        workingTitle: 'Ticketed Show',
        ticketingUrlOrHandle: 'https://tixr.com/example',
        confidence: 'medium'
      })
    );
    const analysis = await analyzeEventImage('https://example.com/a.jpg', {
      apiKey: 'test-key',
      fetchImpl
    });

    expect(analysis.isLikelyEvent).toBe(true);
  });
});
