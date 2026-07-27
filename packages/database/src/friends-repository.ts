import type { PublicUser } from '@pulso/contracts';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export class FriendCodeNotFoundError extends Error {
  constructor() {
    super('No account matches this friend code.');
  }
}

export class CannotFriendSelfError extends Error {
  constructor() {
    super('You cannot add yourself as a friend.');
  }
}

export class FriendshipAlreadyExistsError extends Error {
  constructor() {
    super('A friendship or pending request already exists between these accounts.');
  }
}

export class FriendRequestNotFoundError extends Error {
  constructor() {
    super('No pending friend request matches this id for this account.');
  }
}

export interface FriendRequest {
  id: string;
  user: PublicUser;
  direction: 'incoming' | 'outgoing';
  createdAt: string;
}

export interface FriendsRepository {
  getFriendCode(userId: string): Promise<string>;
  sendRequest(requesterId: string, friendCode: string): Promise<void>;
  getPendingRequests(userId: string): Promise<FriendRequest[]>;
  respondToRequest(
    userId: string,
    requestId: string,
    action: 'accept' | 'decline'
  ): Promise<void>;
  getFriends(userId: string): Promise<PublicUser[]>;
  removeFriend(userId: string, friendUserId: string): Promise<void>;
}

interface PublicUserRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

function toPublicUser(row: PublicUserRow): PublicUser {
  return {
    id: row.id,
    displayName: row.display_name,
    ...(row.avatar_url !== null ? { avatarUrl: row.avatar_url } : {})
  };
}

export class PostgresFriendsRepository implements FriendsRepository {
  constructor(private readonly pool: Pool) {}

  async getFriendCode(userId: string): Promise<string> {
    const result = await this.pool.query<{ friend_code: string }>(
      `SELECT friend_code FROM users WHERE id = $1`,
      [userId]
    );
    return result.rows[0]!.friend_code;
  }

  // Not fully race-safe between the existence check and the insert (two
  // simultaneous requests in opposite directions could both succeed) - an
  // acceptable gap for a personal social feature, not a security boundary.
  async sendRequest(requesterId: string, friendCode: string): Promise<void> {
    const addressee = await this.pool.query<{ id: string }>(
      `SELECT id FROM users WHERE friend_code = $1`,
      [friendCode]
    );
    const addresseeId = addressee.rows[0]?.id;
    if (!addresseeId) throw new FriendCodeNotFoundError();
    if (addresseeId === requesterId) throw new CannotFriendSelfError();

    const existing = await this.pool.query(
      `SELECT 1 FROM friendships
       WHERE (requester_id = $1 AND addressee_id = $2)
          OR (requester_id = $2 AND addressee_id = $1)`,
      [requesterId, addresseeId]
    );
    if (existing.rows.length > 0) throw new FriendshipAlreadyExistsError();

    await this.pool.query(
      `INSERT INTO friendships (id, requester_id, addressee_id, status)
       VALUES ($1, $2, $3, 'pending')`,
      [randomUUID(), requesterId, addresseeId]
    );
  }

  async getPendingRequests(userId: string): Promise<FriendRequest[]> {
    interface Row {
      request_id: string;
      created_at: string;
      direction: 'incoming' | 'outgoing';
      other_id: string;
      display_name: string;
      avatar_url: string | null;
    }
    const result = await this.pool.query<Row>(
      `SELECT f.id AS request_id, f.created_at,
         CASE WHEN f.requester_id = $1 THEN 'outgoing' ELSE 'incoming' END AS direction,
         u.id AS other_id, u.display_name, u.avatar_url
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
       WHERE f.status = 'pending' AND (f.requester_id = $1 OR f.addressee_id = $1)
       ORDER BY f.created_at DESC`,
      [userId]
    );
    return result.rows.map((row) => ({
      id: row.request_id,
      user: toPublicUser({
        id: row.other_id,
        display_name: row.display_name,
        avatar_url: row.avatar_url
      }),
      direction: row.direction,
      createdAt: new Date(row.created_at).toISOString()
    }));
  }

  async respondToRequest(
    userId: string,
    requestId: string,
    action: 'accept' | 'decline'
  ): Promise<void> {
    const existing = await this.pool.query(
      `SELECT 1 FROM friendships WHERE id = $1 AND addressee_id = $2 AND status = 'pending'`,
      [requestId, userId]
    );
    if (existing.rows.length === 0) throw new FriendRequestNotFoundError();

    if (action === 'accept') {
      await this.pool.query(`UPDATE friendships SET status = 'accepted' WHERE id = $1`, [
        requestId
      ]);
    } else {
      await this.pool.query(`DELETE FROM friendships WHERE id = $1`, [requestId]);
    }
  }

  async getFriends(userId: string): Promise<PublicUser[]> {
    const result = await this.pool.query<PublicUserRow>(
      `SELECT u.id, u.display_name, u.avatar_url
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
       WHERE f.status = 'accepted' AND (f.requester_id = $1 OR f.addressee_id = $1)
       ORDER BY u.display_name ASC`,
      [userId]
    );
    return result.rows.map(toPublicUser);
  }

  async removeFriend(userId: string, friendUserId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM friendships
       WHERE status = 'accepted'
         AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
      [userId, friendUserId]
    );
  }
}
