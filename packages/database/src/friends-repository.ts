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
    super(
      'A friendship or pending request already exists between these accounts.'
    );
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

// Phase 4.15's friend-detail panel: real, already-existing profile fields
// (bio/createdAt) that simply weren't shared with anyone before - never a
// new field invented for this. Only ever returned for an accepted friend.
export interface FriendProfile extends PublicUser {
  bio: string | undefined;
  createdAt: string;
}

export interface FriendSuggestion {
  user: PublicUser;
  // Always >= 1 by construction (see getSuggestions) - a real, explainable
  // graph metric ("friends of your friends"), never an inferred/ML score.
  mutualFriendCount: number;
}

export interface FriendsRepository {
  getFriendCode(userId: string): Promise<string>;
  // Returns the addressee's user id so the caller can notify them
  // (DEC-0016 trigger 2).
  sendRequest(requesterId: string, friendCode: string): Promise<string>;
  getPendingRequests(userId: string): Promise<FriendRequest[]>;
  // Returns the requester's user id when the request was accepted, so the
  // caller can notify them (DEC-0016 trigger 3); undefined on decline -
  // DEC-0016 authorizes no notification for a declined request.
  respondToRequest(
    userId: string,
    requestId: string,
    action: 'accept' | 'decline'
  ): Promise<string | undefined>;
  getFriends(userId: string): Promise<PublicUser[]>;
  removeFriend(userId: string, friendUserId: string): Promise<void>;
  // Guards the new friend-scoped routes below (profile, activity, mutual
  // events) - none of them should answer anything about an arbitrary user
  // id, only an actual accepted friend.
  isFriend(userId: string, otherId: string): Promise<boolean>;
  // Real mutual-friend count per candidate, batched (friend rows, requests,
  // suggestions all show this) - never a fabricated "3 amis en commun".
  getMutualFriendCounts(
    userId: string,
    candidateIds: string[]
  ): Promise<Map<string, number>>;
  // "Suggestions pour toi" (Phase 4.15) - friends-of-friends only, ranked by
  // real mutual-friend count, excluding the viewer, existing friends, and
  // anyone with a pending request either direction. Never collaborative
  // filtering or any inferred signal.
  getSuggestions(userId: string, limit: number): Promise<FriendSuggestion[]>;
  getFriendProfile(
    viewerId: string,
    friendUserId: string
  ): Promise<FriendProfile | undefined>;
  // "Suggestions pour toi"'s one-click add (Phase 4.15) - a suggestion only
  // ever exposes a real user id (never a friend_code, per DEC-0011), so
  // sending a request to one needs this by-id variant alongside the
  // existing by-code sendRequest above.
  sendRequestToUser(requesterId: string, addresseeId: string): Promise<string>;
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
  async sendRequest(requesterId: string, friendCode: string): Promise<string> {
    const addressee = await this.pool.query<{ id: string }>(
      `SELECT id FROM users WHERE friend_code = $1`,
      [friendCode]
    );
    const addresseeId = addressee.rows[0]?.id;
    if (!addresseeId) throw new FriendCodeNotFoundError();
    await this.insertPendingRequest(requesterId, addresseeId);
    return addresseeId;
  }

  // "Suggestions pour toi"'s one-click add - same rules as sendRequest
  // above, just addressed by real user id instead of a typed-in code.
  async sendRequestToUser(
    requesterId: string,
    addresseeId: string
  ): Promise<string> {
    await this.insertPendingRequest(requesterId, addresseeId);
    return addresseeId;
  }

  private async insertPendingRequest(
    requesterId: string,
    addresseeId: string
  ): Promise<void> {
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
  ): Promise<string | undefined> {
    const existing = await this.pool.query<{ requester_id: string }>(
      `SELECT requester_id FROM friendships
       WHERE id = $1 AND addressee_id = $2 AND status = 'pending'`,
      [requestId, userId]
    );
    const requesterId = existing.rows[0]?.requester_id;
    if (!requesterId) throw new FriendRequestNotFoundError();

    if (action === 'accept') {
      await this.pool.query(
        `UPDATE friendships SET status = 'accepted' WHERE id = $1`,
        [requestId]
      );
      return requesterId;
    }
    await this.pool.query(`DELETE FROM friendships WHERE id = $1`, [requestId]);
    return undefined;
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

  async isFriend(userId: string, otherId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM friendships
       WHERE status = 'accepted'
         AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
      [userId, otherId]
    );
    return result.rows.length > 0;
  }

  async getMutualFriendCounts(
    userId: string,
    candidateIds: string[]
  ): Promise<Map<string, number>> {
    if (candidateIds.length === 0) return new Map();
    const result = await this.pool.query<{ candidate: string; count: string }>(
      `WITH my_friends AS (
         SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS friend_id
         FROM friendships
         WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)
       ),
       candidate_friend_pairs AS (
         SELECT requester_id AS candidate, addressee_id AS their_friend
         FROM friendships
         WHERE status = 'accepted' AND requester_id = ANY($2::uuid[])
         UNION ALL
         SELECT addressee_id AS candidate, requester_id AS their_friend
         FROM friendships
         WHERE status = 'accepted' AND addressee_id = ANY($2::uuid[])
       )
       SELECT cfp.candidate, COUNT(*) AS count
       FROM candidate_friend_pairs cfp
       JOIN my_friends mf ON mf.friend_id = cfp.their_friend
       GROUP BY cfp.candidate`,
      [userId, candidateIds]
    );
    return new Map(
      result.rows.map((row) => [row.candidate, Number(row.count)])
    );
  }

  async getSuggestions(
    userId: string,
    limit: number
  ): Promise<FriendSuggestion[]> {
    const result = await this.pool.query<{
      id: string;
      display_name: string;
      avatar_url: string | null;
      mutual_count: string;
    }>(
      `WITH my_friends AS (
         SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS friend_id
         FROM friendships
         WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)
       ),
       excluded AS (
         SELECT friend_id FROM my_friends
         UNION
         SELECT $1
         UNION
         SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END
         FROM friendships
         WHERE status = 'pending' AND (requester_id = $1 OR addressee_id = $1)
       ),
       friends_of_friends AS (
         SELECT CASE WHEN f.requester_id = mf.friend_id THEN f.addressee_id ELSE f.requester_id END AS candidate
         FROM friendships f
         JOIN my_friends mf ON f.requester_id = mf.friend_id OR f.addressee_id = mf.friend_id
         WHERE f.status = 'accepted'
       )
       SELECT u.id, u.display_name, u.avatar_url, COUNT(*) AS mutual_count
       FROM friends_of_friends fof
       JOIN users u ON u.id = fof.candidate
       WHERE fof.candidate NOT IN (SELECT friend_id FROM excluded)
       GROUP BY u.id, u.display_name, u.avatar_url
       ORDER BY mutual_count DESC, u.display_name ASC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows.map((row) => ({
      user: toPublicUser({
        id: row.id,
        display_name: row.display_name,
        avatar_url: row.avatar_url
      }),
      mutualFriendCount: Number(row.mutual_count)
    }));
  }

  async getFriendProfile(
    viewerId: string,
    friendUserId: string
  ): Promise<FriendProfile | undefined> {
    const result = await this.pool.query<{
      id: string;
      display_name: string;
      avatar_url: string | null;
      bio: string | null;
      created_at: string;
    }>(
      `SELECT u.id, u.display_name, u.avatar_url, u.bio, u.created_at
       FROM users u
       WHERE u.id = $2
         AND EXISTS (
           SELECT 1 FROM friendships f
           WHERE f.status = 'accepted'
             AND ((f.requester_id = $1 AND f.addressee_id = $2)
               OR (f.requester_id = $2 AND f.addressee_id = $1))
         )`,
      [viewerId, friendUserId]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      ...toPublicUser({
        id: row.id,
        display_name: row.display_name,
        avatar_url: row.avatar_url
      }),
      bio: row.bio ?? undefined,
      createdAt: new Date(row.created_at).toISOString()
    };
  }
}
