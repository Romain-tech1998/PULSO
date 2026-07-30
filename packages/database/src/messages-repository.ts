import type { PublicUser } from '@pulso/contracts';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export class NotFriendsError extends Error {
  constructor() {
    super('You can only message accounts you are friends with.');
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

export interface MessagesRepository {
  // Verifies an accepted friendship between the two accounts before
  // inserting - closed context is the abuse guard here (DEC-0012), not a
  // separate blocklist.
  sendMessage(
    senderId: string,
    recipientId: string,
    body: string
  ): Promise<Message>;
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
    if (friendship.rows.length === 0) throw new NotFriendsError();

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
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*) FROM messages WHERE recipient_id = $1 AND read_at IS NULL`,
      [userId]
    );
    return Number(result.rows[0]!.count);
  }

  async getConversations(userId: string): Promise<ConversationSummary[]> {
    const result = await this.pool.query<{
      friend_id: string;
      display_name: string;
      avatar_url: string | null;
      last_message_id: string | null;
      last_message_sender_id: string | null;
      last_message_recipient_id: string | null;
      last_message_body: string | null;
      last_message_created_at: string | null;
      last_message_read_at: string | null;
      unread_count: string;
    }>(
      `SELECT
         u.id AS friend_id, u.display_name, u.avatar_url,
         lm.id AS last_message_id,
         lm.sender_id AS last_message_sender_id,
         lm.recipient_id AS last_message_recipient_id,
         lm.body AS last_message_body,
         lm.created_at AS last_message_created_at,
         lm.read_at AS last_message_read_at,
         COALESCE(unread.count, 0) AS unread_count
       FROM friendships f
       JOIN users u
         ON u.id = (CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END)
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
       WHERE f.status = 'accepted' AND (f.requester_id = $1 OR f.addressee_id = $1)
       ORDER BY lm.created_at DESC NULLS LAST`,
      [userId]
    );
    return result.rows.map((row) => ({
      friend: {
        id: row.friend_id,
        displayName: row.display_name,
        ...(row.avatar_url !== null ? { avatarUrl: row.avatar_url } : {})
      },
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
