import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

/**
 * The personal photo gallery (DEC-0020).
 *
 * A gallery, not a feed. Every read here is scoped to one owner, because
 * DEC-0020 authorizes a grid on a profile and explicitly defers any
 * cross-user chronological feed - so there is deliberately no "list recent
 * photos from everyone I follow" method for a caller to reach for.
 *
 * Visibility is enforced here rather than in the route: a gallery is
 * readable by its owner and by that owner's accepted friends, and
 * `listPhotos` takes the viewer as a separate argument so the friendship
 * check cannot be forgotten at a call site. This is the same lesson the
 * groups work paid for - membership checks that lived only in the route
 * layer were invisible to the tests and were all missing.
 */
export interface UserPhoto {
  id: string;
  // Relative path under the upload root
  // (e.g. "user-photos/<userId>/<uuid>.jpg"). The API layer turns this into
  // a full URL; the repository never deals in URLs.
  filePath: string;
  caption: string | undefined;
  eventId: string | undefined;
  venueId: string | undefined;
  createdAt: string;
}

export interface CreateUserPhotoInput {
  caption?: string | undefined;
  eventId?: string | undefined;
  venueId?: string | undefined;
}

export interface UserPhotosRepository {
  /**
   * The gallery of `ownerId`, as seen by `viewerId`. Returns an empty list
   * when the viewer is neither the owner nor an accepted friend - the same
   * answer an empty gallery gives, so the caller cannot use this to probe
   * whether a stranger has photos.
   */
  listPhotos(ownerId: string, viewerId: string): Promise<UserPhoto[]>;
  createPhoto(
    ownerId: string,
    filePath: string,
    input: CreateUserPhotoInput
  ): Promise<UserPhoto>;
  /**
   * Returns the deleted row's filePath so the caller can remove the file
   * from disk too, or undefined if the photo didn't exist or didn't belong
   * to `ownerId` - a silent no-op, matching how every other own-resource
   * delete in this project behaves.
   */
  deletePhoto(photoId: string, ownerId: string): Promise<string | undefined>;
}

interface PhotoRow {
  id: string;
  file_path: string;
  caption: string | null;
  event_id: string | null;
  venue_id: string | null;
  created_at: string;
}

function toUserPhoto(row: PhotoRow): UserPhoto {
  return {
    id: row.id,
    filePath: row.file_path,
    caption: row.caption ?? undefined,
    eventId: row.event_id ?? undefined,
    venueId: row.venue_id ?? undefined,
    createdAt: new Date(row.created_at).toISOString()
  };
}

export class PostgresUserPhotosRepository implements UserPhotosRepository {
  constructor(private readonly pool: Pool) {}

  async listPhotos(ownerId: string, viewerId: string): Promise<UserPhoto[]> {
    const result = await this.pool.query<PhotoRow>(
      `SELECT p.id, p.file_path, p.caption, p.event_id, p.venue_id, p.created_at
       FROM user_photos p
       WHERE p.user_id = $1
         AND (
           $1 = $2
           OR EXISTS (
             SELECT 1 FROM friendships f
             WHERE f.status = 'accepted'
               AND (
                 (f.requester_id = $1 AND f.addressee_id = $2)
                 OR (f.requester_id = $2 AND f.addressee_id = $1)
               )
           )
         )
       ORDER BY p.created_at DESC`,
      [ownerId, viewerId]
    );
    return result.rows.map(toUserPhoto);
  }

  async createPhoto(
    ownerId: string,
    filePath: string,
    input: CreateUserPhotoInput
  ): Promise<UserPhoto> {
    const result = await this.pool.query<PhotoRow>(
      `INSERT INTO user_photos (id, user_id, file_path, caption, event_id, venue_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, file_path, caption, event_id, venue_id, created_at`,
      [
        randomUUID(),
        ownerId,
        filePath,
        input.caption ?? null,
        input.eventId ?? null,
        input.venueId ?? null
      ]
    );
    return toUserPhoto(result.rows[0]!);
  }

  async deletePhoto(
    photoId: string,
    ownerId: string
  ): Promise<string | undefined> {
    const result = await this.pool.query<{ file_path: string }>(
      `DELETE FROM user_photos WHERE id = $1 AND user_id = $2 RETURNING file_path`,
      [photoId, ownerId]
    );
    return result.rows[0]?.file_path;
  }
}
