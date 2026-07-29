import type { ActivityEntry } from '@pulso/contracts';
import type { Pool } from 'pg';

export interface ProfileStats {
  eventsAttended: number;
  venuesDiscovered: number;
  groupsJoined: number;
  favoritesCount: number;
}

export interface ProfileRepository {
  getStats(userId: string): Promise<ProfileStats>;
  getRecentActivity(userId: string, limit: number): Promise<ActivityEntry[]>;
}

// Backs the profile page's Stats card (Phase 4.7) - four real, derived
// counts, deliberately not the mockup's "heures passées en soirée"/"amis
// rencontrés" (no duration or in-person-confirmation data exists anywhere
// in Pulso). `eventsAttended`/`venuesDiscovered` only count attendance rows
// for events that have already happened - marking "j'y vais" on a future
// event isn't a discovery yet.
export class PostgresProfileRepository implements ProfileRepository {
  constructor(private readonly pool: Pool) {}

  async getStats(userId: string): Promise<ProfileStats> {
    const [attendance, favorites, groups] = await Promise.all([
      this.pool.query<{ events_attended: string; venues_discovered: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE e.starts_at < now()) AS events_attended,
           COUNT(DISTINCT e.venue_id) FILTER (WHERE e.starts_at < now()) AS venues_discovered
         FROM event_attendance ea
         JOIN events e ON e.id = ea.event_id
         WHERE ea.user_id = $1`,
        [userId]
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM user_favorite_events WHERE user_id = $1`,
        [userId]
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM group_memberships WHERE user_id = $1`,
        [userId]
      )
    ]);
    return {
      eventsAttended: Number(attendance.rows[0]!.events_attended),
      venuesDiscovered: Number(attendance.rows[0]!.venues_discovered),
      favoritesCount: Number(favorites.rows[0]!.count),
      groupsJoined: Number(groups.rows[0]!.count)
    };
  }

  // A UNION of four real signals, each carrying its own timestamp that
  // already existed in the database (created_at/joined_at) but was never
  // exposed together - nothing here is inferred or invented. No "avis"
  // (review) entry kind, since reviews aren't built yet (see DEC-0012-style
  // future decision needed for that).
  async getRecentActivity(userId: string, limit: number): Promise<ActivityEntry[]> {
    const result = await this.pool.query<{
      kind: 'favorited_event' | 'favorited_venue' | 'attended_event' | 'joined_group';
      occurred_at: Date;
      ref_id: string;
      label: string;
    }>(
      `(SELECT 'favorited_event' AS kind, ufe.created_at AS occurred_at, e.id AS ref_id, e.title AS label
        FROM user_favorite_events ufe
        JOIN events e ON e.id = ufe.event_id
        WHERE ufe.user_id = $1)
       UNION ALL
       (SELECT 'favorited_venue' AS kind, ufv.created_at AS occurred_at, v.id AS ref_id, v.name AS label
        FROM user_favorite_venues ufv
        JOIN venues v ON v.id = ufv.venue_id
        WHERE ufv.user_id = $1)
       UNION ALL
       (SELECT 'attended_event' AS kind, ea.created_at AS occurred_at, e.id AS ref_id, e.title AS label
        FROM event_attendance ea
        JOIN events e ON e.id = ea.event_id
        WHERE ea.user_id = $1)
       UNION ALL
       (SELECT 'joined_group' AS kind, gm.joined_at AS occurred_at, g.id AS ref_id, g.name AS label
        FROM group_memberships gm
        JOIN groups g ON g.id = gm.group_id
        WHERE gm.user_id = $1)
       ORDER BY occurred_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows.map((row): ActivityEntry => {
      const occurredAt = row.occurred_at.toISOString();
      switch (row.kind) {
        case 'favorited_event':
          return { kind: 'favorited_event', occurredAt, eventId: row.ref_id, eventTitle: row.label };
        case 'favorited_venue':
          return { kind: 'favorited_venue', occurredAt, venueId: row.ref_id, venueName: row.label };
        case 'attended_event':
          return { kind: 'attended_event', occurredAt, eventId: row.ref_id, eventTitle: row.label };
        case 'joined_group':
          return { kind: 'joined_group', occurredAt, groupId: row.ref_id, groupName: row.label };
      }
    });
  }
}
