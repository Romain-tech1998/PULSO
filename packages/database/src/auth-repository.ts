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

export interface ProfileUpdate {
  bio?: string | undefined;
  coverStyle?: string | undefined;
}

export interface AuthRepository {
  upsertUserFromGoogle(profile: GoogleProfile): Promise<User>;
  createSession(userId: string): Promise<{ token: string; expiresAt: Date }>;
  findUserBySessionToken(token: string): Promise<User | undefined>;
  deleteSession(token: string): Promise<void>;
  updateProfile(userId: string, update: ProfileUpdate): Promise<User>;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: Date;
  bio: string | null;
  cover_style: string | null;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at.toISOString(),
    ...(row.avatar_url !== null ? { avatarUrl: row.avatar_url } : {}),
    ...(row.bio !== null ? { bio: row.bio } : {}),
    ...(row.cover_style !== null ? { coverStyle: row.cover_style } : {})
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
    // friend_code is only ever set on the INSERT branch - the ON CONFLICT
    // UPDATE deliberately doesn't touch it, so a returning user keeps the
    // same code forever rather than it churning on every login.
    const result = await this.pool.query<UserRow>(
      `INSERT INTO users (id, email, display_name, avatar_url, google_subject, friend_code)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (google_subject) DO UPDATE SET
         email = EXCLUDED.email,
         display_name = EXCLUDED.display_name,
         avatar_url = EXCLUDED.avatar_url
       RETURNING id, email, display_name, avatar_url, created_at, bio, cover_style`,
      [
        randomUUID(),
        profile.email,
        profile.displayName,
        profile.avatarUrl ?? null,
        profile.googleSubject,
        randomBytes(4).toString('hex')
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
      `SELECT u.id, u.email, u.display_name, u.avatar_url, u.created_at, u.bio, u.cover_style
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

  // Only bio/coverStyle are user-editable (Phase 4.7) - display name and
  // avatar stay Google-sourced to avoid a Pulso identity drifting from the
  // account it's authenticated against. `undefined` in the update leaves the
  // existing column untouched (COALESCE), rather than a PUT-style full
  // replace - each field is independently optional here, not one atomic form.
  async updateProfile(userId: string, update: ProfileUpdate): Promise<User> {
    const result = await this.pool.query<UserRow>(
      `UPDATE users SET
         bio = COALESCE($2, bio),
         cover_style = COALESCE($3, cover_style)
       WHERE id = $1
       RETURNING id, email, display_name, avatar_url, created_at, bio, cover_style`,
      [userId, update.bio ?? null, update.coverStyle ?? null]
    );
    return toUser(result.rows[0]!);
  }
}
