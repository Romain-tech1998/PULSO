import { randomUUID } from 'node:crypto';

import {
  createPool,
  EventFullError,
  PostgresAttendanceRepository,
  PostgresEventRepository,
  PostgresOrganizerConsoleRepository,
  PostgresTicketingRepository
} from '@pulso/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * DEC-0023, against real SQL.
 *
 * Three of these cannot be written any other way. The cap "is applied where
 * the attendance row is written, not by a CHECK" (§4) is a claim about what a
 * transaction does when several callers race for the last place, and a fake
 * repository races with nobody. "Lowering a limit evicts nobody" is a claim
 * about rows that stay. And §3's whole authorisation rests on the counter
 * table having nowhere to put a person - which is a question about columns,
 * asked here of the database itself rather than of the code that writes them.
 */
const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('DEC-0023 organizer console', () => {
  let pool: ReturnType<typeof createPool>;
  let events: PostgresEventRepository;
  let attendance: PostgresAttendanceRepository;
  let tickets: PostgresTicketingRepository;
  let console_: PostgresOrganizerConsoleRepository;

  const organizerId = randomUUID();
  const strangerId = randomUUID();
  const guests = Array.from({ length: 5 }, () => randomUUID());
  const userIds = [organizerId, strangerId, ...guests];

  let cappedEventId: string;
  let cappedVenueId: string;
  let openEventId: string;
  let openVenueId: string;
  let ticketedEventId: string;
  let ticketedVenueId: string;

  const createUser = async (id: string) => {
    await pool.query(
      `INSERT INTO users (id, email, display_name, google_subject, friend_code)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        `${id}@integration.test`,
        `Console ${id.slice(0, 8)}`,
        `integration-${id}`,
        id.replaceAll('-', '').slice(0, 10).toUpperCase()
      ]
    );
  };

  const createEvent = async (label: string, attendanceLimit?: number) =>
    events.createEvent(organizerId, {
      title: `Console ${label}`,
      category: 'nightlife',
      startsAt: new Date(Date.now() + 6 * 3600_000).toISOString(),
      accessInformation: 'Entrée libre.',
      isAfter: false,
      price: { kind: 'free' },
      ...(attendanceLimit === undefined ? {} : { attendanceLimit }),
      venue: {
        kind: 'new',
        name: `Salle ${label}`,
        address: `${label} 40 rue Test, Montréal`,
        point: { longitude: -73.58, latitude: 45.53 }
      }
    });

  beforeAll(async () => {
    pool = createPool(databaseUrl);
    events = new PostgresEventRepository(pool);
    attendance = new PostgresAttendanceRepository(pool);
    tickets = new PostgresTicketingRepository(pool);
    console_ = new PostgresOrganizerConsoleRepository(pool);
    for (const id of userIds) await createUser(id);

    const capped = await createEvent('capped', 2);
    cappedEventId = capped.id;
    cappedVenueId = capped.venue.id;
    const open = await createEvent('open');
    openEventId = open.id;
    openVenueId = open.venue.id;
    const ticketed = await createEvent('ticketed', 1);
    ticketedEventId = ticketed.id;
    ticketedVenueId = ticketed.venue.id;
  });

  afterAll(async () => {
    const eventIds = [cappedEventId, openEventId, ticketedEventId];
    await pool.query(
      `DELETE FROM event_view_counts WHERE event_id = ANY($1::uuid[])`,
      [eventIds]
    );
    await pool.query(
      `DELETE FROM event_attendance WHERE event_id = ANY($1::uuid[])`,
      [eventIds]
    );
    await pool.query(
      `DELETE FROM events WHERE created_by_user_id = ANY($1::uuid[])`,
      [userIds]
    );
    await pool.query(`DELETE FROM venues WHERE id = ANY($1::uuid[])`, [
      [cappedVenueId, openVenueId, ticketedVenueId]
    ]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
    await pool.end();
  });

  it('stores the limit the organizer set, and none where they set none', async () => {
    const capped = await events.findById(cappedEventId, organizerId);
    expect(capped?.capacity).toEqual({ limit: 2, taken: 0 });

    const open = await events.findById(openEventId, organizerId);
    expect(open?.capacity).toBeUndefined();
  });

  it('refuses the place after the last one, and says which error it is', async () => {
    await attendance.setAttendance(guests[0]!, cappedEventId, 'private');
    await attendance.setAttendance(guests[1]!, cappedEventId, 'friends');

    await expect(
      attendance.setAttendance(guests[2]!, cappedEventId, 'private')
    ).rejects.toBeInstanceOf(EventFullError);

    const full = await events.findById(cappedEventId, organizerId);
    expect(full?.capacity).toEqual({ limit: 2, taken: 2 });
  });

  it('lets someone already coming change their visibility on a full event', async () => {
    // Not a new place: the row exists, and this is a different action that
    // happens to touch it. DEC-0023 §4.
    await expect(
      attendance.setAttendance(guests[0]!, cappedEventId, 'friends')
    ).resolves.toBeUndefined();

    const still = await attendance.getAttendanceCountsForEvents([
      cappedEventId
    ]);
    expect(still.get(cappedEventId)).toBe(2);
  });

  it('evicts nobody when the limit drops below the number already coming', async () => {
    await pool.query(`UPDATE events SET attendance_limit = 1 WHERE id = $1`, [
      cappedEventId
    ]);

    const counts = await attendance.getAttendanceCountsForEvents([
      cappedEventId
    ]);
    expect(counts.get(cappedEventId)).toBe(2);

    const overFull = await events.findById(cappedEventId, organizerId);
    // Over its own limit, and that is an ordinary state a client must render.
    expect(overFull?.capacity).toEqual({ limit: 1, taken: 2 });

    await pool.query(`UPDATE events SET attendance_limit = 2 WHERE id = $1`, [
      cappedEventId
    ]);
  });

  it('never lets two racing joins exceed the limit', async () => {
    const racers = [guests[2]!, guests[3]!, guests[4]!];
    await pool.query(`DELETE FROM event_attendance WHERE event_id = $1`, [
      cappedEventId
    ]);

    const outcomes = await Promise.allSettled(
      racers.map((id) => attendance.setAttendance(id, cappedEventId, 'private'))
    );
    const accepted = outcomes.filter((o) => o.status === 'fulfilled').length;
    expect(accepted).toBe(2);

    const counts = await attendance.getAttendanceCountsForEvents([
      cappedEventId
    ]);
    expect(counts.get(cappedEventId)).toBe(2);
  });

  it('ignores the limit on a ticketed event, where quantity already answers', async () => {
    await tickets.createTicketType(organizerId, ticketedEventId, {
      name: 'Entrée',
      priceCents: 0,
      maxPerAccount: 1
    });

    // The event's own limit is 1 and two accounts join anyway: with tickets
    // present, the ticket type's quantity is the only cap (DEC-0023 §4).
    await attendance.setAttendance(guests[0]!, ticketedEventId, 'private');
    await expect(
      attendance.setAttendance(guests[1]!, ticketedEventId, 'private')
    ).resolves.toBeUndefined();
  });

  it('counts an opening without recording anything about who opened it', async () => {
    await console_.recordEventView(openEventId);
    await console_.recordEventView(openEventId);

    const counts = await console_.getEventConsoleCounts(
      openEventId,
      organizerId
    );
    expect(counts?.views.total).toBe(2);
    expect(counts?.views.today).toBe(2);

    // §3's authorisation rests on this table having nowhere to put a person.
    // Asked of the database rather than of the code that writes to it, so a
    // future column cannot be added without this failing.
    const columns = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'event_view_counts'`
    );
    expect(columns.rows.map((row) => row.column_name).sort()).toEqual([
      'event_id',
      'on_day',
      'views'
    ]);
  });

  it('counts both visibilities as coming, and names nobody', async () => {
    const counts = await console_.getEventConsoleCounts(
      cappedEventId,
      organizerId
    );
    expect(counts?.coming).toBe(2);
    expect(counts?.attendanceLimit).toBe(2);
    expect(JSON.stringify(counts)).not.toContain(guests[2]!);
  });

  it('omits the ticket and access blocks where neither applies', async () => {
    const counts = await console_.getEventConsoleCounts(
      openEventId,
      organizerId
    );
    expect(counts?.tickets).toBeUndefined();
    expect(counts?.accessRequests).toBeUndefined();
  });

  it("answers nothing for somebody else's event", async () => {
    await expect(
      console_.getEventConsoleCounts(openEventId, strangerId)
    ).resolves.toBeUndefined();
  });
});
