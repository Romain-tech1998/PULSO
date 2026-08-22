import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import { accountRepositories, fakeEventRepository } from './test-support.js';

/**
 * Signing in needs Google. Being signed in does not.
 *
 * The whole account layer used to be registered behind `options.google`, so an
 * instance without credentials resolved no bearer and answered every request
 * as an anonymous reader - including one carrying a valid session. Nobody saw
 * it in production, where without Google there are no sessions to carry, and
 * it made every authenticated behaviour untestable end to end: the e2e suite
 * ran green for three days over surfaces it never signed into.
 */
describe('the account layer without Google credentials', () => {
  const withoutGoogle = () => {
    const options = accountRepositories();
    delete (options as { google?: unknown }).google;
    return buildApp(fakeEventRepository(), options);
  };

  it('still reads a session an account already holds', async () => {
    const app = withoutGoogle();
    const response = await app.inject({
      method: 'GET',
      url: '/me/events',
      headers: { authorization: 'Bearer valid-token' }
    });
    // 404 here would mean the route was never registered at all, which is
    // exactly what used to happen.
    expect(response.statusCode).toBe(200);
  });

  it('still refuses a caller with no session', async () => {
    const app = withoutGoogle();
    const response = await app.inject({ method: 'GET', url: '/me/events' });
    expect(response.statusCode).toBe(401);
  });

  it('offers no way to sign in', async () => {
    const app = withoutGoogle();
    const response = await app.inject({ method: 'GET', url: '/auth/google' });
    expect(response.statusCode).toBe(404);
  });

  it('offers one when the credentials are there', async () => {
    const app = buildApp(fakeEventRepository(), accountRepositories());
    const response = await app.inject({ method: 'GET', url: '/auth/google' });
    expect(response.statusCode).not.toBe(404);
  });
});
