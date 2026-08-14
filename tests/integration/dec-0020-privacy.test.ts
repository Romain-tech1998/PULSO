import { randomUUID } from 'node:crypto';

import {
  createPool,
  MessageRequestDeclinedError,
  MessageRequestPendingError,
  PostgresMessagesRepository,
  PostgresUserPhotosRepository
} from '@pulso/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * DEC-0020's two real guards, executed against real SQL.
 *
 * The suites in apps/api run against fake repositories: they prove the
 * routes are wired, and prove nothing at all about the two rules that
 * decide who may read a gallery and who may send a message, because both
 * live entirely in SQL. That gap is not hypothetical - the group work found
 * five separate holes hiding in exactly this blind spot.
 *
 * What is pinned here:
 *   - a gallery is readable by its owner and their accepted friends, and by
 *     nobody else, with a stranger's read indistinguishable from an empty
 *     gallery;
 *   - a stranger may send exactly one message, a second is refused, a
 *     decline is permanent, an accept opens the conversation, and a friend
 *     bypasses the gate entirely;
 *   - a message still behind a pending request does not count as unread.
 */
const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('DEC-0020 gallery visibility and message requests', () => {
  let pool: ReturnType<typeof createPool>;
  let photos: PostgresUserPhotosRepository;
  let messages: PostgresMessagesRepository;

  const ownerId = randomUUID();
  const friendId = randomUUID();
  const strangerId = randomUUID();
  const declinedId = randomUUID();
  const userIds = [ownerId, friendId, strangerId, declinedId];

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

  beforeAll(async () => {
    pool = createPool(databaseUrl);
    photos = new PostgresUserPhotosRepository(pool);
    messages = new PostgresMessagesRepository(pool);
    await createUser(ownerId, 'Integration owner');
    await createUser(friendId, 'Integration friend');
    await createUser(strangerId, 'Integration stranger');
    await createUser(declinedId, 'Integration declined');
    await pool.query(
      `INSERT INTO friendships (id, requester_id, addressee_id, status)
       VALUES ($1, $2, $3, 'accepted')`,
      [randomUUID(), ownerId, friendId]
    );
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM user_photos WHERE user_id = ANY($1::uuid[])`,
      [userIds]
    );
    await pool.query(
      `DELETE FROM message_requests WHERE recipient_id = ANY($1::uuid[]) OR sender_id = ANY($1::uuid[])`,
      [userIds]
    );
    await pool.query(
      `DELETE FROM messages WHERE recipient_id = ANY($1::uuid[]) OR sender_id = ANY($1::uuid[])`,
      [userIds]
    );
    await pool.query(
      `DELETE FROM notifications WHERE user_id = ANY($1::uuid[]) OR actor_user_id = ANY($1::uuid[])`,
      [userIds]
    );
    await pool.query(
      `DELETE FROM friendships WHERE requester_id = ANY($1::uuid[]) OR addressee_id = ANY($1::uuid[])`,
      [userIds]
    );
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
    await pool.end();
  });

  it('shows a gallery to its owner and to an accepted friend only', async () => {
    await photos.createPhoto(ownerId, 'user-photos/owner/one.jpg', {
      caption: 'Au Stereo'
    });

    expect(await photos.listPhotos(ownerId, ownerId)).toHaveLength(1);
    expect(await photos.listPhotos(ownerId, friendId)).toHaveLength(1);
    // A stranger gets the same answer an empty gallery gives, which is what
    // stops this being a way to detect who has photos.
    expect(await photos.listPhotos(ownerId, strangerId)).toEqual([]);
  });

  it('stops showing a gallery once the friendship is removed', async () => {
    // Visibility is evaluated per read, not captured when the photo was
    // posted - un-friending has to actually take the photos away.
    const temporaryId = randomUUID();
    await createUser(temporaryId, 'Integration temporary');
    userIds.push(temporaryId);
    await pool.query(
      `INSERT INTO friendships (id, requester_id, addressee_id, status)
       VALUES ($1, $2, $3, 'accepted')`,
      [randomUUID(), temporaryId, ownerId]
    );
    expect(await photos.listPhotos(ownerId, temporaryId)).toHaveLength(1);

    await pool.query(
      `DELETE FROM friendships
       WHERE (requester_id = $1 AND addressee_id = $2)
          OR (requester_id = $2 AND addressee_id = $1)`,
      [temporaryId, ownerId]
    );
    expect(await photos.listPhotos(ownerId, temporaryId)).toEqual([]);
  });

  it('deletes only the caller’s own photo', async () => {
    const photo = await photos.createPhoto(
      ownerId,
      'user-photos/owner/two.jpg',
      {}
    );
    expect(await photos.deletePhoto(photo.id, strangerId)).toBeUndefined();
    expect(await photos.listPhotos(ownerId, ownerId)).toHaveLength(2);
    expect(await photos.deletePhoto(photo.id, ownerId)).toBe(
      'user-photos/owner/two.jpg'
    );
    expect(await photos.listPhotos(ownerId, ownerId)).toHaveLength(1);
  });

  it('lets a stranger send exactly one message, then refuses the second', async () => {
    await messages.sendMessage(strangerId, ownerId, 'On se croise ce soir ?');

    await expect(
      messages.sendMessage(strangerId, ownerId, 'Toujours là ?')
    ).rejects.toBeInstanceOf(MessageRequestPendingError);

    const requests = await messages.getMessageRequests(ownerId);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.sender.id).toBe(strangerId);
    expect(requests[0]!.message?.body).toBe('On se croise ce soir ?');
  });

  it('keeps a message behind a pending request out of the unread count', async () => {
    // DEC-0020 gives a pending request no notification and its own list, so
    // it must not light the Communauté badge either.
    expect(await messages.getUnreadCount(ownerId)).toBe(0);
  });

  it('keeps a pending request out of the inbox until it is accepted', async () => {
    const before = await messages.getConversations(ownerId);
    expect(before.some((entry) => entry.friend.id === strangerId)).toBe(false);

    expect(
      await messages.respondToMessageRequest(ownerId, strangerId, 'accept')
    ).toBe(true);

    const after = await messages.getConversations(ownerId);
    expect(after.some((entry) => entry.friend.id === strangerId)).toBe(true);
    // Accepting is also what makes the waiting message countable.
    expect(await messages.getUnreadCount(ownerId)).toBe(1);
    // The conversation is ordinary now: no second gate.
    await expect(
      messages.sendMessage(strangerId, ownerId, 'Super !')
    ).resolves.toBeDefined();
  });

  it('answers an already-answered request with false rather than flipping it', async () => {
    expect(
      await messages.respondToMessageRequest(ownerId, strangerId, 'decline')
    ).toBe(false);
    const conversations = await messages.getConversations(ownerId);
    expect(conversations.some((entry) => entry.friend.id === strangerId)).toBe(
      true
    );
  });

  it('makes a decline permanent', async () => {
    await messages.sendMessage(declinedId, ownerId, 'Salut');
    expect(
      await messages.respondToMessageRequest(ownerId, declinedId, 'decline')
    ).toBe(true);

    await expect(
      messages.sendMessage(declinedId, ownerId, 'Réponds-moi')
    ).rejects.toBeInstanceOf(MessageRequestDeclinedError);
    // A declined request leaves the Demandes list rather than sitting there
    // asking to be answered again.
    expect(await messages.getMessageRequests(ownerId)).toEqual([]);
  });

  it('lets an accepted friend message without opening a request at all', async () => {
    await expect(
      messages.sendMessage(friendId, ownerId, 'On y va ensemble ?')
    ).resolves.toBeDefined();
    const rows = await pool.query(
      `SELECT 1 FROM message_requests WHERE recipient_id = $1 AND sender_id = $2`,
      [ownerId, friendId]
    );
    expect(rows.rowCount).toBe(0);
  });
});
