import {
  DATE_FILTER_VALUES,
  DEFAULT_DISCOVERY_FILTERS,
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  FORUM_CATEGORIES,
  FRESHNESS_STATES,
  LOCATION_CONFIDENCE_STATES,
  PRICE_FILTER_VALUES,
  TRUST_LABELS,
  VENUE_CATEGORIES
} from '@pulso/domain';
import {
  formatCad,
  formatMontrealDate,
  formatMontrealDateTime,
  getCategoryLabel,
  getDateFilterLabel,
  getPriceLabel,
  getTrustLabel,
  SEARCH_MESSAGE_CODES,
  SUPPORTED_LOCALES,
  translate
} from '@pulso/domain/localization';
import type {
  DiscoveryFilters,
  EventCategory,
  MapBounds,
  VenueCategory
} from '@pulso/domain';
import type { SupportedLocale } from '@pulso/domain/localization';
import { z } from 'zod';

export const geographicPointSchema = z.object({
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90)
});

export const mapBoundsSchema = z
  .object({
    west: z.number().min(-180).max(180),
    south: z.number().min(-90).max(90),
    east: z.number().min(-180).max(180),
    north: z.number().min(-90).max(90)
  })
  .strict()
  .refine(
    (bounds) => bounds.west < bounds.east && bounds.south < bounds.north,
    'Bounds must have increasing west/east and south/north values.'
  );

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year!, month! - 1, day!));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() + 1 === month &&
      date.getUTCDate() === day
    );
  }, 'The selected Montréal calendar date is invalid.');
const categoryListQuerySchema = z
  .string()
  .min(1)
  .transform((value) => value.split(','))
  .pipe(z.array(z.enum(EVENT_CATEGORIES)).min(1))
  .refine((values) => new Set(values).size === values.length, {
    message: 'Categories must not contain duplicates.'
  });

export const mapBoundsQuerySchema = z
  .object({
    west: z.coerce.number().min(-180).max(180),
    south: z.coerce.number().min(-90).max(90),
    east: z.coerce.number().min(-180).max(180),
    north: z.coerce.number().min(-90).max(90),
    date: z.enum(DATE_FILTER_VALUES).default('next7'),
    categories: categoryListQuerySchema.optional().default([]),
    price: z.enum(PRICE_FILTER_VALUES).default('all'),
    dateStart: dateStringSchema.optional(),
    dateEnd: dateStringSchema.optional(),
    // Optional radius-from-point constraint, combined with the bounds above
    // (not a replacement for them) - see Distance slider in the Explore
    // sidebar. All three fields are required together or not at all.
    nearLongitude: z.coerce.number().min(-180).max(180).optional(),
    nearLatitude: z.coerce.number().min(-90).max(90).optional(),
    nearRadiusMeters: z.coerce.number().positive().max(50_000).optional()
  })
  .strict()
  .refine(
    (bounds) => bounds.west < bounds.east && bounds.south < bounds.north,
    {
      message: 'Bounds must have increasing west/east and south/north values.'
    }
  )
  .superRefine((query, context) => {
    if (query.date === 'custom' && !query.dateStart) {
      context.addIssue({
        code: 'custom',
        path: ['dateStart'],
        message: 'A selected date is required for a custom date filter.'
      });
    }
    if (query.date !== 'custom' && (query.dateStart || query.dateEnd)) {
      context.addIssue({
        code: 'custom',
        path: ['dateStart'],
        message: 'Selected dates are valid only with the custom date filter.'
      });
    }
    if (query.dateStart && query.dateEnd && query.dateEnd < query.dateStart) {
      context.addIssue({
        code: 'custom',
        path: ['dateEnd'],
        message: 'The selected date range must end on or after it starts.'
      });
    }
    const nearFieldCount = [
      query.nearLongitude,
      query.nearLatitude,
      query.nearRadiusMeters
    ].filter((value) => value !== undefined).length;
    if (nearFieldCount !== 0 && nearFieldCount !== 3) {
      context.addIssue({
        code: 'custom',
        path: ['nearRadiusMeters'],
        message:
          'nearLongitude, nearLatitude, and nearRadiusMeters must be provided together.'
      });
    }
  });

export const directDistanceQuerySchema = z.object({
  longitude: z.coerce.number().min(-180).max(180),
  latitude: z.coerce.number().min(-90).max(90),
  radiusMeters: z.coerce.number().positive().max(50_000)
});

// Batch hydration for the Favoris section: favorites are stored client-side
// only (no account system, see DEC-0007), so the client already knows which
// event ids it wants - this just fetches full PublicEvent objects for ids
// that may be outside the currently-loaded map viewport. Capped at 100 to
// keep the query string bounded.
export const eventIdsQuerySchema = z
  .object({
    ids: z
      .string()
      .min(1)
      .transform((value) => value.split(','))
      .pipe(z.array(z.uuid()).min(1).max(100))
  })
  .strict();

export const venuesQuerySchema = z
  .object({
    west: z.coerce.number().min(-180).max(180),
    south: z.coerce.number().min(-90).max(90),
    east: z.coerce.number().min(-180).max(180),
    north: z.coerce.number().min(-90).max(90)
  })
  .strict()
  .refine(
    (bounds) => bounds.west < bounds.east && bounds.south < bounds.north,
    { message: 'Bounds must have increasing west/east and south/north values.' }
  );

// A venue with no upcoming event of its own - a hand-curated landmark added
// as a fixed reference point in the Lieux view (see /venues), distinct from
// PublicEvent's embedded `venue` object which always comes with a real
// event attached.
export const publicVenueSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  address: z.string().min(1),
  point: geographicPointSchema,
  // Absent for almost every ingested venue - see VENUE_CATEGORIES's comment
  // in @pulso/domain. Never inferred, only ever hand-set.
  category: z.enum(VENUE_CATEGORIES).optional(),
  // Additional real characteristics beyond the one shown as the primary
  // badge (e.g. a dancing bar is `category: 'bar'` with
  // `secondaryCategories: ['nightclub']`) - same "never inferred, only
  // hand-set" rule as `category`.
  secondaryCategories: z.array(z.enum(VENUE_CATEGORIES)).optional(),
  // A real photo of the venue, when a source actually provides one.
  imageUrl: z.url().optional()
});

export const venueListResponseSchema = z.object({
  data: z.array(publicVenueSchema)
});

// Real, aggregate-only "popularity" for a venue (Phase 4.12's Lieux page) -
// how many users have this venue in their favorites. Never who, and never a
// venue-scoped attendee list (no such data exists) - just a count, batched
// for a whole grid at once, same shape/spirit as eventEngagementResponseSchema.
export const venueIdsQuerySchema = z
  .object({
    ids: z
      .string()
      .min(1)
      .transform((value) => value.split(','))
      .pipe(z.array(z.uuid()).min(1).max(100))
  })
  .strict();
export const venueFavoriteCountsResponseSchema = z.object({
  data: z.array(
    z.object({ venueId: z.uuid(), favoriteCount: z.number().int().min(0) })
  )
});

// The account itself. `bio`/`coverStyle`/`avatarStyle` (Phase 4.7) are the
// only user-authored profile fields - everything else is either provided by
// Google or derived on demand (see /me/trends), never a stored preference
// invented beyond what the user actually gave Pulso. `coverStyle`/
// `avatarStyle` are keys into small fixed preset sets (see
// PROFILE_COVER_STYLES/PROFILE_AVATAR_STYLES on the web side), never a photo
// upload - Pulso doesn't store user images beyond the Google avatar.
export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().min(1),
  avatarUrl: z.url().optional(),
  createdAt: z.iso.datetime(),
  bio: z.string().max(280).optional(),
  coverStyle: z.string().optional(),
  avatarStyle: z.string().optional()
});

export const meResponseSchema = z.object({ data: userSchema });

// Fixed set of brand-gradient banner presets for the profile page (Phase
// 4.7) - never a photo upload, since Pulso stores no user images beyond the
// Google avatar. Shared between contracts (validation) and the web app
// (rendering each key to its actual gradient).
export const PROFILE_COVER_STYLES = [
  'aurora',
  'sunset',
  'midnight',
  'nebula'
] as const;

// Fixed set of preset avatars (emoji + gradient, defined on the web side) -
// picking one overrides the Google avatar photo everywhere the user's own
// avatar appears. Same "no upload" rationale as PROFILE_COVER_STYLES.
export const PROFILE_AVATAR_STYLES = [
  'note',
  'disco',
  'moon',
  'star',
  'flame',
  'heart'
] as const;

export const updateProfileRequestSchema = z.object({
  bio: z.string().max(280).optional(),
  coverStyle: z.enum(PROFILE_COVER_STYLES).optional(),
  // An empty string is the explicit "clear it, go back to the Google photo"
  // signal - `undefined` means "leave whatever is stored today untouched"
  // (see PostgresAuthRepository.updateProfile's COALESCE-based update).
  avatarStyle: z
    .union([z.enum(PROFILE_AVATAR_STYLES), z.literal('')])
    .optional()
});

// Real, derived counts only - deliberately not the mockup's "heures passées
// en soirée"/"amis rencontrés" (no duration or in-person-confirmation data
// exists anywhere in Pulso, and won't be invented to fill a stat tile).
export const profileStatsResponseSchema = z.object({
  data: z.object({
    eventsAttended: z.number().int().min(0),
    venuesDiscovered: z.number().int().min(0),
    groupsJoined: z.number().int().min(0),
    favoritesCount: z.number().int().min(0)
  })
});

// A real, chronological account-activity feed - each entry is something the
// user actually did (favorited/attended/joined), assembled from timestamps
// that already existed in the database but were never surfaced together.
// No "avis" (review) entry kind exists yet since reviews aren't built.
export const activityEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('favorited_event'),
    occurredAt: z.iso.datetime(),
    eventId: z.uuid(),
    eventTitle: z.string()
  }),
  z.object({
    kind: z.literal('favorited_venue'),
    occurredAt: z.iso.datetime(),
    venueId: z.uuid(),
    venueName: z.string()
  }),
  z.object({
    kind: z.literal('attended_event'),
    occurredAt: z.iso.datetime(),
    eventId: z.uuid(),
    eventTitle: z.string()
  }),
  z.object({
    kind: z.literal('joined_group'),
    occurredAt: z.iso.datetime(),
    groupId: z.uuid(),
    groupName: z.string()
  })
]);
export const activityResponseSchema = z.object({
  data: z.array(activityEntrySchema)
});

// PUT replaces the stored set with exactly the given ids - a plain
// declarative write, so toggling a favorite on/off while signed in behaves
// as expected. DEC-0007's cross-device merge rule (never silently drop a
// favorite that only exists locally) is the client's job at login time: it
// fetches the account's current ids, unions them with its local ones, then
// PUTs the union.
export const favoriteEventsRequestSchema = z.object({
  eventIds: z.array(z.uuid())
});
export const favoriteEventsResponseSchema = z.object({
  data: z.object({ eventIds: z.array(z.uuid()) })
});

export const favoriteVenuesRequestSchema = z.object({
  venueIds: z.array(z.uuid())
});
export const favoriteVenuesResponseSchema = z.object({
  data: z.object({ venueIds: z.array(z.uuid()) })
});

// A real aggregation of the account's own favorites (category frequency),
// never an inferred or ML-derived recommendation - same "no fabricated
// data" principle as deriveVenuePriceTier. Sorted most-favorited first;
// a category with zero favorites is simply absent rather than listed at 0.
export const trendsResponseSchema = z.object({
  data: z.object({
    eventCategories: z.array(
      z.object({
        category: z.enum(EVENT_CATEGORIES),
        count: z.number().int().min(1)
      })
    ),
    venueCategories: z.array(
      z.object({
        category: z.enum(VENUE_CATEGORIES),
        count: z.number().int().min(1)
      })
    )
  })
});

// The public view of a user - id, display name, avatar only. Never an
// email or friend_code, since this shape is used to show OTHER accounts
// (friends, pending requests) rather than the signed-in user themselves.
export const publicUserSchema = z.object({
  id: z.uuid(),
  displayName: z.string().min(1),
  avatarUrl: z.url().optional()
});

export const friendCodeResponseSchema = z.object({
  data: z.object({ friendCode: z.string() })
});

export const sendFriendRequestSchema = z.object({
  friendCode: z.string().min(1)
});

export const friendRequestSchema = z.object({
  id: z.uuid(),
  user: publicUserSchema,
  direction: z.enum(['incoming', 'outgoing']),
  createdAt: z.iso.datetime()
});
export const friendRequestsResponseSchema = z.object({
  data: z.array(friendRequestSchema)
});

export const respondFriendRequestSchema = z.object({
  action: z.enum(['accept', 'decline'])
});

export const friendsResponseSchema = z.object({
  data: z.array(publicUserSchema)
});

// Private by default (DEC-0011): nothing about a user's plans is shared
// until they explicitly set visibility to "friends" for that event.
export const attendanceVisibilitySchema = z.enum(['private', 'friends']);

export const setAttendanceRequestSchema = z.object({
  visibility: attendanceVisibilitySchema
});

export const myAttendanceResponseSchema = z.object({
  data: z.array(
    z.object({ eventId: z.uuid(), visibility: attendanceVisibilitySchema })
  )
});

export const friendsAttendingResponseSchema = z.object({
  data: z.array(publicUserSchema)
});

// Batched version of the above (Phase 4.11's Événements page) - one real
// attendee count + one real friends-attending list per event, for a whole
// grid at once instead of one request per card. attendeeCount is the raw
// total (both visibilities counted, never who); friendsAttending keeps the
// same accepted-friends/visibility='friends' privacy rule as the
// single-event route.
export const eventEngagementEntrySchema = z.object({
  eventId: z.uuid(),
  attendeeCount: z.number().int().min(0),
  friendsAttending: z.array(publicUserSchema)
});
export const eventEngagementResponseSchema = z.object({
  data: z.array(eventEngagementEntrySchema)
});

// DEC-0012 v1.1: user-generated content, not editable after posting (only
// deletable by its author). A reply is a post with a parentId - one level
// of nesting only, no recursive threads.
export const forumCategorySchema = z.enum(FORUM_CATEGORIES);

export const forumPostSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  author: publicUserSchema,
  category: forumCategorySchema,
  body: z.string().min(1),
  createdAt: z.iso.datetime(),
  parentId: z.uuid().optional(),
  likeCount: z.number().int().min(0),
  likedByMe: z.boolean(),
  replyCount: z.number().int().min(0)
});

export const createForumPostRequestSchema = z.object({
  body: z.string().min(1).max(2000),
  parentId: z.uuid().optional()
});

export const forumPostsResponseSchema = z.object({
  data: z.array(forumPostSchema)
});

export const forumPostResponseSchema = z.object({
  data: forumPostSchema
});

// Powers the dashboard's "Forums actifs" widget - scoped to the caller's
// own favorited/attended events, never a public/global feed.
export const activeForumSchema = z.object({
  eventId: z.uuid(),
  eventTitle: z.string().min(1),
  category: forumCategorySchema,
  lastPostAt: z.iso.datetime(),
  lastPostExcerpt: z.string().min(1),
  postCount: z.number().int().min(0)
});

export const activeForumsResponseSchema = z.object({
  data: z.array(activeForumSchema)
});

// Messages exist only between accepted friends (DEC-0012) - the API
// enforces that, this schema just describes the shape once sent.
export const messageSchema = z.object({
  id: z.uuid(),
  senderId: z.uuid(),
  recipientId: z.uuid(),
  body: z.string().min(1),
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().optional()
});

export const sendMessageRequestSchema = z.object({
  body: z.string().min(1).max(2000)
});

export const conversationResponseSchema = z.object({
  data: z.array(messageSchema)
});

export const messageResponseSchema = z.object({
  data: messageSchema
});

export const unreadCountResponseSchema = z.object({
  data: z.object({ count: z.number().int().min(0) })
});

// One row per accepted friend (not just ones with an existing message
// history) - powers the Messages page's conversation list.
export const conversationSummarySchema = z.object({
  friend: publicUserSchema,
  lastMessage: messageSchema.optional(),
  unreadCount: z.number().int().min(0)
});

export const conversationsResponseSchema = z.object({
  data: z.array(conversationSummarySchema)
});

// Captures a report only (DEC-0012) - no moderation queue or automated
// action exists yet, this is a minimal safety net.
export const reportTargetTypeSchema = z.enum([
  'forum_post',
  'message',
  'group_post'
]);

export const createReportRequestSchema = z.object({
  targetType: reportTargetTypeSchema,
  targetId: z.uuid(),
  reason: z.string().max(500).optional()
});

// DEC-0013 v1.2: open OR restricted membership (restricted = join creates
// a pending request the moderator must approve, same shape as friend
// requests), and a moderator role narrowly scoped to that approval - never
// content moderation, never removing a member. `eventId` (Phase 4.8) is
// set only for the one meetup group findOrCreateEventGroup creates/finds
// per event ("Rencontrer avant l'événement") - undefined for every group
// created the normal way. `meetupVenue` (Phase 4.10) is derived from that
// same linked event's real venue, never entered by hand.
export const groupVisibilitySchema = z.enum(['open', 'restricted']);
export const groupMembershipStatusSchema = z.enum(['member', 'pending']);
export const attendanceResponseSchema = z.enum(['yes', 'maybe', 'no']);

export const groupMeetupVenueSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  longitude: z.number(),
  latitude: z.number()
});

export const groupSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime(),
  memberCount: z.number().int().min(0),
  isMember: z.boolean(),
  eventId: z.uuid().optional(),
  visibility: groupVisibilitySchema,
  isModerator: z.boolean(),
  myStatus: groupMembershipStatusSchema.optional(),
  pendingRequestCount: z.number().int().min(0).optional(),
  meetupVenue: groupMeetupVenueSchema.optional(),
  eventTitle: z.string().min(1).optional(),
  eventStartsAt: z.iso.datetime().optional(),
  // Phase 4.14: this viewer's own choice to show this group in their
  // sidebar shortcut list - always false for a group they haven't joined.
  pinned: z.boolean()
});

export const createGroupRequestSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(500).optional(),
  visibility: groupVisibilitySchema.optional()
});

export const setGroupPinnedRequestSchema = z.object({
  pinned: z.boolean()
});

export const groupsResponseSchema = z.object({
  data: z.array(groupSchema)
});

export const groupResponseSchema = z.object({
  data: groupSchema
});

// Real accepted members (Phase 4.10's avatar stack) - never a fabricated
// count, always the actual people who joined.
export const groupMembersResponseSchema = z.object({
  data: z.array(publicUserSchema)
});

// "Demandes" for a restricted group (Phase 4.10) - moderator-only.
export const groupJoinRequestsResponseSchema = z.object({
  data: z.array(publicUserSchema)
});
export const respondGroupJoinRequestSchema = z.object({
  action: z.enum(['accept', 'decline'])
});
// What joinGroup actually did - immediate membership (open group) or a
// pending request now awaiting the moderator (restricted group).
export const joinGroupResponseSchema = z.object({
  status: groupMembershipStatusSchema
});

// "Découvrir" (Phase 4.10, fulfills DEC-0013 v1.1's principle approval) -
// permanent groups (no event tie-in) or event-linked groups, never mixed
// in the same request.
export const discoverGroupEntrySchema = z.object({
  group: groupSchema,
  event: z
    .object({
      id: z.uuid(),
      title: z.string().min(1),
      startsAt: z.iso.datetime(),
      category: z.enum(EVENT_CATEGORIES)
    })
    .optional()
});
export const discoverGroupsResponseSchema = z.object({
  data: z.array(discoverGroupEntrySchema)
});

// "Programme" (Phase 4.10) - real items added by members, sorted by time.
export const groupScheduleItemSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  label: z.string().min(1),
  scheduledAt: z.iso.datetime(),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime()
});
export const createGroupScheduleItemRequestSchema = z.object({
  label: z.string().min(1).max(120),
  scheduledAt: z.iso.datetime()
});
export const groupScheduleItemsResponseSchema = z.object({
  data: z.array(groupScheduleItemSchema)
});

// "Qui vient ?" (Phase 4.10) - real votes from real members, percentages
// computed client-side from these real counts, never simulated.
export const groupAttendanceSummarySchema = z.object({
  yes: z.number().int().min(0),
  maybe: z.number().int().min(0),
  no: z.number().int().min(0),
  myResponse: attendanceResponseSchema.optional()
});
export const setGroupAttendanceRequestSchema = z.object({
  response: attendanceResponseSchema
});

// "Checklist" (Phase 4.10) - checkedCount/totalMembers is real: how many
// of the group's real members have personally checked this item off.
export const groupChecklistItemSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  label: z.string().min(1),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime(),
  checkedCount: z.number().int().min(0),
  totalMembers: z.number().int().min(0),
  checkedByMe: z.boolean()
});
export const createGroupChecklistItemRequestSchema = z.object({
  label: z.string().min(1).max(120)
});
export const setGroupChecklistCheckRequestSchema = z.object({
  checked: z.boolean()
});
export const groupChecklistItemsResponseSchema = z.object({
  data: z.array(groupChecklistItemSchema)
});

// Same content model as the event forum (DEC-0012 v1.1): one level of
// nested replies, one like per user per post, author-only delete.
export const groupPostSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  author: publicUserSchema,
  body: z.string().min(1),
  createdAt: z.iso.datetime(),
  parentId: z.uuid().optional(),
  likeCount: z.number().int().min(0),
  likedByMe: z.boolean(),
  replyCount: z.number().int().min(0)
});

export const createGroupPostRequestSchema = z.object({
  body: z.string().min(1).max(2000),
  parentId: z.uuid().optional()
});

export const groupPostsResponseSchema = z.object({
  data: z.array(groupPostSchema)
});

export const groupPostResponseSchema = z.object({
  data: groupPostSchema
});

export const publicEventSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  category: z.enum(EVENT_CATEGORIES),
  status: z.enum(EVENT_STATUSES),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().optional(),
  timezone: z.literal('America/Toronto'),
  price: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('free'), currency: z.literal('CAD') }),
    z.object({
      kind: z.literal('paid'),
      currency: z.literal('CAD'),
      minimumAmount: z.number().nonnegative().optional()
    }),
    z.object({ kind: z.literal('unknown'), currency: z.literal('CAD') })
  ]),
  description: z.string().min(1).optional(),
  organizer: z.string().min(1).optional(),
  // A real photo from the source, when it provides one - absent rather
  // than a fabricated/generic image when it doesn't (e.g. Ville de
  // Montréal's open data has no image field at all).
  imageUrl: z.url().optional(),
  accessInformation: z.string().min(1),
  venue: z.object({
    id: z.uuid(),
    name: z.string().min(1),
    address: z.string().min(1),
    point: geographicPointSchema,
    category: z.enum(VENUE_CATEGORIES).optional(),
    secondaryCategories: z.array(z.enum(VENUE_CATEGORIES)).optional(),
    // A real photo of the venue, when a source actually provides one.
    imageUrl: z.url().optional()
  }),
  source: z.object({
    name: z.string().min(1),
    url: z.url(),
    observedAt: z.iso.datetime()
  }),
  // Present only when ingestion recognized the same event on more than one
  // source (see DATA-0003's mapping proposal); `source` above stays the
  // single most-authoritative one. Never a second occurrence of the event
  // itself - callers must not render this as a duplicate marker.
  additionalSources: z
    .array(
      z.object({
        name: z.string().min(1),
        url: z.url(),
        observedAt: z.iso.datetime()
      })
    )
    .optional(),
  trust: z.object({
    label: z.enum(TRUST_LABELS),
    freshness: z.enum(FRESHNESS_STATES),
    locationConfidence: z.enum(LOCATION_CONFIDENCE_STATES)
  }),
  externalDestination: z
    .object({
      label: z.string().min(1),
      kind: z.enum(['event_source', 'ticketing']),
      status: z.enum(['available', 'unavailable'])
    })
    .optional(),
  distanceMeters: z.number().nonnegative().optional()
});

export const eventListResponseSchema = z.object({
  data: z.array(publicEventSchema)
});

// Forums discovery grid (Phase 4.8) - one entry per upcoming event, not
// scoped to the caller's own favorites/attendance (unlike activeForumSchema
// above). memberCount is a real count of distinct forum authors - there is
// no membership/join concept (DEC-0012 unchanged), so this is the only
// honest "members" number. postCount/lastPostAt/lastPostExcerpt are absent
// for an event nobody has posted in yet, rather than zero/fabricated
// placeholders.
export const discoverForumEntrySchema = z.object({
  event: publicEventSchema,
  postCount: z.number().int().min(0),
  memberCount: z.number().int().min(0),
  lastPostAt: z.iso.datetime().optional(),
  lastPostExcerpt: z.string().optional()
});
export const discoverForumsResponseSchema = z.object({
  data: z.array(discoverForumEntrySchema)
});

// "Membres" tab (Phase 4.8) - distinct authors across an event's forum.
export const forumMembersResponseSchema = z.object({
  data: z.array(publicUserSchema)
});

// "Suivre ce forum" (Phase 4.8 follow-up) - lets a signed-in user keep a
// forum in "Mes forums" without posting or favoriting/attending the event.
export const forumFollowResponseSchema = z.object({
  following: z.boolean()
});

// "Photos" tab (Phase 4.8 follow-up) - real photos of the event, distinct
// from the forum's text-only posts (DEC-0012's "no attachments" boundary
// is unchanged there, see DEC-0012 v1.2). url is a full, ready-to-use URL
// built by the API from its own upload storage, never a raw file path.
export const eventPhotoSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  uploader: publicUserSchema,
  url: z.url(),
  createdAt: z.iso.datetime()
});
export const eventPhotosResponseSchema = z.object({
  data: z.array(eventPhotoSchema)
});
export const eventPhotoResponseSchema = z.object({
  data: eventPhotoSchema
});
export const eventDetailsResponseSchema = z.object({ data: publicEventSchema });
export const errorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() })
});

export type PublicEvent = z.infer<typeof publicEventSchema>;
export type EventListResponse = z.infer<typeof eventListResponseSchema>;
export type DiscoverForumEntry = z.infer<typeof discoverForumEntrySchema>;
export type DiscoverForumsResponse = z.infer<
  typeof discoverForumsResponseSchema
>;
export type ForumMembersResponse = z.infer<typeof forumMembersResponseSchema>;
export type ForumFollowResponse = z.infer<typeof forumFollowResponseSchema>;
export type EventPhoto = z.infer<typeof eventPhotoSchema>;
export type EventPhotosResponse = z.infer<typeof eventPhotosResponseSchema>;
export type EventDetailsResponse = z.infer<typeof eventDetailsResponseSchema>;
export type MapBoundsQuery = z.infer<typeof mapBoundsQuerySchema>;
export type DirectDistanceQuery = z.infer<typeof directDistanceQuerySchema>;
export type EventIdsQuery = z.infer<typeof eventIdsQuerySchema>;
export type VenuesQuery = z.infer<typeof venuesQuerySchema>;
export type PublicVenue = z.infer<typeof publicVenueSchema>;
export type VenueListResponse = z.infer<typeof venueListResponseSchema>;
export type VenueIdsQuery = z.infer<typeof venueIdsQuerySchema>;
export type VenueFavoriteCountsResponse = z.infer<
  typeof venueFavoriteCountsResponseSchema
>;
export type User = z.infer<typeof userSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type FavoriteEventsRequest = z.infer<typeof favoriteEventsRequestSchema>;
export type FavoriteEventsResponse = z.infer<
  typeof favoriteEventsResponseSchema
>;
export type FavoriteVenuesRequest = z.infer<typeof favoriteVenuesRequestSchema>;
export type FavoriteVenuesResponse = z.infer<
  typeof favoriteVenuesResponseSchema
>;
export type TrendsResponse = z.infer<typeof trendsResponseSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type ProfileStatsResponse = z.infer<typeof profileStatsResponseSchema>;
export type ActivityEntry = z.infer<typeof activityEntrySchema>;
export type ActivityResponse = z.infer<typeof activityResponseSchema>;
export type FriendCodeResponse = z.infer<typeof friendCodeResponseSchema>;
export type SendFriendRequest = z.infer<typeof sendFriendRequestSchema>;
export type FriendRequestEntry = z.infer<typeof friendRequestSchema>;
export type FriendRequestsResponse = z.infer<
  typeof friendRequestsResponseSchema
>;
export type RespondFriendRequest = z.infer<typeof respondFriendRequestSchema>;
export type FriendsResponse = z.infer<typeof friendsResponseSchema>;
export type AttendanceVisibility = z.infer<typeof attendanceVisibilitySchema>;
export type SetAttendanceRequest = z.infer<typeof setAttendanceRequestSchema>;
export type MyAttendanceResponse = z.infer<typeof myAttendanceResponseSchema>;
export type FriendsAttendingResponse = z.infer<
  typeof friendsAttendingResponseSchema
>;
export type EventEngagementEntry = z.infer<typeof eventEngagementEntrySchema>;
export type EventEngagementResponse = z.infer<
  typeof eventEngagementResponseSchema
>;
export type ForumCategory = z.infer<typeof forumCategorySchema>;
export type ForumPost = z.infer<typeof forumPostSchema>;
export type CreateForumPostRequest = z.infer<
  typeof createForumPostRequestSchema
>;
export type ForumPostsResponse = z.infer<typeof forumPostsResponseSchema>;
export type ForumPostResponse = z.infer<typeof forumPostResponseSchema>;
export type ActiveForum = z.infer<typeof activeForumSchema>;
export type ActiveForumsResponse = z.infer<typeof activeForumsResponseSchema>;
export type Message = z.infer<typeof messageSchema>;
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;
export type ConversationResponse = z.infer<typeof conversationResponseSchema>;
export type MessageResponse = z.infer<typeof messageResponseSchema>;
export type UnreadCountResponse = z.infer<typeof unreadCountResponseSchema>;
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
export type ConversationsResponse = z.infer<typeof conversationsResponseSchema>;
export type ReportTargetType = z.infer<typeof reportTargetTypeSchema>;
export type CreateReportRequest = z.infer<typeof createReportRequestSchema>;
export type Group = z.infer<typeof groupSchema>;
export type CreateGroupRequest = z.infer<typeof createGroupRequestSchema>;
export type SetGroupPinnedRequest = z.infer<typeof setGroupPinnedRequestSchema>;
export type GroupsResponse = z.infer<typeof groupsResponseSchema>;
export type GroupResponse = z.infer<typeof groupResponseSchema>;
export type GroupPost = z.infer<typeof groupPostSchema>;
export type CreateGroupPostRequest = z.infer<
  typeof createGroupPostRequestSchema
>;
export type GroupPostsResponse = z.infer<typeof groupPostsResponseSchema>;
export type GroupPostResponse = z.infer<typeof groupPostResponseSchema>;
export type GroupVisibility = z.infer<typeof groupVisibilitySchema>;
export type GroupMembershipStatus = z.infer<typeof groupMembershipStatusSchema>;
export type AttendanceResponse = z.infer<typeof attendanceResponseSchema>;
export type GroupMeetupVenue = z.infer<typeof groupMeetupVenueSchema>;
export type GroupMembersResponse = z.infer<typeof groupMembersResponseSchema>;
export type GroupJoinRequestsResponse = z.infer<
  typeof groupJoinRequestsResponseSchema
>;
export type RespondGroupJoinRequest = z.infer<
  typeof respondGroupJoinRequestSchema
>;
export type JoinGroupResponse = z.infer<typeof joinGroupResponseSchema>;
export type DiscoverGroupEntry = z.infer<typeof discoverGroupEntrySchema>;
export type DiscoverGroupsResponse = z.infer<
  typeof discoverGroupsResponseSchema
>;
export type GroupScheduleItem = z.infer<typeof groupScheduleItemSchema>;
export type CreateGroupScheduleItemRequest = z.infer<
  typeof createGroupScheduleItemRequestSchema
>;
export type GroupScheduleItemsResponse = z.infer<
  typeof groupScheduleItemsResponseSchema
>;
export type GroupAttendanceSummary = z.infer<
  typeof groupAttendanceSummarySchema
>;
export type SetGroupAttendanceRequest = z.infer<
  typeof setGroupAttendanceRequestSchema
>;
export type GroupChecklistItem = z.infer<typeof groupChecklistItemSchema>;
export type CreateGroupChecklistItemRequest = z.infer<
  typeof createGroupChecklistItemRequestSchema
>;
export type SetGroupChecklistCheckRequest = z.infer<
  typeof setGroupChecklistCheckRequestSchema
>;
export type GroupChecklistItemsResponse = z.infer<
  typeof groupChecklistItemsResponseSchema
>;

export const searchConstraintKeySchema = z.enum([
  'date',
  'categories',
  'price',
  'excluded_categories'
]);

export const searchFiltersSchema = z
  .object({
    date: z.enum(DATE_FILTER_VALUES),
    categories: z.array(z.enum(EVENT_CATEGORIES)).max(EVENT_CATEGORIES.length),
    price: z.enum(PRICE_FILTER_VALUES),
    customStartDate: dateStringSchema.optional(),
    customEndDate: dateStringSchema.optional()
  })
  .strict()
  .superRefine((filters, context) => {
    if (new Set(filters.categories).size !== filters.categories.length) {
      context.addIssue({
        code: 'custom',
        path: ['categories'],
        message: 'Categories must not contain duplicates.'
      });
    }
    if (filters.date === 'custom' && !filters.customStartDate) {
      context.addIssue({
        code: 'custom',
        path: ['customStartDate'],
        message: 'A selected date is required for a custom date filter.'
      });
    }
    if (
      filters.date !== 'custom' &&
      (filters.customStartDate || filters.customEndDate)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['customStartDate'],
        message: 'Selected dates are valid only with the custom date filter.'
      });
    }
    if (
      filters.customStartDate &&
      filters.customEndDate &&
      filters.customEndDate < filters.customStartDate
    ) {
      context.addIssue({
        code: 'custom',
        path: ['customEndDate'],
        message: 'The selected date range must end on or after it starts.'
      });
    }
  });

export const intelligentSearchRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(240),
    locale: z.enum(SUPPORTED_LOCALES),
    bounds: mapBoundsSchema,
    manualFilters: searchFiltersSchema,
    disabledDerivedKeys: z
      .array(searchConstraintKeySchema)
      .max(4)
      .refine((values) => new Set(values).size === values.length, {
        message: 'Disabled criteria must not contain duplicates.'
      })
      .default([])
  })
  .strict();

export const searchMessageSchema = z
  .object({
    code: z.enum(SEARCH_MESSAGE_CODES),
    params: z.record(z.string(), z.union([z.string(), z.number()])).optional()
  })
  .strict();

export const searchExplanationSchema = z
  .object({
    key: z.string().min(1),
    kind: z.enum(['hard', 'ranking']),
    message: searchMessageSchema
  })
  .strict();

export const intelligentSearchResponseSchema = z
  .object({
    interpretation: z
      .object({
        engine: z.literal('deterministic'),
        language: z.enum(SUPPORTED_LOCALES),
        constraints: z.array(searchExplanationSchema),
        rankingSignals: z.array(searchExplanationSchema),
        effectiveFilters: searchFiltersSchema
      })
      .strict(),
    condition: z.enum([
      'exact',
      'alternative',
      'no_reliable_result',
      'clarification'
    ]),
    message: searchMessageSchema,
    clarification: searchMessageSchema.optional(),
    data: z.array(
      z
        .object({
          event: publicEventSchema,
          matchType: z.enum(['exact', 'alternative']),
          reasons: z.array(searchMessageSchema).min(1),
          differences: z.array(searchMessageSchema)
        })
        .strict()
    )
  })
  .strict();

export type SearchConstraintKey = z.infer<typeof searchConstraintKeySchema>;
export type SearchMessage = z.infer<typeof searchMessageSchema>;
export type SearchExplanation = z.infer<typeof searchExplanationSchema>;
export type IntelligentSearchRequest = z.infer<
  typeof intelligentSearchRequestSchema
>;
export type IntelligentSearchResponse = z.infer<
  typeof intelligentSearchResponseSchema
>;

export const DATE_FILTER_OPTIONS = [
  { value: 'today' },
  { value: 'tonight' },
  { value: 'tomorrow' },
  { value: 'weekend' },
  { value: 'next7' },
  { value: 'custom' }
] as const;

export const CATEGORY_FILTER_OPTIONS: ReadonlyArray<{
  value: EventCategory;
}> = [
  { value: 'music' },
  { value: 'nightlife' },
  { value: 'festival' },
  { value: 'show' },
  { value: 'comedy' },
  { value: 'other' }
];

export const PRICE_FILTER_OPTIONS = [
  { value: 'all' },
  { value: 'free' },
  { value: 'paid' }
] as const;

export const VENUE_CATEGORY_FILTER_OPTIONS: ReadonlyArray<{
  value: VenueCategory;
}> = [
  { value: 'bar' },
  { value: 'nightclub' },
  { value: 'concert_hall' },
  { value: 'theater' },
  { value: 'brewery_with_stage' },
  { value: 'outdoor_festival_site' },
  { value: 'cafe_concert' },
  { value: 'gallery_museum' },
  { value: 'community_space' },
  { value: 'other' }
];

export function buildMapEventsQuery(
  bounds: MapBounds,
  filters: DiscoveryFilters,
  near?: { longitude: number; latitude: number; radiusMeters: number }
): string {
  const parameters = new URLSearchParams({
    west: String(bounds.west),
    south: String(bounds.south),
    east: String(bounds.east),
    north: String(bounds.north),
    date: filters.date,
    price: filters.price
  });
  if (filters.categories.length > 0) {
    parameters.set('categories', filters.categories.join(','));
  }
  if (filters.date === 'custom' && filters.customStartDate) {
    parameters.set('dateStart', filters.customStartDate);
    if (filters.customEndDate) {
      parameters.set('dateEnd', filters.customEndDate);
    }
  }
  if (near) {
    parameters.set('nearLongitude', String(near.longitude));
    parameters.set('nearLatitude', String(near.latitude));
    parameters.set('nearRadiusMeters', String(near.radiusMeters));
  }
  return parameters.toString();
}

export interface ActiveFilterSummary {
  key: 'date' | 'category' | 'price';
  value: string;
  label: string;
}

export function summarizeActiveFilters(
  filters: DiscoveryFilters,
  locale: SupportedLocale
): ActiveFilterSummary[] {
  const summary: ActiveFilterSummary[] = [];
  if (filters.date !== DEFAULT_DISCOVERY_FILTERS.date) {
    const dateLabel = getDateFilterLabel(locale, filters.date);
    const selectedRange =
      filters.date === 'custom' && filters.customStartDate
        ? filters.customEndDate &&
          filters.customEndDate !== filters.customStartDate
          ? `: ${filters.customStartDate} ${locale === 'fr' ? 'au' : 'to'} ${filters.customEndDate}`
          : `: ${filters.customStartDate}`
        : '';
    summary.push({
      key: 'date',
      value: filters.date,
      label: `${dateLabel}${selectedRange}`
    });
  }
  for (const category of filters.categories) {
    summary.push({
      key: 'category',
      value: category,
      label: getCategoryLabel(locale, category)
    });
  }
  if (filters.price !== DEFAULT_DISCOVERY_FILTERS.price) {
    summary.push({
      key: 'price',
      value: filters.price,
      label: getPriceLabel(locale, filters.price)
    });
  }
  return summary;
}

export interface EventPresentation {
  category: string;
  status: string;
  dateTime: string;
  price: string;
  trust: string;
  freshness: string;
  location: string;
  description: string;
  organizer: string;
  externalAction?: string;
  externalUnavailable: string;
  materialWarning?: string;
}

export function presentEvent(
  event: PublicEvent,
  locale: SupportedLocale
): EventPresentation {
  const startsAt = formatMontrealDateTime(event.startsAt, locale);
  const price =
    event.price.kind === 'free'
      ? getPriceLabel(locale, 'free')
      : event.price.kind === 'unknown'
        ? translate(locale, 'price.unknown')
        : event.price.minimumAmount === undefined
          ? translate(locale, 'price.paidUnknown')
          : translate(locale, 'price.from', {
              amount: formatCad(event.price.minimumAmount, locale)
            });
  const trust = getTrustLabel(locale, event.trust.label);
  const materialWarning =
    event.status === 'cancelled'
      ? translate(locale, 'event.warning.cancelled')
      : event.status === 'postponed'
        ? translate(locale, 'event.warning.postponed')
        : event.trust.label === 'to_verify'
          ? translate(locale, 'event.warning.toVerify')
          : event.trust.label === 'conflicting'
            ? translate(locale, 'event.warning.conflicting')
            : event.trust.locationConfidence === 'uncertain'
              ? translate(locale, 'event.warning.location')
              : undefined;
  // Always one of two fixed, generic labels - never the connector-provided
  // one (e.g. an internal scraper/tool name), which is never appropriate to
  // show verbatim to an end user. Which of the two depends on
  // externalDestination.kind: 'ticketing' really does sell/reserve a spot
  // (Ticketmaster, etc.), while 'event_source' is just the organizer's own
  // info page (most Ville de Montréal listings) - "Voir les billets" would
  // overpromise a checkout flow that isn't there.
  const externalAvailable =
    event.status !== 'cancelled' &&
    event.externalDestination?.status === 'available'
      ? translate(
          locale,
          event.externalDestination.kind === 'ticketing'
            ? 'event.external.viewTickets'
            : 'event.external.moreInfo'
        )
      : undefined;

  return {
    category: getCategoryLabel(locale, event.category),
    status: translate(locale, `status.${event.status}`),
    dateTime: startsAt,
    price,
    trust,
    freshness:
      event.trust.freshness === 'stale'
        ? translate(locale, 'event.freshness.stale', {
            date: formatMontrealDate(event.source.observedAt, locale)
          })
        : translate(locale, 'event.freshness.unknown', {
            date: formatMontrealDate(event.source.observedAt, locale)
          }),
    location:
      event.trust.locationConfidence === 'confirmed'
        ? translate(locale, 'location.confirmed')
        : translate(locale, 'location.uncertain'),
    description:
      event.description ?? translate(locale, 'event.descriptionUnknown'),
    organizer: event.organizer ?? translate(locale, 'event.organizerUnknown'),
    externalUnavailable:
      event.status === 'cancelled'
        ? translate(locale, 'event.external.cancelled')
        : translate(locale, 'event.external.unavailable'),
    ...(externalAvailable ? { externalAction: externalAvailable } : {}),
    ...(materialWarning ? { materialWarning } : {})
  };
}
