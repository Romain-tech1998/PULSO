import { randomUUID } from 'node:crypto';

import {
  ConversationFullError,
  ConversationNotFoundError,
  createPool,
  ParticipantNotReachableError,
  PostgresConversationsRepository
} from '@pulso/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * DEC-0025, against real SQL.
 *
 * The rules that matter here are all access rules — who may be added, who may
 * read, who gets notified — and every one of them lives in a WHERE clause. A
 * fake repository would assert that the code I wrote does what I think it
 * does, which is not the question.
 */
const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('DEC-0025 conversations', () => {
  let pool: ReturnType<typeof createPool>;
  let rooms: PostgresConversationsRepository;

  const alice = randomUUID();
  const bob = randomUUID();
  const carol = randomUUID();
  const stranger = randomUUID();
  const crowd = Array.from({ length: 22 }, () => randomUUID());
  const userIds = [alice, bob, carol, stranger, ...crowd];
  const createdRooms: string[] = [];

  const createUser = async (id: string) => {
    await pool.query(
      `INSERT INTO users (id, email, display_name, google_subject, friend_code)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        `${id}@integration.test`,
        `Conv ${id.slice(0, 8)}`,
        `integration-${id}`,
        id.replaceAll('-', '').slice(0, 10).toUpperCase()
      ]
    );
  };

  const befriend = async (a: string, b: string) => {
    await pool.query(
      `INSERT INTO friendships (id, requester_id, addressee_id, status)
       VALUES (gen_random_uuid(), $1, $2, 'accepted')
       ON CONFLICT DO NOTHING`,
      [a, b]
    );
  };

  beforeAll(async () => {
    pool = createPool(databaseUrl);
    rooms = new PostgresConversationsRepository(pool);
    for (const id of userIds) await createUser(id);
    await befriend(alice, bob);
    await befriend(alice, carol);
    for (const id of crowd) await befriend(alice, id);
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM messages WHERE conversation_id = ANY($1::uuid[])`,
      [createdRooms]
    );
    await pool.query(`DELETE FROM conversations WHERE id = ANY($1::uuid[])`, [
      createdRooms
    ]);
    await pool.query(
      `DELETE FROM friendships WHERE requester_id = ANY($1::uuid[]) OR addressee_id = ANY($1::uuid[])`,
      [userIds]
    );
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
    await pool.end();
  });

  const open = async (participants: string[], title?: string) => {
    const id = await rooms.createConversation(alice, participants, title);
    createdRooms.push(id);
    return id;
  };

  it('opens a room and gives everyone in it the same history', async () => {
    const id = await open([bob, carol], 'Vendredi');
    await rooms.sendMessage(id, alice, 'On se retrouve où ?');
    await rooms.sendMessage(id, bob, 'Chez moi à 21h');

    const asCarol = await rooms.getMessages(id, carol);
    expect(asCarol.map((m) => m.body)).toEqual([
      'On se retrouve où ?',
      'Chez moi à 21h'
    ]);
  });

  it('refuses to add someone the adder could not already message', async () => {
    await expect(open([stranger])).rejects.toBeInstanceOf(
      ParticipantNotReachableError
    );
  });

  it('refuses a twenty-first participant', async () => {
    await expect(open(crowd)).rejects.toBeInstanceOf(ConversationFullError);
  });

  it('counts unread per participant, and clears it for the reader alone', async () => {
    const id = await open([bob, carol]);
    await rooms.sendMessage(id, alice, 'Trois messages');
    await rooms.sendMessage(id, alice, 'Pour vous deux');

    const bobBefore = (await rooms.listConversations(bob)).find(
      (room) => room.id === id
    );
    expect(bobBefore?.unreadCount).toBe(2);

    await rooms.markRead(id, bob);

    const bobAfter = (await rooms.listConversations(bob)).find(
      (room) => room.id === id
    );
    const carolAfter = (await rooms.listConversations(carol)).find(
      (room) => room.id === id
    );
    expect(bobAfter?.unreadCount).toBe(0);
    expect(carolAfter?.unreadCount).toBe(2);
  });

  it('keeps what someone wrote after they leave, and stops showing them the room', async () => {
    const id = await open([bob, carol]);
    await rooms.sendMessage(id, carol, 'Je vous laisse organiser');
    await rooms.leaveConversation(id, carol);

    const stillThere = await rooms.getMessages(id, bob);
    expect(stillThere.map((m) => m.body)).toContain('Je vous laisse organiser');

    const carolInbox = await rooms.listConversations(carol);
    expect(carolInbox.map((room) => room.id)).not.toContain(id);

    await expect(rooms.getMessages(id, carol)).rejects.toBeInstanceOf(
      ConversationNotFoundError
    );
  });

  it('notifies a room once until it has been read', async () => {
    const id = await open([bob, carol]);
    await rooms.sendMessage(id, alice, 'Premier');
    const first = await rooms.participantsToNotify(id, alice);
    expect(first.sort()).toEqual([bob, carol].sort());

    // Second message, nobody has read anything: §8 keeps the room quiet.
    await rooms.sendMessage(id, alice, 'Deuxième');
    expect(await rooms.participantsToNotify(id, alice)).toEqual([]);

    await rooms.markRead(id, bob);
    await rooms.sendMessage(id, alice, 'Troisième');
    expect(await rooms.participantsToNotify(id, alice)).toEqual([bob]);
  });

  it('notifies nobody in a muted room, and still counts it unread', async () => {
    const id = await open([bob]);
    await rooms.setMuted(id, bob, true);
    await rooms.sendMessage(id, alice, 'Silencieux');

    expect(await rooms.participantsToNotify(id, alice)).toEqual([]);
    const inbox = (await rooms.listConversations(bob)).find(
      (room) => room.id === id
    );
    expect(inbox?.unreadCount).toBe(1);
    expect(inbox?.muted).toBe(true);
  });

  it('puts a pinned room first, whatever its last message', async () => {
    const older = await open([bob]);
    await rooms.sendMessage(older, alice, 'Ancien');
    const newer = await open([carol]);
    await rooms.sendMessage(newer, alice, 'Récent');

    await rooms.setPinned(older, alice, true);
    const inbox = await rooms.listConversations(alice);
    expect(inbox[0]?.id).toBe(older);
  });

  it('searches inside the reader’s own rooms, and nowhere else', async () => {
    const mine = await open([bob]);
    await rooms.sendMessage(mine, alice, 'Rendez-vous à la Société');

    const found = await rooms.search(alice, 'societe');
    expect(found.map((hit) => hit.message.body)).toContain(
      'Rendez-vous à la Société'
    );

    // Carol is not in that room, so the same query finds nothing of it.
    const nothing = await rooms.search(carol, 'societe');
    expect(nothing.map((hit) => hit.conversationId)).not.toContain(mine);
  });

  it('carries an attachment with its message', async () => {
    const id = await open([bob]);
    const sent = await rooms.sendMessage(id, alice, 'Regarde', [
      { filePath: 'messages/x.jpg', mimeType: 'image/jpeg', byteSize: 4096 }
    ]);
    expect(sent.attachments).toHaveLength(1);

    const read = await rooms.getMessages(id, bob);
    const withFile = read.find((message) => message.id === sent.id);
    expect(withFile?.attachments[0]?.filePath).toBe('messages/x.jpg');
  });
});
