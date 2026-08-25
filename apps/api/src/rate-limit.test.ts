import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import {
  RATE_LIMIT_TIERS,
  RATE_LIMIT_WINDOW_MS,
  RateLimitStore,
  rateLimitKey,
  tierForRoute
} from './rate-limit.js';
import { accountRepositories, fakeEventRepository } from './test-support.js';

const event = fakeEventRepository();

function request(headers: Record<string, string>) {
  return { authorization: '', ...headers } as Record<string, string>;
}

describe('rate limit tiers (DEC-0026 §4)', () => {
  it('reads are the generous tier — panning the map is the product', () => {
    expect(tierForRoute('GET', '/events')).toBe('read');
    expect(tierForRoute('GET', '/venues')).toBe('read');
    // A preflight is not a write, whatever it precedes.
    expect(tierForRoute('OPTIONS', '/me/favorites')).toBe('read');
  });

  it('text one account writes and others read is the strict tier', () => {
    for (const url of [
      '/events/:eventId/forum/:category',
      '/groups/:id/posts',
      '/me/friends/:friendUserId/messages',
      '/images/:id/report',
      '/groups/:id/channels',
      '/groups/:id/outings'
    ]) {
      expect(tierForRoute('POST', url), url).toBe('authored');
    }
  });

  it('uploads are the tightest tier — they cost disk and a moderator', () => {
    expect(tierForRoute('POST', '/events/:eventId/photos')).toBe('upload');
    expect(tierForRoute('POST', '/me/events/:id/cover')).toBe('upload');
    expect(tierForRoute('POST', '/groups/:id/photo')).toBe('upload');
  });

  it('private, reversible state changes are the ordinary write tier', () => {
    expect(tierForRoute('PUT', '/me/favorites')).toBe('write');
    expect(tierForRoute('POST', '/me/attendance/:eventId')).toBe('write');
    expect(tierForRoute('POST', '/groups/:id/members')).toBe('write');
  });

  it('orders the tiers so uploads are never the loosest', () => {
    expect(RATE_LIMIT_TIERS.upload.max).toBeLessThan(
      RATE_LIMIT_TIERS.authored.max
    );
    expect(RATE_LIMIT_TIERS.authored.max).toBeLessThan(
      RATE_LIMIT_TIERS.write.max
    );
    expect(RATE_LIMIT_TIERS.write.max).toBeLessThan(RATE_LIMIT_TIERS.read.max);
  });
});

describe('rate limit key', () => {
  it('keys on the session, so one venue’s wifi is not one budget', () => {
    const a = rateLimitKey({
      headers: request({ authorization: 'Bearer token-a' }),
      ip: '10.0.0.1'
    } as never);
    const b = rateLimitKey({
      headers: request({ authorization: 'Bearer token-b' }),
      ip: '10.0.0.1'
    } as never);
    expect(a).not.toBe(b);
  });

  it('never puts the session token itself in the key', () => {
    const key = rateLimitKey({
      headers: request({ authorization: 'Bearer super-secret-token' }),
      ip: '10.0.0.1'
    } as never);
    expect(key).not.toContain('super-secret-token');
    expect(key.startsWith('session:')).toBe(true);
  });

  it('falls back to the address when there is no session', () => {
    expect(rateLimitKey({ headers: {}, ip: '203.0.113.4' } as never)).toBe(
      'ip:203.0.113.4'
    );
  });
});

describe('rate limiting, end to end', () => {
  it('answers 429 with a readable body once a budget is spent', async () => {
    const app = buildApp(event, accountRepositories());
    const headers = { authorization: 'Bearer valid-token' };
    const budget = RATE_LIMIT_TIERS.write.max;

    for (let i = 0; i < budget; i++) {
      const response = await app.inject({
        method: 'PUT',
        url: '/me/favorites',
        headers,
        payload: { eventIds: [] }
      });
      expect(response.statusCode, `request ${i + 1}`).not.toBe(429);
    }

    const limited = await app.inject({
      method: 'PUT',
      url: '/me/favorites',
      headers,
      payload: { eventIds: [] }
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe('RATE_LIMITED');
    // Without this a client has nothing to back off against.
    expect(limited.headers['retry-after']).toBeDefined();
    await app.close();
  });

  it('spends one session’s budget without touching another’s', async () => {
    const app = buildApp(event, accountRepositories());
    const budget = RATE_LIMIT_TIERS.write.max;

    for (let i = 0; i <= budget; i++) {
      await app.inject({
        method: 'PUT',
        url: '/me/favorites',
        headers: { authorization: 'Bearer session-one' },
        payload: { eventIds: [] }
      });
    }
    const other = await app.inject({
      method: 'PUT',
      url: '/me/favorites',
      headers: { authorization: 'Bearer session-two' },
      payload: { eventIds: [] }
    });
    expect(other.statusCode).not.toBe(429);
    await app.close();
  });

  it('never rate-limits /health, which is what a monitor polls', async () => {
    const app = buildApp(event);
    for (let i = 0; i < RATE_LIMIT_TIERS.read.max + 5; i++) {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode, `poll ${i + 1}`).toBe(200);
    }
    await app.close();
  });
});

// The counter is written out rather than delegated to a plugin (see
// rate-limit.ts), so its own arithmetic is worth pinning.
describe('rate limit store', () => {
  it('counts within a window and starts over after it', () => {
    const store = new RateLimitStore(1000);
    expect(store.hit('k', 0).count).toBe(1);
    expect(store.hit('k', 500).count).toBe(2);
    expect(store.hit('k', 999).count).toBe(3);
    // The window has passed: a new one, not a continuation of the old.
    expect(store.hit('k', 1001).count).toBe(1);
  });

  it('keeps separate callers separate', () => {
    const store = new RateLimitStore(1000);
    store.hit('a', 0);
    store.hit('a', 0);
    expect(store.hit('b', 0).count).toBe(1);
  });

  it('reports a reset time inside the window', () => {
    const store = new RateLimitStore(RATE_LIMIT_WINDOW_MS);
    const window = store.hit('k', 10_000);
    expect(window.resetAt).toBe(10_000 + RATE_LIMIT_WINDOW_MS);
  });

  it('does not grow without bound as callers come and go', () => {
    // Every key expires before the next arrives; without a sweep the map
    // would hold one entry per caller for the life of the process.
    const store = new RateLimitStore(1000, 50);
    for (let i = 0; i < 500; i++) store.hit(`caller-${i}`, i * 2000);
    expect(store.size).toBeLessThanOrEqual(50);
  });

  it('never sweeps a window that is still live', () => {
    const store = new RateLimitStore(10_000, 2);
    store.hit('live-a', 0);
    store.hit('live-b', 0);
    store.hit('live-c', 0);
    // All three are inside their window, so the sweep must have spared them.
    expect(store.hit('live-a', 1).count).toBe(2);
  });
});
