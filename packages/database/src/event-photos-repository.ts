import type { PublicUser } from '@pulso/contracts';
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

// Real photos of the event itself (Phase 4.8 follow-up), distinct from the
// forum's text-only posts (DEC-0012's "no attachments" boundary is unchanged
// there) - a small, dedicated feature with its own table rather than
// widening forum_posts to carry binary content.
export interface EventPhoto {
  id: string;
  eventId: string;
  uploader: PublicUser;
  // Relative path under the upload root (e.g. "event-photos/<eventId>/<uuid>.jpg") -
  // the API layer turns this into a full URL; the repository never deals in URLs.
  filePath: string;
  createdAt: string;
}

export interface EventPhotosRepository {
  listPhotos(eventId: string): Promise<EventPhoto[]>;
  createPhoto(
    eventId: string,
    uploaderId: string,
    filePath: string
  ): Promise<EventPhoto>;
  // Returns the deleted row's filePath so the caller can remove the file
  // from disk too, or undefined if the photo didn't exist or didn't belong
  // to uploaderId (silent no-op, same spirit as this project's other
  // own-resource deletes).
  deletePhoto(photoId: string, uploaderId: string): Promise<string | undefined>;
}

interface PhotoRow {
  id: string;
  event_id: string;
  file_path: string;
  created_at: string;
  uploader_id: string;
  display_name: string;
  avatar_url: string | null;
}

function toEventPhoto(row: PhotoRow): EventPhoto {
  return {
    id: row.id,
    eventId: row.event_id,
    filePath: row.file_path,
    createdAt: new Date(row.created_at).toISOString(),
    uploader: {
      id: row.uploader_id,
      displayName: row.display_name,
      ...(row.avatar_url !== null ? { avatarUrl: row.avatar_url } : {})
    }
  };
}

export class PostgresEventPhotosRepository implements EventPhotosRepository {
  constructor(private readonly pool: Pool) {}

  async listPhotos(eventId: string): Promise<EventPhoto[]> {
    const result = await this.pool.query<PhotoRow>(
      `SELECT p.id, p.event_id, p.file_path, p.created_at,
              u.id AS uploader_id, u.display_name, u.avatar_url
       FROM event_photos p
       JOIN users u ON u.id = p.uploader_id
       WHERE p.event_id = $1
       ORDER BY p.created_at DESC`,
      [eventId]
    );
    return result.rows.map(toEventPhoto);
  }

  async createPhoto(
    eventId: string,
    uploaderId: string,
    filePath: string
  ): Promise<EventPhoto> {
    const id = randomUUID();
    try {
      const result = await this.pool.query<PhotoRow>(
        `WITH inserted AS (
           INSERT INTO event_photos (id, event_id, uploader_id, file_path)
           VALUES ($1, $2, $3, $4)
           RETURNING id, event_id, uploader_id, file_path, created_at
         )
         SELECT inserted.*, u.display_name, u.avatar_url
         FROM inserted
         JOIN users u ON u.id = inserted.uploader_id`,
        [id, eventId, uploaderId, filePath]
      );
      return toEventPhoto(result.rows[0]!);
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new EventNotFoundError();
      throw error;
    }
  }

  async deletePhoto(
    photoId: string,
    uploaderId: string
  ): Promise<string | undefined> {
    const result = await this.pool.query<{ file_path: string }>(
      `DELETE FROM event_photos WHERE id = $1 AND uploader_id = $2 RETURNING file_path`,
      [photoId, uploaderId]
    );
    return result.rows[0]?.file_path;
  }
}
