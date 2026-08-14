import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

/**
 * The stored verdict on every user-uploaded image (DEC-0021).
 *
 * Keyed by the file path each surface already records, so nothing had to be
 * duplicated to join on and the console asks one table instead of five.
 */
export type ImageModerationStatus = 'approved' | 'flagged' | 'rejected';

export type ImageSurface =
  | 'profile_photo'
  | 'user_photo'
  | 'event_photo'
  | 'group_photo'
  | 'event_cover';

export interface ImageModerationRecord {
  id: string;
  filePath: string;
  surface: ImageSurface;
  ownerId: string | undefined;
  status: ImageModerationStatus;
  provider: string | undefined;
  scores: Record<string, number> | undefined;
  reason: string | undefined;
  moderatedAt: string;
  decidedAt: string | undefined;
}

/** A queue entry: the verdict plus why a human is being asked. */
export interface ImageModerationQueueEntry extends ImageModerationRecord {
  ownerDisplayName: string | undefined;
  reportCount: number;
  reportReasons: string[];
}

export interface ImageModerationRepository {
  record(input: {
    filePath: string;
    surface: ImageSurface;
    ownerId: string | undefined;
    status: ImageModerationStatus;
    provider: string;
    scores: Record<string, number>;
    reason: string | undefined;
  }): Promise<ImageModerationRecord>;
  /**
   * Which of these paths may be shown. Batched because every gallery and
   * every photo list needs the answer for a whole page at once, and a
   * per-image round trip would make publication state expensive enough to
   * be tempting to skip.
   */
  approvedPaths(filePaths: string[]): Promise<Set<string>>;
  findByPath(filePath: string): Promise<ImageModerationRecord | undefined>;
  /** Flagged images and anything reported, oldest first. */
  queue(): Promise<ImageModerationQueueEntry[]>;
  /** Returns the row so the caller can delete the file when removing. */
  decide(
    id: string,
    adminUserId: string,
    decision: 'approved' | 'rejected'
  ): Promise<ImageModerationRecord | undefined>;
  /**
   * Raises a published image into the queue. Returns false when this
   * account had already reported it - DEC-0021 says the second attempt
   * changes nothing rather than inflating a count.
   */
  report(
    moderationId: string,
    reporterId: string,
    reason: string | undefined
  ): Promise<boolean>;
}

interface Row {
  id: string;
  file_path: string;
  surface: ImageSurface;
  owner_id: string | null;
  status: ImageModerationStatus;
  provider: string | null;
  scores: Record<string, number> | null;
  reason: string | null;
  moderated_at: string;
  decided_at: string | null;
}

function toRecord(row: Row): ImageModerationRecord {
  return {
    id: row.id,
    filePath: row.file_path,
    surface: row.surface,
    ownerId: row.owner_id ?? undefined,
    status: row.status,
    provider: row.provider ?? undefined,
    scores: row.scores ?? undefined,
    reason: row.reason ?? undefined,
    moderatedAt: new Date(row.moderated_at).toISOString(),
    decidedAt: row.decided_at
      ? new Date(row.decided_at).toISOString()
      : undefined
  };
}

const COLUMNS = `id, file_path, surface, owner_id, status, provider, scores,
                 reason, moderated_at, decided_at`;

const UNIQUE_VIOLATION = '23505';

export class PostgresImageModerationRepository implements ImageModerationRepository {
  constructor(private readonly pool: Pool) {}

  async record(input: {
    filePath: string;
    surface: ImageSurface;
    ownerId: string | undefined;
    status: ImageModerationStatus;
    provider: string;
    scores: Record<string, number>;
    reason: string | undefined;
  }): Promise<ImageModerationRecord> {
    // A path is generated per upload, so a conflict means a retry of the
    // same write rather than two different images - update instead of
    // failing the upload the visitor is waiting on.
    const result = await this.pool.query<Row>(
      `INSERT INTO image_moderations
         (id, file_path, surface, owner_id, status, provider, scores, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       ON CONFLICT (file_path) DO UPDATE SET
         status = EXCLUDED.status,
         provider = EXCLUDED.provider,
         scores = EXCLUDED.scores,
         reason = EXCLUDED.reason,
         moderated_at = now()
       RETURNING ${COLUMNS}`,
      [
        randomUUID(),
        input.filePath,
        input.surface,
        input.ownerId ?? null,
        input.status,
        input.provider,
        JSON.stringify(input.scores),
        input.reason ?? null
      ]
    );
    return toRecord(result.rows[0]!);
  }

  async approvedPaths(filePaths: string[]): Promise<Set<string>> {
    if (filePaths.length === 0) return new Set();
    const result = await this.pool.query<{ file_path: string }>(
      `SELECT file_path FROM image_moderations
       WHERE file_path = ANY($1::text[]) AND status = 'approved'`,
      [filePaths]
    );
    return new Set(result.rows.map((row) => row.file_path));
  }

  async findByPath(
    filePath: string
  ): Promise<ImageModerationRecord | undefined> {
    const result = await this.pool.query<Row>(
      `SELECT ${COLUMNS} FROM image_moderations WHERE file_path = $1`,
      [filePath]
    );
    const row = result.rows[0];
    return row ? toRecord(row) : undefined;
  }

  async queue(): Promise<ImageModerationQueueEntry[]> {
    // Two reasons to be here: the provider could not settle it, or someone
    // reported it. A reported image is still published while it waits -
    // one report is not a verdict (DEC-0021 §4).
    const result = await this.pool.query<
      Row & {
        owner_display_name: string | null;
        report_count: string;
        report_reasons: string[] | null;
      }
    >(
      `SELECT m.id, m.file_path, m.surface, m.owner_id, m.status, m.provider,
              m.scores, m.reason, m.moderated_at, m.decided_at,
              u.display_name AS owner_display_name,
              COALESCE(r.count, 0) AS report_count,
              r.reasons AS report_reasons
       FROM image_moderations m
       LEFT JOIN users u ON u.id = m.owner_id
       LEFT JOIN LATERAL (
         SELECT count(*) AS count,
                array_remove(array_agg(cr.reason), NULL) AS reasons
         FROM content_reports cr
         WHERE cr.target_type = 'image' AND cr.target_id = m.id
       ) r ON true
       WHERE m.status = 'flagged' OR COALESCE(r.count, 0) > 0
       ORDER BY m.moderated_at ASC`
    );
    return result.rows.map((row) => ({
      ...toRecord(row),
      ownerDisplayName: row.owner_display_name ?? undefined,
      reportCount: Number(row.report_count),
      reportReasons: row.report_reasons ?? []
    }));
  }

  async decide(
    id: string,
    adminUserId: string,
    decision: 'approved' | 'rejected'
  ): Promise<ImageModerationRecord | undefined> {
    const result = await this.pool.query<Row>(
      `UPDATE image_moderations
       SET status = $3, decided_by = $2, decided_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, adminUserId, decision]
    );
    const row = result.rows[0];
    return row ? toRecord(row) : undefined;
  }

  async report(
    moderationId: string,
    reporterId: string,
    reason: string | undefined
  ): Promise<boolean> {
    try {
      await this.pool.query(
        `INSERT INTO content_reports (id, reporter_id, target_type, target_id, reason)
         VALUES ($1, $2, 'image', $3, $4)`,
        [randomUUID(), reporterId, moderationId, reason ?? null]
      );
      return true;
    } catch (error) {
      // The unique index on (reporter, type, target) is what actually stops
      // one account reporting the same image repeatedly, whichever route
      // calls this.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === UNIQUE_VIOLATION
      ) {
        return false;
      }
      throw error;
    }
  }
}
