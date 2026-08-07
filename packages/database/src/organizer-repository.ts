import type { OrganizerRequest } from '@pulso/contracts';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export class OrganizerRequestExistsError extends Error {
  constructor() {
    super('A request for this venue is already pending.');
  }
}

export interface OrganizerStatus {
  isAdmin: boolean;
  verifiedVenues: Array<{ venueId: string; venueName: string }>;
  pendingRequests: OrganizerRequest[];
}

export interface OrganizerRepository {
  getStatus(userId: string): Promise<OrganizerStatus>;
  createRequest(
    userId: string,
    venueId: string,
    justification: string
  ): Promise<OrganizerRequest>;
  listPendingRequests(): Promise<OrganizerRequest[]>;
  /**
   * Approving creates the `venue_organizers` link DEC-0017 already defined.
   * Returns the resolved request so the caller can notify the requester,
   * or undefined when the id is not a pending request.
   */
  resolveRequest(
    adminUserId: string,
    requestId: string,
    approve: boolean
  ): Promise<OrganizerRequest | undefined>;
  listAdminUserIds(): Promise<string[]>;
  isAdmin(userId: string): Promise<boolean>;
}

interface RequestRow {
  id: string;
  venue_id: string;
  venue_name: string;
  venue_address: string;
  justification: string;
  status: 'pending' | 'approved' | 'declined';
  created_at: Date;
  user_id: string;
  display_name: string;
  email: string;
}

const REQUEST_SELECT = `
  SELECT r.id, r.venue_id, v.name AS venue_name, v.address AS venue_address,
         r.justification, r.status, r.created_at,
         r.user_id, u.display_name, u.email
  FROM organizer_requests r
  JOIN venues v ON v.id = r.venue_id
  JOIN users u ON u.id = r.user_id
`;

function toRequest(row: RequestRow): OrganizerRequest {
  return {
    id: row.id,
    venueId: row.venue_id,
    venueName: row.venue_name,
    venueAddress: row.venue_address,
    justification: row.justification,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    requester: {
      id: row.user_id,
      displayName: row.display_name,
      email: row.email
    }
  };
}

const UNIQUE_VIOLATION = '23505';

/** DEC-0018. Approval is a human judgement; nothing here verifies ownership. */
export class PostgresOrganizerRepository implements OrganizerRepository {
  constructor(private readonly pool: Pool) {}

  async getStatus(userId: string): Promise<OrganizerStatus> {
    const [admin, venues, pending] = await Promise.all([
      this.pool.query<{ is_admin: boolean }>(
        `SELECT is_admin FROM users WHERE id = $1`,
        [userId]
      ),
      this.pool.query<{ venue_id: string; name: string }>(
        `SELECT vo.venue_id, v.name
         FROM venue_organizers vo
         JOIN venues v ON v.id = vo.venue_id
         WHERE vo.user_id = $1
         ORDER BY v.name`,
        [userId]
      ),
      this.pool.query<RequestRow>(
        `${REQUEST_SELECT} WHERE r.user_id = $1 AND r.status = 'pending'
         ORDER BY r.created_at`,
        [userId]
      )
    ]);
    return {
      isAdmin: admin.rows[0]?.is_admin === true,
      verifiedVenues: venues.rows.map((row) => ({
        venueId: row.venue_id,
        venueName: row.name
      })),
      pendingRequests: pending.rows.map(toRequest)
    };
  }

  async createRequest(
    userId: string,
    venueId: string,
    justification: string
  ): Promise<OrganizerRequest> {
    const id = randomUUID();
    try {
      await this.pool.query(
        `INSERT INTO organizer_requests (id, user_id, venue_id, justification)
         VALUES ($1, $2, $3, $4)`,
        [id, userId, venueId, justification]
      );
    } catch (error) {
      // The partial unique index only covers pending rows, so this means a
      // decision is already awaited - not that the venue was ever refused.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === UNIQUE_VIOLATION
      ) {
        throw new OrganizerRequestExistsError();
      }
      throw error;
    }
    const created = await this.pool.query<RequestRow>(
      `${REQUEST_SELECT} WHERE r.id = $1`,
      [id]
    );
    return toRequest(created.rows[0]!);
  }

  async listPendingRequests(): Promise<OrganizerRequest[]> {
    const result = await this.pool.query<RequestRow>(
      `${REQUEST_SELECT} WHERE r.status = 'pending' ORDER BY r.created_at`
    );
    return result.rows.map(toRequest);
  }

  async resolveRequest(
    adminUserId: string,
    requestId: string,
    approve: boolean
  ): Promise<OrganizerRequest | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<RequestRow>(
        `${REQUEST_SELECT} WHERE r.id = $1 AND r.status = 'pending'`,
        [requestId]
      );
      const row = found.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return undefined;
      }
      await client.query(
        `UPDATE organizer_requests
         SET status = $2, resolved_at = now(), resolved_by = $3
         WHERE id = $1`,
        [requestId, approve ? 'approved' : 'declined', adminUserId]
      );
      if (approve) {
        await client.query(
          `INSERT INTO venue_organizers (user_id, venue_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [row.user_id, row.venue_id]
        );
      }
      await client.query('COMMIT');
      return {
        ...toRequest(row),
        status: approve ? 'approved' : 'declined'
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listAdminUserIds(): Promise<string[]> {
    const result = await this.pool.query<{ id: string }>(
      `SELECT id FROM users WHERE is_admin`
    );
    return result.rows.map((row) => row.id);
  }

  async isAdmin(userId: string): Promise<boolean> {
    const result = await this.pool.query<{ is_admin: boolean }>(
      `SELECT is_admin FROM users WHERE id = $1`,
      [userId]
    );
    return result.rows[0]?.is_admin === true;
  }
}
