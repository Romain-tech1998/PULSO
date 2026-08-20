import { describe, expect, it } from 'vitest';

import {
  ConfigError,
  LIVE_AUTHORIZATION,
  resolveAllowedOrigin,
  resolveApiConfig
} from './config.js';

const productionEnv = {
  PULSO_ENV: 'production',
  API_PUBLIC_URL: 'https://api.pulso.example',
  NEXT_PUBLIC_APP_URL: 'https://pulso.example',
  EVENT_PHOTOS_UPLOAD_DIR: '/data/uploads',
  GOOGLE_CLIENT_ID: 'id',
  GOOGLE_CLIENT_SECRET: 'secret',
  DATABASE_URL: 'postgresql://x',
  TICKET_SIGNING_SECRET: 'a-real-secret'
} satisfies NodeJS.ProcessEnv;

describe('deployment configuration', () => {
  it('keeps working with local defaults outside production', () => {
    const config = resolveApiConfig({});
    expect(config.isProduction).toBe(false);
    expect(config.publicUrl).toBe('http://127.0.0.1:3001');
  });

  it('accepts a complete production configuration', () => {
    const config = resolveApiConfig(productionEnv);
    expect(config.publicUrl).toBe('https://api.pulso.example');
    expect(config.publicUploadUrl).toBe('https://api.pulso.example/uploads');
  });

  it('refuses to start in production without a ticket signing secret', () => {
    const { TICKET_SIGNING_SECRET: _omitted, ...env } = productionEnv;
    expect(() => resolveApiConfig(env)).toThrow(ConfigError);
  });

  // DEC-0022 criterion 14 as narrowed by v1.2 and DEC-0026 §3. The old rule
  // refused every live key everywhere; these say the refusal survives
  // everywhere the authorization is not complete, which is what it was for.
  it('refuses a live-mode Stripe key outside production', () => {
    expect(() =>
      resolveApiConfig({
        STRIPE_SECRET_KEY: 'sk_live_abc',
        PULSO_APPLICATION_FEE_BPS: '250',
        STRIPE_LIVE_AUTHORIZED: LIVE_AUTHORIZATION
      })
    ).toThrow(ConfigError);
  });

  it('refuses a live-mode Stripe key with no decided commission rate', () => {
    expect(() =>
      resolveApiConfig({
        ...productionEnv,
        STRIPE_SECRET_KEY: 'sk_live_abc',
        STRIPE_LIVE_AUTHORIZED: LIVE_AUTHORIZATION
      })
    ).toThrow(ConfigError);
  });

  it('refuses a live-mode Stripe key nobody authorized', () => {
    expect(() =>
      resolveApiConfig({
        ...productionEnv,
        STRIPE_WEBHOOK_SECRET: 'whsec_live_abc',
        PULSO_APPLICATION_FEE_BPS: '250'
      })
    ).toThrow(ConfigError);
    // A near miss is a miss: the variable names the decision, so a value that
    // does not is somebody guessing rather than somebody deciding.
    expect(() =>
      resolveApiConfig({
        ...productionEnv,
        STRIPE_WEBHOOK_SECRET: 'whsec_live_abc',
        PULSO_APPLICATION_FEE_BPS: '250',
        STRIPE_LIVE_AUTHORIZED: 'true'
      })
    ).toThrow(ConfigError);
  });

  it('accepts a live-mode Stripe key under the full DEC-0026 authorization', () => {
    const config = resolveApiConfig({
      ...productionEnv,
      STRIPE_SECRET_KEY: 'sk_live_abc',
      PULSO_APPLICATION_FEE_BPS: '250',
      STRIPE_LIVE_AUTHORIZED: LIVE_AUTHORIZATION
    });
    expect(config.applicationFeeBps).toBe(250);
  });

  it('accepts a test-mode Stripe key', () => {
    expect(() =>
      resolveApiConfig({ STRIPE_SECRET_KEY: 'sk_test_abc' })
    ).not.toThrow();
  });

  // The whole point: a missing variable used to degrade silently to
  // localhost rather than stop the deploy.
  it('refuses to start in production without a public API url', () => {
    const { API_PUBLIC_URL: _omitted, ...env } = productionEnv;
    expect(() => resolveApiConfig(env)).toThrow(ConfigError);
  });

  it('refuses a plain-http public url in production', () => {
    expect(() =>
      resolveApiConfig({ ...productionEnv, API_PUBLIC_URL: 'http://api.x' })
    ).toThrow(/https/);
  });

  it('refuses a web url still pointing at localhost', () => {
    expect(() =>
      resolveApiConfig({
        ...productionEnv,
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000'
      })
    ).toThrow(/localhost/);
  });

  // An ephemeral filesystem loses every uploaded photo on redeploy, so the
  // path has to be a deliberate choice rather than a cwd-relative default.
  it('requires an explicit upload directory in production', () => {
    const { EVENT_PHOTOS_UPLOAD_DIR: _omitted, ...env } = productionEnv;
    expect(() => resolveApiConfig(env)).toThrow(/EVENT_PHOTOS_UPLOAD_DIR/);
  });

  it('requires Google credentials in production', () => {
    const { GOOGLE_CLIENT_SECRET: _omitted, ...env } = productionEnv;
    expect(() => resolveApiConfig(env)).toThrow(/GOOGLE_CLIENT/);
  });

  it('reports every problem at once rather than one per restart', () => {
    expect(() => resolveApiConfig({ PULSO_ENV: 'production' })).toThrow(
      /API_PUBLIC_URL[\s\S]*EVENT_PHOTOS_UPLOAD_DIR/
    );
  });
});

describe('CORS origin', () => {
  it('stays permissive in local development', () => {
    expect(resolveAllowedOrigin(resolveApiConfig({}), 'http://anything')).toBe(
      '*'
    );
  });

  it('answers only its own front end in production', () => {
    const config = resolveApiConfig(productionEnv);
    expect(resolveAllowedOrigin(config, 'https://pulso.example')).toBe(
      'https://pulso.example'
    );
    expect(resolveAllowedOrigin(config, 'https://evil.example')).toBe(
      'https://pulso.example'
    );
  });
});
