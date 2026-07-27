import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export type ReportTargetType = 'forum_post' | 'message';

export interface ReportsRepository {
  // Captures the report only - no automated action, no moderation queue.
  // This is a minimal safety net (DEC-0012), not a moderation system.
  createReport(
    reporterId: string,
    targetType: ReportTargetType,
    targetId: string,
    reason: string | undefined
  ): Promise<void>;
}

export class PostgresReportsRepository implements ReportsRepository {
  constructor(private readonly pool: Pool) {}

  async createReport(
    reporterId: string,
    targetType: ReportTargetType,
    targetId: string,
    reason: string | undefined
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO content_reports (id, reporter_id, target_type, target_id, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), reporterId, targetType, targetId, reason ?? null]
    );
  }
}
