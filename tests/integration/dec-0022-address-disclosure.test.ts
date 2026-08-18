import { randomUUID } from 'node:crypto';

import {
  createPool,
  DirectoryVenueCannotHideAddressError,
  EventAccessDeclinedError,
  PostgresEventAccessRepository,
  PostgresEventRepository
} from '@pulso/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * DEC-0022 §6, executed against real SQL.
 *
 * These are exactly the guarantees the previous attempt failed to make.
 * DEC-0017 v1.2's `address_hidden` was enforced by `explore-map.tsx`
 * declining to render a field, while the repository selected `v.address` and
 * returned it - with the exact coordinates - to every caller including an
 * anonymous one. A route test against a fake repository would have passed
 * the whole time.
 *
 * What is pinned here:
 *   - a non-approved reader receives neither the street line nor the true
 *     point, and an approved one receives both (criteria 9 and 10);
 *   - the offset point is identical across repeated reads, so asking many
 *     times does not converge on the real location;
 *   - a decline is final and cannot be re-requested or re-approved
 *     (criterion 11);
 *   - the venue row carrying a private address stays out of venue search,
 *     which is the second, independent way the address used to escape.
 */
const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const EXACT_LONGITUDE = -73.5712;
const EXACT_LATITUDE = 45.5254;
const EXACT_ADDRESS = '4321 rue Intégration, Montréal';

describeWithDatabase('DEC-0022 address disclosure on approval', () => {
  let pool: ReturnType<typeof createPool>;
  let events: PostgresEventRepository;
  let access: PostgresEventAccessRepository;

  const organizerId = randomUUID();
  const approvedId = randomUUID();
  const declinedId = randomUUID();
  const strangerId = randomUUID();
  const userIds = [organizerId, approvedId, declinedId, strangerId];

  let privateEventId: string;
  let privateVenueId: string;
  const directoryVenueId = randomUUID();

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
    events = new PostgresEventRepository(pool);
    access = new PostgresEventAccessRepository(pool);
    await createUser(organizerId, 'Integration organizer');
    await createUser(approvedId, 'Integration approved');
    await createUser(declinedId, 'Integration declined');
    await createUser(strangerId, 'Integration stranger');

    // A venue already in the directory, used to prove an existing venue
    // cannot retroactively withhold an address it has already published.
    await pool.query(
      `INSERT INTO venues (id, name, address, location, category)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), 'bar')`,
      [
        directoryVenueId,
        'Intégration Bar Public',
        '999 rue Publique, Montréal',
        -73.58,
        45.51
      ]
    );

    const created = await events.createEvent(organizerId, {
      title: 'After intégration',
      category: 'nightlife',
      startsAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
      accessInformation: 'Sonner deux fois.',
      isAfter: true,
      addressDisclosure: 'on_approval',
      price: { kind: 'free' },
      venue: {
        kind: 'new',
        name: 'Loft intégration',
        address: EXACT_ADDRESS,
        point: { longitude: EXACT_LONGITUDE, latitude: EXACT_LATITUDE }
      }
    });
    privateEventId = created.id;
    privateVenueId = created.venue.id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM event_access_requests WHERE event_id = $1`, [
      privateEventId
    ]);
    await pool.query(
      `DELETE FROM notifications WHERE user_id = ANY($1::uuid[]) OR actor_user_id = ANY($1::uuid[])`,
      [userIds]
    );
    await pool.query(
      `DELETE FROM events WHERE created_by_user_id = ANY($1::uuid[])`,
      [userIds]
    );
    await pool.query(`DELETE FROM venues WHERE id = ANY($1::uuid[])`, [
      [privateVenueId, directoryVenueId]
    ]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
    await pool.end();
  });

  it('gives the organizer the exact address and point', async () => {
    const event = await events.findById(privateEventId, organizerId);
    expect(event?.venue.address).toBe(EXACT_ADDRESS);
    expect(event?.venue.point.longitude).toBeCloseTo(EXACT_LONGITUDE, 6);
    expect(event?.venue.point.latitude).toBeCloseTo(EXACT_LATITUDE, 6);
    expect(event?.locationPrecision).toBeUndefined();
  });

  it('withholds both the street line and the true point from everyone else', async () => {
    for (const viewer of [null, strangerId]) {
      const event = await events.findById(privateEventId, viewer);
      expect(event).toBeDefined();
      // Absent, not blank: a consumer cannot render it by accident.
      expect(event?.venue.address).toBeUndefined();
      expect(event?.addressDisclosure).toBe('on_approval');
      expect(event?.locationPrecision).toBe('approximate');
      // Far enough that the building is not identifiable, close enough that
      // the neighbourhood still is.
      const metres = await distanceFromTruth(event!.venue.point);
      expect(metres).toBeGreaterThan(200);
      expect(metres).toBeLessThan(400);
    }
  });

  it('returns the same offset point on every read', async () => {
    const points = new Set<string>();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const event = await events.findById(privateEventId, strangerId);
      points.add(
        `${event?.venue.point.longitude},${event?.venue.point.latitude}`
      );
    }
    // A per-request random offset would give ten answers whose centroid is
    // the true location. One answer gives nothing away by repetition.
    expect(points.size).toBe(1);
  });

  it('discloses the exact location once the organizer approves, and takes it back on revocation', async () => {
    expect(await access.request(privateEventId, approvedId, 'Ami de Léa')).toBe(
      'pending'
    );

    const pending = await events.findById(privateEventId, approvedId);
    expect(pending?.venue.address).toBeUndefined();
    expect(pending?.myAccessStatus).toBe('pending');

    expect(
      await access.resolve(privateEventId, approvedId, 'approved', organizerId)
    ).toBe(true);

    const granted = await events.findById(privateEventId, approvedId);
    expect(granted?.venue.address).toBe(EXACT_ADDRESS);
    expect(granted?.venue.point.longitude).toBeCloseTo(EXACT_LONGITUDE, 6);
    expect(granted?.myAccessStatus).toBe('approved');
    expect(granted?.locationPrecision).toBeUndefined();

    // Criterion 10: revoking returns them to the offset point.
    expect(
      await access.resolve(privateEventId, approvedId, 'declined', organizerId)
    ).toBe(true);
    const revoked = await events.findById(privateEventId, approvedId);
    expect(revoked?.venue.address).toBeUndefined();
    expect(revoked?.locationPrecision).toBe('approximate');
  });

  it('makes a decline final', async () => {
    await access.request(privateEventId, declinedId, undefined);
    await access.resolve(privateEventId, declinedId, 'declined', organizerId);

    await expect(
      access.request(privateEventId, declinedId, 'Je réessaie')
    ).rejects.toBeInstanceOf(EventAccessDeclinedError);

    // Criterion 11 binds the organizer too: a refusal is not a step in a
    // negotiation that a later click can undo.
    expect(
      await access.resolve(privateEventId, declinedId, 'approved', organizerId)
    ).toBe(false);
    const stillHidden = await events.findById(privateEventId, declinedId);
    expect(stillHidden?.venue.address).toBeUndefined();
  });

  it('keeps the private address out of venue search', async () => {
    // The second leak, independent of the event row: searchVenues matches
    // free text against name *and* address over every venue, with no
    // review_state or category filter. Typing the street line found it.
    const byAddress = await events.searchVenues({ text: 'Intégration' });
    expect(byAddress.map((venue) => venue.id)).not.toContain(privateVenueId);
    // The public directory venue with a similar name is still findable, so
    // this is exclusion of the private row rather than of the query.
    expect(byAddress.map((venue) => venue.id)).toContain(directoryVenueId);
  });

  it('refuses to withhold the address of a venue already in the directory', async () => {
    await expect(
      events.createEvent(organizerId, {
        title: 'Soirée au bar public',
        category: 'nightlife',
        startsAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
        accessInformation: 'Entrée libre.',
        isAfter: false,
        addressDisclosure: 'on_approval',
        price: { kind: 'free' },
        venue: { kind: 'existing', venueId: directoryVenueId }
      })
    ).rejects.toBeInstanceOf(DirectoryVenueCannotHideAddressError);
  });

  async function distanceFromTruth(point: {
    longitude: number;
    latitude: number;
  }): Promise<number> {
    const result = await pool.query<{ metres: string }>(
      `SELECT ST_Distance(
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
       ) AS metres`,
      [point.longitude, point.latitude, EXACT_LONGITUDE, EXACT_LATITUDE]
    );
    return Number(result.rows[0]?.metres ?? 0);
  }
});
