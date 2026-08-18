import { describe, expect, it } from 'vitest';

import {
  ConfigError,
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

  // DEC-0022 acceptance criterion 14. Refused outside production too: a live
  // key on a laptop moves real money exactly as well as one on a server, and
  // §8's accountant and lawyer reviews have not happened.
  it('refuses to start with a live-mode Stripe key, in any environment', () => {
    expect(() =>
      resolveApiConfig({ ...productionEnv, STRIPE_SECRET_KEY: 'sk_live_abc' })
    ).toThrow(ConfigError);
    expect(() =>
      resolveApiConfig({ STRIPE_SECRET_KEY: 'sk_live_abc' })
    ).toThrow(ConfigError);
    expect(() =>
      resolveApiConfig({ STRIPE_WEBHOOK_SECRET: 'whsec_live_abc' })
    ).toThrow(ConfigError);
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
