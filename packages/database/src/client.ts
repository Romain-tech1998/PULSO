import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export function createPool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database access.');
  }

  return new Pool({ connectionString, max: 10 });
}

export function createDatabase(pool: Pool) {
  return drizzle({ client: pool });
}
