import type { PublicUser } from '@pulso/contracts';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

import { publicUserColumns, toPublicUser } from './public-user.js';

export class NotFriendsError extends Error {
  constructor() {
    super('You can only message accounts you are friends with.');
  }
}

// DEC-0020. Distinct from NotFriendsError, which no longer fires: a
// stranger may write, but only once until the recipient answers.
export class MessageRequestPendingError extends Error {
  constructor() {
    super(
      'You have already sent a message request to this account. Wait for it to be accepted.'
    );
  }
}

export class MessageRequestDeclinedError extends Error {
  constructor() {
    super('This account is not accepting messages from you.');
  }
}

export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
  readAt: string | undefined;
}

export interface ConversationSummary {
  friend: PublicUser;
  lastMessage: Message | undefined;
  unreadCount: number;
}

// DEC-0020 - a conversation waiting to be let in. Carries the one message
// the sender was allowed, so the recipient decides on the content rather
// than on a name alone.
export interface MessageRequest {
  sender: PublicUser;
  message: Message | undefined;
  createdAt: string;
}

export interface MessagesRepository {
  /**
   * DEC-0020 replaced DEC-0012's "friends only" rule with a request gate.
   * The eligibility ladder, in order:
   *
   *   accepted friendship        -> always allowed
   *   accepted message request   -> allowed
   *   declined message request   -> MessageRequestDeclinedError
   *   pending message request    -> MessageRequestPendingError
   *   nothing yet                -> allowed, and opens a pending request
   *
   * The one-message limit is what keeps "anyone may write to anyone" from
   * meaning "anyone may write to everyone repeatedly", and it is enforced
   * here rather than in the route so it cannot be bypassed by a caller.
   */
  sendMessage(
    senderId: string,
    recipientId: string,
    body: string
  ): Promise<Message>;
  // Pending requests addressed to this user, newest first.
  getMessageRequests(userId: string): Promise<MessageRequest[]>;
  // Returns false when there was no pending request to answer.
  respondToMessageRequest(
    recipientId: string,
    senderId: string,
    action: 'accept' | 'decline'
  ): Promise<boolean>;
  getConversation(
    userId: string,
    friendUserId: string,
    limit?: number
  ): Promise<Message[]>;
  markConversationRead(userId: string, friendUserId: string): Promise<void>;
  getUnreadCount(userId: string): Promise<number>;
  // One row per accepted friend (not just ones with an existing message
  // history) - the Messages page uses this list to decide who to show,
  // same "friendship is the only eligibility signal" rule as sendMessage.
  getConversations(userId: string): Promise<ConversationSummary[]>;
}

interface MessageRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
    readAt:
      row.read_at !== null ? new Date(row.read_at).toISOString() : undefined
  };
}

export class PostgresMessagesRepository implements MessagesRepository {
  constructor(private readonly pool: Pool) {}

  async sendMessage(
    senderId: string,
    recipientId: string,
    body: string
  ): Promise<Message> {
    const friendship = await this.pool.query(
      `SELECT 1 FROM friendships
       WHERE status = 'accepted'
         AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
      [senderId, recipientId]
    );

    if (friendship.rows.length === 0) {
      // Not friends: the request gate decides. Read and write in one
      // statement - two round trips would let a sender who fires twice at
      // once slip both messages past the one-message limit.
      //
      // The INSERT only lands when no row exists; ON CONFLICT DO NOTHING
      // leaves an existing row alone and returns nothing, which is how the
      // "what was already there" branch below is reached.
      const opened = await this.pool.query<{ status: string }>(
        `INSERT INTO message_requests (recipient_id, sender_id)
         VALUES ($1, $2)
         ON CONFLICT (recipient_id, sender_id) DO NOTHING
         RETURNING status`,
        [recipientId, senderId]
      );

      if (opened.rows.length === 0) {
        const existing = await this.pool.query<{ status: string }>(
          `SELECT status FROM message_requests
           WHERE recipient_id = $1 AND sender_id = $2`,
          [recipientId, senderId]
        );
        const status = existing.rows[0]?.status;
        if (status === 'declined') throw new MessageRequestDeclinedError();
        if (status === 'pending') throw new MessageRequestPendingError();
        // 'accepted' falls through: an ordinary conversation from here on.
      }
    }

    const result = await this.pool.query<MessageRow>(
      `INSERT INTO messages (id, sender_id, recipient_id, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, sender_id, recipient_id, body, created_at, read_at`,
      [randomUUID(), senderId, recipientId, body]
    );
    return toMessage(result.rows[0]!);
  }

  async getConversation(
    userId: string,
    friendUserId: string,
    limit = 200
  ): Promise<Message[]> {
    const result = await this.pool.query<MessageRow>(
      `SELECT id, sender_id, recipient_id, body, created_at, read_at
       FROM messages
       WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, friendUserId, limit]
    );
    return result.rows.map(toMessage).reverse();
  }

  async markConversationRead(
    userId: string,
    friendUserId: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE messages SET read_at = now()
       WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL`,
      [userId, friendUserId]
    );
  }

  async getUnreadCount(userId: string): Promise<number> {
    // Messages sitting behind an unanswered request are excluded. DEC-0020
    // gives a pending request no notification and its own list, so counting
    // it here would light the Communauté badge for something the inbox does
    // not show - the exact "badge points at nothing" problem the sidebar
    // regrouping was careful to avoid.
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*) FROM messages m
       WHERE m.recipient_id = $1
         AND m.read_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM message_requests r
           WHERE r.recipient_id = m.recipient_id
             AND r.sender_id = m.sender_id
             AND r.status = 'pending'
         )`,
      [userId]
    );
    return Number(result.rows[0]!.count);
  }

  async getMessageRequests(userId: string): Promise<MessageRequest[]> {
    const result = await this.pool.query<{
      id: string;
      display_name: string;
      avatar_url: string | null;
      photo_url: string | null;
      avatar_style: string | null;
      requested_at: string;
      message_id: string | null;
      message_sender_id: string | null;
      message_recipient_id: string | null;
      message_body: string | null;
      message_created_at: string | null;
      message_read_at: string | null;
    }>(
      `SELECT ${publicUserColumns('u')},
         r.created_at AS requested_at,
         m.id AS message_id,
         m.sender_id AS message_sender_id,
         m.recipient_id AS message_recipient_id,
         m.body AS message_body,
         m.created_at AS message_created_at,
         m.read_at AS message_read_at
       FROM message_requests r
       JOIN users u ON u.id = r.sender_id
       LEFT JOIN LATERAL (
         SELECT id, sender_id, recipient_id, body, created_at, read_at
         FROM messages
         WHERE sender_id = r.sender_id AND recipient_id = r.recipient_id
         ORDER BY created_at DESC
         LIMIT 1
       ) m ON true
       WHERE r.recipient_id = $1 AND r.status = 'pending'
       ORDER BY r.created_at DESC`,
      [userId]
    );
    return result.rows.map((row) => ({
      sender: toPublicUser(row),
      message:
        row.message_id !== null
          ? toMessage({
              id: row.message_id,
              sender_id: row.message_sender_id!,
              recipient_id: row.message_recipient_id!,
              body: row.message_body!,
              created_at: row.message_created_at!,
              read_at: row.message_read_at
            })
          : undefined,
      createdAt: new Date(row.requested_at).toISOString()
    }));
  }

  async respondToMessageRequest(
    recipientId: string,
    senderId: string,
    action: 'accept' | 'decline'
  ): Promise<boolean> {
    // Scoped to 'pending' so answering twice, or answering a request that
    // was never made, is a no-op rather than a way to flip a decline back
    // to an accept from a stale interface.
    const result = await this.pool.query(
      `UPDATE message_requests
       SET status = $3, resolved_at = now()
       WHERE recipient_id = $1 AND sender_id = $2 AND status = 'pending'`,
      [recipientId, senderId, action === 'accept' ? 'accepted' : 'declined']
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getConversations(userId: string): Promise<ConversationSummary[]> {
    const result = await this.pool.query<{
      friend_id: string;
      display_name: string;
      avatar_url: string | null;
      photo_url: string | null;
      avatar_style: string | null;
      last_message_id: string | null;
      last_message_sender_id: string | null;
      last_message_recipient_id: string | null;
      last_message_body: string | null;
      last_message_created_at: string | null;
      last_message_read_at: string | null;
      unread_count: string;
    }>(
      // Who this user has an inbox with. Before DEC-0020 that was exactly
      // "accepted friends"; it is now that plus every account on the far
      // side of an accepted message request, in either direction - the
      // stranger who asked and was let in, and the stranger this user asked
      // who let them in. UNION, not UNION ALL: someone can be both a friend
      // and a former request, and must appear once.
      //
      // A pending request is deliberately absent: it belongs in the
      // Demandes list, not the inbox.
      `WITH counterparts AS (
         SELECT CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END AS other_id
         FROM friendships f
         WHERE f.status = 'accepted' AND (f.requester_id = $1 OR f.addressee_id = $1)
         UNION
         SELECT r.sender_id FROM message_requests r
         WHERE r.recipient_id = $1 AND r.status = 'accepted'
         UNION
         SELECT r.recipient_id FROM message_requests r
         WHERE r.sender_id = $1 AND r.status = 'accepted'
       )
       SELECT
         u.id AS friend_id, u.display_name, u.avatar_url,
         u.photo_url, u.avatar_style,
         lm.id AS last_message_id,
         lm.sender_id AS last_message_sender_id,
         lm.recipient_id AS last_message_recipient_id,
         lm.body AS last_message_body,
         lm.created_at AS last_message_created_at,
         lm.read_at AS last_message_read_at,
         COALESCE(unread.count, 0) AS unread_count
       FROM counterparts c
       JOIN users u ON u.id = c.other_id
       LEFT JOIN LATERAL (
         SELECT id, sender_id, recipient_id, body, created_at, read_at
         FROM messages m
         WHERE (m.sender_id = $1 AND m.recipient_id = u.id) OR (m.sender_id = u.id AND m.recipient_id = $1)
         ORDER BY m.created_at DESC
         LIMIT 1
       ) lm ON true
       LEFT JOIN LATERAL (
         SELECT count(*) AS count FROM messages m2
         WHERE m2.recipient_id = $1 AND m2.sender_id = u.id AND m2.read_at IS NULL
       ) unread ON true
       ORDER BY lm.created_at DESC NULLS LAST`,
      [userId]
    );
    return result.rows.map((row) => ({
      friend: toPublicUser({ ...row, id: row.friend_id }),
      lastMessage:
        row.last_message_id !== null
          ? {
              id: row.last_message_id,
              senderId: row.last_message_sender_id!,
              recipientId: row.last_message_recipient_id!,
              body: row.last_message_body!,
              createdAt: new Date(row.last_message_created_at!).toISOString(),
              readAt:
                row.last_message_read_at !== null
                  ? new Date(row.last_message_read_at).toISOString()
                  : undefined
            }
          : undefined,
      unreadCount: Number(row.unread_count)
    }));
  }
}
