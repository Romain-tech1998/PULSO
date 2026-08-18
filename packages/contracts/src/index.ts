import {
  DATE_FILTER_VALUES,
  DEFAULT_DISCOVERY_FILTERS,
  EVENT_CATEGORIES,
  EVENT_ORIGINS,
  EVENT_STATUSES,
  FORUM_CATEGORIES,
  FRESHNESS_STATES,
  LOCATION_CONFIDENCE_STATES,
  PRICE_FILTER_VALUES,
  GROUP_MODULES,
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
    nearRadiusMeters: z.coerce.number().positive().max(50_000).optional(),
    // DEC-0017 After filter. Present in the shared bounds contract so the
    // one query builder covers it; the API still ignores it for anonymous
    // callers.
    // Left as the raw string rather than transformed to a boolean: a
    // transform would make the field required in MapBoundsQuery's output
    // type and force every internal caller to pass it.
    after: z.enum(['true', 'false']).optional()
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

// A reviewed recurring venue used as an orientation point on the map (see
// /venues), distinct from PublicEvent's embedded `venue` object which always
// comes with a real event attached. The client de-duplicates the two sets.
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
  imageUrl: z.url().optional(),
  // The credit the photo's licence requires, e.g. "Photo : Jean Gagnon
  // (CC BY-SA 4.0)". Separate from `attribution` below, which credits the
  // *data*: a venue can carry an OpenStreetMap record and a Wikimedia
  // Commons photograph by different authors under different licences, and
  // collapsing the two would misattribute both. Absent when the source
  // imposes no credit - a venue's own preview image of itself does not need
  // to be captioned with the venue's name.
  imageAttribution: z.string().min(1).optional(),
  // An imported place Pulso has not reviewed yet (DEC-0006). Search offers
  // these as labelled suggestions; the map never shows them, because a pin
  // is a claim that Pulso stands behind the record.
  suggested: z.boolean().optional(),
  // Required by the source licence when present. OpenStreetMap data is ODbL:
  // attribution has to travel with the data, so it lives on the record
  // rather than being hard-coded into one component.
  attribution: z.string().min(1).optional(),
  // The source's own opening-hours rule, unparsed. Sent verbatim so the
  // client parses it with the same @pulso/domain code the server would use,
  // and so "open now" is computed against the viewer's real clock rather
  // than baked into a response that goes stale minutes later.
  openingHours: z.string().min(1).optional(),
  // When that rule was last read from the source. Present whenever
  // openingHours is: Pulso states "open now" from this data, and a claim
  // about the present made from a record of unknown age is not one the
  // interface should be able to make by accident.
  openingHoursObservedAt: z.iso.datetime().optional()
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

// Internal-only venue quality signal (any signed-in user, 1-5 stars, an
// optional comment) - used server-side to influence venue ranking. The
// summary (average/count) is real and never inferred, but is deliberately
// not surfaced as a public "reviews" feature until there's enough real
// data for a shown rating to be credible.
export const setVenueRatingRequestSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional()
});
export const myVenueRatingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional()
});
export const myVenueRatingResponseSchema = z.object({
  data: myVenueRatingSchema.nullable()
});
export const venueRatingSummariesResponseSchema = z.object({
  data: z.array(
    z.object({
      venueId: z.uuid(),
      average: z.number().min(1).max(5),
      count: z.number().int().min(1)
    })
  )
});

// The account itself. `bio`/`coverStyle`/`avatarStyle` (Phase 4.7) are the
// only user-authored profile fields - everything else is either provided by
// Google or derived on demand (see /me/trends), never a stored preference
// invented beyond what the user actually gave Pulso. `coverStyle`/
// `avatarStyle` are keys into small fixed preset sets (see
// PROFILE_COVER_STYLES/PROFILE_AVATAR_STYLES on the web side). They were
// once the only avatar a user could choose, because Phase 4.7 stored no
// user image at all; DEC-0020 lifted that and added `photoUrl`, so the
// presets are now the fallback rather than the whole story.
export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().min(1),
  avatarUrl: z.url().optional(),
  createdAt: z.iso.datetime(),
  bio: z.string().max(280).optional(),
  coverStyle: z.string().optional(),
  avatarStyle: z.string().optional(),
  // DEC-0020: a real uploaded photo, and the highest-priority avatar
  // source. Separate from avatarUrl, which mirrors Google and is
  // overwritten on every sign-in - see the migration's note.
  photoUrl: z.url().optional()
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

// DEC-0016: in-app notifications. Display text is composed client-side from
// these referenced rows rather than stored as a frozen label, so a renamed
// venue or a rescheduled event is reflected instead of preserved as a stale
// claim.
//
// `id`/`readAt` are absent on 'upcoming_event' because that kind is derived
// at read time from attendance and start time rather than stored - there is
// nothing to mark read, and it disappears on its own once the event starts.
export const notificationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('venue_new_event'),
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    readAt: z.iso.datetime().nullable(),
    venueId: z.uuid(),
    venueName: z.string(),
    eventId: z.uuid(),
    eventTitle: z.string(),
    eventStartsAt: z.iso.datetime()
  }),
  z.object({
    kind: z.literal('friend_request_received'),
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    readAt: z.iso.datetime().nullable(),
    actorUserId: z.uuid(),
    actorDisplayName: z.string(),
    actorAvatarUrl: z.string().optional()
  }),
  z.object({
    kind: z.literal('friend_request_accepted'),
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    readAt: z.iso.datetime().nullable(),
    actorUserId: z.uuid(),
    actorDisplayName: z.string(),
    actorAvatarUrl: z.string().optional()
  }),
  z.object({
    kind: z.literal('message_received'),
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    readAt: z.iso.datetime().nullable(),
    actorUserId: z.uuid(),
    actorDisplayName: z.string(),
    actorAvatarUrl: z.string().optional()
  }),
  z.object({
    kind: z.literal('forum_reply'),
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    readAt: z.iso.datetime().nullable(),
    actorUserId: z.uuid(),
    actorDisplayName: z.string(),
    actorAvatarUrl: z.string().optional(),
    eventId: z.uuid(),
    eventTitle: z.string()
  }),
  z.object({
    kind: z.literal('organizer_request_received'),
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    readAt: z.iso.datetime().nullable(),
    actorUserId: z.uuid(),
    actorDisplayName: z.string().min(1),
    actorAvatarUrl: z.string().optional(),
    venueId: z.uuid(),
    venueName: z.string().min(1)
  }),
  z.object({
    kind: z.literal('organizer_request_resolved'),
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    readAt: z.iso.datetime().nullable(),
    venueId: z.uuid(),
    venueName: z.string().min(1),
    approved: z.boolean()
  }),
  // Groups. `group_join_request_received` closes a real gap rather than
  // adding noise: a restricted group's pending queue already existed, but
  // nothing ever told its moderator to go look at it.
  z.object({
    kind: z.literal('group_verification_received'),
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    readAt: z.iso.datetime().nullable(),
    actorUserId: z.uuid(),
    actorDisplayName: z.string().min(1),
    actorAvatarUrl: z.string().optional(),
    groupId: z.uuid(),
    groupName: z.string().min(1)
  }),
  z.object({
    kind: z.literal('group_verification_resolved'),
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    readAt: z.iso.datetime().nullable(),
    groupId: z.uuid(),
    groupName: z.string().min(1),
    approved: z.boolean()
  }),
  z.object({
    kind: z.literal('group_join_request_received'),
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    readAt: z.iso.datetime().nullable(),
    actorUserId: z.uuid(),
    actorDisplayName: z.string().min(1),
    actorAvatarUrl: z.string().optional(),
    groupId: z.uuid(),
    groupName: z.string().min(1)
  }),
  z.object({
    kind: z.literal('group_join_request_accepted'),
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    readAt: z.iso.datetime().nullable(),
    groupId: z.uuid(),
    groupName: z.string().min(1)
  }),
  // DEC-0022 §6. Someone is asking an organizer for the exact location of a
  // withheld event.
  z.object({
    kind: z.literal('event_access_requested'),
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    readAt: z.iso.datetime().nullable(),
    actorUserId: z.uuid(),
    actorDisplayName: z.string().min(1),
    actorAvatarUrl: z.string().optional(),
    eventId: z.uuid(),
    eventTitle: z.string().min(1)
  }),
  // Both outcomes are announced. A refusal that notified nobody would leave
  // someone waiting on an answer that already exists (acceptance criterion
  // 12), and an approval nobody hears about discloses an address to a person
  // who never looks again.
  z.object({
    kind: z.literal('event_access_approved'),
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    readAt: z.iso.datetime().nullable(),
    eventId: z.uuid(),
    eventTitle: z.string().min(1)
  }),
  z.object({
    kind: z.literal('event_access_declined'),
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    readAt: z.iso.datetime().nullable(),
    eventId: z.uuid(),
    eventTitle: z.string().min(1)
  }),
  z.object({
    kind: z.literal('upcoming_event'),
    createdAt: z.iso.datetime(),
    eventId: z.uuid(),
    eventTitle: z.string(),
    eventStartsAt: z.iso.datetime(),
    venueName: z.string()
  })
]);
export type Notification = z.infer<typeof notificationSchema>;

export const notificationsResponseSchema = z.object({
  data: z.object({
    notifications: z.array(notificationSchema),
    unreadCount: z.number().int().min(0)
  })
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
  avatarUrl: z.url().optional(),
  // DEC-0020. Carried here so an uploaded photo shows wherever another
  // account already appears (conversation list, members, participants)
  // rather than only on the profile page.
  photoUrl: z.url().optional(),
  avatarStyle: z.string().optional()
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

// Real, batched "N amis en commun" (Phase 4.15) - shown next to friends,
// requests, and suggestions alike. Never a fabricated count.
export const friendMutualCountsResponseSchema = z.object({
  data: z.array(
    z.object({ userId: z.uuid(), mutualFriendCount: z.number().int().min(0) })
  )
});

// "Suggestions pour toi" (Phase 4.15) - friends-of-friends only, ranked by
// the same real mutual-friend count above. Never collaborative filtering.
export const friendSuggestionSchema = z.object({
  user: publicUserSchema,
  mutualFriendCount: z.number().int().min(1)
});
export const friendSuggestionsResponseSchema = z.object({
  data: z.array(friendSuggestionSchema)
});

// A friend's public profile (Phase 4.15) - bio/createdAt already existed on
// the account, just never shared with anyone before. Only ever returned for
// an accepted friend (enforced server-side, not by this schema).
export const friendProfileSchema = publicUserSchema.extend({
  bio: z.string().max(280).optional(),
  createdAt: z.iso.datetime()
});
export const friendProfileResponseSchema = z.object({
  data: friendProfileSchema
});

// "Événements en commun" (Phase 4.15) - real event ids both accounts
// attend; the caller hydrates full PublicEvent objects via /events/by-ids.
export const mutualEventIdsResponseSchema = z.object({
  data: z.array(z.uuid())
});

// "Amis sur la carte" (Phase 4.15) - real upcoming, friends-visible
// attendance across every accepted friend, for plotting real event venues -
// never a live/last-known position (no such data exists).
export const friendsMapEntrySchema = z.object({
  friend: publicUserSchema,
  eventId: z.uuid()
});
export const friendsMapResponseSchema = z.object({
  data: z.array(friendsMapEntrySchema)
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

// One row per account this user has an inbox with: every accepted friend
// (whether or not anything was ever said) plus, since DEC-0020, every
// accepted message request. A pending request is not here - it belongs to
// messageRequestSchema below.
export const conversationSummarySchema = z.object({
  friend: publicUserSchema,
  lastMessage: messageSchema.optional(),
  unreadCount: z.number().int().min(0)
});

export const conversationsResponseSchema = z.object({
  data: z.array(conversationSummarySchema)
});

// DEC-0020 - a conversation waiting to be let in. Carries the one message
// the sender was allowed to send, so the recipient answers on the content
// rather than on a display name alone. `message` is optional only because
// the row and the message are separate writes; in practice one exists.
export const messageRequestSchema = z.object({
  sender: publicUserSchema,
  message: messageSchema.optional(),
  createdAt: z.iso.datetime()
});

export const messageRequestsResponseSchema = z.object({
  data: z.array(messageRequestSchema)
});

export const respondToMessageRequestSchema = z.object({
  action: z.enum(['accept', 'decline'])
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
export const groupVisibilitySchema = z.enum([
  'open',
  'restricted',
  'private_invite'
]);
export const groupTypeSchema = z.enum(['community', 'event', 'private_crew']);
// Requested by the group's creator, granted by a Pulso administrator - the
// same request/approve shape DEC-0018 established for organizer accounts.
// 'none' and 'declined' stay distinct so a refused group can ask again
// without the interface pretending it never asked.
export const groupVerificationStatusSchema = z.enum([
  'none',
  'pending',
  'verified',
  'declined'
]);
export const groupMembershipStatusSchema = z.enum(['member', 'pending']);
export const attendanceResponseSchema = z.enum(['yes', 'maybe', 'no']);

export const groupMeetupVenueSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  longitude: z.number(),
  latitude: z.number()
});

// DEC-0015's module registry, typed rather than `z.array(z.any())`: `any`
// let a misspelled module name through the contract and into `modules_config`
// jsonb, where nothing would ever reject it.
export const groupModuleConfigSchema = z
  .object({
    module: z.enum(GROUP_MODULES),
    enabled: z.boolean(),
    position: z.number().int().min(0)
  })
  .strict();

export const groupSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime(),
  memberCount: z.number().int().min(0),
  isMember: z.boolean(),
  eventId: z.uuid().optional(),
  type: groupTypeSchema,
  visibility: groupVisibilitySchema,
  // Normalized by the repository before it ever reaches here: unknown
  // module names dropped, missing ones appended disabled, positions
  // renumbered. So this can be the real type rather than `any[]`.
  modulesConfig: z.array(groupModuleConfigSchema),
  isModerator: z.boolean(),
  myStatus: groupMembershipStatusSchema.optional(),
  pendingRequestCount: z.number().int().min(0).optional(),
  meetupVenue: groupMeetupVenueSchema.optional(),
  eventTitle: z.string().min(1).optional(),
  eventStartsAt: z.iso.datetime().optional(),
  // Phase 4.14: this viewer's own choice to show this group in their
  // sidebar shortcut list - always false for a group they haven't joined.
  pinned: z.boolean(),
  // The group's own photo, uploaded by its moderator. Absent until one is
  // set - the interface falls back to the group's initial rather than to a
  // stock image standing in for a picture the group never chose.
  imageUrl: z.url().optional(),
  verificationStatus: groupVerificationStatusSchema
});

export const createGroupRequestSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(500).optional(),
  // Defaulted, not required. DEC-0013 groups predate the type concept and
  // every existing client still creates one without naming a type - making
  // it mandatory rejected them all with a 400.
  type: groupTypeSchema.default('community'),
  visibility: groupVisibilitySchema.optional(),
  modulesConfig: z.array(groupModuleConfigSchema).optional()
});

export const updateGroupModulesRequestSchema = z.object({
  modulesConfig: z.array(groupModuleConfigSchema)
});

export const setGroupPinnedRequestSchema = z.object({
  pinned: z.boolean()
});

// What the moderator tells the administrator about the group. Stored and
// displayed; like DEC-0018's organizer justification, Pulso verifies
// nothing on its own from it.
export const requestGroupVerificationSchema = z.object({
  justification: z.string().min(1).max(500)
});

export const resolveGroupVerificationSchema = z.object({
  approve: z.boolean()
});

// The administration queue (same console and same is_admin gate as
// DEC-0018's organizer requests).
export const groupVerificationRequestSchema = z.object({
  group: groupSchema,
  requester: publicUserSchema,
  requestedAt: z.iso.datetime(),
  justification: z.string().min(1)
});

export const groupVerificationRequestsResponseSchema = z.object({
  data: z.array(groupVerificationRequestSchema)
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
/**
 * A group's discussion threads. `staffOnly` is how DEC-0015's
 * "announcements reserved for staff" module exists without a second
 * content model: everyone reads such a channel, only the moderator writes
 * in it.
 */
/**
 * A paid placement of an event inside a group (DEC-0015 §Future
 * monetization). Created by a Pulso administrator only; the group's own
 * moderator can take it down.
 *
 * `sponsorName` is typed by the administrator rather than derived from the
 * event's organizer: the payer and the listed organizer are not always the
 * same name, and a banner has to say who actually paid for it.
 */
export const groupSponsoredPlacementSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  sponsorName: z.string().min(1),
  message: z.string().min(1).optional(),
  createdAt: z.iso.datetime(),
  endsAt: z.iso.datetime().optional(),
  event: z.object({
    id: z.uuid(),
    title: z.string().min(1),
    startsAt: z.iso.datetime(),
    category: z.enum(EVENT_CATEGORIES),
    imageUrl: z.url().optional(),
    venueName: z.string().min(1).optional()
  })
});

export const groupSponsoredPlacementsResponseSchema = z.object({
  data: z.array(groupSponsoredPlacementSchema)
});

// Admin-side: the same placement plus which group it landed in and whether
// that group's moderator has since taken it down - the two numbers that
// say whether a package was actually delivered.
export const adminGroupPlacementSchema = z.object({
  placement: groupSponsoredPlacementSchema,
  groupName: z.string().min(1),
  groupMemberCount: z.number().int().min(0),
  dismissedAt: z.iso.datetime().optional()
});

export const adminGroupPlacementsResponseSchema = z.object({
  data: z.array(adminGroupPlacementSchema)
});

export const createGroupPlacementRequestSchema = z.object({
  groupId: z.uuid(),
  eventId: z.uuid(),
  sponsorName: z.string().min(1).max(80),
  message: z.string().min(1).max(280).optional(),
  endsAt: z.iso.datetime().optional()
});

// The administrator has to find a group by name to place into one.
export const adminGroupSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  memberCount: z.number().int().min(0),
  verified: z.boolean()
});

export const adminGroupSummariesResponseSchema = z.object({
  data: z.array(adminGroupSummarySchema)
});

/**
 * One outing a group is organising. The programme, attendance and checklist
 * describe an outing rather than the group itself, so a community that goes
 * out weekly starts each week clean instead of inheriting last week's plan.
 */
export const groupOutingSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  eventId: z.uuid().optional(),
  title: z.string().min(1).max(120),
  startsAt: z.iso.datetime().optional(),
  place: z.string().min(1).optional(),
  createdAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().optional()
});

export const groupOutingsResponseSchema = z.object({
  data: z.array(groupOutingSchema)
});

export const groupOutingResponseSchema = z.object({
  data: groupOutingSchema
});

// Starting a new outing archives the current one. `eventId` is set when the
// group adopts a real Pulso event - including a sponsored placement it
// decided to act on.
export const startGroupOutingRequestSchema = z.object({
  title: z.string().min(1).max(120),
  eventId: z.uuid().optional(),
  startsAt: z.iso.datetime().optional(),
  // Where it is, in the group own words - "chez Marie" and every other
  // place Pulso has never heard of, without inventing a fake venue.
  place: z.string().min(1).max(120).optional()
});

export const groupChannelSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  name: z.string().min(1).max(40),
  position: z.number().int().min(0),
  staffOnly: z.boolean(),
  postCount: z.number().int().min(0)
});

export const groupChannelsResponseSchema = z.object({
  data: z.array(groupChannelSchema)
});

export const groupChannelResponseSchema = z.object({
  data: groupChannelSchema
});

export const createGroupChannelRequestSchema = z.object({
  name: z.string().min(1).max(40),
  staffOnly: z.boolean().optional()
});

export const groupPostSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  channelId: z.uuid(),
  // A message someone wrote, or an outing they proposed into the feed.
  kind: z.enum(['message', 'outing']),
  outingId: z.uuid().optional(),
  // Present on an outing post: everything its feed card renders, votes
  // included, so a feed of twenty outings is still one request.
  outing: z
    .object({
      id: z.uuid(),
      title: z.string().min(1),
      place: z.string().min(1).optional(),
      startsAt: z.iso.datetime().optional(),
      eventId: z.uuid().optional(),
      yes: z.number().int().min(0),
      maybe: z.number().int().min(0),
      no: z.number().int().min(0),
      myResponse: attendanceResponseSchema.optional()
    })
    .optional(),
  author: publicUserSchema,
  body: z.string().min(1),
  createdAt: z.iso.datetime(),
  parentId: z.uuid().optional(),
  likeCount: z.number().int().min(0),
  likedByMe: z.boolean(),
  replyCount: z.number().int().min(0)
});

export const createGroupPostRequestSchema = z.object({
  // Which thread the message belongs to. Optional so the pre-channel
  // clients that only knew one feed keep working - the server resolves
  // those to the group's first channel rather than rejecting them.
  channelId: z.uuid().optional(),
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
    // DEC-0022 §6: absent when the organizer withholds it and the reader is
    // not approved. Optional rather than a coarse placeholder string, so a
    // consumer that forgot the case fails to compile instead of rendering a
    // fabricated address.
    address: z.string().min(1).optional(),
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
  // DEC-0017: absent on account-created events. The DATA-0001 trust
  // vocabulary describes how well Pulso corroborated a *sourced* record and
  // would be meaningless applied to a form submission, so a created event
  // carries `origin` below instead of a fabricated label.
  trust: z
    .object({
      label: z.enum(TRUST_LABELS),
      freshness: z.enum(FRESHNESS_STATES),
      locationConfidence: z.enum(LOCATION_CONFIDENCE_STATES)
    })
    .optional(),
  // Provenance, orthogonal to trust. 'directory' is every ingested event.
  // Optional rather than defaulted: absence means 'directory', which is
  // every ingested event and every existing fixture, so the overwhelmingly
  // common case stays free of ceremony.
  origin: z.enum(EVENT_ORIGINS).optional(),
  // Who created it, present only for the two account-created origins - the
  // author needs to be identifiable for "delete your own" and for the
  // interface to attribute the event honestly.
  createdBy: z
    .object({ userId: z.uuid(), displayName: z.string().min(1) })
    .optional(),
  // DEC-0017: the creator marked this as an after. The After filter also
  // matches on start time, so an ingested late-night event qualifies
  // without carrying this flag.
  isAfter: z.boolean().optional(),
  // DEC-0022 §6. Absent means 'public', which is every ingested event and
  // every fixture. Present means the organizer withholds the exact location
  // until they approve a request - it says nothing about whether *this*
  // reader is approved, which `locationPrecision` answers.
  addressDisclosure: z.literal('on_approval').optional(),
  // Present, and 'approximate', when the point in `venue.point` is the ~300 m
  // offset rather than the real one. A client must not draw an offset point
  // the way it draws an exact one.
  locationPrecision: z.literal('approximate').optional(),
  // Where the reader stands with this event's organizer, when they have asked
  // at all. Absent for an anonymous reader and for anyone who never asked.
  myAccessStatus: z.enum(['pending', 'approved', 'declined']).optional(),
  // DEC-0017 v1.2: pinned by its creator into the sidebar's Raccourcis.
  pinned: z.boolean().optional(),
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

// DEC-0017. The venue is either an existing Pulso venue (by id) or a new
// one described in full - Pulso has no venue-search-by-name endpoint that
// would let a form resolve a free-text venue, and inventing coordinates
// from a typed address is exactly the kind of guess EVENT-002 forbids.
export const createEventRequestSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.enum(EVENT_CATEGORIES),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().optional(),
  accessInformation: z.string().min(1).max(2000),
  description: z.string().min(1).max(4000).optional(),
  imageUrl: z.url().optional(),
  isAfter: z.boolean().optional(),
  // DEC-0017 v1.1: an external checkout, never a Pulso one. Surfaced with
  // the same "clearly identified external destination" treatment every
  // ingested ticketing link already gets (UX-0001).
  ticketingUrl: z.url().optional(),
  // DEC-0022 §6, replacing DEC-0017 v1.2's addressHidden. The event still
  // carries a real pin - it is on the map either way - but non-approved
  // readers get a ~300 m offset of it and no street line. Only valid with a
  // newly typed venue: an existing directory venue's address is already
  // published and cannot be taken back.
  addressDisclosure: z.literal('on_approval').optional(),
  price: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('free') }),
    z.object({
      kind: z.literal('paid'),
      minimumAmount: z.number().nonnegative().optional()
    }),
    z.object({ kind: z.literal('unknown') })
  ]),
  venue: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('existing'), venueId: z.uuid() }),
    z.object({
      kind: z.literal('new'),
      name: z.string().min(1).max(200),
      address: z.string().min(1).max(300),
      point: geographicPointSchema
    })
  ])
});
export type CreateEventRequest = z.infer<typeof createEventRequestSchema>;

// DEC-0022 §6. Asking an organizer for the exact location of an event they
// chose to withhold.
//
// The optional note exists because an organizer deciding who comes to their
// home has a weak basis for it in a display name alone.
export const eventAccessRequestSchema = z.object({
  message: z.string().min(1).max(500).optional()
});
export type EventAccessRequestInput = z.infer<typeof eventAccessRequestSchema>;

// One entry of the organizer's queue for one event.
export const eventAccessRequesterSchema = z.object({
  user: publicUserSchema,
  status: z.enum(['pending', 'approved', 'declined']),
  requestedAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().optional(),
  message: z.string().min(1).optional()
});

export const eventAccessRequestsResponseSchema = z.object({
  data: z.array(eventAccessRequesterSchema)
});
export type EventAccessRequester = z.infer<typeof eventAccessRequesterSchema>;

// A decision an organizer takes on one requester. 'declined' also revokes an
// approval already granted, which is why this is not a boolean: DEC-0022
// acceptance criterion 10 requires revocation to return the person to the
// offset point, and criterion 11 makes the refusal final either way.
export const resolveEventAccessRequestSchema = z.object({
  decision: z.enum(['approved', 'declined'])
});

// DEC-0022 §2. Ticket types, tickets, and the door.
//
// Money is integer minor units in CAD everywhere it appears (DEC-0022 §1).
// A float would be a rounding bug waiting for a busy night.
export const ticketTypeSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  name: z.string().min(1).max(80),
  priceCents: z.number().int().nonnegative(),
  // Absent means unlimited, which is a real answer for a door with no cap.
  quantity: z.number().int().positive().optional(),
  maxPerAccount: z.number().int().positive(),
  salesOpenAt: z.iso.datetime().optional(),
  salesCloseAt: z.iso.datetime().optional(),
  issuedCount: z.number().int().nonnegative()
});
export type TicketType = z.infer<typeof ticketTypeSchema>;

export const ticketTypesResponseSchema = z.object({
  data: z.array(ticketTypeSchema)
});

export const createTicketTypeRequestSchema = z.object({
  name: z.string().min(1).max(80),
  priceCents: z.number().int().nonnegative(),
  quantity: z.number().int().positive().optional(),
  maxPerAccount: z.number().int().positive().max(20).default(4),
  salesOpenAt: z.iso.datetime().optional(),
  salesCloseAt: z.iso.datetime().optional()
});

export const claimTicketsRequestSchema = z.object({
  ticketTypeId: z.uuid(),
  quantity: z.number().int().positive().max(20)
});

// The ticket as its holder sees it. `token` is the signed QR payload
// (DEC-0022 §3), produced by the API and never stored - the secret does not
// leave the server and the token is derived on read.
export const heldTicketSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  eventTitle: z.string().min(1),
  eventStartsAt: z.iso.datetime(),
  venueName: z.string().min(1),
  ticketTypeName: z.string().min(1),
  priceCents: z.number().int().nonnegative(),
  status: z.enum(['valid', 'used', 'refunded', 'cancelled']),
  issuedAt: z.iso.datetime(),
  usedAt: z.iso.datetime().optional(),
  token: z.string().min(1)
});
export type HeldTicket = z.infer<typeof heldTicketSchema>;

export const myTicketsResponseSchema = z.object({
  data: z.array(heldTicketSchema)
});

export const scanTicketRequestSchema = z.object({
  token: z.string().min(1).max(500)
});

// Every way a scan can end, named. A door needs to tell a duplicate apart
// from a wrong night, and a boolean cannot.
export const scanTicketResponseSchema = z.object({
  data: z.discriminatedUnion('result', [
    z.object({
      result: z.literal('admitted'),
      holderName: z.string().min(1),
      ticketTypeName: z.string().min(1)
    }),
    z.object({
      result: z.literal('already_used'),
      holderName: z.string().min(1),
      usedAt: z.iso.datetime()
    }),
    z.object({
      result: z.literal('not_valid'),
      status: z.enum(['valid', 'used', 'refunded', 'cancelled'])
    }),
    z.object({ result: z.literal('wrong_event') }),
    z.object({ result: z.literal('unknown') }),
    // The signature did not verify: this QR was not issued by Pulso, or not
    // for this deployment. Deliberately distinct from 'unknown', which means
    // a well-signed token for a ticket that no longer exists.
    z.object({ result: z.literal('forged') })
  ])
});

export type ScanVerdict = z.infer<typeof scanTicketResponseSchema>['data'];

export const eventAdmissionsResponseSchema = z.object({
  data: z.object({
    used: z.number().int().nonnegative(),
    valid: z.number().int().nonnegative()
  })
});

export const createdEventResponseSchema = z.object({
  data: publicEventSchema
});

// DEC-0017 v1.1. Editing reuses the creation shape minus the venue: moving
// an event to a different place is a different event, not an edit.
export const updateEventRequestSchema = createEventRequestSchema.omit({
  venue: true
});
export type UpdateEventRequest = z.infer<typeof updateEventRequestSchema>;

// The organizer workspace lists the account's own events, past ones
// included - an organizer needs to see what they ran, not only what is
// still ahead.
// DEC-0018 organizer requests.
export const organizerRequestSchema = z.object({
  id: z.uuid(),
  venueId: z.uuid(),
  venueName: z.string().min(1),
  venueAddress: z.string().min(1),
  justification: z.string().min(1),
  status: z.enum(['pending', 'approved', 'declined']),
  createdAt: z.iso.datetime(),
  requester: z.object({
    id: z.uuid(),
    displayName: z.string().min(1),
    email: z.string().min(1)
  })
});
export type OrganizerRequest = z.infer<typeof organizerRequestSchema>;

export const createOrganizerRequestSchema = z.object({
  venueId: z.uuid(),
  justification: z.string().min(10).max(2000)
});

export const organizerRequestsResponseSchema = z.object({
  data: z.array(organizerRequestSchema)
});

export const resolveOrganizerRequestSchema = z.object({
  approve: z.boolean()
});

// DEC-0019. The administration view of an imported venue photo: what is
// shown, where it came from, and whether it has already been taken down.
//
// `imageUrl` and `pageUrl` are both present because they answer different
// questions - the first is what a visitor sees, the second is the page an
// administrator opens to check a licence or answer a takedown request.
export const adminVenuePhotoSchema = z.object({
  venueId: z.uuid(),
  venueName: z.string().min(1),
  imageUrl: z.url().optional(),
  imageSource: z.string().min(1).optional(),
  imageAttribution: z.string().min(1).optional(),
  pageUrl: z.url().optional(),
  // True once a suppression is in force, so the console can show that a
  // venue is deliberately photo-less rather than merely unlucky.
  suppressed: z.boolean()
});

export const adminVenuePhotosResponseSchema = z.object({
  data: z.array(adminVenuePhotoSchema)
});

export const suppressVenuePhotoRequestSchema = z.object({
  // Absent means "no photo for this venue, ever", which is what a business
  // asking Pulso to stop using its pictures means. True narrows it to the
  // image currently shown, for the case where a better one should replace it.
  thisOneOnly: z.boolean().optional(),
  reason: z.string().max(500).optional()
});

// What the signed-in account may currently do as an organizer: the venues
// it is verified for, plus any request still awaiting a decision.
export const myOrganizerStatusResponseSchema = z.object({
  data: z.object({
    isAdmin: z.boolean(),
    verifiedVenues: z.array(
      z.object({ venueId: z.uuid(), venueName: z.string().min(1) })
    ),
    pendingRequests: z.array(organizerRequestSchema)
  })
});

export const myEventsResponseSchema = z.object({
  data: z.array(publicEventSchema)
});

// A typed address resolved to real coordinates server-side. `undefined`
// coordinates mean resolution failed and publication must be refused
// rather than pinned at a guess (DEC-0017 v1.1).
export const geocodeResponseSchema = z.object({
  data: z
    .object({
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-90).max(90),
      label: z.string().min(1)
    })
    .nullable()
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
// DEC-0021 - the image moderation queue and the report that feeds it.
// `scores` is passed through verbatim from whichever provider produced it,
// so the console can show why an image is here without this contract having
// to enumerate a vocabulary that belongs to the provider.
export const IMAGE_SURFACES = [
  'profile_photo',
  'user_photo',
  'event_photo',
  'group_photo',
  'event_cover'
] as const;

export const imageModerationStatusSchema = z.enum([
  'approved',
  'flagged',
  'rejected'
]);

export const imageModerationEntrySchema = z.object({
  id: z.uuid(),
  url: z.url(),
  surface: z.enum(IMAGE_SURFACES),
  status: imageModerationStatusSchema,
  ownerDisplayName: z.string().optional(),
  provider: z.string().optional(),
  reason: z.string().optional(),
  scores: z.record(z.string(), z.number()).optional(),
  reportCount: z.number().int().min(0),
  reportReasons: z.array(z.string()),
  moderatedAt: z.iso.datetime()
});

export const imageModerationQueueResponseSchema = z.object({
  data: z.array(imageModerationEntrySchema)
});

export const resolveImageModerationRequestSchema = z.object({
  decision: z.enum(['approved', 'rejected'])
});

// A short, fixed vocabulary rather than free text: it is what a reporter can
// answer quickly, and it keeps the queue readable at a glance.
export const IMAGE_REPORT_REASONS = [
  'sexual',
  'violence',
  'hate',
  'spam',
  'inappropriate',
  'other'
] as const;

export const reportImageRequestSchema = z.object({
  reason: z.enum(IMAGE_REPORT_REASONS).optional()
});

// DEC-0020 - the personal photo gallery. A gallery, not a feed: a photo is
// only ever read as part of one account's own grid, which is why there is
// no author field (the owner is the profile being viewed) and no like or
// comment count. `eventId`/`venueId` are an optional "taken at" reference,
// at most one of the two; hydrating either into a name is the caller's job,
// exactly as the Favoris section already hydrates ids.
export const userPhotoSchema = z.object({
  id: z.uuid(),
  url: z.url(),
  // DEC-0021. Present on the response to an upload so the interface can say
  // "being checked" without guessing; absent from a listed photo, because a
  // listed photo is by definition one that passed.
  moderationStatus: imageModerationStatusSchema.optional(),
  caption: z.string().max(280).optional(),
  eventId: z.uuid().optional(),
  venueId: z.uuid().optional(),
  createdAt: z.iso.datetime()
});
export const userPhotosResponseSchema = z.object({
  data: z.array(userPhotoSchema)
});
export const userPhotoResponseSchema = z.object({ data: userPhotoSchema });

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
export type ImageModerationStatus = z.infer<typeof imageModerationStatusSchema>;
export type ImageModerationEntry = z.infer<typeof imageModerationEntrySchema>;
export type ImageModerationQueueResponse = z.infer<
  typeof imageModerationQueueResponseSchema
>;
export type UserPhoto = z.infer<typeof userPhotoSchema>;
export type UserPhotosResponse = z.infer<typeof userPhotosResponseSchema>;
export type UserPhotoResponse = z.infer<typeof userPhotoResponseSchema>;
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
export type SetVenueRatingRequest = z.infer<typeof setVenueRatingRequestSchema>;
export type AdminVenuePhoto = z.infer<typeof adminVenuePhotoSchema>;
export type AdminVenuePhotosResponse = z.infer<
  typeof adminVenuePhotosResponseSchema
>;
export type SuppressVenuePhotoRequest = z.infer<
  typeof suppressVenuePhotoRequestSchema
>;
export type MyVenueRating = z.infer<typeof myVenueRatingSchema>;
export type MyVenueRatingResponse = z.infer<typeof myVenueRatingResponseSchema>;
export type VenueRatingSummariesResponse = z.infer<
  typeof venueRatingSummariesResponseSchema
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
export type FriendMutualCountsResponse = z.infer<
  typeof friendMutualCountsResponseSchema
>;
export type FriendSuggestion = z.infer<typeof friendSuggestionSchema>;
export type FriendSuggestionsResponse = z.infer<
  typeof friendSuggestionsResponseSchema
>;
export type FriendProfile = z.infer<typeof friendProfileSchema>;
export type FriendProfileResponse = z.infer<typeof friendProfileResponseSchema>;
export type MutualEventIdsResponse = z.infer<
  typeof mutualEventIdsResponseSchema
>;
export type FriendsMapEntry = z.infer<typeof friendsMapEntrySchema>;
export type FriendsMapResponse = z.infer<typeof friendsMapResponseSchema>;
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
export type MessageRequest = z.infer<typeof messageRequestSchema>;
export type MessageRequestsResponse = z.infer<
  typeof messageRequestsResponseSchema
>;
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
export type GroupSponsoredPlacement = z.infer<
  typeof groupSponsoredPlacementSchema
>;
export type GroupSponsoredPlacementsResponse = z.infer<
  typeof groupSponsoredPlacementsResponseSchema
>;
export type AdminGroupPlacement = z.infer<typeof adminGroupPlacementSchema>;
export type AdminGroupPlacementsResponse = z.infer<
  typeof adminGroupPlacementsResponseSchema
>;
export type CreateGroupPlacementRequest = z.infer<
  typeof createGroupPlacementRequestSchema
>;
export type AdminGroupSummary = z.infer<typeof adminGroupSummarySchema>;
export type AdminGroupSummariesResponse = z.infer<
  typeof adminGroupSummariesResponseSchema
>;
export type GroupOuting = z.infer<typeof groupOutingSchema>;
export type GroupOutingsResponse = z.infer<typeof groupOutingsResponseSchema>;
export type StartGroupOutingRequest = z.infer<
  typeof startGroupOutingRequestSchema
>;
export type GroupChannel = z.infer<typeof groupChannelSchema>;
export type GroupChannelsResponse = z.infer<typeof groupChannelsResponseSchema>;
export type CreateGroupChannelRequest = z.infer<
  typeof createGroupChannelRequestSchema
>;
export type GroupVisibility = z.infer<typeof groupVisibilitySchema>;
export type GroupVerificationStatus = z.infer<
  typeof groupVerificationStatusSchema
>;
export type RequestGroupVerification = z.infer<
  typeof requestGroupVerificationSchema
>;
export type ResolveGroupVerification = z.infer<
  typeof resolveGroupVerificationSchema
>;
export type GroupVerificationRequest = z.infer<
  typeof groupVerificationRequestSchema
>;
export type GroupVerificationRequestsResponse = z.infer<
  typeof groupVerificationRequestsResponseSchema
>;
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
    near: z
      .object({
        longitude: z.number().min(-180).max(180),
        latitude: z.number().min(-90).max(90),
        radiusMeters: z.number().positive().max(50_000)
      })
      .optional(),
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
        engine: z.enum(['deterministic', 'intelligent']),
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
    suggestedLocation: z
      .object({
        longitude: z.number().min(-180).max(180),
        latitude: z.number().min(-90).max(90)
      })
      .optional(),
    suggestedNearMe: z.boolean().optional(),
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
    ),
    // Venues matched by name or address when the query named a place rather
    // than describing an evening ("Centre Bell", "Newspeak"). A venue is not
    // an event and never appears in `data`: it has no date, no price and no
    // trust label, so folding the two into one list would mean inventing
    // those fields. The client opens a venue's own record instead.
    venues: z.array(publicVenueSchema).default([]),
    // The free-text fragment the interpreter matched on, when there was one.
    // Present so the interface can say what it searched for rather than
    // leaving the visitor to guess why these results came back.
    searchText: z.string().min(1).optional()
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
  { value: 'sport' },
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
  if (filters.after) parameters.set('after', 'true');
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
  // Absent on account-created events (DEC-0017): they carry no DATA-0001
  // trust label, and these three fields all describe one. An interface must
  // show the event's `origin` there instead, not a placeholder that reads
  // like a downgraded trust verdict.
  trust?: string;
  freshness?: string;
  location?: string;
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
  const eventTrust = event.trust;
  const trust = eventTrust
    ? getTrustLabel(locale, eventTrust.label)
    : undefined;
  const materialWarning =
    event.status === 'cancelled'
      ? translate(locale, 'event.warning.cancelled')
      : event.status === 'postponed'
        ? translate(locale, 'event.warning.postponed')
        : eventTrust?.label === 'to_verify'
          ? translate(locale, 'event.warning.toVerify')
          : eventTrust?.label === 'conflicting'
            ? translate(locale, 'event.warning.conflicting')
            : eventTrust?.locationConfidence === 'uncertain'
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
    ...(trust ? { trust } : {}),
    ...(eventTrust
      ? {
          freshness:
            eventTrust.freshness === 'stale'
              ? translate(locale, 'event.freshness.stale', {
                  date: formatMontrealDate(event.source.observedAt, locale)
                })
              : translate(locale, 'event.freshness.unknown', {
                  date: formatMontrealDate(event.source.observedAt, locale)
                }),
          location:
            eventTrust.locationConfidence === 'confirmed'
              ? translate(locale, 'location.confirmed')
              : translate(locale, 'location.uncertain')
        }
      : {}),
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
