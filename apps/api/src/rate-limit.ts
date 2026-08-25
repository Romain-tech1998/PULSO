import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';

/**
 * Rate limiting, required before the first invitation by DEC-0026 §4.
 *
 * DEC-0012 accepted its absence "while the user base is small". DEC-0026
 * answered that plainly: that was a statement about a user base of zero, and
 * the beta is the moment it stops being true. Sixty-four write endpoints
 * answered with no limit of any kind on them.
 *
 * ## Why this is written out rather than delegated to @fastify/rate-limit
 *
 * That plugin only attaches its hook when it is registered with `await`
 * *before* the routes are declared. `buildApp` is synchronous and has 247
 * call sites, so awaiting inside it is not a small change. And the failure
 * mode of getting it wrong is the dangerous kind: an unawaited
 * `app.register(rateLimit, …)` throws nothing, logs nothing, sets no
 * headers and enforces nothing. Measured directly - three requests against
 * `max: 2` all returned 200, with no rate-limit headers at all.
 *
 * A limiter that silently does nothing is worse than no limiter, because
 * the gate it was added to satisfy then looks satisfied. So the counter
 * lives here, behind an `onRequest` hook added synchronously before any
 * route exists - an ordering this file controls rather than one it hopes
 * for.
 *
 * Single process, in memory, fixed window. Pulso runs one API instance; if
 * that changes this becomes per-instance and the store moves to Redis,
 * which is the point where the plugin earns its constraints.
 */

/**
 * The tiers are about what a request *costs Pulso*, not how the route is
 * spelled:
 *
 * - `authored` — text one account writes and other people then read. Forum
 *   posts, group posts, messages, reports. The surface abuse actually
 *   targets, and the one with no undo beyond moderation.
 * - `upload` — costs disk, and costs a human in the moderation queue
 *   (DEC-0021). Deliberately the tightest tier.
 * - `write` — ordinary state changes belonging to the caller alone:
 *   favourites, attendance, joining a group. Cheap, reversible, private.
 * - `read` — generous. The map re-queries on every pan, and a visitor
 *   exploring quickly is the behaviour the product is *for*.
 */
export const RATE_LIMIT_TIERS = {
  authored: { max: 12 },
  upload: { max: 6 },
  write: { max: 60 },
  read: { max: 300 }
} as const;

export type RateLimitTier = keyof typeof RATE_LIMIT_TIERS;

export const RATE_LIMIT_WINDOW_MS = 60_000;

/** Written by one account, read by others. */
const AUTHORED =
  /\/(forum|posts|messages|reports?|channels|rating|outings|checklist|access-request|verification-request|organizer-requests)\b/;

/** Costs disk and a moderator's attention. */
const UPLOAD = /\/(photo|photos|cover)\b/;

/**
 * Never limited: /health is what a monitor polls, and rate limiting the
 * thing that reports the service is alive is how a healthy service comes to
 * look dead.
 */
const EXEMPT = /^\/health$/;

export function tierForRoute(method: string, url: string): RateLimitTier {
  const verb = method.toUpperCase();
  if (verb === 'GET' || verb === 'HEAD' || verb === 'OPTIONS') return 'read';
  if (UPLOAD.test(url)) return 'upload';
  if (AUTHORED.test(url)) return 'authored';
  return 'write';
}

/**
 * One session, one budget — not one address, one budget.
 *
 * Keying on the address alone puts everyone behind a venue's wifi, or
 * behind one carrier NAT, into a single bucket: the first person to post
 * spends the allowance of every other person in the room. A bearer token
 * identifies the session actually doing the work, so that is the key
 * whenever there is one.
 *
 * The token is hashed rather than used directly: these keys sit in memory
 * for the length of the window, and a session token is a credential.
 */
export function rateLimitKey(request: {
  headers: Record<string, unknown>;
  ip?: string | undefined;
}): string {
  const header = request.headers['authorization'];
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const digest = createHash('sha256')
      .update(header.slice('Bearer '.length))
      .digest('hex')
      .slice(0, 16);
    return `session:${digest}`;
  }
  return `ip:${request.ip ?? 'unknown'}`;
}

interface CounterWindow {
  count: number;
  resetAt: number;
}

/**
 * A fixed window per (tier, caller).
 *
 * Expired entries are swept lazily rather than on a timer: an interval
 * keeps the process alive and would have to be cleared on every
 * `app.close()`, and the test suite builds hundreds of apps.
 */
export class RateLimitStore {
  private readonly windows = new Map<string, CounterWindow>();

  constructor(
    private readonly windowMs: number = RATE_LIMIT_WINDOW_MS,
    /** Above this many live keys, expired ones are swept before inserting. */
    private readonly sweepThreshold: number = 10_000
  ) {}

  hit(key: string, now: number): CounterWindow {
    const existing = this.windows.get(key);
    if (existing && existing.resetAt > now) {
      existing.count += 1;
      return existing;
    }
    if (this.windows.size >= this.sweepThreshold) this.sweep(now);
    const fresh: CounterWindow = { count: 1, resetAt: now + this.windowMs };
    this.windows.set(key, fresh);
    return fresh;
  }

  sweep(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }

  get size(): number {
    return this.windows.size;
  }
}

/**
 * Adds the limiter. Must be called before any route is declared — Fastify
 * binds a route's hook chain when the route is registered.
 */
export function registerRateLimiting(
  app: FastifyInstance,
  store: RateLimitStore = new RateLimitStore()
): void {
  app.addHook(
    'onRequest',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // The route pattern ("/groups/:id/posts"), so the tier follows the
      // shape of the endpoint rather than the identifiers in the path.
      const pattern = request.routeOptions?.url ?? request.url;
      if (EXEMPT.test(pattern)) return;

      const tier = tierForRoute(request.method, pattern);
      const { max } = RATE_LIMIT_TIERS[tier];
      const now = Date.now();
      const window = store.hit(`${tier}:${rateLimitKey(request)}`, now);
      const resetSeconds = Math.max(
        1,
        Math.ceil((window.resetAt - now) / 1000)
      );

      reply.header('x-ratelimit-limit', String(max));
      reply.header(
        'x-ratelimit-remaining',
        String(Math.max(0, max - window.count))
      );
      reply.header('x-ratelimit-reset', String(resetSeconds));

      if (window.count > max) {
        // A caller that cannot read why it was refused retries immediately
        // and makes it worse.
        reply.header('retry-after', String(resetSeconds));
        return reply.status(429).send({
          error: {
            code: 'RATE_LIMITED',
            message: `Too many requests. Try again in ${resetSeconds} seconds.`
          }
        });
      }
      return;
    }
  );
}
