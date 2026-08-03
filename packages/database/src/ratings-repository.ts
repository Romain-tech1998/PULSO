import type { Pool } from 'pg';

export class VenueNotFoundError extends Error {
  constructor() {
    super('This venue does not exist.');
  }
}

const FOREIGN_KEY_VIOLATION = '23503';

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === FOREIGN_KEY_VIOLATION
  );
}

export interface VenueRating {
  rating: number;
  comment?: string;
}

export interface VenueRatingSummary {
  average: number;
  count: number;
}

export interface RatingsRepository {
  setRating(
    userId: string,
    venueId: string,
    rating: number,
    comment: string | undefined
  ): Promise<void>;
  clearRating(userId: string, venueId: string): Promise<void>;
  getMyRating(
    userId: string,
    venueId: string
  ): Promise<VenueRating | undefined>;
  // Internal-only signal (never exposed as a public "reviews" feature) -
  // batched the same way getFavoriteCountsForVenues is, for whichever
  // venue-ranking query wants to blend it in.
  getAverageRatingsForVenues(
    venueIds: string[]
  ): Promise<Map<string, VenueRatingSummary>>;
}

export class PostgresRatingsRepository implements RatingsRepository {
  constructor(private readonly pool: Pool) {}

  async setRating(
    userId: string,
    venueId: string,
    rating: number,
    comment: string | undefined
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO venue_ratings (user_id, venue_id, rating, comment)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, venue_id)
         DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = now()`,
        [userId, venueId, rating, comment ?? null]
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new VenueNotFoundError();
      throw error;
    }
  }

  async clearRating(userId: string, venueId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM venue_ratings WHERE user_id = $1 AND venue_id = $2`,
      [userId, venueId]
    );
  }

  async getMyRating(
    userId: string,
    venueId: string
  ): Promise<VenueRating | undefined> {
    const result = await this.pool.query<{
      rating: number;
      comment: string | null;
    }>(
      `SELECT rating, comment FROM venue_ratings WHERE user_id = $1 AND venue_id = $2`,
      [userId, venueId]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      rating: row.rating,
      ...(row.comment !== null ? { comment: row.comment } : {})
    };
  }

  async getAverageRatingsForVenues(
    venueIds: string[]
  ): Promise<Map<string, VenueRatingSummary>> {
    if (venueIds.length === 0) return new Map();
    const result = await this.pool.query<{
      venue_id: string;
      average: string;
      count: string;
    }>(
      `SELECT venue_id, AVG(rating)::float AS average, COUNT(*) AS count
       FROM venue_ratings
       WHERE venue_id = ANY($1::uuid[])
       GROUP BY venue_id`,
      [venueIds]
    );
    return new Map(
      result.rows.map((row) => [
        row.venue_id,
        { average: Number(row.average), count: Number(row.count) }
      ])
    );
  }
}
