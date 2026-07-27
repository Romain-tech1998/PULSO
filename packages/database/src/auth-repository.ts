import type { User } from '@pulso/contracts';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface GoogleProfile {
  googleSubject: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

export interface AuthRepository {
  upsertUserFromGoogle(profile: GoogleProfile): Promise<User>;
  createSession(userId: string): Promise<{ token: string; expiresAt: Date }>;
  findUserBySessionToken(token: string): Promise<User | undefined>;
  deleteSession(token: string): Promise<void>;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    ...(row.avatar_url !== null ? { avatarUrl: row.avatar_url } : {})
  };
}

export class PostgresAuthRepository implements AuthRepository {
  constructor(private readonly pool: Pool) {}

  // Google's `sub` claim is the stable identifier - email alone can't be
  // trusted as a natural key (a provider could change it), so this upserts
  // on google_subject and lets email/display_name/avatar drift with
  // whatever Google reports on each login instead of freezing them at
  // first signup.
  async upsertUserFromGoogle(profile: GoogleProfile): Promise<User> {
    const result = await this.pool.query<UserRow>(
      `INSERT INTO users (id, email, display_name, avatar_url, google_subject)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (google_subject) DO UPDATE SET
         email = EXCLUDED.email,
         display_name = EXCLUDED.display_name,
         avatar_url = EXCLUDED.avatar_url
       RETURNING id, email, display_name, avatar_url`,
      [
        randomUUID(),
        profile.email,
        profile.displayName,
        profile.avatarUrl ?? null,
        profile.googleSubject
      ]
    );
    return toUser(result.rows[0]!);
  }

  async createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await this.pool.query(
      `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
      [token, userId, expiresAt]
    );
    return { token, expiresAt };
  }

  async findUserBySessionToken(token: string): Promise<User | undefined> {
    const result = await this.pool.query<UserRow>(
      `SELECT u.id, u.email, u.display_name, u.avatar_url
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = $1 AND s.expires_at > now()`,
      [token]
    );
    const row = result.rows[0];
    return row ? toUser(row) : undefined;
  }

  async deleteSession(token: string): Promise<void> {
    await this.pool.query(`DELETE FROM sessions WHERE token = $1`, [token]);
  }
}
