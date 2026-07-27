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

export interface MessagesRepository {
  // Verifies an accepted friendship between the two accounts before
  // inserting - closed context is the abuse guard here (DEC-0012), not a
  // separate blocklist.
  sendMessage(senderId: string, recipientId: string, body: string): Promise<Message>;
  getConversation(userId: string, friendUserId: string, limit?: number): Promise<Message[]>;
  markConversationRead(userId: string, friendUserId: string): Promise<void>;
  getUnreadCount(userId: string): Promise<number>;
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
    readAt: row.read_at !== null ? new Date(row.read_at).toISOString() : undefined
  };
}

export class PostgresMessagesRepository implements MessagesRepository {
  constructor(private readonly pool: Pool) {}

  async sendMessage(senderId: string, recipientId: string, body: string): Promise<Message> {
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

  async markConversationRead(userId: string, friendUserId: string): Promise<void> {
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
}
