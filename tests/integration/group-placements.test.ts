import { randomUUID } from 'node:crypto';

import {
  createPool,
  NotGroupMemberError,
  NotGroupModeratorError,
  PostgresGroupsRepository
} from '@pulso/database';
import { defaultModulesForGroupType } from '@pulso/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Paid placement of an event into a group (DEC-0015 §Future monetization).
 *
 * Every rule worth asserting here lives in SQL, so none of it is reachable
 * from the route suite's fake repository: what a group is shown, when a
 * banner stops showing, who may take one down, and which groups are
 * eligible to receive one at all.
 */
const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('group sponsored placements', () => {
  let pool: ReturnType<typeof createPool>;
  let repository: PostgresGroupsRepository;

  const adminId = randomUUID();
  const memberId = randomUUID();
  const outsiderId = randomUUID();
  const venueId = randomUUID();
  const upcomingEventId = randomUUID();
  const pastEventId = randomUUID();
  const groupIds: string[] = [];

  const createUser = async (id: string, name: string) => {
    await pool.query(
      `INSERT INTO users (id, email, display_name, google_subject, friend_code)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
      [
        id,
        `${id}@placement.test`,
        name,
        `placement-${id}`,
        id.replaceAll('-', '').slice(0, 10).toUpperCase()
      ]
    );
  };

  const createEvent = async (id: string, title: string, startsAt: Date) => {
    await pool.query(
      `INSERT INTO events
         (id, venue_id, title, category, starts_at, timezone, source_name,
          source_url, observed_at, price_kind, access_information)
       VALUES ($1, $2, $3, 'nightlife', $4, 'America/Toronto',
               'placement-test', $5, now(), 'unknown', 'Test')
       ON CONFLICT (id) DO NOTHING`,
      [id, venueId, title, startsAt.toISOString(), `https://example.com/${id}`]
    );
  };

  const createGroup = async (
    visibility: 'open' | 'restricted' | 'private_invite',
    creatorId = adminId
  ) => {
    const group = await repository.createGroup(
      creatorId,
      `Placement ${visibility} ${randomUUID().slice(0, 8)}`,
      undefined,
      'community',
      visibility,
      defaultModulesForGroupType('community')
    );
    groupIds.push(group.id);
    return group;
  };

  beforeAll(async () => {
    pool = createPool(databaseUrl);
    repository = new PostgresGroupsRepository(pool);
    await createUser(adminId, 'Placement admin');
    await createUser(memberId, 'Placement member');
    await createUser(outsiderId, 'Placement outsider');
    await pool.query(
      `INSERT INTO venues (id, name, address, location)
       VALUES ($1, 'Placement Venue', '1 rue Test, Montréal',
               ST_SetSRID(ST_MakePoint(-73.57, 45.50), 4326))
       ON CONFLICT (id) DO NOTHING`,
      [venueId]
    );
    await createEvent(
      upcomingEventId,
      'Soirée sponsorisée',
      new Date(Date.now() + 14 * 86_400_000)
    );
    await createEvent(
      pastEventId,
      'Soirée déjà passée',
      new Date(Date.now() - 3 * 86_400_000)
    );
  });

  afterAll(async () => {
    for (const groupId of groupIds) {
      await pool.query(
        `DELETE FROM group_sponsored_placements WHERE group_id = $1`,
        [groupId]
      );
      await pool.query(`DELETE FROM group_posts WHERE group_id = $1`, [groupId]);
      await pool.query(`DELETE FROM group_channels WHERE group_id = $1`, [
        groupId
      ]);
      await pool.query(`DELETE FROM group_memberships WHERE group_id = $1`, [
        groupId
      ]);
      await pool.query(`DELETE FROM group_roles WHERE group_id = $1`, [groupId]);
      await pool.query(`DELETE FROM groups WHERE id = $1`, [groupId]);
    }
    await pool.query(`DELETE FROM events WHERE id = ANY($1::uuid[])`, [
      [upcomingEventId, pastEventId]
    ]);
    await pool.query(`DELETE FROM venues WHERE id = $1`, [venueId]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [
      [adminId, memberId, outsiderId]
    ]);
    await pool.end();
  });

  const place = (groupId: string, eventId: string, sponsorName = 'Clébard') =>
    repository.createPlacement({
      groupId,
      eventId,
      sponsorName,
      message: 'Entrée gratuite avant 23h.',
      endsAt: undefined,
      placedBy: adminId
    });

  it('shows a placed event to the group members, labelled with who paid', async () => {
    const group = await createGroup('open');
    await place(group.id, upcomingEventId);

    const shown = await repository.listGroupPlacements(group.id, adminId);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.sponsorName).toBe('Clébard');
    expect(shown[0]!.event.title).toBe('Soirée sponsorisée');
    expect(shown[0]!.event.venueName).toBe('Placement Venue');
  });

  it('never shows a group its placements to someone who is not in it', async () => {
    const group = await createGroup('restricted');
    await place(group.id, upcomingEventId);

    await expect(
      repository.listGroupPlacements(group.id, outsiderId)
    ).rejects.toBeInstanceOf(NotGroupMemberError);
  });

  it('stops showing a banner once its event has started', async () => {
    const group = await createGroup('open');
    // No explicit ends_at, so the event's own start time is the deadline: a
    // banner for last week's party is worse than no banner.
    await place(group.id, pastEventId);

    expect(await repository.listGroupPlacements(group.id, adminId)).toEqual([]);
  });

  it('lets only the group moderator take a banner down', async () => {
    const group = await createGroup('open');
    await place(group.id, upcomingEventId);
    await repository.joinGroup(group.id, memberId);

    await expect(
      repository.dismissPlacement(
        group.id,
        (await repository.listGroupPlacements(group.id, adminId))[0]!.id,
        memberId
      )
    ).rejects.toBeInstanceOf(NotGroupModeratorError);

    const [live] = await repository.listGroupPlacements(group.id, adminId);
    await repository.dismissPlacement(group.id, live!.id, adminId);
    expect(await repository.listGroupPlacements(group.id, adminId)).toEqual([]);
  });

  it('records a dismissal for the delivery report rather than deleting it', async () => {
    const group = await createGroup('open');
    await place(group.id, upcomingEventId, 'Le Ritz');
    const [live] = await repository.listGroupPlacements(group.id, adminId);
    await repository.dismissPlacement(group.id, live!.id, adminId);

    const reported = (await repository.listAllPlacements()).find(
      (entry) => entry.placement.id === live!.id
    );
    expect(reported).toBeDefined();
    expect(reported!.groupName).toBe(
      (await repository.getGroup(group.id, adminId))!.name
    );
    // What the seller needs to know: it was delivered, and then pulled.
    expect(reported!.dismissedAt).toBeDefined();
  });

  it('never offers a private crew as inventory', async () => {
    const open = await createGroup('open');
    const crew = await createGroup('private_invite');

    const found = await repository.searchGroups('Placement');
    const foundIds = found.map((entry) => entry.id);
    expect(foundIds).toContain(open.id);
    // A private crew is invisible by design; placing a paid banner in one
    // would expose it to whoever bought the package.
    expect(foundIds).not.toContain(crew.id);
  });
});
