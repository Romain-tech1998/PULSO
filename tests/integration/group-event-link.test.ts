import { randomUUID } from 'node:crypto';

import {
  createPool,
  EventGroupExistsError,
  PostgresGroupsRepository
} from '@pulso/database';
import { defaultModulesForGroupType } from '@pulso/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Creating a group *for* a real event, from the create form rather than from
 * the event page's "Rencontrer avant l'événement" button.
 *
 * The type "Sortie" already existed and already said "une soirée précise",
 * but nothing behind it pointed at one: the only writer of groups.event_id
 * was findOrCreateEventGroup, which names the group itself. So a group
 * created as a Sortie was an outing in name only - absent from the
 * directory's Événements tab, and opening on a placeholder programme.
 *
 * All of it lives in SQL and none of it is reachable from the route suite's
 * fake repository: the one-group-per-event index, the first outing being
 * seeded from the event, and the group coming back with its event attached
 * rather than with the nulls the insert's own RETURNING projection would
 * have given it.
 *
 * Each test gets an event of its own, because the rule under test is that a
 * second group cannot have the same one.
 */
const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('a group created for a real event', () => {
  let pool: ReturnType<typeof createPool>;
  let repository: PostgresGroupsRepository;

  const creatorId = randomUUID();
  const venueId = randomUUID();
  const eventIds: string[] = [];
  const groupIds: string[] = [];
  const startsAt = new Date(Date.now() + 10 * 86_400_000);

  /** A fresh event, so one test's group never occupies another's slot. */
  const createEvent = async (title: string) => {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events
         (id, venue_id, title, category, starts_at, timezone, source_name,
          source_url, observed_at, price_kind, access_information)
       VALUES ($1, $2, $3, 'nightlife', $4, 'America/Toronto',
               'event-link-test', $5, now(), 'unknown', 'Test')`,
      [id, venueId, title, startsAt.toISOString(), `https://example.com/${id}`]
    );
    eventIds.push(id);
    return id;
  };

  const createEventGroup = async (name: string, eventId: string) => {
    const group = await repository.createGroup(
      creatorId,
      name,
      undefined,
      'event',
      'open',
      defaultModulesForGroupType('event'),
      eventId
    );
    groupIds.push(group.id);
    return group;
  };

  beforeAll(async () => {
    pool = createPool(databaseUrl);
    repository = new PostgresGroupsRepository(pool);
    await pool.query(
      `INSERT INTO users (id, email, display_name, google_subject, friend_code)
       VALUES ($1, $2, 'Event link creator', $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [
        creatorId,
        `${creatorId}@event-link.test`,
        `event-link-${creatorId}`,
        creatorId.replaceAll('-', '').slice(0, 10).toUpperCase()
      ]
    );
    await pool.query(
      `INSERT INTO venues (id, name, address, location)
       VALUES ($1, 'Event Link Venue', '2 rue Test, Montréal',
               ST_SetSRID(ST_MakePoint(-73.57, 45.5), 4326))
       ON CONFLICT (id) DO NOTHING`,
      [venueId]
    );
  });

  afterAll(async () => {
    for (const groupId of groupIds) {
      await pool.query(`DELETE FROM group_posts WHERE group_id = $1`, [
        groupId
      ]);
      await pool.query(`DELETE FROM group_channels WHERE group_id = $1`, [
        groupId
      ]);
      await pool.query(`DELETE FROM group_memberships WHERE group_id = $1`, [
        groupId
      ]);
      await pool.query(`DELETE FROM group_roles WHERE group_id = $1`, [
        groupId
      ]);
      await pool.query(`DELETE FROM group_outings WHERE group_id = $1`, [
        groupId
      ]);
      await pool.query(`DELETE FROM groups WHERE id = $1`, [groupId]);
    }
    await pool.query(`DELETE FROM events WHERE id = ANY($1::uuid[])`, [
      eventIds
    ]);
    await pool.query(`DELETE FROM venues WHERE id = $1`, [venueId]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [creatorId]);
    await pool.end();
  });

  it('comes back with its event attached, under the name its creator chose', async () => {
    const eventId = await createEvent('Nuit Techno');
    const group = await createEventGroup('La bande du jeudi', eventId);

    expect(group.name).toBe('La bande du jeudi');
    expect(group.eventId).toBe(eventId);
    // The insert's own RETURNING clause cannot see the events table, so
    // these two are the proof the group is read back through the canonical
    // projection rather than the literal one beside it.
    expect(group.eventTitle).toBe('Nuit Techno');
    expect(group.eventStartsAt).toBe(startsAt.toISOString());
  });

  it('opens on the event rather than on a placeholder outing', async () => {
    const eventId = await createEvent('Jazz sur le toit');
    const group = await createEventGroup('Le crew de la nuit', eventId);

    const outings = await pool.query<{
      event_id: string | null;
      title: string;
    }>(`SELECT event_id, title FROM group_outings WHERE group_id = $1`, [
      group.id
    ]);
    expect(outings.rows).toHaveLength(1);
    expect(outings.rows[0]?.event_id).toBe(eventId);
    expect(outings.rows[0]?.title).toBe('Jazz sur le toit');
  });

  it('refuses a second group for the same event, naming the first', async () => {
    const eventId = await createEvent('Soirée déjà prise');
    const first = await createEventGroup('Le premier groupe', eventId);

    // The id matters as much as the refusal: it is what lets the interface
    // send the caller to the group that exists instead of only saying no.
    await expect(
      createEventGroup('Le deuxième groupe', eventId)
    ).rejects.toMatchObject({ groupId: first.id });
    await expect(
      createEventGroup('Le troisième groupe', eventId)
    ).rejects.toBeInstanceOf(EventGroupExistsError);
  });
});
