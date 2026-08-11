import { randomUUID } from 'node:crypto';

import {
  createPool,
  GroupNotFoundError,
  NotChannelWriterError,
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
        `DELETE FROM group_post_likes WHERE post_id IN
           (SELECT id FROM group_posts WHERE group_id = $1)`,
        [groupId]
      );
      await pool.query(`DELETE FROM group_posts WHERE group_id = $1`, [
        groupId
      ]);
      await pool.query(`DELETE FROM group_channels WHERE group_id = $1`, [
        groupId
      ]);
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
      await pool.query(`DELETE FROM group_outings WHERE group_id = $1`, [
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

  it('gives a new community group its general and announcements threads', async () => {
    const group = await createGroup('open');
    const channels = await repository.listChannels(group.id, creatorId);

    expect(channels.map((channel) => channel.name)).toEqual([
      'Général',
      'Annonces'
    ]);
    // Announcements is readable by all, writable by the moderator alone.
    expect(channels.map((channel) => channel.staffOnly)).toEqual([false, true]);
  });

  it('lets only the moderator write in an announcements thread', async () => {
    const group = await createGroup('open');
    await repository.joinGroup(group.id, outsiderId);
    const [general, announcements] = await repository.listChannels(
      group.id,
      creatorId
    );

    // A plain member writes in the general thread just fine.
    await expect(
      repository.createPost(
        group.id,
        outsiderId,
        'On se retrouve où ?',
        undefined,
        general!.id
      )
    ).resolves.toBeDefined();

    await expect(
      repository.createPost(
        group.id,
        outsiderId,
        'Annonce non autorisée',
        undefined,
        announcements!.id
      )
    ).rejects.toBeInstanceOf(NotChannelWriterError);

    await expect(
      repository.createPost(
        group.id,
        creatorId,
        'Prochaine sortie samedi.',
        undefined,
        announcements!.id
      )
    ).resolves.toBeDefined();
  });

  it('keeps each thread to its own posts, and replies with their parent', async () => {
    const group = await createGroup('open');
    const [general, announcements] = await repository.listChannels(
      group.id,
      creatorId
    );
    const parent = await repository.createPost(
      group.id,
      creatorId,
      'Sujet du fil général',
      undefined,
      general!.id
    );
    await repository.createPost(
      group.id,
      creatorId,
      'Annonce officielle',
      undefined,
      announcements!.id
    );
    // A reply names no channel and must land with its parent, not in the
    // group's first thread by default.
    const reply = await repository.createPost(
      group.id,
      creatorId,
      'Réponse',
      parent.id,
      announcements!.id
    );
    expect(reply.channelId).toBe(general!.id);

    const generalPosts = await repository.getPosts(
      group.id,
      creatorId,
      general!.id
    );
    expect(generalPosts).toHaveLength(2);
    const announcementPosts = await repository.getPosts(
      group.id,
      creatorId,
      announcements!.id
    );
    expect(announcementPosts).toHaveLength(1);
    // Asking for no channel still returns the whole group, unchanged from
    // the pre-channel behaviour.
    expect(await repository.getPosts(group.id, creatorId)).toHaveLength(3);
  });

  it('refuses to delete a group last remaining thread', async () => {
    const group = await createGroup('open');
    const channels = await repository.listChannels(group.id, creatorId);
    for (const channel of channels) {
      await repository.deleteChannel(group.id, channel.id, creatorId);
    }
    const left = await repository.listChannels(group.id, creatorId);
    expect(left).toHaveLength(1);
  });

  it('publishes an outing with empty modules, keeping the previous one', async () => {
    const group = await createGroup('open');
    await repository.addScheduleItem(
      group.id,
      creatorId,
      'Apéro chez Marie',
      new Date(Date.now() + 86_400_000).toISOString()
    );
    await repository.addChecklistItem(group.id, creatorId, 'Prendre du cash');
    await repository.setAttendanceResponse(group.id, creatorId, 'yes');

    expect(await repository.getScheduleItems(group.id, creatorId)).toHaveLength(
      1
    );
    expect(
      (await repository.getAttendanceSummary(group.id, creatorId)).yes
    ).toBe(1);

    const next = await repository.startOuting(group.id, creatorId, {
      title: 'Sortie de la semaine suivante'
    });

    // The whole point: week two opens clean.
    expect(await repository.getScheduleItems(group.id, creatorId)).toEqual([]);
    expect(await repository.getChecklistItems(group.id, creatorId)).toEqual([]);
    const attendance = await repository.getAttendanceSummary(
      group.id,
      creatorId
    );
    expect(attendance.yes).toBe(0);
    expect(attendance.myResponse).toBeUndefined();

    // And week one is still there: outings coexist, the older one simply
    // falls down the feed rather than being closed.
    const outings = await repository.listOutings(group.id, creatorId);
    expect(outings).toHaveLength(2);
    expect(outings.map((outing) => outing.id)).toContain(next.id);
    expect(outings.every((outing) => !outing.archivedAt)).toBe(true);
  });

  it('publishes each outing into the feed as a post', async () => {
    const group = await createGroup('open');
    await repository.startOuting(group.id, creatorId, {
      title: 'Ce soir au Bal du Lezard',
      place: 'Le Bal du Lezard'
    });

    // An outing is a post, so it inherits replies, likes and reporting
    // instead of needing its own copy of each.
    const feed = await repository.getPosts(group.id, creatorId);
    const outingPosts = feed.filter((post) => post.kind === 'outing');
    expect(outingPosts).toHaveLength(1);
    expect(outingPosts[0]!.body).toBe('Ce soir au Bal du Lezard');
  });

  it('lets the same member answer each outing separately', async () => {
    const group = await createGroup('open');
    await repository.setAttendanceResponse(group.id, creatorId, 'no');
    await repository.startOuting(group.id, creatorId, { title: 'La suivante' });

    // Keyed on the group, this second answer was impossible.
    await repository.setAttendanceResponse(group.id, creatorId, 'yes');
    const summary = await repository.getAttendanceSummary(group.id, creatorId);
    expect(summary.yes).toBe(1);
    expect(summary.no).toBe(0);
  });

  it('lets any member publish an outing, and lets several coexist', async () => {
    const group = await createGroup('open');
    await repository.joinGroup(group.id, outsiderId);

    // Participatory: a plain member proposes a night out without needing
    // the moderator, and without cancelling anyone else's.
    await repository.startOuting(group.id, outsiderId, {
      title: 'Samedi au Stereo'
    });
    await repository.startOuting(group.id, creatorId, {
      title: 'Ce soir au Bal du Lezard'
    });

    const outings = await repository.listOutings(group.id, creatorId);
    expect(outings).toHaveLength(3);
    expect(outings.every((outing) => !outing.archivedAt)).toBe(true);
  });

  it('refuses to publish an outing in a group the author has not joined', async () => {
    const group = await createGroup('restricted');
    await expect(
      repository.startOuting(group.id, outsiderId, { title: 'Pas permis' })
    ).rejects.toBeInstanceOf(NotGroupMemberError);
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
