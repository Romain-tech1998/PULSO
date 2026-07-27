import type { Pool } from 'pg';

export interface CategoryCount {
  category: string;
  count: number;
}

export interface Trends {
  eventCategories: CategoryCount[];
  venueCategories: CategoryCount[];
}

export interface TrendsRepository {
  getTrends(userId: string): Promise<Trends>;
}

// A real aggregation of the account's own favorites (category frequency
// counts), never an ML-derived or inferred recommendation - same
// "no fabricated data" principle as deriveVenuePriceTier in apps/web.
export class PostgresTrendsRepository implements TrendsRepository {
  constructor(private readonly pool: Pool) {}

  async getTrends(userId: string): Promise<Trends> {
    const [eventRows, venueRows] = await Promise.all([
      this.pool.query<CategoryCount>(
        `SELECT e.category AS category, COUNT(*)::int AS count
         FROM user_favorite_events f
         JOIN events e ON e.id = f.event_id
         WHERE f.user_id = $1
         GROUP BY e.category
         ORDER BY count DESC, e.category ASC`,
        [userId]
      ),
      // Most venues have no category yet (see VENUE_CATEGORIES's comment in
      // @pulso/domain) - those are excluded rather than counted as "other".
      this.pool.query<CategoryCount>(
        `SELECT v.category AS category, COUNT(*)::int AS count
         FROM user_favorite_venues f
         JOIN venues v ON v.id = f.venue_id
         WHERE f.user_id = $1 AND v.category IS NOT NULL
         GROUP BY v.category
         ORDER BY count DESC, v.category ASC`,
        [userId]
      )
    ]);
    return { eventCategories: eventRows.rows, venueCategories: venueRows.rows };
  }
}
