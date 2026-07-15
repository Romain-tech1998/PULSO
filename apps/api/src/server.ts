import { createPool, PostgresEventRepository } from '@pulso/database';

import { buildApp } from './app.js';

const pool = createPool();
const app = buildApp(new PostgresEventRepository(pool), { logger: true });

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
