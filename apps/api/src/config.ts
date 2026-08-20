/**
 * Deployment configuration, validated at boot.
 *
 * Every value here has a local-development default, which is exactly what
 * made them dangerous: a missing variable in production did not fail, it
 * silently produced `http://127.0.0.1:3001`. That URL is handed to Google as
 * the OAuth redirect (which Google rejects over plain http off localhost)
 * and is baked into every uploaded photo's public URL. So in production the
 * process refuses to start rather than come up subtly wrong.
 *
 * `PULSO_ENV=production` is the switch. It is deliberately not NODE_ENV:
 * NODE_ENV is set to "production" by countless build tools, and this must
 * only be true when Pulso is genuinely serving a public domain.
 */
export interface ApiConfig {
  isProduction: boolean;
  /** Public origin of the API itself, e.g. https://api.pulso.example. */
  publicUrl: string;
  /** Public origin of the web app, used for OAuth return and CORS. */
  webUrl: string;
  uploadDir: string;
  publicUploadUrl: string;
  host: string;
  port: number;
  /**
   * DEC-0022 §3. Signs the payload inside every ticket QR. It never leaves
   * this process, and rotating it invalidates every outstanding QR - which is
   * the intended emergency lever, not an everyday operation.
   */
  ticketSigningSecret: string;
  /**
   * DEC-0022 §1. Pulso's cut of a ticket, in basis points of the total.
   *
   * Defaults to zero, and that is the honest default: §8 makes "a decided
   * commission rate" a prerequisite for live mode, and inventing one here
   * would put a number nobody chose into every test-mode charge.
   */
  applicationFeeBps: number;
  /** How long an open checkout holds its seats (DEC-0022 §2). */
  checkoutHoldMinutes: number;
}

/**
 * The value `STRIPE_LIVE_AUTHORIZED` must carry for a live key to be accepted.
 * It names the decision on purpose: whoever sets it has to have read the
 * document that records whether the accountant and the lawyer have answered.
 */
export const LIVE_AUTHORIZATION = 'DEC-0026';

export class ConfigError extends Error {
  constructor(problems: string[]) {
    super(
      `Pulso cannot start with this configuration:\n- ${problems.join('\n- ')}`
    );
  }
}

function isLocal(url: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url);
}

export function resolveApiConfig(
  env: NodeJS.ProcessEnv = process.env
): ApiConfig {
  const isProduction = env.PULSO_ENV === 'production';
  const host = env.API_HOST ?? '127.0.0.1';
  const port = Number(env.API_PORT ?? 3001);

  // API_PUBLIC_URL exists because the old construction hard-coded `http://`
  // and a port. Behind a real domain the API is reached over HTTPS on 443,
  // and neither the scheme nor the port can be derived from what the process
  // binds to locally.
  const publicUrl = (env.API_PUBLIC_URL ?? `http://${host}:${port}`).replace(
    /\/+$/,
    ''
  );
  const webUrl = (env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(
    /\/+$/,
    ''
  );

  const problems: string[] = [];
  if (isProduction) {
    if (!env.API_PUBLIC_URL) {
      problems.push(
        'API_PUBLIC_URL is required in production (the public https:// origin of this API).'
      );
    } else if (!publicUrl.startsWith('https://')) {
      problems.push(
        `API_PUBLIC_URL must be https:// in production (got "${publicUrl}"). Google rejects a plain-http OAuth redirect outside localhost.`
      );
    }
    if (isLocal(webUrl)) {
      problems.push(
        `NEXT_PUBLIC_APP_URL still points at localhost ("${webUrl}"). Sign-in returns the visitor to this URL.`
      );
    }
    if (!env.EVENT_PHOTOS_UPLOAD_DIR) {
      problems.push(
        'EVENT_PHOTOS_UPLOAD_DIR is required in production and must be a persistent volume. On an ephemeral filesystem every uploaded photo is lost on the next deploy.'
      );
    }
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      problems.push(
        'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production: without them the whole account layer is silently unavailable and nobody can sign in.'
      );
    }
    if (!env.DATABASE_URL) {
      problems.push('DATABASE_URL is required.');
    }
    if (!env.TICKET_SIGNING_SECRET) {
      problems.push(
        'TICKET_SIGNING_SECRET is required in production: without it every ticket QR would be signed with a key that is published in this repository.'
      );
    }
  }

  const applicationFeeBps = Math.max(
    0,
    Math.min(10_000, Number(env.PULSO_APPLICATION_FEE_BPS ?? 0) || 0)
  );

  // DEC-0022 criterion 14, narrowed by its v1.2 addendum and DEC-0026 §3.
  //
  // Until DEC-0026 there was no path to live mode at all, so any `_live_` key
  // was refused in every environment. There is a path now, and what replaces
  // that rule has to keep the property that made it worth having: a live key
  // on a developer's machine moves real money exactly as well as one on a
  // server. So the refusal is narrowed, not deleted.
  //
  // Three conditions, two of which are absent by construction on a
  // workstation. The environment must be production; the commission must be
  // the decided non-zero rate §8 requires rather than the honest zero default,
  // so that no live charge can carry a number nobody chose; and the
  // authorization must be stated in a variable that names the decision - which
  // makes turning live mode on an act somebody performs, never something a
  // copied .env does quietly.
  const stripeKeys = [
    env.STRIPE_SECRET_KEY,
    env.STRIPE_PUBLISHABLE_KEY,
    env.STRIPE_WEBHOOK_SECRET
  ];
  if (stripeKeys.some((key) => key?.includes('_live_'))) {
    const missing: string[] = [];
    if (!isProduction) missing.push('PULSO_ENV=production');
    if (applicationFeeBps <= 0) {
      missing.push(
        'a decided non-zero PULSO_APPLICATION_FEE_BPS (DEC-0022 §8, condition 3)'
      );
    }
    if (env.STRIPE_LIVE_AUTHORIZED !== LIVE_AUTHORIZATION) {
      missing.push(`STRIPE_LIVE_AUTHORIZED=${LIVE_AUTHORIZATION}`);
    }
    if (missing.length > 0) {
      problems.push(
        `A live-mode Stripe key is configured, but live mode is authorized only under the conditions of DEC-0026 §3. Missing: ${missing.join(', ')}.`
      );
    }
  }
  if (problems.length > 0) throw new ConfigError(problems);

  return {
    isProduction,
    publicUrl,
    webUrl,
    uploadDir: env.EVENT_PHOTOS_UPLOAD_DIR ?? `${process.cwd()}/uploads`,
    publicUploadUrl: `${publicUrl}/uploads`,
    host,
    port,
    // Development default, deliberately obvious. Production refuses to start
    // without a real one above.
    ticketSigningSecret:
      env.TICKET_SIGNING_SECRET ?? 'pulso-development-ticket-secret',
    applicationFeeBps,
    checkoutHoldMinutes: Math.max(
      1,
      Number(env.PULSO_CHECKOUT_HOLD_MINUTES ?? 20) || 20
    )
  };
}

/**
 * Origins allowed to call the API. `*` is fine while everything runs on
 * localhost, but once the API answers on a public domain it should only
 * answer to Pulso's own front end.
 */
export function resolveAllowedOrigin(
  config: ApiConfig,
  requestOrigin: string | undefined
): string {
  if (!config.isProduction) return '*';
  const allowed = [config.webUrl];
  return requestOrigin && allowed.includes(requestOrigin)
    ? requestOrigin
    : config.webUrl;
}
