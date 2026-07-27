import {
  createPool,
  PostgresAuthRepository,
  PostgresEventRepository,
  PostgresFavoritesRepository,
  PostgresFriendsRepository,
  PostgresTrendsRepository
} from '@pulso/database';

import { buildApp } from './app.js';

const pool = createPool();

const apiBaseUrl = `http://${process.env.API_HOST ?? '127.0.0.1'}:${process.env.API_PORT ?? 3001}`;
const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackUri: `${apiBaseUrl}/auth/google/callback`,
        appCallbackUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/callback`
      }
    : undefined;

const app = buildApp(new PostgresEventRepository(pool), {
  logger: true,
  ...(google
    ? {
        authRepository: new PostgresAuthRepository(pool),
        favoritesRepository: new PostgresFavoritesRepository(pool),
        trendsRepository: new PostgresTrendsRepository(pool),
        friendsRepository: new PostgresFriendsRepository(pool),
        google
      }
    : {})
});

const host = process.env.API_HOST ?? '127.0.0.1';
const port = Number(process.env.API_PORT ?? 3001);

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  await pool.end();
  process.exitCode = 1;
}

const close = async () => {
  await app.close();
  await pool.end();
};

process.on('SIGINT', close);
process.on('SIGTERM', close);
