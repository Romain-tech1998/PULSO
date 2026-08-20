import { randomUUID } from 'node:crypto';

import {
  createPool,
  PostgresAttendanceRepository,
  PostgresEventRepository
} from '@pulso/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * DEC-0024 §2 and §4, against real SQL.
 *
 * The floor, the window and the tie-break are the whole decision: a ranking
 * whose order depends on when you asked, or which quietly shows a top of two,
 * is the thing this document refused. None of that can be checked against a
 * fake repository, because all three live in one query.
 */
const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('DEC-0024 ranking', () => {
  let pool: ReturnType<typeof createPool>;
  let events: PostgresEventRepository;
  let attendance: PostgresAttendanceRepository;

  const organizerId = randomUUID();
  const guests = Array.from({ length: 6 }, () => randomUUID());
  const userIds = [organizerId, ...guests];

  let popularId: string;
  let popularVenueId: string;
  let quietId: string;
  let quietVenueId: string;
  let staleId: string;
  let staleVenueId: string;

  const createUser = async (id: string) => {
    await pool.query(
      `INSERT INTO users (id, email, display_name, google_subject, friend_code)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        `${id}@integration.test`,
        `Rank ${id.slice(0, 8)}`,
        `integration-${id}`,
        id.replaceAll('-', '').slice(0, 10).toUpperCase()
      ]
    );
  };

  const createEvent = async (label: string, hoursFromNow: number) =>
    events.createEvent(organizerId, {
      title: `Rank ${label}`,
      category: 'nightlife',
      startsAt: new Date(Date.now() + hoursFromNow * 3600_000).toISOString(),
      accessInformation: 'Entrée libre.',
      isAfter: false,
      price: { kind: 'free' },
      venue: {
        kind: 'new',
        name: `Salle ${label}`,
        address: `${label} 7 rue Test, Montréal`,
        point: { longitude: -73.59, latitude: 45.51 }
      }
    });

  /** Attendance rows are stamped `now()`; ageing one is the only way to test the window. */
  const ageAttendance = async (eventId: string, hours: number) => {
    await pool.query(
      `UPDATE event_attendance
       SET created_at = now() - make_interval(hours => $2)
       WHERE event_id = $1`,
      [eventId, hours]
    );
  };

  beforeAll(async () => {
    pool = createPool(databaseUrl);
    events = new PostgresEventRepository(pool);
    attendance = new PostgresAttendanceRepository(pool);
    for (const id of userIds) await createUser(id);

    const popular = await createEvent('popular', 10);
    popularId = popular.id;
    popularVenueId = popular.venue.id;
    const quiet = await createEvent('quiet', 12);
    quietId = quiet.id;
    quietVenueId = quiet.venue.id;
    const stale = await createEvent('stale', 14);
    staleId = stale.id;
    staleVenueId = stale.venue.id;

    // Four now, so it clears a floor of three.
    for (const id of guests.slice(0, 4))
      await attendance.setAttendance(id, popularId, 'private');
    // Two now, so it does not.
    for (const id of guests.slice(0, 2))
      await attendance.setAttendance(id, quietId, 'private');
    // Four, but all of them three days ago.
    for (const id of guests.slice(0, 4))
      await attendance.setAttendance(id, staleId, 'private');
    await ageAttendance(staleId, 72);
  });

  afterAll(async () => {
    const eventIds = [popularId, quietId, staleId];
    await pool.query(
      `DELETE FROM event_attendance WHERE event_id = ANY($1::uuid[])`,
      [eventIds]
    );
    await pool.query(
      `DELETE FROM events WHERE created_by_user_id = ANY($1::uuid[])`,
      [userIds]
    );
    await pool.query(`DELETE FROM venues WHERE id = ANY($1::uuid[])`, [
      [popularVenueId, quietVenueId, staleVenueId]
    ]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
    await pool.end();
  });

  const rank = () =>
    attendance.getMostAttendedEventIds({
      sinceHours: 48,
      floor: 3,
      limit: 12
    });

  it('leaves out an event that has not cleared the floor', async () => {
    const ids = (await rank()).map((entry) => entry.eventId);
    expect(ids).toContain(popularId);
    expect(ids).not.toContain(quietId);
  });

  it('counts a window, not a total', async () => {
    // Four people said yes to this one - three days ago. DEC-0024 §4 orders
    // by what is being decided now.
    const ids = (await rank()).map((entry) => entry.eventId);
    expect(ids).not.toContain(staleId);
  });

  it('breaks ties the same way every time', async () => {
    // Same count as `popular`, starting later, so it must come after it.
    for (const id of guests.slice(0, 4))
      await attendance.setAttendance(id, quietId, 'private');

    const first = (await rank()).map((entry) => entry.eventId);
    const second = (await rank()).map((entry) => entry.eventId);
    expect(first).toEqual(second);
    expect(first.indexOf(popularId)).toBeLessThan(first.indexOf(quietId));
  });

  it('never ranks an event that has already started', async () => {
    await pool.query(
      `UPDATE events SET starts_at = now() - interval '2 hours' WHERE id = $1`,
      [popularId]
    );
    const ids = (await rank()).map((entry) => entry.eventId);
    expect(ids).not.toContain(popularId);
    await pool.query(
      `UPDATE events SET starts_at = now() + interval '10 hours' WHERE id = $1`,
      [popularId]
    );
  });

  it('never ranks a cancelled event', async () => {
    await pool.query(`UPDATE events SET status = 'cancelled' WHERE id = $1`, [
      popularId
    ]);
    const ids = (await rank()).map((entry) => entry.eventId);
    expect(ids).not.toContain(popularId);
    await pool.query(`UPDATE events SET status = 'scheduled' WHERE id = $1`, [
      popularId
    ]);
  });

  it('names a public attendee to a reader with no account, and a private one to nobody', async () => {
    await attendance.setAttendance(guests[5]!, popularId, 'public');
    const named = await attendance.getPublicAttendees(popularId);
    expect(named.map((user) => user.id)).toEqual([guests[5]!]);
    // guests[0..3] are on this event as 'private' and appear nowhere.
    expect(named).toHaveLength(1);
  });
});
