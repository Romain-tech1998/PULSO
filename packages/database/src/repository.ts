import type {
  AdminVenuePhoto,
  DirectDistanceQuery,
  MapBoundsQuery,
  PublicEvent,
  PublicVenue,
  VenuesQuery
} from '@pulso/contracts';
import { AFTER_WINDOW_END_HOUR, AFTER_WINDOW_START_HOUR } from '@pulso/domain';
import type { DiscoveryWindow } from '@pulso/domain';
import type {
  EventCategory,
  PriceFilterValue,
  VenueCategory
} from '@pulso/domain';
import { matchVenues, OSM_ATTRIBUTION } from '@pulso/ingestion';
import type { LiveVenueCandidate } from '@pulso/ingestion';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

/**
 * DEC-0022 §6. Raised when an organizer asks to withhold the address of an
 * event held at a venue from the public directory.
 *
 * Refused rather than silently downgraded to 'public': the Centre Bell's
 * address is already published by the Centre Bell, and an interface that
 * accepted the request would promise a privacy it cannot deliver. Withholding
 * is only meaningful for an address the organizer typed themselves.
 */
export class DirectoryVenueCannotHideAddressError extends Error {
  constructor() {
    super('An existing directory venue cannot withhold its address.');
    this.name = 'DirectoryVenueCannotHideAddressError';
  }
}

export interface ExternalDestinationRecord {
  label: string;
  url: string;
  status: 'available' | 'unavailable';
  eventStatus: PublicEvent['status'];
}

// DEC-0017. `includeCreated` defaults to false everywhere so the anonymous
// surfaces stay the sourced directory by construction - a caller has to opt
// in to account-created content, rather than a forgotten flag leaking it.
export interface TextSearchQuery {
  /** Raw fragment the visitor typed, e.g. "centre bell". Folded in SQL. */
  text?: string;
  /**
   * A kind of place rather than a named one - "bar", "club", "théâtre".
   * Combined with `text` by OR when both are present: someone typing
   * "bar jazz" means either, and an AND would return almost nothing.
   */
  venueCategories?: VenueCategory[];
  categories: EventCategory[];
  price: PriceFilterValue;
  /** Guards against a one-letter query returning the whole directory. */
  limit?: number;
}

export interface EventQueryOptions {
  excludedCategories?: EventCategory[];
  includeCreated?: boolean;
  after?: boolean;
  /**
   * DEC-0022 §6. The account reading these events, or null for an anonymous
   * surface. Required, and required precisely because it is the field a
   * caller would otherwise forget: forgetting it here means an unapproved
   * reader receives an organizer's home address.
   */
  viewerId: string | null;
}

export interface CreateEventInput {
  title: string;
  category: EventCategory;
  startsAt: string;
  endsAt?: string | undefined;
  accessInformation: string;
  description?: string | undefined;
  imageUrl?: string | undefined;
  isAfter: boolean;
  ticketingUrl?: string | undefined;
  /** DEC-0022 §6. Absent means 'public'. */
  addressDisclosure?: 'public' | 'on_approval' | undefined;
  /** DEC-0023 §4. Absent means no cap, which is the default. */
  attendanceLimit?: number | undefined;
  price: {
    kind: 'free' | 'paid' | 'unknown';
    minimumAmount?: number | undefined;
  };
  venue:
    | { kind: 'existing'; venueId: string }
    | {
        kind: 'new';
        name: string;
        address: string;
        point: { longitude: number; latitude: number };
      };
}

export interface EventRepository {
  findInBounds(
    bounds: MapBoundsQuery,
    window: DiscoveryWindow,
    options: EventQueryOptions
  ): Promise<PublicEvent[]>;
  findWithinDirectDistance(
    query: DirectDistanceQuery,
    viewerId: string | null
  ): Promise<PublicEvent[]>;
  findById(
    id: string,
    viewerId: string | null
  ): Promise<PublicEvent | undefined>;
  findByIds(ids: string[], viewerId: string | null): Promise<PublicEvent[]>;
  findExternalDestination(
    id: string
  ): Promise<ExternalDestinationRecord | undefined>;
  findVenuesWithoutUpcomingEvents(bounds: VenuesQuery): Promise<PublicVenue[]>;
  // Free-text search, deliberately NOT bounded by the visible map: someone
  // typing "Centre Bell" means the Centre Bell, not "the Centre Bell if it
  // happens to be on screen". Bounded browsing stays findInBounds's job.
  searchEvents(
    query: TextSearchQuery,
    window: DiscoveryWindow,
    options: EventQueryOptions
  ): Promise<PublicEvent[]>;
  searchVenues(
    query: { text?: string; categories?: VenueCategory[] },
    limit?: number
  ): Promise<PublicVenue[]>;
  // The live-lookup pair behind a search that found nothing. Split in two so
  // the caller can decide *not* to go out to the network - the check is a
  // local index hit, the save is what happens after a real answer comes back.
  shouldLookUpVenue(text: string): Promise<boolean>;
  saveLookedUpVenues(
    text: string,
    candidates: LiveVenueCandidate[]
  ): Promise<PublicVenue[]>;
  // DEC-0019 administration. Borrowed photos have to be removable by the
  // person answering the request, not only by whoever can reach a shell.
  listVenuePhotos(query?: string): Promise<AdminVenuePhoto[]>;
  suppressVenuePhoto(
    venueId: string,
    options: { thisOneOnly?: boolean; reason?: string }
  ): Promise<boolean>;
  restoreVenuePhoto(venueId: string): Promise<boolean>;
  // Returns the created event as the caller will see it, so the client does
  // not have to guess what the server derived (origin, creator name).
  createEvent(userId: string, input: CreateEventInput): Promise<PublicEvent>;
  // DEC-0017 v1.1. Returns undefined when the event is not the caller's own
  // created event, so the route can 404 without disclosing existence.
  updateCreatedEvent(
    userId: string,
    eventId: string,
    input: Omit<CreateEventInput, 'venue'>
  ): Promise<PublicEvent | undefined>;
  deleteCreatedEvent(userId: string, eventId: string): Promise<boolean>;
  listCreatedEvents(userId: string): Promise<PublicEvent[]>;
  setCreatedEventPinned(
    userId: string,
    eventId: string,
    pinned: boolean
  ): Promise<boolean>;
  setCreatedEventImage(
    userId: string,
    eventId: string,
    imageUrl: string
  ): Promise<boolean>;
}

/**
 * DEC-0022 §6. The select list for a `PublicEvent`, parameterised by *who is
 * asking*.
 *
 * A function rather than a constant, and `viewer` has no default, so adding a
 * query that reads events forces its author to answer the question. That is
 * the whole correction: DEC-0017 v1.2's `address_hidden` was enforced by one
 * component declining to render a field the API had already sent, which meant
 * the exact address and the exact pin of every "hidden" event were available
 * to anyone who called the endpoint directly. A guarantee has to be made
 * where the data is produced.
 *
 * `viewer` is a placeholder for a parameter carrying the reader's account id,
 * or the literal `NULL::uuid` for a surface with no reader (anonymous
 * browsing, ingestion). It is referenced three times; PostgreSQL is happy to
 * reuse one positional parameter.
 */
function publicEventSelect(viewer: string): string {
  // Approved, or the organizer themselves. `r.user_id = NULL` is NULL rather
  // than true, so an anonymous reader falls through to the offset point
  // without a special case.
  const locationVisible = `(
    e.address_disclosure = 'public'
    OR e.created_by_user_id = ${viewer}
    OR EXISTS (
      SELECT 1 FROM event_access_requests r
      WHERE r.event_id = e.id
        AND r.user_id = ${viewer}
        AND r.status = 'approved'
    )
  )`;
  return `
  SELECT
    ${locationVisible} AS location_visible,
    e.address_disclosure,
    (
      SELECT r.status FROM event_access_requests r
      WHERE r.event_id = e.id AND r.user_id = ${viewer}
    ) AS my_access_status,
    -- The street line and the pin are withheld together. Either alone is the
    -- address: a 10 m pin discloses the door as surely as the text does, and
    -- the text discloses it as surely as the pin.
    CASE WHEN ${locationVisible} THEN v.address END AS address,
    ST_X(
      CASE WHEN ${locationVisible} THEN v.location
           ELSE pulso_approximate_point(v.location, e.id) END
    ) AS longitude,
    ST_Y(
      CASE WHEN ${locationVisible} THEN v.location
           ELSE pulso_approximate_point(v.location, e.id) END
    ) AS latitude,
    e.id,
    e.title,
    e.category,
    e.status,
    e.starts_at,
    e.ends_at,
    e.timezone,
    e.price_kind,
    e.price_minimum_amount,
    e.image_url,
    e.source_name,
    e.source_url,
    e.observed_at,
    e.description,
    e.organizer_name,
    e.access_information,
    e.external_destination_label,
    e.external_destination_url,
    e.external_destination_status,
    e.external_destination_kind,
    e.trust_label,
    e.freshness,
    e.location_confidence,
    e.additional_sources,
    e.origin,
    e.is_after,
    e.pinned,
    e.attendance_limit,
    -- DEC-0023 §4. The subquery runs only where a cap exists, which is not
    -- the default: a count per row across a whole map viewport would be paid
    -- by every event to answer a question almost none of them ask.
    CASE WHEN e.attendance_limit IS NULL THEN NULL
         ELSE (
           SELECT count(*) FROM event_attendance ea WHERE ea.event_id = e.id
         ) END AS attendance_taken,
    e.created_by_user_id,
    creator.display_name AS creator_display_name,
    v.id AS venue_id,
    v.name AS venue_name,
    v.category AS venue_category,
    v.secondary_categories AS venue_secondary_categories,
    v.image_url AS venue_image_url
`;
}

interface EventRow {
  id: string;
  title: string;
  category: PublicEvent['category'];
  status: PublicEvent['status'];
  starts_at: Date;
  ends_at: Date | null;
  timezone: 'America/Toronto';
  price_kind: PublicEvent['price']['kind'];
  price_minimum_amount: string | null;
  image_url: string | null;
  source_name: string;
  source_url: string;
  observed_at: Date;
  description: string | null;
  organizer_name: string | null;
  access_information: string;
  external_destination_label: string | null;
  external_destination_url: string | null;
  external_destination_status: 'available' | 'unavailable' | null;
  external_destination_kind: 'event_source' | 'ticketing' | null;
  origin: NonNullable<PublicEvent['origin']>;
  is_after: boolean;
  address_disclosure: 'public' | 'on_approval';
  // Computed by publicEventSelect, not stored: whether *this* reader may see
  // the exact address and pin.
  location_visible: boolean;
  my_access_status: 'pending' | 'approved' | 'declined' | null;
  attendance_limit: number | null;
  attendance_taken: string | null;
  pinned: boolean;
  created_by_user_id: string | null;
  creator_display_name: string | null;
  trust_label: NonNullable<PublicEvent['trust']>['label'];
  freshness: NonNullable<PublicEvent['trust']>['freshness'];
  location_confidence: NonNullable<PublicEvent['trust']>['locationConfidence'];
  additional_sources: NonNullable<PublicEvent['additionalSources']>;
  venue_id: string;
  venue_name: string;
  // Null when withheld from this reader (DEC-0022 §6). The type is what makes
  // the redaction impossible to drop silently downstream.
  address: string | null;
  venue_category: VenueCategory | null;
  venue_secondary_categories: VenueCategory[];
  venue_image_url: string | null;
  longitude: number;
  latitude: number;
  distance_meters?: number;
}

function toPublicEvent(row: EventRow): PublicEvent {
  const event: PublicEvent = {
    id: row.id,
    title: row.title,
    category: row.category,
    status: row.status,
    startsAt: row.starts_at.toISOString(),
    timezone: row.timezone,
    price:
      row.price_kind === 'paid'
        ? {
            kind: 'paid',
            currency: 'CAD',
            ...(row.price_minimum_amount !== null
              ? { minimumAmount: Number(row.price_minimum_amount) }
              : {})
          }
        : { kind: row.price_kind, currency: 'CAD' },
    accessInformation: row.access_information,
    venue: {
      id: row.venue_id,
      name: row.venue_name,
      // Absent, not blanked: a withheld address is a field that is not there,
      // which every consumer must handle, rather than an empty string that
      // renders as a plausible-looking gap.
      ...(row.address !== null ? { address: row.address } : {}),
      point: {
        longitude: Number(row.longitude),
        latitude: Number(row.latitude)
      },
      ...(row.venue_category !== null ? { category: row.venue_category } : {}),
      ...(row.venue_secondary_categories.length > 0
        ? { secondaryCategories: row.venue_secondary_categories }
        : {}),
      ...(row.venue_image_url !== null ? { imageUrl: row.venue_image_url } : {})
    },
    source: {
      name: row.source_name,
      url: row.source_url,
      observedAt: row.observed_at.toISOString()
    },
    // DEC-0017: an account-created event carries no DATA-0001 trust label,
    // so the whole trust object is absent rather than filled with a
    // downgraded-looking placeholder.
    ...(row.origin === 'directory'
      ? {
          trust: {
            label: row.trust_label,
            freshness: row.freshness,
            locationConfidence: row.location_confidence
          }
        }
      : {})
  };
  if (row.origin !== 'directory') event.origin = row.origin;
  if (row.is_after) event.isAfter = true;
  if (row.pinned) event.pinned = true;
  // Absence means 'public', the case for every ingested event and every
  // fixture, so the common path carries no ceremony (same convention as
  // `origin`).
  if (row.address_disclosure !== 'public') {
    event.addressDisclosure = row.address_disclosure;
    // The client must be able to tell a 300 m circle from a doorway. Without
    // this it would draw the offset point as an exact one and quietly lie.
    if (!row.location_visible) event.locationPrecision = 'approximate';
  }
  if (row.my_access_status !== null)
    event.myAccessStatus = row.my_access_status;
  // Absent unless capped, so the common event carries nothing. `taken` can
  // exceed `limit`: DEC-0023 §4 lets an organizer lower a cap under the
  // number already committed, and evicts nobody when they do.
  if (row.attendance_limit !== null) {
    event.capacity = {
      limit: row.attendance_limit,
      taken: Number(row.attendance_taken ?? 0)
    };
  }
  if (row.created_by_user_id && row.creator_display_name) {
    event.createdBy = {
      userId: row.created_by_user_id,
      displayName: row.creator_display_name
    };
  }
  if (row.additional_sources.length > 0)
    event.additionalSources = row.additional_sources;
  if (row.ends_at) event.endsAt = row.ends_at.toISOString();
  if (row.description) event.description = row.description;
  if (row.organizer_name) event.organizer = row.organizer_name;
  if (row.image_url) event.imageUrl = row.image_url;
  if (row.external_destination_label && row.external_destination_status) {
    event.externalDestination = {
      label: row.external_destination_label,
      // Legacy rows ingested before external_destination_kind existed have
      // no value here; 'event_source' is the safe fallback since it never
      // overstates a plain source link as an actual ticket purchase page.
      kind: row.external_destination_kind ?? 'event_source',
      status: row.external_destination_status
    };
  }
  if (row.distance_meters !== undefined)
    event.distanceMeters = Number(row.distance_meters);
  return event;
}

export class PostgresEventRepository implements EventRepository {
  constructor(private readonly pool: Pool) {}

  async findInBounds(
    bounds: MapBoundsQuery,
    window: DiscoveryWindow,
    options: EventQueryOptions
  ): Promise<PublicEvent[]> {
    const result = await this.pool.query<EventRow>(
      `${publicEventSelect('$17::uuid')}
       FROM events e
       JOIN venues v ON v.id = e.venue_id
       LEFT JOIN users creator ON creator.id = e.created_by_user_id
       WHERE v.location && ST_MakeEnvelope($1, $2, $3, $4, 4326)
         AND e.starts_at >= $5
         AND e.starts_at <= $6
         AND e.status IN ('scheduled', 'postponed')
         AND ($7::event_category[] IS NULL OR e.category = ANY($7))
         AND ($8::text = 'all' OR e.price_kind = $8)
         AND ($9::event_category[] IS NULL OR NOT (e.category = ANY($9)))
         AND (
           $10::float8 IS NULL
           OR ST_DWithin(
             v.location::geography,
             ST_SetSRID(ST_MakePoint($10, $11), 4326)::geography,
             $12
           )
         )
         -- DEC-0017 acceptance criterion 2: created events never reach an
         -- anonymous caller, and the default is to exclude them.
         AND ($13::boolean OR e.origin = 'directory')
         -- The After filter is the flag OR the small-hours window, so it
         -- also catches late-night events already in the directory.
         AND (
           NOT $14::boolean
           OR e.is_after
           OR EXTRACT(
                HOUR FROM (e.starts_at AT TIME ZONE 'America/Toronto')
              ) >= $15
              AND EXTRACT(
                HOUR FROM (e.starts_at AT TIME ZONE 'America/Toronto')
              ) < $16
         )
       ORDER BY e.starts_at, e.id`,
      [
        bounds.west,
        bounds.south,
        bounds.east,
        bounds.north,
        window.startsAt,
        window.endsAt,
        (bounds.categories?.length ?? 0) > 0 ? bounds.categories : null,
        bounds.price,
        options.excludedCategories && options.excludedCategories.length > 0
          ? options.excludedCategories
          : null,
        bounds.nearLongitude ?? null,
        bounds.nearLatitude ?? null,
        bounds.nearRadiusMeters ?? null,
        options.includeCreated === true,
        options.after === true,
        AFTER_WINDOW_START_HOUR,
        AFTER_WINDOW_END_HOUR,
        options.viewerId
      ]
    );
    return result.rows.map(toPublicEvent);
  }

  /**
   * DEC-0017. The origin is derived server-side from whether the account
   * holds a `venue_organizers` row for the chosen venue - a client cannot
   * claim to be a verified organizer, it can only turn out to be one.
   *
   * `source` points at Pulso itself rather than a fabricated external URL:
   * that is genuinely where the record came from, and PRD-0001 already
   * allows a verified organizer to supply traceability in place of a public
   * booking URL. `trust_label` stays null - see DEC-0017.
   */
  async createEvent(
    userId: string,
    input: CreateEventInput
  ): Promise<PublicEvent> {
    const eventId = randomUUID();
    const disclosure = input.addressDisclosure ?? 'public';
    let venueId: string;
    if (input.venue.kind === 'existing') {
      if (disclosure !== 'public')
        throw new DirectoryVenueCannotHideAddressError();
      venueId = input.venue.venueId;
    } else {
      venueId = randomUUID();
      // is_private keeps this row out of venue search, map pins and lookups.
      // Without it the redaction on the event would be pointless: the venue
      // row holds the same street line, and `searchVenues` matches free text
      // against name *and address* over every row in the table - so a private
      // address stayed findable by typing it in.
      await this.pool.query(
        `INSERT INTO venues (id, name, address, location, is_private)
         VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6)`,
        [
          venueId,
          input.venue.name,
          input.venue.address,
          input.venue.point.longitude,
          input.venue.point.latitude,
          disclosure !== 'public'
        ]
      );
    }

    const verified = await this.pool.query(
      `SELECT 1 FROM venue_organizers WHERE user_id = $1 AND venue_id = $2`,
      [userId, venueId]
    );
    const origin =
      verified.rows.length > 0 ? 'verified_organizer' : 'community';

    await this.pool.query(
      `INSERT INTO events (
         id, venue_id, title, category, status, starts_at, ends_at, timezone,
         source_name, source_url, observed_at, freshness, location_confidence,
         price_kind, price_minimum_amount, image_url, description,
         access_information, origin, created_by_user_id, is_after,
         address_disclosure, attendance_limit
       ) VALUES (
         $1, $2, $3, $4, 'scheduled', $5, $6, 'America/Toronto',
         $7, $8, now(), NULL, NULL,
         $9, $10, $11, $12,
         $13, $14, $15, $16, $17, $18
       )`,
      [
        eventId,
        venueId,
        input.title,
        input.category,
        input.startsAt,
        input.endsAt ?? null,
        origin === 'verified_organizer'
          ? 'Pulso — organisateur vérifié'
          : 'Pulso — membre',
        `pulso://events/${eventId}`,
        input.price.kind,
        input.price.kind === 'paid'
          ? (input.price.minimumAmount ?? null)
          : null,
        input.imageUrl ?? null,
        input.description ?? null,
        input.accessInformation,
        origin,
        userId,
        input.isAfter,
        disclosure,
        input.attendanceLimit ?? null
      ]
    );

    if (input.ticketingUrl)
      await this.setTicketing(eventId, input.ticketingUrl);

    // Read back as the author, who always sees their own exact address.
    const created = await this.findById(eventId, userId);
    if (!created) throw new Error('The created event could not be read back.');
    return created;
  }

  // Reuses the same external-destination shape an ingested ticketing link
  // uses, so the UI's "clearly identified external destination" treatment
  // applies unchanged (UX-0001).
  private async setTicketing(eventId: string, url: string): Promise<void> {
    await this.pool.query(
      `UPDATE events SET
         external_destination_label = 'Billetterie de l''organisateur',
         external_destination_url = $2,
         external_destination_status = 'available',
         external_destination_kind = 'ticketing'
       WHERE id = $1`,
      [eventId, url]
    );
  }

  async updateCreatedEvent(
    userId: string,
    eventId: string,
    input: Omit<CreateEventInput, 'venue'>
  ): Promise<PublicEvent | undefined> {
    const disclosure = input.addressDisclosure ?? 'public';
    // The venue has to follow the event: leaving it in the directory would
    // republish through search exactly the address the event just withheld.
    //
    // Guarded on the venue serving this one event, which is the precise
    // property that makes privatising it safe. A venue shared with any other
    // event is a directory venue by definition - hiding it would remove
    // someone else's programming from search, and its address was never the
    // organizer's to withhold in the first place.
    const venue = await this.pool.query(
      `UPDATE venues v SET is_private = $2
       WHERE v.id = (SELECT venue_id FROM events WHERE id = $1)
         AND (SELECT count(*) FROM events e WHERE e.venue_id = v.id) = 1`,
      [eventId, disclosure !== 'public']
    );
    if (disclosure !== 'public' && (venue.rowCount ?? 0) === 0)
      throw new DirectoryVenueCannotHideAddressError();
    const result = await this.pool.query(
      `UPDATE events SET
         title = $3, category = $4, starts_at = $5, ends_at = $6,
         price_kind = $7, price_minimum_amount = $8,
         description = $9, access_information = $10, is_after = $11,
         address_disclosure = $12, attendance_limit = $13
       WHERE id = $1 AND created_by_user_id = $2 AND origin <> 'directory'`,
      [
        eventId,
        userId,
        input.title,
        input.category,
        input.startsAt,
        input.endsAt ?? null,
        input.price.kind,
        input.price.kind === 'paid'
          ? (input.price.minimumAmount ?? null)
          : null,
        input.description ?? null,
        input.accessInformation,
        input.isAfter,
        disclosure,
        // DEC-0023 §4: a limit can be raised, lowered, or removed, and none
        // of those touch `event_attendance`. Lowering it below the number
        // already committed leaves every one of them in place - the event
        // simply reads as full.
        input.attendanceLimit ?? null
      ]
    );
    if ((result.rowCount ?? 0) === 0) return undefined;
    if (input.ticketingUrl)
      await this.setTicketing(eventId, input.ticketingUrl);
    return this.findById(eventId, userId);
  }

  async listCreatedEvents(userId: string): Promise<PublicEvent[]> {
    const result = await this.pool.query<EventRow>(
      // The reader is the author of every row this returns, so they always
      // see their own exact addresses.
      `${publicEventSelect('$1::uuid')}
       FROM events e
       JOIN venues v ON v.id = e.venue_id
       LEFT JOIN users creator ON creator.id = e.created_by_user_id
       WHERE e.created_by_user_id = $1
       ORDER BY e.starts_at DESC`,
      [userId]
    );
    return result.rows.map(toPublicEvent);
  }

  async setCreatedEventPinned(
    userId: string,
    eventId: string,
    pinned: boolean
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE events SET pinned = $3
       WHERE id = $1 AND created_by_user_id = $2 AND origin <> 'directory'`,
      [eventId, userId, pinned]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async setCreatedEventImage(
    userId: string,
    eventId: string,
    imageUrl: string
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE events SET image_url = $3
       WHERE id = $1 AND created_by_user_id = $2 AND origin <> 'directory'`,
      [eventId, userId, imageUrl]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Scoped by created_by_user_id, so deleting someone else's event is a
  // no-op returning false rather than a cross-account delete (DEC-0017
  // acceptance criterion 8).
  async deleteCreatedEvent(userId: string, eventId: string): Promise<boolean> {
    // Six tables reference events, all NO ACTION - so an event anyone had
    // engaged with (attendance, a forum post, a favorite) could not be
    // deleted at all: Postgres raised a foreign-key violation and the
    // organizer just saw a button that did nothing. The dependants are
    // removed explicitly, in one transaction, rather than by widening those
    // constraints to CASCADE - an ingested event must keep failing loudly
    // if anything ever tries to delete it out from under real engagement.
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const owned = await client.query(
        `SELECT 1 FROM events
         WHERE id = $1 AND created_by_user_id = $2 AND origin <> 'directory'`,
        [eventId, userId]
      );
      if (owned.rows.length === 0) {
        await client.query('ROLLBACK');
        return false;
      }
      for (const table of [
        'event_attendance',
        'event_photos',
        'forum_follows',
        'forum_posts',
        'user_favorite_events',
        'notifications'
      ]) {
        await client.query(`DELETE FROM ${table} WHERE event_id = $1`, [
          eventId
        ]);
      }
      // A group outlives the event it was created around - it keeps its
      // members and its conversation, it just stops pointing at a row that
      // no longer exists.
      await client.query(
        `UPDATE groups SET event_id = NULL WHERE event_id = $1`,
        [eventId]
      );
      await client.query(`DELETE FROM events WHERE id = $1`, [eventId]);
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findWithinDirectDistance(
    query: DirectDistanceQuery,
    viewerId: string | null
  ): Promise<PublicEvent[]> {
    const result = await this.pool.query<EventRow>(
      `${publicEventSelect('$4::uuid')},
       ST_Distance(
         v.location::geography,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
       ) AS distance_meters
       FROM events e
       JOIN venues v ON v.id = e.venue_id
       LEFT JOIN users creator ON creator.id = e.created_by_user_id
       WHERE ST_DWithin(
         v.location::geography,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $3
       )
       ORDER BY distance_meters, e.id`,
      [query.longitude, query.latitude, query.radiusMeters, viewerId]
    );
    return result.rows.map(toPublicEvent);
  }

  async findById(
    id: string,
    viewerId: string | null
  ): Promise<PublicEvent | undefined> {
    const result = await this.pool.query<EventRow>(
      `${publicEventSelect('$2::uuid')}
       FROM events e
       JOIN venues v ON v.id = e.venue_id
       LEFT JOIN users creator ON creator.id = e.created_by_user_id
       WHERE e.id = $1`,
      [id, viewerId]
    );
    const row = result.rows[0];
    return row ? toPublicEvent(row) : undefined;
  }

  // Batch hydration for the Favoris section: favorites are stored
  // client-side only (no account system), so the client already knows
  // which ids it wants regardless of map viewport - this just fetches the
  // full PublicEvent objects.
  async findByIds(
    ids: string[],
    viewerId: string | null
  ): Promise<PublicEvent[]> {
    if (ids.length === 0) return [];
    const result = await this.pool.query<EventRow>(
      `${publicEventSelect('$2::uuid')}
       FROM events e
       JOIN venues v ON v.id = e.venue_id
       LEFT JOIN users creator ON creator.id = e.created_by_user_id
       WHERE e.id = ANY($1)`,
      [ids, viewerId]
    );
    return result.rows.map(toPublicEvent);
  }

  async findExternalDestination(
    id: string
  ): Promise<ExternalDestinationRecord | undefined> {
    const result = await this.pool.query<{
      label: string | null;
      url: string | null;
      status: 'available' | 'unavailable' | null;
      event_status: PublicEvent['status'];
    }>(
      `SELECT external_destination_label AS label,
              external_destination_url AS url,
              external_destination_status AS status,
              status AS event_status
       FROM events
       WHERE id = $1`,
      [id]
    );
    const row = result.rows[0];
    if (!row?.label || !row.url || !row.status) return undefined;
    return {
      label: row.label,
      url: row.url,
      status: row.status,
      eventStatus: row.event_status
    };
  }

  // Surfaces every verified recurring orientation venue. A hand-set category
  // is the current verification boundary: ingestion never guesses it, while
  // curated venues and reviewed known venues receive one explicitly. The
  // client merges these landmarks with venues having events in its 14-day
  // programming window, so a known place remains navigable between events.
  /**
   * Matches a typed fragment against what a visitor would actually name: the
   * event's own title, who is putting it on, and where it happens.
   *
   * No map envelope here, unlike findInBounds. A named search is an
   * intention, not a browse - hiding the Centre Bell because the map happens
   * to be over Verdun would read as "Pulso does not have it".
   *
   * Title matches sort first: someone typing "lion king" means the show, and
   * a venue whose name merely contains the same words is a weaker answer.
   */
  async searchEvents(
    query: TextSearchQuery,
    window: DiscoveryWindow,
    options: EventQueryOptions
  ): Promise<PublicEvent[]> {
    const result = await this.pool.query<EventRow>(
      `${publicEventSelect('$10::uuid')}
       FROM events e
       JOIN venues v ON v.id = e.venue_id
       LEFT JOIN users creator ON creator.id = e.created_by_user_id
       WHERE e.starts_at >= $1
         AND e.starts_at <= $2
         AND e.status IN ('scheduled', 'postponed')
         AND ($3::event_category[] IS NULL OR e.category = ANY($3))
         AND ($4::text = 'all' OR e.price_kind = $4)
         AND ($5::boolean OR e.origin = 'directory')
         -- The same exclusion findInBounds applies. It was missing here,
         -- while this method already read options.includeCreated - so a
         -- named or venue-category search ("not comedy") derived the
         -- exclusion, declared it a hard constraint, answered "exact", and
         -- returned the excluded category anyway. Invisible against the
         -- seeded fixtures, which carry no event in the excluded category.
         AND ($9::event_category[] IS NULL OR NOT (e.category = ANY($9)))
         -- Either half may be absent. When both are present they are OR'd:
         -- "bar jazz" means either signal, and an AND would return nothing.
         AND (
           (
             $6::text IS NOT NULL
             AND (
               -- Word by word for the same reason as searchVenues below:
               -- the stopwords are already gone, so requiring one contiguous
               -- run makes an event unfindable by its own full title.
               NOT EXISTS (
                 SELECT 1
                 FROM unnest(string_to_array(pulso_fold($6), ' ')) AS token(word)
                 WHERE token.word <> ''
                   AND pulso_fold(
                         e.title || ' ' ||
                         coalesce(e.organizer_name, '') || ' ' || v.name
                       ) NOT LIKE '%' || token.word || '%'
               )
             )
           )
           OR (
             $7::text[] IS NOT NULL
             AND (
               v.category = ANY($7)
               OR v.secondary_categories && $7
             )
           )
         )
       ORDER BY
         -- A title match is the strongest signal, then the venue being the
         -- kind of place asked for, then simply what happens soonest.
         ($6::text IS NOT NULL
          AND pulso_fold(e.title) LIKE '%' || pulso_fold($6) || '%') DESC,
         ($7::text[] IS NOT NULL AND v.category = ANY($7)) DESC,
         e.starts_at,
         e.id
       LIMIT $8`,
      [
        window.startsAt,
        window.endsAt,
        query.categories.length > 0 ? query.categories : null,
        query.price,
        options.includeCreated === true,
        query.text ?? null,
        query.venueCategories && query.venueCategories.length > 0
          ? query.venueCategories
          : null,
        query.limit ?? 60,
        options.excludedCategories && options.excludedCategories.length > 0
          ? options.excludedCategories
          : null,
        options.viewerId
      ]
    );
    return result.rows.map(toPublicEvent);
  }

  /**
   * Venues matched by name or address. Unlike
   * findVenuesWithoutUpcomingEvents, this does not require a hand-set
   * category: a visitor searching "Newspeak" expects the place whether or
   * not anybody has classified it yet.
   */
  async searchVenues(
    query: { text?: string; categories?: VenueCategory[] },
    limit = 12
  ): Promise<PublicVenue[]> {
    const categories =
      query.categories && query.categories.length > 0 ? query.categories : null;
    const text = query.text ?? null;
    if (text === null && categories === null) return [];

    const result = await this.pool.query<{
      id: string;
      name: string;
      address: string;
      category: VenueCategory | null;
      secondary_categories: VenueCategory[];
      image_url: string | null;
      image_attribution: string | null;
      opening_hours: string | null;
      opening_hours_observed_at: Date | null;
      longitude: number;
      latitude: number;
      review_state: string;
      source: string;
      external_ref: string | null;
    }>(
      // Ordered so a venue that is *both* named and of the right kind wins,
      // then exact names, then prefixes. Venues with upcoming programming
      // come before dormant ones: "bar" should surface places something is
      // actually happening at.
      `SELECT v.id, v.name, v.address, v.category, v.secondary_categories, v.image_url,
              v.image_attribution, v.opening_hours, v.opening_hours_observed_at,
              v.review_state, v.source, v.external_ref,
              ST_X(v.location) AS longitude, ST_Y(v.location) AS latitude,
              EXISTS (
                SELECT 1 FROM events e
                WHERE e.venue_id = v.id
                  AND e.starts_at >= now()
                  AND e.status IN ('scheduled', 'postponed')
              ) AS has_upcoming
       FROM venues v
       -- DEC-0022 §6. A private address is not a directory entry. This is the
       -- surface the redaction on the event would otherwise have missed: it
       -- matches free text against v.address, so typing the street line found
       -- it whatever the event said.
       WHERE NOT v.is_private
         AND (
           (
             $1::text IS NOT NULL
             -- Every word must appear, anywhere, rather than the whole query
             -- appearing as one contiguous run. The interpreter strips
             -- stopwords before this runs, so "quai des brumes" arrives as
             -- "quai brumes" - which is not a substring of "Quai des Brumes",
             -- and the bar was unfindable by its own full name. Any venue
             -- with an internal stopword had the same problem: "Café de la
             -- Paix", "Salle du Théâtre". Matching word by word is also what
             -- makes a half-remembered name work at all.
             AND NOT EXISTS (
               SELECT 1
               FROM unnest(string_to_array(pulso_fold($1), ' ')) AS token(word)
               WHERE token.word <> ''
                 AND pulso_fold(v.name || ' ' || v.address)
                     NOT LIKE '%' || token.word || '%'
             )
           )
           OR (
             $2::text[] IS NOT NULL
             AND (v.category = ANY($2) OR v.secondary_categories && $2)
           )
         )
       ORDER BY
         (v.review_state = 'published') DESC,
         has_upcoming DESC,
         ($1::text IS NOT NULL AND pulso_fold(v.name) = pulso_fold($1)) DESC,
         ($1::text IS NOT NULL
          AND pulso_fold(v.name) LIKE pulso_fold($1) || '%') DESC,
         length(v.name),
         v.name
       LIMIT $3`,
      [text, categories, limit]
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      address: row.address,
      point: {
        longitude: Number(row.longitude),
        latitude: Number(row.latitude)
      },
      ...(row.category !== null ? { category: row.category } : {}),
      ...(row.secondary_categories.length > 0
        ? { secondaryCategories: row.secondary_categories }
        : {}),
      ...(row.image_url !== null ? { imageUrl: row.image_url } : {}),
      ...(row.image_attribution !== null
        ? { imageAttribution: row.image_attribution }
        : {}),
      ...(row.opening_hours !== null
        ? { openingHours: row.opening_hours }
        : {}),
      ...(row.opening_hours_observed_at !== null
        ? {
            openingHoursObservedAt: row.opening_hours_observed_at.toISOString()
          }
        : {}),
      ...(row.review_state !== 'published' ? { suggested: true } : {}),
      // Also for a Pulso-curated row that was *enriched* from OSM: its hours
      // or photo are ODbL data, and the licence obligation travels with them
      // whatever the row's own source says. external_ref is set only by the
      // OSM importer, so it identifies exactly those rows.
      ...(row.source === 'openstreetmap' || row.external_ref !== null
        ? { attribution: OSM_ATTRIBUTION }
        : {})
    }));
  }

  /**
   * Whether this query is worth asking a volunteer-run geocoder about.
   *
   * False once Pulso has already looked and found nothing. Without this, a
   * typo that will never match anything - or a bot replaying the same query -
   * becomes an unbounded stream of requests to Nominatim, which is exactly
   * the behaviour its usage policy exists to prevent. A miss is not retried;
   * if OSM later gains the place, the batch import is what picks it up.
   */
  async shouldLookUpVenue(text: string): Promise<boolean> {
    const trimmed = text.trim();
    if (trimmed.length < 3) return false;
    const result = await this.pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM venue_lookup_attempts
         WHERE folded_query = pulso_fold($1)
       ) AS exists`,
      [trimmed]
    );
    return !result.rows[0]?.exists;
  }

  /**
   * Persists what the live lookup found, and returns it as search results.
   *
   * The attempt is recorded whether or not anything was found, because "we
   * looked and Montréal has no such place" is the more valuable of the two
   * answers to remember.
   *
   * A candidate whose name Pulso already knows is dropped rather than
   * inserted: the local search missed it on spelling, and writing a second
   * row would turn a search miss into a permanent duplicate pin.
   */
  async saveLookedUpVenues(
    text: string,
    candidates: LiveVenueCandidate[]
  ): Promise<PublicVenue[]> {
    const saved: PublicVenue[] = [];

    for (const candidate of candidates) {
      // Ask the database for everything plausibly the same place - anything
      // within 500 m, plus anything whose name overlaps wherever it sits -
      // then decide in TypeScript with the same three-signal test the batch
      // import uses. SQL cannot express "similar name AND nearby OR matching
      // address", and the earlier attempts to approximate it in a WHERE
      // clause both failed on real data: equality let "Cheval Blanc" through
      // next to "Le Cheval Blanc", and substring matching would merge
      // "Le Balcon" into "Balcon Vert".
      const nearby = await this.pool.query<{
        name: string;
        address: string;
        longitude: number;
        latitude: number;
      }>(
        `SELECT name, address,
                ST_X(location) AS longitude, ST_Y(location) AS latitude
         FROM venues
         WHERE external_ref IS DISTINCT FROM $4
           AND (
             ST_DWithin(
               location::geography,
               ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
               500
             )
             OR pulso_fold(name) LIKE '%' || pulso_fold($3) || '%'
             OR pulso_fold($3) LIKE '%' || pulso_fold(name) || '%'
           )
         LIMIT 50`,
        [
          candidate.point.longitude,
          candidate.point.latitude,
          candidate.name,
          candidate.osmRef
        ]
      );
      const alreadyKnown = nearby.rows.some(
        (row) =>
          matchVenues(
            {
              name: row.name,
              address: row.address,
              point: {
                longitude: Number(row.longitude),
                latitude: Number(row.latitude)
              }
            },
            candidate
          ).same
      );
      if (alreadyKnown) continue;

      // Only a place Pulso can classify earns a map pin (DEC-0014). The rest
      // are still returned to the visitor who asked, as labelled suggestions.
      const reviewState = candidate.category ? 'published' : 'candidate';
      const result = await this.pool.query<{
        id: string;
        review_state: string;
      }>(
        `INSERT INTO venues
           (id, name, address, location, category, secondary_categories,
            source, review_state, external_ref)
         VALUES (gen_random_uuid(), $1, $2,
                 ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, ARRAY[]::text[],
                 'openstreetmap', $6, $7)
         ON CONFLICT (source, external_ref) WHERE external_ref IS NOT NULL
         DO UPDATE SET name = EXCLUDED.name,
                       address = EXCLUDED.address,
                       location = EXCLUDED.location,
                       category = COALESCE(EXCLUDED.category, venues.category)
         RETURNING id, review_state`,
        [
          candidate.name,
          candidate.address,
          candidate.point.longitude,
          candidate.point.latitude,
          candidate.category ?? null,
          reviewState,
          candidate.osmRef
        ]
      );

      const row = result.rows[0];
      if (!row) continue;
      saved.push({
        id: row.id,
        name: candidate.name,
        address: candidate.address,
        point: candidate.point,
        ...(candidate.category ? { category: candidate.category } : {}),
        ...(row.review_state !== 'published' ? { suggested: true } : {}),
        attribution: OSM_ATTRIBUTION
      });
    }

    await this.pool.query(
      `INSERT INTO venue_lookup_attempts (folded_query, found_count)
       VALUES (pulso_fold($1), $2)
       ON CONFLICT (folded_query)
       DO UPDATE SET attempted_at = now(), found_count = EXCLUDED.found_count`,
      [text.trim(), saved.length]
    );

    return saved;
  }

  /**
   * Venues that carry a photo, plus those whose photo has been taken down.
   *
   * Ordered borrowed-first. A Commons image is freely licensed and settled;
   * the ones an administrator ever needs to act on are the website images,
   * so those are what the console shows without anybody having to search.
   */
  async listVenuePhotos(query?: string): Promise<AdminVenuePhoto[]> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      image_url: string | null;
      image_source: string | null;
      image_attribution: string | null;
      image_page_url: string | null;
      suppressed: boolean;
    }>(
      `SELECT v.id, v.name, v.image_url, v.image_source, v.image_attribution,
              v.image_page_url,
              EXISTS (
                SELECT 1 FROM venue_photo_suppressions s WHERE s.venue_id = v.id
              ) AS suppressed
       FROM venues v
       WHERE (v.image_url IS NOT NULL
              OR EXISTS (
                SELECT 1 FROM venue_photo_suppressions s
                WHERE s.venue_id = v.id
              ))
         AND ($1::text IS NULL
              OR pulso_fold(v.name) LIKE '%' || pulso_fold($1) || '%')
       ORDER BY (v.image_source = 'website_og') DESC,
                (v.image_source = 'osm_image_tag') DESC,
                v.name
       LIMIT 200`,
      [query ?? null]
    );
    return result.rows.map((row) => ({
      venueId: row.id,
      venueName: row.name,
      ...(row.image_url !== null ? { imageUrl: row.image_url } : {}),
      ...(row.image_source !== null ? { imageSource: row.image_source } : {}),
      ...(row.image_attribution !== null
        ? { imageAttribution: row.image_attribution }
        : {}),
      ...(row.image_page_url !== null ? { pageUrl: row.image_page_url } : {}),
      suppressed: row.suppressed
    }));
  }

  /**
   * Takes a photo down, and keeps it down.
   *
   * The suppression row is the point. Clearing `image_url` alone would be
   * undone by the next import, which would re-fetch the very image somebody
   * asked Pulso to stop showing - so the removal has to be a fact the
   * importer reads, not just an absence it fills back in.
   */
  async suppressVenuePhoto(
    venueId: string,
    options: { thisOneOnly?: boolean; reason?: string }
  ): Promise<boolean> {
    const venue = await this.pool.query<{ image_url: string | null }>(
      'SELECT image_url FROM venues WHERE id = $1',
      [venueId]
    );
    const row = venue.rows[0];
    if (!row) return false;

    // A narrow suppression needs a URL to name. With no photo currently set
    // there is nothing to narrow to, so the request becomes the broad one -
    // which is the safe direction to resolve the ambiguity in.
    const imageUrl = options.thisOneOnly ? row.image_url : null;
    await this.pool.query(
      `INSERT INTO venue_photo_suppressions (venue_id, image_url, reason)
       VALUES ($1, $2, $3)
       ON CONFLICT (venue_id, coalesce(image_url, ''))
       DO UPDATE SET reason = EXCLUDED.reason, suppressed_at = now()`,
      [venueId, imageUrl, options.reason ?? null]
    );
    await this.pool.query(
      `UPDATE venues
       SET image_url = NULL, image_source = NULL,
           image_attribution = NULL, image_page_url = NULL
       WHERE id = $1`,
      [venueId]
    );
    return true;
  }

  async restoreVenuePhoto(venueId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM venue_photo_suppressions WHERE venue_id = $1',
      [venueId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findVenuesWithoutUpcomingEvents(
    bounds: VenuesQuery
  ): Promise<PublicVenue[]> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      address: string;
      category: VenueCategory | null;
      secondary_categories: VenueCategory[];
      image_url: string | null;
      image_attribution: string | null;
      opening_hours: string | null;
      opening_hours_observed_at: Date | null;
      source: string;
      external_ref: string | null;
      longitude: number;
      latitude: number;
    }>(
      // r.average is an internal-only ranking signal (venue_ratings, Phase
      // 4.17) - selected purely to drive ORDER BY, never mapped into the
      // returned PublicVenue below, since no rating is shown publicly yet.
      `SELECT v.id, v.name, v.address, v.category, v.secondary_categories, v.image_url,
              v.image_attribution, v.opening_hours, v.opening_hours_observed_at,
              v.source, v.external_ref,
              ST_X(v.location) AS longitude, ST_Y(v.location) AS latitude
       FROM venues v
       LEFT JOIN (
         SELECT venue_id, AVG(rating) AS average
         FROM venue_ratings
         GROUP BY venue_id
       ) r ON r.venue_id = v.id
       WHERE v.location && ST_MakeEnvelope($1, $2, $3, $4, 4326)
         AND NOT v.is_private
         AND v.category IS NOT NULL
         -- A map pin asserts Pulso stands behind the record; unreviewed
         -- imports are offered in search instead (DEC-0006).
         AND v.review_state = 'published'
       ORDER BY r.average DESC NULLS LAST, v.name`,
      [bounds.west, bounds.south, bounds.east, bounds.north]
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      address: row.address,
      point: {
        longitude: Number(row.longitude),
        latitude: Number(row.latitude)
      },
      ...(row.category !== null ? { category: row.category } : {}),
      ...(row.secondary_categories.length > 0
        ? { secondaryCategories: row.secondary_categories }
        : {}),
      ...(row.image_url !== null ? { imageUrl: row.image_url } : {}),
      ...(row.image_attribution !== null
        ? { imageAttribution: row.image_attribution }
        : {}),
      ...(row.opening_hours !== null
        ? { openingHours: row.opening_hours }
        : {}),
      ...(row.opening_hours_observed_at !== null
        ? {
            openingHoursObservedAt: row.opening_hours_observed_at.toISOString()
          }
        : {}),
      // ODbL attribution has to travel with the data wherever it is shown,
      // and a map pin is a place it is shown. Previously only search carried
      // it, because only search could surface an OSM venue.
      // Also for a Pulso-curated row that was *enriched* from OSM: its hours
      // or photo are ODbL data, and the licence obligation travels with them
      // whatever the row's own source says. external_ref is set only by the
      // OSM importer, so it identifies exactly those rows.
      ...(row.source === 'openstreetmap' || row.external_ref !== null
        ? { attribution: OSM_ATTRIBUTION }
        : {})
    }));
  }
}
