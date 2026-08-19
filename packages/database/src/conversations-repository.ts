import type { PublicUser } from '@pulso/contracts';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

import { publicUserColumns, toPublicUser } from './public-user.js';

/**
 * DEC-0025. A conversation is a room with participants, and a one-to-one
 * exchange is a room with two of them.
 *
 * Everything here treats both the same way on purpose: §1 refused a second
 * model precisely so that search, attachments, mute and pin could be written
 * once rather than twice.
 */

/** DEC-0025 §6. Past this a room is an audience, and an audience is a Group. */
export const CONVERSATION_PARTICIPANT_LIMIT = 20;

export class ConversationNotFoundError extends Error {
  constructor() {
    super('This conversation does not exist, or you are not in it.');
  }
}

/** DEC-0025 §3: the adder could not already write to this account. */
export class ParticipantNotReachableError extends Error {
  constructor() {
    super('You can only add accounts you are already able to message.');
  }
}

export class ConversationFullError extends Error {
  constructor() {
    super(
      `A conversation holds at most ${CONVERSATION_PARTICIPANT_LIMIT} people.`
    );
  }
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  attachments: Array<{
    id: string;
    filePath: string;
    mimeType: string;
    byteSize: number;
  }>;
}

export interface ConversationRoom {
  id: string;
  title: string | undefined;
  participants: PublicUser[];
  lastMessage: ConversationMessage | undefined;
  unreadCount: number;
  /** DEC-0025 §9: the reader's own switches, never anybody else's. */
  muted: boolean;
  pinned: boolean;
}

export interface ConversationSearchHit {
  conversationId: string;
  message: ConversationMessage;
}

export interface ConversationsRepository {
  /**
   * Opens a room. The creator is a participant, and every other id must be
   * someone they could already message directly (§3) - otherwise a group
   * invitation becomes a way to put a message in a stranger's inbox while
   * stepping around DEC-0020's request gate.
   */
  createConversation(
    creatorId: string,
    participantIds: string[],
    title?: string
  ): Promise<string>;
  addParticipant(
    conversationId: string,
    actorId: string,
    userId: string
  ): Promise<void>;
  /** §5. The messages they wrote stay; delivery stops. */
  leaveConversation(conversationId: string, userId: string): Promise<void>;
  listConversations(userId: string): Promise<ConversationRoom[]>;
  getMessages(
    conversationId: string,
    userId: string,
    limit?: number
  ): Promise<ConversationMessage[]>;
  sendMessage(
    conversationId: string,
    senderId: string,
    body: string,
    attachments?: Array<{
      filePath: string;
      mimeType: string;
      byteSize: number;
    }>
  ): Promise<ConversationMessage>;
  markRead(conversationId: string, userId: string): Promise<void>;
  setMuted(
    conversationId: string,
    userId: string,
    muted: boolean
  ): Promise<void>;
  setPinned(
    conversationId: string,
    userId: string,
    pinned: boolean
  ): Promise<void>;
  /** §9: inside the reader's own rooms, never across the product. */
  search(
    userId: string,
    query: string,
    limit?: number
  ): Promise<ConversationSearchHit[]>;
  /**
   * Who should be notified for a message just sent, after §8's collapse: a
   * room stays quiet while it already has an unread notification, and a muted
   * room notifies nobody at all.
   */
  participantsToNotify(
    conversationId: string,
    senderId: string
  ): Promise<string[]>;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: Date;
  attachment_id: string | null;
  file_path: string | null;
  mime_type: string | null;
  byte_size: number | null;
}

/** Rows arrive one per attachment; a message with three becomes three rows. */
function foldMessages(rows: MessageRow[]): ConversationMessage[] {
  const byId = new Map<string, ConversationMessage>();
  for (const row of rows) {
    let message = byId.get(row.id);
    if (!message) {
      message = {
        id: row.id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        body: row.body,
        createdAt: row.created_at.toISOString(),
        attachments: []
      };
      byId.set(row.id, message);
    }
    if (row.attachment_id && row.file_path && row.mime_type && row.byte_size) {
      message.attachments.push({
        id: row.attachment_id,
        filePath: row.file_path,
        mimeType: row.mime_type,
        byteSize: row.byte_size
      });
    }
  }
  return [...byId.values()];
}

const MESSAGE_COLUMNS = `m.id, m.conversation_id, m.sender_id, m.body, m.created_at,
       a.id AS attachment_id, a.file_path, a.mime_type, a.byte_size`;

export class PostgresConversationsRepository implements ConversationsRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * DEC-0025 §3, and the same ladder `sendMessage` already walks: an accepted
   * friendship, or a request this account accepted. A pending or declined
   * request is not eligibility - it is the gate doing its job.
   */
  private async canMessageDirectly(
    actorId: string,
    targetId: string
  ): Promise<boolean> {
    if (actorId === targetId) return false;
    const result = await this.pool.query<{ ok: boolean }>(
      `SELECT (
         EXISTS (
           SELECT 1 FROM friendships
           WHERE status = 'accepted'
             AND ((requester_id = $1 AND addressee_id = $2)
               OR (addressee_id = $1 AND requester_id = $2))
         )
         OR EXISTS (
           SELECT 1 FROM message_requests
           WHERE recipient_id = $2 AND sender_id = $1 AND status = 'accepted'
         )
       ) AS ok`,
      [actorId, targetId]
    );
    return result.rows[0]?.ok === true;
  }

  private async assertParticipant(
    conversationId: string,
    userId: string
  ): Promise<void> {
    const result = await this.pool.query(
      `SELECT 1 FROM conversation_participants
       WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [conversationId, userId]
    );
    if ((result.rowCount ?? 0) === 0) throw new ConversationNotFoundError();
  }

  async createConversation(
    creatorId: string,
    participantIds: string[],
    title?: string
  ): Promise<string> {
    const others = [...new Set(participantIds)].filter(
      (id) => id !== creatorId
    );
    if (others.length === 0) throw new ParticipantNotReachableError();
    if (others.length + 1 > CONVERSATION_PARTICIPANT_LIMIT) {
      throw new ConversationFullError();
    }
    for (const id of others) {
      if (!(await this.canMessageDirectly(creatorId, id))) {
        throw new ParticipantNotReachableError();
      }
    }

    const conversationId = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO conversations (id, title, created_by_user_id)
         VALUES ($1, $2, $3)`,
        [conversationId, title ?? null, creatorId]
      );
      await client.query(
        `INSERT INTO conversation_participants (conversation_id, user_id)
         SELECT $1, unnest($2::uuid[])`,
        [conversationId, [creatorId, ...others]]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return conversationId;
  }

  async addParticipant(
    conversationId: string,
    actorId: string,
    userId: string
  ): Promise<void> {
    await this.assertParticipant(conversationId, actorId);
    if (!(await this.canMessageDirectly(actorId, userId))) {
      throw new ParticipantNotReachableError();
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Locked so two people adding at once cannot both see room for the
      // twenty-first - the same reasoning as DEC-0022's ticket quantity.
      const counted = await client.query<{ count: string }>(
        `SELECT count(*) AS count
         FROM conversation_participants
         WHERE conversation_id = $1 AND left_at IS NULL
         FOR UPDATE`,
        [conversationId]
      );
      if (
        Number(counted.rows[0]?.count ?? 0) >= CONVERSATION_PARTICIPANT_LIMIT
      ) {
        throw new ConversationFullError();
      }
      // Somebody who left and is invited back rejoins with a clean marker
      // rather than the history they had when they walked out.
      await client.query(
        `INSERT INTO conversation_participants (conversation_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (conversation_id, user_id)
         DO UPDATE SET left_at = NULL, joined_at = now(), last_read_at = now()`,
        [conversationId, userId]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async leaveConversation(
    conversationId: string,
    userId: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE conversation_participants
       SET left_at = now()
       WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [conversationId, userId]
    );
  }

  async listConversations(userId: string): Promise<ConversationRoom[]> {
    // §5: a room that has fallen below two participants is nobody's, so it is
    // filtered here rather than left to render as an empty shell.
    const rooms = await this.pool.query<{
      id: string;
      title: string | null;
      unread: string;
      muted: boolean;
      pinned: boolean;
      last_at: Date | null;
    }>(
      `SELECT c.id,
              c.title,
              (SELECT count(*) FROM messages m
                WHERE m.conversation_id = c.id
                  AND m.created_at > me.last_read_at
                  AND m.sender_id <> $1) AS unread,
              me.muted_at IS NOT NULL AS muted,
              me.pinned_at IS NOT NULL AS pinned,
              (SELECT max(created_at) FROM messages m
                WHERE m.conversation_id = c.id) AS last_at
       FROM conversations c
       JOIN conversation_participants me
         ON me.conversation_id = c.id AND me.user_id = $1 AND me.left_at IS NULL
       WHERE (
         SELECT count(*) FROM conversation_participants p
         WHERE p.conversation_id = c.id AND p.left_at IS NULL
       ) >= 2
       ORDER BY me.pinned_at DESC NULLS LAST, last_at DESC NULLS LAST`,
      [userId]
    );
    if (rooms.rows.length === 0) return [];
    const ids = rooms.rows.map((row) => row.id);

    const people = await this.pool.query<
      { conversation_id: string } & Record<string, unknown>
    >(
      `SELECT p.conversation_id, ${publicUserColumns('u')}
       FROM conversation_participants p
       JOIN users u ON u.id = p.user_id
       WHERE p.conversation_id = ANY($1::uuid[]) AND p.left_at IS NULL
       ORDER BY u.display_name ASC`,
      [ids]
    );
    const byRoom = new Map<string, PublicUser[]>();
    for (const row of people.rows) {
      const list = byRoom.get(row.conversation_id) ?? [];
      list.push(toPublicUser(row as never));
      byRoom.set(row.conversation_id, list);
    }

    // The newest message of each room, in one round trip rather than N.
    const latest = await this.pool.query<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS}
       FROM messages m
       LEFT JOIN message_attachments a ON a.message_id = m.id
       JOIN (
         SELECT conversation_id, max(created_at) AS newest
         FROM messages
         WHERE conversation_id = ANY($1::uuid[])
         GROUP BY conversation_id
       ) top ON top.conversation_id = m.conversation_id
            AND top.newest = m.created_at
       WHERE m.conversation_id = ANY($1::uuid[])`,
      [ids]
    );
    const lastByRoom = new Map<string, ConversationMessage>();
    for (const message of foldMessages(latest.rows)) {
      lastByRoom.set(message.conversationId, message);
    }

    return rooms.rows.map((row) => ({
      id: row.id,
      title: row.title ?? undefined,
      participants: byRoom.get(row.id) ?? [],
      lastMessage: lastByRoom.get(row.id),
      unreadCount: Number(row.unread),
      muted: row.muted,
      pinned: row.pinned
    }));
  }

  async getMessages(
    conversationId: string,
    userId: string,
    limit = 100
  ): Promise<ConversationMessage[]> {
    await this.assertParticipant(conversationId, userId);
    const result = await this.pool.query<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS}
       FROM messages m
       LEFT JOIN message_attachments a ON a.message_id = m.id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2`,
      [conversationId, limit]
    );
    return foldMessages(result.rows).reverse();
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    body: string,
    attachments: Array<{
      filePath: string;
      mimeType: string;
      byteSize: number;
    }> = []
  ): Promise<ConversationMessage> {
    await this.assertParticipant(conversationId, senderId);
    const messageId = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query<{ created_at: Date }>(
        `INSERT INTO messages (id, conversation_id, sender_id, recipient_id, body)
         VALUES ($1, $2, $3, NULL, $4)
         RETURNING created_at`,
        [messageId, conversationId, senderId, body]
      );
      for (const attachment of attachments) {
        await client.query(
          `INSERT INTO message_attachments (id, message_id, file_path, mime_type, byte_size)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            randomUUID(),
            messageId,
            attachment.filePath,
            attachment.mimeType,
            attachment.byteSize
          ]
        );
      }
      // The sender has read what they just wrote.
      await client.query(
        `UPDATE conversation_participants SET last_read_at = now()
         WHERE conversation_id = $1 AND user_id = $2`,
        [conversationId, senderId]
      );
      await client.query('COMMIT');
      return {
        id: messageId,
        conversationId,
        senderId,
        body,
        createdAt: (inserted.rows[0]?.created_at ?? new Date()).toISOString(),
        attachments: attachments.map((attachment) => ({
          id: randomUUID(),
          ...attachment
        }))
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async markRead(conversationId: string, userId: string): Promise<void> {
    await this.pool.query(
      // `notified_at` is cleared with the read: §8 lets the room speak again
      // once its last word has been heard.
      `UPDATE conversation_participants
       SET last_read_at = now(), notified_at = NULL
       WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [conversationId, userId]
    );
  }

  async setMuted(
    conversationId: string,
    userId: string,
    muted: boolean
  ): Promise<void> {
    await this.pool.query(
      `UPDATE conversation_participants
       SET muted_at = CASE WHEN $3 THEN now() ELSE NULL END
       WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId, muted]
    );
  }

  async setPinned(
    conversationId: string,
    userId: string,
    pinned: boolean
  ): Promise<void> {
    await this.pool.query(
      `UPDATE conversation_participants
       SET pinned_at = CASE WHEN $3 THEN now() ELSE NULL END
       WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId, pinned]
    );
  }

  async search(
    userId: string,
    query: string,
    limit = 40
  ): Promise<ConversationSearchHit[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    const result = await this.pool.query<MessageRow>(
      // The join to `conversation_participants` is the whole access rule:
      // §9 allows search inside the reader's own rooms and nowhere else, so
      // there is no code path here that can be asked for anything wider.
      `SELECT ${MESSAGE_COLUMNS}
       FROM messages m
       JOIN conversation_participants p
         ON p.conversation_id = m.conversation_id
        AND p.user_id = $1
        AND p.left_at IS NULL
       LEFT JOIN message_attachments a ON a.message_id = m.id
       WHERE pulso_fold(m.body) LIKE '%' || pulso_fold($2) || '%'
       ORDER BY m.created_at DESC
       LIMIT $3`,
      [userId, trimmed, limit]
    );
    return foldMessages(result.rows).map((message) => ({
      conversationId: message.conversationId,
      message
    }));
  }

  async participantsToNotify(
    conversationId: string,
    senderId: string
  ): Promise<string[]> {
    // One statement, because the decision and the record of it must not drift:
    // whoever is returned here is marked notified in the same breath, so a
    // second message cannot slip through between the read and the write.
    const result = await this.pool.query<{ user_id: string }>(
      `UPDATE conversation_participants
       SET notified_at = now()
       WHERE conversation_id = $1
         AND user_id <> $2
         AND left_at IS NULL
         AND muted_at IS NULL
         AND notified_at IS NULL
       RETURNING user_id`,
      [conversationId, senderId]
    );
    return result.rows.map((row) => row.user_id);
  }
}
