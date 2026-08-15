import { randomUUID } from 'node:crypto';

import { createPool, PostgresImageModerationRepository } from '@pulso/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * DEC-0021's guarantees that live in SQL rather than in a route.
 *
 * The API suite runs against a fake repository: it proves the routes are
 * wired and nothing about the unique index that actually stops one account
 * reporting the same image forever, or about the query that decides what an
 * administrator is shown. Both are here, against real Postgres.
 */
const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('DEC-0021 image moderation storage', () => {
  let pool: ReturnType<typeof createPool>;
  let repository: PostgresImageModerationRepository;

  const owner = randomUUID();
  const reporter = randomUUID();
  const other = randomUUID();
  const userIds = [owner, reporter, other];
  const paths: string[] = [];

  const createUser = async (id: string, name: string) => {
    await pool.query(
      `INSERT INTO users (id, email, display_name, google_subject, friend_code)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
      [
        id,
        `${id}@integration.test`,
        name,
        `integration-${id}`,
        id.replaceAll('-', '').slice(0, 10).toUpperCase()
      ]
    );
  };

  const record = async (status: 'approved' | 'flagged' | 'rejected') => {
    const filePath = `user-photos/${owner}/${randomUUID()}.jpg`;
    paths.push(filePath);
    return repository.record({
      filePath,
      surface: 'user_photo',
      ownerId: owner,
      status,
      provider: 'test',
      scores: { violence: status === 'flagged' ? 0.7 : 0.01 },
      reason: status === 'flagged' ? 'Needs review on violence.' : undefined
    });
  };

  beforeAll(async () => {
    pool = createPool(databaseUrl);
    repository = new PostgresImageModerationRepository(pool);
    await createUser(owner, 'Integration owner');
    await createUser(reporter, 'Integration reporter');
    await createUser(other, 'Integration other');
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM content_reports WHERE reporter_id = ANY($1::uuid[])`,
      [userIds]
    );
    await pool.query(
      `DELETE FROM image_moderations WHERE file_path = ANY($1::text[])`,
      [paths]
    );
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
    await pool.end();
  });

  it('serves only approved paths, whatever else is stored', async () => {
    const approved = await record('approved');
    const flagged = await record('flagged');
    const rejected = await record('rejected');

    const visible = await repository.approvedPaths([
      approved.filePath,
      flagged.filePath,
      rejected.filePath
    ]);

    expect(visible.has(approved.filePath)).toBe(true);
    expect(visible.has(flagged.filePath)).toBe(false);
    expect(visible.has(rejected.filePath)).toBe(false);
  });

  it('puts a flagged image in the queue and keeps an approved one out', async () => {
    const flagged = await record('flagged');
    const approved = await record('approved');

    const queue = await repository.queue();
    const ids = queue.map((entry) => entry.id);

    expect(ids).toContain(flagged.id);
    expect(ids).not.toContain(approved.id);
    const entry = queue.find((item) => item.id === flagged.id)!;
    expect(entry.ownerDisplayName).toBe('Integration owner');
    expect(entry.scores).toEqual({ violence: 0.7 });
  });

  it('refuses a second report from the same account, and counts one', async () => {
    const image = await record('approved');

    expect(await repository.report(image.id, reporter, 'violence')).toBe(true);
    // The unique index is what holds this, not the route asking politely.
    expect(await repository.report(image.id, reporter, 'spam')).toBe(false);
    expect(await repository.report(image.id, other, 'spam')).toBe(true);

    const entry = (await repository.queue()).find(
      (item) => item.id === image.id
    )!;
    expect(entry.reportCount).toBe(2);
    expect(entry.reportReasons.sort()).toEqual(['spam', 'violence']);
  });

  it('raises a reported image into the queue without unpublishing it', async () => {
    // One report is not a verdict: the image stays approved and visible
    // until an administrator says otherwise.
    const image = await record('approved');
    await repository.report(image.id, reporter, 'inappropriate');

    const queue = await repository.queue();
    expect(queue.map((entry) => entry.id)).toContain(image.id);

    const stored = await repository.findByPath(image.filePath);
    expect(stored?.status).toBe('approved');
    const visible = await repository.approvedPaths([image.filePath]);
    expect(visible.has(image.filePath)).toBe(true);
  });

  it('records who settled it, which distinguishes a human decision', async () => {
    const image = await record('flagged');
    const decided = await repository.decide(image.id, other, 'approved');

    expect(decided?.status).toBe('approved');
    expect(decided?.decidedAt).toBeDefined();
    // And it leaves the queue.
    expect((await repository.queue()).map((e) => e.id)).not.toContain(image.id);
  });

  it('keeps the row when an image is rejected, so the attempt stays visible', async () => {
    const image = await record('flagged');
    await repository.decide(image.id, other, 'rejected');

    const stored = await repository.findByPath(image.filePath);
    expect(stored?.status).toBe('rejected');
  });
});
