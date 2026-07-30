import type { Pool } from 'pg';

export interface FavoritesRepository {
  getFavoriteEventIds(userId: string): Promise<string[]>;
  setFavoriteEventIds(userId: string, eventIds: string[]): Promise<string[]>;
  getFavoriteVenueIds(userId: string): Promise<string[]>;
  setFavoriteVenueIds(userId: string, venueIds: string[]): Promise<string[]>;
}

export class PostgresFavoritesRepository implements FavoritesRepository {
  constructor(private readonly pool: Pool) {}

  async getFavoriteEventIds(userId: string): Promise<string[]> {
    const result = await this.pool.query<{ event_id: string }>(
      `SELECT event_id FROM user_favorite_events WHERE user_id = $1`,
      [userId]
    );
    return result.rows.map((row) => row.event_id);
  }

  // A full replace, not a merge - the client is the one responsible for
  // unioning local and account favorites at login time (it already has both
  // sets in hand), so the server doesn't need special-case merge semantics
  // and an ordinary un-favorite click keeps working once signed in. Ids that
  // no longer match a real event are silently dropped from the insert rather
  // than rejected, since a stale local id (e.g. a deleted event) shouldn't
  // block the rest of the write.
  async setFavoriteEventIds(
    userId: string,
    eventIds: string[]
  ): Promise<string[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM user_favorite_events WHERE user_id = $1 AND event_id != ALL($2::uuid[])`,
        [userId, eventIds]
      );
      if (eventIds.length > 0) {
        await client.query(
          `INSERT INTO user_favorite_events (user_id, event_id)
           SELECT $1, e.id FROM events e WHERE e.id = ANY($2::uuid[])
           ON CONFLICT (user_id, event_id) DO NOTHING`,
          [userId, eventIds]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.getFavoriteEventIds(userId);
  }

  async getFavoriteVenueIds(userId: string): Promise<string[]> {
    const result = await this.pool.query<{ venue_id: string }>(
      `SELECT venue_id FROM user_favorite_venues WHERE user_id = $1`,
      [userId]
    );
    return result.rows.map((row) => row.venue_id);
  }

  async setFavoriteVenueIds(
    userId: string,
    venueIds: string[]
  ): Promise<string[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM user_favorite_venues WHERE user_id = $1 AND venue_id != ALL($2::uuid[])`,
        [userId, venueIds]
      );
      if (venueIds.length > 0) {
        await client.query(
          `INSERT INTO user_favorite_venues (user_id, venue_id)
           SELECT $1, v.id FROM venues v WHERE v.id = ANY($2::uuid[])
           ON CONFLICT (user_id, venue_id) DO NOTHING`,
          [userId, venueIds]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.getFavoriteVenueIds(userId);
  }
}
