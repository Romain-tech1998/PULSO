import { randomUUID } from 'node:crypto';

import {
  createPool,
  GroupNotFoundError,
  NotGroupMemberError,
  NotGroupModeratorError,
  PostgresGroupsRepository
} from '@pulso/database';
import { defaultModulesForGroupType } from '@pulso/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The group suite in apps/api runs against `fakeGroupsRepository`, which
 * proves the routes are wired but never executes a line of the SQL that
 * actually decides who may read what. Every guard asserted here lives in
 * that SQL, and each covers a hole this file was written to close: a
 * non-member could read a group's members, programme, attendance and
 * checklist; anyone could tick a checklist item and skew its real counts;
 * anyone could rewrite any group's module layout; and a `private_invite`
 * crew was both listed in discovery and joinable by anyone holding its id,
 * where DEC-0015 requires the opposite.
 */
const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('group privacy and membership guards', () => {
  let pool: ReturnType<typeof createPool>;
  let repository: PostgresGroupsRepository;

  const creatorId = randomUUID();
  const outsiderId = randomUUID();
  const createdGroupIds: string[] = [];

  const createUser = async (id: string, name: string) => {
    await pool.query(
      `INSERT INTO users (id, email, display_name, google_subject, friend_code)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        `${id}@integration.test`,
        name,
        `integration-${id}`,
        id.replaceAll('-', '').slice(0, 10).toUpperCase()
      ]
    );
  };

  const createGroup = async (
    visibility: 'open' | 'restricted' | 'private_invite'
  ) => {
    const group = await repository.createGroup(
      creatorId,
      `Integration ${visibility} ${randomUUID().slice(0, 8)}`,
      undefined,
      'community',
      visibility,
      defaultModulesForGroupType('community')
    );
    createdGroupIds.push(group.id);
    return group;
  };

  beforeAll(async () => {
    pool = createPool(databaseUrl);
    repository = new PostgresGroupsRepository(pool);
    await createUser(creatorId, 'Integration creator');
    await createUser(outsiderId, 'Integration outsider');
  });

  afterAll(async () => {
    for (const groupId of createdGroupIds) {
      await pool.query(
        `DELETE FROM group_checklist_checks WHERE item_id IN
           (SELECT id FROM group_checklist_items WHERE group_id = $1)`,
        [groupId]
      );
      await pool.query(
        `DELETE FROM group_checklist_items WHERE group_id = $1`,
        [groupId]
      );
      await pool.query(
        `DELETE FROM group_attendance_responses WHERE group_id = $1`,
        [groupId]
      );
      await pool.query(`DELETE FROM group_schedule_items WHERE group_id = $1`, [
        groupId
      ]);
      await pool.query(`DELETE FROM group_memberships WHERE group_id = $1`, [
        groupId
      ]);
      await pool.query(`DELETE FROM group_roles WHERE group_id = $1`, [
        groupId
      ]);
      await pool.query(`DELETE FROM groups WHERE id = $1`, [groupId]);
    }
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [
      [creatorId, outsiderId]
    ]);
    await pool.end();
  });

  it('gates the programme, attendance and checklist behind real membership', async () => {
    const group = await createGroup('restricted');
    await repository.addScheduleItem(
      group.id,
      creatorId,
      'Rendez-vous au bar',
      new Date(Date.now() + 86_400_000).toISOString()
    );
    await repository.addChecklistItem(
      group.id,
      creatorId,
      'Acheter les billets'
    );

    await expect(
      repository.getScheduleItems(group.id, outsiderId)
    ).rejects.toBeInstanceOf(NotGroupMemberError);
    await expect(
      repository.getAttendanceSummary(group.id, outsiderId)
    ).rejects.toBeInstanceOf(NotGroupMemberError);
    await expect(
      repository.getChecklistItems(group.id, outsiderId)
    ).rejects.toBeInstanceOf(NotGroupMemberError);

    // The creator is a member, so the same three reads succeed for them.
    await expect(
      repository.getScheduleItems(group.id, creatorId)
    ).resolves.toHaveLength(1);
    await expect(
      repository.getChecklistItems(group.id, creatorId)
    ).resolves.toHaveLength(1);
  });

  it('refuses a non-member ticking a checklist item, which feeds real counts', async () => {
    const group = await createGroup('open');
    await repository.addChecklistItem(group.id, creatorId, 'Reserver un taxi');
    const [item] = await repository.getChecklistItems(group.id, creatorId);

    await expect(
      repository.toggleChecklistCheck(item!.id, outsiderId, true)
    ).rejects.toBeInstanceOf(NotGroupMemberError);

    const [after] = await repository.getChecklistItems(group.id, creatorId);
    expect(after!.checkedCount).toBe(0);
    expect(after!.totalMembers).toBe(1);
  });

  it('shows an open or restricted group its members, but hides a private crew', async () => {
    const open = await createGroup('open');
    const restricted = await createGroup('restricted');
    const crew = await createGroup('private_invite');

    // DEC-0013 v1.2: restriction gates participation, not visibility.
    await expect(
      repository.getMembers(open.id, outsiderId)
    ).resolves.toHaveLength(1);
    await expect(
      repository.getMembers(restricted.id, outsiderId)
    ).resolves.toHaveLength(1);
    // DEC-0015: a private crew exists only for its own members.
    await expect(
      repository.getMembers(crew.id, outsiderId)
    ).rejects.toBeInstanceOf(NotGroupMemberError);
  });

  it('keeps a private crew out of discovery and unreadable by id', async () => {
    const crew = await createGroup('private_invite');
    const open = await createGroup('open');

    const discovered = await repository.discoverGroups(outsiderId, 'permanent');
    const discoveredIds = discovered.map((entry) => entry.group.id);
    expect(discoveredIds).toContain(open.id);
    expect(discoveredIds).not.toContain(crew.id);

    expect(await repository.getGroup(crew.id, outsiderId)).toBeUndefined();
    // Its own members still read it normally.
    expect(await repository.getGroup(crew.id, creatorId)).toBeDefined();
  });

  it('refuses to let an uninvited account join a private crew', async () => {
    const crew = await createGroup('private_invite');

    await expect(
      repository.joinGroup(crew.id, outsiderId)
    ).rejects.toBeInstanceOf(GroupNotFoundError);

    const members = await repository.getMembers(crew.id, creatorId);
    expect(members.map((member) => member.id)).toEqual([creatorId]);
  });

  it('records a pending request for a restricted group, immediate membership for an open one', async () => {
    const open = await createGroup('open');
    const restricted = await createGroup('restricted');

    expect(await repository.joinGroup(open.id, outsiderId)).toBe('member');
    expect(await repository.joinGroup(restricted.id, outsiderId)).toBe(
      'pending'
    );
  });

  it('lets only the creator reshape the module layout', async () => {
    const group = await createGroup('open');
    const layout = defaultModulesForGroupType('event');

    await expect(
      repository.updateGroupModules(group.id, layout, outsiderId)
    ).rejects.toBeInstanceOf(NotGroupModeratorError);

    await repository.updateGroupModules(group.id, layout, creatorId);
    const updated = await repository.getGroup(group.id, creatorId);
    expect(updated?.modulesConfig).toEqual(layout);
  });
});
