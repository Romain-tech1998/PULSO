import type { PublicUser } from '@pulso/contracts';
import type { ForumCategory } from '@pulso/domain';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

import { EventNotFoundError } from './attendance-repository.js';

const FOREIGN_KEY_VIOLATION = '23503';

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === FOREIGN_KEY_VIOLATION
  );
}

export interface ForumPost {
  id: string;
  eventId: string;
  author: PublicUser;
  category: ForumCategory;
  body: string;
  createdAt: string;
}

export interface ForumRepository {
  getPosts(eventId: string, category: ForumCategory): Promise<ForumPost[]>;
  createPost(
    eventId: string,
    authorId: string,
    category: ForumCategory,
    body: string
  ): Promise<ForumPost>;
  // Silent no-op when postId doesn't exist or doesn't belong to authorId -
  // same spirit as the rest of this project's own-resource deletes.
  deletePost(postId: string, authorId: string): Promise<void>;
}

interface PostRow {
  id: string;
  event_id: string;
  category: ForumCategory;
  body: string;
  created_at: string;
  author_id: string;
  display_name: string;
  avatar_url: string | null;
}

function toForumPost(row: PostRow): ForumPost {
  return {
    id: row.id,
    eventId: row.event_id,
    category: row.category,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
    author: {
      id: row.author_id,
      displayName: row.display_name,
      ...(row.avatar_url !== null ? { avatarUrl: row.avatar_url } : {})
    }
  };
}

export class PostgresForumRepository implements ForumRepository {
  constructor(private readonly pool: Pool) {}

  async getPosts(eventId: string, category: ForumCategory): Promise<ForumPost[]> {
    const result = await this.pool.query<PostRow>(
      `SELECT p.id, p.event_id, p.category, p.body, p.created_at,
              u.id AS author_id, u.display_name, u.avatar_url
       FROM forum_posts p
       JOIN users u ON u.id = p.author_id
       WHERE p.event_id = $1 AND p.category = $2
       ORDER BY p.created_at ASC`,
      [eventId, category]
    );
    return result.rows.map(toForumPost);
  }

  async createPost(
    eventId: string,
    authorId: string,
    category: ForumCategory,
    body: string
  ): Promise<ForumPost> {
    const id = randomUUID();
    try {
      const result = await this.pool.query<PostRow>(
        `WITH inserted AS (
           INSERT INTO forum_posts (id, event_id, author_id, category, body)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, event_id, category, body, created_at, author_id
         )
         SELECT inserted.*, u.display_name, u.avatar_url
         FROM inserted
         JOIN users u ON u.id = inserted.author_id`,
        [id, eventId, authorId, category, body]
      );
      return toForumPost(result.rows[0]!);
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new EventNotFoundError();
      throw error;
    }
  }

  async deletePost(postId: string, authorId: string): Promise<void> {
    await this.pool.query(`DELETE FROM forum_posts WHERE id = $1 AND author_id = $2`, [
      postId,
      authorId
    ]);
  }
}
