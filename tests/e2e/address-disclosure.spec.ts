import {
  createPool,
  PostgresEventAccessRepository,
  PostgresEventRepository
} from '@pulso/database';
import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

/**
 * DEC-0022 §6 and DEC-0023 §5, through a real browser with a real session.
 *
 * This exists because of a bug nothing else could have caught. `GET
 * /events/:id` reads the bearer and passes the viewer down to SQL exactly as
 * the decision requires, and the integration suite proved it. One client call
 * site — `openDetails`, the one behind this very `?eventId=` link — asked
 * anonymously, so everything the API decides *about the reader* came back as
 * if there were no reader: an approved visitor was offered the request they
 * had already had granted, and an organizer was offered it on their own event.
 *
 * An API test cannot see that, and an anonymous e2e cannot either. The gap was
 * a browser holding a token, which is what this file is.
 */
const databaseUrl = process.env.DATABASE_URL;

const HIDDEN_ADDRESS = '4242 rue de la Divulgation, Montréal';
const REQUEST_LABEL = /Demander l.adresse|Ask for the address/;

test.describe('DEC-0022 §6 address disclosure, as a signed-in reader', () => {
  test.skip(
    !databaseUrl,
    'Needs the database the API is serving; CI provides it.'
  );

  let pool: ReturnType<typeof createPool>;
  let events: PostgresEventRepository;
  let access: PostgresEventAccessRepository;

  const organizerId = randomUUID();
  const visitorId = randomUUID();
  const organizerToken = `e2e-${randomUUID()}`;
  const visitorToken = `e2e-${randomUUID()}`;
  let eventId: string;
  let venueId: string;

  /** A session row is the only way in: sign-in is Google's, not ours to drive. */
  const createUserWithSession = async (id: string, token: string) => {
    await pool.query(
      `INSERT INTO users (id, email, display_name, google_subject, friend_code)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        `${id}@e2e.test`,
        `E2E ${id.slice(0, 8)}`,
        `e2e-${id}`,
        id.replaceAll('-', '').slice(0, 10).toUpperCase()
      ]
    );
    await pool.query(
      `INSERT INTO sessions (token, user_id, expires_at)
       VALUES ($1, $2, now() + interval '1 hour')`,
      [token, id]
    );
  };

  const openEventAs = async (page: Page, token: string) => {
    await page.goto('/');
    await page.evaluate((value) => {
      window.localStorage.clear();
      window.localStorage.setItem('pulso-auth-token', value);
      // Clearing storage also wipes the first-visit tour's marker, which then
      // opens over the record and swallows the assertion. Marked complete
      // rather than dismissed: this file is about disclosure, not onboarding.
      window.localStorage.setItem('pulso.onboarding.web.v1', 'complete');
    }, token);
    // The deep link is the call site that carried the bug.
    await page.goto(`/?eventId=${eventId}`);
    await expect(
      page.getByLabel(/Event Details|Détails de l.événement/)
    ).toBeVisible({ timeout: 30_000 });
  };

  /**
   * What the API tells *this* browser, asked with the same token the app
   * holds. Asserted alongside the rendering so a failure names its half: the
   * server withholding, or the client failing to show what it was given.
   *
   * This exists because the first CI run failed here and the log could only
   * say "element not found" - true of a withheld address and of a rendering
   * bug alike, and the two need different fixes.
   */
  const addressAccordingToApi = async (page: Page, token: string) =>
    page.evaluate(
      async ([id, bearer]) => {
        const response = await fetch(`http://127.0.0.1:3001/events/${id}`, {
          headers: { authorization: `Bearer ${bearer}` }
        });
        const body = await response.json();
        return {
          status: response.status,
          address: body?.data?.venue?.address ?? null,
          access: body?.data?.myAccessStatus ?? null
        };
      },
      [eventId, token] as const
    );

  test.beforeAll(async () => {
    pool = createPool(databaseUrl);
    events = new PostgresEventRepository(pool);
    access = new PostgresEventAccessRepository(pool);

    await createUserWithSession(organizerId, organizerToken);
    await createUserWithSession(visitorId, visitorToken);

    const created = await events.createEvent(organizerId, {
      title: 'Soirée à adresse retenue',
      category: 'nightlife',
      startsAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
      accessInformation: 'Adresse communiquée après validation.',
      isAfter: false,
      addressDisclosure: 'on_approval',
      price: { kind: 'free' },
      venue: {
        kind: 'new',
        name: 'Chez E2E',
        address: HIDDEN_ADDRESS,
        point: { longitude: -73.57, latitude: 45.52 }
      }
    });
    eventId = created.id;
    venueId = created.venue.id;
  });

  test.afterAll(async () => {
    await pool.query(`DELETE FROM event_access_requests WHERE event_id = $1`, [
      eventId
    ]);
    await pool.query(`DELETE FROM events WHERE id = $1`, [eventId]);
    await pool.query(`DELETE FROM venues WHERE id = $1`, [venueId]);
    await pool.query(`DELETE FROM sessions WHERE user_id = ANY($1::uuid[])`, [
      [organizerId, visitorId]
    ]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [
      [organizerId, visitorId]
    ]);
    await pool.end();
  });

  test('the organizer sees the address of their own event, and is never asked for it', async ({
    page
  }) => {
    await openEventAs(page, organizerToken);

    // The server's half first: an owner is always shown their own address.
    expect(await addressAccordingToApi(page, organizerToken)).toMatchObject({
      status: 200,
      address: HIDDEN_ADDRESS
    });

    // DEC-0023 §1 lands the owner on their console; the address is on the
    // public tab beside it, which is exactly where a visitor would read it.
    await page
      .getByLabel(/Event Details|Détails de l.événement/)
      .getByRole('button', { name: /^À propos$/ })
      .click();

    await expect(page.getByText(HIDDEN_ADDRESS)).toBeVisible();
    // DEC-0023 §5: withholding an address from the person who chose to
    // withhold it is the symptom this whole file was written for.
    await expect(page.getByRole('button', { name: REQUEST_LABEL })).toHaveCount(
      0
    );
  });

  test('a visitor who has not asked gets no address, and is offered the request', async ({
    page
  }) => {
    await openEventAs(page, visitorToken);

    await expect(page.getByText(HIDDEN_ADDRESS)).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: REQUEST_LABEL })
    ).toBeVisible();
  });

  test('an approved visitor sees the address, and is not asked again', async ({
    page
  }) => {
    await access.request(eventId, visitorId, undefined);
    const decided = await access.resolve(
      eventId,
      visitorId,
      'approved',
      organizerId
    );
    // Asserted rather than assumed: a resolve that decided nothing would leave
    // the address withheld, and the test below would fail for a reason that
    // has nothing to do with the client.
    expect(decided).toBe(true);

    await openEventAs(page, visitorToken);

    expect(await addressAccordingToApi(page, visitorToken)).toMatchObject({
      status: 200,
      address: HIDDEN_ADDRESS,
      access: 'approved'
    });

    await expect(page.getByText(HIDDEN_ADDRESS)).toBeVisible();
    await expect(page.getByRole('button', { name: REQUEST_LABEL })).toHaveCount(
      0
    );
  });
});
