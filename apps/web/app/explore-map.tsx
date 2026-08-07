'use client';

import {
  activeForumsResponseSchema,
  activityResponseSchema,
  buildMapEventsQuery,
  CATEGORY_FILTER_OPTIONS,
  conversationResponseSchema,
  conversationsResponseSchema,
  DATE_FILTER_OPTIONS,
  discoverForumsResponseSchema,
  discoverGroupsResponseSchema,
  eventDetailsResponseSchema,
  eventEngagementResponseSchema,
  eventListResponseSchema,
  eventPhotoResponseSchema,
  eventPhotosResponseSchema,
  forumFollowResponseSchema,
  favoriteEventsResponseSchema,
  favoriteVenuesResponseSchema,
  forumMembersResponseSchema,
  forumPostsResponseSchema,
  friendCodeResponseSchema,
  friendMutualCountsResponseSchema,
  friendProfileResponseSchema,
  friendRequestsResponseSchema,
  friendsAttendingResponseSchema,
  friendsMapResponseSchema,
  friendsResponseSchema,
  friendSuggestionsResponseSchema,
  groupAttendanceSummarySchema,
  groupChecklistItemsResponseSchema,
  groupJoinRequestsResponseSchema,
  groupMembersResponseSchema,
  groupPostsResponseSchema,
  groupResponseSchema,
  groupScheduleItemsResponseSchema,
  groupsResponseSchema,
  intelligentSearchResponseSchema,
  meResponseSchema,
  createdEventResponseSchema,
  createOrganizerRequestSchema,
  geocodeResponseSchema,
  myOrganizerStatusResponseSchema,
  organizerRequestsResponseSchema,
  myEventsResponseSchema,
  mutualEventIdsResponseSchema,
  myAttendanceResponseSchema,
  notificationsResponseSchema,
  PRICE_FILTER_OPTIONS,
  PROFILE_AVATAR_STYLES,
  PROFILE_COVER_STYLES,
  profileStatsResponseSchema,
  trendsResponseSchema,
  unreadCountResponseSchema,
  VENUE_CATEGORY_FILTER_OPTIONS,
  venueFavoriteCountsResponseSchema,
  venueListResponseSchema,
  venueRatingSummariesResponseSchema,
  myVenueRatingResponseSchema,
  type ActiveForum,
  type ActivityEntry,
  type AttendanceResponse,
  type DiscoverForumEntry,
  type DiscoverGroupEntry,
  type MyVenueRating,
  type AttendanceVisibility,
  type ConversationSummary,
  type EventEngagementEntry,
  type EventPhoto,
  type ForumCategory,
  type ForumPost,
  type FriendProfile,
  type FriendRequestEntry,
  type FriendsMapEntry,
  type FriendSuggestion,
  type Group,
  type GroupAttendanceSummary,
  type GroupChecklistItem,
  type GroupMeetupVenue,
  type GroupPost,
  type GroupScheduleItem,
  type GroupVisibility,
  type IntelligentSearchResponse,
  type SearchConstraintKey,
  type Message,
  type Notification as PulsoNotification,
  type OrganizerRequest,
  type PublicEvent,
  type PublicUser,
  type PublicVenue,
  type ProfileStatsResponse,
  type ReportTargetType,
  type TrendsResponse,
  type User
} from '@pulso/contracts';
import {
  AFTER_WINDOW_END_HOUR,
  AFTER_WINDOW_START_HOUR,
  DEFAULT_DISCOVERY_FILTERS,
  EVENT_CATEGORIES,
  FORUM_CATEGORIES,
  FORUM_CATEGORY_LABELS,
  getMontrealCalendarDate,
  CATEGORY_COLORS,
  VENUE_CATEGORY_COLORS,
  type DiscoveryFilters,
  type EventCategory,
  type MapBounds,
  type VenueCategory
} from '@pulso/domain';
import {
  getCategoryLabel,
  getDateFilterLabel,
  getPriceLabel,
  localizeSearchMessage,
  LOCALE_COOKIE_NAME,
  translate,
  type SupportedLocale
} from '@pulso/domain/localization';
import maplibregl from 'maplibre-gl';
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject
} from 'react';

import { eventDetailsFields, eventPreviewFields } from './event-view-model';
import { persistBrowserLocale, resolveBrowserLocale } from './locale-client';
import { deriveVenuePriceTier, type VenuePriceTier } from './venue-price-tier';
import {
  getVenueDiscoveryDateRange,
  partitionVenueEvents
} from './venue-view-model';

const MONTREAL_CENTER: [number, number] = [-73.5673, 45.5017];
// One neutral pin color for the Lieu map, rather than per-category icons
// like the event map's - almost no venue has a real category yet (see
// VENUE_CATEGORIES's comment), so color-coding by type would overstate a
// confidence the data doesn't have.
const VENUE_PIN_COLOR = '#8b7ff0';
const INITIAL_BOUNDS = {
  west: -73.75,
  south: 45.4,
  east: -73.4,
  north: 45.7
};
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
// Pulso's own vector style, served from public/ - the project's art
// direction (deep violet #100e19, muted roads) rather than a generic grey
// basemap. It used to sit behind NEXT_PUBLIC_MAP_STYLE_URL, so whenever
// that variable was missing - Next reads .env from apps/web, not from the
// monorepo root - every map silently fell back to a flat CartoDB raster
// that looked nothing like the rest of the product.
const MAP_STYLE_PULSO = '/map-styles/pulso-dark.json';

const MAP_STYLE_URL: string | maplibregl.StyleSpecification =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? MAP_STYLE_PULSO;

const PIN_WIDTH = 38;
const PIN_HEIGHT = 44;
// Pins are rasterized once at load time, not re-drawn per zoom level -
// without oversampling, MapLibre stretches these few dozen source pixels
// across many device pixels on any HiDPI screen, which is what read as a
// jagged/discontinuous outline rather than a clean stroke. Rendering at 3x
// and declaring that via addImage's pixelRatio option keeps the edge crisp
// regardless of screen density or icon-size zoom scaling.
const PIN_SCALE = 3;

/**
 * Pulso night pin: a dark core, luminous category rim and compact location
 * tail, rasterized on a canvas for crisp HiDPI rendering. The restrained
 * glow stays legible on the black basemap without the previous glossy white
 * outline.
 */
function buildPinImageData(color: string): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = PIN_WIDTH * PIN_SCALE;
  canvas.height = PIN_HEIGHT * PIN_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable.');
  ctx.scale(PIN_SCALE, PIN_SCALE);

  const body = new Path2D();
  body.moveTo(19, 2);
  body.bezierCurveTo(9.5, 2, 3, 8.4, 3, 17.5);
  body.bezierCurveTo(3, 27.4, 11.8, 31.8, 19, 42);
  body.bezierCurveTo(26.2, 31.8, 35, 27.4, 35, 17.5);
  body.bezierCurveTo(35, 8.4, 28.5, 2, 19, 2);
  body.closePath();

  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.shadowColor = color;
  ctx.shadowBlur = 11;
  ctx.fillStyle = color;
  ctx.fill(body);
  ctx.restore();

  const surface = ctx.createLinearGradient(0, 2, 0, 42);
  surface.addColorStop(0, color);
  surface.addColorStop(0.3, '#24182f');
  surface.addColorStop(1, '#0d0b14');
  ctx.fillStyle = surface;
  ctx.fill(body);
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.stroke(body);

  ctx.beginPath();
  ctx.arc(19, 17.5, 8.2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(19, 17.5, 2.4, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

const CLUSTER_BADGE_SIZE = 72;

/**
 * Cluster badge: the same dark core with a luminous brand-gradient rim. The
 * point-count text is drawn by a separate symbol layer stacked on top.
 */
function buildClusterBadgeImageData(): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = CLUSTER_BADGE_SIZE * PIN_SCALE;
  canvas.height = CLUSTER_BADGE_SIZE * PIN_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable.');
  ctx.scale(PIN_SCALE, PIN_SCALE);

  const center = CLUSTER_BADGE_SIZE / 2;
  const radius = center - 4;
  const gradient = ctx.createLinearGradient(
    0,
    0,
    CLUSTER_BADGE_SIZE,
    CLUSTER_BADGE_SIZE
  );
  gradient.addColorStop(0, '#7336C1');
  gradient.addColorStop(0.5, '#EA3E81');
  gradient.addColorStop(1, '#FE7C5C');

  ctx.save();
  ctx.shadowColor = '#EA3E81';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#0d0b14';
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(center, center, radius - 1.5, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.strokeStyle = gradient;
  ctx.stroke();

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

type LoadState = 'loading' | 'success' | 'empty' | 'error';
type BasemapState = 'loading' | 'loaded' | 'error';
type DetailsState =
  | { kind: 'closed' }
  | { kind: 'loading'; eventId: string }
  | { kind: 'success'; event: PublicEvent }
  | { kind: 'error'; eventId: string };

// Phase 4.8 first tried 5 tabs (Événement/Membres/Discussion/Fichiers/À
// propos); live feedback against the actual reference mockup said 3 is
// right (matches the mockup exactly) and the extra ones didn't read as
// meaningful - reverted back to the original 3, with the forum member list
// folded inline into the Forum tab instead of living as its own tab.
type EventDetailsTab = 'about' | 'participants' | 'forum';

interface ActiveSearch {
  query: string;
  manualFilters: DiscoveryFilters;
  disabledDerivedKeys: SearchConstraintKey[];
}

// DEC-0017: the API only returns account-created events - and only honours
// the After filter - for an authenticated caller. Every event fetch in this
// file therefore has to carry the bearer token, or a signed-in user's own
// event silently vanishes from the map they just published it to.
// Deliberately outside the category palette so it cannot be mistaken for
// one - the same violet the After filter uses, since afters are the main
// thing organizers create.
const CREATED_EVENT_PIN_COLOR = '#7c3aed';

// A native <select> for a two-option choice renders the OS dropdown, which
// is unstyleable and looked pasted-on next to the brand controls beside it.
// Two options is a toggle, not a menu.
function AttendanceVisibilityToggle({
  value,
  onChange
}: {
  value: AttendanceVisibility;
  onChange: (next: AttendanceVisibility) => void;
}) {
  return (
    <div
      className="attendance-visibility-toggle"
      role="group"
      aria-label="Visibilité de votre participation"
    >
      {(
        [
          ['private', 'Vous seul'],
          ['friends', 'Vos amis']
        ] as Array<[AttendanceVisibility, string]>
      ).map(([option, label]) => (
        <button
          type="button"
          key={option}
          className={value === option ? 'active' : ''}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function authHeaders(
  authToken: string | undefined
): Record<string, string> | undefined {
  return authToken ? { authorization: `Bearer ${authToken}` } : undefined;
}

function boundsUrl(
  bounds: MapBounds,
  filters: DiscoveryFilters,
  near?: { longitude: number; latitude: number; radiusMeters: number }
): string {
  return `${API_BASE_URL}/events?${buildMapEventsQuery(bounds, filters, near)}`;
}

type GeoStatus = 'pending' | 'granted' | 'denied' | 'unsupported';

/**
 * Distance filtering needs the user's real position, not the map's viewport
 * center - per user feedback, "the distance slider should be based on the
 * user's actual location," not an arbitrary point. Falls back to Montréal
 * center (no radius constraint applied) if permission is denied or the API
 * is unavailable, matching the pre-geolocation behaviour.
 */
function useUserLocation() {
  const [status, setStatus] = useState<GeoStatus>('pending');
  const [location, setLocation] = useState<{
    longitude: number;
    latitude: number;
  }>();

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus('unsupported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          longitude: position.coords.longitude,
          latitude: position.coords.latitude
        });
        setStatus('granted');
      },
      () => setStatus('denied'),
      { timeout: 10_000 }
    );
  }, []);

  return { status, location };
}

// Favorites always live in localStorage first (works signed out, works
// before the account layer even loads). When `authToken` is set, this also:
// 1) once per token, fetches the account's stored favorites and unions them
//    with whatever's local (DEC-0007: a favorite that only exists on one
//    side must never be silently dropped), then PUTs the merged set back;
// 2) from then on, mirrors every toggle to the API with a plain replace -
//    the server has no merge logic of its own, so un-favoriting works
//    exactly like it does signed out.
function useFavorites(authToken: string | undefined) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const syncedTokenRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const stored = localStorage.getItem('pulso-favorites');
    if (stored) {
      try {
        setFavorites(JSON.parse(stored));
      } catch (err) {
        console.warn('Failed to parse favorites', err);
      }
    }
  }, []);

  useEffect(() => {
    if (!authToken || syncedTokenRef.current === authToken) return;
    syncedTokenRef.current = authToken;
    let localIds: string[] = [];
    try {
      localIds = JSON.parse(localStorage.getItem('pulso-favorites') ?? '[]');
    } catch {
      localIds = [];
    }
    fetch(`${API_BASE_URL}/me/favorites`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => favoriteEventsResponseSchema.parse(json).data.eventIds)
      .then((serverIds) => {
        const merged = [...new Set([...localIds, ...serverIds])];
        localStorage.setItem('pulso-favorites', JSON.stringify(merged));
        setFavorites(merged);
        if (merged.length !== serverIds.length) {
          void fetch(`${API_BASE_URL}/me/favorites`, {
            method: 'PUT',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${authToken}`
            },
            body: JSON.stringify({ eventIds: merged })
          });
        }
      })
      .catch(() => {});
  }, [authToken]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id)
        ? prev.filter((f) => f !== id)
        : [...prev, id];
      localStorage.setItem('pulso-favorites', JSON.stringify(next));
      if (authToken) {
        void fetch(`${API_BASE_URL}/me/favorites`, {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${authToken}`
          },
          body: JSON.stringify({ eventIds: next })
        });
      }
      return next;
    });
  };
  return { favorites, toggleFavorite };
}

// A separate favorites list for venues, not events - own localStorage key,
// own storage/filtering logic, per explicit user request rather than
// reusing the event favorites list for a different kind of entity. Same
// account-sync behavior as useFavorites above.
function useFavoriteVenues(authToken: string | undefined) {
  const [favoriteVenues, setFavoriteVenues] = useState<string[]>([]);
  const syncedTokenRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const stored = localStorage.getItem('pulso-favorite-venues');
    if (stored) {
      try {
        setFavoriteVenues(JSON.parse(stored));
      } catch (err) {
        console.warn('Failed to parse favorite venues', err);
      }
    }
  }, []);

  useEffect(() => {
    if (!authToken || syncedTokenRef.current === authToken) return;
    syncedTokenRef.current = authToken;
    let localIds: string[] = [];
    try {
      localIds = JSON.parse(
        localStorage.getItem('pulso-favorite-venues') ?? '[]'
      );
    } catch {
      localIds = [];
    }
    fetch(`${API_BASE_URL}/me/favorite-venues`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => favoriteVenuesResponseSchema.parse(json).data.venueIds)
      .then((serverIds) => {
        const merged = [...new Set([...localIds, ...serverIds])];
        localStorage.setItem('pulso-favorite-venues', JSON.stringify(merged));
        setFavoriteVenues(merged);
        if (merged.length !== serverIds.length) {
          void fetch(`${API_BASE_URL}/me/favorite-venues`, {
            method: 'PUT',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${authToken}`
            },
            body: JSON.stringify({ venueIds: merged })
          });
        }
      })
      .catch(() => {});
  }, [authToken]);

  const toggleFavoriteVenue = (id: string) => {
    setFavoriteVenues((prev) => {
      const next = prev.includes(id)
        ? prev.filter((f) => f !== id)
        : [...prev, id];
      localStorage.setItem('pulso-favorite-venues', JSON.stringify(next));
      if (authToken) {
        void fetch(`${API_BASE_URL}/me/favorite-venues`, {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${authToken}`
          },
          body: JSON.stringify({ venueIds: next })
        });
      }
      return next;
    });
  };
  return { favoriteVenues, toggleFavoriteVenue };
}

// A real aggregation of the account's own favorites (category frequency),
// never an inferred/ML-derived recommendation (see /me/trends). Extracted
// from ProfilTrendsCard so DashboardHome's "Nouveautés" section (Phase
// 4.14) can reuse the exact same real signal instead of a second fetch.
function useTrends(authToken: string | undefined) {
  const [trends, setTrends] = useState<TrendsResponse['data']>();
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );

  useEffect(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/me/trends`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setTrends(trendsResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken]);

  return { trends, state };
}

// Unlike favorites, attendance has no local-storage/anonymous mode - it's
// account-only (DEC-0011: marking "j'y vais" is meaningless without an
// account to attach visibility to), so this only ever fetches once signed
// in and is a no-op with `authToken` undefined.
function useAttendance(authToken: string | undefined) {
  const [attendance, setAttendanceState] = useState<
    Record<string, AttendanceVisibility>
  >({});

  useEffect(() => {
    if (!authToken) {
      setAttendanceState({});
      return;
    }
    fetch(`${API_BASE_URL}/me/attendance`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        const entries = myAttendanceResponseSchema.parse(json).data;
        setAttendanceState(
          Object.fromEntries(
            entries.map((entry) => [entry.eventId, entry.visibility])
          )
        );
      })
      .catch(() => {});
  }, [authToken]);

  const setAttendance = (eventId: string, visibility: AttendanceVisibility) => {
    if (!authToken) return;
    setAttendanceState((prev) => ({ ...prev, [eventId]: visibility }));
    void fetch(`${API_BASE_URL}/me/attendance/${eventId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ visibility })
    });
  };

  const clearAttendance = (eventId: string) => {
    if (!authToken) return;
    setAttendanceState((prev) => {
      const next = { ...prev };
      delete next[eventId];
      return next;
    });
    void fetch(`${API_BASE_URL}/me/attendance/${eventId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${authToken}` }
    });
  };

  return { attendance, setAttendance, clearAttendance };
}

// No real-time/WebSocket in this phase (DEC-0012) - refetched whenever
// `refreshKey` changes (the caller passes the current header section, so
// navigating into "Mon compte" - where conversations get marked read - is
// enough to keep this reasonably fresh without polling).
function useUnreadMessagesCount(
  authToken: string | undefined,
  refreshKey: unknown
) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!authToken) {
      setCount(0);
      return;
    }
    fetch(`${API_BASE_URL}/me/messages/unread-count`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) =>
        setCount(unreadCountResponseSchema.parse(json).data.count)
      )
      .catch(() => {});
  }, [authToken, refreshKey]);

  return count;
}

// DEC-0016 in-app notifications. No real-time transport by design (same
// position DEC-0012 already takes on messages) - `refreshKey` is the current
// header section, so navigating anywhere refetches, and opening the panel
// refetches explicitly via `reload`.
function useNotifications(authToken: string | undefined, refreshKey: unknown) {
  const [notifications, setNotifications] = useState<PulsoNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );

  const reload = useCallback(() => {
    if (!authToken) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    fetch(`${API_BASE_URL}/me/notifications`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        const data = notificationsResponseSchema.parse(json).data;
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken]);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  const markAllRead = useCallback(() => {
    if (!authToken || unreadCount === 0) return;
    // Optimistic: the badge is the whole point of the control, so it clears
    // on tap rather than after a round trip.
    setUnreadCount(0);
    setNotifications((current) =>
      current.map((entry) =>
        'readAt' in entry && entry.readAt === null
          ? { ...entry, readAt: new Date().toISOString() }
          : entry
      )
    );
    void fetch(`${API_BASE_URL}/me/notifications/read`, {
      method: 'POST',
      headers: { authorization: `Bearer ${authToken}` }
    }).catch(() => {});
  }, [authToken, unreadCount]);

  return { notifications, unreadCount, state, reload, markAllRead };
}

// Scoped to the caller's own favorited/attended events (see /me/forums/active)
// - shared by the dashboard widget and the full "Forums" page so both read
// from a single fetch/refresh cycle rather than duplicating it.
function useActiveForums(authToken: string | undefined) {
  const [forums, setForums] = useState<ActiveForum[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );

  const refresh = useCallback(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/me/forums/active`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setForums(activeForumsResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { forums, state };
}

// Minimal safety net (DEC-0012): captures the report only, no moderation
// queue or automated action exists yet - the acknowledgment says exactly
// that rather than implying a review will happen.
function reportContent(
  authToken: string | undefined,
  targetType: ReportTargetType,
  targetId: string
) {
  if (!authToken) return;
  // Cancelling the prompt aborts the report entirely; confirming with an
  // empty reason still sends it (the target/reporter/timestamp alone are
  // useful even with no reason given).
  const input = window.prompt(
    'Pourquoi signalez-vous ce contenu ? (optionnel)'
  );
  if (input === null) return;
  fetch(`${API_BASE_URL}/reports`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      targetType,
      targetId,
      ...(input.trim() ? { reason: input.trim() } : {})
    })
  })
    .then((response) => {
      if (response.ok) alert('Signalement envoyé.');
    })
    .catch(() => {});
}

const AUTH_TOKEN_KEY = 'pulso-auth-token';

// Compte facultatif (DEC-0007/MVP-0001) : rien ici ne bloque le reste de
// l'app quand `user` est undefined - c'est l'état par défaut et le seul
// possible tant que Google OAuth n'est pas configuré côté serveur.
function useAuth() {
  const [user, setUser] = useState<User>();
  const [authToken, setAuthToken] = useState<string>();

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    setAuthToken(token);
    fetch(`${API_BASE_URL}/me`, {
      headers: { authorization: `Bearer ${token}` }
    })
      .then((response) => {
        // A real 401 means the server itself says this session is gone
        // (expired past its real 30-day lifetime, or revoked) - that's the
        // only case where signing the browser out is correct. Anything
        // else (network error, the API being briefly unreachable, a 500)
        // must NOT delete a token that's still valid server-side - it just
        // couldn't be verified right now. Leaving it in place means the
        // next mount (e.g. the user's very next reload) retries and
        // recovers on its own once the API responds again.
        if (response.status === 401) {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          setAuthToken(undefined);
          return;
        }
        if (!response.ok) return Promise.reject();
        return response
          .json()
          .then((json) => setUser(meResponseSchema.parse(json).data));
      })
      .catch(() => {});
  }, []);

  const login = () => {
    window.location.href = `${API_BASE_URL}/auth/google`;
  };

  const logout = () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      void fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` }
      });
    }
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setAuthToken(undefined);
    setUser(undefined);
  };

  return { user, setUser, authToken, login, logout };
}

/**
 * Keeps a conditionally-rendered panel mounted for `durationMs` after it's
 * asked to close, so a CSS transition can play in reverse instead of the
 * panel just vanishing the instant its condition flips false. `visible`
 * drives the transition (false -> true one frame after mount, so the
 * transition actually fires instead of starting already-settled; false
 * immediately on close); `mounted` gates whether the panel is in the DOM
 * at all.
 */
function useTransitionedMount(open: boolean, durationMs = 180) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // A single rAF can still land in the same paint as the mount (the
      // browser hasn't necessarily committed the "invisible" starting
      // style yet), which was skipping the opening transition entirely -
      // two nested frames guarantee a paint happens in between.
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setVisible(false);
    const timeout = setTimeout(() => setMounted(false), durationMs);
    return () => clearTimeout(timeout);
  }, [open, durationMs]);

  return { mounted, visible };
}

export function ExploreMap({
  initialLocale
}: {
  initialLocale: SupportedLocale;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const lieuMapContainer = useRef<HTMLDivElement>(null);
  const lieuMap = useRef<maplibregl.Map | null>(null);
  const explorerMapContainer = useRef<HTMLDivElement>(null);
  const explorerMap = useRef<maplibregl.Map | null>(null);
  // Phase 4.13 - the connected sidebar's own "Carte" page gets its own map
  // instance (same pattern as lieuMap/explorerMap each having their own),
  // rather than modifying explorerMap's setup/click-handling - explorerMap
  // keeps serving the anonymous top-navbar's "Explorer" exactly unchanged.
  const connectedMapContainer = useRef<HTMLDivElement>(null);
  const connectedMap = useRef<maplibregl.Map | null>(null);
  const currentBounds = useRef(INITIAL_BOUNDS);
  const activeSearch = useRef<ActiveSearch | undefined>(undefined);
  const localeRef = useRef(initialLocale);
  const filtersRef = useRef<DiscoveryFilters>({
    ...DEFAULT_DISCOVERY_FILTERS,
    categories: []
  });
  const detailsButton = useRef<HTMLButtonElement>(null);
  const detailsHeading = useRef<HTMLHeadingElement>(null);
  const [events, setEvents] = useState<PublicEvent[]>([]);
  // Distinguishes "still loading" from "genuinely zero results" for the
  // main map's own event fetch (audit: 0 events rendered identically to
  // still-loading, with no actionable empty state at all).
  const [eventsLoadState, setEventsLoadState] = useState<
    'loading' | 'success' | 'error'
  >('loading');
  const [nearbyEvents, setNearbyEvents] = useState<PublicEvent[]>([]);
  const [nearbyState, setNearbyState] = useState<LoadState>('loading');
  const [selected, setSelected] = useState<PublicEvent>();
  const [basemapState, setBasemapState] = useState<BasemapState>('loading');
  const [details, setDetails] = useState<DetailsState>({ kind: 'closed' });
  // Set when an event is opened from a context that implies which tab
  // matters - a separate piece of state rather than folded into
  // DetailsState so a plain openDetails() call elsewhere doesn't have to
  // think about it.
  const [detailsInitialTab, setDetailsInitialTab] = useState<EventDetailsTab>();
  // Live feedback (Phase 4.8 follow-up): the Forums discovery grid opens a
  // dedicated, richer ForumPanel instead of the plain EventDetails - full
  // category pills + composer live only there, centralizing the real forum
  // experience in one place. EventDetails' own "Forum" tab (reached from
  // Carte/Événements/Lieux) becomes a lightweight teaser that links into
  // this same panel rather than duplicating the full posting UI.
  const [forumPanelMode, setForumPanelMode] = useState(false);
  // Which tab ForumPanel opens on/orders first (Phase 4.14) - true from
  // every entry point except the Forums section itself, since Forums is
  // the one place "Discussion first" is actually the point.
  const [forumEventFirst, setForumEventFirst] = useState(false);
  const [pickerList, setPickerList] = useState<
    { title: string; events: PublicEvent[] } | undefined
  >();
  const [venuePickerList, setVenuePickerList] = useState<
    { title: string; groups: VenueGroup[] } | undefined
  >();
  const [venueDetailsGroup, setVenueDetailsGroup] = useState<VenueGroup>();
  const [connectedSelectedVenueId, setConnectedSelectedVenueId] =
    useState<string>();
  const [filters, setFilters] = useState<DiscoveryFilters>(filtersRef.current);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersOverlayMount = useTransitionedMount(filtersOpen);
  // Mobile-only: the desktop sidebar becomes a bottom-sheet drawer below the
  // .sidebar-left mobile breakpoint (audit: at 390px the inline sidebar left
  // almost nothing else visible) - same content, just a different container.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  // Mobile-only, connected experience: Forums/Groupes/Messages/Amis collapse
  // into one "Communauté" bottom-nav entry that opens this small sheet,
  // rather than each needing its own slot in a 5-item bottom bar.
  const [mobileCommunityOpen, setMobileCommunityOpen] = useState(false);
  const [queryInput, setQueryInput] = useState('');
  const [searchResult, setSearchResult] = useState<IntelligentSearchResponse>();
  const [searchProcessing, setSearchProcessing] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [locale, setLocale] = useState(initialLocale);
  const { user, setUser, authToken, login, logout } = useAuth();
  // Read inside long-lived map callbacks that must not be re-created (and
  // re-subscribe their MapLibre handlers) every time the token resolves.
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;
  const { favorites, toggleFavorite } = useFavorites(authToken);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const { favoriteVenues, toggleFavoriteVenue } = useFavoriteVenues(authToken);
  const [showFavoriteVenuesOnly, setShowFavoriteVenuesOnly] = useState(false);
  const { attendance, setAttendance, clearAttendance } =
    useAttendance(authToken);
  // Set when the user follows "Voir tous les événements" from the nearby
  // carousel, so List shows that same distance-sorted set instead of the
  // map's viewport-bound events - the carousel is deliberately about
  // proximity to the user, not what the map happens to be panned to (see
  // PROJECT_INDEX entry 41), and this gives that a real destination
  // instead of a dead link.
  const [listOverride, setListOverride] = useState<
    { title: string; events: PublicEvent[] } | undefined
  >();
  // Client-side only: filters the already-fetched events by source.name.
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () =>
      new Set([
        'categories',
        'prix',
        'date',
        'distance',
        'lieu-categorie',
        'lieu-date'
      ])
  );
  const toggleSection = (key: string) =>
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // Distance starts inactive (max range, not applied) rather than silently
  // restricting results the moment geolocation resolves - per user feedback,
  // moving markers out from under someone who hasn't touched the slider yet
  // is disorienting. It only takes effect once the user releases the slider
  // themselves.
  const [distanceKm, setDistanceKm] = useState(30);
  const distanceKmRef = useRef(distanceKm);
  const [distanceFilterActive, setDistanceFilterActive] = useState(false);
  const distanceFilterActiveRef = useRef(distanceFilterActive);
  const { status: geoStatus, location: userLocation } = useUserLocation();
  const userLocationRef = useRef(userLocation);
  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  // "Événements autour de vous": the 15 closest events to the user's real
  // position, independent of the map viewport/filters - per user feedback,
  // this carousel should reflect actual proximity, not whatever the map
  // happens to be panned to. Falls back to the bounds-based `events` list
  // below when geolocation is unavailable/denied.
  useEffect(() => {
    if (!userLocation) return;
    let cancelled = false;
    setNearbyState('loading');
    const params = new URLSearchParams({
      longitude: String(userLocation.longitude),
      latitude: String(userLocation.latitude),
      radiusMeters: '50000'
    });
    fetch(`${API_BASE_URL}/events/near?${params.toString()}`)
      .then((response) => {
        if (!response.ok) throw new Error('Nearby events API unavailable');
        return response.json();
      })
      .then((json) => {
        if (cancelled) return;
        const result = eventListResponseSchema.parse(json);
        setNearbyEvents(result.data.slice(0, 15));
        setNearbyState(result.data.length === 0 ? 'empty' : 'success');
      })
      .catch(() => {
        if (!cancelled) setNearbyState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [userLocation]);

  const [section, setSection] = useState<ConnectedSection | 'compte'>(
    'evenement'
  );
  // One-time redirect: an anonymous session always starts on 'evenement'
  // (the map), but once a session resolves to a signed-in user it should
  // land on the connected dashboard instead - only while the visitor
  // hasn't already navigated elsewhere themselves.
  const hasRedirectedToDashboard = useRef(false);
  useEffect(() => {
    if (user && section === 'evenement' && !hasRedirectedToDashboard.current) {
      hasRedirectedToDashboard.current = true;
      setSection('decouvrir');
    }
  }, [user, section]);
  const unreadMessagesCount = useUnreadMessagesCount(authToken, section);
  const afterEventCount = events.filter(isAfterEvent).length;

  // MapLibre mounts its compact attribution already expanded
  // (`maplibregl-compact-show`), so every map opened with a full credit
  // strip across its bottom edge. Collapsing it back leaves the ODbL credit
  // one click away - which is what compact mode is for - without removing
  // it, since dropping the credit would breach the OpenStreetMap licence.
  // Re-runs on section changes because each surface mounts its own map.
  useEffect(() => {
    const collapse = () => {
      for (const element of document.querySelectorAll(
        '.maplibregl-ctrl-attrib.maplibregl-compact-show'
      )) {
        element.classList.remove('maplibregl-compact-show');
      }
    };
    collapse();
    const timer = window.setTimeout(collapse, 1200);
    return () => window.clearTimeout(timer);
  }, [section]);

  // The anonymous tree only renders these four sections. Losing the account
  // while standing anywhere else - signing out, or a session expiring into
  // a 401 - otherwise left the navbar up with an empty content area, since
  // every connected branch is guarded by `user &&` and none of the
  // anonymous ones match.
  useEffect(() => {
    if (user) return;
    const anonymous = ['evenement', 'lieu', 'explorer', 'favoris'];
    if (!anonymous.includes(section)) setSection('evenement');
  }, [user, section]);

  // Badge on Explorer's floating "Filtres" button: how many constraints are
  // actually narrowing the map, so the button says whether it is worth
  // opening without having to open it.
  const activeFilterCount =
    filters.categories.length +
    (filters.price !== 'all' ? 1 : 0) +
    (filters.date !== DEFAULT_DISCOVERY_FILTERS.date ? 1 : 0) +
    (distanceFilterActive ? 1 : 0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  // DEC-0018. Held here rather than inside Sidebar so the Administration
  // route can be gated on it too - hiding the nav item is a UI courtesy,
  // not an access control.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!authToken) {
      setIsAdmin(false);
      return;
    }
    fetch(`${API_BASE_URL}/me/organizer`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) =>
        setIsAdmin(myOrganizerStatusResponseSchema.parse(json).data.isAdmin)
      )
      .catch(() => setIsAdmin(false));
  }, [authToken]);
  const notifications = useNotifications(authToken, section);
  const [viewMode, setViewMode] = useState<'map' | 'list' | 'calendar'>('map');
  const [lieuTab, setLieuTab] = useState<'map' | 'list' | 'calendar'>('list');
  // Reset to 'event' every time Explorer is (re-)entered rather than
  // persisted - simplest, least surprising default per the restructuring
  // plan.
  const [explorerPinKind, setExplorerPinKind] = useState<
    'all' | 'event' | 'venue' | 'after'
  >('all');
  // The connected Carte page's own selected-pin state (Phase 4.13) - a
  // small floating card, not the full EventDetails panel or a picker list
  // (those stay exactly as they are for the anonymous map).
  const [mapSelection, setMapSelection] = useState<
    { kind: 'event'; event: PublicEvent } | { kind: 'venue'; group: VenueGroup }
  >();
  const [selectionEngagement, setSelectionEngagement] =
    useState<EventEngagementEntry>();
  const [venueCategoryFilter, setVenueCategoryFilter] = useState<
    VenueCategory[]
  >([]);
  const [noEventVenues, setNoEventVenues] = useState<PublicVenue[]>([]);
  const [venueListEvents, setVenueListEvents] = useState<PublicEvent[]>([]);
  const [aboutOpen, setAboutOpen] = useState(false);
  const aboutPanelMount = useTransitionedMount(aboutOpen);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [calendarEvents, setCalendarEvents] = useState<PublicEvent[]>([]);
  const [calendarState, setCalendarState] = useState<LoadState>('loading');
  const [selectedDay, setSelectedDay] = useState<string>();
  // Calendar references every event in scope, with its own optional filters
  // kept deliberately separate from the map's `filters` state - per user
  // feedback, switching a category/price pill on the map should not silently
  // narrow what the calendar shows, and vice versa.
  const [calendarCategories, setCalendarCategories] = useState<EventCategory[]>(
    []
  );
  const [calendarPrice, setCalendarPrice] =
    useState<DiscoveryFilters['price']>('all');

  const loadCalendarEvents = useCallback(
    async (
      month: Date,
      categories: EventCategory[],
      price: DiscoveryFilters['price']
    ) => {
      setCalendarState('loading');
      const monthStart = getMontrealCalendarDate(
        new Date(month.getFullYear(), month.getMonth(), 1)
      );
      const monthEnd = getMontrealCalendarDate(
        new Date(month.getFullYear(), month.getMonth() + 1, 0)
      );
      try {
        const response = await fetch(
          boundsUrl(INITIAL_BOUNDS, {
            date: 'custom',
            customStartDate: monthStart,
            customEndDate: monthEnd,
            categories,
            price
          })
        );
        if (!response.ok) throw new Error('Event API unavailable');
        const result = eventListResponseSchema.parse(await response.json());
        setCalendarEvents(result.data);
        setCalendarState(result.data.length === 0 ? 'empty' : 'success');
      } catch {
        setCalendarState('error');
      }
    },
    []
  );

  useEffect(() => {
    // Shared by both Événement's and Lieu's Calendrier tab - same underlying
    // month of events either way, only the day-click behavior differs (see
    // the two CalendarView render sites below).
    if (
      viewMode === 'calendar' ||
      (section === 'lieu' && lieuTab === 'calendar')
    ) {
      void loadCalendarEvents(calendarMonth, calendarCategories, calendarPrice);
    }
  }, [
    viewMode,
    section,
    lieuTab,
    calendarMonth,
    calendarCategories,
    calendarPrice,
    loadCalendarEvents
  ]);

  const loadVenueMapData = useCallback(async (bounds: MapBounds) => {
    const venueWindow = getVenueDiscoveryDateRange(new Date());
    const recurringVenuesRequest = fetch(
      `${API_BASE_URL}/venues?west=${bounds.west}&south=${bounds.south}&east=${bounds.east}&north=${bounds.north}`
    )
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) =>
        setNoEventVenues(venueListResponseSchema.parse(json).data)
      )
      .catch(() => setNoEventVenues([]));
    const programmedVenuesRequest = fetch(
      `${API_BASE_URL}/events?${buildMapEventsQuery(bounds, {
        date: 'custom',
        categories: [],
        price: 'all',
        customStartDate: venueWindow.start,
        customEndDate: venueWindow.end
      })}`
    )
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) =>
        setVenueListEvents(eventListResponseSchema.parse(json).data)
      )
      .catch(() => setVenueListEvents([]));
    await Promise.all([recurringVenuesRequest, programmedVenuesRequest]);
  }, []);

  useEffect(() => {
    if (section !== 'lieu' && section !== 'explorer') return;
    void loadVenueMapData(currentBounds.current);
  }, [section, loadVenueMapData]);

  useEffect(() => {
    const resolved = resolveBrowserLocale([initialLocale], localStorage);
    localeRef.current = resolved;
    setLocale(resolved);
    document.documentElement.lang = resolved;
  }, [initialLocale]);

  // Deep linking initial
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('eventId');
    if (eventId) {
      void openDetails(eventId);
    }
  }, []);

  function selectLocale(nextLocale: SupportedLocale) {
    localeRef.current = nextLocale;
    setLocale(nextLocale);
    persistBrowserLocale(nextLocale, localStorage);
    document.cookie = `${LOCALE_COOKIE_NAME}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = nextLocale;
  }

  const loadEvents = useCallback(
    async (
      bounds = currentBounds.current,
      activeFilters = filtersRef.current
    ) => {
      currentBounds.current = bounds;
      setSearchError(false);

      // Stale-While-Revalidate : Charger le cache instantanément
      try {
        const cached = localStorage.getItem('pulso-offline-events');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.length > 0) {
            setEvents(parsed);
          }
        }
      } catch (err) {
        console.warn('Failed to read offline cache', err);
      }

      try {
        if (activeSearch.current) {
          setSearchProcessing(true);
          const response = await fetch(`${API_BASE_URL}/search`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              query: activeSearch.current.query,
              locale: localeRef.current,
              bounds,
              near:
                userLocationRef.current && distanceFilterActiveRef.current
                  ? {
                      longitude: userLocationRef.current.longitude,
                      latitude: userLocationRef.current.latitude,
                      radiusMeters: distanceKmRef.current * 1000
                    }
                  : undefined,
              manualFilters: activeSearch.current.manualFilters,
              disabledDerivedKeys: activeSearch.current.disabledDerivedKeys
            })
          });
          if (!response.ok) throw new Error('Search API unavailable');
          const result = intelligentSearchResponseSchema.parse(
            await response.json()
          );
          setSearchResult(result);
          const effectiveFilters = toDiscoveryFilters(
            result.interpretation.effectiveFilters
          );
          filtersRef.current = effectiveFilters;
          setFilters(effectiveFilters);
          let finalEvents = result.data.map(({ event }) => event);

          if (
            result.suggestedNearMe &&
            userLocationRef.current &&
            !distanceFilterActiveRef.current
          ) {
            distanceFilterActiveRef.current = true;
            setDistanceFilterActive(true);
            try {
              const headers = authHeaders(authTokenRef.current);
              const near = {
                longitude: userLocationRef.current.longitude,
                latitude: userLocationRef.current.latitude,
                radiusMeters: distanceKmRef.current * 1000
              };
              const response = await fetch(
                boundsUrl(bounds, effectiveFilters, near),
                headers ? { headers } : {}
              );
              if (response.ok) {
                const eventResult = eventListResponseSchema.parse(
                  await response.json()
                );
                finalEvents = eventResult.data;
              }
            } catch (err) {
              console.warn(
                'Failed to fetch near events for AI suggestion',
                err
              );
            }
          }

          setEvents(finalEvents);
          setEventsLoadState('success');
          localStorage.setItem(
            'pulso-offline-events',
            JSON.stringify(finalEvents)
          );
          setSelected((current) =>
            current && finalEvents.some(({ id }) => id === current.id)
              ? current
              : undefined
          );
          setSearchProcessing(false);
          if (result.suggestedLocation && map.current) {
            const currentCenter = map.current.getCenter();
            const dLng = Math.abs(
              currentCenter.lng - result.suggestedLocation.longitude
            );
            const dLat = Math.abs(
              currentCenter.lat - result.suggestedLocation.latitude
            );
            if (dLng > 0.01 || dLat > 0.01) {
              map.current.easeTo({
                center: [
                  result.suggestedLocation.longitude,
                  result.suggestedLocation.latitude
                ],
                zoom: 14
              });
            }
          }
          return;
        }
        const userLoc = userLocationRef.current;
        const near =
          userLoc && distanceFilterActiveRef.current
            ? {
                longitude: userLoc.longitude,
                latitude: userLoc.latitude,
                radiusMeters: distanceKmRef.current * 1000
              }
            : undefined;
        const headers = authHeaders(authTokenRef.current);
        const response = await fetch(
          boundsUrl(bounds, activeFilters, near),
          headers ? { headers } : {}
        );
        if (!response.ok) throw new Error('Event API unavailable');
        const result = eventListResponseSchema.parse(await response.json());
        setEvents(result.data);
        setEventsLoadState('success');
        localStorage.setItem(
          'pulso-offline-events',
          JSON.stringify(result.data)
        );
        setSelected((current) =>
          current && result.data.some(({ id }) => id === current.id)
            ? current
            : undefined
        );
      } catch {
        if (activeSearch.current) setSearchError(true);
        setSearchProcessing(false);
        setEventsLoadState('error');
      }
    },
    []
  );

  function applyFilters(nextFilters: DiscoveryFilters) {
    if (activeSearch.current) {
      activeSearch.current = applySearchFilterEdits(
        activeSearch.current,
        filtersRef.current,
        nextFilters
      );
    }
    filtersRef.current = nextFilters;
    setFilters(nextFilters);
    // Changing a filter can remove the very thing an open panel describes,
    // so everything anchored to the previous result set closes with it -
    // only `selected` did, which left a full event or venue sheet sitting
    // beside a map that no longer contained it.
    if (selected) setSelected(undefined);
    setDetails({ kind: 'closed' });
    setVenueDetailsGroup(undefined);
    setPickerList(undefined);
    setVenuePickerList(undefined);
    void loadEvents(currentBounds.current, nextFilters);
  }

  function applyDistanceFilter() {
    distanceFilterActiveRef.current = true;
    setDistanceFilterActive(true);
    void loadEvents(currentBounds.current, filtersRef.current);
  }

  function submitSearch() {
    const query = queryInput.trim();
    if (!query) return;
    const manualFilters = activeSearch.current?.manualFilters ?? {
      ...filtersRef.current,
      categories: [...filtersRef.current.categories]
    };
    activeSearch.current = {
      query,
      manualFilters,
      disabledDerivedKeys: []
    };
    setSearchResult(undefined);
    setSearchProcessing(true);
    void loadEvents(currentBounds.current, manualFilters);
  }

  function clearSearch() {
    const restored = activeSearch.current?.manualFilters ?? filtersRef.current;
    activeSearch.current = undefined;
    setQueryInput('');
    setSearchResult(undefined);
    setSearchError(false);
    filtersRef.current = restored;
    setFilters(restored);
    void loadEvents(currentBounds.current, restored);
  }

  function clearAll() {
    const defaults = { ...DEFAULT_DISCOVERY_FILTERS, categories: [] };
    activeSearch.current = undefined;
    setQueryInput('');
    setSearchResult(undefined);
    setSearchError(false);
    filtersRef.current = defaults;
    setFilters(defaults);
    setSelected(undefined);
    void loadEvents(currentBounds.current, defaults);
  }

  function goHome() {
    setAboutOpen(false);
    setSection('evenement');
    setShowFavoritesOnly(false);
    setViewMode('map');
    setFiltersOpen(false);
    setPickerList(undefined);
    setVenuePickerList(undefined);
    setVenueDetailsGroup(undefined);
    setDetails({ kind: 'closed' });
    setSelected(undefined);
    clearSearch();
    requestAnimationFrame(() => map.current?.resize());
  }

  function clearDerivedConstraint(key: SearchConstraintKey) {
    if (!activeSearch.current) return;
    activeSearch.current = {
      ...activeSearch.current,
      disabledDerivedKeys: [
        ...new Set([...activeSearch.current.disabledDerivedKeys, key])
      ]
    };
    setSelected(undefined);
    void loadEvents(currentBounds.current);
  }

  // The token resolves after the first map load, so without this a user's
  // own created events stay missing from the map until something else
  // happens to trigger a refetch (DEC-0017).
  useEffect(() => {
    if (!authToken) return;
    void loadEvents(currentBounds.current);
    void loadVenueMapData(currentBounds.current);
  }, [authToken, loadEvents, loadVenueMapData]);

  useEffect(() => {
    if (!container.current) return;
    const instance = new maplibregl.Map({
      container: container.current,
      center: MONTREAL_CENTER,
      zoom: 11,
      // OpenStreetMap data is ODbL: the credit is a licence obligation, so
      // it cannot be removed - but MapLibre's own `compact` mode collapses
      // it to a small (i) that expands on click, which is the intended way
      // to keep it discreet while still shipping it.
      style: MAP_STYLE_URL,
      attributionControl: { compact: true }
    });

    instance.on('load', () => {
      setBasemapState('loaded');

      // Pin icons must be registered before any layer references them, or
      // that layer silently renders nothing for that image.
      for (const [category, color] of Object.entries(CATEGORY_COLORS)) {
        instance.addImage(`pin-${category}`, buildPinImageData(color), {
          pixelRatio: PIN_SCALE
        });
      }
      instance.addImage('cluster-badge', buildClusterBadgeImageData(), {
        pixelRatio: PIN_SCALE
      });

      // Source pour les événements avec clustering
      instance.addSource('events-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      });

      // Soft glow halo beneath each cluster, for depth (rendered first so
      // the solid cluster circle draws on top of it).
      instance.addLayer({
        id: 'clusters-glow',
        type: 'circle',
        source: 'events-source',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#7336C1',
          'circle-radius': ['step', ['get', 'point_count'], 30, 10, 42, 50, 54],
          'circle-blur': 1,
          'circle-opacity': 0.45
        }
      });

      instance.addLayer({
        id: 'clusters',
        type: 'symbol',
        source: 'events-source',
        filter: ['has', 'point_count'],
        layout: {
          'icon-image': 'cluster-badge',
          // Matches the previous circle-radius steps (20/30/40px radius)
          // scaled against the 72px badge image.
          'icon-size': [
            'step',
            ['get', 'point_count'],
            0.56,
            10,
            0.83,
            50,
            1.1
          ],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        }
      });

      instance.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'events-source',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          // demotiles.maplibre.org (the glyphs source above) only serves the
          // Noto Sans family - "Open Sans Bold" 404s there, which silently
          // dropped the cluster count text.
          'text-font': ['Noto Sans Bold'],
          'text-size': 13
        },
        paint: {
          'text-color': '#ffffff'
        }
      });

      // Soft glow halo beneath individual (non-clustered) event pins.
      instance.addLayer({
        id: 'events-glow',
        type: 'circle',
        source: 'events-source',
        paint: {
          'circle-radius': 18,
          'circle-color': ['get', 'color'],
          'circle-blur': 1,
          'circle-opacity': 0.5
        },
        filter: ['!', ['has', 'point_count']]
      });

      // Layer pour les événements non-sélectionnés (pins par catégorie)
      instance.addLayer({
        id: 'events-circles',
        type: 'symbol',
        source: 'events-source',
        layout: {
          'icon-image': ['concat', 'pin-', ['get', 'category']],
          'icon-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            0.66,
            14,
            0.88,
            17,
            1.06
          ],
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        },
        filter: ['!', ['has', 'point_count']]
      });

      // Layer pour l'événement sélectionné (grand pin)
      instance.addLayer({
        id: 'events-selected',
        type: 'symbol',
        source: 'events-source',
        layout: {
          'icon-image': ['concat', 'pin-', ['get', 'category']],
          'icon-size': 1.25,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        },
        filter: ['==', ['get', 'id'], selected?.id ?? '']
      });

      // Interactions
      instance.on('click', 'events-circles', (e) => {
        if (!e.features?.[0]) return;
        // Multiple individual pins can share the exact same coordinate (same
        // venue, different dates/events) and render stacked on top of each
        // other - queryRenderedFeatures under the click returns all of them,
        // topmost first. With nothing to distinguish them, always show a
        // picker rather than silently opening whichever one happened to be
        // on top - matches the picker used for clusters below.
        const ids = [
          ...new Set(e.features.map((f) => f.properties?.id as string))
        ];
        const matched = ids
          .map((id) => eventsRef.current.find((ev) => ev.id === id))
          .filter((ev): ev is PublicEvent => Boolean(ev));
        if (matched.length === 0) return;
        if (matched.length === 1) {
          if (detailsRef.current.kind !== 'closed') {
            void openDetails(matched[0]!.id);
          } else {
            setSelected(matched[0]);
          }
          return;
        }
        // A map click is a real intent to look at the map, even if the
        // details panel was open - it should not silently swallow this.
        setDetails({ kind: 'closed' });
        setPickerList({
          title: `${matched.length} événements à cet endroit`,
          events: matched
        });
      });
      instance.on('click', 'clusters', (e) => {
        const feature = e.features?.[0];
        const clusterId = feature?.properties?.cluster_id;
        const source = instance.getSource('events-source') as
          maplibregl.GeoJSONSource | undefined;
        if (clusterId === undefined || !source || !feature) return;
        const coordinates = (
          feature.geometry as { type: 'Point'; coordinates: [number, number] }
        ).coordinates;

        source.getClusterLeaves(clusterId, Infinity, 0).then((leaves) => {
          const ids = leaves.map((leaf) => leaf.properties?.id as string);
          const matched = ids
            .map((id) => eventsRef.current.find((ev) => ev.id === id))
            .filter((ev): ev is PublicEvent => Boolean(ev));

          // If every event in this cluster sits at the exact same coordinate
          // (same venue), zooming in can never split them apart - open the
          // list right away instead of re-clustering at the same spot
          // forever. Otherwise: more than 10 zooms in one step toward this
          // cluster's natural breakup point; 10 or fewer opens the list.
          const samePlace = leaves.every((leaf) => {
            const [lng, lat] = (
              leaf.geometry as { type: 'Point'; coordinates: [number, number] }
            ).coordinates;
            return (
              Math.abs(lng - coordinates[0]) < 1e-5 &&
              Math.abs(lat - coordinates[1]) < 1e-5
            );
          });

          if (samePlace || matched.length <= 10) {
            if (samePlace && instance.getZoom() < 15) {
              instance.easeTo({ center: coordinates, zoom: 15 });
            }
            // Same as above: prioritize this click over an already-open
            // details panel rather than leaving it stuck in front.
            setDetails({ kind: 'closed' });
            setPickerList({
              title: `${matched.length} événements ${samePlace ? 'à cet endroit' : 'dans cette zone'}`,
              events: matched
            });
            return;
          }

          source.getClusterExpansionZoom(clusterId).then((zoom) => {
            instance.easeTo({ center: coordinates, zoom });
          });
        });
      });
      instance.on('mouseenter', 'clusters', () => {
        instance.getCanvas().style.cursor = 'pointer';
      });
      instance.on('mouseleave', 'clusters', () => {
        instance.getCanvas().style.cursor = '';
      });
      instance.on('mouseenter', 'events-circles', () => {
        instance.getCanvas().style.cursor = 'pointer';
      });
      instance.on('mouseleave', 'events-circles', () => {
        instance.getCanvas().style.cursor = '';
      });

      // A click on genuinely empty map (not a pin/cluster, handled above)
      // is a real intent to look at the map - close the details panel and
      // the small pin-preview card on its own rather than making the user
      // hit "Retour"/the card's own close button first. Layer-specific
      // handlers above also fire for this same click, so this only acts
      // when the click hit nothing interactive.
      instance.on('click', (e) => {
        const hits = instance.queryRenderedFeatures(e.point, {
          layers: ['events-circles', 'clusters']
        });
        if (hits.length > 0) return;
        if (detailsRef.current.kind !== 'closed') {
          setDetails({ kind: 'closed' });
          requestAnimationFrame(() => map.current?.resize());
        }
        setSelected(undefined);
      });

      // Drainer les données qui sont arrivées AVANT que la source n'existait
      pushEventsToMap(instance);
    });

    instance.on('error', () => setBasemapState('error'));
    const onMoveEnd = () => {
      const bounds = instance.getBounds();
      void loadEvents({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth()
      });
    };
    instance.on('moveend', onMoveEnd);
    map.current = instance;
    void loadEvents(INITIAL_BOUNDS);
    return () => {
      instance.off('moveend', onMoveEnd);
      instance.remove();
    };
  }, [loadEvents]);

  // "You are here" marker - purely visual, never triggers a re-fetch on its
  // own (see applyDistanceFilter for why the Distance slider stays inactive
  // until the user explicitly touches it).
  const userMarker = useRef<maplibregl.Marker | null>(null);
  const lieuUserMarker = useRef<maplibregl.Marker | null>(null);
  const explorerUserMarker = useRef<maplibregl.Marker | null>(null);
  const connectedUserMarker = useRef<maplibregl.Marker | null>(null);
  useEffect(() => {
    if (!map.current || !userLocation) return;
    const el = document.createElement('div');
    el.className = 'user-location-marker';
    el.title = 'Vous êtes ici';
    el.setAttribute('aria-label', 'Vous êtes ici');
    // A plain dot read as just another marker at a glance - a small glyph
    // inside makes "this one is you" unambiguous rather than relying on
    // color alone to distinguish it from event pins.
    el.innerHTML =
      '<span class="user-location-marker-pulse"></span>' +
      '<svg class="user-location-marker-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="#fff" stroke="none"/></svg>';
    userMarker.current?.remove();
    userMarker.current = new maplibregl.Marker({ element: el })
      .setLngLat([userLocation.longitude, userLocation.latitude])
      .addTo(map.current);
    return () => {
      userMarker.current?.remove();
      userMarker.current = null;
    };
  }, [userLocation]);

  useEffect(() => {
    if (!userLocation) return;
    const markers: Array<{
      map: maplibregl.Map | null;
      ref: RefObject<maplibregl.Marker | null>;
    }> = [
      { map: lieuMap.current, ref: lieuUserMarker },
      { map: explorerMap.current, ref: explorerUserMarker },
      { map: connectedMap.current, ref: connectedUserMarker }
    ];
    for (const target of markers) {
      if (!target.map) continue;
      const element = document.createElement('div');
      element.className = 'user-location-marker';
      element.title = 'Vous êtes ici';
      element.setAttribute('aria-label', 'Vous êtes ici');
      element.innerHTML =
        '<span class="user-location-marker-pulse"></span>' +
        '<span class="user-location-marker-icon" aria-hidden="true"></span>';
      target.ref.current?.remove();
      target.ref.current = new maplibregl.Marker({ element })
        .setLngLat([userLocation.longitude, userLocation.latitude])
        .addTo(target.map);
    }
    return () => {
      for (const target of markers) {
        target.ref.current?.remove();
        target.ref.current = null;
      }
    };
  }, [userLocation, section]);

  // Ref toujours à jour des events pour les handlers internes à la carte
  const eventsRef = useRef(events);
  // Ref utilisée pour pousser les données AVANT que la source n'existe encore
  const pendingDataRef = useRef(events);

  useEffect(() => {
    eventsRef.current = events;
    pendingDataRef.current = events;
  }, [events]);

  // Fonction utilitaire réutilisable pour remplir la source
  const pushEventsToMap = useCallback((instance: maplibregl.Map) => {
    const source = instance.getSource('events-source') as
      maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const evs = pendingDataRef.current;
    const favs = favoritesRef.current;
    const showFavs = showFavoritesOnlyRef.current;
    const sel = selectedRef.current;
    const visibleEvents = evs.filter((e) =>
      showFavs ? favs.includes(e.id) : true
    );
    source.setData({
      type: 'FeatureCollection',
      features: visibleEvents.map((event) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [event.venue.point.longitude, event.venue.point.latitude]
        },
        properties: {
          id: event.id,
          color: CATEGORY_COLORS[event.category] ?? CATEGORY_COLORS['other'],
          category: event.category
        }
      }))
    });
    if (instance.getLayer('events-circles')) {
      // Must keep excluding cluster points here (they have no 'id'/'color'
      // properties) - a previous version of this filter dropped that
      // condition on every update, letting cluster features render through
      // this layer with a null color and hide the cluster-count text.
      instance.setFilter('events-circles', [
        'all',
        ['!', ['has', 'point_count']],
        ['!=', ['get', 'id'], sel?.id ?? '']
      ]);
      instance.setFilter('events-selected', [
        '==',
        ['get', 'id'],
        sel?.id ?? ''
      ]);
    }
  }, []);

  // Refs pour éviter les closures périmées dans pushEventsToMap
  const favoritesRef = useRef(favorites);
  const showFavoritesOnlyRef = useRef(showFavoritesOnly);
  const selectedRef = useRef(selected);
  const detailsRef = useRef(details);
  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);
  useEffect(() => {
    showFavoritesOnlyRef.current = showFavoritesOnly;
  }, [showFavoritesOnly]);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    detailsRef.current = details;
  }, [details]);
  useEffect(() => {
    distanceKmRef.current = distanceKm;
  }, [distanceKm]);
  useEffect(() => {
    distanceFilterActiveRef.current = distanceFilterActive;
  }, [distanceFilterActive]);

  // Synchronisation des données vers la carte (se déclenche aussi quand on revient à la carte)
  useEffect(() => {
    if (map.current) pushEventsToMap(map.current);
  }, [events, favorites, showFavoritesOnly, selected, pushEventsToMap]);

  // keepPickerList: when an event is opened from a picker list (cluster,
  // venue, or calendar day), leave that list in state instead of discarding
  // it - returnToMap only closes `details`, so the underlying list
  // reappears automatically instead of the whole panel closing. A fresh
  // direct open (map pin, deep link, carousel) has no list to return to, so
  // it keeps the old clear-on-open behavior.
  async function openDetails(
    eventId: string,
    options: {
      keepPickerList?: boolean;
      keepVenueDetails?: boolean;
      initialTab?: EventDetailsTab;
      asForumPanel?: boolean;
      // ForumPanel's tab order/default (Phase 4.14): true everywhere except
      // the Forums section's own entry point, which keeps "Discussion"
      // first (its whole point) rather than "Événement" first.
      forumEventFirst?: boolean;
      // Live feedback: opening a forum "feels slow" - most of that was a
      // full GET /events/:id round trip we didn't need, since the caller
      // (the Forums discovery grid) already has the complete PublicEvent
      // in hand. Skip the fetch entirely when it's provided.
      knownEvent?: PublicEvent;
    } = {}
  ) {
    if (!options.keepPickerList) setPickerList(undefined);
    if (!options.keepVenueDetails) setVenueDetailsGroup(undefined);
    setDetailsInitialTab(options.initialTab);
    setForumPanelMode(options.asForumPanel ?? false);
    setForumEventFirst(options.forumEventFirst ?? false);
    if (options.knownEvent) {
      setDetails({ kind: 'success', event: options.knownEvent });
      requestAnimationFrame(() => detailsHeading.current?.focus());
      return;
    }
    setDetails({ kind: 'loading', eventId });
    try {
      const response = await fetch(`${API_BASE_URL}/events/${eventId}`);
      if (!response.ok) throw new Error('Event details unavailable');
      const result = eventDetailsResponseSchema.parse(await response.json());
      setDetails({ kind: 'success', event: result.data });
      requestAnimationFrame(() => detailsHeading.current?.focus());
    } catch {
      setDetails({ kind: 'error', eventId });
    }
  }

  function returnToMap() {
    setDetails({ kind: 'closed' });
    requestAnimationFrame(() => {
      map.current?.resize();
      detailsButton.current?.focus();
    });
  }

  const showingDetails = details.kind !== 'closed';
  // Details and the picker list share one right-side slot and are mutually
  // exclusive (see the map click handlers, which always close one before
  // opening the other) - tracked as a single transition lifecycle instead
  // of two independent ones so their open/close animations can never both
  // be mid-flight and stack in the same layout slot at once.
  const rightPanelOpen =
    showingDetails ||
    pickerList !== undefined ||
    venuePickerList !== undefined ||
    venueDetailsGroup !== undefined;
  const rightPanelMount = useTransitionedMount(rightPanelOpen);
  const lastRightPanelContentRef = useRef<
    | { kind: 'details'; state: DetailsState }
    | { kind: 'picker'; list: { title: string; events: PublicEvent[] } }
    | { kind: 'venue-picker'; list: { title: string; groups: VenueGroup[] } }
    | { kind: 'venue-details'; group: VenueGroup }
    | { kind: 'none' }
  >({ kind: 'none' });
  useEffect(() => {
    if (showingDetails) {
      lastRightPanelContentRef.current = { kind: 'details', state: details };
    } else if (pickerList !== undefined) {
      lastRightPanelContentRef.current = { kind: 'picker', list: pickerList };
    } else if (venuePickerList !== undefined) {
      lastRightPanelContentRef.current = {
        kind: 'venue-picker',
        list: venuePickerList
      };
    } else if (venueDetailsGroup !== undefined) {
      lastRightPanelContentRef.current = {
        kind: 'venue-details',
        group: venueDetailsGroup
      };
    }
  }, [showingDetails, details, pickerList, venuePickerList, venueDetailsGroup]);
  const shownRightPanelContent = rightPanelOpen
    ? showingDetails
      ? ({ kind: 'details', state: details } as const)
      : pickerList !== undefined
        ? ({ kind: 'picker', list: pickerList } as const)
        : venuePickerList !== undefined
          ? ({ kind: 'venue-picker', list: venuePickerList } as const)
          : ({ kind: 'venue-details', group: venueDetailsGroup! } as const)
    : lastRightPanelContentRef.current;
  // The map is the union of verified recurring landmarks and venues with a
  // real event in the 14-day venue window. Event-backed data wins on merge,
  // while curated category/image metadata fills any missing fields.
  const venueGroups = useMemo(() => {
    const programmedVenueGroups = groupEventsByVenue(
      venueListEvents.length > 0 ? venueListEvents : events
    );
    const recurringVenueGroups = noEventVenues.map((venue): VenueGroup => ({
      id: venue.id,
      name: venue.name,
      address: venue.address,
      point: venue.point,
      events: [],
      categories: [],
      ...(venue.category !== undefined
        ? { venueCategory: venue.category }
        : {}),
      ...(venue.secondaryCategories !== undefined
        ? { venueSecondaryCategories: venue.secondaryCategories }
        : {}),
      ...(venue.imageUrl !== undefined ? { imageUrl: venue.imageUrl } : {})
    }));
    const byId = new Map<string, VenueGroup>();
    for (const group of [...recurringVenueGroups, ...programmedVenueGroups]) {
      const existing = byId.get(group.id);
      byId.set(
        group.id,
        existing
          ? {
              ...existing,
              ...group,
              events: group.events.length > 0 ? group.events : existing.events,
              categories:
                group.categories.length > 0
                  ? group.categories
                  : existing.categories,
              ...((group.imageUrl ?? existing.imageUrl)
                ? { imageUrl: (group.imageUrl ?? existing.imageUrl)! }
                : {}),
              ...((group.venueCategory ?? existing.venueCategory)
                ? {
                    venueCategory: (group.venueCategory ??
                      existing.venueCategory)!
                  }
                : {}),
              ...((group.venueSecondaryCategories ??
              existing.venueSecondaryCategories)
                ? {
                    venueSecondaryCategories: (group.venueSecondaryCategories ??
                      existing.venueSecondaryCategories)!
                  }
                : {})
            }
          : group
      );
    }
    return [...byId.values()];
  }, [events, noEventVenues, venueListEvents]);
  // Never guessed: a venue with no known type/price simply isn't matched by
  // an active filter rather than being bucketed into a default - same
  // "omit, don't guess" rule as the untyped-venue card display.
  const filteredVenueGroups = venueGroups
    .filter(
      (group) =>
        venueCategoryFilter.length === 0 ||
        (group.venueCategory !== undefined &&
          venueCategoryFilter.includes(group.venueCategory)) ||
        group.venueSecondaryCategories?.some((category) =>
          venueCategoryFilter.includes(category)
        )
    )
    .filter(
      (group) => !showFavoriteVenuesOnly || favoriteVenues.includes(group.id)
    );
  const filteredVenueListGroups = groupEventsByVenue(venueListEvents)
    .filter(
      (group) =>
        venueCategoryFilter.length === 0 ||
        (group.venueCategory !== undefined &&
          venueCategoryFilter.includes(group.venueCategory)) ||
        group.venueSecondaryCategories?.some((category) =>
          venueCategoryFilter.includes(category)
        )
    )
    .filter(
      (group) => !showFavoriteVenuesOnly || favoriteVenues.includes(group.id)
    );

  // Lieu's own map: a genuinely separate MapLibre instance (own container,
  // own source/layers) rather than a mode switch on the Événement map above
  // - kept as a second, deliberately simpler implementation for now rather
  // than a shared generic hook, so this doesn't risk regressing the
  // already-tuned event map's clustering/click behavior. One neutral pin
  // color rather than per-category icons, since almost no venue has a real
  // category yet (see VENUE_CATEGORIES's comment).
  const venueGroupsRef = useRef<VenueGroup[]>([]);
  useEffect(() => {
    venueGroupsRef.current = filteredVenueGroups;
  }, [filteredVenueGroups]);

  const pushVenuesToMap = useCallback((instance: maplibregl.Map) => {
    const source = instance.getSource('venues-source') as
      maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: venueGroupsRef.current.map((group) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [group.point.longitude, group.point.latitude]
        },
        properties: { id: group.id }
      }))
    });
  }, []);

  useEffect(() => {
    if (!lieuMapContainer.current) return;
    const instance = new maplibregl.Map({
      container: lieuMapContainer.current,
      center: MONTREAL_CENTER,
      zoom: 11,
      // OpenStreetMap data is ODbL: the credit is a licence obligation, so
      // it cannot be removed - but MapLibre's own `compact` mode collapses
      // it to a small (i) that expands on click, which is the intended way
      // to keep it discreet while still shipping it.
      style: MAP_STYLE_URL,
      attributionControl: { compact: true }
    });

    instance.on('load', () => {
      instance.addImage('pin-venue', buildPinImageData(VENUE_PIN_COLOR), {
        pixelRatio: PIN_SCALE
      });
      instance.addImage('venue-cluster-badge', buildClusterBadgeImageData(), {
        pixelRatio: PIN_SCALE
      });

      instance.addSource('venues-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        // Venue points are far sparser than event points, so a smaller
        // radius avoids over-clustering a handful of nearby-but-distinct
        // venues.
        clusterRadius: 30
      });

      instance.addLayer({
        id: 'venue-clusters-glow',
        type: 'circle',
        source: 'venues-source',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': VENUE_PIN_COLOR,
          'circle-radius': ['step', ['get', 'point_count'], 26, 10, 36],
          'circle-blur': 1,
          'circle-opacity': 0.4
        }
      });
      instance.addLayer({
        id: 'venue-clusters',
        type: 'symbol',
        source: 'venues-source',
        filter: ['has', 'point_count'],
        layout: {
          'icon-image': 'venue-cluster-badge',
          'icon-size': ['step', ['get', 'point_count'], 0.5, 10, 0.7],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        }
      });
      instance.addLayer({
        id: 'venue-cluster-count',
        type: 'symbol',
        source: 'venues-source',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Noto Sans Bold'],
          'text-size': 12
        },
        paint: { 'text-color': '#ffffff' }
      });
      instance.addLayer({
        id: 'venues-circles',
        type: 'symbol',
        source: 'venues-source',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': 'pin-venue',
          'icon-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            0.66,
            14,
            0.88,
            17,
            1.06
          ],
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        }
      });

      instance.on('click', 'venues-circles', (e) => {
        if (!e.features?.[0]) return;
        const ids = [
          ...new Set(e.features.map((f) => f.properties?.id as string))
        ];
        const matched = ids
          .map((id) => venueGroupsRef.current.find((g) => g.id === id))
          .filter((g): g is VenueGroup => Boolean(g));
        if (matched.length === 0) return;
        setDetails({ kind: 'closed' });
        if (matched.length === 1) {
          const group = matched[0]!;
          setVenuePickerList(undefined);
          setPickerList(undefined);
          setVenueDetailsGroup(group);
          return;
        }
        setVenueDetailsGroup(undefined);
        setPickerList(undefined);
        setVenuePickerList({
          title: `${matched.length} lieux à cet endroit`,
          groups: matched
        });
      });
      instance.on('click', 'venue-clusters', (e) => {
        const feature = e.features?.[0];
        const clusterId = feature?.properties?.cluster_id;
        const source = instance.getSource('venues-source') as
          maplibregl.GeoJSONSource | undefined;
        if (clusterId === undefined || !source || !feature) return;
        const coordinates = (
          feature.geometry as { type: 'Point'; coordinates: [number, number] }
        ).coordinates;

        source.getClusterLeaves(clusterId, Infinity, 0).then((leaves) => {
          const ids = leaves.map((leaf) => leaf.properties?.id as string);
          const matched = ids
            .map((id) => venueGroupsRef.current.find((g) => g.id === id))
            .filter((g): g is VenueGroup => Boolean(g));
          if (matched.length <= 10) {
            setDetails({ kind: 'closed' });
            setPickerList(undefined);
            setVenuePickerList({
              title: `${matched.length} lieux dans cette zone`,
              groups: matched
            });
            return;
          }
          source.getClusterExpansionZoom(clusterId).then((zoom) => {
            instance.easeTo({ center: coordinates, zoom });
          });
        });
      });
      instance.on('mouseenter', 'venue-clusters', () => {
        instance.getCanvas().style.cursor = 'pointer';
      });
      instance.on('mouseleave', 'venue-clusters', () => {
        instance.getCanvas().style.cursor = '';
      });
      instance.on('mouseenter', 'venues-circles', () => {
        instance.getCanvas().style.cursor = 'pointer';
      });
      instance.on('mouseleave', 'venues-circles', () => {
        instance.getCanvas().style.cursor = '';
      });

      instance.on('click', (event) => {
        const hits = instance.queryRenderedFeatures(event.point, {
          layers: ['venues-circles', 'venue-clusters']
        });
        if (hits.length > 0) return;
        setVenueDetailsGroup(undefined);
        setVenuePickerList(undefined);
        setPickerList(undefined);
      });

      pushVenuesToMap(instance);
    });

    const onMoveEnd = () => {
      const bounds = instance.getBounds();
      void loadVenueMapData({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth()
      });
    };
    instance.on('moveend', onMoveEnd);
    lieuMap.current = instance;
    return () => {
      instance.off('moveend', onMoveEnd);
      instance.remove();
    };
  }, [pushVenuesToMap, loadVenueMapData]);

  useEffect(() => {
    if (lieuMap.current) pushVenuesToMap(lieuMap.current);
  }, [filteredVenueGroups, pushVenuesToMap]);

  // Initial view for the Événement/Lieu maps (not Explorer, which is
  // deliberately a wider, city-wide view). Zooming to a ~1km radius only
  // makes sense around the visitor's *own* position: with geolocation
  // denied or unavailable - the default for a first anonymous visit - the
  // same jump landed on downtown Montréal at street level, where a visitor
  // saw "1 événement dans cette zone" instead of the city. Without a real
  // location there is nothing to zoom to, so the map keeps its city-wide
  // starting zoom. Fires at most once so it never fights a pan/zoom the
  // visitor makes themselves afterwards.
  const hasAppliedInitialCenter = useRef(false);
  useEffect(() => {
    if (geoStatus === 'pending' || hasAppliedInitialCenter.current) return;
    hasAppliedInitialCenter.current = true;
    if (!userLocation) return;
    const center: [number, number] = [
      userLocation.longitude,
      userLocation.latitude
    ];
    map.current?.jumpTo({ center, zoom: 14 });
    lieuMap.current?.jumpTo({ center, zoom: 14 });
  }, [geoStatus, userLocation]);

  // Explorer: a third, genuinely independent MapLibre instance - no sidebar,
  // just the map and a floating toggle switching which of two always-loaded
  // sources (events, venues) is visible. Both sources/layer sets are set up
  // up front so switching the toggle is a cheap visibility flip, not a
  // teardown/rebuild.
  useEffect(() => {
    explorerPinKindRef.current = explorerPinKind;
    if (!explorerMap.current) return;
    const visible = (kind: 'event' | 'venue') =>
      explorerPinKind === 'all' || explorerPinKind === kind
        ? 'visible'
        : 'none';
    for (const layer of ['explorer-events-glow', 'explorer-events-circles']) {
      if (explorerMap.current.getLayer(layer)) {
        explorerMap.current.setLayoutProperty(
          layer,
          'visibility',
          visible('event')
        );
      }
    }
    for (const layer of [
      'explorer-venue-clusters-glow',
      'explorer-venue-clusters',
      'explorer-venue-cluster-count',
      'explorer-venues-circles'
    ]) {
      if (explorerMap.current.getLayer(layer)) {
        explorerMap.current.setLayoutProperty(
          layer,
          'visibility',
          visible('venue')
        );
      }
    }
  }, [explorerPinKind]);

  useEffect(() => {
    if (section === 'explorer') setExplorerPinKind('all');
  }, [section]);

  // Lieu's and Explorer's map containers are always mounted but start
  // hidden (display:none) behind whichever section shows on load - a
  // MapLibre instance created while its container has zero size never
  // recovers on its own once shown, so force a resize the moment each one
  // actually becomes visible for the first time (and every time after,
  // which is a harmless no-op if the size hasn't changed).
  useEffect(() => {
    if (section === 'lieu' && lieuTab === 'map') {
      requestAnimationFrame(() => lieuMap.current?.resize());
    }
  }, [section, lieuTab]);
  useEffect(() => {
    if (section === 'explorer') {
      requestAnimationFrame(() => explorerMap.current?.resize());
      requestAnimationFrame(() => connectedMap.current?.resize());
    }
  }, [section]);

  const explorerPinKindRef = useRef(explorerPinKind);
  const explorerVenueGroupsRef = useRef<VenueGroup[]>([]);
  useEffect(() => {
    explorerVenueGroupsRef.current = venueGroups;
  }, [venueGroups]);

  const pushExplorerDataToMap = useCallback((instance: maplibregl.Map) => {
    const eventSource = instance.getSource('explorer-events-source') as
      maplibregl.GeoJSONSource | undefined;
    if (eventSource) {
      eventSource.setData({
        type: 'FeatureCollection',
        // 'after' filters the source rather than a layer's visibility: it
        // narrows *which* events are pins, not whether the event layer is
        // drawn at all (DEC-0017).
        features: eventsRef.current
          .filter(
            (event) =>
              explorerPinKindRef.current !== 'after' || isAfterEvent(event)
          )
          .map((event) => ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [
                event.venue.point.longitude,
                event.venue.point.latitude
              ]
            },
            properties: {
              id: event.id,
              // An account-created event gets its own colour rather than
              // its category's: on a map of sourced programming, "who put
              // this here" is the distinction that matters most, and
              // DEC-0017 requires the origin to be visible wherever a
              // created event is shown.
              color:
                event.origin && event.origin !== 'directory'
                  ? CREATED_EVENT_PIN_COLOR
                  : (CATEGORY_COLORS[event.category] ??
                    CATEGORY_COLORS['other']),
              category: event.category
            }
          }))
      });
    }
    const venueSource = instance.getSource('explorer-venues-source') as
      maplibregl.GeoJSONSource | undefined;
    if (venueSource) {
      venueSource.setData({
        type: 'FeatureCollection',
        features: explorerVenueGroupsRef.current.map((group) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [group.point.longitude, group.point.latitude]
          },
          properties: { id: group.id }
        }))
      });
    }
  }, []);

  useEffect(() => {
    if (!explorerMapContainer.current) return;
    const instance = new maplibregl.Map({
      container: explorerMapContainer.current,
      center: MONTREAL_CENTER,
      zoom: 11,
      // OpenStreetMap data is ODbL: the credit is a licence obligation, so
      // it cannot be removed - but MapLibre's own `compact` mode collapses
      // it to a small (i) that expands on click, which is the intended way
      // to keep it discreet while still shipping it.
      style: MAP_STYLE_URL,
      attributionControl: { compact: true }
    });

    instance.on('load', () => {
      for (const [category, color] of Object.entries(CATEGORY_COLORS)) {
        instance.addImage(
          `explorer-pin-${category}`,
          buildPinImageData(color),
          {
            pixelRatio: PIN_SCALE
          }
        );
      }
      instance.addImage(
        'explorer-cluster-badge',
        buildClusterBadgeImageData(),
        {
          pixelRatio: PIN_SCALE
        }
      );
      instance.addImage(
        'explorer-pin-venue',
        buildPinImageData(VENUE_PIN_COLOR),
        {
          pixelRatio: PIN_SCALE
        }
      );

      instance.addSource('explorer-events-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      });
      instance.addSource('explorer-venues-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 30
      });

      const eventVisible =
        explorerPinKindRef.current === 'all' ||
        explorerPinKindRef.current === 'event'
          ? 'visible'
          : 'none';
      const venueVisible =
        explorerPinKindRef.current === 'all' ||
        explorerPinKindRef.current === 'venue'
          ? 'visible'
          : 'none';

      instance.addLayer({
        id: 'explorer-events-glow',
        type: 'circle',
        source: 'explorer-events-source',
        layout: { visibility: eventVisible },
        paint: {
          'circle-radius': 18,
          'circle-color': ['get', 'color'],
          'circle-blur': 1,
          'circle-opacity': 0.5
        },
        filter: ['!', ['has', 'point_count']]
      });
      instance.addLayer({
        id: 'explorer-events-circles',
        type: 'symbol',
        source: 'explorer-events-source',
        layout: {
          visibility: eventVisible,
          'icon-image': ['concat', 'explorer-pin-', ['get', 'category']],
          'icon-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            0.66,
            14,
            0.88,
            17,
            1.06
          ],
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        }
      });

      instance.addLayer({
        id: 'explorer-venue-clusters-glow',
        type: 'circle',
        source: 'explorer-venues-source',
        filter: ['has', 'point_count'],
        layout: { visibility: venueVisible },
        paint: {
          'circle-color': VENUE_PIN_COLOR,
          'circle-radius': ['step', ['get', 'point_count'], 26, 10, 36],
          'circle-blur': 1,
          'circle-opacity': 0.4
        }
      });
      instance.addLayer({
        id: 'explorer-venue-clusters',
        type: 'symbol',
        source: 'explorer-venues-source',
        filter: ['has', 'point_count'],
        layout: {
          visibility: venueVisible,
          'icon-image': 'explorer-cluster-badge',
          'icon-size': ['step', ['get', 'point_count'], 0.5, 10, 0.7],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        }
      });
      instance.addLayer({
        id: 'explorer-venue-cluster-count',
        type: 'symbol',
        source: 'explorer-venues-source',
        filter: ['has', 'point_count'],
        layout: {
          visibility: venueVisible,
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Noto Sans Bold'],
          'text-size': 12
        },
        paint: { 'text-color': '#ffffff' }
      });
      instance.addLayer({
        id: 'explorer-venues-circles',
        type: 'symbol',
        source: 'explorer-venues-source',
        filter: ['!', ['has', 'point_count']],
        layout: {
          visibility: venueVisible,
          'icon-image': 'explorer-pin-venue',
          'icon-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            0.66,
            14,
            0.88,
            17,
            1.06
          ],
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        }
      });

      instance.on('click', 'explorer-events-circles', (e) => {
        if (!e.features?.[0]) return;
        const ids = [
          ...new Set(e.features.map((f) => f.properties?.id as string))
        ];
        const matched = ids
          .map((id) => eventsRef.current.find((ev) => ev.id === id))
          .filter((ev): ev is PublicEvent => Boolean(ev));
        if (matched.length === 0) return;
        setDetails({ kind: 'closed' });
        setVenuePickerList(undefined);
        setVenueDetailsGroup(undefined);
        if (matched.length === 1) {
          setPickerList(undefined);
          setSelected(matched[0]);
          return;
        }
        setSelected(undefined);
        setPickerList({
          title: `${matched.length} événements à cet endroit`,
          events: matched
        });
      });

      instance.on('click', 'explorer-venues-circles', (e) => {
        if (!e.features?.[0]) return;
        const ids = [
          ...new Set(e.features.map((f) => f.properties?.id as string))
        ];
        const matched = ids
          .map((id) => explorerVenueGroupsRef.current.find((g) => g.id === id))
          .filter((g): g is VenueGroup => Boolean(g));
        if (matched.length === 0) return;
        setDetails({ kind: 'closed' });
        setSelected(undefined);
        if (matched.length === 1) {
          const group = matched[0]!;
          setVenuePickerList(undefined);
          setPickerList(undefined);
          setVenueDetailsGroup(group);
          return;
        }
        setVenueDetailsGroup(undefined);
        setPickerList(undefined);
        setVenuePickerList({
          title: `${matched.length} lieux à cet endroit`,
          groups: matched
        });
      });

      instance.on('click', 'explorer-venue-clusters', (e) => {
        const feature = e.features?.[0];
        const clusterId = feature?.properties?.cluster_id;
        const source = instance.getSource('explorer-venues-source') as
          maplibregl.GeoJSONSource | undefined;
        if (clusterId === undefined || !source || !feature) return;
        const coordinates = (
          feature.geometry as { type: 'Point'; coordinates: [number, number] }
        ).coordinates;
        source.getClusterLeaves(clusterId, Infinity, 0).then((leaves) => {
          const ids = leaves.map((leaf) => leaf.properties?.id as string);
          const matched = ids
            .map((id) =>
              explorerVenueGroupsRef.current.find((g) => g.id === id)
            )
            .filter((g): g is VenueGroup => Boolean(g));
          if (matched.length <= 10) {
            setDetails({ kind: 'closed' });
            setPickerList(undefined);
            setVenuePickerList({
              title: `${matched.length} lieux dans cette zone`,
              groups: matched
            });
            return;
          }
          source.getClusterExpansionZoom(clusterId).then((zoom) => {
            instance.easeTo({ center: coordinates, zoom });
          });
        });
      });

      for (const layer of [
        'explorer-events-circles',
        'explorer-venues-circles',
        'explorer-venue-clusters'
      ]) {
        instance.on('mouseenter', layer, () => {
          instance.getCanvas().style.cursor = 'pointer';
        });
        instance.on('mouseleave', layer, () => {
          instance.getCanvas().style.cursor = '';
        });
      }

      // Same rationale as the Événement map's own empty-click handler: a
      // click on genuinely empty map is a real intent to look at the map,
      // so close whatever panel/picker is open rather than leaving it stuck
      // in front until the user finds its own close control.
      instance.on('click', (e) => {
        const hits = instance.queryRenderedFeatures(e.point, {
          layers: [
            'explorer-events-circles',
            'explorer-venues-circles',
            'explorer-venue-clusters'
          ]
        });
        if (hits.length > 0) return;
        if (detailsRef.current.kind !== 'closed') {
          setDetails({ kind: 'closed' });
        }
        setPickerList(undefined);
        setVenuePickerList(undefined);
        setVenueDetailsGroup(undefined);
        setSelected(undefined);
      });

      pushExplorerDataToMap(instance);
    });

    const onMoveEnd = () => {
      const bounds = instance.getBounds();
      const nextBounds = {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth()
      };
      void loadEvents(nextBounds);
      void loadVenueMapData(nextBounds);
    };
    instance.on('moveend', onMoveEnd);
    explorerMap.current = instance;
    return () => {
      instance.off('moveend', onMoveEnd);
      instance.remove();
    };
  }, [pushExplorerDataToMap, loadEvents, loadVenueMapData]);

  useEffect(() => {
    if (explorerMap.current) pushExplorerDataToMap(explorerMap.current);
  }, [events, venueGroups, pushExplorerDataToMap]);

  // Phase 4.13 "Carte" page - same bounds-driven events/venueGroups data as
  // every other map instance in this file, its own source/layer names so it
  // never touches explorerMap's. Full real clustering (glow + badge + count
  // text) for BOTH events and venues, unlike explorerMap (whose event side
  // never got cluster layers - venues only).
  const pushConnectedDataToMap = useCallback((instance: maplibregl.Map) => {
    const eventSource = instance.getSource('connected-events-source') as
      maplibregl.GeoJSONSource | undefined;
    if (eventSource) {
      eventSource.setData({
        type: 'FeatureCollection',
        // 'after' filters the source rather than a layer's visibility: it
        // narrows *which* events are pins, not whether the event layer is
        // drawn at all (DEC-0017).
        features: eventsRef.current
          .filter(
            (event) =>
              explorerPinKindRef.current !== 'after' || isAfterEvent(event)
          )
          .map((event) => ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [
                event.venue.point.longitude,
                event.venue.point.latitude
              ]
            },
            properties: {
              id: event.id,
              // An account-created event gets its own colour rather than
              // its category's: on a map of sourced programming, "who put
              // this here" is the distinction that matters most, and
              // DEC-0017 requires the origin to be visible wherever a
              // created event is shown.
              color:
                event.origin && event.origin !== 'directory'
                  ? CREATED_EVENT_PIN_COLOR
                  : (CATEGORY_COLORS[event.category] ??
                    CATEGORY_COLORS['other']),
              category: event.category
            }
          }))
      });
    }
    const venueSource = instance.getSource('connected-venues-source') as
      maplibregl.GeoJSONSource | undefined;
    if (venueSource) {
      venueSource.setData({
        type: 'FeatureCollection',
        features: explorerVenueGroupsRef.current.map((group) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [group.point.longitude, group.point.latitude]
          },
          properties: { id: group.id }
        }))
      });
    }
  }, []);

  // A callback ref, not a mount-once useEffect: a signed-in session starts
  // with `user` still undefined (async /me check), so the very first render
  // falls through to this shared Fragment and mounts every map instance
  // including this one - then, the moment auth resolves, the redirect to
  // 'decouvrir' below unmounts the Fragment entirely, tearing this map back
  // down. A useEffect keyed on stable callbacks only ever runs once and
  // would never recreate the map on a later remount (e.g. navigating back
  // to "Carte"); a callback ref fires every time this exact DOM node
  // (dis)appears, so it stays correct across that unmount/remount cycle.
  const initConnectedMap = useCallback(
    (container: HTMLDivElement) => {
      const instance = new maplibregl.Map({
        container,
        center: MONTREAL_CENTER,
        zoom: 11,
        // Same ODbL obligation as the other maps - compacted, not removed.
        style: MAP_STYLE_URL,
        attributionControl: { compact: true }
      });

      instance.on('load', () => {
        for (const [category, color] of Object.entries(CATEGORY_COLORS)) {
          instance.addImage(
            `connected-pin-${category}`,
            buildPinImageData(color),
            { pixelRatio: PIN_SCALE }
          );
        }
        instance.addImage(
          'connected-cluster-badge',
          buildClusterBadgeImageData(),
          { pixelRatio: PIN_SCALE }
        );
        instance.addImage(
          'connected-pin-venue',
          buildPinImageData(VENUE_PIN_COLOR),
          { pixelRatio: PIN_SCALE }
        );

        instance.addSource('connected-events-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50
        });
        instance.addSource('connected-venues-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 40
        });

        const eventVisible = () =>
          explorerPinKindRef.current === 'all' ||
          explorerPinKindRef.current === 'event'
            ? 'visible'
            : 'none';
        const venueVisible = () =>
          explorerPinKindRef.current === 'all' ||
          explorerPinKindRef.current === 'venue'
            ? 'visible'
            : 'none';

        instance.addLayer({
          id: 'connected-events-clusters-glow',
          type: 'circle',
          source: 'connected-events-source',
          filter: ['has', 'point_count'],
          layout: { visibility: eventVisible() },
          paint: {
            'circle-color': '#7336C1',
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              30,
              10,
              42,
              50,
              54
            ],
            'circle-blur': 1,
            'circle-opacity': 0.45
          }
        });
        instance.addLayer({
          id: 'connected-events-clusters',
          type: 'symbol',
          source: 'connected-events-source',
          filter: ['has', 'point_count'],
          layout: {
            visibility: eventVisible(),
            'icon-image': 'connected-cluster-badge',
            'icon-size': [
              'step',
              ['get', 'point_count'],
              0.56,
              10,
              0.83,
              50,
              1.1
            ],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
          }
        });
        instance.addLayer({
          id: 'connected-events-cluster-count',
          type: 'symbol',
          source: 'connected-events-source',
          filter: ['has', 'point_count'],
          layout: {
            visibility: eventVisible(),
            'text-field': '{point_count_abbreviated}',
            'text-font': ['Noto Sans Bold'],
            'text-size': 13
          },
          paint: { 'text-color': '#ffffff' }
        });
        instance.addLayer({
          id: 'connected-events-glow',
          type: 'circle',
          source: 'connected-events-source',
          filter: ['!', ['has', 'point_count']],
          layout: { visibility: eventVisible() },
          paint: {
            'circle-radius': 18,
            'circle-color': ['get', 'color'],
            'circle-blur': 1,
            'circle-opacity': 0.5
          }
        });
        instance.addLayer({
          id: 'connected-events-circles',
          type: 'symbol',
          source: 'connected-events-source',
          filter: ['!', ['has', 'point_count']],
          layout: {
            visibility: eventVisible(),
            'icon-image': ['concat', 'connected-pin-', ['get', 'category']],
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10,
              0.66,
              14,
              0.88,
              17,
              1.06
            ],
            'icon-anchor': 'bottom',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
          }
        });

        instance.addLayer({
          id: 'connected-venues-clusters-glow',
          type: 'circle',
          source: 'connected-venues-source',
          filter: ['has', 'point_count'],
          layout: { visibility: venueVisible() },
          paint: {
            'circle-color': VENUE_PIN_COLOR,
            'circle-radius': ['step', ['get', 'point_count'], 26, 10, 36],
            'circle-blur': 1,
            'circle-opacity': 0.4
          }
        });
        instance.addLayer({
          id: 'connected-venues-clusters',
          type: 'symbol',
          source: 'connected-venues-source',
          filter: ['has', 'point_count'],
          layout: {
            visibility: venueVisible(),
            'icon-image': 'connected-cluster-badge',
            'icon-size': ['step', ['get', 'point_count'], 0.5, 10, 0.7],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
          }
        });
        instance.addLayer({
          id: 'connected-venues-cluster-count',
          type: 'symbol',
          source: 'connected-venues-source',
          filter: ['has', 'point_count'],
          layout: {
            visibility: venueVisible(),
            'text-field': '{point_count_abbreviated}',
            'text-font': ['Noto Sans Bold'],
            'text-size': 12
          },
          paint: { 'text-color': '#ffffff' }
        });
        instance.addLayer({
          id: 'connected-venues-circles',
          type: 'symbol',
          source: 'connected-venues-source',
          filter: ['!', ['has', 'point_count']],
          layout: {
            visibility: venueVisible(),
            'icon-image': 'connected-pin-venue',
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10,
              0.66,
              14,
              0.88,
              17,
              1.06
            ],
            'icon-anchor': 'bottom',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
          }
        });

        // A single pin (or the first of an unclusterable same-spot stack)
        // opens the small floating card below - never the full EventDetails
        // panel or a picker list, both specific to the anonymous/legacy map.
        instance.on('click', 'connected-events-circles', (e) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          const event = id && eventsRef.current.find((ev) => ev.id === id);
          if (event) setMapSelection({ kind: 'event', event });
        });
        instance.on('click', 'connected-venues-circles', (e) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          const group =
            id && explorerVenueGroupsRef.current.find((g) => g.id === id);
          if (group) setMapSelection({ kind: 'venue', group });
        });
        instance.on('click', 'connected-events-clusters', (e) => {
          const feature = e.features?.[0];
          const clusterId = feature?.properties?.cluster_id;
          const source = instance.getSource('connected-events-source') as
            maplibregl.GeoJSONSource | undefined;
          if (clusterId === undefined || !source || !feature) return;
          const coordinates = (
            feature.geometry as { type: 'Point'; coordinates: [number, number] }
          ).coordinates;
          source.getClusterExpansionZoom(clusterId).then((zoom) => {
            if (zoom > instance.getMaxZoom() - 0.5) {
              // Can't zoom in any further to split this cluster apart (all
              // its events sit at ~the same coordinate) - fall back to the
              // first real leaf's own id (a cluster feature itself carries no
              // `id` property, only individual points do).
              source.getClusterLeaves(clusterId, 1, 0).then((leaves) => {
                const id = leaves[0]?.properties?.id as string | undefined;
                const event =
                  id && eventsRef.current.find((ev) => ev.id === id);
                if (event) setMapSelection({ kind: 'event', event });
              });
              return;
            }
            instance.easeTo({ center: coordinates, zoom });
          });
        });
        instance.on('click', 'connected-venues-clusters', (e) => {
          const feature = e.features?.[0];
          const clusterId = feature?.properties?.cluster_id;
          const source = instance.getSource('connected-venues-source') as
            maplibregl.GeoJSONSource | undefined;
          if (clusterId === undefined || !source || !feature) return;
          const coordinates = (
            feature.geometry as { type: 'Point'; coordinates: [number, number] }
          ).coordinates;
          source.getClusterExpansionZoom(clusterId).then((zoom) => {
            if (zoom > instance.getMaxZoom() - 0.5) {
              source.getClusterLeaves(clusterId, 1, 0).then((leaves) => {
                const id = leaves[0]?.properties?.id as string | undefined;
                const group =
                  id && explorerVenueGroupsRef.current.find((g) => g.id === id);
                if (group) setMapSelection({ kind: 'venue', group });
              });
              return;
            }
            instance.easeTo({ center: coordinates, zoom });
          });
        });

        for (const layer of [
          'connected-events-circles',
          'connected-events-clusters',
          'connected-venues-circles',
          'connected-venues-clusters'
        ]) {
          instance.on('mouseenter', layer, () => {
            instance.getCanvas().style.cursor = 'pointer';
          });
          instance.on('mouseleave', layer, () => {
            instance.getCanvas().style.cursor = '';
          });
        }

        instance.on('click', (event) => {
          const hits = instance.queryRenderedFeatures(event.point, {
            layers: [
              'connected-events-circles',
              'connected-events-clusters',
              'connected-venues-circles',
              'connected-venues-clusters'
            ]
          });
          if (hits.length === 0) setMapSelection(undefined);
        });

        pushConnectedDataToMap(instance);
      });

      const onMoveEnd = () => {
        const bounds = instance.getBounds();
        void loadEvents({
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth()
        });
      };
      instance.on('moveend', onMoveEnd);
      connectedMap.current = instance;
    },
    [pushConnectedDataToMap, loadEvents]
  );

  // Must be a stable function, not an inline arrow in the JSX below - an
  // inline arrow is a new function identity every render, which React
  // treats as "the ref changed" and fires detach(null)/reattach on every
  // single re-render, destroying and recreating the whole map constantly.
  const connectedMapContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      connectedMapContainer.current = node;
      if (node && !connectedMap.current) {
        initConnectedMap(node);
      } else if (!node && connectedMap.current) {
        connectedMap.current.remove();
        connectedMap.current = null;
      }
    },
    [initConnectedMap]
  );

  useEffect(() => {
    if (connectedMap.current) pushConnectedDataToMap(connectedMap.current);
  }, [events, venueGroups, pushConnectedDataToMap]);

  // Toggling event/venue pins re-applies layer visibility on the already-
  // built map (layers are created once in the 'load' handler above).
  useEffect(() => {
    const instance = connectedMap.current;
    if (!instance || !instance.getLayer('connected-events-circles')) return;
    const eventVisibility =
      explorerPinKind === 'all' ||
      explorerPinKind === 'event' ||
      explorerPinKind === 'after'
        ? 'visible'
        : 'none';
    const venueVisibility =
      explorerPinKind === 'all' || explorerPinKind === 'venue'
        ? 'visible'
        : 'none';
    for (const layer of [
      'connected-events-clusters-glow',
      'connected-events-clusters',
      'connected-events-cluster-count',
      'connected-events-glow',
      'connected-events-circles'
    ]) {
      instance.setLayoutProperty(layer, 'visibility', eventVisibility);
    }
    for (const layer of [
      'connected-venues-clusters-glow',
      'connected-venues-clusters',
      'connected-venues-cluster-count',
      'connected-venues-circles'
    ]) {
      instance.setLayoutProperty(layer, 'visibility', venueVisibility);
    }
    setMapSelection(undefined);
  }, [explorerPinKind]);

  // Real attendee count for whichever event is currently selected on the
  // connected Carte page's popup card - same batched endpoint as the
  // Événements page (Phase 4.11), just a single id here.
  useEffect(() => {
    if (mapSelection?.kind !== 'event') {
      setSelectionEngagement(undefined);
      return;
    }
    const eventId = mapSelection.event.id;
    fetch(`${API_BASE_URL}/events/engagement?ids=${eventId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        const entry = eventEngagementResponseSchema.parse(json).data[0];
        if (entry) setSelectionEngagement(entry);
      })
      .catch(() => {});
  }, [mapSelection]);

  // Prefer real-distance nearby results; fall back to the bounds-based list
  // when geolocation was denied/unsupported or hasn't resolved yet.
  const carouselEvents =
    userLocation && nearbyState === 'success' ? nearbyEvents : events;
  const carouselEmpty =
    userLocation && (nearbyState === 'success' || nearbyState === 'empty')
      ? nearbyEvents.length === 0
      : events.length === 0;
  const explorerTwoWeekRange = getVenueDiscoveryDateRange(new Date());
  const explorerTwoWeeksActive =
    filters.date === 'custom' &&
    filters.customStartDate === explorerTwoWeekRange.start &&
    filters.customEndDate === explorerTwoWeekRange.end;
  const applyExplorerDatePreset = (
    preset: 'today' | 'tonight' | 'weekend' | 'two-weeks'
  ) => {
    if (preset === 'two-weeks') {
      applyFilters({
        ...filters,
        date: 'custom',
        customStartDate: explorerTwoWeekRange.start,
        customEndDate: explorerTwoWeekRange.end
      });
      return;
    }
    applyFilters(withoutCustomDates(filters, preset));
  };

  // A real <main> landmark for the anonymous experience (audit: none
  // existed anywhere on the page) - the signed-in side already gets one
  // implicitly via its own layout, this is the plain div/Fragment slot the
  // anonymous header + section content render into.
  const ContentColumn = user ? 'div' : 'main';

  return (
    <div className={`app-container${user ? ' app-container-connected' : ''}`}>
      {user && (
        <Sidebar
          activeSection={
            (section === 'compte' ? 'decouvrir' : section) as ConnectedSection
          }
          onNavigate={(nextSection) => {
            setAboutOpen(false);
            // Sidebar/TopBar navigation always wins over a currently-open
            // ForumPanel takeover - live feedback: clicking e.g. "Messages"
            // while a forum was open did nothing until Retour was clicked
            // first, which read as broken navigation.
            setForumPanelMode(false);
            setSection(nextSection);
          }}
          authToken={authToken}
          user={user}
          unreadMessagesCount={unreadMessagesCount}
          isAdmin={isAdmin}
          onOpenAccount={() => {
            setAboutOpen(false);
            setForumPanelMode(false);
            setSection('compte');
          }}
          onOpenEvent={(eventId) =>
            void openDetails(eventId, {
              asForumPanel: true,
              forumEventFirst: true
            })
          }
        />
      )}

      {/* Mobile bottom nav, connected experience - the 260px sidebar's ~12
          items becomes a horizontal scroll row at 1024px (existing rule)
          which only shows 1-2 items and is not a real mobile nav. Collapses
          to 5 destinations; Forums/Groupes/Messages/Amis live behind
          "Communauté" (see mobileCommunityOpen) rather than each needing
          their own slot. */}
      {user && (
        <nav className="mobile-bottom-nav" aria-label="Navigation principale">
          <button
            type="button"
            className={!aboutOpen && section === 'decouvrir' ? 'active' : ''}
            onClick={() => {
              setAboutOpen(false);
              setForumPanelMode(false);
              setSection('decouvrir');
            }}
          >
            <span aria-hidden="true">✨</span>
            Découvrir
          </button>
          <button
            type="button"
            className={!aboutOpen && section === 'explorer' ? 'active' : ''}
            onClick={() => {
              setAboutOpen(false);
              setForumPanelMode(false);
              setSection('explorer');
            }}
          >
            <span aria-hidden="true">🗺️</span>
            Carte
          </button>
          <button
            type="button"
            className={!aboutOpen && section === 'evenement' ? 'active' : ''}
            onClick={() => {
              setAboutOpen(false);
              setForumPanelMode(false);
              setSection('evenement');
            }}
          >
            <span aria-hidden="true">🎟️</span>
            Événements
          </button>
          <button
            type="button"
            className={
              ['forums', 'groupes', 'messages', 'amis'].includes(section)
                ? 'active'
                : ''
            }
            onClick={() => setMobileCommunityOpen(true)}
          >
            <span aria-hidden="true">👥</span>
            Communauté
            {unreadMessagesCount > 0 && (
              <span className="mobile-bottom-nav-badge" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className={!aboutOpen && section === 'compte' ? 'active' : ''}
            onClick={() => {
              setAboutOpen(false);
              setForumPanelMode(false);
              setSection('compte');
            }}
          >
            <span aria-hidden="true">{renderUserAvatarContent(user)}</span>
            Profil
          </button>
        </nav>
      )}

      {mobileCommunityOpen && (
        <>
          <div
            className="mobile-filters-backdrop"
            onClick={() => setMobileCommunityOpen(false)}
          />
          <div className="mobile-community-sheet">
            <div className="sidebar-mobile-header">
              <h2>Communauté</h2>
              <button
                type="button"
                className="sidebar-mobile-close"
                onClick={() => setMobileCommunityOpen(false)}
                aria-label={translate(locale, 'filters.close')}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            {(
              [
                { section: 'forums', label: 'Forums', icon: '💬' },
                { section: 'groupes', label: 'Groupes', icon: '👥' },
                {
                  section: 'messages',
                  label: 'Messages',
                  icon: '✉️',
                  badge: unreadMessagesCount
                },
                { section: 'amis', label: 'Amis', icon: '🧑‍🤝‍🧑' }
              ] as const
            ).map((item) => (
              <button
                type="button"
                key={item.section}
                className="mobile-community-item"
                onClick={() => {
                  setAboutOpen(false);
                  setForumPanelMode(false);
                  setSection(item.section);
                  setMobileCommunityOpen(false);
                }}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
                {'badge' in item && item.badge > 0 && (
                  <span className="primary-sidebar-nav-badge">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      <ContentColumn
        {...(user ? { className: 'connected-content-column' } : {})}
      >
        {user ? (
          <>
            <TopBar
              query={queryInput}
              result={searchResult}
              processing={searchProcessing}
              error={searchError}
              onQueryChange={setQueryInput}
              onSubmit={submitSearch}
              onClear={clearSearch}
              onClearConstraint={clearDerivedConstraint}
              onPreview={setSelected}
              locale={locale}
              user={user}
              unreadMessagesCount={unreadMessagesCount}
              notificationsUnreadCount={notifications.unreadCount}
              notificationsOpen={notificationsOpen}
              onToggleNotifications={() => {
                setNotificationsOpen((open) => {
                  if (open) return false;
                  // Opening is the acknowledgement: refetch so the panel is
                  // current, then clear the badge.
                  notifications.reload();
                  notifications.markAllRead();
                  return true;
                });
              }}
              onOpenAccount={() => {
                setAboutOpen(false);
                setForumPanelMode(false);
                setSection('compte');
              }}
              onOpenMessages={() => {
                setAboutOpen(false);
                setForumPanelMode(false);
                setSection('messages');
              }}
              onOpenAbout={() => setAboutOpen((prev) => !prev)}
              aboutOpen={aboutOpen}
              notificationsPanel={
                notificationsOpen ? (
                  <>
                    <div
                      className="notifications-backdrop"
                      onClick={() => setNotificationsOpen(false)}
                    />
                    <NotificationsPanel
                      notifications={notifications.notifications}
                      state={notifications.state}
                      onClose={() => setNotificationsOpen(false)}
                      onOpenEvent={(eventId) =>
                        void openDetails(eventId, {
                          asForumPanel: true,
                          forumEventFirst: true
                        })
                      }
                      onOpenSection={(next) => {
                        setAboutOpen(false);
                        setForumPanelMode(false);
                        setSection(next);
                      }}
                    />
                  </>
                ) : null
              }
            />
          </>
        ) : (
          <header className="top-navbar">
            <div className="nav-left">
              <button
                type="button"
                className="nav-logo"
                onClick={goHome}
                aria-label={translate(locale, 'app.logoHome')}
              >
                <img src="/brand/pulso-logo-horizontal-dark.svg" alt="" />
              </button>
              <div className="nav-actions-links">
                <button
                  type="button"
                  className={
                    !aboutOpen && section === 'evenement' ? 'active' : ''
                  }
                  onClick={() => {
                    setAboutOpen(false);
                    setSection('evenement');
                  }}
                >
                  Événements
                </button>
                <button
                  type="button"
                  className={!aboutOpen && section === 'lieu' ? 'active' : ''}
                  onClick={() => {
                    setAboutOpen(false);
                    setSection('lieu');
                  }}
                >
                  Lieux
                </button>
                <button
                  type="button"
                  className={
                    !aboutOpen && section === 'explorer' ? 'active' : ''
                  }
                  onClick={() => {
                    setAboutOpen(false);
                    setSection('explorer');
                  }}
                >
                  Explorer
                </button>
              </div>
            </div>
            <div className="nav-search">
              <SearchPanel
                query={queryInput}
                result={searchResult}
                processing={searchProcessing}
                error={searchError}
                onQueryChange={setQueryInput}
                onSubmit={submitSearch}
                onClear={clearSearch}
                onClearConstraint={clearDerivedConstraint}
                onPreview={setSelected}
                locale={locale}
              />
            </div>
            <div className="nav-actions">
              <button
                type="button"
                className={`nav-icon-btn ${!aboutOpen && section === 'favoris' ? 'active' : ''}`}
                onClick={() => {
                  setAboutOpen(false);
                  setSection('favoris');
                }}
                aria-label="Favoris"
                title="Favoris"
              >
                <HeartIcon filled={!aboutOpen && section === 'favoris'} />
              </button>
              <button
                type="button"
                data-about-toggle
                className={`nav-icon-btn ${aboutOpen ? 'active' : ''}`}
                onClick={() => setAboutOpen((prev) => !prev)}
                aria-label="À propos"
                title="À propos"
              >
                <InfoIcon />
              </button>
              <button
                type="button"
                className="nav-icon-btn nav-icon-btn-notifications"
                disabled
                aria-label="Notifications (bientôt disponible)"
                title="Bientôt disponible"
              >
                <BellIcon />
              </button>
              {!user && (
                <LanguageSelector locale={locale} onChange={selectLocale} />
              )}
              <AccountMenu
                user={user}
                onLogin={login}
                onOpenAccount={() => {
                  setAboutOpen(false);
                  setSection('compte');
                }}
                unreadCount={unreadMessagesCount}
              />
            </div>
          </header>
        )}

        {/* Mobile bottom nav (audit: the desktop nav-actions-links row
            becomes inaccessible under ~768px) - the same 3 destinations
            plus Favoris, as real 44px+ tap targets instead of the ~22px
            text row above. Anonymous only, same gate as the header above. */}
        {!user && (
          <nav className="mobile-bottom-nav" aria-label="Navigation principale">
            <button
              type="button"
              className={!aboutOpen && section === 'evenement' ? 'active' : ''}
              onClick={() => {
                setAboutOpen(false);
                setMobileFiltersOpen(false);
                setSection('evenement');
              }}
            >
              <ViewModeIcon kind="map" />
              Événements
            </button>
            <button
              type="button"
              className={!aboutOpen && section === 'lieu' ? 'active' : ''}
              onClick={() => {
                setAboutOpen(false);
                setMobileFiltersOpen(false);
                setSection('lieu');
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              Lieux
            </button>
            <button
              type="button"
              className={!aboutOpen && section === 'explorer' ? 'active' : ''}
              onClick={() => {
                setAboutOpen(false);
                setMobileFiltersOpen(false);
                setSection('explorer');
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="3 11 22 2 13 21 11 13 3 11" />
              </svg>
              Explorer
            </button>
            <button
              type="button"
              className={!aboutOpen && section === 'favoris' ? 'active' : ''}
              onClick={() => {
                setAboutOpen(false);
                setMobileFiltersOpen(false);
                setSection('favoris');
              }}
            >
              <HeartIcon filled={!aboutOpen && section === 'favoris'} />
              Favoris
            </button>
          </nav>
        )}

        {user && forumPanelMode && showingDetails ? (
          <div className="forum-panel-page">
            {details.kind === 'success' && (
              <ForumPanel
                event={details.event}
                onBack={returnToMap}
                isFavorite={favorites.includes(details.event.id)}
                onToggleFavorite={() => toggleFavorite(details.event.id)}
                locale={locale}
                user={user}
                authToken={authToken}
                onLogin={login}
                eventFirst={forumEventFirst}
                attendanceVisibility={attendance[details.event.id]}
                onSetAttendance={(visibility) =>
                  setAttendance(details.event.id, visibility)
                }
                onClearAttendance={() => clearAttendance(details.event.id)}
              />
            )}
            {details.kind === 'loading' && (
              <p className="list-view-empty">Chargement…</p>
            )}
            {details.kind === 'error' && (
              <div style={{ padding: '2rem' }}>
                Erreur de chargement.
                <button
                  className="btn-secondary"
                  onClick={() =>
                    void openDetails(details.eventId, { asForumPanel: true })
                  }
                  style={{ marginTop: '1rem' }}
                >
                  Réessayer
                </button>
              </div>
            )}
          </div>
        ) : user && section === 'decouvrir' ? (
          <DashboardHome
            user={user}
            carouselEvents={carouselEvents}
            carouselEmpty={carouselEmpty}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            onOpenDetails={(eventId, options) =>
              void openDetails(eventId, {
                asForumPanel: true,
                forumEventFirst: true,
                ...options
              })
            }
            locale={locale}
            authToken={authToken}
            onNavigate={setSection}
          />
        ) : user && section === 'forums' ? (
          <ActiveForumsPage
            authToken={authToken}
            onOpenDetails={(eventId, knownEvent) =>
              openDetails(eventId, { asForumPanel: true, knownEvent })
            }
            locale={locale}
          />
        ) : user && section === 'groupes' ? (
          <GroupsPage
            authToken={authToken}
            userId={user.id}
            onOpenEventForum={(eventId) =>
              void openDetails(eventId, {
                asForumPanel: true,
                forumEventFirst: true
              })
            }
          />
        ) : user && section === 'messages' ? (
          <MessagesPage
            authToken={authToken}
            user={user}
            onOpenEventForum={(eventId) =>
              void openDetails(eventId, {
                asForumPanel: true,
                forumEventFirst: true
              })
            }
          />
        ) : user && section === 'amis' ? (
          <AmisPage
            authToken={authToken}
            attendance={attendance}
            locale={locale}
            onOpenEventForum={(eventId) =>
              void openDetails(eventId, {
                asForumPanel: true,
                forumEventFirst: true
              })
            }
            onNavigate={setSection}
          />
        ) : user && isAdmin && section === 'administration' ? (
          <AdministrationPage authToken={authToken} />
        ) : user && section === 'organisateur' ? (
          <OrganisateurPage
            authToken={authToken}
            locale={locale}
            onOpenEvent={(eventId) =>
              void openDetails(eventId, {
                asForumPanel: true,
                forumEventFirst: true
              })
            }
          />
        ) : user && section === 'evenement' ? (
          <EventsPage
            authToken={authToken}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            onOpenEventForum={(eventId) =>
              void openDetails(eventId, {
                asForumPanel: true,
                forumEventFirst: true
              })
            }
            onNavigateToMap={() => setSection('explorer')}
            onNavigateToOrganisateur={() => setSection('organisateur')}
            locale={locale}
          />
        ) : user && section === 'lieu' ? (
          <LieuxPage
            favoriteVenues={favoriteVenues}
            onToggleFavoriteVenue={toggleFavoriteVenue}
            onOpenEventForum={(eventId) =>
              void openDetails(eventId, {
                asForumPanel: true,
                forumEventFirst: true
              })
            }
            onNavigateToMap={() => setSection('explorer')}
            authToken={authToken}
            locale={locale}
            selectedVenueId={connectedSelectedVenueId}
            onSelectVenueId={setConnectedSelectedVenueId}
          />
        ) : (
          <Fragment>
            <div className="dashboard-main">
              {(section === 'evenement' || section === 'lieu') && (
                /* Left Sidebar - becomes a mobile bottom-sheet drawer below
                   the sidebar-left breakpoint, toggled by mobileFiltersOpen
                   (see the floating "Filtres" buttons in each map shell). */
                <aside
                  className={`sidebar-left ${mobileFiltersOpen ? 'mobile-open' : ''}`}
                >
                  <div className="sidebar-mobile-header">
                    <h1 className="sidebar-section-title">
                      {section === 'evenement' ? 'Événements' : 'Lieux'}
                    </h1>
                    <button
                      type="button"
                      className="sidebar-mobile-close"
                      onClick={() => setMobileFiltersOpen(false)}
                      aria-label={translate(locale, 'filters.close')}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <p className="sidebar-results-count">
                    {section === 'evenement'
                      ? (() => {
                          const count = showFavoritesOnly
                            ? events.filter((event) =>
                                favorites.includes(event.id)
                              ).length
                            : events.length;
                          // French takes the singular for 0 as well as 1.
                          return `${count} événement${count > 1 ? 's' : ''} dans cette zone`;
                        })()
                      : // "lieu" pluralizes in -x, not -s.
                        `${filteredVenueGroups.length} lieu${filteredVenueGroups.length > 1 ? 'x' : ''} dans cette zone`}
                  </p>

                  <div className="view-toggles">
                    <div className="view-toggles-list">
                      {section === 'evenement' ? (
                        <>
                          <button
                            type="button"
                            className={`view-toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
                            onClick={() => setViewMode('map')}
                          >
                            <ViewModeIcon kind="map" /> Carte
                          </button>
                          <button
                            type="button"
                            className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                            onClick={() => {
                              setListOverride(undefined);
                              setViewMode('list');
                            }}
                          >
                            <ViewModeIcon kind="list" /> Liste
                          </button>
                          <button
                            type="button"
                            className={`view-toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
                            onClick={() => setViewMode('calendar')}
                          >
                            <ViewModeIcon kind="calendar" /> Calendrier
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={`view-toggle-btn ${lieuTab === 'map' ? 'active' : ''}`}
                            onClick={() => setLieuTab('map')}
                          >
                            <ViewModeIcon kind="map" /> Carte
                          </button>
                          <button
                            type="button"
                            className={`view-toggle-btn ${lieuTab === 'list' ? 'active' : ''}`}
                            onClick={() => setLieuTab('list')}
                          >
                            <ViewModeIcon kind="list" /> Liste
                          </button>
                          <button
                            type="button"
                            className={`view-toggle-btn ${lieuTab === 'calendar' ? 'active' : ''}`}
                            onClick={() => setLieuTab('calendar')}
                          >
                            <ViewModeIcon kind="calendar" /> Calendrier
                          </button>
                        </>
                      )}
                    </div>
                    {section === 'evenement' && (
                      <button
                        type="button"
                        className={`view-toggle-fav ${showFavoritesOnly ? 'active' : ''}`}
                        aria-label={
                          showFavoritesOnly
                            ? 'Afficher tous les événements'
                            : 'Afficher uniquement mes favoris'
                        }
                        aria-pressed={showFavoritesOnly}
                        onClick={() => setShowFavoritesOnly((prev) => !prev)}
                      >
                        <HeartIcon filled={showFavoritesOnly} />
                      </button>
                    )}
                    {section === 'lieu' && (
                      <button
                        type="button"
                        className={`view-toggle-fav ${showFavoriteVenuesOnly ? 'active' : ''}`}
                        aria-label={
                          showFavoriteVenuesOnly
                            ? 'Afficher tous les lieux'
                            : 'Afficher uniquement mes lieux suivis'
                        }
                        title={
                          showFavoriteVenuesOnly
                            ? 'Afficher tous les lieux'
                            : 'Lieux suivis'
                        }
                        aria-pressed={showFavoriteVenuesOnly}
                        onClick={() =>
                          setShowFavoriteVenuesOnly((prev) => !prev)
                        }
                      >
                        <BellIcon />
                      </button>
                    )}
                  </div>

                  {section === 'evenement' && (
                    <>
                      <div className="filter-group-title-row">
                        <h3>Filtres</h3>
                        <button className="filter-reset" onClick={clearAll}>
                          Réinitialiser
                        </button>
                      </div>

                      <CollapsibleFilterGroup
                        title="Catégories"
                        collapsed={collapsedSections.has('categories')}
                        onToggle={() => toggleSection('categories')}
                      >
                        <p className="category-legend-hint">
                          La couleur de chaque catégorie correspond à celle des
                          pins sur la carte.
                        </p>
                        <div className="category-grid">
                          {CATEGORY_FILTER_OPTIONS.map((option) => (
                            <button
                              type="button"
                              key={option.value}
                              className={`category-item ${filters.categories.includes(option.value) ? 'active' : ''}`}
                              onClick={() => {
                                const nextCategories =
                                  filters.categories.includes(option.value)
                                    ? filters.categories.filter(
                                        (c) => c !== option.value
                                      )
                                    : [...filters.categories, option.value];
                                applyFilters({
                                  ...filters,
                                  categories: nextCategories
                                });
                              }}
                            >
                              <div
                                className="category-icon"
                                style={
                                  filters.categories.includes(option.value)
                                    ? {
                                        background:
                                          CATEGORY_COLORS[option.value],
                                        borderColor:
                                          CATEGORY_COLORS[option.value],
                                        color: '#fff'
                                      }
                                    : {
                                        borderColor:
                                          CATEGORY_COLORS[option.value],
                                        color: CATEGORY_COLORS[option.value]
                                      }
                                }
                              >
                                <CategoryIcon category={option.value} />
                              </div>
                              <span>
                                {SHORT_CATEGORY_LABELS[locale][option.value]}
                              </span>
                            </button>
                          ))}
                        </div>
                      </CollapsibleFilterGroup>

                      <CollapsibleFilterGroup
                        title="Prix"
                        collapsed={collapsedSections.has('prix')}
                        onToggle={() => toggleSection('prix')}
                      >
                        <div className="pill-list">
                          {PRICE_FILTER_OPTIONS.map((option) => (
                            <button
                              type="button"
                              key={option.value}
                              className={`filter-pill ${filters.price === option.value ? 'active' : ''}`}
                              onClick={() =>
                                applyFilters({
                                  ...filters,
                                  price: option.value
                                })
                              }
                            >
                              {getPriceLabel(locale, option.value)}
                            </button>
                          ))}
                        </div>
                      </CollapsibleFilterGroup>

                      <CollapsibleFilterGroup
                        title="Date"
                        collapsed={collapsedSections.has('date')}
                        onToggle={() => toggleSection('date')}
                      >
                        <div className="pill-list">
                          {DATE_FILTER_OPTIONS.map((option) => (
                            <button
                              type="button"
                              key={option.value}
                              className={`filter-pill ${filters.date === option.value ? 'active' : ''}`}
                              onClick={() =>
                                applyFilters(
                                  withoutCustomDates(filters, option.value)
                                )
                              }
                            >
                              {getDateFilterLabel(locale, option.value)}
                            </button>
                          ))}
                        </div>
                      </CollapsibleFilterGroup>

                      <CollapsibleFilterGroup
                        title="Distance"
                        collapsed={collapsedSections.has('distance')}
                        onToggle={() => toggleSection('distance')}
                      >
                        <div className="distance-slider-container">
                          <input
                            type="range"
                            min="1"
                            max="30"
                            value={distanceKm}
                            onChange={(event) =>
                              setDistanceKm(Number(event.target.value))
                            }
                            onMouseUp={applyDistanceFilter}
                            onTouchEnd={applyDistanceFilter}
                            onKeyUp={applyDistanceFilter}
                            className="distance-slider"
                          />
                          <div className="distance-labels">
                            <span>1km</span>
                            <span>10km</span>
                            <span>20km</span>
                            <span>30km</span>
                          </div>
                          <p className="distance-value">
                            {distanceFilterActive
                              ? `Rayon actif : ${distanceKm} km`
                              : `Rayon max (${distanceKm} km) — non appliqué`}
                            {geoStatus === 'pending' && ' · localisation…'}
                            {geoStatus === 'denied' &&
                              ' · position non partagée'}
                            {geoStatus === 'unsupported' &&
                              ' · non disponible sur cet appareil'}
                          </p>
                        </div>
                      </CollapsibleFilterGroup>
                    </>
                  )}

                  {section === 'lieu' && (
                    <>
                      <div className="filter-group-title-row">
                        <h3>Filtres</h3>
                        <button
                          className="filter-reset"
                          onClick={() => {
                            setVenueCategoryFilter([]);
                            applyFilters(withoutCustomDates(filters, 'next7'));
                          }}
                        >
                          Réinitialiser
                        </button>
                      </div>

                      <CollapsibleFilterGroup
                        title="Catégorie de lieu"
                        collapsed={collapsedSections.has('lieu-categorie')}
                        onToggle={() => toggleSection('lieu-categorie')}
                      >
                        <div className="pill-list venue-category-pills">
                          {VENUE_CATEGORY_FILTER_OPTIONS.map((option) => {
                            const active = venueCategoryFilter.includes(
                              option.value
                            );
                            return (
                              <button
                                type="button"
                                key={option.value}
                                className={`filter-pill ${active ? 'active' : ''}`}
                                style={
                                  active
                                    ? {
                                        background: `${VENUE_CATEGORY_COLORS[option.value]}2e`,
                                        borderColor:
                                          VENUE_CATEGORY_COLORS[option.value],
                                        color: '#fff'
                                      }
                                    : {
                                        background: `${VENUE_CATEGORY_COLORS[option.value]}12`,
                                        borderColor: `${VENUE_CATEGORY_COLORS[option.value]}55`,
                                        color: 'var(--text-secondary)'
                                      }
                                }
                                onClick={() =>
                                  setVenueCategoryFilter((prev) =>
                                    prev.includes(option.value)
                                      ? prev.filter(
                                          (value) => value !== option.value
                                        )
                                      : [...prev, option.value]
                                  )
                                }
                              >
                                <span
                                  className="venue-category-pill-dot"
                                  style={{
                                    background:
                                      VENUE_CATEGORY_COLORS[option.value]
                                  }}
                                  aria-hidden="true"
                                />
                                {VENUE_CATEGORY_LABELS[locale][option.value]}
                              </button>
                            );
                          })}
                        </div>
                      </CollapsibleFilterGroup>

                      <CollapsibleFilterGroup
                        title="Date"
                        collapsed={collapsedSections.has('lieu-date')}
                        onToggle={() => toggleSection('lieu-date')}
                      >
                        <p className="category-legend-hint">
                          Affiche les lieux ayant un événement dans cette
                          période.
                        </p>
                        <div className="pill-list">
                          {DATE_FILTER_OPTIONS.map((option) => (
                            <button
                              type="button"
                              key={option.value}
                              className={`filter-pill ${filters.date === option.value ? 'active' : ''}`}
                              onClick={() =>
                                applyFilters(
                                  withoutCustomDates(filters, option.value)
                                )
                              }
                            >
                              {getDateFilterLabel(locale, option.value)}
                            </button>
                          ))}
                        </div>
                      </CollapsibleFilterGroup>

                      <CollapsibleFilterGroup
                        title="Distance"
                        collapsed={collapsedSections.has('distance')}
                        onToggle={() => toggleSection('distance')}
                      >
                        <div className="distance-slider-container">
                          <input
                            type="range"
                            min="1"
                            max="30"
                            value={distanceKm}
                            onChange={(event) =>
                              setDistanceKm(Number(event.target.value))
                            }
                            onMouseUp={applyDistanceFilter}
                            onTouchEnd={applyDistanceFilter}
                            onKeyUp={applyDistanceFilter}
                            className="distance-slider"
                          />
                          <div className="distance-labels">
                            <span>1km</span>
                            <span>10km</span>
                            <span>20km</span>
                            <span>30km</span>
                          </div>
                          <p className="distance-value">
                            {distanceFilterActive
                              ? `Rayon actif : ${distanceKm} km`
                              : `Rayon max (${distanceKm} km) — non appliqué`}
                            {geoStatus === 'pending' && ' · localisation…'}
                            {geoStatus === 'denied' &&
                              ' · position non partagée'}
                            {geoStatus === 'unsupported' &&
                              ' · non disponible sur cet appareil'}
                          </p>
                        </div>
                      </CollapsibleFilterGroup>
                    </>
                  )}

                  <div className="promo-card">
                    <div className="promo-content">
                      <h4>Téléchargez Pulso</h4>
                      <p>Emportez la ville dans votre poche.</p>
                    </div>
                    <div className="promo-store-badges">
                      <button
                        type="button"
                        className="promo-store-badge"
                        disabled
                      >
                        <span
                          className="promo-store-badge-icon"
                          aria-hidden="true"
                        >
                          🍎
                        </span>
                        <span>
                          <small>Bientôt sur</small>
                          <strong>App Store</strong>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="promo-store-badge"
                        disabled
                      >
                        <span
                          className="promo-store-badge-icon"
                          aria-hidden="true"
                        >
                          ▶️
                        </span>
                        <span>
                          <small>Bientôt sur</small>
                          <strong>Google Play</strong>
                        </span>
                      </button>
                    </div>
                  </div>
                </aside>
              )}

              {mobileFiltersOpen && (
                <div
                  className="mobile-filters-backdrop"
                  onClick={() => setMobileFiltersOpen(false)}
                />
              )}

              {/* Événement map + content - always mounted (never conditionally
            unmounted by section) so the MapLibre instance attached to
            `container` is never torn down and recreated; only its CSS
            display toggles. A map created while its container isn't in the
            DOM never recovers its size once it reappears. */}
              <section
                className="map-container-wrapper"
                aria-label={translate(locale, 'map.label')}
                style={{
                  display: section === 'evenement' ? undefined : 'none'
                }}
              >
                <div
                  className="map-shell"
                  data-map-context="preserved"
                  style={{ display: viewMode === 'map' ? undefined : 'none' }}
                >
                  <div ref={container} className="map" />
                  <button
                    type="button"
                    className="mobile-filters-trigger"
                    onClick={() => setMobileFiltersOpen(true)}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <line x1="4" y1="6" x2="20" y2="6" />
                      <line x1="4" y1="12" x2="20" y2="12" />
                      <line x1="4" y1="18" x2="20" y2="18" />
                      <circle cx="9" cy="6" r="1.6" fill="currentColor" />
                      <circle cx="15" cy="12" r="1.6" fill="currentColor" />
                      <circle cx="11" cy="18" r="1.6" fill="currentColor" />
                    </svg>
                    Filtres
                  </button>
                  <button
                    type="button"
                    className="map-floating-recenter"
                    onClick={() =>
                      map.current?.flyTo({ center: MONTREAL_CENTER, zoom: 11 })
                    }
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="3" />
                      <line x1="12" y1="2" x2="12" y2="5" />
                      <line x1="12" y1="19" x2="12" y2="22" />
                      <line x1="2" y1="12" x2="5" y2="12" />
                      <line x1="19" y1="12" x2="22" y2="12" />
                    </svg>
                    Recentrer
                  </button>

                  <MapFilterBar
                    filters={filters}
                    onChange={applyFilters}
                    onOpenMore={() => setFiltersOpen((prev) => !prev)}
                    locale={locale}
                  />

                  <div className="map-zoom-controls">
                    <button
                      type="button"
                      className="map-zoom-btn"
                      aria-label={translate(locale, 'map.zoomIn')}
                      onClick={() => map.current?.zoomIn()}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="map-zoom-btn"
                      aria-label={translate(locale, 'map.zoomOut')}
                      onClick={() => map.current?.zoomOut()}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="map-zoom-btn"
                      aria-label="Recentrer sur Montréal"
                      title="Montréal"
                      onClick={() =>
                        connectedMap.current?.flyTo({
                          center: MONTREAL_CENTER,
                          zoom: 11
                        })
                      }
                    >
                      M
                    </button>
                    <button
                      type="button"
                      className="map-zoom-btn map-recenter-btn"
                      aria-label={translate(locale, 'map.recenter')}
                      disabled={!userLocation}
                      onClick={() => {
                        if (!userLocation) return;
                        map.current?.flyTo({
                          center: [
                            userLocation.longitude,
                            userLocation.latitude
                          ],
                          zoom: 14
                        });
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                      </svg>
                    </button>
                  </div>

                  {basemapState !== 'loaded' && (
                    <div className="map-basemap-status" role="status">
                      {basemapState === 'loading' && (
                        <span
                          className="map-basemap-spinner"
                          aria-hidden="true"
                        />
                      )}
                      <p>
                        {basemapState === 'loading'
                          ? translate(locale, 'map.basemapLoading')
                          : translate(locale, 'map.basemapUnavailable')}
                      </p>
                    </div>
                  )}

                  {basemapState === 'loaded' &&
                    eventsLoadState === 'success' &&
                    events.length === 0 && (
                      <div className="map-empty-state">
                        <p className="map-empty-state-title">
                          {translate(locale, 'map.emptyTitle')}
                        </p>
                        <p className="map-empty-state-subtitle">
                          {translate(locale, 'map.emptySubtitle')}
                        </p>
                        <div className="map-empty-state-actions">
                          <button
                            type="button"
                            onClick={() =>
                              map.current?.flyTo({
                                center: MONTREAL_CENTER,
                                zoom: 11
                              })
                            }
                          >
                            {translate(locale, 'map.emptyWiden')}
                          </button>
                          <button type="button" onClick={clearAll}>
                            {translate(locale, 'map.emptyClear')}
                          </button>
                          <button
                            type="button"
                            className="primary"
                            onClick={() =>
                              applyFilters(withoutCustomDates(filters, 'next7'))
                            }
                          >
                            {translate(locale, 'map.emptyThisWeek')}
                          </button>
                        </div>
                      </div>
                    )}
                </div>

                {viewMode === 'list' && (
                  <ListView
                    events={listOverride?.events ?? events}
                    favorites={favorites}
                    showFavoritesOnly={showFavoritesOnly}
                    onToggleFavorite={toggleFavorite}
                    onOpenDetails={openDetails}
                    title={listOverride?.title}
                    onClearTitle={
                      listOverride
                        ? () => setListOverride(undefined)
                        : undefined
                    }
                    locale={locale}
                  />
                )}

                {viewMode === 'calendar' && (
                  <CalendarView
                    month={calendarMonth}
                    onChangeMonth={setCalendarMonth}
                    events={calendarEvents}
                    state={calendarState}
                    favorites={favorites}
                    showFavoritesOnly={showFavoritesOnly}
                    categories={calendarCategories}
                    onChangeCategories={setCalendarCategories}
                    price={calendarPrice}
                    onChangePrice={setCalendarPrice}
                    selectedDay={selectedDay}
                    onSelectDay={(day, dayEvents) => {
                      setSelectedDay(day);
                      if (day) {
                        const dayLabel = new Date(
                          `${day}T00:00:00`
                        ).toLocaleDateString(
                          locale === 'fr' ? 'fr-CA' : 'en-CA',
                          { weekday: 'long', day: 'numeric', month: 'long' }
                        );
                        // The festive-day marker on the grid only had a hover
                        // tooltip, easy to miss (and useless on touch) - naming
                        // it in the picker title that opens on click/tap makes
                        // "what is this highlighted day" self-evident the moment
                        // someone actually interacts with it.
                        const festiveLabel = FESTIVE_DAYS[day.slice(5)];
                        setDetails({ kind: 'closed' });
                        setPickerList({
                          title: festiveLabel
                            ? `${dayLabel} — ${festiveLabel}`
                            : dayLabel,
                          events: dayEvents
                        });
                      } else {
                        setPickerList(undefined);
                      }
                    }}
                    locale={locale}
                  />
                )}
              </section>

              {/* Lieu map + content - same always-mounted rationale as Événement's
            map above. */}
              <section
                className="map-container-wrapper"
                style={{ display: section === 'lieu' ? undefined : 'none' }}
              >
                <div className="venue-section">
                  <button
                    type="button"
                    className="mobile-filters-trigger"
                    onClick={() => setMobileFiltersOpen(true)}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <line x1="4" y1="6" x2="20" y2="6" />
                      <line x1="4" y1="12" x2="20" y2="12" />
                      <line x1="4" y1="18" x2="20" y2="18" />
                      <circle cx="9" cy="6" r="1.6" fill="currentColor" />
                      <circle cx="15" cy="12" r="1.6" fill="currentColor" />
                      <circle cx="11" cy="18" r="1.6" fill="currentColor" />
                    </svg>
                    Filtres
                  </button>
                  <div
                    className="map-shell"
                    style={{ display: lieuTab === 'map' ? undefined : 'none' }}
                  >
                    <div ref={lieuMapContainer} className="map" />
                    <div className="explorer-location-controls">
                      <button
                        type="button"
                        onClick={() =>
                          lieuMap.current?.flyTo({
                            center: MONTREAL_CENTER,
                            zoom: 11
                          })
                        }
                      >
                        Montréal
                      </button>
                      <button
                        type="button"
                        disabled={!userLocation}
                        onClick={() => {
                          if (!userLocation) return;
                          lieuMap.current?.flyTo({
                            center: [
                              userLocation.longitude,
                              userLocation.latitude
                            ],
                            zoom: 14
                          });
                        }}
                      >
                        Ma position
                      </button>
                    </div>
                  </div>
                  {lieuTab === 'list' && (
                    <VenueListView
                      groups={filteredVenueListGroups}
                      onSelectVenue={(group) => {
                        setDetails({ kind: 'closed' });
                        setVenuePickerList(undefined);
                        setPickerList(undefined);
                        setVenueDetailsGroup(group);
                      }}
                      favoriteVenues={favoriteVenues}
                      onToggleFavoriteVenue={toggleFavoriteVenue}
                      locale={locale}
                    />
                  )}
                  {lieuTab === 'calendar' && (
                    <CalendarView
                      month={calendarMonth}
                      onChangeMonth={setCalendarMonth}
                      events={calendarEvents}
                      state={calendarState}
                      favorites={favorites}
                      showFavoritesOnly={false}
                      categories={calendarCategories}
                      onChangeCategories={setCalendarCategories}
                      price={calendarPrice}
                      onChangePrice={setCalendarPrice}
                      selectedDay={selectedDay}
                      onSelectDay={(day, dayEvents) => {
                        // The one real divergence from Événement's calendar: a day
                        // groups its events by venue first (confirmed with the
                        // user) rather than opening the raw event list - drilling
                        // into one venue from there opens the normal PickerList
                        // with that venue's events for the day.
                        setSelectedDay(day);
                        if (day) {
                          const dayLabel = new Date(
                            `${day}T00:00:00`
                          ).toLocaleDateString(
                            locale === 'fr' ? 'fr-CA' : 'en-CA',
                            { weekday: 'long', day: 'numeric', month: 'long' }
                          );
                          setDetails({ kind: 'closed' });
                          setPickerList(undefined);
                          setVenuePickerList({
                            title: dayLabel,
                            groups: groupEventsByVenue(dayEvents)
                          });
                        } else {
                          setVenuePickerList(undefined);
                        }
                      }}
                      locale={locale}
                    />
                  )}
                </div>
              </section>

              {/* Explorer map - same always-mounted rationale. Only for the
                  anonymous top-navbar's "Explorer" now (Phase 4.13) - signed-
                  in users get the dedicated section right below instead. */}
              <section
                className="map-container-wrapper"
                style={{
                  display: !user && section === 'explorer' ? undefined : 'none'
                }}
              >
                <div className="map-shell explorer-map-shell">
                  <div ref={explorerMapContainer} className="map" />
                  <div className="map-floating-pin-toggle">
                    <button
                      type="button"
                      className={explorerPinKind === 'all' ? 'active' : ''}
                      onClick={() => setExplorerPinKind('all')}
                    >
                      Tout <span>{events.length + venueGroups.length}</span>
                    </button>
                    <button
                      type="button"
                      className={explorerPinKind === 'event' ? 'active' : ''}
                      onClick={() => setExplorerPinKind('event')}
                    >
                      Événements <span>{events.length}</span>
                    </button>
                    <button
                      type="button"
                      className={explorerPinKind === 'venue' ? 'active' : ''}
                      onClick={() => setExplorerPinKind('venue')}
                    >
                      Lieux <span>{venueGroups.length}</span>
                    </button>
                    {/* Explorer's floating chrome is one cluster now. The
                        old top-left bar duplicated its own date filter - an
                        "Aujourd'hui" dropdown sitting above an "Aujourd'hui"
                        chip - and took a bite out of the map from a second
                        corner. The three buttons on the left choose what is
                        pinned; this one narrows which of them. */}
                    <span className="map-floating-divider" aria-hidden="true" />
                    <button
                      type="button"
                      className={`map-floating-filters ${filtersOpen ? 'active' : ''}`}
                      aria-expanded={filtersOpen}
                      onClick={() => setFiltersOpen((open) => !open)}
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="M3 5h18M6 12h12M10 19h4" />
                      </svg>
                      Filtres
                      {activeFilterCount > 0 && (
                        <span className="map-floating-filters-count">
                          {activeFilterCount}
                        </span>
                      )}
                    </button>
                  </div>
                  <div className="explorer-map-legend" aria-label="Légende">
                    <span>
                      <i className="legend-event-dot" /> Événement programmé
                    </span>
                    <span>
                      <i className="legend-venue-dot" /> Lieu récurrent
                    </span>
                  </div>
                  <div className="explorer-location-controls">
                    <button
                      type="button"
                      onClick={() =>
                        explorerMap.current?.flyTo({
                          center: MONTREAL_CENTER,
                          zoom: 11
                        })
                      }
                    >
                      Montréal
                    </button>
                    <button
                      type="button"
                      disabled={!userLocation}
                      onClick={() => {
                        if (!userLocation) return;
                        explorerMap.current?.flyTo({
                          center: [
                            userLocation.longitude,
                            userLocation.latitude
                          ],
                          zoom: 14
                        });
                      }}
                    >
                      Ma position
                    </button>
                  </div>
                </div>
              </section>

              {/* Connected "Carte" (Phase 4.13) - its own map instance
                  (connectedMap/connectedMapContainer), real clustering with
                  visible counts for both events and venues, a real filter
                  bar (reuses MapFilterBar as-is), a real recenter/zoom
                  control, and a small floating card on pin selection
                  instead of the full EventDetails panel. explorerMap above
                  is untouched - anonymous "Explorer" behaves exactly as
                  before. */}
              <section
                className="map-container-wrapper"
                style={{
                  display: user && section === 'explorer' ? undefined : 'none'
                }}
              >
                <div className="map-shell connected-map-shell">
                  <div className="connected-map-context">
                    <span>Explorer Montréal</span>
                    <strong>
                      {events.length + venueGroups.length} repères
                    </strong>
                  </div>

                  <MapFilterBar
                    filters={filters}
                    onChange={applyFilters}
                    onOpenMore={() => setFiltersOpen((prev) => !prev)}
                    locale={locale}
                  />

                  <div
                    className="explorer-date-shortcuts"
                    aria-label="Période d'exploration"
                  >
                    <button
                      type="button"
                      className={filters.date === 'today' ? 'active' : ''}
                      onClick={() => applyExplorerDatePreset('today')}
                    >
                      Aujourd'hui
                    </button>
                    <button
                      type="button"
                      className={filters.date === 'tonight' ? 'active' : ''}
                      onClick={() => applyExplorerDatePreset('tonight')}
                    >
                      Ce soir
                    </button>
                    <button
                      type="button"
                      className={filters.date === 'weekend' ? 'active' : ''}
                      onClick={() => applyExplorerDatePreset('weekend')}
                    >
                      Ce week-end
                    </button>
                    <button
                      type="button"
                      className={explorerTwoWeeksActive ? 'active' : ''}
                      onClick={() => applyExplorerDatePreset('two-weeks')}
                    >
                      14 jours
                    </button>
                  </div>

                  <div ref={connectedMapContainerRef} className="map" />

                  <div className="map-floating-pin-toggle">
                    <button
                      type="button"
                      className={explorerPinKind === 'all' ? 'active' : ''}
                      onClick={() => setExplorerPinKind('all')}
                    >
                      <i className="map-toggle-dot map-toggle-dot-all" />
                      Tout <span>{events.length + venueGroups.length}</span>
                    </button>
                    <button
                      type="button"
                      className={explorerPinKind === 'event' ? 'active' : ''}
                      onClick={() => setExplorerPinKind('event')}
                    >
                      <i className="map-toggle-dot map-toggle-dot-event" />
                      Événements <span>{events.length}</span>
                    </button>
                    <button
                      type="button"
                      className={explorerPinKind === 'venue' ? 'active' : ''}
                      onClick={() => setExplorerPinKind('venue')}
                    >
                      <i className="map-toggle-dot map-toggle-dot-venue" />
                      Lieux <span>{venueGroups.length}</span>
                    </button>
                    {/* Connected map only (DEC-0017) - the anonymous
                        Explorer's identical toggle above deliberately has no
                        After, since the filter and the created events it
                        surfaces are both connected-experience surfaces. */}
                    <button
                      type="button"
                      className={explorerPinKind === 'after' ? 'active' : ''}
                      onClick={() => setExplorerPinKind('after')}
                    >
                      <i className="map-toggle-dot map-toggle-dot-after" />
                      After <span>{afterEventCount}</span>
                    </button>
                  </div>

                  <div className="explorer-map-legend" aria-label="Légende">
                    <strong>Repères</strong>
                    <span>
                      <i className="legend-event-dot" /> Événement programmé
                    </span>
                    <span>
                      <i className="legend-venue-dot" /> Lieu récurrent
                    </span>
                  </div>

                  <div className="map-zoom-controls">
                    <button
                      type="button"
                      className="map-zoom-btn"
                      aria-label={translate(locale, 'map.zoomIn')}
                      onClick={() => connectedMap.current?.zoomIn()}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="map-zoom-btn"
                      aria-label={translate(locale, 'map.zoomOut')}
                      onClick={() => connectedMap.current?.zoomOut()}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="map-zoom-btn"
                      aria-label="Recentrer sur Montréal"
                      title="Montréal"
                      onClick={() =>
                        connectedMap.current?.flyTo({
                          center: MONTREAL_CENTER,
                          zoom: 11
                        })
                      }
                    >
                      <span className="map-montreal-icon" aria-hidden="true">
                        ⌖
                      </span>
                    </button>
                    <button
                      type="button"
                      className="map-zoom-btn map-recenter-btn"
                      aria-label="Ma position"
                      title="Ma position"
                      disabled={!userLocation}
                      onClick={() => {
                        if (!userLocation) return;
                        connectedMap.current?.flyTo({
                          center: [
                            userLocation.longitude,
                            userLocation.latitude
                          ],
                          zoom: 14
                        });
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                      </svg>
                    </button>
                  </div>

                  {mapSelection && (
                    <MapSelectionCard
                      selection={mapSelection}
                      attendeeCount={
                        mapSelection.kind === 'event' &&
                        selectionEngagement?.eventId === mapSelection.event.id
                          ? selectionEngagement.attendeeCount
                          : undefined
                      }
                      onClose={() => setMapSelection(undefined)}
                      onOpenEvent={(eventId) => {
                        setMapSelection(undefined);
                        void openDetails(eventId, {
                          asForumPanel: true,
                          forumEventFirst: true
                        });
                      }}
                      locale={locale}
                    />
                  )}
                </div>
              </section>

              {section === 'favoris' && (
                <FavorisSection
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                  onOpenDetails={openDetails}
                  favoriteVenueGroups={venueGroups.filter((group) =>
                    favoriteVenues.includes(group.id)
                  )}
                  favoriteVenues={favoriteVenues}
                  onToggleFavoriteVenue={toggleFavoriteVenue}
                  onSelectVenue={(group) => {
                    setDetails({ kind: 'closed' });
                    setVenuePickerList(undefined);
                    if (group.events.length === 1) {
                      void openDetails(group.events[0]!.id);
                    } else {
                      setPickerList({
                        title: `${group.name} — ${group.address}`,
                        events: group.events
                      });
                      setSection('lieu');
                    }
                  }}
                  locale={locale}
                  authToken={authToken}
                  onNavigateToMap={() => setSection('lieu')}
                  onNavigateToEvents={() => setSection('evenement')}
                />
              )}

              {section === 'compte' && user && (
                <CompteSection
                  user={user}
                  authToken={authToken}
                  onUserUpdated={setUser}
                  onLogout={() => {
                    // Signing out from a connected-only destination left
                    // `section` on something the anonymous tree has no
                    // branch for, so the navbar rendered and the content
                    // area came up empty. Land back on the anonymous
                    // default rather than nowhere.
                    setSection('evenement');
                    setForumPanelMode(false);
                    setAboutOpen(false);
                    logout();
                  }}
                  locale={locale}
                  onChangeLocale={selectLocale}
                  attendance={attendance}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                  onOpenDetails={openDetails}
                  favoriteVenueGroups={venueGroups.filter((group) =>
                    favoriteVenues.includes(group.id)
                  )}
                  favoriteVenues={favoriteVenues}
                  onToggleFavoriteVenue={toggleFavoriteVenue}
                  onSelectVenue={(group) => {
                    setDetails({ kind: 'closed' });
                    setVenuePickerList(undefined);
                    if (group.events.length === 1) {
                      void openDetails(group.events[0]!.id);
                    } else {
                      setPickerList({
                        title: `${group.name} — ${group.address}`,
                        events: group.events
                      });
                      setSection('lieu');
                    }
                  }}
                  onOpenAmis={() => setSection('amis')}
                />
              )}

              {/* Right Sidebar (Details / cluster picker) - one shared slot, see
            rightPanelMount above for why these aren't two independent panels. */}
              {rightPanelMount.mounted && (
                <div
                  className={`sidebar-right panel-transition ${shownRightPanelContent.kind === 'venue-details' ? 'sidebar-right-venue-detail' : ''} ${rightPanelMount.visible ? 'panel-visible' : ''}`}
                >
                  {shownRightPanelContent.kind === 'details' &&
                    shownRightPanelContent.state.kind === 'success' &&
                    (() => {
                      const shownEvent = shownRightPanelContent.state.event;
                      return (
                        <EventDetails
                          event={shownEvent}
                          headingRef={detailsHeading}
                          onBack={returnToMap}
                          isFavorite={favorites.includes(shownEvent.id)}
                          onToggleFavorite={() => toggleFavorite(shownEvent.id)}
                          locale={locale}
                          user={user}
                          authToken={authToken}
                          onLogin={login}
                          attendanceVisibility={attendance[shownEvent.id]}
                          onSetAttendance={(visibility) =>
                            setAttendance(shownEvent.id, visibility)
                          }
                          onClearAttendance={() =>
                            clearAttendance(shownEvent.id)
                          }
                          initialTab={detailsInitialTab}
                          onOpenForumPanel={() => setForumPanelMode(true)}
                        />
                      );
                    })()}
                  {shownRightPanelContent.kind === 'details' &&
                    shownRightPanelContent.state.kind === 'loading' && (
                      <div style={{ padding: '2rem' }}>Chargement...</div>
                    )}
                  {shownRightPanelContent.kind === 'details' &&
                    shownRightPanelContent.state.kind === 'error' &&
                    (() => {
                      const failedEventId =
                        shownRightPanelContent.state.eventId;
                      return (
                        <div style={{ padding: '2rem' }}>
                          Erreur de chargement.
                          <button
                            className="btn-secondary"
                            onClick={() =>
                              void openDetails(failedEventId, {
                                keepPickerList: true
                              })
                            }
                            style={{ marginTop: '1rem' }}
                          >
                            Réessayer
                          </button>
                        </div>
                      );
                    })()}
                  {shownRightPanelContent.kind === 'picker' && (
                    <PickerList
                      title={shownRightPanelContent.list.title}
                      events={shownRightPanelContent.list.events}
                      favorites={favorites}
                      locale={locale}
                      onClose={() => setPickerList(undefined)}
                      onSelect={(id) =>
                        void openDetails(id, { keepPickerList: true })
                      }
                    />
                  )}
                  {shownRightPanelContent.kind === 'venue-picker' && (
                    <VenuePickerList
                      title={shownRightPanelContent.list.title}
                      groups={shownRightPanelContent.list.groups}
                      favoriteVenues={favoriteVenues}
                      locale={locale}
                      onClose={() => setVenuePickerList(undefined)}
                      onSelectVenue={(group) => {
                        setDetails({ kind: 'closed' });
                        setVenuePickerList(undefined);
                        setPickerList(undefined);
                        setVenueDetailsGroup(group);
                      }}
                    />
                  )}
                  {shownRightPanelContent.kind === 'venue-details' && (
                    <VenueDetailContent
                      group={shownRightPanelContent.group}
                      favoriteVenues={favoriteVenues}
                      onToggleFavoriteVenue={toggleFavoriteVenue}
                      favoriteCount={0}
                      onOpenEventForum={(eventId) =>
                        void openDetails(eventId, { keepVenueDetails: true })
                      }
                      authToken={authToken}
                      locale={locale}
                      onClose={() => setVenueDetailsGroup(undefined)}
                    />
                  )}
                </div>
              )}
            </div>

            {filtersOverlayMount.mounted && (
              <FilterOverlay
                filters={filters}
                onChange={applyFilters}
                onClose={() => setFiltersOpen(false)}
                onClearAll={clearAll}
                locale={locale}
                visible={filtersOverlayMount.visible}
                distanceKm={distanceKm}
                onDistanceChange={setDistanceKm}
                onApplyDistance={applyDistanceFilter}
                distanceFilterActive={distanceFilterActive}
                geoStatus={geoStatus}
              />
            )}

            {aboutPanelMount.mounted && (
              <AboutPanel
                onClose={() => setAboutOpen(false)}
                visible={aboutPanelMount.visible}
              />
            )}

            {/* Selected marker preview fallback logic */}
            {selected && details.kind === 'closed' && (
              <div className="event-preview-wrapper">
                <EventPreview
                  event={selected}
                  searchMatch={searchResult?.data.find(
                    ({ event }) => event.id === selected.id
                  )}
                  detailsButton={detailsButton}
                  onClose={() => setSelected(undefined)}
                  onDetails={() => void openDetails(selected.id)}
                  isFavorite={favorites.includes(selected.id)}
                  onToggleFavorite={() => toggleFavorite(selected.id)}
                  locale={locale}
                />
              </div>
            )}

            <div className="bottom-section">
              <div className="section-header">
                <h2>Événements autour de vous</h2>
                <button
                  type="button"
                  className="view-all"
                  onClick={() => {
                    setListOverride({
                      title: 'Événements les plus proches de vous',
                      events: carouselEvents.slice(0, 15)
                    });
                    setViewMode('list');
                  }}
                >
                  Voir tous les événements{' '}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ verticalAlign: 'middle', marginLeft: 4 }}
                  >
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </button>
              </div>

              <div className="event-carousel">
                {carouselEvents.slice(0, 15).map((evt) => (
                  <div
                    className="event-card"
                    key={evt.id}
                    onClick={() => openDetails(evt.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div
                      className="event-card-img"
                      style={
                        evt.imageUrl
                          ? {
                              backgroundImage: `url(${evt.imageUrl})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center'
                            }
                          : undefined
                      }
                    >
                      {!evt.imageUrl && (
                        <EventImageFallback category={evt.category} />
                      )}
                      <div
                        className="card-badge"
                        style={{
                          background:
                            CATEGORY_COLORS[evt.category] ??
                            CATEGORY_COLORS['other']
                        }}
                      >
                        {SHORT_CATEGORY_LABELS[locale][evt.category]}
                      </div>
                      <button
                        className="card-fav"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(evt.id);
                        }}
                      >
                        {favorites.includes(evt.id) ? '❤️' : '🤍'}
                      </button>
                    </div>
                    <div className="event-card-content">
                      <h3>{evt.title}</h3>
                      <p>{evt.venue?.name}</p>
                      <p className="card-price">
                        {evt.startsAt
                          ? new Date(evt.startsAt).toLocaleDateString()
                          : ''}
                      </p>
                    </div>
                  </div>
                ))}
                {carouselEmpty && <p>Aucun événement trouvé.</p>}
              </div>

              <div className="feature-footer">
                <div className="feature-item">
                  <div className="feature-icon">⚡</div>
                  <div className="feature-text">
                    <h4>Carte intelligente</h4>
                    <p>
                      Explorez votre ville et découvrez des événements autour de
                      vous en temps réel.
                    </p>
                  </div>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">🔍</div>
                  <div className="feature-text">
                    <h4>Recherche puissante</h4>
                    <p>
                      Trouvez exactement ce que vous cherchez grâce à la
                      recherche et à nos suggestions.
                    </p>
                  </div>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">❤️</div>
                  <div className="feature-text">
                    <h4>Vos favoris</h4>
                    <p>
                      Sauvegardez vos événements préférés et ne manquez jamais
                      une sortie.
                    </p>
                  </div>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">👥</div>
                  <div className="feature-text">
                    <h4>Communauté</h4>
                    <p>
                      Rejoignez des milliers de passionnés et partagez vos
                      meilleures découvertes.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Fragment>
        )}
      </ContentColumn>
    </div>
  );
}

// getCategoryLabel returns MVP-0001's precise scope-boundary text (e.g.
// "Nightlife / DJ / club / qualifying bar events"), which is exactly right
// for the filter overlay's checkboxes but too long to fit the sidebar grid
// on one line. Short display-only labels for that grid; the overlay still
// uses the full scope text.
const SHORT_CATEGORY_LABELS: Record<
  SupportedLocale,
  Record<EventCategory, string>
> = {
  fr: {
    music: 'Musique',
    nightlife: 'Vie nocturne',
    festival: 'Festivals',
    show: 'Spectacles',
    comedy: 'Humour',
    sport: 'Sport',
    other: 'Autres'
  },
  en: {
    music: 'Music',
    nightlife: 'Nightlife',
    festival: 'Festivals',
    show: 'Shows',
    comedy: 'Comedy',
    sport: 'Sport',
    other: 'Other'
  }
};

const VENUE_CATEGORY_LABELS: Record<
  SupportedLocale,
  Record<VenueCategory, string>
> = {
  fr: {
    bar: 'Bar',
    nightclub: 'Boîte de nuit',
    concert_hall: 'Salle de concert',
    theater: 'Théâtre / salle de spectacle',
    brewery_with_stage: 'Brasserie avec scène',
    outdoor_festival_site: 'Parc / festival extérieur',
    cafe_concert: 'Café-concert',
    gallery_museum: 'Galerie / musée',
    community_space: 'Espace communautaire',
    other: 'Autre'
  },
  en: {
    bar: 'Bar',
    nightclub: 'Nightclub',
    concert_hall: 'Concert hall',
    theater: 'Theater',
    brewery_with_stage: 'Brewery with stage',
    outdoor_festival_site: 'Outdoor park / festival site',
    cafe_concert: 'Café-concert',
    gallery_museum: 'Gallery / museum',
    community_space: 'Community space',
    other: 'Other'
  }
};

const CATEGORY_ICON_PATHS: Record<EventCategory, ReactNode> = {
  music: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  nightlife: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
  festival: (
    <>
      <path d="M4 20L12 4l8 16z" />
      <path d="M9 20l3-6 3 6" />
    </>
  ),
  show: (
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.86L12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z" />
  ),
  comedy: (
    <>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </>
  ),
  sport: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <path d="M2 12h20" />
    </>
  ),
  other: (
    <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V7z" />
  )
};

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="11" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

// Icône seule pour l'instant - aucun système de notifications n'existe
// encore (viendra avec la Phase 2/3 de l'espace compte) ; le bouton reste
// désactivé plutôt que de simuler une fonctionnalité absente, même
// principe que les villes "Bientôt" du sélecteur de ville.
function BellIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CategoryIcon({
  category,
  size = 20
}: {
  category: EventCategory;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {CATEGORY_ICON_PATHS[category]}
    </svg>
  );
}

/**
 * Honest stand-in for events with no real photo (Ville de Montréal's open
 * data has no image field at all; a handful of Ticketmaster events omit
 * one too): a large, clearly-abstract watermark icon over the category
 * gradient, not something that could be mistaken for an actual photo of
 * the venue or event - per product decision, Pulso never fabricates
 * imagery that looks real.
 */
function EventImageFallback({ category }: { category: EventCategory }) {
  const color = CATEGORY_COLORS[category] ?? CATEGORY_COLORS['other'];
  return (
    <div
      className="event-image-fallback"
      style={{ background: `linear-gradient(160deg, ${color}55, ${color}11)` }}
    >
      <span style={{ color: `${color}66` }}>
        <CategoryIcon category={category} size={56} />
      </span>
    </div>
  );
}

/**
 * A CSS `background-image` has no way to report a load failure, so a poster
 * URL that 404s (several `images.ra.co` ones currently do) left an empty
 * black rectangle exactly where EventImageFallback should have been - the
 * fallback only ever rendered when the URL was *absent*, not when it was
 * broken. Rendering a real <img> lets onError fall back to the same
 * treatment the no-image case already gets.
 *
 * `alt=""`: these are event posters standing in for a venue photo, and the
 * venue name is already the adjacent heading - announcing the poster would
 * be misleading rather than informative.
 */
function VenueThumbImage({
  imageUrl,
  category
}: {
  imageUrl: string | undefined;
  category: EventCategory;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [imageUrl]);
  if (!imageUrl || failed) return <EventImageFallback category={category} />;
  return (
    <img
      className="venue-thumb-image"
      src={imageUrl}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function ViewModeIcon({
  kind
}: {
  kind: 'map' | 'list' | 'venues' | 'calendar';
}) {
  const paths: Record<typeof kind, ReactNode> = {
    map: (
      <>
        <path d="M9 3v15M15 6v15" />
        <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z" />
      </>
    ),
    list: (
      <>
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </>
    ),
    venues: (
      <>
        <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
        <circle cx="12" cy="9.5" r="2.5" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </>
    )
  };
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[kind]}
    </svg>
  );
}

// The connected sidebar was the last nav in the app still drawing its items
// with emoji. Emoji render from whatever font the OS supplies, so they came
// out multicoloured, inconsistently sized, and unable to inherit the active
// item's colour - next to the anonymous navbar's stroke SVGs they read as
// placeholder art. Same 24-viewBox / 2px-stroke set as ViewModeIcon and the
// navbar icons, so the whole product uses one icon language.
type SidebarIconKind =
  | 'decouvrir'
  | 'carte'
  | 'evenements'
  | 'lieux'
  | 'forums'
  | 'groupes'
  | 'messages'
  | 'amis'
  | 'favoris'
  | 'organisateur'
  | 'administration';

function SidebarNavIcon({ kind }: { kind: SidebarIconKind }) {
  const paths: Record<SidebarIconKind, ReactNode> = {
    decouvrir: (
      <>
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
        <path d="M18 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
      </>
    ),
    carte: (
      <>
        <path d="M9 3v15M15 6v15" />
        <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z" />
      </>
    ),
    evenements: (
      <>
        <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.5a2.5 2.5 0 0 0 0 5V16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.5a2.5 2.5 0 0 0 0-5z" />
        <path d="M14 6v12" />
      </>
    ),
    lieux: (
      <>
        <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    forums: (
      <>
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
      </>
    ),
    groupes: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    messages: (
      <>
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M22 6l-10 7L2 6" />
      </>
    ),
    amis: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M17 11l2 2 4-4" />
      </>
    ),
    favoris: (
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    ),
    organisateur: (
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
        <path d="M12 14v4M10 16h4" />
      </>
    ),
    administration: (
      <>
        <path d="M12 3l7.5 3.3v5c0 4.6-3.2 8.9-7.5 10-4.3-1.1-7.5-5.4-7.5-10v-5z" />
        <path d="M9.2 12.2l1.9 1.9 3.7-3.8" />
      </>
    )
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[kind]}
    </svg>
  );
}

// Display text is composed here from the referenced rows rather than read
// from a stored label (DEC-0016 §Data and trust rules), so a renamed venue
// or a rescheduled event is reflected instead of frozen at send time.
//
// The connecting words are string literals in expression containers, not
// bare JSX text: JSX trims the leading whitespace of a text chunk, so a
// plain space after `</strong>` is silently dropped at compile time (it
// rendered as "Camille Royt'a envoyé…"), and Prettier rewrites an explicit
// {' '} straight back into that bare space. A string literal survives both.
function describeNotification(entry: PulsoNotification): {
  icon: SidebarIconKind;
  text: ReactNode;
  detail: string;
} {
  switch (entry.kind) {
    case 'venue_new_event':
      return {
        icon: 'lieux',
        text: (
          <>
            <strong>{entry.venueName}</strong>
            {" vient d'ajouter "}
            <strong>{entry.eventTitle}</strong>
          </>
        ),
        detail: formatEventDateTime(entry.eventStartsAt)
      };
    case 'friend_request_received':
      return {
        icon: 'amis',
        text: (
          <>
            <strong>{entry.actorDisplayName}</strong>
            {" t'a envoyé une demande d'ami"}
          </>
        ),
        detail: formatRelativeTime(entry.createdAt)
      };
    case 'friend_request_accepted':
      return {
        icon: 'amis',
        text: (
          <>
            <strong>{entry.actorDisplayName}</strong>
            {" a accepté ta demande d'ami"}
          </>
        ),
        detail: formatRelativeTime(entry.createdAt)
      };
    case 'message_received':
      return {
        icon: 'messages',
        text: (
          <>
            <strong>{entry.actorDisplayName}</strong>
            {" t'a envoyé un message"}
          </>
        ),
        detail: formatRelativeTime(entry.createdAt)
      };
    case 'forum_reply':
      return {
        icon: 'forums',
        text: (
          <>
            <strong>{entry.actorDisplayName}</strong>
            {' a écrit dans le forum de '}
            <strong>{entry.eventTitle}</strong>
          </>
        ),
        detail: formatRelativeTime(entry.createdAt)
      };
    case 'organizer_request_received':
      return {
        icon: 'administration',
        text: (
          <>
            <strong>{entry.actorDisplayName}</strong>
            {' demande à gérer '}
            <strong>{entry.venueName}</strong>
          </>
        ),
        detail: formatRelativeTime(entry.createdAt)
      };
    case 'organizer_request_resolved':
      return {
        icon: 'organisateur',
        text: entry.approved ? (
          <>
            {'Tu es organisateur vérifié de '}
            <strong>{entry.venueName}</strong>
          </>
        ) : (
          <>
            {'Ta demande pour '}
            <strong>{entry.venueName}</strong>
            {" n'a pas été retenue"}
          </>
        ),
        detail: formatRelativeTime(entry.createdAt)
      };
    case 'upcoming_event':
      return {
        icon: 'evenements',
        text: (
          <>
            <strong>{entry.eventTitle}</strong>
            {' commence bientôt à '}
            <strong>{entry.venueName}</strong>
          </>
        ),
        detail: formatEventDateTime(entry.eventStartsAt)
      };
  }
}

function NotificationsPanel({
  notifications,
  state,
  onClose,
  onOpenEvent,
  onOpenSection
}: {
  notifications: PulsoNotification[];
  state: 'loading' | 'success' | 'error';
  onClose: () => void;
  onOpenEvent: (eventId: string) => void;
  onOpenSection: (section: ConnectedSection) => void;
}) {
  return (
    <div
      className="notifications-panel"
      role="dialog"
      aria-label="Notifications"
    >
      <div className="notifications-panel-header">
        <h3>Notifications</h3>
        <button
          type="button"
          className="close-button"
          onClick={onClose}
          aria-label="Fermer"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'error' && (
        <p className="list-view-empty">
          Impossible de charger tes notifications.
        </p>
      )}
      {state === 'success' && notifications.length === 0 && (
        <div className="empty-state-card notifications-empty">
          <span className="empty-state-icon" aria-hidden="true">
            <BellIcon />
          </span>
          <p>Rien de neuf</p>
          <p>
            Suis un lieu pour être prévenu·e dès qu&apos;il programme quelque
            chose.
          </p>
        </div>
      )}

      <div className="notifications-list">
        {notifications.map((entry) => {
          const described = describeNotification(entry);
          const unread = 'readAt' in entry && entry.readAt === null;
          const key = 'id' in entry ? entry.id : `upcoming-${entry.eventId}`;
          const openTarget = () => {
            onClose();
            if (entry.kind === 'venue_new_event') onOpenEvent(entry.eventId);
            else if (entry.kind === 'forum_reply') onOpenEvent(entry.eventId);
            else if (entry.kind === 'upcoming_event') {
              onOpenEvent(entry.eventId);
            } else if (entry.kind === 'message_received') {
              onOpenSection('messages');
            } else {
              onOpenSection('amis');
            }
          };
          return (
            <button
              type="button"
              key={key}
              className={`notifications-row ${unread ? 'unread' : ''}`}
              onClick={openTarget}
            >
              <span className="notifications-row-icon" aria-hidden="true">
                <SidebarNavIcon kind={described.icon} />
              </span>
              <span className="notifications-row-body">
                <span className="notifications-row-text">{described.text}</span>
                <span className="notifications-row-detail">
                  {described.detail}
                </span>
              </span>
              {unread && (
                <span className="notifications-row-dot" aria-label="Non lu" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PickerList({
  title,
  events,
  favorites,
  locale,
  onClose,
  onSelect
}: {
  title: string;
  events: PublicEvent[];
  favorites: string[];
  locale: SupportedLocale;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="picker-list">
      <div className="picker-list-header">
        <h3>{title}</h3>
        <button
          type="button"
          className="close-button"
          onClick={onClose}
          aria-label="Fermer"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="picker-list-rows">
        {events.length === 0 && (
          <p className="list-view-empty">
            Aucun événement prévu pour le moment.
          </p>
        )}
        {events.map((event) => {
          const fields = eventPreviewFields(event, locale);
          return (
            <button
              type="button"
              className="list-view-row"
              key={event.id}
              onClick={() => onSelect(event.id)}
            >
              <span
                className="list-view-dot"
                style={{
                  background:
                    CATEGORY_COLORS[event.category] ?? CATEGORY_COLORS['other']
                }}
              />
              <span className="list-view-main">
                <strong>{fields.title}</strong>
                <span className="list-view-sub">
                  {fields.venue} · {fields.dateTime}
                </span>
              </span>
              <span className="list-view-price">{fields.price}</span>
              {favorites.includes(event.id) && (
                <span aria-hidden="true">❤️</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// A lightweight sibling of PickerList for venue rows (name/address/event
// count) rather than event rows (title/date/price) - kept separate instead
// of a shared "mode" prop, since the two row shapes differ enough that a
// single component would need as much branching as just having two.
function VenuePickerList({
  title,
  groups,
  favoriteVenues,
  locale,
  onClose,
  onSelectVenue
}: {
  title: string;
  groups: VenueGroup[];
  favoriteVenues: string[];
  locale: SupportedLocale;
  onClose: () => void;
  onSelectVenue: (group: VenueGroup) => void;
}) {
  return (
    <div className="picker-list">
      <div className="picker-list-header">
        <h3>{title}</h3>
        <button
          type="button"
          className="close-button"
          onClick={onClose}
          aria-label="Fermer"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="picker-list-rows">
        {groups.length === 0 && (
          <p className="list-view-empty">Aucun lieu à afficher.</p>
        )}
        {groups.map((group) => (
          <button
            type="button"
            className="list-view-row"
            key={group.id}
            onClick={() => onSelectVenue(group)}
          >
            <span
              className="list-view-dot"
              style={{
                background: CATEGORY_COLORS[group.categories[0] ?? 'other']
              }}
            />
            <span className="list-view-main">
              <strong>{group.name}</strong>
              <span className="list-view-sub">
                {group.address}
                {group.venueCategory &&
                  ` · ${VENUE_CATEGORY_LABELS[locale][group.venueCategory]}`}
              </span>
            </span>
            <span className="list-view-price">
              {group.events.length} événement
              {group.events.length > 1 ? 's' : ''}
            </span>
            {favoriteVenues.includes(group.id) && (
              <span
                aria-hidden="true"
                title="Suivi"
                className="list-view-following-dot"
              >
                🔔
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// A dedicated view of the user's saved events regardless of map viewport -
// favorites are stored client-side only (no account system), so this
// hydrates the full PublicEvent objects via GET /events/by-ids rather than
// filtering whatever the map/list already happens to have loaded (which
// would silently miss a favorite outside the current viewport).
function FavorisSection({
  favorites,
  onToggleFavorite,
  onOpenDetails,
  favoriteVenueGroups,
  favoriteVenues,
  onToggleFavoriteVenue,
  onSelectVenue,
  locale,
  authToken,
  variant = 'page',
  onNavigateToMap,
  onNavigateToEvents
}: {
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onOpenDetails: (id: string) => void;
  // Unlike favorite events (hydrated via /events/by-ids regardless of map
  // viewport), favorite venues are filtered from whatever venue groups are
  // already loaded for the current viewport - a favorited venue outside
  // that area won't appear here yet. Smaller gap than the one events used
  // to have (no dedicated /venues/by-ids endpoint built for this pass);
  // worth closing the same way if it turns out to matter in practice.
  favoriteVenueGroups: VenueGroup[];
  favoriteVenues: string[];
  onToggleFavoriteVenue: (id: string) => void;
  onSelectVenue: (group: VenueGroup) => void;
  locale: SupportedLocale;
  authToken?: string | undefined;
  // The profile's Favoris tab embeds this inside a page that already has its
  // own header, so the hero is only rendered for the standalone destination.
  variant?: 'page' | 'embedded';
  onNavigateToMap?: (() => void) | undefined;
  onNavigateToEvents?: (() => void) | undefined;
}) {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [kind, setKind] = useState<'event' | 'venue'>('event');
  const engagement = useEventEngagement(
    events.map((event) => event.id),
    authToken
  );

  useEffect(() => {
    if (favorites.length === 0) {
      setEvents([]);
      setState('empty');
      return;
    }
    setState('loading');
    fetch(`${API_BASE_URL}/events/by-ids?ids=${favorites.join(',')}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        const result = eventListResponseSchema.parse(json);
        setEvents(result.data);
        setState(result.data.length === 0 ? 'empty' : 'success');
      })
      .catch(() => setState('error'));
  }, [favorites]);

  const eventCount = events.length;
  const venueCount = favoriteVenueGroups.length;

  return (
    <section className="map-container-wrapper favoris-section">
      {variant === 'page' && (
        <div className="events-hero favoris-hero">
          <div className="events-hero-text">
            <p className="events-hero-kicker">Ta sélection</p>
            <h1>Tout ce que tu gardes sous la main.</h1>
            <p className="events-hero-eyebrow">
              Les événements que tu as mis en favori et les lieux dont tu suis
              la programmation.
            </p>
            <div className="events-hero-stats">
              <span className="events-hero-stat">
                <strong>{eventCount}</strong> événement
                {eventCount > 1 ? 's' : ''} en favori
              </span>
              <span className="events-hero-stat">
                <strong>{venueCount}</strong> lieu{venueCount > 1 ? 'x' : ''}{' '}
                suivi{venueCount > 1 ? 's' : ''}
              </span>
            </div>
          </div>
          {onNavigateToMap && (
            <button
              type="button"
              className="btn-secondary events-hero-map-btn"
              onClick={onNavigateToMap}
            >
              <ViewModeIcon kind="map" />
              Explorer la carte
            </button>
          )}
        </div>
      )}

      <div className="details-tabs favoris-kind-toggle">
        <button
          type="button"
          className={kind === 'event' ? 'active' : ''}
          onClick={() => setKind('event')}
        >
          Événements <span>{eventCount}</span>
        </button>
        <button
          type="button"
          className={kind === 'venue' ? 'active' : ''}
          onClick={() => setKind('venue')}
        >
          Lieux suivis <span>{venueCount}</span>
        </button>
      </div>

      {kind === 'event' && (
        <div className="favoris-block">
          {state === 'loading' && (
            <p className="list-view-empty">Chargement de tes favoris…</p>
          )}
          {state === 'error' && (
            <p className="list-view-empty">
              Impossible de charger tes favoris pour le moment.
            </p>
          )}
          {state === 'empty' && (
            <div className="empty-state-card">
              <span className="empty-state-icon" aria-hidden="true">
                <HeartIcon filled={false} />
              </span>
              <p>Aucun événement en favori</p>
              <p>
                Touche le cœur sur un événement pour le retrouver ici, même hors
                de la zone affichée sur la carte.
              </p>
              {onNavigateToEvents && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onNavigateToEvents}
                >
                  Parcourir les événements
                </button>
              )}
            </div>
          )}
          {state === 'success' && (
            <div className="events-grid favoris-grid">
              {events.map((event) => (
                <EventGridCard
                  key={event.id}
                  event={event}
                  locale={locale}
                  isFavorite={favorites.includes(event.id)}
                  onToggleFavorite={() => onToggleFavorite(event.id)}
                  onOpen={() => onOpenDetails(event.id)}
                  attendeeCount={engagement.get(event.id)?.attendeeCount ?? 0}
                  friendsAttending={
                    engagement.get(event.id)?.friendsAttending ?? []
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {kind === 'venue' && (
        <div className="favoris-block">
          {venueCount === 0 ? (
            <div className="empty-state-card">
              <span className="empty-state-icon" aria-hidden="true">
                <BellIcon />
              </span>
              <p>Aucun lieu suivi</p>
              <p>Touche la cloche sur un lieu pour suivre sa programmation.</p>
              {onNavigateToMap && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onNavigateToMap}
                >
                  Découvrir des lieux
                </button>
              )}
            </div>
          ) : (
            <VenueListView
              groups={favoriteVenueGroups}
              onSelectVenue={onSelectVenue}
              favoriteVenues={favoriteVenues}
              onToggleFavoriteVenue={onToggleFavoriteVenue}
              locale={locale}
            />
          )}
        </div>
      )}
    </section>
  );
}

// Real attendee/friend counts for a set of events (batched
// /events/engagement, Phase 4.11 backend). Extracted so the Événements page
// and Favoris read the same signal from one implementation rather than the
// second surface silently showing zeros where the first shows a real count.
function useEventEngagement(
  ids: string[],
  authToken: string | undefined
): Map<string, EventEngagementEntry> {
  const [engagement, setEngagement] = useState<
    Map<string, EventEngagementEntry>
  >(new Map());
  const idsKey = ids.join(',');

  useEffect(() => {
    if (!idsKey) {
      setEngagement(new Map());
      return;
    }
    const headers: Record<string, string> = {};
    if (authToken) headers.authorization = `Bearer ${authToken}`;
    fetch(`${API_BASE_URL}/events/engagement?ids=${idsKey}`, { headers })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        const data = eventEngagementResponseSchema.parse(json).data;
        setEngagement(new Map(data.map((entry) => [entry.eventId, entry])));
      })
      .catch(() => {});
  }, [idsKey, authToken]);

  return engagement;
}

function ListView({
  events,
  favorites,
  showFavoritesOnly,
  onToggleFavorite,
  onOpenDetails,
  locale,
  title,
  onClearTitle
}: {
  events: PublicEvent[];
  favorites: string[];
  showFavoritesOnly: boolean;
  onToggleFavorite: (id: string) => void;
  onOpenDetails: (id: string) => void;
  locale: SupportedLocale;
  title?: string | undefined;
  onClearTitle?: (() => void) | undefined;
}) {
  const visible = showFavoritesOnly
    ? events.filter((event) => favorites.includes(event.id))
    : events;

  return (
    <div className="list-view">
      {title && (
        <div className="list-view-heading">
          <h3>{title}</h3>
          {onClearTitle && (
            <button type="button" className="text-btn" onClick={onClearTitle}>
              Voir tous les événements de la zone
            </button>
          )}
        </div>
      )}
      {visible.length === 0 && (
        <p className="list-view-empty">Aucun événement à afficher.</p>
      )}
      {visible.map((event) => {
        const fields = eventPreviewFields(event, locale);
        return (
          <button
            type="button"
            className="list-view-row"
            key={event.id}
            onClick={() => onOpenDetails(event.id)}
          >
            <span
              className="list-view-dot"
              style={{
                background:
                  CATEGORY_COLORS[event.category] ?? CATEGORY_COLORS['other']
              }}
            />
            <span className="list-view-main">
              <strong>{fields.title}</strong>
              <span className="list-view-sub">
                {fields.venue} · {fields.dateTime}
              </span>
            </span>
            <span className="list-view-price">{fields.price}</span>
            <span
              role="button"
              tabIndex={0}
              className="list-view-fav"
              aria-pressed={favorites.includes(event.id)}
              onClick={(clickEvent) => {
                clickEvent.stopPropagation();
                onToggleFavorite(event.id);
              }}
              onKeyDown={(keyEvent) => {
                if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                  keyEvent.preventDefault();
                  keyEvent.stopPropagation();
                  onToggleFavorite(event.id);
                }
              }}
            >
              {favorites.includes(event.id) ? '❤️' : '🤍'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface VenueGroup {
  id: string;
  name: string;
  address: string;
  point: { longitude: number; latitude: number };
  events: PublicEvent[];
  categories: EventCategory[];
  venueCategory?: VenueCategory;
  venueSecondaryCategories?: VenueCategory[];
  priceTier?: VenuePriceTier;
  imageUrl?: string;
}

function getVenueSummary(group: VenueGroup, locale: SupportedLocale): string {
  if (group.events.length === 0) {
    return locale === 'fr'
      ? `${group.name} fait partie des lieux montréalais suivis par Pulso. Ce repère reste visible sur la carte même lorsqu'aucune programmation officielle n'est actuellement recensée.`
      : `${group.name} is one of the Montréal venues tracked by Pulso. It remains visible on the map even when no official programming is currently listed.`;
  }
  return locale === 'fr'
    ? `${group.name} fait partie des lieux montréalais suivis par Pulso. ${group.events.length} événement${group.events.length > 1 ? 's sont recensés' : ' est recensé'} ici au cours des 14 prochains jours.`
    : `${group.name} is one of the Montréal venues tracked by Pulso. ${group.events.length} event${group.events.length > 1 ? 's are' : ' is'} listed here over the next 14 days.`;
}

// "Unknown address" is the ingestion mapper's sentinel for an event with no
// address at all (to-public-event.ts), not a real string to show a French
// user. DEC-0014 wants missing practical information disclosed rather than
// inferred, so it surfaces as an explicit "not recorded" line.
const UNKNOWN_ADDRESS_SENTINEL = 'Unknown address';

function formatVenueAddress(address: string, locale: SupportedLocale): string {
  if (address !== UNKNOWN_ADDRESS_SENTINEL) return address;
  return locale === 'fr' ? 'Adresse non renseignée' : 'Address not recorded';
}

// A bare street segment ("Rue Dorion", "Avenue du Parc-La Fontaine") isn't a
// real, referenceable place any more than the full-address fallback below
// is - same reverse-geocode-found-no-POI signature, just shorter text. A
// short allowlist keeps real proper nouns that happen to start with a
// French street-type word (an actual arena/plaza) from being hidden.
const KNOWN_PROPER_NOUN_VENUE_NAMES = new Set(['Place Bell', 'Place des Arts']);
// Optional leading house number ("5290 Chemin de la Côte-des-Neiges") before
// the street-type word - a numbered civic address is exactly as bare as one
// without a number.
const BARE_STREET_NAME_PATTERN =
  /^(\d+[a-z]?\s+)?(rue|avenue|boulevard|chemin|montee|côte|cote|impasse|carré|carre|place)\s/i;

function looksLikeBareStreetName(name: string): boolean {
  return (
    !KNOWN_PROPER_NOUN_VENUE_NAMES.has(name) &&
    !name.includes(',') &&
    BARE_STREET_NAME_PATTERN.test(name)
  );
}

// Groups the currently-loaded events (same source-filtered set the List view
// uses) by venue.id rather than fetching a separate venues endpoint - venue
// grouping is a client-side view over data already on screen, not new data.
// Rows excluded as not being a real, referenceable place to browse (never
// deleted, just not shown here - the underlying events stay visible in
// Événement): "Unknown venue" is the mapper's placeholder (to-public-event.ts)
// for events with no name/address at all; name === address and a bare
// street segment are both the signature of a reverse-geocode fallback that
// had no real venue name to find (a park, a street corner) - see
// geocode-fallback.ts's shortLabel.
function groupEventsByVenue(events: PublicEvent[]): VenueGroup[] {
  const byId = new Map<string, VenueGroup>();
  for (const event of events) {
    if (
      event.venue.name === 'Unknown venue' ||
      event.venue.name === event.venue.address ||
      looksLikeBareStreetName(event.venue.name)
    ) {
      continue;
    }
    let group = byId.get(event.venue.id);
    if (!group) {
      group = {
        id: event.venue.id,
        name: event.venue.name,
        address: event.venue.address,
        point: event.venue.point,
        events: [],
        categories: [],
        ...(event.venue.category !== undefined
          ? { venueCategory: event.venue.category }
          : {}),
        ...(event.venue.secondaryCategories !== undefined
          ? { venueSecondaryCategories: event.venue.secondaryCategories }
          : {})
      };
      byId.set(event.venue.id, group);
    }
    group.events.push(event);
    if (!group.categories.includes(event.category)) {
      group.categories.push(event.category);
    }
    if (!group.imageUrl && event.imageUrl) {
      group.imageUrl = event.imageUrl;
    }
  }
  for (const group of byId.values()) {
    const priceTier = deriveVenuePriceTier(group.events);
    if (priceTier !== undefined) group.priceTier = priceTier;
  }
  return [...byId.values()].sort(
    (a, b) => b.events.length - a.events.length || a.name.localeCompare(b.name)
  );
}

function VenueListView({
  groups,
  onSelectVenue,
  favoriteVenues,
  onToggleFavoriteVenue,
  locale
}: {
  groups: VenueGroup[];
  onSelectVenue: (group: VenueGroup) => void;
  favoriteVenues: string[];
  onToggleFavoriteVenue: (id: string) => void;
  locale: SupportedLocale;
}) {
  return (
    <div className="venue-view">
      {groups.length === 0 && (
        <p className="list-view-empty">
          Aucun lieu à afficher dans cette zone.
        </p>
      )}

      <div className="venue-grid">
        {groups.map((group) => (
          // A plain div, not a button: it now contains its own nested
          // favorite button, and interactive content can't nest inside a
          // <button> (invalid HTML, unpredictable click handling) - matches
          // the same div+onClick pattern already used for event cards below,
          // which have the same "card + inner favorite button" shape.
          <div
            key={group.id}
            className="venue-card"
            onClick={() => onSelectVenue(group)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectVenue(group);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={`Ouvrir la fiche de ${group.name}`}
            style={{ cursor: 'pointer' }}
          >
            <div className="venue-card-thumb">
              <VenueThumbImage
                imageUrl={group.imageUrl}
                category={group.categories[0] ?? 'other'}
              />
              <button
                type="button"
                className={`card-fav ${favoriteVenues.includes(group.id) ? 'card-fav-following' : ''}`}
                aria-pressed={favoriteVenues.includes(group.id)}
                aria-label={
                  favoriteVenues.includes(group.id)
                    ? 'Ne plus suivre ce lieu'
                    : 'Suivre ce lieu'
                }
                title={
                  favoriteVenues.includes(group.id) ? 'Suivi' : 'Suivre ce lieu'
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavoriteVenue(group.id);
                }}
              >
                <BellIcon />
              </button>
            </div>
            <div className="venue-card-body">
              <div className="venue-card-title-row">
                <strong className="venue-card-name">{group.name}</strong>
                {group.priceTier && (
                  <span className="venue-card-price">{group.priceTier}</span>
                )}
              </div>
              <span className="venue-card-address">
                {formatVenueAddress(group.address, locale)}
              </span>
              <div className="venue-card-categories">
                {group.venueCategory && (
                  <span
                    className="venue-card-type-badge"
                    style={{
                      background: `${VENUE_CATEGORY_COLORS[group.venueCategory]}18`,
                      borderColor: `${VENUE_CATEGORY_COLORS[group.venueCategory]}55`
                    }}
                  >
                    <span
                      className="venue-card-type-dot"
                      style={{
                        background: VENUE_CATEGORY_COLORS[group.venueCategory]
                      }}
                      aria-hidden="true"
                    />
                    {VENUE_CATEGORY_LABELS[locale][group.venueCategory]}
                  </span>
                )}
                {group.venueSecondaryCategories?.map((category) => (
                  <span
                    key={category}
                    className="venue-card-type-badge venue-card-type-badge-secondary"
                    style={{
                      background: `${VENUE_CATEGORY_COLORS[category]}10`,
                      borderColor: `${VENUE_CATEGORY_COLORS[category]}40`
                    }}
                  >
                    <span
                      className="venue-card-type-dot"
                      style={{ background: VENUE_CATEGORY_COLORS[category] }}
                      aria-hidden="true"
                    />
                    {VENUE_CATEGORY_LABELS[locale][category]}
                  </span>
                ))}
                {group.categories.slice(0, 3).map((category) => (
                  <span
                    key={category}
                    className="venue-card-category-dot"
                    style={{
                      background:
                        CATEGORY_COLORS[category] ?? CATEGORY_COLORS['other']
                    }}
                    title={SHORT_CATEGORY_LABELS[locale][category]}
                  />
                ))}
                {group.categories.length > 3 && (
                  <span className="venue-card-more">
                    +{group.categories.length - 3}
                  </span>
                )}
              </div>
              <span className="venue-card-count">
                {group.events.length > 0
                  ? `${group.events.length} événement${group.events.length > 1 ? 's' : ''} à venir`
                  : 'Aucun événement prévu pour le moment'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Full-page, card-grid "Lieux" home for the connected sidebar (Phase 4.12)
// - same split-view treatment as Événements (Phase 4.11) and Groupes
// (Phase 4.10 follow-up): a real list on the left, a real inline detail
// panel on the right, no modal, no map (the separate "Carte" item already
// covers map browsing). Reuses groupEventsByVenue/VenueGroup/VenueListView
// as-is rather than a second grouping/card implementation.
//
// Deliberately absent, per this session's real-data-only rule (confirmed
// with the user): star ratings/review counts (no review system exists
// anywhere - the profile's Avis tab is still an explicit "Coming Soon"),
// opening hours ("Ouvert maintenant"), "Ambiance" tag words, neighborhood
// names, phone/website, and a venue-scoped "Rejoindre le groupe" button
// (groups have no venue_id). The one popularity signal shown - favorite
// count - is real (GET /venues/favorite-counts, Phase 4.12 backend), shown
// only when > 0.
function LieuxPage({
  favoriteVenues,
  onToggleFavoriteVenue,
  onOpenEventForum,
  onNavigateToMap,
  authToken,
  locale,
  selectedVenueId,
  onSelectVenueId
}: {
  favoriteVenues: string[];
  onToggleFavoriteVenue: (id: string) => void;
  onOpenEventForum: (eventId: string) => void;
  onNavigateToMap: () => void;
  authToken: string | undefined;
  locale: SupportedLocale;
  selectedVenueId: string | undefined;
  onSelectVenueId: (id: string | undefined) => void;
}) {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [activeCategory, setActiveCategory] = useState<VenueCategory | 'all'>(
    'all'
  );
  const [query, setQuery] = useState('');
  const [favoriteCounts, setFavoriteCounts] = useState<Map<string, number>>(
    new Map()
  );

  useEffect(() => {
    let cancelled = false;
    const venueWindow = getVenueDiscoveryDateRange(new Date());
    fetch(
      `${API_BASE_URL}/events?${buildMapEventsQuery(INITIAL_BOUNDS, {
        date: 'custom',
        categories: [],
        price: 'all',
        customStartDate: venueWindow.start,
        customEndDate: venueWindow.end
      })}`
    )
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        if (cancelled) return;
        setEvents(eventListResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const allGroups = groupEventsByVenue(events);
  const availableCategories = Array.from(
    new Set(
      allGroups
        .map((group) => group.venueCategory)
        .filter((category): category is VenueCategory => category !== undefined)
    )
  );

  const unsortedGroups = allGroups
    .filter(
      (group) =>
        activeCategory === 'all' || group.venueCategory === activeCategory
    )
    .filter(
      (group) =>
        !query.trim() ||
        `${group.name} ${group.address}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
    );

  const idsKey = unsortedGroups
    .map((group) => group.id)
    .slice(0, 100)
    .join(',');

  useEffect(() => {
    if (!idsKey) {
      setFavoriteCounts(new Map());
      return;
    }
    fetch(`${API_BASE_URL}/venues/favorite-counts?ids=${idsKey}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        const data = venueFavoriteCountsResponseSchema.parse(json).data;
        setFavoriteCounts(
          new Map(data.map((entry) => [entry.venueId, entry.favoriteCount]))
        );
      })
      .catch(() => {});
  }, [idsKey]);

  // Internal-only ranking signal (Phase 4.17) - never displayed, only used
  // to break ties between venues that already have the same real event
  // count (groupEventsByVenue's own primary sort), so a well-rated venue
  // can genuinely outrank a middling one without overriding "what's
  // actually happening near you" as the dominant signal.
  const [venueRatings, setVenueRatings] = useState<
    Map<string, { average: number; count: number }>
  >(new Map());

  useEffect(() => {
    if (!idsKey) {
      setVenueRatings(new Map());
      return;
    }
    fetch(`${API_BASE_URL}/venues/ratings?ids=${idsKey}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        const data = venueRatingSummariesResponseSchema.parse(json).data;
        setVenueRatings(
          new Map(
            data.map((entry) => [
              entry.venueId,
              { average: entry.average, count: entry.count }
            ])
          )
        );
      })
      .catch(() => {});
  }, [idsKey]);

  const filteredGroups = [...unsortedGroups].sort((a, b) => {
    if (a.events.length !== b.events.length) return 0;
    const ratingA = venueRatings.get(a.id)?.average ?? 0;
    const ratingB = venueRatings.get(b.id)?.average ?? 0;
    return ratingB - ratingA;
  });

  const selectedGroup = allGroups.find((group) => group.id === selectedVenueId);

  return (
    <div className="events-page">
      <div className="events-page-main">
        <div className="events-hero">
          <div className="events-hero-text">
            <p className="events-hero-eyebrow">Les lieux à Montréal ✨</p>
            <div className="events-hero-stats">
              <span className="events-hero-stat">
                <strong>{allGroups.length}</strong> lieux avec des événements
                dans les 14 prochains jours
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn-secondary events-hero-map-btn"
            onClick={onNavigateToMap}
          >
            🗺️ Voir la carte
          </button>
        </div>

        <div className="messages-search events-search">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un lieu, une adresse…"
          />
        </div>

        <div className="events-category-chips">
          <button
            type="button"
            className={activeCategory === 'all' ? 'active' : ''}
            onClick={() => setActiveCategory('all')}
          >
            Tous
          </button>
          {availableCategories.map((category) => (
            <button
              type="button"
              key={category}
              className={activeCategory === category ? 'active' : ''}
              onClick={() => setActiveCategory(category)}
            >
              {VENUE_CATEGORY_LABELS[locale][category]}
            </button>
          ))}
        </div>

        {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
        {state === 'error' && (
          <p className="list-view-empty">
            Impossible de charger les lieux pour le moment.
          </p>
        )}

        <VenueListView
          groups={filteredGroups}
          onSelectVenue={(group) => onSelectVenueId(group.id)}
          favoriteVenues={favoriteVenues}
          onToggleFavoriteVenue={onToggleFavoriteVenue}
          locale={locale}
        />
      </div>

      <aside className="venue-detail-pane">
        {selectedGroup ? (
          <VenueDetailContent
            group={selectedGroup}
            favoriteVenues={favoriteVenues}
            onToggleFavoriteVenue={onToggleFavoriteVenue}
            favoriteCount={favoriteCounts.get(selectedGroup.id) ?? 0}
            onOpenEventForum={onOpenEventForum}
            authToken={authToken}
            locale={locale}
          />
        ) : (
          <div className="messages-empty-pane">
            <span className="empty-state-icon" aria-hidden="true">
              📍
            </span>
            <p>Sélectionne un lieu pour l'ouvrir ici.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

// Internal-only venue quality signal (Phase 4.17) - any signed-in account
// can rate a venue 1-5 stars with an optional comment, one rating per
// account per venue (re-rating replaces it). Never shown as a public
// "reviews" feature - see the DEC pending note in packages/contracts -
// the average is only used server-side to break ranking ties.
function VenueRatingWidget({
  venueId,
  authToken
}: {
  venueId: string;
  authToken: string | undefined;
}) {
  const [myRating, setMyRating] = useState<MyVenueRating | null>();
  const [hoverStar, setHoverStar] = useState<number>();
  const [comment, setComment] = useState('');
  const [editingComment, setEditingComment] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/venues/${venueId}/rating`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        const data = myVenueRatingResponseSchema.parse(json).data;
        setMyRating(data);
        setComment(data?.comment ?? '');
      })
      .catch(() => {});
  }, [venueId, authToken]);

  const submitRating = (rating: number, nextComment = comment) => {
    if (!authToken || saving) return;
    setSaving(true);
    const trimmed = nextComment.trim();
    fetch(`${API_BASE_URL}/venues/${venueId}/rating`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        rating,
        ...(trimmed ? { comment: trimmed } : {})
      })
    })
      .then((response) => (response.ok ? undefined : Promise.reject()))
      .then(() => {
        setMyRating({ rating, ...(trimmed ? { comment: trimmed } : {}) });
        setEditingComment(false);
      })
      .catch(() => {})
      .finally(() => setSaving(false));
  };

  const clearRating = () => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/venues/${venueId}/rating`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? undefined : Promise.reject()))
      .then(() => {
        setMyRating(null);
        setComment('');
        setEditingComment(false);
      })
      .catch(() => {});
  };

  if (myRating === undefined) return null;

  const displayRating = hoverStar ?? myRating?.rating ?? 0;

  return (
    <div className="venue-rating-widget">
      <h3>Noter ce lieu</h3>
      <p className="venue-rating-hint">
        Usage interne pour l'instant - aide à faire remonter les meilleurs
        lieux.
      </p>
      <div
        className="venue-rating-stars"
        role="radiogroup"
        aria-label="Note de 1 à 5 étoiles"
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            type="button"
            key={star}
            className={star <= displayRating ? 'filled' : ''}
            role="radio"
            aria-checked={myRating?.rating === star}
            aria-label={`${star} étoile${star > 1 ? 's' : ''}`}
            disabled={saving}
            onMouseEnter={() => setHoverStar(star)}
            onMouseLeave={() => setHoverStar(undefined)}
            onClick={() => submitRating(star)}
          >
            ★
          </button>
        ))}
      </div>
      {myRating &&
        (editingComment ? (
          <div className="venue-rating-comment-form">
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Commentaire (optionnel)"
              maxLength={500}
            />
            <div className="venue-rating-comment-actions">
              <button
                type="button"
                className="text-btn"
                onClick={() => submitRating(myRating.rating, comment)}
              >
                Enregistrer
              </button>
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  setComment(myRating.comment ?? '');
                  setEditingComment(false);
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <div className="venue-rating-summary">
            {myRating.comment && (
              <p className="venue-rating-comment">« {myRating.comment} »</p>
            )}
            <div className="venue-rating-summary-actions">
              <button
                type="button"
                className="text-btn"
                onClick={() => setEditingComment(true)}
              >
                {myRating.comment
                  ? 'Modifier le commentaire'
                  : 'Ajouter un commentaire'}
              </button>
              <button type="button" className="text-btn" onClick={clearRating}>
                Supprimer ma note
              </button>
            </div>
          </div>
        ))}
    </div>
  );
}

function VenueDetailContent({
  group,
  favoriteVenues,
  onToggleFavoriteVenue,
  favoriteCount,
  onOpenEventForum,
  authToken,
  locale,
  onClose
}: {
  group: VenueGroup;
  favoriteVenues: string[];
  onToggleFavoriteVenue: (id: string) => void;
  favoriteCount: number;
  onOpenEventForum: (eventId: string) => void;
  authToken: string | undefined;
  locale: SupportedLocale;
  onClose?: () => void;
}) {
  const isFavorite = favoriteVenues.includes(group.id);
  const eventBuckets = partitionVenueEvents(group.events, new Date());
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${group.point.latitude},${group.point.longitude}`;

  return (
    <div className="venue-detail">
      <div className="venue-detail-hero">
        <VenueThumbImage
          imageUrl={group.imageUrl}
          category={group.categories[0] ?? 'other'}
        />
        {onClose && (
          <button
            type="button"
            className="venue-detail-back"
            onClick={onClose}
            aria-label="Fermer la fiche du lieu"
          >
            ← Retour
          </button>
        )}
        <button
          type="button"
          className={`card-fav venue-detail-fav ${isFavorite ? 'card-fav-following' : ''}`}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? 'Ne plus suivre ce lieu' : 'Suivre ce lieu'}
          title={isFavorite ? 'Suivi' : 'Suivre ce lieu'}
          onClick={() => onToggleFavoriteVenue(group.id)}
        >
          <BellIcon />
        </button>
        <div className="venue-detail-hero-overlay">
          {group.venueCategory && (
            <span
              className="venue-card-type-badge"
              style={
                {
                  '--venue-detail-color':
                    VENUE_CATEGORY_COLORS[group.venueCategory]
                } as CSSProperties
              }
            >
              <span className="venue-card-type-dot" aria-hidden="true" />
              {VENUE_CATEGORY_LABELS[locale][group.venueCategory]}
            </span>
          )}
          <h2>{group.name}</h2>
          <p>
            <span aria-hidden="true">⌖</span>
            {formatVenueAddress(group.address, locale)}
          </p>
        </div>
      </div>

      <div className="venue-detail-header">
        <span className="venue-detail-section-kicker">À propos</span>
        <p className="venue-detail-summary">{getVenueSummary(group, locale)}</p>
        <div className="venue-detail-metrics">
          <span>
            <strong>{eventBuckets.today.length}</strong>
            aujourd'hui
          </span>
          <span>
            <strong>{eventBuckets.later.length}</strong>à venir
          </span>
          {group.priceTier && (
            <span>
              <strong>{group.priceTier}</strong>prix estimé
            </span>
          )}
        </div>
        {favoriteCount > 0 && (
          <p className="venue-detail-popularity">
            🔥 {favoriteCount} personne{favoriteCount > 1 ? 's' : ''}{' '}
            {favoriteCount > 1 ? 'ont' : 'a'} ce lieu en favori
          </p>
        )}
      </div>

      {/* One scroll rather than Infos/Événements tabs: the "Événements" tab
          was a flat re-listing of the exact same rows the two programming
          blocks below already show, so the tabs hid half the sheet and
          duplicated the other half. This order is the one DEC-0014
          prescribes - identity, description, address, today, then the rest
          of the fourteen-day window. */}
      <div className="venue-detail-infos">
        <a
          className="venue-detail-info-row"
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
        >
          <span className="venue-detail-info-icon" aria-hidden="true">
            ⌖
          </span>
          <span>
            <small>Adresse</small>
            {formatVenueAddress(group.address, locale)}
          </span>
          <span className="venue-detail-info-link" aria-hidden="true">
            ↗
          </span>
        </a>
        {group.priceTier && (
          <div className="venue-detail-info-row">
            <span className="venue-detail-info-icon" aria-hidden="true">
              $
            </span>
            <span>
              <small>Prix indicatif</small>
              Gamme estimée : {group.priceTier}
              <span className="venue-detail-info-hint">
                {' '}
                (basée sur les événements payants à venir)
              </span>
            </span>
          </div>
        )}

        <div className="venue-detail-programming-block venue-detail-programming-today">
          <div className="venue-detail-programming-heading">
            <div>
              <span className="venue-detail-programming-kicker">
                Aujourd'hui
              </span>
              <h3>Ce soir dans ce lieu</h3>
            </div>
            <span className="venue-detail-programming-count">
              {eventBuckets.today.length}
            </span>
          </div>
          {eventBuckets.today.length === 0 ? (
            <p className="venue-detail-programming-empty">
              Aucun événement officiel recensé aujourd'hui.
            </p>
          ) : (
            eventBuckets.today.map((event) => (
              <VenueDetailEventRow
                key={event.id}
                event={event}
                locale={locale}
                onSelect={() => onOpenEventForum(event.id)}
              />
            ))
          )}
        </div>

        <div className="venue-detail-programming-block">
          <div className="venue-detail-programming-heading">
            <div>
              <span className="venue-detail-programming-kicker">À venir</span>
              <h3>Dans les 14 prochains jours</h3>
            </div>
            <span className="venue-detail-programming-count">
              {eventBuckets.later.length}
            </span>
          </div>
          {eventBuckets.later.length === 0 ? (
            <p className="venue-detail-programming-empty">
              Aucune autre programmation officielle recensée pour le moment.
            </p>
          ) : (
            eventBuckets.later.map((event) => (
              <VenueDetailEventRow
                key={event.id}
                event={event}
                locale={locale}
                onSelect={() => onOpenEventForum(event.id)}
              />
            ))
          )}
        </div>

        <VenueRatingWidget venueId={group.id} authToken={authToken} />
      </div>
    </div>
  );
}

function VenueDetailEventRow({
  event,
  locale,
  onSelect
}: {
  event: PublicEvent;
  locale: SupportedLocale;
  onSelect: () => void;
}) {
  const dateBadge = formatEventDateBadge(event.startsAt);
  return (
    <button type="button" className="venue-detail-event-row" onClick={onSelect}>
      <span className="venue-detail-event-date">
        <strong>{dateBadge.day}</strong>
        {dateBadge.month}
      </span>
      <span className="venue-detail-event-info">
        <span
          className="venue-detail-event-category"
          style={
            {
              '--venue-event-color':
                CATEGORY_COLORS[event.category] ?? CATEGORY_COLORS.other
            } as CSSProperties
          }
        >
          <i aria-hidden="true" />
          {SHORT_CATEGORY_LABELS[locale][event.category]}
        </span>
        <strong>{event.title}</strong>
        <span>{formatEventTimeRange(event.startsAt, event.endsAt)}</span>
      </span>
      <span className="venue-detail-event-arrow" aria-hidden="true">
        →
      </span>
    </button>
  );
}

const CALENDAR_WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// Recurring festive days worth calling out on the calendar, keyed by
// "MM-DD" so they repeat every year regardless of the displayed month.
// Chosen for where Pulso actually operates (Québec/Canada) rather than
// France, even though Bastille Day is the more famous illustration of "a
// country's festive day" - Fête nationale du Québec and Fête du Canada are
// the local equivalents, both real excuses for concerts/fireworks/nightlife.
const FESTIVE_DAYS: Record<string, string> = {
  '01-01': "Jour de l'An",
  '06-21': 'Fête de la Musique',
  '06-24': 'Fête nationale du Québec',
  '07-01': 'Fête du Canada',
  '12-31': "Réveillon du Jour de l'An"
};

function CalendarView({
  month,
  onChangeMonth,
  events,
  state,
  favorites,
  showFavoritesOnly,
  categories,
  onChangeCategories,
  price,
  onChangePrice,
  selectedDay,
  onSelectDay,
  locale
}: {
  month: Date;
  onChangeMonth: (month: Date) => void;
  events: PublicEvent[];
  state: LoadState;
  favorites: string[];
  showFavoritesOnly: boolean;
  categories: EventCategory[];
  onChangeCategories: (categories: EventCategory[]) => void;
  price: DiscoveryFilters['price'];
  onChangePrice: (price: DiscoveryFilters['price']) => void;
  selectedDay: string | undefined;
  onSelectDay: (day: string | undefined, events: PublicEvent[]) => void;
  locale: SupportedLocale;
}) {
  const visibleEvents = showFavoritesOnly
    ? events.filter((event) => favorites.includes(event.id))
    : events;

  const eventsByDay = new Map<string, PublicEvent[]>();
  for (const event of visibleEvents) {
    const dayKey = event.startsAt.slice(0, 10);
    const list = eventsByDay.get(dayKey) ?? [];
    list.push(event);
    eventsByDay.set(dayKey, list);
  }

  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0
  ).getDate();
  // Monday-first grid: JS getDay() is 0=Sunday, shift so Monday=0.
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
  const cells: Array<{ day: number; key: string } | undefined> = [
    ...Array(leadingBlanks).fill(undefined),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { day, key };
    })
  ];

  const monthLabel = month.toLocaleDateString(
    locale === 'fr' ? 'fr-CA' : 'en-CA',
    {
      month: 'long',
      year: 'numeric'
    }
  );

  return (
    <div className="calendar-view">
      <div className="calendar-header">
        <button
          type="button"
          onClick={() =>
            onChangeMonth(
              new Date(month.getFullYear(), month.getMonth() - 1, 1)
            )
          }
          aria-label="Mois précédent"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h3>{monthLabel}</h3>
        <button
          type="button"
          onClick={() =>
            onChangeMonth(
              new Date(month.getFullYear(), month.getMonth() + 1, 1)
            )
          }
          aria-label="Mois suivant"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      <p className="calendar-scope-note">
        Tous les événements référencés, indépendamment des filtres de la carte.
      </p>

      <div className="calendar-filter-bar">
        <div className="pill-list">
          {CATEGORY_FILTER_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.value}
              className={`filter-pill ${categories.includes(option.value) ? 'active' : ''}`}
              onClick={() =>
                onChangeCategories(
                  categories.includes(option.value)
                    ? categories.filter((value) => value !== option.value)
                    : [...categories, option.value]
                )
              }
            >
              {SHORT_CATEGORY_LABELS[locale][option.value]}
            </button>
          ))}
        </div>
        <div className="pill-list">
          {PRICE_FILTER_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.value}
              className={`filter-pill ${price === option.value ? 'active' : ''}`}
              onClick={() => onChangePrice(option.value)}
            >
              {getPriceLabel(locale, option.value)}
            </button>
          ))}
        </div>
      </div>

      <div className="calendar-weekdays">
        {CALENDAR_WEEKDAYS.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>

      <div className="calendar-grid">
        {cells.map((cell, index) => {
          if (!cell)
            return (
              <div className="calendar-cell empty" key={`blank-${index}`} />
            );
          const dayCount = eventsByDay.get(cell.key)?.length ?? 0;
          const festiveLabel = FESTIVE_DAYS[cell.key.slice(5)];
          return (
            <button
              type="button"
              key={cell.key}
              className={`calendar-cell ${selectedDay === cell.key ? 'selected' : ''} ${dayCount > 0 ? 'has-events' : ''} ${festiveLabel ? 'is-festive' : ''}`}
              title={festiveLabel}
              onClick={() =>
                onSelectDay(
                  selectedDay === cell.key ? undefined : cell.key,
                  eventsByDay.get(cell.key) ?? []
                )
              }
            >
              <span className="calendar-day-number">{cell.day}</span>
              {festiveLabel && (
                <span className="calendar-festive-dot" aria-hidden="true" />
              )}
              {dayCount > 0 && (
                <span className="calendar-day-count">{dayCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {state === 'loading' && <p className="calendar-status">Chargement…</p>}
      {state === 'error' && (
        <p className="calendar-status">Erreur de chargement.</p>
      )}
    </div>
  );
}

function CollapsibleFilterGroup({
  title,
  collapsed,
  onToggle,
  children
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="filter-group">
      <div className="filter-group-header">
        <button
          type="button"
          className="filter-group-toggle"
          onClick={onToggle}
          aria-expanded={!collapsed}
        >
          <svg
            className={`filter-group-chevron ${collapsed ? 'collapsed' : ''}`}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          <span>{title}</span>
        </button>
      </div>
      <div className={`filter-group-body ${collapsed ? 'collapsed' : ''}`}>
        <div className="filter-group-body-inner">{children}</div>
      </div>
    </div>
  );
}

const LOCALE_META: Record<SupportedLocale, { title: string }> = {
  fr: { title: 'Français' },
  en: { title: 'English' }
};

// SVG flags rather than emoji: flag emoji render as raw two-letter text on
// this environment's Chromium/Windows font stack (no color-emoji flag
// support), which looked broken rather than "mignon" as requested.
function LocaleFlagIcon({ locale }: { locale: SupportedLocale }) {
  if (locale === 'fr') {
    return (
      <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true">
        <rect width="20" height="14" fill="#ED2939" />
        <rect width="13.33" height="14" fill="#fff" />
        <rect width="6.67" height="14" fill="#002395" />
      </svg>
    );
  }
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true">
      <rect width="20" height="14" fill="#00247D" />
      <path d="M0 0L20 14M20 0L0 14" stroke="#fff" strokeWidth="3" />
      <path d="M0 0L20 14M20 0L0 14" stroke="#CF142B" strokeWidth="1.5" />
      <path d="M10 0V14M0 7H20" stroke="#fff" strokeWidth="4.5" />
      <path d="M10 0V14M0 7H20" stroke="#CF142B" strokeWidth="2.5" />
    </svg>
  );
}

function LanguageSelector({
  locale,
  onChange
}: {
  locale: SupportedLocale;
  onChange: (locale: SupportedLocale) => void;
}) {
  const [open, setOpen] = useState(false);
  const other: SupportedLocale = locale === 'fr' ? 'en' : 'fr';
  return (
    <div className="lang-selector">
      <button
        type="button"
        className="lang-selector-current"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={translate(locale, 'language.label')}
      >
        <span className="lang-flag">
          <LocaleFlagIcon locale={locale} />
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="lang-selector-menu">
          <button
            type="button"
            onClick={() => {
              onChange(other);
              setOpen(false);
            }}
            title={LOCALE_META[other].title}
          >
            <span className="lang-flag">
              <LocaleFlagIcon locale={other} />
            </span>
            {LOCALE_META[other].title}
          </button>
        </div>
      )}
    </div>
  );
}

// Other major Canadian metro areas where Pulso could plausibly expand
// (PROJECT_INDEX Roadmap: "autres villes") - shown disabled with a "Bientôt"
// badge rather than a working switch, since Pulso only has real data for
// Montréal (MVP-0001 scopes the MVP to a single city).
const OTHER_CANADIAN_CITIES = [
  'Toronto',
  'Vancouver',
  'Calgary',
  'Edmonton',
  'Ottawa'
];

function CitySelector() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div className="city-selector" ref={wrapperRef}>
      <button
        type="button"
        className="city-selector-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        Montréal
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="city-selector-dropdown">
          <button
            type="button"
            className="city-option active"
            onClick={() => setOpen(false)}
          >
            Montréal
          </button>
          {OTHER_CANADIAN_CITIES.map((city) => (
            <button type="button" key={city} className="city-option" disabled>
              {city}
              <span className="city-soon">Bientôt</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Le compte reste facultatif (DEC-0007/MVP-0001) : "Se connecter" est la
// seule chose qui change tant qu'on n'est pas connecté. Une fois connecté,
// l'avatar ouvre directement l'onglet "Mon compte" (CompteSection) plutôt
// qu'un menu déroulant - un espace compte réel plutôt qu'un résumé en coin.
function AccountMenu({
  user,
  onLogin,
  onOpenAccount,
  unreadCount
}: {
  user: User | undefined;
  onLogin: () => void;
  onOpenAccount: () => void;
  unreadCount: number;
}) {
  if (!user) {
    return (
      <button type="button" className="account-login-btn" onClick={onLogin}>
        Se connecter
      </button>
    );
  }

  return (
    <button
      type="button"
      className="account-menu-trigger"
      onClick={onOpenAccount}
      aria-label={
        unreadCount > 0
          ? `Mon compte (${user.displayName}) — ${unreadCount} message${unreadCount !== 1 ? 's' : ''} non lu${unreadCount !== 1 ? 's' : ''}`
          : `Mon compte (${user.displayName})`
      }
    >
      <span className="account-avatar">
        {renderUserAvatarContent(user)}
        <span className="account-online-dot" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="account-unread-badge" aria-hidden="true">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </span>
    </button>
  );
}

type ConnectedSection =
  | 'decouvrir'
  | 'evenement'
  | 'lieu'
  | 'explorer'
  | 'favoris'
  | 'forums'
  | 'groupes'
  | 'messages'
  | 'amis'
  | 'organisateur'
  | 'administration';

const SIDEBAR_NAV_ITEMS: Array<{
  section: ConnectedSection;
  label: string;
  icon: SidebarIconKind;
}> = [
  { section: 'decouvrir', label: 'Découvrir', icon: 'decouvrir' },
  { section: 'explorer', label: 'Carte', icon: 'carte' },
  { section: 'evenement', label: 'Événements', icon: 'evenements' },
  { section: 'lieu', label: 'Lieux', icon: 'lieux' },
  { section: 'forums', label: 'Forums', icon: 'forums' },
  { section: 'groupes', label: 'Groupes', icon: 'groupes' },
  { section: 'messages', label: 'Messages', icon: 'messages' },
  { section: 'amis', label: 'Amis', icon: 'amis' },
  { section: 'favoris', label: 'Favoris', icon: 'favoris' },
  { section: 'organisateur', label: 'Organisateur', icon: 'organisateur' }
];

// DEC-0018: appended only for an administrator. A non-admin never sees the
// destination, and every /admin route answers 403 regardless.
const ADMIN_NAV_ITEM: {
  section: ConnectedSection;
  label: string;
  icon: SidebarIconKind;
} = {
  section: 'administration',
  label: 'Administration',
  icon: 'administration'
};

// Primary navigation rail for the connected experience (Phase 4). Only
// rendered when signed in - the anonymous map/explore experience keeps its
// own unchanged top-navbar rather than sharing this component, per the
// explicit "deux espaces totalement distincts" split.
function Sidebar({
  activeSection,
  onNavigate,
  authToken,
  user,
  unreadMessagesCount,
  isAdmin,
  onOpenAccount,
  onOpenEvent
}: {
  activeSection: ConnectedSection;
  onNavigate: (section: ConnectedSection) => void;
  authToken: string | undefined;
  user: User;
  unreadMessagesCount: number;
  isAdmin: boolean;
  onOpenEvent: (eventId: string) => void;
  onOpenAccount: () => void;
}) {
  const [friendCode, setFriendCode] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [openGroup, setOpenGroup] = useState<Group>();

  useEffect(() => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/me/friend-code`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) =>
        setFriendCode(friendCodeResponseSchema.parse(json).data.friendCode)
      )
      .catch(() => {});
  }, [authToken]);

  const refreshGroups = useCallback(() => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/me/groups`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => setMyGroups(groupsResponseSchema.parse(json).data))
      .catch(() => {});
  }, [authToken]);

  useEffect(() => {
    refreshGroups();
  }, [refreshGroups]);

  const pinnedGroups = myGroups.filter((group) => group.pinned);

  // DEC-0017 v1.2: the organizer's own pinned events sit in Raccourcis
  // beside pinned groups - the two things a user actually returns to.
  const [pinnedEvents, setPinnedEvents] = useState<PublicEvent[]>([]);
  useEffect(() => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/me/events`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) =>
        setPinnedEvents(
          myEventsResponseSchema
            .parse(json)
            .data.filter((event) => event.pinned)
        )
      )
      .catch(() => {});
  }, [authToken, activeSection]);

  return (
    <aside className="primary-sidebar">
      <button
        type="button"
        className="nav-logo primary-sidebar-logo"
        onClick={() => onNavigate('decouvrir')}
        aria-label="Pulso"
      >
        <img src="/brand/pulso-logo-horizontal-dark.svg" alt="Pulso" />
      </button>

      <nav className="primary-sidebar-nav">
        {(isAdmin
          ? [...SIDEBAR_NAV_ITEMS, ADMIN_NAV_ITEM]
          : SIDEBAR_NAV_ITEMS
        ).map((item) => (
          <button
            type="button"
            key={item.section}
            className={`primary-sidebar-nav-item ${activeSection === item.section ? 'active' : ''}`}
            onClick={() => onNavigate(item.section)}
          >
            <span className="primary-sidebar-nav-icon">
              <SidebarNavIcon kind={item.icon} />
            </span>
            {item.label}
            {item.section === 'messages' && unreadMessagesCount > 0 && (
              <span className="primary-sidebar-nav-badge">
                {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* "Raccourcis" now means only what the user actually pinned. It used
          to head three fixed links (Mes événements / Événements suivis /
          Historique) that either duplicated a primary nav item or led to a
          page reachable from the profile - so the heading now belongs to
          the pinned block, and disappears entirely when nothing is pinned
          rather than labelling a permanently-identical list.
          Only groups the user pinned show up here (see Group.pinned, Phase
          4.14) - "Groupes" above is the real entry point to the full panel
          (and its own create-group form), not a "Créer un groupe" shortcut
          duplicated down here. */}
      {(pinnedGroups.length > 0 || pinnedEvents.length > 0) && (
        <div className="primary-sidebar-group">
          <h3 className="primary-sidebar-group-title">Raccourcis</h3>
          {pinnedGroups.map((group) => (
            <button
              type="button"
              key={group.id}
              className="primary-sidebar-nav-item"
              onClick={() => setOpenGroup(group)}
            >
              <span className="primary-sidebar-group-avatar" aria-hidden="true">
                {group.name.slice(0, 1).toUpperCase()}
              </span>
              {group.name}
            </button>
          ))}
          {pinnedEvents.map((event) => (
            <button
              type="button"
              key={event.id}
              className="primary-sidebar-nav-item"
              onClick={() => onOpenEvent(event.id)}
            >
              <span
                className="primary-sidebar-group-avatar primary-sidebar-event-avatar"
                aria-hidden="true"
              >
                <CategoryIcon category={event.category} size={14} />
              </span>
              {event.title}
            </button>
          ))}
        </div>
      )}

      {openGroup && (
        <GroupModal
          group={openGroup}
          authToken={authToken}
          userId={user.id}
          onClose={() => setOpenGroup(undefined)}
          onLeft={() => {
            setOpenGroup(undefined);
            refreshGroups();
          }}
        />
      )}

      {/* Grouped: the rail's own 2rem gap applies between top-level blocks,
          so leaving the divider, the profile and the invite as three
          siblings spread the footer over ~5rem of dead space and stopped it
          reading as one cluster. */}
      <div className="primary-sidebar-footer">
        <div className="primary-sidebar-divider" />
        <button
          type="button"
          className="primary-sidebar-profile"
          onClick={onOpenAccount}
        >
          <span className="account-avatar">
            {renderUserAvatarContent(user)}
          </span>
          <span className="primary-sidebar-profile-info">
            <strong>{user.displayName}</strong>
            <span>{user.email}</span>
          </span>
          <span className="primary-sidebar-profile-chevron" aria-hidden="true">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </span>
        </button>

        {/* The whole row is the copy control rather than a small "Copier" text
          link beside it: one obvious target instead of a 40px one, and it
          drops the lone blue link that was the only non-brand accent in the
          rail. The label is the kicker - the code itself is data, so it no
          longer outweighs its own heading. */}
        {friendCode && (
          <div className="primary-sidebar-invite">
            <p className="primary-sidebar-invite-kicker">
              Ton code d'invitation
            </p>
            <button
              type="button"
              className={`primary-sidebar-invite-code ${copied ? 'copied' : ''}`}
              aria-label={`Copier ton code d'invitation ${friendCode}`}
              onClick={() => {
                void navigator.clipboard.writeText(friendCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              <strong>{friendCode}</strong>
              <span className="primary-sidebar-invite-action">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {copied ? (
                    <path d="M20 6L9 17l-5-5" />
                  ) : (
                    <>
                      <rect x="9" y="9" width="12" height="12" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </>
                  )}
                </svg>
                {copied ? 'Copié' : 'Copier'}
              </span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

// Top bar for the connected experience - same search/city/notification
// building blocks as the anonymous top-navbar, minus the Événement/Lieu/
// Explorer text nav (now in Sidebar) since the account layer moves
// wayfinding into a persistent rail rather than a row of header tabs.
function TopBar({
  query,
  result,
  processing,
  error,
  onQueryChange,
  onSubmit,
  onClear,
  onClearConstraint,
  onPreview,
  locale,
  user,
  unreadMessagesCount,
  notificationsUnreadCount,
  notificationsOpen,
  notificationsPanel,
  onToggleNotifications,
  onOpenAccount,
  onOpenMessages,
  onOpenAbout,
  aboutOpen
}: {
  query: string;
  result: IntelligentSearchResponse | undefined;
  processing: boolean;
  error: boolean;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  onClearConstraint: (key: SearchConstraintKey) => void;
  onPreview: (event: PublicEvent) => void;
  locale: SupportedLocale;
  user: User;
  unreadMessagesCount: number;
  notificationsUnreadCount: number;
  notificationsOpen: boolean;
  // Rendered inside .nav-actions so the popover anchors to the bell itself;
  // as a sibling of the header it resolved `top: 100%` against the whole
  // content column and landed off-screen at the bottom of the page.
  notificationsPanel: ReactNode;
  onToggleNotifications: () => void;
  onOpenAccount: () => void;
  onOpenMessages: () => void;
  onOpenAbout: () => void;
  aboutOpen: boolean;
}) {
  return (
    <header className="top-navbar connected-topbar">
      <div className="nav-search">
        <SearchPanel
          query={query}
          result={result}
          processing={processing}
          error={error}
          onQueryChange={onQueryChange}
          onSubmit={onSubmit}
          onClear={onClear}
          onClearConstraint={onClearConstraint}
          onPreview={onPreview}
          locale={locale}
        />
      </div>
      <div className="nav-actions">
        <button
          type="button"
          className={`nav-icon-btn ${aboutOpen ? 'active' : ''}`}
          onClick={onOpenAbout}
          aria-label="À propos"
          title="À propos"
        >
          <InfoIcon />
        </button>
        <button
          type="button"
          className="nav-icon-btn"
          onClick={onOpenMessages}
          aria-label={
            unreadMessagesCount > 0
              ? `Messages — ${unreadMessagesCount} non lus`
              : 'Messages'
          }
          title="Messages"
        >
          <MessageIcon />
          {unreadMessagesCount > 0 && (
            <span className="nav-icon-badge">
              {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
            </span>
          )}
        </button>
        <button
          type="button"
          className={`nav-icon-btn ${notificationsOpen ? 'active' : ''}`}
          onClick={onToggleNotifications}
          aria-expanded={notificationsOpen}
          aria-label={
            notificationsUnreadCount > 0
              ? `Notifications — ${notificationsUnreadCount} non lues`
              : 'Notifications'
          }
          title="Notifications"
        >
          <BellIcon />
          {notificationsUnreadCount > 0 && (
            <span className="nav-icon-badge">
              {notificationsUnreadCount > 9 ? '9+' : notificationsUnreadCount}
            </span>
          )}
        </button>
        {notificationsPanel}
        <AccountMenu
          user={user}
          onLogin={() => {}}
          onOpenAccount={onOpenAccount}
          unreadCount={0}
        />
      </div>
    </header>
  );
}

// Real date-window buckets available server-side (createFilteredDiscoveryWindow
// in @pulso/domain) - 'next7' is the only "beyond this weekend" filter that
// actually exists, so it doubles as "À venir" rather than inventing a
// fourth, undistinguishable bucket.
type EventsPeriod = 'today' | 'weekend' | 'next7';

const EVENTS_PERIOD_TABS: Array<{ value: EventsPeriod; label: string }> = [
  { value: 'today', label: "Aujourd'hui" },
  { value: 'weekend', label: 'Ce week-end' },
  { value: 'next7', label: 'À venir' }
];

const EVENTS_PAGE_SIZE = 12;
// A "NOUVEAU" badge threshold - a real, defined window on the event's real
// source.observedAt timestamp (when ingestion first recorded it), not a
// fabricated "new" flag.
const NEW_EVENT_WINDOW_MS = 72 * 60 * 60 * 1000;

function isEventCategory(value: string): value is EventCategory {
  return (EVENT_CATEGORIES as readonly string[]).includes(value);
}

// Full-page, card-grid "Événements" home for the connected sidebar (Phase
// 4.11) - distinct from the anonymous top-navbar's "Événement" map/list/
// calendar Explorer, which keeps its own unchanged behavior (the sidebar's
// separate "Carte" item covers map browsing for signed-in users instead).
// Every number here is real: attendeeCount/friendsAttending come from the
// batched /events/engagement endpoint (Phase 4.11 backend), "NOUVEAU" is a
// real recency threshold on source.observedAt, and "Groupes actifs" reuses
// the real event-linked group directory from Phase 4.10. No popularity %,
// no capacity/"presque complet" bar - neither has any real backing data.
function EventsPage({
  authToken,
  favorites,
  onToggleFavorite,
  onOpenEventForum,
  onNavigateToMap,
  onNavigateToOrganisateur,
  locale
}: {
  authToken: string | undefined;
  favorites: string[];
  onToggleFavorite: (eventId: string) => void;
  onOpenEventForum: (eventId: string) => void;
  onNavigateToMap: () => void;
  onNavigateToOrganisateur: () => void;
  locale: SupportedLocale;
}) {
  const [period, setPeriod] = useState<EventsPeriod>('today');
  const [activeChip, setActiveChip] = useState<'all' | EventCategory | 'free'>(
    'all'
  );
  const [query, setQuery] = useState('');
  // DEC-0017. Connected-only, like the created events it surfaces.
  const [afterOnly, setAfterOnly] = useState(false);
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [visibleCount, setVisibleCount] = useState(EVENTS_PAGE_SIZE);
  const [periodCounts, setPeriodCounts] = useState<
    Partial<Record<EventsPeriod, number>>
  >({});
  const [activeGroups, setActiveGroups] = useState<DiscoverGroupEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      EVENTS_PERIOD_TABS.map(({ value }) =>
        fetch(
          `${API_BASE_URL}/events?${buildMapEventsQuery(INITIAL_BOUNDS, { date: value, categories: [], price: 'all' })}`
        )
          .then((response) =>
            response.ok ? response.json() : Promise.reject()
          )
          .then(
            (json) =>
              [value, eventListResponseSchema.parse(json).data.length] as [
                EventsPeriod,
                number
              ]
          )
      )
    )
      .then((entries) => {
        if (!cancelled) setPeriodCounts(Object.fromEntries(entries));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setVisibleCount(EVENTS_PAGE_SIZE);
    const filters: DiscoveryFilters = {
      date: period,
      categories: isEventCategory(activeChip) ? [activeChip] : [],
      price: activeChip === 'free' ? 'free' : 'all',
      ...(afterOnly ? { after: true } : {})
    };
    fetch(
      `${API_BASE_URL}/events?${buildMapEventsQuery(INITIAL_BOUNDS, filters)}`,
      // The API only honours `after` - and only returns account-created
      // events at all - for a signed-in caller (DEC-0017).
      authToken ? { headers: { authorization: `Bearer ${authToken}` } } : {}
    )
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        if (cancelled) return;
        setEvents(eventListResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [period, activeChip, afterOnly, authToken]);

  useEffect(() => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/groups/discover?scope=event`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) =>
        setActiveGroups(discoverGroupsResponseSchema.parse(json).data)
      )
      .catch(() => {});
  }, [authToken]);

  const filtered = query.trim()
    ? events.filter((event) =>
        `${event.title} ${event.venue.name}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      )
    : events;
  const visible = filtered.slice(0, visibleCount);
  const engagement = useEventEngagement(
    visible.map((event) => event.id).slice(0, 100),
    authToken
  );

  const popular = [...visible]
    .filter((event) => (engagement.get(event.id)?.attendeeCount ?? 0) > 0)
    .sort(
      (a, b) =>
        (engagement.get(b.id)?.attendeeCount ?? 0) -
        (engagement.get(a.id)?.attendeeCount ?? 0)
    )
    .slice(0, 4);

  const recentlyAdded = [...visible]
    .filter(
      (event) =>
        Date.now() - new Date(event.source.observedAt).getTime() <
        NEW_EVENT_WINDOW_MS
    )
    .sort(
      (a, b) =>
        new Date(b.source.observedAt).getTime() -
        new Date(a.source.observedAt).getTime()
    )
    .slice(0, 3);

  const friendsGoingById = new Map<string, PublicUser>();
  for (const event of visible) {
    for (const person of engagement.get(event.id)?.friendsAttending ?? []) {
      friendsGoingById.set(person.id, person);
    }
  }
  const friendsGoingList = Array.from(friendsGoingById.values());

  return (
    <div className="events-page">
      <div className="events-page-main">
        <div className="events-hero">
          <div className="events-hero-text">
            <p className="events-hero-kicker">Agenda montréalais</p>
            <h1>Ta prochaine sortie commence ici.</h1>
            <p className="events-hero-eyebrow">
              Concerts, festivals et soirées sélectionnés à Montréal.
            </p>
            <div className="events-hero-stats">
              {EVENTS_PERIOD_TABS.map(({ value, label }) => (
                <span className="events-hero-stat" key={value}>
                  <strong>{periodCounts[value] ?? '…'}</strong>{' '}
                  {label.toLowerCase()}
                </span>
              ))}
            </div>
          </div>
          <div className="events-hero-actions">
            {/* Creation lives in Organisateur now (DEC-0017 v1.2) - this
                stays as a shortcut rather than a second implementation. */}
            <button
              type="button"
              className="btn-primary events-hero-create-btn"
              onClick={onNavigateToOrganisateur}
            >
              Créer un événement
            </button>
            <button
              type="button"
              className="btn-secondary events-hero-map-btn"
              onClick={onNavigateToMap}
            >
              <ViewModeIcon kind="map" />
              Explorer la carte
            </button>
          </div>
        </div>

        <div className="events-discovery-controls">
          <div className="details-tabs events-period-tabs">
            {EVENTS_PERIOD_TABS.map(({ value, label }) => (
              <button
                type="button"
                key={value}
                className={period === value ? 'active' : ''}
                onClick={() => setPeriod(value)}
              >
                {label}
                <span>{periodCounts[value] ?? '…'}</span>
              </button>
            ))}
          </div>

          <div className="messages-search events-search">
            <span className="events-search-icon" aria-hidden="true">
              ⌕
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un événement ou un lieu"
            />
          </div>

          <div className="events-category-chips">
            <button
              type="button"
              className={activeChip === 'all' ? 'active' : ''}
              onClick={() => setActiveChip('all')}
            >
              Tout voir
            </button>
            {EVENT_CATEGORIES.map((cat) => (
              <button
                type="button"
                key={cat}
                className={activeChip === cat ? 'active' : ''}
                onClick={() => setActiveChip(cat)}
                style={
                  {
                    '--event-chip-color':
                      CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.other
                  } as CSSProperties
                }
              >
                <span className="events-category-dot" aria-hidden="true" />
                {SHORT_CATEGORY_LABELS[locale][cat]}
              </button>
            ))}
            <button
              type="button"
              className={`events-free-chip ${activeChip === 'free' ? 'active' : ''}`}
              onClick={() => setActiveChip('free')}
            >
              <span className="events-category-dot" aria-hidden="true" />
              Gratuit
            </button>
            {/* DEC-0017. Not a seventh category: an after keeps its real
                category and colour, and this matches the creator's flag OR a
                02:00-06:00 start, so it also surfaces late-night events
                already in the sourced directory. */}
            <button
              type="button"
              className={`events-after-chip ${afterOnly ? 'active' : ''}`}
              aria-pressed={afterOnly}
              onClick={() => setAfterOnly((on) => !on)}
            >
              <span className="events-category-dot" aria-hidden="true" />
              After
            </button>
          </div>
        </div>

        {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
        {state === 'error' && (
          <p className="list-view-empty">
            Impossible de charger les événements pour le moment.
          </p>
        )}
        {state === 'success' && filtered.length === 0 && (
          <p className="list-view-empty">Aucun événement trouvé.</p>
        )}

        {state === 'success' && filtered.length > 0 && (
          <div className="events-results-heading">
            <div>
              <span>À découvrir</span>
              <h2>Les sorties du moment</h2>
            </div>
            <p>
              {filtered.length} événement{filtered.length > 1 ? 's' : ''}
            </p>
          </div>
        )}

        <div className="events-grid">
          {visible.map((event) => (
            <EventGridCard
              key={event.id}
              event={event}
              locale={locale}
              isFavorite={favorites.includes(event.id)}
              onToggleFavorite={() => onToggleFavorite(event.id)}
              onOpen={() => onOpenEventForum(event.id)}
              attendeeCount={engagement.get(event.id)?.attendeeCount ?? 0}
              friendsAttending={
                engagement.get(event.id)?.friendsAttending ?? []
              }
            />
          ))}
        </div>

        {visibleCount < filtered.length && (
          <button
            type="button"
            className="events-load-more"
            onClick={() => setVisibleCount((count) => count + EVENTS_PAGE_SIZE)}
          >
            Charger plus d'événements ↓
          </button>
        )}
      </div>

      <aside className="events-trends">
        <div className="events-trends-heading">
          <span>En ce moment</span>
          <h2>Tendances</h2>
        </div>

        <div className="events-trends-section">
          <h3>Les plus populaires</h3>
          {popular.length === 0 ? (
            <div className="events-trends-empty">
              <span aria-hidden="true">↗</span>
              <p>
                Les tendances apparaîtront avec les premières participations.
              </p>
            </div>
          ) : (
            <ol className="events-trends-list">
              {popular.map((event, index) => (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => onOpenEventForum(event.id)}
                  >
                    <span className="events-trends-rank">{index + 1}</span>
                    <span className="events-trends-thumb">
                      {event.imageUrl ? (
                        <img src={event.imageUrl} alt="" />
                      ) : (
                        <EventImageFallback category={event.category} />
                      )}
                    </span>
                    <span className="events-trends-info">
                      <strong>{event.title}</strong>
                      <span>{event.venue.name}</span>
                    </span>
                    <span className="events-trends-hotness">
                      🔥 {engagement.get(event.id)?.attendeeCount}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="events-trends-section">
          <h3>Nouveaux événements</h3>
          {recentlyAdded.length === 0 ? (
            <p className="list-view-empty">Rien de neuf pour l'instant.</p>
          ) : (
            <ul className="events-trends-list">
              {recentlyAdded.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => onOpenEventForum(event.id)}
                  >
                    <span className="events-trends-thumb">
                      {event.imageUrl ? (
                        <img src={event.imageUrl} alt="" />
                      ) : (
                        <EventImageFallback category={event.category} />
                      )}
                    </span>
                    <span className="events-trends-info">
                      <strong>{event.title}</strong>
                      <span>
                        {SHORT_CATEGORY_LABELS[locale][event.category]} -{' '}
                        {event.venue.name}
                      </span>
                    </span>
                    <span className="events-trends-badge">NOUVEAU</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {authToken && (
          <div className="events-trends-section">
            <h3>Tes amis y vont</h3>
            {friendsGoingList.length === 0 ? (
              <p className="list-view-empty">
                Aucun ami n'a encore de présence prévue.
              </p>
            ) : (
              <>
                <div className="forum-members-avatars">
                  {friendsGoingList.slice(0, 8).map((person) => (
                    <span
                      className="friends-row-avatar"
                      key={person.id}
                      title={person.displayName}
                    >
                      {person.avatarUrl ? (
                        <img src={person.avatarUrl} alt="" />
                      ) : (
                        person.displayName.slice(0, 1).toUpperCase()
                      )}
                    </span>
                  ))}
                </div>
                <p className="events-trends-caption">
                  {friendsGoingList.length} ami
                  {friendsGoingList.length > 1 ? 's' : ''}{' '}
                  {friendsGoingList.length > 1 ? 'ont' : 'a'} une place.
                </p>
              </>
            )}
          </div>
        )}

        {authToken && (
          <div className="events-trends-section">
            <h3>Groupes actifs</h3>
            {activeGroups.length === 0 ? (
              <p className="list-view-empty">
                Aucun groupe d'événement actif pour l'instant.
              </p>
            ) : (
              <ul className="events-trends-groups">
                {activeGroups.slice(0, 4).map(({ group, event }) => (
                  <li key={group.id}>
                    <button
                      type="button"
                      onClick={() => event && onOpenEventForum(event.id)}
                    >
                      <span>{group.name}</span>
                      <span className="conversation-list-badge">
                        {group.memberCount}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

/**
 * DEC-0017 v1.2 event editor - a full page inside Organisateur, not a modal.
 * Creating an event is a composed task with a dozen fields; a scrolling
 * dialog over a dimmed page was the wrong container for it.
 *
 * Connected-experience only, and it says so: a created event never appears
 * on the anonymous map, and hiding that would leave an organizer expecting
 * reach the feature does not give them.
 *
 * The address is typed and resolved to coordinates server-side. Resolution
 * failure blocks publication rather than falling back to an approximate pin
 * - a pin Pulso cannot place is worse than no pin, and guessing is exactly
 * what EVENT-002 forbids. The organizer may still withhold the street line
 * from the public (a "select" after) - the coordinates stay, the text does
 * not.
 *
 * Native ticketing is absent by decision (DEC-0017 v1.1): the ticketing
 * field is an external link, handled by the same redirect an ingested
 * Ticketmaster event uses.
 */
function EventEditor({
  authToken,
  locale,
  existing,
  onCancel,
  onSaved
}: {
  authToken: string | undefined;
  locale: SupportedLocale;
  existing?: PublicEvent | undefined;
  onCancel: () => void;
  onSaved: (event: PublicEvent) => void;
}) {
  const toLocalInput = (iso: string | undefined) =>
    iso ? new Date(iso).toISOString().slice(0, 16) : '';

  const [title, setTitle] = useState(existing?.title ?? '');
  const [category, setCategory] = useState<EventCategory>(
    existing?.category ?? 'nightlife'
  );
  const [address, setAddress] = useState(
    existing?.addressHidden ? '' : (existing?.venue.address ?? '')
  );
  const [venueName, setVenueName] = useState(existing?.venue.name ?? '');
  const [addressHidden, setAddressHidden] = useState(
    existing?.addressHidden ?? false
  );
  const [resolved, setResolved] = useState<{
    longitude: number;
    latitude: number;
    label: string;
  }>();
  const [geocodeState, setGeocodeState] = useState<
    'idle' | 'checking' | 'notFound' | 'unavailable'
  >('idle');
  const [startsAt, setStartsAt] = useState(toLocalInput(existing?.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(existing?.endsAt));
  const [accessInformation, setAccessInformation] = useState(
    existing?.accessInformation ?? ''
  );
  const [description, setDescription] = useState(existing?.description ?? '');
  const [ticketingUrl, setTicketingUrl] = useState('');
  const [priceKind, setPriceKind] = useState<'free' | 'paid' | 'unknown'>(
    existing?.price.kind ?? 'free'
  );
  const [isAfter, setIsAfter] = useState(existing?.isAfter ?? false);
  const [cover, setCover] = useState<File>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const isEdit = Boolean(existing);
  // Editing keeps the event at its existing venue, so no lookup is needed;
  // creating one needs a resolved point before it can be pinned.
  const addressReady = isEdit || Boolean(resolved);

  const canSubmit =
    Boolean(authToken) &&
    title.trim().length > 0 &&
    startsAt.length > 0 &&
    accessInformation.trim().length > 0 &&
    addressReady &&
    !saving;

  const checkAddress = () => {
    if (!authToken || address.trim().length < 4) return;
    setGeocodeState('checking');
    setResolved(undefined);
    fetch(
      `${API_BASE_URL}/me/events/geocode?address=${encodeURIComponent(address.trim())}`,
      { headers: { authorization: `Bearer ${authToken}` } }
    )
      .then((response) =>
        response.ok ? response.json() : Promise.reject(response)
      )
      .then((json) => {
        const data = geocodeResponseSchema.parse(json).data;
        if (!data) {
          setGeocodeState('notFound');
          return;
        }
        setResolved(data);
        setGeocodeState('idle');
      })
      .catch(() => setGeocodeState('unavailable'));
  };

  const uploadCover = async (eventId: string) => {
    if (!cover || !authToken) return;
    const body = new FormData();
    body.append('file', cover);
    await fetch(`${API_BASE_URL}/me/events/${eventId}/cover`, {
      method: 'POST',
      headers: { authorization: `Bearer ${authToken}` },
      body
    }).catch(() => {});
  };

  const submit = () => {
    if (!authToken || !canSubmit) return;
    setSaving(true);
    setError(undefined);
    const payload = {
      title: title.trim(),
      category,
      startsAt: new Date(startsAt).toISOString(),
      ...(endsAt ? { endsAt: new Date(endsAt).toISOString() } : {}),
      accessInformation: accessInformation.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(ticketingUrl.trim() ? { ticketingUrl: ticketingUrl.trim() } : {}),
      addressHidden,
      isAfter,
      price: { kind: priceKind }
    };
    const request = existing
      ? fetch(`${API_BASE_URL}/me/events/${existing.id}`, {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${authToken}`
          },
          body: JSON.stringify(payload)
        })
      : fetch(`${API_BASE_URL}/me/events`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${authToken}`
          },
          body: JSON.stringify({
            ...payload,
            venue: {
              kind: 'new',
              name: venueName.trim() || address.trim(),
              address: address.trim(),
              point: {
                longitude: resolved!.longitude,
                latitude: resolved!.latitude
              }
            }
          })
        });

    request
      .then((response) =>
        response.ok ? response.json() : Promise.reject(response)
      )
      .then(async (json) => {
        const saved = createdEventResponseSchema.parse(json).data;
        await uploadCover(saved.id);
        onSaved(saved);
      })
      .catch(() => {
        setError(
          "L'événement n'a pas pu être enregistré. Vérifie la date et réessaie."
        );
      })
      .finally(() => setSaving(false));
  };

  return (
    <div className="event-editor">
      <button type="button" className="event-editor-back" onClick={onCancel}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Retour à mes événements
      </button>

      <div className="event-editor-head">
        <span className="create-event-kicker">Organisateur</span>
        <h1>{isEdit ? 'Modifier un événement' : 'Créer un événement'}</h1>
        <p className="create-event-notice">
          {
            "Ton événement sera visible uniquement dans l'espace connecté de Pulso, pas sur la carte publique. Il portera la mention « Communauté », ou « Organisateur vérifié » si ton compte est rattaché à ce lieu."
          }
        </p>
      </div>

      <section className="event-editor-section">
        <h2>L&apos;essentiel</h2>
        <label className="create-event-field">
          <span>Titre</span>
          <input
            value={title}
            onChange={(changeEvent) => setTitle(changeEvent.target.value)}
            placeholder="After techno chez Marie"
            maxLength={200}
          />
        </label>
        <div className="create-event-row">
          <label className="create-event-field">
            <span>Catégorie</span>
            <select
              value={category}
              onChange={(changeEvent) =>
                setCategory(changeEvent.target.value as EventCategory)
              }
            >
              {EVENT_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {SHORT_CATEGORY_LABELS[locale][value]}
                </option>
              ))}
            </select>
          </label>
          <label className="create-event-field">
            <span>Prix</span>
            <select
              value={priceKind}
              onChange={(changeEvent) =>
                setPriceKind(
                  changeEvent.target.value as 'free' | 'paid' | 'unknown'
                )
              }
            >
              <option value="free">Gratuit</option>
              <option value="paid">Payant</option>
              <option value="unknown">Non précisé</option>
            </select>
          </label>
        </div>
        <label className="create-event-after">
          <input
            type="checkbox"
            checked={isAfter}
            onChange={(changeEvent) => setIsAfter(changeEvent.target.checked)}
          />
          <span>
            <strong>{"C'est un after"}</strong>
            <small>
              {
                'Il apparaîtra dans le filtre After. Un événement qui commence entre 2 h et 6 h y apparaît de toute façon.'
              }
            </small>
          </span>
        </label>
      </section>

      <section className="event-editor-section">
        <h2>Quand</h2>
        <div className="create-event-row">
          <label className="create-event-field">
            <span>Début</span>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(changeEvent) => setStartsAt(changeEvent.target.value)}
            />
          </label>
          <label className="create-event-field">
            <span>Fin (optionnel)</span>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(changeEvent) => setEndsAt(changeEvent.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="event-editor-section">
        <h2>Où</h2>
        {isEdit ? (
          <label className="create-event-field">
            <span>Lieu</span>
            <input value={existing?.venue.name ?? ''} disabled />
            <small className="create-event-hint">
              Déplacer un événement ailleurs, c&apos;est un autre événement —
              crée-en un nouveau.
            </small>
          </label>
        ) : (
          <>
            <label className="create-event-field">
              <span>Nom du lieu (optionnel)</span>
              <input
                value={venueName}
                onChange={(changeEvent) =>
                  setVenueName(changeEvent.target.value)
                }
                placeholder="Loft Saint-Henri"
                maxLength={200}
              />
            </label>
            <label className="create-event-field">
              <span>Adresse précise</span>
              <div className="create-event-address">
                <input
                  value={address}
                  onChange={(changeEvent) => {
                    setAddress(changeEvent.target.value);
                    setResolved(undefined);
                    setGeocodeState('idle');
                  }}
                  placeholder="1 rue Notre-Dame Ouest, Montréal"
                  maxLength={300}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={checkAddress}
                  disabled={address.trim().length < 4}
                >
                  Vérifier
                </button>
              </div>
              {geocodeState === 'checking' && (
                <small className="create-event-hint">Vérification…</small>
              )}
              {geocodeState === 'notFound' && (
                <small className="create-event-hint create-event-hint-error">
                  Adresse introuvable. Pulso ne place pas un repère au hasard —
                  précise l&apos;adresse.
                </small>
              )}
              {geocodeState === 'unavailable' && (
                <small className="create-event-hint create-event-hint-error">
                  Vérification indisponible pour le moment. Réessaie.
                </small>
              )}
              {resolved && (
                <small className="create-event-hint create-event-hint-ok">
                  ✓ {resolved.label}
                </small>
              )}
            </label>
          </>
        )}

        {/* The address is still resolved and the event still gets a real
            pin - only the street line is withheld. An event Pulso cannot
            place at all is not something it will publish. */}
        <label className="create-event-after">
          <input
            type="checkbox"
            checked={addressHidden}
            onChange={(changeEvent) =>
              setAddressHidden(changeEvent.target.checked)
            }
          />
          <span>
            <strong>Ne pas afficher l&apos;adresse publiquement</strong>
            <small>
              Pour un after plus select. Le repère reste sur la carte au bon
              endroit, mais l&apos;adresse exacte n&apos;est pas affichée —
              donne le nécessaire dans «&nbsp;Comment y accéder&nbsp;».
            </small>
          </span>
        </label>
      </section>

      <section className="event-editor-section">
        <h2>Détails</h2>
        <label className="create-event-field">
          <span>Photo de couverture (optionnel)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(changeEvent) =>
              setCover(changeEvent.target.files?.[0] ?? undefined)
            }
          />
        </label>
        <label className="create-event-field">
          <span>Comment y accéder</span>
          <textarea
            value={accessInformation}
            onChange={(changeEvent) =>
              setAccessInformation(changeEvent.target.value)
            }
            placeholder="Sonner à la porte bleue, 3e étage."
            rows={2}
          />
        </label>
        <label className="create-event-field">
          <span>Description (optionnel)</span>
          <textarea
            value={description}
            onChange={(changeEvent) => setDescription(changeEvent.target.value)}
            rows={4}
          />
        </label>
      </section>

      <section className="event-editor-section">
        <h2>Billetterie</h2>
        <label className="create-event-field">
          <span>Lien billetterie (optionnel)</span>
          <input
            value={ticketingUrl}
            onChange={(changeEvent) =>
              setTicketingUrl(changeEvent.target.value)
            }
            placeholder="https://…"
          />
          <small className="create-event-hint">
            Pulso ne vend pas de billets : ce lien redirige vers ta billetterie,
            comme pour un événement Ticketmaster.
          </small>
        </label>
      </section>

      {error && <p className="create-event-error">{error}</p>}

      <div className="event-editor-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Annuler
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={!canSubmit}
          onClick={submit}
        >
          {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Publier'}
        </button>
      </div>
    </div>
  );
}

/**
 * DEC-0017 v1.1 organizer workspace. The account's own created events, with
 * real management: edit, cover photo, geocoded address, external ticketing
 * link. Native ticketing is deliberately absent - see DEC-0017 v1.1.
 */
/**
 * DEC-0018 administration console. Currently one queue: pending organizer
 * requests. Gated on `users.is_admin`, which is set directly in the
 * database - the destination is hidden for everyone else, and every /admin
 * route answers 403 regardless of what the interface shows.
 */
/**
 * DEC-0018: where an account asks to become the verified organizer of a
 * venue, and where it sees the venues it already manages. The venue list
 * comes from the events already loaded for the fourteen-day window rather
 * than a venue search endpoint Pulso does not have.
 */
function OrganizerStatusBlock({
  authToken
}: {
  authToken: string | undefined;
}) {
  const [status, setStatus] = useState<{
    isAdmin: boolean;
    verifiedVenues: Array<{ venueId: string; venueName: string }>;
    pendingRequests: OrganizerRequest[];
  }>();
  const [venues, setVenues] = useState<VenueGroup[]>([]);
  const [venueId, setVenueId] = useState('');
  const [justification, setJustification] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState(false);

  const reload = useCallback(() => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/me/organizer`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) =>
        setStatus(myOrganizerStatusResponseSchema.parse(json).data)
      )
      .catch(() => {});
  }, [authToken]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const venueWindow = getVenueDiscoveryDateRange(new Date());
    fetch(
      `${API_BASE_URL}/events?${buildMapEventsQuery(INITIAL_BOUNDS, {
        date: 'custom',
        categories: [],
        price: 'all',
        customStartDate: venueWindow.start,
        customEndDate: venueWindow.end
      })}`
    )
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) =>
        setVenues(groupEventsByVenue(eventListResponseSchema.parse(json).data))
      )
      .catch(() => {});
  }, []);

  const submit = () => {
    if (!authToken) return;
    const parsed = createOrganizerRequestSchema.safeParse({
      venueId,
      justification: justification.trim()
    });
    if (!parsed.success) {
      setError(
        'Choisis un lieu et explique ton lien avec lui (10 caractères minimum).'
      );
      return;
    }
    setSaving(true);
    setError(undefined);
    fetch(`${API_BASE_URL}/me/organizer/requests`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify(parsed.data)
    })
      .then((response) => {
        if (response.status === 409) {
          throw new Error('Une demande est déjà en attente pour ce lieu.');
        }
        if (!response.ok) throw new Error('failed');
        setJustification('');
        setVenueId('');
        setOpen(false);
        reload();
      })
      .catch((caught: Error) =>
        setError(
          caught.message === 'failed'
            ? "La demande n'a pas pu être envoyée."
            : caught.message
        )
      )
      .finally(() => setSaving(false));
  };

  if (!status) return null;

  return (
    <section className="organizer-status">
      <div className="organizer-status-head">
        <div>
          <h2 className="organisateur-group-title">Statut organisateur</h2>
          {status.verifiedVenues.length > 0 ? (
            <p className="organizer-status-line">
              Tu es organisateur vérifié de{' '}
              <strong>
                {status.verifiedVenues.map((v) => v.venueName).join(', ')}
              </strong>
              .
            </p>
          ) : (
            <p className="organizer-status-line">
              {
                'Tes événements sont publiés en « Communauté ». Demande à gérer un lieu pour publier en son nom.'
              }
            </p>
          )}
          {status.pendingRequests.length > 0 && (
            <p className="organizer-status-line organizer-status-pending">
              Demande en attente pour{' '}
              {status.pendingRequests.map((r) => r.venueName).join(', ')}.
            </p>
          )}
        </div>
        {status.pendingRequests.length === 0 && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setOpen((current) => !current)}
          >
            {open ? 'Annuler' : 'Demander un lieu'}
          </button>
        )}
      </div>

      {open && (
        <div className="organizer-status-form">
          <label className="create-event-field">
            <span>Lieu</span>
            <select
              value={venueId}
              onChange={(changeEvent) => setVenueId(changeEvent.target.value)}
            >
              <option value="">Choisis un lieu…</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          </label>
          <label className="create-event-field">
            <span>Ton lien avec ce lieu</span>
            <textarea
              rows={3}
              value={justification}
              onChange={(changeEvent) =>
                setJustification(changeEvent.target.value)
              }
              placeholder="Je programme les soirées de ce bar depuis 2024…"
            />
            <small className="create-event-hint">
              Une personne lit chaque demande. Pulso ne vérifie rien
              automatiquement.
            </small>
          </label>
          {error && <p className="create-event-error">{error}</p>}
          <div className="create-event-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={saving}
              onClick={submit}
            >
              {saving ? 'Envoi…' : 'Envoyer la demande'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function AdministrationPage({ authToken }: { authToken: string | undefined }) {
  const [requests, setRequests] = useState<OrganizerRequest[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  const reload = useCallback(() => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/admin/organizer-requests`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setRequests(organizerRequestsResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken]);

  useEffect(() => {
    reload();
  }, [reload]);

  const resolve = (id: string, approve: boolean) => {
    if (!authToken) return;
    setBusy(id);
    setError(undefined);
    fetch(`${API_BASE_URL}/admin/organizer-requests/${id}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ approve })
    })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        reload();
      })
      .catch(() => setError("La décision n'a pas pu être enregistrée."))
      .finally(() => setBusy(undefined));
  };

  return (
    <div className="map-container-wrapper organisateur-page">
      <div className="events-hero organisateur-hero">
        <div className="events-hero-text">
          <p className="events-hero-kicker">Administration</p>
          <h1>Demandes d&apos;organisateur.</h1>
          <p className="events-hero-eyebrow">
            Chaque demande t&apos;est notifiée dans Pulso. Approuver rattache le
            compte au lieu ; refuser ne crée aucun lien.
          </p>
          <div className="events-hero-stats">
            <span className="events-hero-stat">
              <strong>{requests.length}</strong> en attente
            </span>
          </div>
        </div>
      </div>

      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'error' && (
        <p className="list-view-empty">
          Impossible de charger les demandes pour le moment.
        </p>
      )}
      {error && <p className="create-event-error">{error}</p>}

      {state === 'success' && requests.length === 0 && (
        <div className="empty-state-card organisateur-empty">
          <span className="empty-state-icon" aria-hidden="true">
            <SidebarNavIcon kind="administration" />
          </span>
          <p>Aucune demande en attente</p>
          <p>Tu seras notifié dès qu&apos;un compte demande à gérer un lieu.</p>
        </div>
      )}

      <div className="organisateur-list">
        {requests.map((entry) => (
          <div className="admin-request" key={entry.id}>
            <div className="admin-request-main">
              <strong>{entry.venueName}</strong>
              <span className="admin-request-venue">{entry.venueAddress}</span>
              <span className="admin-request-who">
                Demandé par {entry.requester.displayName} ·{' '}
                {entry.requester.email}
              </span>
              <p className="admin-request-justification">
                {entry.justification}
              </p>
              <span className="admin-request-when">
                {formatRelativeTime(entry.createdAt)}
              </span>
            </div>
            <div className="admin-request-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={busy === entry.id}
                onClick={() => resolve(entry.id, false)}
              >
                Refuser
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={busy === entry.id}
                onClick={() => resolve(entry.id, true)}
              >
                Approuver
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrganisateurPage({
  authToken,
  locale,
  onOpenEvent
}: {
  authToken: string | undefined;
  locale: SupportedLocale;
  onOpenEvent: (eventId: string) => void;
}) {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [editing, setEditing] = useState<PublicEvent | 'new'>();

  const reload = useCallback(() => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/me/events`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setEvents(myEventsResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken]);

  useEffect(() => {
    reload();
  }, [reload]);

  const [actionError, setActionError] = useState<string>();

  // fetch only rejects on a network failure, so the previous `.then(reload)`
  // swallowed every server error and re-rendered the unchanged list - the
  // button looked dead rather than failed.
  const remove = (eventId: string) => {
    if (!authToken) return;
    setActionError(undefined);
    fetch(`${API_BASE_URL}/me/events/${eventId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        reload();
      })
      .catch(() =>
        setActionError("L'événement n'a pas pu être supprimé. Réessaie.")
      );
  };

  const togglePin = (event: PublicEvent) => {
    if (!authToken) return;
    setActionError(undefined);
    fetch(`${API_BASE_URL}/me/events/${event.id}/pin`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ pinned: !event.pinned })
    })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        reload();
      })
      .catch(() => setActionError("L'épinglage n'a pas pu être enregistré."));
  };

  const now = Date.now();
  const upcoming = events.filter(
    (event) => new Date(event.startsAt).getTime() >= now
  );
  const past = events.filter(
    (event) => new Date(event.startsAt).getTime() < now
  );

  if (editing) {
    return (
      <div className="map-container-wrapper organisateur-page">
        <EventEditor
          authToken={authToken}
          locale={locale}
          existing={editing === 'new' ? undefined : editing}
          onCancel={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            reload();
          }}
        />
      </div>
    );
  }

  return (
    <div className="map-container-wrapper organisateur-page">
      <div className="events-hero organisateur-hero">
        <div className="events-hero-text">
          <p className="events-hero-kicker">Organisateur</p>
          <h1>Tes événements.</h1>
          <p className="events-hero-eyebrow">
            Crée et gère tes soirées. Elles sont visibles dans l&apos;espace
            connecté de Pulso, pas sur la carte publique.
          </p>
          <div className="events-hero-stats">
            <span className="events-hero-stat">
              <strong>{upcoming.length}</strong> à venir
            </span>
            <span className="events-hero-stat">
              <strong>{past.length}</strong> passé{past.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setEditing('new')}
        >
          Créer un événement
        </button>
      </div>

      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'error' && (
        <p className="list-view-empty">
          Impossible de charger tes événements pour le moment.
        </p>
      )}
      {actionError && <p className="create-event-error">{actionError}</p>}

      <OrganizerStatusBlock authToken={authToken} />

      {state === 'success' && events.length === 0 && (
        <div className="empty-state-card organisateur-empty">
          <span className="empty-state-icon" aria-hidden="true">
            <SidebarNavIcon kind="organisateur" />
          </span>
          <p>Aucun événement publié</p>
          <p>
            Crée ta première soirée : elle apparaîtra dans Événements et sur la
            carte connectée, avec le filtre After si c&apos;en est un.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setEditing('new')}
          >
            Créer un événement
          </button>
        </div>
      )}

      {[
        { label: 'À venir', list: upcoming },
        { label: 'Passés', list: past }
      ]
        .filter((group) => group.list.length > 0)
        .map((group) => (
          <section className="organisateur-group" key={group.label}>
            <h2 className="organisateur-group-title">{group.label}</h2>
            <div className="organisateur-list">
              {group.list.map((event) => (
                <div className="organisateur-row" key={event.id}>
                  <span
                    className="organisateur-row-cover"
                    style={
                      event.imageUrl
                        ? { backgroundImage: `url(${event.imageUrl})` }
                        : undefined
                    }
                  >
                    {!event.imageUrl && (
                      <CategoryIcon category={event.category} size={18} />
                    )}
                  </span>
                  <span className="organisateur-row-main">
                    <strong>{event.title}</strong>
                    <span>
                      {event.venue.name} · {formatEventDateTime(event.startsAt)}
                    </span>
                    <span className="organisateur-row-tags">
                      <span
                        className={`organisateur-origin origin-${event.origin ?? 'directory'}`}
                      >
                        {event.origin === 'verified_organizer'
                          ? 'Organisateur vérifié'
                          : 'Communauté'}
                      </span>
                      {event.isAfter && (
                        <span className="organisateur-after">After</span>
                      )}
                      {event.externalDestination?.kind === 'ticketing' && (
                        <span className="organisateur-ticketing">
                          Billetterie externe
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="organisateur-row-actions">
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => onOpenEvent(event.id)}
                    >
                      Voir
                    </button>
                    <button
                      type="button"
                      className={`text-btn ${event.pinned ? 'organisateur-pinned' : ''}`}
                      aria-pressed={event.pinned === true}
                      onClick={() => togglePin(event)}
                    >
                      {event.pinned ? 'Épinglé' : 'Épingler'}
                    </button>
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => setEditing(event)}
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="text-btn organisateur-delete"
                      onClick={() => remove(event.id)}
                    >
                      Supprimer
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}

function EventGridCard({
  event,
  locale,
  isFavorite,
  onToggleFavorite,
  onOpen,
  attendeeCount,
  friendsAttending
}: {
  event: PublicEvent;
  locale: SupportedLocale;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
  attendeeCount: number;
  friendsAttending: PublicUser[];
}) {
  const priceLabel = formatEventPrice(event.price);
  const dateBadge = formatEventDateBadge(event.startsAt);
  return (
    <div
      className="events-grid-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === 'Enter') onOpen();
      }}
    >
      <div
        className="events-grid-card-img"
        style={
          event.imageUrl
            ? {
                backgroundImage: `url(${event.imageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }
            : undefined
        }
      >
        {!event.imageUrl && <EventImageFallback category={event.category} />}
        <span className="events-grid-card-date">
          <strong>{dateBadge.day}</strong>
          {dateBadge.month}
        </span>
        <div
          className="card-badge"
          style={{
            background:
              CATEGORY_COLORS[event.category] ?? CATEGORY_COLORS['other']
          }}
        >
          {SHORT_CATEGORY_LABELS[locale][event.category]}
        </div>
        <button
          type="button"
          className="card-fav"
          aria-label={
            isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'
          }
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            onToggleFavorite();
          }}
        >
          <HeartIcon filled={isFavorite} />
        </button>
      </div>
      <div className="events-grid-card-content">
        <h3>{event.title}</h3>
        <p className="events-grid-card-venue">
          <span aria-hidden="true">⌖</span> {event.venue.name}
        </p>
        <p className="events-grid-card-time">
          <span aria-hidden="true">◷</span>{' '}
          {formatEventTimeRange(event.startsAt, event.endsAt)}
        </p>
        <p
          className={`events-grid-card-price ${event.price.kind === 'free' ? 'free' : ''}`}
        >
          {priceLabel}
        </p>
        <div className="events-grid-card-footer">
          {friendsAttending.length > 0 ? (
            <div className="events-grid-card-avatars">
              {friendsAttending.slice(0, 3).map((person) => (
                <span
                  className="friends-row-avatar"
                  key={person.id}
                  title={person.displayName}
                >
                  {person.avatarUrl ? (
                    <img src={person.avatarUrl} alt="" />
                  ) : (
                    person.displayName.slice(0, 1).toUpperCase()
                  )}
                </span>
              ))}
              {friendsAttending.length > 3 && (
                <span className="events-grid-card-avatars-more">
                  +{friendsAttending.length - 3}
                </span>
              )}
            </div>
          ) : (
            <span />
          )}
          {attendeeCount > 0 && (
            <span className="events-grid-card-hotness">🔥 {attendeeCount}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// Connected "Carte" page's floating card (Phase 4.13) - a small, real
// summary of whichever single pin was clicked, not the full EventDetails
// panel. attendeeCount is real (batched /events/engagement, single id here)
// and only shown once it's actually loaded for this exact selection - no
// placeholder/guessed number while in flight.
function MapSelectionCard({
  selection,
  attendeeCount,
  onClose,
  onOpenEvent,
  locale
}: {
  selection:
    | { kind: 'event'; event: PublicEvent }
    | { kind: 'venue'; group: VenueGroup };
  attendeeCount: number | undefined;
  onClose: () => void;
  onOpenEvent: (eventId: string) => void;
  locale: SupportedLocale;
}) {
  if (selection.kind === 'event') {
    const { event } = selection;
    const start = new Date(event.startsAt);
    const isToday = start.toDateString() === new Date().toDateString();
    const whenLabel = isToday
      ? "Aujourd'hui"
      : start.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
    return (
      <div className="map-selection-card">
        <div
          className="map-selection-card-media"
          style={
            event.imageUrl
              ? {
                  backgroundImage: `url(${event.imageUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }
              : undefined
          }
        >
          {!event.imageUrl && <EventImageFallback category={event.category} />}
          <span className="map-selection-card-when">
            {whenLabel} ·{' '}
            {start.toLocaleTimeString('fr-CA', {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
          <button
            type="button"
            className="map-selection-card-close"
            onClick={onClose}
            aria-label={translate(locale, 'preview.close')}
          >
            ✕
          </button>
        </div>
        <div className="map-selection-card-body">
          <h3>{event.title}</h3>
          <p className="map-selection-card-venue">
            📍 {event.venue.name} · {event.venue.address}
          </p>
          <div className="map-selection-card-footer">
            <span
              className="map-selection-card-tag"
              style={{
                background:
                  CATEGORY_COLORS[event.category] ?? CATEGORY_COLORS['other']
              }}
            >
              {SHORT_CATEGORY_LABELS[locale][event.category]}
            </span>
            {attendeeCount !== undefined && attendeeCount > 0 && (
              <span className="map-selection-card-count">
                🔥 +{attendeeCount} intéressé{attendeeCount > 1 ? 's' : ''}
              </span>
            )}
            <button
              type="button"
              className="primary-action-btn map-selection-card-cta"
              onClick={() => onOpenEvent(event.id)}
            >
              {translate(locale, 'preview.details')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { group } = selection;
  const nextEvent = [...group.events].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  )[0];
  return (
    <div className="map-selection-card">
      <div
        className="map-selection-card-media"
        style={
          group.imageUrl
            ? {
                backgroundImage: `url(${group.imageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }
            : undefined
        }
      >
        {!group.imageUrl && (
          <EventImageFallback category={group.categories[0] ?? 'other'} />
        )}
        {group.venueCategory && (
          <span className="map-selection-card-when">
            {VENUE_CATEGORY_LABELS[locale][group.venueCategory]}
          </span>
        )}
        <button
          type="button"
          className="map-selection-card-close"
          onClick={onClose}
          aria-label={translate(locale, 'preview.close')}
        >
          ✕
        </button>
      </div>
      <div className="map-selection-card-body">
        <h3>{group.name}</h3>
        <p className="map-selection-card-venue">📍 {group.address}</p>
        <div className="map-selection-card-footer">
          {group.priceTier && (
            <span className="map-selection-card-tag map-selection-card-tag-price">
              {group.priceTier}
            </span>
          )}
          <span className="map-selection-card-count">
            {group.events.length > 0
              ? `${group.events.length} événement${group.events.length > 1 ? 's' : ''} à venir`
              : 'Aucun événement à venir'}
          </span>
          {nextEvent && (
            <button
              type="button"
              className="primary-action-btn map-selection-card-cta"
              onClick={() => onOpenEvent(nextEvent.id)}
            >
              {translate(locale, 'preview.details')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Top filter pills (Phase 4.16) shared by the hero's "Voir ce soir" shortcut,
// the pill row and the rail's "Catégories populaires" - real category
// taxonomy and a real "tonight" date check only, no invented sub-genres.
type DashboardFilter = 'all' | 'tonight' | 'free' | EventCategory;

function isEventTonight(event: PublicEvent): boolean {
  const toMontrealDateKey = (iso: string) =>
    new Date(iso).toLocaleDateString('en-CA', {
      timeZone: 'America/Toronto'
    });
  return (
    toMontrealDateKey(event.startsAt) ===
    toMontrealDateKey(new Date().toISOString())
  );
}

// Landing view for connected users (Phase 4.4, reworked Phase 4.16) - reuses
// the same nearby-events data already computed for the anonymous carousel
// and the same active-forums signal as the dedicated "Forums" page, rather
// than building a second data source for what is the same information.
function DashboardHome({
  user,
  carouselEvents,
  carouselEmpty,
  favorites,
  onToggleFavorite,
  onOpenDetails,
  locale,
  authToken,
  onNavigate
}: {
  user: User;
  carouselEvents: PublicEvent[];
  carouselEmpty: boolean;
  favorites: string[];
  onToggleFavorite: (eventId: string) => void;
  onOpenDetails: (
    eventId: string,
    options?: { forumEventFirst?: boolean }
  ) => void;
  locale: SupportedLocale;
  authToken: string | undefined;
  onNavigate: (section: ConnectedSection) => void;
}) {
  const { forums, state: forumsState } = useActiveForums(authToken);
  const { trends } = useTrends(authToken);
  const [activeFilter, setActiveFilter] = useState<DashboardFilter>('all');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [friendCode, setFriendCode] = useState<string>();
  const newCarouselRef = useRef<HTMLDivElement>(null);
  const nearbyCarouselRef = useRef<HTMLDivElement>(null);

  // "Invite tes amis" (Phase 4.16) - same real friend-code mechanism as the
  // persistent sidebar widget and the Amis page, i.e. inviting someone onto
  // Pulso itself, never a per-event share (that flow already exists
  // separately as EventHero/GroupModal's "Envoyer à un ami").
  useEffect(() => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/me/friend-code`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) =>
        setFriendCode(friendCodeResponseSchema.parse(json).data.friendCode)
      )
      .catch(() => {});
  }, [authToken]);

  // "Nouveautés" (Phase 4.14) - real recency (source.observedAt, same 72h
  // threshold as Événements' own "Nouveaux événements" widget) combined
  // with the account's own real favorite categories when it has any
  // (useTrends - never an inferred/ML recommendation). A citywide fetch,
  // not carouselEvents above (that one is scoped to the map viewport/
  // nearby radius, too narrow a pool for "what's new in Montréal"). Also
  // doubles as the pool for "Ce soir à Montréal" and the top filter pills
  // (Phase 4.16) rather than adding further citywide fetches to this page.
  const [recentEvents, setRecentEvents] = useState<PublicEvent[]>([]);
  useEffect(() => {
    fetch(
      `${API_BASE_URL}/events?${buildMapEventsQuery(INITIAL_BOUNDS, { date: 'next7', categories: [], price: 'all' })}`
    )
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => setRecentEvents(eventListResponseSchema.parse(json).data))
      .catch(() => {});
  }, []);

  // "Recommandé pour vous" (Phase 4.16) - real attendee counts (same
  // /events/engagement endpoint as Événements' "Les plus populaires"), never
  // an inferred/ML pick.
  const engagementIdsKey = Array.from(
    new Set([...recentEvents, ...carouselEvents].map((event) => event.id))
  )
    .slice(0, 100)
    .join(',');
  const [engagement, setEngagement] = useState<
    Map<string, EventEngagementEntry>
  >(new Map());
  useEffect(() => {
    if (!engagementIdsKey) {
      setEngagement(new Map());
      return;
    }
    const headers: Record<string, string> = {};
    if (authToken) headers.authorization = `Bearer ${authToken}`;
    fetch(`${API_BASE_URL}/events/engagement?ids=${engagementIdsKey}`, {
      headers
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        const data = eventEngagementResponseSchema.parse(json).data;
        setEngagement(new Map(data.map((entry) => [entry.eventId, entry])));
      })
      .catch(() => {});
  }, [engagementIdsKey, authToken]);

  const favoriteEventCategories = new Set(
    trends?.eventCategories.map((entry) => entry.category) ?? []
  );

  const matchesFilter = (event: PublicEvent) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'tonight') return isEventTonight(event);
    if (activeFilter === 'free') return event.price.kind === 'free';
    return event.category === activeFilter;
  };

  const newEvents = recentEvents
    .filter(
      (event) =>
        Date.now() - new Date(event.source.observedAt).getTime() <
        NEW_EVENT_WINDOW_MS
    )
    .filter(matchesFilter)
    .sort((a, b) => {
      if (favoriteEventCategories.size > 0) {
        const aMatch = favoriteEventCategories.has(a.category) ? 1 : 0;
        const bMatch = favoriteEventCategories.has(b.category) ? 1 : 0;
        if (aMatch !== bMatch) return bMatch - aMatch;
      }
      return (
        new Date(b.source.observedAt).getTime() -
        new Date(a.source.observedAt).getTime()
      );
    })
    .slice(0, 8);
  const newEventsPersonalized =
    favoriteEventCategories.size > 0 &&
    newEvents.some((event) => favoriteEventCategories.has(event.category));

  const nearbyEvents = carouselEvents.filter(matchesFilter).slice(0, 10);

  const tonightEvents = recentEvents
    .filter(isEventTonight)
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )
    .slice(0, 5);

  const recommendedPool = Array.from(
    new Map(
      [...recentEvents, ...carouselEvents].map((event) => [event.id, event])
    ).values()
  ).filter((event) => (engagement.get(event.id)?.attendeeCount ?? 0) > 0);
  const recommendedFavorites =
    favoriteEventCategories.size > 0
      ? recommendedPool.filter((event) =>
          favoriteEventCategories.has(event.category)
        )
      : [];
  const recommended = (
    recommendedFavorites.length > 0 ? recommendedFavorites : recommendedPool
  )
    .sort(
      (a, b) =>
        (engagement.get(b.id)?.attendeeCount ?? 0) -
        (engagement.get(a.id)?.attendeeCount ?? 0)
    )
    .slice(0, 3);
  const recommendedPersonalized = recommendedFavorites.length > 0;

  return (
    <div className="dashboard-home-page">
      <div className="dashboard-home">
        <div className="dashboard-home-hero">
          <p className="dashboard-home-hero-kicker">
            Bonjour {user.displayName.split(' ')[0]}
          </p>
          <h1>Montréal, maintenant.</h1>
          <p className="dashboard-home-hero-subtitle">
            Les sorties, les lieux et les communautés qui font vibrer la ville.
          </p>
          <div className="dashboard-home-hero-actions">
            <button
              type="button"
              className="dashboard-home-hero-primary"
              onClick={() => onNavigate('explorer')}
            >
              <ViewModeIcon kind="map" />
              Explorer la carte
            </button>
            <button
              type="button"
              className={`dashboard-home-hero-btn ${activeFilter === 'tonight' ? 'active' : ''}`}
              onClick={() =>
                setActiveFilter((current) =>
                  current === 'tonight' ? 'all' : 'tonight'
                )
              }
            >
              <span aria-hidden="true">◐</span>
              Voir ce soir
            </button>
          </div>
        </div>

        <div className="dashboard-home-filter-bar">
          <span className="dashboard-home-filter-label">
            Explorer par envie
          </span>
          <div className="events-category-chips dashboard-home-filters">
            <button
              type="button"
              className={activeFilter === 'all' ? 'active' : ''}
              onClick={() => setActiveFilter('all')}
            >
              Tout voir
            </button>
            <button
              type="button"
              className={activeFilter === 'tonight' ? 'active' : ''}
              onClick={() => setActiveFilter('tonight')}
              style={{ '--event-chip-color': '#d65cff' } as CSSProperties}
            >
              <span className="events-category-dot" aria-hidden="true" />
              Ce soir
            </button>
            {EVENT_CATEGORIES.map((cat) => (
              <button
                type="button"
                key={cat}
                className={activeFilter === cat ? 'active' : ''}
                onClick={() => setActiveFilter(cat)}
                style={
                  {
                    '--event-chip-color':
                      CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.other
                  } as CSSProperties
                }
              >
                <span className="events-category-dot" aria-hidden="true" />
                {SHORT_CATEGORY_LABELS[locale][cat]}
              </button>
            ))}
            <button
              type="button"
              className={`events-free-chip ${activeFilter === 'free' ? 'active' : ''}`}
              onClick={() => setActiveFilter('free')}
            >
              <span className="events-category-dot" aria-hidden="true" />
              Gratuit
            </button>
          </div>
        </div>

        {newEvents.length > 0 && (
          <div className="dashboard-home-section">
            <div className="section-header dashboard-home-section-header">
              <div>
                <span className="dashboard-home-section-kicker">
                  Fraîchement ajouté
                </span>
                <h2>Nouveautés</h2>
              </div>
              <span className="dashboard-home-section-subtitle">
                {newEventsPersonalized
                  ? 'Ajoutés récemment, dans tes catégories favorites'
                  : 'Ajoutés récemment à Montréal'}
              </span>
            </div>
            <div className="event-carousel-wrap">
              <div className="event-carousel" ref={newCarouselRef}>
                {newEvents.map((evt) => (
                  <DashboardEventCard
                    key={evt.id}
                    evt={evt}
                    locale={locale}
                    isFavorite={favorites.includes(evt.id)}
                    onToggleFavorite={() => onToggleFavorite(evt.id)}
                    onOpen={() => onOpenDetails(evt.id)}
                    isNew
                  />
                ))}
              </div>
              {newEvents.length > 3 && (
                <>
                  <button
                    type="button"
                    className="event-carousel-arrow event-carousel-arrow-prev"
                    onClick={() =>
                      newCarouselRef.current?.scrollBy({
                        left: -320,
                        behavior: 'smooth'
                      })
                    }
                    aria-label="Précédent"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="event-carousel-arrow event-carousel-arrow-next"
                    onClick={() =>
                      newCarouselRef.current?.scrollBy({
                        left: 320,
                        behavior: 'smooth'
                      })
                    }
                    aria-label="Suivant"
                  >
                    ›
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="dashboard-home-section">
          <div className="section-header dashboard-home-section-header">
            <div>
              <span className="dashboard-home-section-kicker">À proximité</span>
              <h2>Autour de vous</h2>
            </div>
            <button
              type="button"
              className="view-all"
              onClick={() => onNavigate('evenement')}
            >
              Voir tous les événements
            </button>
          </div>
          <div className="event-carousel-wrap">
            <div className="event-carousel" ref={nearbyCarouselRef}>
              {nearbyEvents.map((evt) => (
                <DashboardEventCard
                  key={evt.id}
                  evt={evt}
                  locale={locale}
                  isFavorite={favorites.includes(evt.id)}
                  onToggleFavorite={() => onToggleFavorite(evt.id)}
                  onOpen={() => onOpenDetails(evt.id)}
                />
              ))}
              {nearbyEvents.length === 0 && (
                <p>
                  {carouselEmpty
                    ? 'Aucun événement trouvé.'
                    : 'Aucun événement ne correspond à ce filtre.'}
                </p>
              )}
            </div>
            {nearbyEvents.length > 3 && (
              <>
                <button
                  type="button"
                  className="event-carousel-arrow event-carousel-arrow-prev"
                  onClick={() =>
                    nearbyCarouselRef.current?.scrollBy({
                      left: -320,
                      behavior: 'smooth'
                    })
                  }
                  aria-label="Précédent"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="event-carousel-arrow event-carousel-arrow-next"
                  onClick={() =>
                    nearbyCarouselRef.current?.scrollBy({
                      left: 320,
                      behavior: 'smooth'
                    })
                  }
                  aria-label="Suivant"
                >
                  ›
                </button>
              </>
            )}
          </div>
        </div>

        <div className="dashboard-home-section">
          <div className="section-header dashboard-home-section-header">
            <div>
              <span className="dashboard-home-section-kicker">
                La communauté échange
              </span>
              <h2>Forums actifs</h2>
            </div>
            <button
              type="button"
              className="view-all"
              onClick={() => onNavigate('forums')}
            >
              Voir tous les forums
            </button>
          </div>
          {forumsState === 'loading' && (
            <p className="list-view-empty">Chargement…</p>
          )}
          {forumsState === 'success' && forums.length === 0 && (
            <p className="list-view-empty">
              Aucune activité récente dans vos forums. Ajoutez des favoris ou
              marquez votre participation à un événement pour en voir apparaître
              ici.
            </p>
          )}
          <div className="active-forums-list">
            {forums.slice(0, 5).map((forum) => (
              <button
                type="button"
                className="active-forum-row"
                key={`${forum.eventId}-${forum.category}`}
                onClick={() =>
                  onOpenDetails(forum.eventId, { forumEventFirst: false })
                }
              >
                <span className="active-forum-row-title">
                  {forum.eventTitle}
                </span>
                <span className="active-forum-row-excerpt">
                  {forum.lastPostExcerpt}
                </span>
                <span className="active-forum-row-meta">
                  {FORUM_CATEGORY_LABELS[forum.category]} · {forum.postCount}{' '}
                  message
                  {forum.postCount !== 1 ? 's' : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <aside className="dashboard-home-rail">
        <div className="dashboard-home-rail-heading">
          <span>À Montréal</span>
          <h2>Ce soir</h2>
        </div>
        <div className="events-trends-section">
          <div className="section-header">
            <h3>À l'affiche</h3>
            <button
              type="button"
              className="view-all"
              onClick={() => setActiveFilter('tonight')}
            >
              Voir tout
            </button>
          </div>
          {tonightEvents.length === 0 ? (
            <p className="list-view-empty">
              Rien de programmé ce soir pour l'instant.
            </p>
          ) : (
            <ul className="events-trends-list">
              {tonightEvents.map((event) => (
                <li key={event.id}>
                  <button type="button" onClick={() => onOpenDetails(event.id)}>
                    <span className="events-trends-thumb">
                      {event.imageUrl ? (
                        <img src={event.imageUrl} alt="" />
                      ) : (
                        <EventImageFallback category={event.category} />
                      )}
                    </span>
                    <span className="events-trends-info">
                      <strong>{event.title}</strong>
                      <span>
                        {formatEventTimeRange(event.startsAt, event.endsAt)} ·{' '}
                        {event.venue?.name}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="events-trends-section">
          <h3>Catégories populaires</h3>
          <div className="events-category-chips dashboard-home-rail-chips">
            {EVENT_CATEGORIES.map((cat) => {
              const color = CATEGORY_COLORS[cat];
              const active = activeFilter === cat;
              return (
                <button
                  type="button"
                  key={cat}
                  className={active ? 'active' : ''}
                  style={
                    active
                      ? {
                          background: `${color}33`,
                          borderColor: color,
                          color: '#fff'
                        }
                      : {
                          background: `${color}14`,
                          borderColor: `${color}40`,
                          color: 'var(--text-secondary)'
                        }
                  }
                  onClick={() =>
                    setActiveFilter((current) =>
                      current === cat ? 'all' : cat
                    )
                  }
                >
                  <span
                    className="dashboard-home-category-dot"
                    style={{ background: color, boxShadow: `0 0 6px ${color}` }}
                    aria-hidden="true"
                  />
                  {SHORT_CATEGORY_LABELS[locale][cat]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="dashboard-invite-card">
          <strong>Invite tes amis</strong>
          <p>Plus on est de Pulso, plus on découvre.</p>
          <button
            type="button"
            className="dashboard-invite-card-btn"
            onClick={() => setInviteOpen(true)}
          >
            Inviter des amis
          </button>
        </div>

        {recommended.length > 0 && (
          <div className="events-trends-section">
            <div className="section-header">
              <h3>Recommandé pour vous</h3>
              <button
                type="button"
                className="view-all"
                onClick={() => onNavigate('evenement')}
              >
                Voir tout
              </button>
            </div>
            <span className="dashboard-home-section-subtitle">
              {recommendedPersonalized
                ? 'Populaire dans tes catégories favorites'
                : 'Événements populaires en ce moment'}
            </span>
            <ul className="events-trends-list">
              {recommended.map((event) => (
                <li key={event.id}>
                  <button type="button" onClick={() => onOpenDetails(event.id)}>
                    <span className="events-trends-thumb">
                      {event.imageUrl ? (
                        <img src={event.imageUrl} alt="" />
                      ) : (
                        <EventImageFallback category={event.category} />
                      )}
                    </span>
                    <span className="events-trends-info">
                      <strong>{event.title}</strong>
                      <span>{event.venue?.name}</span>
                    </span>
                    <span className="events-trends-hotness">
                      🔥 {engagement.get(event.id)?.attendeeCount}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      {inviteOpen && (
        <InviteFriendModal
          friendCode={friendCode}
          authToken={authToken}
          onSent={() => setInviteOpen(false)}
          onClose={() => setInviteOpen(false)}
        />
      )}
    </div>
  );
}

function DashboardEventCard({
  evt,
  locale,
  isFavorite,
  onToggleFavorite,
  onOpen,
  isNew
}: {
  evt: PublicEvent;
  locale: SupportedLocale;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
  isNew?: boolean;
}) {
  const dateBadge = formatEventDateBadge(evt.startsAt);
  const priceLabel = formatEventPrice(evt.price);
  return (
    <div
      className="event-card dashboard-event-card"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div
        className="event-card-img"
        style={
          evt.imageUrl
            ? {
                backgroundImage: `url(${evt.imageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }
            : undefined
        }
      >
        {!evt.imageUrl && <EventImageFallback category={evt.category} />}
        <span className="dashboard-event-card-date">
          <strong>{dateBadge.day}</strong>
          {dateBadge.month}
        </span>
        <div
          className="card-badge"
          style={{
            background:
              CATEGORY_COLORS[evt.category] ?? CATEGORY_COLORS['other']
          }}
        >
          {SHORT_CATEGORY_LABELS[locale][evt.category]}
        </div>
        {isNew && <span className="dashboard-home-new-badge">NOUVEAU</span>}
        <button
          type="button"
          className="card-fav"
          aria-label={
            isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'
          }
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            onToggleFavorite();
          }}
        >
          <HeartIcon filled={isFavorite} />
        </button>
      </div>
      <div className="event-card-content">
        <h3>{evt.title}</h3>
        <p className="dashboard-event-card-meta">
          <span aria-hidden="true">⌖</span>
          {evt.venue?.name}
        </p>
        <div className="dashboard-event-card-footer">
          <span>
            <span aria-hidden="true">◷</span>{' '}
            {formatEventTimeRange(evt.startsAt, evt.endsAt)}
          </span>
          {priceLabel && (
            <strong className={evt.price.kind === 'free' ? 'free' : ''}>
              {priceLabel}
            </strong>
          )}
        </div>
      </div>
    </div>
  );
}

// Full-page version of the "Forums actifs" widget above - same data (Sidebar
// "Forums" nav item), just without the top-5 cap.
type ForumDiscoverFilter = 'mine' | 'popular' | EventCategory;

// Forums discovery grid (Phase 4.8) - every upcoming event is a forum entry
// point, not just the caller's own favorited/attended ones - except for the
// "mine" filter itself, which reuses that narrower scope (same idea as the
// "Forums actifs" DashboardHome widget/useActiveForums above, just as a
// filter chip here instead of a separate page).
function useDiscoverForums(
  authToken: string | undefined,
  filter: ForumDiscoverFilter
) {
  const [entries, setEntries] = useState<DiscoverForumEntry[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );

  useEffect(() => {
    if (!authToken) return;
    setState('loading');
    const params = new URLSearchParams();
    if (filter === 'mine') params.set('scope', 'mine');
    else if (filter === 'popular') params.set('sort', 'popular');
    else params.set('category', filter);
    fetch(`${API_BASE_URL}/me/forums/discover?${params.toString()}`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setEntries(discoverForumsResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken, filter]);

  return { entries, state };
}

function ForumDiscoverCard({
  entry,
  locale,
  onOpen
}: {
  entry: DiscoverForumEntry;
  locale: SupportedLocale;
  onOpen: () => void;
}) {
  const { event, memberCount, postCount, lastPostAt, lastPostExcerpt } = entry;
  const dateBadge = formatEventDateBadge(event.startsAt);
  return (
    <button
      type="button"
      className="forum-discover-card"
      onClick={onOpen}
      aria-label={`Ouvrir le forum de ${event.title}`}
    >
      <div
        className="forum-discover-card-cover"
        style={
          event.imageUrl
            ? {
                backgroundImage: `url(${event.imageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }
            : undefined
        }
      >
        {!event.imageUrl && <EventImageFallback category={event.category} />}
        <span
          className="forum-discover-date"
          aria-label={formatForumEventDayLabel(event.startsAt)}
        >
          <strong>{dateBadge.day}</strong>
          <span>{dateBadge.month}</span>
        </span>
        <div
          className="card-badge"
          style={{
            background:
              CATEGORY_COLORS[event.category] ?? CATEGORY_COLORS['other']
          }}
        >
          {SHORT_CATEGORY_LABELS[locale][event.category]}
        </div>
        <span
          className={`forum-discover-activity ${postCount > 0 ? 'active' : ''}`}
        >
          <span aria-hidden="true" />
          {postCount > 0 ? 'Discussion active' : 'À lancer'}
        </span>
      </div>
      <div className="forum-discover-card-body">
        <span className="forum-discover-card-kicker">
          {formatForumEventDayLabel(event.startsAt)} ·{' '}
          {formatEventTimeRange(event.startsAt, event.endsAt)}
        </span>
        <strong className="forum-discover-card-title">{event.title}</strong>
        <span className="forum-discover-card-venue">
          <span aria-hidden="true">●</span>
          {event.venue.name}
        </span>
        <span className="forum-discover-card-members">
          <span>
            {postCount} message{postCount !== 1 ? 's' : ''}
          </span>
          <span>
            {memberCount} participant{memberCount !== 1 ? 's' : ''}
          </span>
        </span>
        {lastPostExcerpt ? (
          <span className="forum-discover-card-last">
            <span className="forum-discover-quote" aria-hidden="true">
              “
            </span>
            <span>
              {lastPostExcerpt}
              {lastPostAt ? (
                <small>{formatRelativeTime(lastPostAt)}</small>
              ) : null}
            </span>
          </span>
        ) : (
          <span className="forum-discover-card-last forum-discover-card-empty">
            Lance la première discussion pour cet événement.
          </span>
        )}
        <span className="forum-discover-card-cta">
          Voir la discussion <span aria-hidden="true">→</span>
        </span>
      </div>
    </button>
  );
}

function ForumDiscoverSpotlight({
  entry,
  locale,
  onOpen
}: {
  entry: DiscoverForumEntry;
  locale: SupportedLocale;
  onOpen: () => void;
}) {
  const { event, postCount, memberCount, lastPostAt, lastPostExcerpt } = entry;
  return (
    <button
      type="button"
      className="forum-discover-spotlight"
      onClick={onOpen}
      aria-label={`Ouvrir la discussion mise en avant pour ${event.title}`}
    >
      <span
        className="forum-discover-spotlight-cover"
        style={
          event.imageUrl
            ? {
                backgroundImage: `url(${event.imageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }
            : undefined
        }
      >
        {!event.imageUrl && <EventImageFallback category={event.category} />}
        <span className="forum-discover-spotlight-shade" />
        <span
          className="forum-discover-spotlight-category"
          style={
            {
              '--forum-accent':
                CATEGORY_COLORS[event.category] ?? CATEGORY_COLORS.other
            } as CSSProperties
          }
        >
          {SHORT_CATEGORY_LABELS[locale][event.category]}
        </span>
      </span>
      <span className="forum-discover-spotlight-content">
        <span className="forum-discover-section-eyebrow">
          Discussion à découvrir
        </span>
        <strong>{event.title}</strong>
        <span className="forum-discover-spotlight-meta">
          {formatForumEventDayLabel(event.startsAt)} ·{' '}
          {formatEventTimeRange(event.startsAt, event.endsAt)} ·{' '}
          {event.venue.name}
        </span>
        <span className="forum-discover-spotlight-excerpt">
          {lastPostExcerpt ??
            'La conversation est ouverte. Sois la première personne à lancer le sujet.'}
        </span>
        <span className="forum-discover-spotlight-footer">
          <span>
            <b>{postCount}</b> message{postCount !== 1 ? 's' : ''}
          </span>
          <span>
            <b>{memberCount}</b> participant{memberCount !== 1 ? 's' : ''}
          </span>
          {lastPostAt && <span>{formatRelativeTime(lastPostAt)}</span>}
          <span className="forum-discover-spotlight-cta">
            Entrer dans la discussion <span aria-hidden="true">→</span>
          </span>
        </span>
      </span>
    </button>
  );
}

function ActiveForumsPage({
  authToken,
  onOpenDetails,
  locale
}: {
  authToken: string | undefined;
  onOpenDetails: (eventId: string, knownEvent: PublicEvent) => void;
  locale: SupportedLocale;
}) {
  const [filter, setFilter] = useState<ForumDiscoverFilter>('mine');
  const { entries, state } = useDiscoverForums(authToken, filter);
  const featuredEntry = entries[0];
  const remainingEntries = featuredEntry ? entries.slice(1) : [];
  const totalMessages = entries.reduce(
    (sum, entry) => sum + entry.postCount,
    0
  );
  const activeForumCount = entries.filter(
    (entry) => entry.postCount > 0
  ).length;

  return (
    <div className="dashboard-home forum-discover-page">
      <section className="forum-discover-hero">
        <div className="forum-discover-hero-copy">
          <span className="forum-discover-hero-eyebrow">
            La communauté Pulso · Montréal
          </span>
          <h1>Les discussions qui donnent envie de sortir.</h1>
          <p>
            Trouve avec qui y aller, échange les bons plans et retrouve les
            personnes qui font vivre chaque événement.
          </p>
          <a href="#forum-list" className="forum-discover-hero-cta">
            Explorer les discussions <span aria-hidden="true">↓</span>
          </a>
        </div>
        <div
          className="forum-discover-hero-community"
          aria-label="Salons disponibles"
        >
          <span className="forum-discover-orbit forum-discover-orbit-main">
            <b>Forum</b>
            <small>par événement</small>
          </span>
          <span className="forum-discover-orbit room-general">Discussion</span>
          <span className="forum-discover-orbit room-partners">
            Sortir ensemble
          </span>
          <span className="forum-discover-orbit room-tickets">Billets</span>
          <span className="forum-discover-orbit room-find">Se retrouver</span>
        </div>
        <div className="forum-discover-hero-stats">
          <span>
            <b>{entries.length}</b>
            événements
          </span>
          <span>
            <b>{totalMessages}</b>
            messages
          </span>
          <span>
            <b>{activeForumCount}</b>
            forums actifs
          </span>
        </div>
      </section>

      <section className="forum-discover-browser" id="forum-list">
        <div className="forum-discover-browser-heading">
          <div>
            <span className="forum-discover-section-eyebrow">
              À toi de choisir
            </span>
            <h2>Explore les forums</h2>
          </div>
          <p>Une discussion dédiée à chaque événement à venir.</p>
        </div>
        <div className="forum-discover-filters" aria-label="Filtrer les forums">
          <button
            type="button"
            className={filter === 'mine' ? 'active' : ''}
            onClick={() => setFilter('mine')}
            aria-pressed={filter === 'mine'}
          >
            Mes forums
          </button>
          <button
            type="button"
            className={filter === 'popular' ? 'active' : ''}
            onClick={() => setFilter('popular')}
            aria-pressed={filter === 'popular'}
          >
            Les plus actifs
          </button>
          {EVENT_CATEGORIES.filter((category) => category !== 'other').map(
            (category) => (
              <button
                type="button"
                key={category}
                className={filter === category ? 'active' : ''}
                onClick={() => setFilter(category)}
                aria-pressed={filter === category}
              >
                {SHORT_CATEGORY_LABELS[locale][category]}
              </button>
            )
          )}
        </div>
      </section>
      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'error' && (
        <p className="list-view-empty">
          Impossible de charger les forums pour le moment.
        </p>
      )}
      {state === 'success' && entries.length === 0 && filter === 'mine' && (
        <p className="list-view-empty">
          Aucun forum pour l'instant. Ajoute des favoris ou marque ta
          participation à un événement pour en voir apparaître ici.
        </p>
      )}
      {state === 'success' && entries.length === 0 && filter !== 'mine' && (
        <p className="list-view-empty">
          Aucun événement à venir pour le moment.
        </p>
      )}
      {state === 'success' && featuredEntry && (
        <ForumDiscoverSpotlight
          entry={featuredEntry}
          locale={locale}
          onOpen={() =>
            onOpenDetails(featuredEntry.event.id, featuredEntry.event)
          }
        />
      )}
      <div className="forum-discover-grid">
        {remainingEntries.map((entry) => (
          <ForumDiscoverCard
            key={entry.event.id}
            entry={entry}
            locale={locale}
            onOpen={() => onOpenDetails(entry.event.id, entry.event)}
          />
        ))}
      </div>
    </div>
  );
}

// Full-page home for "Groupes" (Sidebar nav item), redesigned (Phase 4.10
// follow-up) as a real split view instead of a list that pops a modal:
// the same list+sub-tabs already built for Messages' Groupes tab on the
// left, GroupDetailContent as a genuine inline panel on the right - no
// GroupModal here. GroupsBlock (still a modal) stays as-is for the
// narrower contexts that still use it (sidebar mini-list, Profil tab).
function GroupsPage({
  authToken,
  userId,
  onOpenEventForum
}: {
  authToken: string | undefined;
  userId: string;
  onOpenEventForum: (eventId: string) => void;
}) {
  const [selectedGroup, setSelectedGroup] = useState<Group>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<GroupVisibility>('open');
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [listVersion, setListVersion] = useState(0);

  const createGroup = () => {
    if (!authToken || !name.trim() || creating) return;
    setCreating(true);
    fetch(`${API_BASE_URL}/me/groups`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        name: name.trim(),
        visibility,
        ...(description.trim() ? { description: description.trim() } : {})
      })
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setName('');
        setDescription('');
        setVisibility('open');
        setCreateOpen(false);
        setListVersion((version) => version + 1);
        setSelectedGroup(groupResponseSchema.parse(json).data);
      })
      .catch(() => {})
      .finally(() => setCreating(false));
  };

  return (
    <div className="messages-page groups-page">
      <div className="messages-list-column groups-directory-column">
        <header className="groups-page-header">
          <div>
            <span className="groups-page-eyebrow">Communautés Pulso</span>
            <h1>Groupes</h1>
            <p>Des espaces conçus pour passer de l’idée à la sortie.</p>
          </div>
          <button
            type="button"
            className={`groups-create-trigger ${createOpen ? 'active' : ''}`}
            onClick={() => setCreateOpen((open) => !open)}
            aria-expanded={createOpen}
          >
            <span aria-hidden="true">+</span>
            Créer
          </button>
        </header>
        {createOpen && (
          <form
            className="groups-create-form"
            onSubmit={(event) => {
              event.preventDefault();
              createGroup();
            }}
          >
            <div className="groups-create-form-heading">
              <div>
                <span className="groups-page-eyebrow">Nouveau groupe</span>
                <strong>Crée ton espace d’organisation</strong>
              </div>
              <button
                type="button"
                className="text-btn"
                onClick={() => setCreateOpen(false)}
              >
                Fermer
              </button>
            </div>
            <label className="groups-create-field">
              <span>Nom du groupe</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex. Français à Montréal"
                maxLength={80}
                autoFocus
              />
            </label>
            <label className="groups-create-field">
              <span>Mission du groupe</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="À qui s’adresse le groupe et comment souhaitez-vous organiser les sorties ?"
                maxLength={500}
                rows={3}
              />
              <small>{description.length}/500</small>
            </label>
            <fieldset className="groups-visibility-choice">
              <legend>Comment peut-on rejoindre ?</legend>
              <label className={visibility === 'open' ? 'active' : ''}>
                <input
                  type="radio"
                  name="group-visibility"
                  checked={visibility === 'open'}
                  onChange={() => setVisibility('open')}
                />
                <span className="groups-visibility-icon" aria-hidden="true">
                  ◎
                </span>
                <span>
                  <strong>Accès libre</strong>
                  <small>Visible et accessible immédiatement.</small>
                </span>
              </label>
              <label className={visibility === 'restricted' ? 'active' : ''}>
                <input
                  type="radio"
                  name="group-visibility"
                  checked={visibility === 'restricted'}
                  onChange={() => setVisibility('restricted')}
                />
                <span className="groups-visibility-icon" aria-hidden="true">
                  ◇
                </span>
                <span>
                  <strong>Sur demande</strong>
                  <small>
                    Visible, mais chaque entrée doit être approuvée.
                  </small>
                </span>
              </label>
            </fieldset>
            <button
              type="submit"
              className="groups-create-submit"
              disabled={creating || !name.trim()}
            >
              {creating ? 'Création…' : 'Créer le groupe'}
            </button>
          </form>
        )}
        <MessagesGroupsTab
          key={listVersion}
          authToken={authToken}
          selectedGroupId={selectedGroup?.id}
          onSelectGroup={setSelectedGroup}
        />
      </div>

      <div className="messages-conversation-column groups-workspace-column">
        {selectedGroup ? (
          <GroupDetailContent
            group={selectedGroup}
            authToken={authToken}
            userId={userId}
            onGroupUpdated={setSelectedGroup}
            onLeave={() => setSelectedGroup(undefined)}
            onOpenEventForum={onOpenEventForum}
          />
        ) : (
          <div className="groups-workspace-empty">
            <div className="groups-workspace-empty-copy">
              <span className="groups-page-eyebrow">Ton espace collectif</span>
              <h2>Organiser une sortie ne devrait jamais être compliqué.</h2>
              <p>
                Ouvre un groupe pour retrouver au même endroit les décisions, le
                programme, les présences, les tâches et la discussion.
              </p>
              <button
                type="button"
                className="groups-create-submit"
                onClick={() => setCreateOpen(true)}
              >
                Créer mon premier groupe
              </button>
            </div>
            <div
              className="groups-workspace-modules"
              aria-label="Modules disponibles"
            >
              <span>
                <b>01</b> Programme partagé
              </span>
              <span>
                <b>02</b> Présences réelles
              </span>
              <span>
                <b>03</b> Checklist collective
              </span>
              <span>
                <b>04</b> Discussion du groupe
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Full-page conversations list (Phase 4.5) - one row per accepted friend
// (GET /me/conversations), opening the same ConversationModal built for
// the per-friend "Message" button in FriendsBlock, unmodified.
type MessagesTab = 'discussions' | 'demandes' | 'groupes';

// Redesigned to match the reference mockup: a persistent split view
// (conversation list + selected conversation inline, not a modal) with
// Discussions/Demandes/Groupes tabs, search, and a compose button. Every
// number/timestamp/checkmark shown is real, already-existing data
// (unreadCount, message.readAt, memberCount, pending friend requests) -
// no online-presence dot, no call icons, no location-sharing message
// type: none of those are real capabilities Pulso has today, so they're
// left out rather than faked (same principle applied to Forums' "membres
// en ligne" earlier).
function MessagesPage({
  authToken,
  user,
  onOpenEventForum
}: {
  authToken: string | undefined;
  user: User;
  onOpenEventForum: (eventId: string) => void;
}) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [tab, setTab] = useState<MessagesTab>('discussions');
  const [query, setQuery] = useState('');
  const [selectedFriend, setSelectedFriend] = useState<PublicUser>();
  const [selectedGroup, setSelectedGroup] = useState<Group>();
  const [composeOpen, setComposeOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = useCallback(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/me/conversations`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        const data = conversationsResponseSchema.parse(json).data;
        setConversations(data);
        setState('success');
        // Keep the open pane's badge/preview in sync once its unread
        // count is cleared server-side, without re-selecting anything.
        setSelectedFriend((current) =>
          current
            ? (data.find((entry) => entry.friend.id === current.id)?.friend ??
              current)
            : current
        );
      })
      .catch(() => setState('error'));
  }, [authToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = query.trim()
    ? conversations.filter((entry) =>
        entry.friend.displayName
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      )
    : conversations;
  const existingFriendIds = new Set(
    conversations.map((entry) => entry.friend.id)
  );
  const unreadTotal = conversations.reduce(
    (sum, conversation) => sum + conversation.unreadCount,
    0
  );

  return (
    <div className="messages-page messaging-page">
      <div className="messages-list-column messaging-inbox-column">
        <header className="messages-list-header messaging-inbox-header">
          <div>
            <span className="messages-page-eyebrow">Ton cercle Pulso</span>
            <h1>Messages</h1>
            <p>Prépare vos prochaines sorties, simplement.</p>
          </div>
          <button
            type="button"
            className="messages-compose-btn"
            aria-label="Nouveau message"
            title="Nouveau message"
            onClick={() => setComposeOpen(true)}
          >
            <span aria-hidden="true">+</span>
            <small>Écrire</small>
          </button>
        </header>
        <div className="messages-inbox-stats">
          <span>
            <b>{conversations.length}</b>
            conversation{conversations.length !== 1 ? 's' : ''}
          </span>
          <span className={unreadTotal > 0 ? 'active' : ''}>
            <b>{unreadTotal}</b>
            non lu{unreadTotal !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="details-tabs messages-main-tabs">
          <button
            type="button"
            className={tab === 'discussions' ? 'active' : ''}
            onClick={() => setTab('discussions')}
          >
            Discussions
            {unreadTotal > 0 && <small>{unreadTotal}</small>}
          </button>
          <button
            type="button"
            className={tab === 'demandes' ? 'active' : ''}
            onClick={() => setTab('demandes')}
          >
            Demandes
            {pendingCount > 0 && <small>{pendingCount}</small>}
          </button>
          <button
            type="button"
            className={tab === 'groupes' ? 'active' : ''}
            onClick={() => setTab('groupes')}
          >
            Groupes
          </button>
        </div>

        {tab === 'discussions' && (
          <>
            <label className="messages-search">
              <span aria-hidden="true">⌕</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher une conversation"
                aria-label="Rechercher une conversation"
              />
            </label>
            {state === 'loading' && (
              <p className="list-view-empty">Chargement…</p>
            )}
            {state === 'error' && (
              <p className="list-view-empty">
                Impossible de charger vos messages pour le moment.
              </p>
            )}
            {state === 'success' && conversations.length === 0 && (
              <div className="messages-inbox-empty">
                <span aria-hidden="true">◌</span>
                <strong>Ton espace de discussion est prêt.</strong>
                <p>Ajoute des amis, puis lance la première conversation.</p>
                <button
                  type="button"
                  className="messages-empty-cta"
                  onClick={() => setComposeOpen(true)}
                >
                  Nouveau message
                </button>
              </div>
            )}
            {state === 'success' &&
              conversations.length > 0 &&
              filtered.length === 0 && (
                <p className="list-view-empty">Aucun résultat.</p>
              )}
            <div className="conversation-list">
              {filtered.map((conversation) => (
                <button
                  type="button"
                  className={`conversation-list-row ${conversation.unreadCount > 0 ? 'unread' : ''} ${selectedFriend?.id === conversation.friend.id ? 'selected' : ''}`}
                  key={conversation.friend.id}
                  onClick={() => {
                    setSelectedGroup(undefined);
                    setSelectedFriend(conversation.friend);
                  }}
                >
                  <span className="friends-row-avatar friends-row-avatar-lg">
                    {conversation.friend.avatarUrl ? (
                      <img src={conversation.friend.avatarUrl} alt="" />
                    ) : (
                      conversation.friend.displayName.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="conversation-list-info">
                    <span className="conversation-list-row-top">
                      <strong>{conversation.friend.displayName}</strong>
                      {conversation.lastMessage && (
                        <span className="conversation-list-time">
                          {formatMessageTimestamp(
                            conversation.lastMessage.createdAt
                          )}
                        </span>
                      )}
                    </span>
                    <span className="conversation-list-preview">
                      {conversation.lastMessage
                        ? `${conversation.lastMessage.senderId === conversation.friend.id ? '' : 'Vous : '}${conversation.lastMessage.body}`
                        : 'Commencez la conversation'}
                    </span>
                  </span>
                  {conversation.unreadCount > 0 && (
                    <span className="conversation-list-badge">
                      {conversation.unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {tab === 'demandes' && (
          <MessagesRequestsTab
            authToken={authToken}
            onPendingCount={setPendingCount}
          />
        )}

        {tab === 'groupes' && (
          <MessagesGroupsTab
            authToken={authToken}
            selectedGroupId={selectedGroup?.id}
            onSelectGroup={(group) => {
              setSelectedFriend(undefined);
              setSelectedGroup(group);
            }}
          />
        )}
      </div>

      <div className="messages-conversation-column messaging-conversation-column">
        {selectedFriend ? (
          <ConversationPane
            friend={selectedFriend}
            authToken={authToken}
            onActivity={refresh}
          />
        ) : selectedGroup ? (
          <GroupDetailContent
            group={selectedGroup}
            authToken={authToken}
            userId={user.id}
            onGroupUpdated={setSelectedGroup}
            onOpenEventForum={onOpenEventForum}
          />
        ) : (
          <div className="messaging-conversation-empty">
            <div className="messaging-empty-orbit" aria-hidden="true">
              <span>●</span>
              <span>●</span>
              <span>●</span>
              <b>◌</b>
            </div>
            <span className="messages-page-eyebrow">Conversations privées</span>
            <h2>Les meilleures sorties commencent souvent par un message.</h2>
            <p>
              Choisis un ami ou un groupe pour planifier, partager un événement
              et décider ensemble.
            </p>
            <button
              type="button"
              className="messages-empty-cta"
              onClick={() => setComposeOpen(true)}
            >
              Écrire à un ami
            </button>
          </div>
        )}
      </div>

      {composeOpen && (
        <ComposeMessageModal
          authToken={authToken}
          existingFriendIds={existingFriendIds}
          onSelect={(friend) => {
            setSelectedGroup(undefined);
            setSelectedFriend(friend);
            setComposeOpen(false);
          }}
          onClose={() => setComposeOpen(false)}
        />
      )}
    </div>
  );
}

// Inline conversation header + thread (Phase 4.9) - deliberately omits
// "En ligne" (no presence infra exists) and video/voice call icons (no
// calling feature exists); keeps "Signaler" per-message, already real.
function ConversationPane({
  friend,
  authToken,
  onActivity
}: {
  friend: PublicUser;
  authToken: string | undefined;
  onActivity: () => void;
}) {
  return (
    <div className="conversation-pane">
      <div className="conversation-pane-header">
        <span className="conversation-modal-friend">
          <span className="friends-row-avatar friends-row-avatar-lg conversation-pane-avatar">
            {friend.avatarUrl ? (
              <img src={friend.avatarUrl} alt="" />
            ) : (
              friend.displayName.slice(0, 1).toUpperCase()
            )}
          </span>
          <span className="conversation-pane-identity">
            <span className="messages-page-eyebrow">Conversation privée</span>
            <strong>{friend.displayName}</strong>
            <small>Vous pouvez échanger car vous êtes amis sur Pulso.</small>
          </span>
        </span>
        <span className="conversation-pane-trust">Entre amis</span>
      </div>
      <ConversationThread
        friend={friend}
        authToken={authToken}
        onActivity={onActivity}
      />
    </div>
  );
}

// "Demandes" tab - the same pending-friend-requests data already shown on
// the Amis page (GET /me/friends/requests), surfaced here too since
// deciding who you can message starts with who you're friends with
// (DEC-0012: messaging is friends-only). Not a separate "message
// request from a stranger" concept, which doesn't exist in Pulso.
function MessagesRequestsTab({
  authToken,
  onPendingCount
}: {
  authToken: string | undefined;
  onPendingCount: (count: number) => void;
}) {
  const [requests, setRequests] = useState<FriendRequestEntry[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );

  const refresh = useCallback(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/me/friends/requests`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        const data = friendRequestsResponseSchema.parse(json).data;
        setRequests(data);
        onPendingCount(
          data.filter((request) => request.direction === 'incoming').length
        );
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken, onPendingCount]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const respond = (requestId: string, action: 'accept' | 'decline') => {
    if (!authToken) return;
    void fetch(`${API_BASE_URL}/me/friends/requests/${requestId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ action })
    }).then(() => refresh());
  };

  const incoming = requests.filter(
    (request) => request.direction === 'incoming'
  );
  const outgoing = requests.filter(
    (request) => request.direction === 'outgoing'
  );

  return (
    <div className="messages-tab-panel messages-requests-panel">
      <div className="messages-request-heading">
        <span className="messages-page-eyebrow">Nouvelles connexions</span>
        <strong>Demandes d’amis</strong>
        <p>Une fois acceptée, une conversation privée peut commencer.</p>
      </div>
      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'error' && (
        <p className="list-view-empty">
          Impossible de charger vos demandes pour le moment.
        </p>
      )}
      {state === 'success' && requests.length === 0 && (
        <div className="messages-request-empty">
          <span aria-hidden="true">✓</span>
          <div>
            <strong>Tout est à jour.</strong>
            <p>Aucune demande en attente pour le moment.</p>
          </div>
        </div>
      )}
      {incoming.length > 0 && (
        <section className="messages-request-section">
          <div className="messages-request-section-title">
            <strong>À confirmer</strong>
            <span>{incoming.length}</span>
          </div>
          <div className="amis-list messages-request-list">
            {incoming.map((request) => (
              <div className="amis-row" key={request.id}>
                <span className="friends-row-avatar friends-row-avatar-lg">
                  {request.user.avatarUrl ? (
                    <img src={request.user.avatarUrl} alt="" />
                  ) : (
                    request.user.displayName.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="amis-row-name">
                  {request.user.displayName}
                </span>
                <div className="amis-row-actions">
                  <button
                    type="button"
                    className="amis-btn-accept"
                    onClick={() => respond(request.id, 'accept')}
                  >
                    Accepter
                  </button>
                  <button
                    type="button"
                    className="amis-btn-ghost"
                    onClick={() => respond(request.id, 'decline')}
                  >
                    Refuser
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {outgoing.length > 0 && (
        <section className="messages-request-section">
          <div className="messages-request-section-title">
            <strong>Envoyées</strong>
            <span>{outgoing.length}</span>
          </div>
          <div className="amis-list messages-request-list">
            {outgoing.map((request) => (
              <div className="amis-row" key={request.id}>
                <span className="friends-row-avatar friends-row-avatar-lg">
                  {request.user.avatarUrl ? (
                    <img src={request.user.avatarUrl} alt="" />
                  ) : (
                    request.user.displayName.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="amis-row-name">
                  {request.user.displayName}
                </span>
                <span className="amis-row-pending">En attente</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// "Groupes" tab - same real data as GroupsBlock (GET /me/groups), just a
// second, convenient entry point into the same GroupModal rather than a
// separate group-messaging concept.
type GroupsSubTab = 'mine' | 'event' | 'discover';

// Groupes tab inside Messages (Phase 4.10) - three sub-tabs matching the
// mockup: "Mes groupes" (already-joined), "Groupes de l'événement" (every
// event-linked group, joined or not) and "Découvrir" (the permanent-group
// directory DEC-0013 v1.1 pre-authorized). Selecting a row opens the real
// group inline in the right column via onSelectGroup, same pattern as
// picking a conversation.
function MessagesGroupsTab({
  authToken,
  selectedGroupId,
  onSelectGroup
}: {
  authToken: string | undefined;
  selectedGroupId: string | undefined;
  onSelectGroup: (group: Group) => void;
}) {
  const [subTab, setSubTab] = useState<GroupsSubTab>('mine');
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [eventGroups, setEventGroups] = useState<DiscoverGroupEntry[]>([]);
  const [discoverGroups, setDiscoverGroups] = useState<DiscoverGroupEntry[]>(
    []
  );
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!authToken) return;
    setState('loading');
    const request =
      subTab === 'mine'
        ? fetch(`${API_BASE_URL}/me/groups`, {
            headers: { authorization: `Bearer ${authToken}` }
          })
            .then((response) =>
              response.ok ? response.json() : Promise.reject()
            )
            .then((json) => setMyGroups(groupsResponseSchema.parse(json).data))
        : fetch(
            `${API_BASE_URL}/groups/discover?scope=${subTab === 'event' ? 'event' : 'permanent'}`,
            { headers: { authorization: `Bearer ${authToken}` } }
          )
            .then((response) =>
              response.ok ? response.json() : Promise.reject()
            )
            .then((json) => {
              const data = discoverGroupsResponseSchema.parse(json).data;
              if (subTab === 'event') setEventGroups(data);
              else setDiscoverGroups(data);
            });
    request.then(() => setState('success')).catch(() => setState('error'));
  }, [authToken, subTab]);

  const openGroup = useCallback(
    (groupId: string) => {
      if (!authToken) return;
      fetch(`${API_BASE_URL}/groups/${groupId}`, {
        headers: { authorization: `Bearer ${authToken}` }
      })
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((json) => onSelectGroup(groupResponseSchema.parse(json).data))
        .catch(() => undefined);
    },
    [authToken, onSelectGroup]
  );

  const rows: DiscoverGroupEntry[] =
    subTab === 'mine'
      ? myGroups.map((group) => ({ group }))
      : subTab === 'event'
        ? eventGroups
        : discoverGroups;
  const visibleRows = query.trim()
    ? rows.filter(({ group, event }) => {
        const haystack = `${group.name} ${group.description ?? ''} ${event?.title ?? ''}`;
        return haystack.toLowerCase().includes(query.trim().toLowerCase());
      })
    : rows;

  return (
    <div className="messages-tab-panel groups-directory-panel">
      <div className="details-tabs groups-sub-tabs">
        <button
          type="button"
          className={subTab === 'mine' ? 'active' : ''}
          onClick={() => setSubTab('mine')}
        >
          Mes groupes
        </button>
        <button
          type="button"
          className={subTab === 'event' ? 'active' : ''}
          onClick={() => setSubTab('event')}
        >
          Événements
        </button>
        <button
          type="button"
          className={subTab === 'discover' ? 'active' : ''}
          onClick={() => setSubTab('discover')}
        >
          Découvrir
        </button>
      </div>

      <div className="groups-directory-context">
        <div>
          <strong>
            {subTab === 'mine'
              ? 'Tes espaces'
              : subTab === 'event'
                ? 'Autour des événements'
                : 'Communautés à découvrir'}
          </strong>
          <span>
            {subTab === 'mine'
              ? 'Tous les groupes que tu as rejoints.'
              : subTab === 'event'
                ? 'Des groupes créés pour préparer une sortie précise.'
                : 'Des communautés montréalaises ouvertes ou sur demande.'}
          </span>
        </div>
        <span className="groups-directory-count">{rows.length}</span>
      </div>
      <label className="groups-directory-search">
        <span aria-hidden="true">⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher un groupe"
          aria-label="Rechercher un groupe"
        />
      </label>

      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'error' && (
        <p className="list-view-empty">
          Impossible de charger les groupes pour le moment.
        </p>
      )}
      {state === 'success' && rows.length === 0 && (
        <p className="list-view-empty">
          {subTab === 'mine'
            ? 'Aucun groupe pour le moment. Découvre-en un dans l\'onglet Découvrir, ou rejoins-en un depuis "Rencontrer avant l\'événement" sur un forum.'
            : subTab === 'event'
              ? "Aucun groupe d'événement pour le moment."
              : 'Aucun groupe permanent pour le moment.'}
        </p>
      )}
      {state === 'success' && rows.length > 0 && visibleRows.length === 0 && (
        <p className="list-view-empty">
          Aucun groupe ne correspond à ta recherche.
        </p>
      )}
      <div className="friends-list groups-directory-list">
        {visibleRows.map(({ group, event }) => (
          <button
            type="button"
            key={group.id}
            className={`conversation-list-row ${selectedGroupId === group.id ? 'selected' : ''}`}
            onClick={() => openGroup(group.id)}
          >
            <span className="friends-row-avatar friends-row-avatar-lg group-directory-avatar">
              {group.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="conversation-list-info">
              <span className="conversation-list-row-top">
                <strong>{group.name}</strong>
                <span className="group-directory-access">
                  {group.visibility === 'restricted' ? 'Sur demande' : 'Libre'}
                </span>
              </span>
              {group.description && (
                <span className="group-directory-description">
                  {group.description}
                </span>
              )}
              <span className="group-directory-meta">
                <span>
                  {group.memberCount} membre{group.memberCount > 1 ? 's' : ''}
                </span>
                <span>{event ? 'Groupe événement' : 'Communauté'}</span>
              </span>
              {event && (
                <span className="group-directory-event">
                  {event.title} ·{' '}
                  {new Date(event.startsAt).toLocaleDateString('fr-CA', {
                    day: 'numeric',
                    month: 'short'
                  })}
                </span>
              )}
            </span>
            {group.isModerator &&
              group.pendingRequestCount !== undefined &&
              group.pendingRequestCount > 0 && (
                <span className="conversation-list-badge">
                  {group.pendingRequestCount}
                </span>
              )}
          </button>
        ))}
      </div>
    </div>
  );
}

// Compose picker (Phase 4.9) - starting a new conversation is just
// picking an existing friend (DEC-0012: messaging is friends-only, no
// stranger inbox). Reuses the same friends-fetch pattern as
// ShareToFriendModal.
function ComposeMessageModal({
  authToken,
  existingFriendIds,
  onSelect,
  onClose
}: {
  authToken: string | undefined;
  existingFriendIds: Set<string>;
  onSelect: (friend: PublicUser) => void;
  onClose: () => void;
}) {
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );

  useEffect(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/me/friends`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setFriends(friendsResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="share-friend-modal messages-compose-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="conversation-modal-header">
          <div className="messages-compose-modal-title">
            <span className="messages-page-eyebrow">Conversation privée</span>
            <strong>Nouveau message</strong>
            <small>
              Choisis un ami pour commencer ou reprendre un échange.
            </small>
          </div>
          <button type="button" className="text-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="share-friend-list">
          {state === 'loading' && (
            <p className="list-view-empty">Chargement…</p>
          )}
          {state === 'error' && (
            <p className="list-view-empty">
              Impossible de charger vos amis pour le moment.
            </p>
          )}
          {state === 'success' && friends.length === 0 && (
            <p className="list-view-empty">
              Ajoute des amis pour pouvoir leur écrire.
            </p>
          )}
          {state === 'success' &&
            friends.map((friend) => (
              <div
                className="friends-row messages-compose-friend"
                key={friend.id}
              >
                <span className="friends-row-avatar">
                  {friend.avatarUrl ? (
                    <img src={friend.avatarUrl} alt="" />
                  ) : (
                    friend.displayName.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="friends-row-name">{friend.displayName}</span>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => onSelect(friend)}
                >
                  {existingFriendIds.has(friend.id) ? 'Reprendre' : 'Écrire'}
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// Full-page version of the friends block already built in Phase 2 - no
// change to FriendsBlock itself, just a dedicated home for it instead of
// living inside Mon compte.
type AmisTab = 'tous' | 'demandes' | 'suggestions';

// Phase 4.15 redesign - a real split view (list/search/tabs, a selected
// friend's real detail panel, a right rail) instead of the old single
// scrolling list. No online/offline presence anywhere (no realtime
// infrastructure exists) - every subtitle/badge here is a real, derived
// fact: a friend's real next friends-visible upcoming event when they have
// one, otherwise a real mutual-friend count.
function AmisPage({
  authToken,
  attendance,
  locale,
  onOpenEventForum,
  onNavigate
}: {
  authToken: string | undefined;
  attendance: Record<string, AttendanceVisibility>;
  locale: SupportedLocale;
  onOpenEventForum: (eventId: string) => void;
  onNavigate: (section: ConnectedSection) => void;
}) {
  const [friendCode, setFriendCode] = useState<string>();
  const [requests, setRequests] = useState<FriendRequestEntry[]>([]);
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [suggestions, setSuggestions] = useState<FriendSuggestion[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [tab, setTab] = useState<AmisTab>('tous');
  const [query, setQuery] = useState('');
  const [selectedFriend, setSelectedFriend] = useState<PublicUser>();
  const [conversationWith, setConversationWith] = useState<PublicUser>();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mutualCounts, setMutualCounts] = useState<Map<string, number>>(
    new Map()
  );
  const [friendsUpcoming, setFriendsUpcoming] = useState<FriendsMapEntry[]>([]);
  const [upcomingEventsById, setUpcomingEventsById] = useState<
    Map<string, PublicEvent>
  >(new Map());

  const refresh = useCallback(() => {
    if (!authToken) return;
    const headers = { authorization: `Bearer ${authToken}` };
    setLoadState('loading');
    Promise.all([
      fetch(`${API_BASE_URL}/me/friend-code`, { headers }).then((r) =>
        r.ok ? r.json() : Promise.reject()
      ),
      fetch(`${API_BASE_URL}/me/friends/requests`, { headers }).then((r) =>
        r.ok ? r.json() : Promise.reject()
      ),
      fetch(`${API_BASE_URL}/me/friends`, { headers }).then((r) =>
        r.ok ? r.json() : Promise.reject()
      ),
      fetch(`${API_BASE_URL}/me/friends/suggestions`, { headers }).then((r) =>
        r.ok ? r.json() : Promise.reject()
      )
    ])
      .then(([codeJson, requestsJson, friendsJson, suggestionsJson]) => {
        setFriendCode(friendCodeResponseSchema.parse(codeJson).data.friendCode);
        setRequests(friendRequestsResponseSchema.parse(requestsJson).data);
        setFriends(friendsResponseSchema.parse(friendsJson).data);
        setSuggestions(
          friendSuggestionsResponseSchema.parse(suggestionsJson).data
        );
        setLoadState('success');
      })
      .catch(() => setLoadState('error'));
  }, [authToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Real, batched "N amis en commun" for everyone currently shown (friends,
  // requests, suggestions alike) - one request instead of one per row.
  const mutualCandidateIds = [
    ...new Set([
      ...friends.map((f) => f.id),
      ...requests.map((r) => r.user.id),
      ...suggestions.map((s) => s.user.id)
    ])
  ];
  const mutualCandidateIdsKey = mutualCandidateIds.join(',');
  useEffect(() => {
    if (!authToken || !mutualCandidateIdsKey) {
      setMutualCounts(new Map());
      return;
    }
    fetch(
      `${API_BASE_URL}/me/friends/mutual-counts?ids=${mutualCandidateIdsKey}`,
      { headers: { authorization: `Bearer ${authToken}` } }
    )
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        const data = friendMutualCountsResponseSchema.parse(json).data;
        setMutualCounts(
          new Map(data.map((entry) => [entry.userId, entry.mutualFriendCount]))
        );
      })
      .catch(() => {});
  }, [mutualCandidateIdsKey, authToken]);

  // Real "Va à <événement>" per friend row + the map feature below - one
  // fetch serves both, real friends-visible upcoming attendance only.
  useEffect(() => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/me/friends/map`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) =>
        setFriendsUpcoming(friendsMapResponseSchema.parse(json).data)
      )
      .catch(() => {});
  }, [authToken]);

  const upcomingEventIdsKey = [
    ...new Set(friendsUpcoming.map((entry) => entry.eventId))
  ].join(',');
  useEffect(() => {
    if (!upcomingEventIdsKey) {
      setUpcomingEventsById(new Map());
      return;
    }
    fetch(`${API_BASE_URL}/events/by-ids?ids=${upcomingEventIdsKey}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        const events = eventListResponseSchema.parse(json).data;
        setUpcomingEventsById(new Map(events.map((evt) => [evt.id, evt])));
      })
      .catch(() => {});
  }, [upcomingEventIdsKey]);

  const respond = (requestId: string, action: 'accept' | 'decline') => {
    if (!authToken) return;
    void fetch(`${API_BASE_URL}/me/friends/requests/${requestId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ action })
    }).then(() => refresh());
  };

  const removeFriendAction = (friendUserId: string) => {
    if (!authToken) return;
    if (!window.confirm('Retirer cette personne de tes amis ?')) return;
    void fetch(`${API_BASE_URL}/me/friends/${friendUserId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${authToken}` }
    }).then(() => {
      if (selectedFriend?.id === friendUserId) setSelectedFriend(undefined);
      refresh();
    });
  };

  const addSuggestion = (userId: string) => {
    if (!authToken) return;
    void fetch(`${API_BASE_URL}/me/friends/${userId}/request`, {
      method: 'POST',
      headers: { authorization: `Bearer ${authToken}` }
    }).then((response) => {
      if (response.ok) refresh();
    });
  };

  const incoming = requests.filter((r) => r.direction === 'incoming');
  const outgoing = requests.filter((r) => r.direction === 'outgoing');
  const filteredFriends = query.trim()
    ? friends.filter((f) =>
        f.displayName.toLowerCase().includes(query.trim().toLowerCase())
      )
    : friends;
  const friendsWithPlansCount = new Set(
    friendsUpcoming.map((entry) => entry.friend.id)
  ).size;
  const circleOutings = friendsUpcoming
    .map((entry) => ({
      entry,
      event: upcomingEventsById.get(entry.eventId)
    }))
    .filter(
      (row): row is { entry: FriendsMapEntry; event: PublicEvent } =>
        row.event !== undefined
    )
    .slice(0, 4);

  const friendRowSubtitle = (friendUserId: string): string | undefined => {
    const upcoming = friendsUpcoming.find(
      (entry) => entry.friend.id === friendUserId
    );
    const upcomingEvent = upcoming && upcomingEventsById.get(upcoming.eventId);
    if (upcomingEvent) return `Va à ${upcomingEvent.title}`;
    const mutual = mutualCounts.get(friendUserId) ?? 0;
    return mutual > 0
      ? `${mutual} ami${mutual > 1 ? 's' : ''} en commun`
      : undefined;
  };

  return (
    <div
      className={`amis-page-layout ${selectedFriend ? 'has-selection' : ''}`}
    >
      <div className="amis-list-column">
        <div className="amis-list-header">
          <span className="amis-page-kicker">Ton cercle Pulso</span>
          <div className="amis-title-row">
            <div>
              <h1>Mes amis</h1>
              <p>Retrouve les personnes avec qui vivre Montréal.</p>
            </div>
            <button
              type="button"
              className="amis-invite-icon"
              onClick={() => setInviteOpen(true)}
              aria-label="Inviter un ami"
              title="Inviter un ami"
            >
              +
            </button>
          </div>
          <div
            className="amis-overview-stats"
            aria-label="Résumé de ton cercle"
          >
            <span>
              <strong>{friends.length}</strong> amis
            </span>
            <span>
              <strong>{friendsWithPlansCount}</strong> ont une sortie visible
            </span>
            <span>
              <strong>{incoming.length}</strong> demande
              {incoming.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="amis-search-row">
          <div className="messages-search amis-search">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un ami"
            />
          </div>
        </div>

        <div className="details-tabs amis-tabs">
          <button
            type="button"
            className={tab === 'tous' ? 'active' : ''}
            onClick={() => setTab('tous')}
          >
            Mon cercle <span>{friends.length}</span>
          </button>
          <button
            type="button"
            className={tab === 'demandes' ? 'active' : ''}
            onClick={() => setTab('demandes')}
          >
            Demandes {incoming.length > 0 && <span>{incoming.length}</span>}
          </button>
          <button
            type="button"
            className={tab === 'suggestions' ? 'active' : ''}
            onClick={() => setTab('suggestions')}
          >
            À découvrir <span>{suggestions.length}</span>
          </button>
        </div>

        {loadState === 'loading' && (
          <p className="list-view-empty">Chargement…</p>
        )}
        {loadState === 'error' && (
          <p className="list-view-empty">
            Impossible de charger vos amis pour le moment.
          </p>
        )}

        {loadState === 'success' && tab === 'tous' && (
          <div className="friends-list amis-friends-list">
            {filteredFriends.length === 0 && (
              <div className="empty-state-card">
                <span className="empty-state-icon" aria-hidden="true">
                  🧑‍🤝‍🧑
                </span>
                <p>Aucun ami pour le moment</p>
                <p>Partage ton code pour commencer à te connecter.</p>
              </div>
            )}
            {filteredFriends.map((friendUser) => (
              <div
                className={`conversation-list-row amis-friend-row ${selectedFriend?.id === friendUser.id ? 'selected' : ''}`}
                key={friendUser.id}
              >
                <button
                  type="button"
                  className="amis-friend-select"
                  onClick={() => setSelectedFriend(friendUser)}
                >
                  <span className="friends-row-avatar friends-row-avatar-lg">
                    {friendUser.avatarUrl ? (
                      <img src={friendUser.avatarUrl} alt="" />
                    ) : (
                      friendUser.displayName.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="conversation-list-info">
                    <strong>{friendUser.displayName}</strong>
                    <span>
                      {friendRowSubtitle(friendUser.id) ?? 'Dans ton cercle'}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="amis-row-icon-btn"
                  aria-label="Envoyer un message"
                  title="Message"
                  onClick={() => {
                    setConversationWith(friendUser);
                  }}
                >
                  💬
                </button>
                <button
                  type="button"
                  className="amis-row-icon-btn"
                  aria-label="Retirer cet ami"
                  title="Retirer"
                  onClick={() => {
                    removeFriendAction(friendUser.id);
                  }}
                >
                  ⋯
                </button>
              </div>
            ))}
          </div>
        )}

        {loadState === 'success' && tab === 'demandes' && (
          <div className="messages-tab-panel">
            {incoming.length === 0 && outgoing.length === 0 && (
              <p className="list-view-empty">
                Aucune demande d'ami pour le moment.
              </p>
            )}
            {incoming.length > 0 && (
              <div className="amis-section">
                <h3 className="amis-section-title">Demandes reçues</h3>
                <div className="amis-list">
                  {incoming.map((request) => (
                    <div className="amis-row" key={request.id}>
                      <span className="friends-row-avatar friends-row-avatar-lg">
                        {request.user.avatarUrl ? (
                          <img src={request.user.avatarUrl} alt="" />
                        ) : (
                          request.user.displayName.slice(0, 1).toUpperCase()
                        )}
                      </span>
                      <span className="amis-row-name">
                        {request.user.displayName}
                        {(mutualCounts.get(request.user.id) ?? 0) > 0 && (
                          <span className="amis-row-mutual">
                            {mutualCounts.get(request.user.id)} ami
                            {mutualCounts.get(request.user.id)! > 1
                              ? 's'
                              : ''}{' '}
                            en commun
                          </span>
                        )}
                      </span>
                      <div className="amis-row-actions">
                        <button
                          type="button"
                          className="amis-btn-accept"
                          onClick={() => respond(request.id, 'accept')}
                        >
                          Accepter
                        </button>
                        <button
                          type="button"
                          className="amis-btn-ghost"
                          onClick={() => respond(request.id, 'decline')}
                        >
                          Refuser
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {outgoing.length > 0 && (
              <div className="amis-section">
                <h3 className="amis-section-title">Demandes envoyées</h3>
                <div className="amis-list">
                  {outgoing.map((request) => (
                    <div className="amis-row" key={request.id}>
                      <span className="friends-row-avatar friends-row-avatar-lg">
                        {request.user.avatarUrl ? (
                          <img src={request.user.avatarUrl} alt="" />
                        ) : (
                          request.user.displayName.slice(0, 1).toUpperCase()
                        )}
                      </span>
                      <span className="amis-row-name">
                        {request.user.displayName}
                      </span>
                      <span className="amis-row-pending">En attente</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {loadState === 'success' && tab === 'suggestions' && (
          <div className="messages-tab-panel">
            {suggestions.length === 0 ? (
              <p className="list-view-empty">
                Pas de suggestion pour l'instant - ajoute des amis pour en
                découvrir de nouveaux via vos connexions en commun.
              </p>
            ) : (
              <div className="amis-list">
                {suggestions.map((suggestion) => (
                  <div className="amis-row" key={suggestion.user.id}>
                    <span className="friends-row-avatar friends-row-avatar-lg">
                      {suggestion.user.avatarUrl ? (
                        <img src={suggestion.user.avatarUrl} alt="" />
                      ) : (
                        suggestion.user.displayName.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span className="amis-row-name">
                      {suggestion.user.displayName}
                      <span className="amis-row-mutual">
                        {suggestion.mutualFriendCount} ami
                        {suggestion.mutualFriendCount > 1 ? 's' : ''} en commun
                      </span>
                    </span>
                    <button
                      type="button"
                      className="amis-btn-accept"
                      onClick={() => addSuggestion(suggestion.user.id)}
                    >
                      + Ajouter
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="amis-detail-column">
        {selectedFriend ? (
          <FriendDetailPanel
            friend={selectedFriend}
            authToken={authToken}
            mutualCount={mutualCounts.get(selectedFriend.id) ?? 0}
            locale={locale}
            attendance={attendance}
            onOpenEventForum={onOpenEventForum}
            onMessage={() => setConversationWith(selectedFriend)}
            onBack={() => setSelectedFriend(undefined)}
          />
        ) : (
          <div className="messages-empty-pane amis-empty-detail">
            <div className="amis-empty-orbit" aria-hidden="true">
              <span>☺</span>
              <span>✦</span>
              <span>☺</span>
            </div>
            <span className="amis-page-kicker">Ton cercle t’attend</span>
            <h2>Choisis un ami</h2>
            <p>
              Consulte ses sorties partagées, vos événements en commun et
              démarre l’organisation de votre prochaine soirée.
            </p>
            <button type="button" onClick={() => setInviteOpen(true)}>
              Inviter une nouvelle personne
            </button>
          </div>
        )}
      </div>

      <aside className="amis-rail">
        <div className="amis-rail-hero">
          <span className="amis-page-kicker">Ton cercle bouge</span>
          <strong>{friendsWithPlansCount}</strong>
          <p>
            ami{friendsWithPlansCount !== 1 ? 's ont' : ' a'} partagé une sortie
            à venir avec leur cercle.
          </p>
          <button type="button" onClick={() => setMapOpen(true)}>
            <span aria-hidden="true">⌖</span> Voir sur la carte
          </button>
        </div>

        <div className="amis-rail-section amis-circle-outings">
          <div className="amis-rail-header">
            <div>
              <span>À venir</span>
              <h3>Sorties du cercle</h3>
            </div>
          </div>
          {circleOutings.length === 0 ? (
            <p className="list-view-empty">
              Les sorties que tes amis partagent apparaîtront ici.
            </p>
          ) : (
            <div className="amis-circle-list">
              {circleOutings.map(({ entry, event }) => (
                <button
                  type="button"
                  className="amis-circle-row"
                  key={`${entry.friend.id}-${event.id}`}
                  onClick={() => onOpenEventForum(event.id)}
                >
                  <span className="friends-row-avatar">
                    {entry.friend.avatarUrl ? (
                      <img src={entry.friend.avatarUrl} alt="" />
                    ) : (
                      entry.friend.displayName.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span>
                    <strong>{entry.friend.displayName}</strong>
                    <span>{event.title}</span>
                  </span>
                  <time dateTime={event.startsAt}>
                    {new Date(event.startsAt).toLocaleDateString('fr-CA', {
                      day: 'numeric',
                      month: 'short'
                    })}
                  </time>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="amis-rail-section amis-code-rail">
          <span className="amis-page-kicker">Ton code ami</span>
          <strong>{friendCode ?? '—'}</strong>
          <p>Partage-le uniquement avec les personnes que tu veux ajouter.</p>
          <button type="button" onClick={() => setInviteOpen(true)}>
            Inviter avec mon code <span aria-hidden="true">→</span>
          </button>
        </div>

        <div className="amis-rail-section amis-actions-card">
          <div className="amis-rail-header">
            <div>
              <span>Ensemble</span>
              <h3>Organiser une sortie</h3>
            </div>
          </div>
          <div className="amis-quick-actions">
            <button
              type="button"
              className="forum-panel-rail-action"
              onClick={() => onNavigate('groupes')}
            >
              <span aria-hidden="true">♟</span>
              <span>
                <strong>Créer un groupe</strong>
                <small>Rassembler ton cercle</small>
              </span>
              <span aria-hidden="true">→</span>
            </button>
            <button
              type="button"
              className="forum-panel-rail-action"
              onClick={() => onNavigate('evenement')}
            >
              <span aria-hidden="true">♡</span>
              <span>
                <strong>Choisir un événement</strong>
                <small>Partager une idée de sortie</small>
              </span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </aside>

      {conversationWith && (
        <ConversationModal
          friend={conversationWith}
          authToken={authToken}
          onClose={() => setConversationWith(undefined)}
        />
      )}
      {inviteOpen && (
        <InviteFriendModal
          friendCode={friendCode}
          authToken={authToken}
          onSent={refresh}
          onClose={() => setInviteOpen(false)}
        />
      )}
      {mapOpen && (
        <FriendsMapModal
          entries={friendsUpcoming}
          eventsById={upcomingEventsById}
          onOpenEventForum={onOpenEventForum}
          onClose={() => setMapOpen(false)}
        />
      )}
    </div>
  );
}

// Same attendance data (GET /me/attendance, Phase 2.2) hydrated via the
// existing /events/by-ids endpoint and split by date, rather than a second
// fetch for the past half. Shared by the profile page's Aperçu and Mes
// sorties tabs, each of which shows both halves.
function useAttendanceEvents(
  attendance: Record<string, AttendanceVisibility>,
  mode: 'upcoming' | 'past'
) {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const eventIds = Object.keys(attendance);
  // Stable dependency: the array reference from Object.keys changes every
  // render even when the ids themselves don't, which would otherwise
  // refetch on every render.
  const eventIdsKey = eventIds.join(',');

  useEffect(() => {
    if (eventIdsKey === '') {
      setEvents([]);
      setState('success');
      return;
    }
    setState('loading');
    fetch(`${API_BASE_URL}/events/by-ids?ids=${eventIdsKey}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setEvents(eventListResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [eventIdsKey]);

  const now = Date.now();
  const filtered = events
    .filter((event) =>
      mode === 'upcoming'
        ? new Date(event.startsAt).getTime() >= now
        : new Date(event.startsAt).getTime() < now
    )
    .sort((a, b) =>
      mode === 'upcoming'
        ? new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
        : new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
    );

  return { events: filtered, state };
}

function EventCarouselRow({
  events,
  onOpenDetails,
  locale
}: {
  events: PublicEvent[];
  onOpenDetails: (eventId: string) => void;
  locale: SupportedLocale;
}) {
  return (
    <div className="event-carousel">
      {events.map((evt) => (
        <div
          className="event-card"
          key={evt.id}
          onClick={() => onOpenDetails(evt.id)}
          style={{ cursor: 'pointer' }}
        >
          <div
            className="event-card-img"
            style={
              evt.imageUrl
                ? {
                    backgroundImage: `url(${evt.imageUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }
                : undefined
            }
          >
            {!evt.imageUrl && <EventImageFallback category={evt.category} />}
            <div
              className="card-badge"
              style={{
                background:
                  CATEGORY_COLORS[evt.category] ?? CATEGORY_COLORS['other']
              }}
            >
              {SHORT_CATEGORY_LABELS[locale][evt.category]}
            </div>
          </div>
          <div className="event-card-content">
            <h3>{evt.title}</h3>
            <p>{evt.venue?.name}</p>
            <p className="card-price">
              {evt.startsAt ? new Date(evt.startsAt).toLocaleDateString() : ''}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

type ProfilTab =
  'apercu' | 'mes-evenements' | 'favoris' | 'groupes' | 'activite';

const PROFIL_TABS: Array<{ id: ProfilTab; label: string; icon: string }> = [
  { id: 'apercu', label: 'Vue d’ensemble', icon: '✦' },
  { id: 'mes-evenements', label: 'Mes sorties', icon: '◫' },
  { id: 'favoris', label: 'Favoris', icon: '♡' },
  { id: 'groupes', label: 'Groupes', icon: '♟' },
  { id: 'activite', label: 'Activité', icon: '↗' }
];

// Brand-gradient banner presets (Phase 4.7) - never a photo upload, Pulso
// stores no user images beyond the Google avatar. Keys match
// PROFILE_COVER_STYLES in @pulso/contracts.
const PROFILE_COVER_GRADIENTS: Record<string, string> = {
  aurora: 'linear-gradient(135deg, #a73ee8, #ff2a7a)',
  sunset: 'linear-gradient(135deg, #ff8a3d, #ff2a7a)',
  midnight: 'linear-gradient(135deg, #1c192b, #5b3fe0)',
  nebula: 'linear-gradient(135deg, #5b3fe0, #00c2a8)'
};
const DEFAULT_PROFILE_COVER = 'aurora';

// Preset avatars (Phase 4.7) - picking one overrides the Google avatar photo
// everywhere the user's own avatar appears (Sidebar profile card, TopBar
// account menu, profile header), same "no upload" rationale as the cover
// presets. Reuses the same brand gradients rather than inventing a second
// palette.
const PROFILE_AVATAR_PRESETS: Record<
  string,
  { emoji: string; gradient: string }
> = {
  note: { emoji: '🎧', gradient: PROFILE_COVER_GRADIENTS['aurora']! },
  disco: { emoji: '🪩', gradient: PROFILE_COVER_GRADIENTS['midnight']! },
  moon: { emoji: '🌙', gradient: PROFILE_COVER_GRADIENTS['nebula']! },
  star: { emoji: '⭐', gradient: PROFILE_COVER_GRADIENTS['sunset']! },
  flame: { emoji: '🔥', gradient: PROFILE_COVER_GRADIENTS['aurora']! },
  heart: { emoji: '💜', gradient: PROFILE_COVER_GRADIENTS['midnight']! }
};

// Shared by every spot the user's own avatar appears (AccountMenu, Sidebar
// profile card, ProfilHeader) - a chosen preset always wins over the Google
// photo; falls back to the initial only when neither exists.
function renderUserAvatarContent(user: User): ReactNode {
  const preset = user.avatarStyle
    ? PROFILE_AVATAR_PRESETS[user.avatarStyle]
    : undefined;
  if (preset) {
    return (
      <span
        className="user-avatar-preset"
        style={{ background: preset.gradient }}
        aria-hidden="true"
      >
        {preset.emoji}
      </span>
    );
  }
  if (user.avatarUrl) {
    return <img src={user.avatarUrl} alt="" />;
  }
  return user.displayName.slice(0, 1).toUpperCase();
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days}j`;
  return new Date(iso).toLocaleDateString('fr-CA');
}

// Messaging's own timestamp convention (clock time / "Hier" / weekday),
// distinct from formatRelativeTime's "il y a Xh" used elsewhere (forum
// posts, etc.) - matches how the conversation list and message bubbles
// actually read in the reference mockup.
function formatMessageTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / 86400000
  );
  if (dayDiff <= 0) {
    return date.toLocaleTimeString('fr-CA', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  if (dayDiff === 1) return 'Hier';
  if (dayDiff < 7) {
    const label = date.toLocaleDateString('fr-CA', { weekday: 'short' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return date.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
}

function formatConversationDayLabel(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString('en-CA', {
    timeZone: 'America/Toronto'
  });
  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Toronto'
  });
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString(
    'en-CA',
    { timeZone: 'America/Toronto' }
  );
  if (day === today) return 'Aujourd’hui';
  if (day === yesterday) return 'Hier';
  const label = date.toLocaleDateString('fr-CA', {
    timeZone: 'America/Toronto',
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Événements page (Phase 4.11) - real price display for a PublicEvent's
// price object. 'unknown' (source never stated a price) is deliberately
// distinct from 'free': showing "Gratuit" for an unknown price would be a
// fabricated claim, so it renders nothing instead.
function formatEventPrice(price: PublicEvent['price']): string {
  if (price.kind === 'free') return 'Gratuit';
  if (price.kind === 'paid') {
    return price.minimumAmount !== undefined
      ? `À partir de ${price.minimumAmount % 1 === 0 ? price.minimumAmount : price.minimumAmount.toFixed(2)} $`
      : 'Payant';
  }
  return '';
}

// Compact "20:00 - 23:00" clock-time range in the event's real timezone -
// distinct from formatMontrealDateTime's fuller weekday/date rendering,
// which is too long for a grid card.
function formatEventTimeRange(startsAt: string, endsAt: string | undefined) {
  const format = (iso: string) =>
    new Date(iso).toLocaleTimeString('fr-CA', {
      timeZone: 'America/Toronto',
      hour: '2-digit',
      minute: '2-digit'
    });
  return endsAt ? `${format(startsAt)} - ${format(endsAt)}` : format(startsAt);
}

// "sam. 8 août, 20 h 00" - the whole instant in one line, for surfaces that
// have no separate date badge to lean on (the notifications panel).
// Mirrors the server-side After rule (DEC-0017): the creator's flag, or a
// start in the small hours - which is what an after actually is, and which
// also catches late-night events already in the sourced directory.
function isAfterEvent(event: PublicEvent): boolean {
  if (event.isAfter) return true;
  const hour = Number(
    new Date(event.startsAt).toLocaleString('en-CA', {
      timeZone: 'America/Toronto',
      hour: '2-digit',
      hour12: false
    })
  );
  return hour >= AFTER_WINDOW_START_HOUR && hour < AFTER_WINDOW_END_HOUR;
}

function formatEventDateTime(startsAt: string): string {
  return new Date(startsAt).toLocaleString('fr-CA', {
    timeZone: 'America/Toronto',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatEventDateBadge(startsAt: string): {
  day: string;
  month: string;
} {
  const date = new Date(startsAt);
  return {
    day: date.toLocaleDateString('fr-CA', {
      timeZone: 'America/Toronto',
      day: '2-digit'
    }),
    month: date
      .toLocaleDateString('fr-CA', {
        timeZone: 'America/Toronto',
        month: 'short'
      })
      .replace('.', '')
      .toUpperCase()
  };
}

function formatForumEventDayLabel(startsAt: string): string {
  const eventDate = new Date(startsAt);
  const eventDay = eventDate.toLocaleDateString('en-CA', {
    timeZone: 'America/Toronto'
  });
  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Toronto'
  });
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', {
    timeZone: 'America/Toronto'
  });
  if (eventDay === today) return 'Ce soir';
  if (eventDay === tomorrow) return 'Demain';
  const label = eventDate.toLocaleDateString('fr-CA', {
    timeZone: 'America/Toronto',
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
  return label.charAt(0).toUpperCase() + label.slice(1).replace('.', '');
}

function formatMemberSince(iso: string): string {
  const formatted = new Date(iso).toLocaleDateString('fr-CA', {
    month: 'long',
    year: 'numeric'
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function activityEntryKey(entry: ActivityEntry): string {
  switch (entry.kind) {
    case 'favorited_event':
      return `fe-${entry.eventId}`;
    case 'favorited_venue':
      return `fv-${entry.venueId}`;
    case 'attended_event':
      return `ae-${entry.eventId}`;
    case 'joined_group':
      return `jg-${entry.groupId}`;
  }
}

function activityEntryDisplay(entry: ActivityEntry): {
  icon: string;
  text: string;
} {
  switch (entry.kind) {
    case 'favorited_event':
      return { icon: '❤️', text: `A ajouté ${entry.eventTitle} à ses favoris` };
    case 'favorited_venue':
      return { icon: '🔔', text: `Suit maintenant ${entry.venueName}` };
    case 'attended_event':
      return { icon: '🎟️', text: `A participé à ${entry.eventTitle}` };
    case 'joined_group':
      return { icon: '🧑‍🤝‍🧑', text: `A rejoint le groupe ${entry.groupName}` };
  }
}

function useProfileStats(authToken: string | undefined) {
  const [stats, setStats] = useState<ProfileStatsResponse['data']>();
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  useEffect(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/me/profile-stats`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setStats(profileStatsResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken]);
  return { stats, state };
}

function useActivity(authToken: string | undefined, limit: number) {
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  useEffect(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/me/activity?limit=${limit}`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setActivity(activityResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken, limit]);
  return { activity, state };
}

function ActivityList({
  entries,
  emptyMessage
}: {
  entries: ActivityEntry[];
  emptyMessage: string;
}) {
  if (entries.length === 0) {
    return <p className="list-view-empty">{emptyMessage}</p>;
  }
  return (
    <ul className="profil-activity-list">
      {entries.map((entry) => {
        const { icon, text } = activityEntryDisplay(entry);
        return (
          <li key={activityEntryKey(entry)} className="profil-activity-row">
            <span className="profil-activity-icon" aria-hidden="true">
              {icon}
            </span>
            <span className="profil-activity-text">{text}</span>
            <span className="profil-activity-time">
              {formatRelativeTime(entry.occurredAt)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function EditProfileModal({
  user,
  authToken,
  onClose,
  onSaved
}: {
  user: User;
  authToken: string | undefined;
  onClose: () => void;
  onSaved: (user: User) => void;
}) {
  const [bio, setBio] = useState(user.bio ?? '');
  const [coverStyle, setCoverStyle] = useState(
    user.coverStyle ?? DEFAULT_PROFILE_COVER
  );
  // '' means "use the Google photo" - the explicit clear signal
  // updateProfileRequestSchema accepts (see auth-repository.ts).
  const [avatarStyle, setAvatarStyle] = useState(user.avatarStyle ?? '');
  const [saving, setSaving] = useState(false);

  const save = () => {
    if (!authToken || saving) return;
    setSaving(true);
    fetch(`${API_BASE_URL}/me/profile`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ bio: bio.trim(), coverStyle, avatarStyle })
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        onSaved(meResponseSchema.parse(json).data);
        onClose();
      })
      .catch(() => {})
      .finally(() => setSaving(false));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="profil-edit-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="conversation-modal-header">
          <strong>Modifier mon profil</strong>
          <button type="button" className="text-btn" onClick={onClose}>
            Fermer
          </button>
        </div>
        <div className="profil-edit-body">
          <label className="profil-edit-label" htmlFor="profil-bio-input">
            Bio
          </label>
          <textarea
            id="profil-bio-input"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            maxLength={280}
            rows={3}
            placeholder="Quelques mots sur toi…"
          />
          <span className="profil-edit-counter">{bio.length}/280</span>

          <span className="profil-edit-label">Photo de profil</span>
          <div className="profil-cover-picker">
            <button
              type="button"
              className={`profil-avatar-swatch ${avatarStyle === '' ? 'active' : ''}`}
              onClick={() => setAvatarStyle('')}
              aria-label="Photo Google"
              title="Photo Google"
            >
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" />
              ) : (
                user.displayName.slice(0, 1).toUpperCase()
              )}
            </button>
            {PROFILE_AVATAR_STYLES.map((style) => (
              <button
                type="button"
                key={style}
                className={`profil-avatar-swatch ${avatarStyle === style ? 'active' : ''}`}
                style={{ background: PROFILE_AVATAR_PRESETS[style]!.gradient }}
                onClick={() => setAvatarStyle(style)}
                aria-label={style}
                title={style}
              >
                {PROFILE_AVATAR_PRESETS[style]!.emoji}
              </button>
            ))}
          </div>

          <span className="profil-edit-label">Bannière</span>
          <div className="profil-cover-picker">
            {PROFILE_COVER_STYLES.map((style) => (
              <button
                type="button"
                key={style}
                className={`profil-cover-swatch ${coverStyle === style ? 'active' : ''}`}
                style={{ background: PROFILE_COVER_GRADIENTS[style] }}
                onClick={() => setCoverStyle(style)}
                aria-label={style}
              />
            ))}
          </div>
        </div>
        <div className="profil-edit-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={save}
            disabled={saving}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfilHeader({
  user,
  friendsCount,
  onEdit
}: {
  user: User;
  friendsCount: number;
  onEdit: () => void;
}) {
  const coverGradient =
    PROFILE_COVER_GRADIENTS[user.coverStyle ?? DEFAULT_PROFILE_COVER] ??
    PROFILE_COVER_GRADIENTS[DEFAULT_PROFILE_COVER];
  return (
    <div className="profil-header">
      <div className="profil-cover" style={{ background: coverGradient }} />
      <div className="profil-header-content">
        <div className="profil-identity">
          <span className="profil-avatar">{renderUserAvatarContent(user)}</span>
          <div className="profil-identity-copy">
            <span className="profil-eyebrow">Mon espace Pulso</span>
            <div className="profil-name-row">
              <h1>{user.displayName}</h1>
              <span className="profil-account-pill">Compte connecté</span>
            </div>
            <div className="profil-meta">
              <span>📍 Montréal, QC</span>
              <span>·</span>
              <span>Membre depuis {formatMemberSince(user.createdAt)}</span>
            </div>
            <p className={`profil-bio ${user.bio ? '' : 'is-empty'}`}>
              {user.bio ||
                'Ajoute quelques mots pour personnaliser ton espace.'}
            </p>
            <span className="profil-friends-link">
              <strong>{friendsCount}</strong> ami{friendsCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <button type="button" className="profil-edit-btn" onClick={onEdit}>
          <span aria-hidden="true">✎</span>
          Personnaliser
        </button>
      </div>
      <div className="profil-cover-caption">
        <span className="profil-cover-spark" aria-hidden="true">
          ✦
        </span>
        <span>Tes sorties, tes groupes et tes découvertes au même endroit</span>
      </div>
    </div>
  );
}

function ProfilCardHeading({
  eyebrow,
  title,
  icon
}: {
  eyebrow: string;
  title: string;
  icon: string;
}) {
  return (
    <div className="profil-card-heading">
      <span className="profil-card-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <span>{eyebrow}</span>
        <h3>{title}</h3>
      </div>
    </div>
  );
}

function ProfilStatsCard({ authToken }: { authToken: string | undefined }) {
  const { stats, state } = useProfileStats(authToken);
  const statItems = stats
    ? [
        { value: stats.eventsAttended, label: 'Sorties vécues', icon: '◫' },
        { value: stats.venuesDiscovered, label: 'Lieux découverts', icon: '⌖' },
        { value: stats.groupsJoined, label: 'Groupes rejoints', icon: '♟' },
        { value: stats.favoritesCount, label: 'Favoris gardés', icon: '♡' }
      ]
    : [];

  return (
    <div className="profil-side-card profil-stats-card">
      <ProfilCardHeading
        eyebrow="Ton parcours"
        title="En quelques chiffres"
        icon="↗"
      />
      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'error' && (
        <p className="list-view-empty">
          Impossible de charger vos stats pour le moment.
        </p>
      )}
      {state === 'success' && stats && (
        <div className="profil-stats-grid">
          {statItems.map((item) => (
            <div className="profil-stat-tile" key={item.label}>
              <span className="profil-stat-icon" aria-hidden="true">
                {item.icon}
              </span>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Pre-existing feature (Phase 1.3), just relocated from the old flat "Mon
// compte" card into its own side card - a real aggregation of the account's
// own favorites, not simulated data.
function ProfilTrendsCard({ authToken }: { authToken: string | undefined }) {
  const { trends, state } = useTrends(authToken);

  const hasTrends =
    trends &&
    (trends.eventCategories.length > 0 || trends.venueCategories.length > 0);

  return (
    <div className="profil-side-card profil-trends-card">
      <ProfilCardHeading
        eyebrow="D’après tes favoris"
        title="Tes tendances"
        icon="✦"
      />
      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'error' && (
        <p className="list-view-empty">
          Impossible de charger vos tendances pour le moment.
        </p>
      )}
      {state === 'success' && !hasTrends && (
        <p className="list-view-empty">
          Ajoutez des favoris pour voir vos tendances apparaître ici.
        </p>
      )}
      {state === 'success' && hasTrends && trends && (
        <div className="compte-trends-lists">
          {trends.eventCategories.length > 0 && (
            <div className="compte-trends-group">
              <h4>Catégories d'événements</h4>
              <ul>
                {trends.eventCategories.map((entry) => (
                  <li key={entry.category}>
                    <span>{getCategoryLabel('fr', entry.category)}</span>
                    <span className="compte-trends-count">{entry.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {trends.venueCategories.length > 0 && (
            <div className="compte-trends-group">
              <h4>Types de lieux</h4>
              <ul>
                {trends.venueCategories.map((entry) => (
                  <li key={entry.category}>
                    <span>{VENUE_CATEGORY_LABELS.fr[entry.category]}</span>
                    <span className="compte-trends-count">{entry.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProfilAmisCard({
  friends,
  onOpenAmis
}: {
  friends: PublicUser[];
  onOpenAmis: () => void;
}) {
  return (
    <div className="profil-side-card profil-friends-card">
      <div className="profil-side-card-header">
        <ProfilCardHeading
          eyebrow="Ton cercle"
          title={`${friends.length} ami${friends.length !== 1 ? 's' : ''}`}
          icon="☺"
        />
        <button type="button" className="text-btn" onClick={onOpenAmis}>
          Voir tout
        </button>
      </div>
      {friends.length === 0 && (
        <p className="list-view-empty">Aucun ami pour le moment.</p>
      )}
      {friends.length > 0 && (
        <div className="profil-friends-avatars">
          {friends.slice(0, 6).map((friend) => (
            <span
              className="friends-row-avatar friends-row-avatar-md"
              key={friend.id}
              title={friend.displayName}
            >
              {friend.avatarUrl ? (
                <img src={friend.avatarUrl} alt="" />
              ) : (
                friend.displayName.slice(0, 1).toUpperCase()
              )}
            </span>
          ))}
          {friends.length > 6 && (
            <span className="profil-friends-more">+{friends.length - 6}</span>
          )}
        </div>
      )}
    </div>
  );
}

function ProfilActivityRecentCard({
  authToken,
  onSeeAll
}: {
  authToken: string | undefined;
  onSeeAll: () => void;
}) {
  const { activity, state } = useActivity(authToken, 4);
  return (
    <div className="profil-side-card profil-recent-card">
      <ProfilCardHeading
        eyebrow="Derniers mouvements"
        title="Activité récente"
        icon="↗"
      />
      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'error' && (
        <p className="list-view-empty">Impossible de charger votre activité.</p>
      )}
      {state === 'success' && (
        <ActivityList
          entries={activity}
          emptyMessage="Aucune activité pour le moment."
        />
      )}
      <button type="button" className="profil-card-link" onClick={onSeeAll}>
        Voir toute mon activité <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}

function ApercuTab({
  attendance,
  onOpenDetails,
  locale,
  onSeeMoreUpcoming,
  onSeeMorePast
}: {
  attendance: Record<string, AttendanceVisibility>;
  onOpenDetails: (eventId: string) => void;
  locale: SupportedLocale;
  onSeeMoreUpcoming: () => void;
  onSeeMorePast: () => void;
}) {
  const upcoming = useAttendanceEvents(attendance, 'upcoming');
  const past = useAttendanceEvents(attendance, 'past');
  return (
    <div className="profil-tab-content">
      <div className="profil-welcome-strip">
        <div>
          <span className="profil-section-kicker">Ton agenda</span>
          <h2>Prêt pour ta prochaine sortie ?</h2>
          <p>Retrouve ici les événements auxquels tu as prévu de participer.</p>
        </div>
        <span className="profil-welcome-glyph" aria-hidden="true">
          ✦
        </span>
      </div>
      <div className="dashboard-home-section profil-events-section">
        <div className="list-view-heading profil-section-heading">
          <div>
            <span className="profil-section-kicker">À l’horizon</span>
            <h3>Mes prochaines sorties</h3>
          </div>
          {upcoming.events.length > 0 && (
            <button
              type="button"
              className="text-btn"
              onClick={onSeeMoreUpcoming}
            >
              Voir tout
            </button>
          )}
        </div>
        {upcoming.state === 'success' && upcoming.events.length === 0 && (
          <p className="list-view-empty">
            Aucun événement à venir pour le moment.
          </p>
        )}
        <EventCarouselRow
          events={upcoming.events.slice(0, 4)}
          onOpenDetails={onOpenDetails}
          locale={locale}
        />
      </div>
      <div className="dashboard-home-section profil-events-section">
        <div className="list-view-heading profil-section-heading">
          <div>
            <span className="profil-section-kicker">Souvenirs</span>
            <h3>Mes sorties passées</h3>
          </div>
          {past.events.length > 0 && (
            <button type="button" className="text-btn" onClick={onSeeMorePast}>
              Voir tout
            </button>
          )}
        </div>
        {past.state === 'success' && past.events.length === 0 && (
          <p className="list-view-empty">
            Aucun événement passé pour le moment.
          </p>
        )}
        <EventCarouselRow
          events={past.events.slice(0, 5)}
          onOpenDetails={onOpenDetails}
          locale={locale}
        />
      </div>
    </div>
  );
}

function MesEvenementsTab({
  attendance,
  onOpenDetails,
  locale
}: {
  attendance: Record<string, AttendanceVisibility>;
  onOpenDetails: (eventId: string) => void;
  locale: SupportedLocale;
}) {
  const { events, state } = useAttendanceEvents(attendance, 'upcoming');
  // Past events used to live behind the sidebar's "Historique" shortcut.
  // That shortcut is gone, and Aperçu's "voir plus" for past events already
  // pointed at this tab, so this is where the history belongs.
  const { events: pastEvents, state: pastState } = useAttendanceEvents(
    attendance,
    'past'
  );
  return (
    <div className="profil-tab-content">
      <h3 className="profil-tab-section-title">À venir</h3>
      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'success' && events.length === 0 && (
        <p className="list-view-empty">
          Vous n'avez pas encore d'événement à venir.
        </p>
      )}
      <EventCarouselRow
        events={events}
        onOpenDetails={onOpenDetails}
        locale={locale}
      />

      <h3 className="profil-tab-section-title">Historique</h3>
      {pastState === 'loading' && (
        <p className="list-view-empty">Chargement…</p>
      )}
      {pastState === 'success' && pastEvents.length === 0 && (
        <p className="list-view-empty">Aucun événement passé pour l'instant.</p>
      )}
      <EventCarouselRow
        events={pastEvents}
        onOpenDetails={onOpenDetails}
        locale={locale}
      />
    </div>
  );
}

function ActiviteTab({ authToken }: { authToken: string | undefined }) {
  const { activity, state } = useActivity(authToken, 50);
  return (
    <div className="profil-tab-content">
      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'error' && (
        <p className="list-view-empty">Impossible de charger votre activité.</p>
      )}
      {state === 'success' && (
        <ActivityList
          entries={activity}
          emptyMessage="Aucune activité pour le moment."
        />
      )}
    </div>
  );
}

function CompteSection({
  user,
  authToken,
  onUserUpdated,
  onLogout,
  locale,
  onChangeLocale,
  attendance,
  favorites,
  onToggleFavorite,
  onOpenDetails,
  favoriteVenueGroups,
  favoriteVenues,
  onToggleFavoriteVenue,
  onSelectVenue,
  onOpenAmis
}: {
  user: User;
  authToken: string | undefined;
  onUserUpdated: (user: User) => void;
  onLogout: () => void;
  locale: SupportedLocale;
  onChangeLocale: (locale: SupportedLocale) => void;
  attendance: Record<string, AttendanceVisibility>;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onOpenDetails: (id: string) => void;
  favoriteVenueGroups: VenueGroup[];
  favoriteVenues: string[];
  onToggleFavoriteVenue: (id: string) => void;
  onSelectVenue: (group: VenueGroup) => void;
  onOpenAmis: () => void;
}) {
  const [tab, setTab] = useState<ProfilTab>('apercu');
  const [editing, setEditing] = useState(false);
  const [friends, setFriends] = useState<PublicUser[]>([]);

  useEffect(() => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/me/friends`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => setFriends(friendsResponseSchema.parse(json).data))
      .catch(() => {});
  }, [authToken]);

  return (
    <section className="map-container-wrapper profil-page">
      <ProfilHeader
        user={user}
        friendsCount={friends.length}
        onEdit={() => setEditing(true)}
      />

      <div className="profil-body">
        <div className="profil-main">
          <nav className="profil-tabs" aria-label="Sections de mon espace">
            {PROFIL_TABS.map((item) => (
              <button
                type="button"
                key={item.id}
                className={tab === item.id ? 'active' : ''}
                onClick={() => setTab(item.id)}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          {tab === 'apercu' && (
            <ApercuTab
              attendance={attendance}
              onOpenDetails={onOpenDetails}
              locale={locale}
              onSeeMoreUpcoming={() => setTab('mes-evenements')}
              onSeeMorePast={() => setTab('mes-evenements')}
            />
          )}
          {tab === 'mes-evenements' && (
            <MesEvenementsTab
              attendance={attendance}
              onOpenDetails={onOpenDetails}
              locale={locale}
            />
          )}
          {tab === 'favoris' && (
            <div className="profil-tab-content">
              <FavorisSection
                favorites={favorites}
                onToggleFavorite={onToggleFavorite}
                onOpenDetails={onOpenDetails}
                favoriteVenueGroups={favoriteVenueGroups}
                favoriteVenues={favoriteVenues}
                onToggleFavoriteVenue={onToggleFavoriteVenue}
                onSelectVenue={onSelectVenue}
                locale={locale}
                authToken={authToken}
                variant="embedded"
              />
            </div>
          )}
          {tab === 'groupes' && (
            <div className="profil-tab-content">
              <GroupsBlock authToken={authToken} userId={user.id} />
            </div>
          )}
          {tab === 'activite' && <ActiviteTab authToken={authToken} />}
        </div>

        <div className="profil-side">
          <ProfilStatsCard authToken={authToken} />
          <ProfilAmisCard friends={friends} onOpenAmis={onOpenAmis} />
          <ProfilTrendsCard authToken={authToken} />
          <ProfilActivityRecentCard
            authToken={authToken}
            onSeeAll={() => setTab('activite')}
          />
          <div className="profil-side-card profil-settings-card">
            <ProfilCardHeading
              eyebrow="Préférences"
              title="Mon compte"
              icon="⚙"
            />
            <div className="profil-settings-row">
              <div>
                <strong>Langue de l’interface</strong>
                <span>Choisis la langue de Pulso</span>
              </div>
              <LanguageSelector locale={locale} onChange={onChangeLocale} />
            </div>
            <button
              type="button"
              className="profil-logout-btn"
              onClick={onLogout}
            >
              <span aria-hidden="true">↪</span> Se déconnecter
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <EditProfileModal
          user={user}
          authToken={authToken}
          onClose={() => setEditing(false)}
          onSaved={onUserUpdated}
        />
      )}
    </section>
  );
}

const FRIEND_REQUEST_ERROR_MESSAGES: Record<string, string> = {
  FRIEND_CODE_NOT_FOUND: 'Aucun compte ne correspond à ce code.',
  CANNOT_FRIEND_SELF: 'Vous ne pouvez pas vous ajouter vous-même.',
  FRIENDSHIP_ALREADY_EXISTS:
    'Vous êtes déjà amis, ou une demande est déjà en attente.'
};

// A friend's real detail panel (Phase 4.15) - profile fields (bio/
// createdAt) that already existed but were never shared before, real
// mutual events (respecting the friend's own visibility choice), and a
// real activity feed (friends-visible attendance only). No online/offline
// status anywhere.
function FriendDetailPanel({
  friend,
  authToken,
  mutualCount,
  locale,
  attendance,
  onOpenEventForum,
  onMessage,
  onBack
}: {
  friend: PublicUser;
  authToken: string | undefined;
  mutualCount: number;
  locale: SupportedLocale;
  attendance: Record<string, AttendanceVisibility>;
  onOpenEventForum: (eventId: string) => void;
  onMessage: () => void;
  onBack: () => void;
}) {
  const [profile, setProfile] = useState<FriendProfile>();
  const [mutualEvents, setMutualEvents] = useState<PublicEvent[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [inviteEventOpen, setInviteEventOpen] = useState(false);

  useEffect(() => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/me/friends/${friend.id}/profile`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => setProfile(friendProfileResponseSchema.parse(json).data))
      .catch(() => setProfile(undefined));
  }, [authToken, friend.id]);

  useEffect(() => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/me/friends/${friend.id}/mutual-events`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        const ids = mutualEventIdsResponseSchema.parse(json).data;
        if (ids.length === 0) {
          setMutualEvents([]);
          return;
        }
        return fetch(`${API_BASE_URL}/events/by-ids?ids=${ids.join(',')}`)
          .then((response) =>
            response.ok ? response.json() : Promise.reject()
          )
          .then((eventsJson) =>
            setMutualEvents(eventListResponseSchema.parse(eventsJson).data)
          );
      })
      .catch(() => setMutualEvents([]));
  }, [authToken, friend.id]);

  useEffect(() => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/me/friends/${friend.id}/activity`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => setActivity(activityResponseSchema.parse(json).data))
      .catch(() => setActivity([]));
  }, [authToken, friend.id]);

  const now = Date.now();
  const upcomingMutual = mutualEvents
    .filter((evt) => new Date(evt.startsAt).getTime() >= now)
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    );
  const nextOuting = upcomingMutual[0];

  return (
    <div className="friend-detail">
      <div className="friend-detail-hero">
        <button type="button" className="friend-detail-back" onClick={onBack}>
          <span aria-hidden="true">←</span> Mes amis
        </button>
        <div className="friend-detail-cover" aria-hidden="true">
          <span>✦</span>
        </div>
        <div className="friend-detail-header">
          <span className="friends-row-avatar friends-row-avatar-xl">
            {friend.avatarUrl ? (
              <img src={friend.avatarUrl} alt="" />
            ) : (
              friend.displayName.slice(0, 1).toUpperCase()
            )}
          </span>
          <div className="friend-detail-identity">
            <span className="amis-page-kicker">Dans ton cercle</span>
            <h2>{friend.displayName}</h2>
            <div className="friend-detail-meta-row">
              {profile?.createdAt && (
                <span>
                  Membre depuis {formatMemberSince(profile.createdAt)}
                </span>
              )}
              {mutualCount > 0 && (
                <span>
                  {mutualCount} ami{mutualCount > 1 ? 's' : ''} en commun
                </span>
              )}
            </div>
            <p
              className={`friend-detail-bio ${profile?.bio ? '' : 'is-empty'}`}
            >
              {profile?.bio || 'Aucune bio partagée pour le moment.'}
            </p>
          </div>
          <div className="friend-detail-actions">
            <button
              type="button"
              className="primary-action-btn friend-detail-cta"
              onClick={onMessage}
            >
              <span aria-hidden="true">✉</span> Message
            </button>
            <button
              type="button"
              className="btn-secondary friend-detail-invite"
              onClick={() => setInviteEventOpen(true)}
            >
              <span aria-hidden="true">＋</span> Proposer une sortie
            </button>
          </div>
        </div>
      </div>

      {nextOuting && (
        <div className="friend-next-outing">
          <div className="friend-section-title">
            <div>
              <span>À l’horizon</span>
              <h3>Votre prochaine sortie en commun</h3>
            </div>
            <span className="friend-next-status">Prévue</span>
          </div>
          <button
            type="button"
            className="friend-next-row"
            onClick={() => onOpenEventForum(nextOuting.id)}
          >
            <span className="friend-next-date">
              <strong>
                {new Date(nextOuting.startsAt).toLocaleDateString('fr-CA', {
                  day: '2-digit'
                })}
              </strong>
              <span>
                {new Date(nextOuting.startsAt).toLocaleDateString('fr-CA', {
                  month: 'short'
                })}
              </span>
            </span>
            <span
              className="card-badge"
              style={{
                background:
                  CATEGORY_COLORS[nextOuting.category] ??
                  CATEGORY_COLORS['other']
              }}
            >
              {SHORT_CATEGORY_LABELS[locale][nextOuting.category]}
            </span>
            <span className="venue-detail-event-info">
              <strong>{nextOuting.title}</strong>
              <span>
                {nextOuting.venue.name} ·{' '}
                {new Date(nextOuting.startsAt).toLocaleTimeString('fr-CA', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </span>
            <span className="friend-next-arrow" aria-hidden="true">
              →
            </span>
          </button>
        </div>
      )}

      <div className="dashboard-home-section friend-detail-section">
        <div className="friend-section-title">
          <div>
            <span>Vos rendez-vous</span>
            <h2>Événements en commun</h2>
          </div>
          <strong>{mutualEvents.length}</strong>
        </div>
        {mutualEvents.length === 0 ? (
          <p className="list-view-empty">
            Aucun événement en commun pour l'instant.
          </p>
        ) : (
          <EventCarouselRow
            events={mutualEvents}
            onOpenDetails={onOpenEventForum}
            locale={locale}
          />
        )}
      </div>

      <div className="friend-detail-section">
        <div className="friend-section-title">
          <div>
            <span>Historique partagé</span>
            <h2>Activité récente</h2>
          </div>
        </div>
        <ActivityList
          entries={activity}
          emptyMessage="Rien à afficher pour l'instant."
        />
      </div>

      {inviteEventOpen && (
        <InviteFriendToEventModal
          friend={friend}
          authToken={authToken}
          attendance={attendance}
          onClose={() => setInviteEventOpen(false)}
        />
      )}
    </div>
  );
}

// "Inviter à un événement" (Phase 4.15) - picks from the viewer's own real
// upcoming events (the same real attendance data as "Mes événements") and
// sends it as a real message, reusing the exact same send-a-link mechanism
// as ShareToFriendModal/InviteToGroupModal.
function InviteFriendToEventModal({
  friend,
  authToken,
  attendance,
  onClose
}: {
  friend: PublicUser;
  authToken: string | undefined;
  attendance: Record<string, AttendanceVisibility>;
  onClose: () => void;
}) {
  const { events, state } = useAttendanceEvents(attendance, 'upcoming');
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [sendingId, setSendingId] = useState<string>();

  const sendEvent = (event: PublicEvent) => {
    if (!authToken || sendingId) return;
    setSendingId(event.id);
    const url = `${window.location.origin}/events/${event.id}`;
    fetch(`${API_BASE_URL}/me/friends/${friend.id}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ body: `${event.title}\n${url}` })
    })
      .then((response) => (response.ok ? undefined : Promise.reject()))
      .then(() => setSentTo((prev) => new Set(prev).add(event.id)))
      .catch(() => {})
      .finally(() => setSendingId(undefined));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="share-friend-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="conversation-modal-header">
          <strong>Inviter {friend.displayName} à un événement</strong>
          <button type="button" className="text-btn" onClick={onClose}>
            Fermer
          </button>
        </div>
        <div className="share-friend-list">
          {state === 'loading' && (
            <p className="list-view-empty">Chargement…</p>
          )}
          {state === 'success' && events.length === 0 && (
            <p className="list-view-empty">
              Marque ta présence sur un événement pour pouvoir l'inviter.
            </p>
          )}
          {state === 'success' &&
            events.map((event) => (
              <div className="friends-row" key={event.id}>
                <span className="friends-row-name">{event.title}</span>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => sendEvent(event)}
                  disabled={sendingId === event.id || sentTo.has(event.id)}
                >
                  {sentTo.has(event.id)
                    ? 'Envoyé ✓'
                    : sendingId === event.id
                      ? 'Envoi…'
                      : 'Inviter'}
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// "Ton code ami" (unchanged mechanism, moved into a modal so the friends
// list isn't permanently cluttered by it) + the existing by-code add form.
function InviteFriendModal({
  friendCode,
  authToken,
  onSent,
  onClose
}: {
  friendCode: string | undefined;
  authToken: string | undefined;
  onSent: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [sendError, setSendError] = useState<string>();
  const [sending, setSending] = useState(false);

  const sendRequest = () => {
    if (!authToken || !codeInput.trim() || sending) return;
    setSending(true);
    setSendError(undefined);
    fetch(`${API_BASE_URL}/me/friends/requests`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ friendCode: codeInput.trim() })
    })
      .then((response) => {
        if (response.status === 204) {
          setCodeInput('');
          onSent();
          return;
        }
        return response.json().then((json) => {
          setSendError(
            FRIEND_REQUEST_ERROR_MESSAGES[json?.error?.code] ??
              "Impossible d'envoyer la demande pour le moment."
          );
        });
      })
      .finally(() => setSending(false));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="share-friend-modal amis-invite-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="conversation-modal-header">
          <div className="amis-modal-title">
            <span className="amis-page-kicker">Agrandir ton cercle</span>
            <strong>Inviter un ami</strong>
            <p>Échangez vos codes personnels pour vous retrouver sur Pulso.</p>
          </div>
          <button type="button" className="text-btn" onClick={onClose}>
            Fermer
          </button>
        </div>
        <div className="amis-invite-modal-body">
          {friendCode && (
            <div className="amis-code-card">
              <span className="amis-code-icon" aria-hidden="true">
                🔗
              </span>
              <div className="amis-code-info">
                <p>Ton code ami</p>
                <strong>{friendCode}</strong>
              </div>
              <button
                type="button"
                className="amis-code-copy"
                onClick={() => {
                  void navigator.clipboard.writeText(friendCode);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? 'Copié !' : 'Copier'}
              </button>
            </div>
          )}
          <form
            className="amis-add-form"
            onSubmit={(event) => {
              event.preventDefault();
              sendRequest();
            }}
          >
            <input
              value={codeInput}
              onChange={(event) => setCodeInput(event.target.value)}
              placeholder="Coller le code d'un ami pour l'ajouter"
              aria-label="Code ami à ajouter"
              maxLength={32}
            />
            <button
              type="submit"
              className="amis-add-btn"
              disabled={!codeInput.trim() || sending}
            >
              Ajouter
            </button>
          </form>
          {sendError && <p className="friends-error">{sendError}</p>}
        </div>
      </div>
    </div>
  );
}

// "Amis sur la carte" (Phase 4.15) - real venues from friends' real,
// upcoming, friends-visible attendance. Never a live/last-known position -
// no such data exists anywhere in Pulso.
function FriendsMapModal({
  entries,
  eventsById,
  onOpenEventForum,
  onClose
}: {
  entries: FriendsMapEntry[];
  eventsById: Map<string, PublicEvent>;
  onOpenEventForum: (eventId: string) => void;
  onClose: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const points = entries
    .map((entry) => ({ entry, event: eventsById.get(entry.eventId) }))
    .filter(
      (row): row is { entry: FriendsMapEntry; event: PublicEvent } =>
        row.event !== undefined
    );
  const pointsKey = points
    .map((row) => `${row.entry.friend.id}-${row.event.id}`)
    .join(',');

  useEffect(() => {
    if (!container.current || points.length === 0) return;
    const instance = new maplibregl.Map({
      container: container.current,
      center: [
        points[0]!.event.venue.point.longitude,
        points[0]!.event.venue.point.latitude
      ],
      zoom: 12,
      style: MAP_STYLE_URL,
      attributionControl: false
    });
    for (const { event } of points) {
      new maplibregl.Marker({ color: '#c026d3' })
        .setLngLat([event.venue.point.longitude, event.venue.point.latitude])
        .addTo(instance);
    }
    if (points.length > 1) {
      const bounds = points.reduce(
        (acc, { event }) =>
          acc.extend([event.venue.point.longitude, event.venue.point.latitude]),
        new maplibregl.LngLatBounds()
      );
      instance.fitBounds(bounds, { padding: 60, maxZoom: 14 });
    }
    return () => instance.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="friends-map-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="conversation-modal-header">
          <strong>Amis sur la carte</strong>
          <button type="button" className="text-btn" onClick={onClose}>
            Fermer
          </button>
        </div>
        {points.length === 0 ? (
          <p className="list-view-empty">
            Aucun ami n'a de sortie à venir partagée pour l'instant.
          </p>
        ) : (
          <>
            <div className="friends-map-canvas" ref={container} />
            <div className="friends-map-list">
              {points.map(({ entry, event }) => (
                <button
                  type="button"
                  key={`${entry.friend.id}-${event.id}`}
                  className="friends-map-row"
                  onClick={() => {
                    onOpenEventForum(event.id);
                    onClose();
                  }}
                >
                  <span className="friends-row-avatar">
                    {entry.friend.avatarUrl ? (
                      <img src={entry.friend.avatarUrl} alt="" />
                    ) : (
                      entry.friend.displayName.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="friends-map-row-info">
                    <strong>{entry.friend.displayName}</strong>
                    <span>
                      {event.title} · {event.venue.name}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Shared by ConversationModal (Amis page's per-friend "Message" button,
// unchanged) and the Messages page's inline conversation pane (Phase 4.9
// redesign) - same fetch/send/read logic and message list, just mounted
// inside different chrome (a modal overlay vs. a persistent split-view
// column). Read receipts (✓ sent / ✓✓ read) use the real `readAt` field
// that already existed on Message - never simulated.
function ConversationThread({
  friend,
  authToken,
  onActivity
}: {
  friend: PublicUser;
  authToken: string | undefined;
  // Fired after a message is sent or the conversation is marked read, so
  // a parent showing a conversation LIST (unread badges, last-message
  // preview) can refresh itself - ConversationModal has no such list, so
  // it simply omits this prop.
  onActivity?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const refresh = useCallback(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/me/friends/${friend.id}/messages`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setMessages(conversationResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken, friend.id]);

  useEffect(() => {
    refresh();
    if (!authToken) return;
    fetch(`${API_BASE_URL}/me/friends/${friend.id}/messages/read`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${authToken}` }
    }).then(() => onActivity?.());
    // onActivity is intentionally excluded - it's a fresh closure each
    // render from inline callers and would otherwise re-fire this PUT on
    // every parent re-render instead of once per friend switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, authToken, friend.id]);

  const sendMessage = () => {
    if (!authToken || !draft.trim() || sending) return;
    setSending(true);
    fetch(`${API_BASE_URL}/me/friends/${friend.id}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ body: draft.trim() })
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(() => {
        setDraft('');
        refresh();
        onActivity?.();
      })
      .catch(() => {})
      .finally(() => setSending(false));
  };
  let previousDayKey = '';

  return (
    <>
      <div className="conversation-messages">
        {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
        {state === 'error' && (
          <p className="list-view-empty">
            Impossible de charger la conversation.
          </p>
        )}
        {state === 'success' && messages.length === 0 && (
          <div className="conversation-empty-state">
            <span className="friends-row-avatar friends-row-avatar-lg">
              {friend.avatarUrl ? (
                <img src={friend.avatarUrl} alt="" />
              ) : (
                friend.displayName.slice(0, 1).toUpperCase()
              )}
            </span>
            <strong>Commence la conversation avec {friend.displayName}.</strong>
            <p>
              Un événement à partager ou une sortie à préparer ? Écris le
              premier message.
            </p>
          </div>
        )}
        {state === 'success' &&
          messages.map((message) => {
            const incoming = message.senderId === friend.id;
            const dayKey = new Date(message.createdAt).toLocaleDateString(
              'en-CA',
              { timeZone: 'America/Toronto' }
            );
            const showDayDivider = dayKey !== previousDayKey;
            previousDayKey = dayKey;
            return (
              <Fragment key={message.id}>
                {showDayDivider && (
                  <div className="conversation-day-divider">
                    <span>{formatConversationDayLabel(message.createdAt)}</span>
                  </div>
                )}
                <div
                  className={`conversation-message-row ${incoming ? 'incoming' : 'outgoing'}`}
                >
                  {incoming && (
                    <span className="friends-row-avatar conversation-message-avatar">
                      {friend.avatarUrl ? (
                        <img src={friend.avatarUrl} alt="" />
                      ) : (
                        friend.displayName.slice(0, 1).toUpperCase()
                      )}
                    </span>
                  )}
                  <div
                    className={`conversation-message ${incoming ? 'incoming' : 'outgoing'}`}
                  >
                    <span className="conversation-message-body">
                      {message.body}
                    </span>
                    <span className="conversation-message-meta">
                      {formatMessageTimestamp(message.createdAt)}
                      {!incoming && (
                        <span
                          className={`conversation-message-receipt ${message.readAt ? 'read' : ''}`}
                          aria-label={message.readAt ? 'Lu' : 'Envoyé'}
                        >
                          {message.readAt ? '✓✓' : '✓'}
                        </span>
                      )}
                    </span>
                    {incoming && (
                      <button
                        type="button"
                        className="conversation-message-report"
                        onClick={() =>
                          reportContent(authToken, 'message', message.id)
                        }
                      >
                        Signaler
                      </button>
                    )}
                  </div>
                </div>
              </Fragment>
            );
          })}
      </div>
      <form
        className="forum-composer message-composer"
        onSubmit={(event) => {
          event.preventDefault();
          sendMessage();
        }}
      >
        <div className="message-composer-box">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Écrire à ${friend.displayName}…`}
            aria-label={`Écrire un message à ${friend.displayName}`}
            maxLength={2000}
            rows={2}
          />
          <div className="message-composer-footer">
            <span>{draft.length}/2000</span>
            <button
              type="submit"
              className="btn-secondary"
              disabled={sending || !draft.trim()}
            >
              {sending ? 'Envoi…' : 'Envoyer'} <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </form>
    </>
  );
}

function ConversationModal({
  friend,
  authToken,
  onClose
}: {
  friend: PublicUser;
  authToken: string | undefined;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="conversation-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="conversation-modal-header">
          <span className="conversation-modal-friend">
            <span className="friends-row-avatar friends-row-avatar-md">
              {friend.avatarUrl ? (
                <img src={friend.avatarUrl} alt="" />
              ) : (
                friend.displayName.slice(0, 1).toUpperCase()
              )}
            </span>
            <strong>{friend.displayName}</strong>
          </span>
          <button type="button" className="text-btn" onClick={onClose}>
            Fermer
          </button>
        </div>
        <ConversationThread friend={friend} authToken={authToken} />
      </div>
    </div>
  );
}

// Own block for the same reason as FriendsBlock above: its own
// fetch/mutate cycle, only renders once signed in. Group membership here
// is always self-service (DEC-0013) - no invite/approval step to model.
function GroupsBlock({
  authToken,
  userId
}: {
  authToken: string | undefined;
  userId: string;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<GroupVisibility>('open');
  const [creating, setCreating] = useState(false);
  const [openGroup, setOpenGroup] = useState<Group>();

  const refresh = useCallback(() => {
    if (!authToken) return;
    setLoadState('loading');
    fetch(`${API_BASE_URL}/me/groups`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setGroups(groupsResponseSchema.parse(json).data);
        setLoadState('success');
      })
      .catch(() => setLoadState('error'));
  }, [authToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createGroup = () => {
    if (!authToken || !name.trim() || creating) return;
    setCreating(true);
    fetch(`${API_BASE_URL}/me/groups`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        name: name.trim(),
        visibility,
        ...(description.trim() ? { description: description.trim() } : {})
      })
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(() => {
        setName('');
        setDescription('');
        setVisibility('open');
        refresh();
      })
      .catch(() => {})
      .finally(() => setCreating(false));
  };

  return (
    <div className="compte-block">
      <h3>Mes groupes</h3>
      {loadState === 'loading' && (
        <p className="list-view-empty">Chargement…</p>
      )}
      {loadState === 'error' && (
        <p className="list-view-empty">
          Impossible de charger vos groupes pour le moment.
        </p>
      )}
      {loadState === 'success' && (
        <div className="friends-block">
          <form
            className="friends-add-form groups-create-form"
            onSubmit={(event) => {
              event.preventDefault();
              createGroup();
            }}
          >
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nom du groupe"
              maxLength={80}
            />
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Description (optionnel)"
              maxLength={500}
            />
            <div className="groups-visibility-choice">
              <label>
                <input
                  type="radio"
                  name="group-visibility"
                  checked={visibility === 'open'}
                  onChange={() => setVisibility('open')}
                />
                Accès libre — tout le monde peut rejoindre
              </label>
              <label>
                <input
                  type="radio"
                  name="group-visibility"
                  checked={visibility === 'restricted'}
                  onChange={() => setVisibility('restricted')}
                />
                Accès limité — sur demande, approuvée par toi
              </label>
            </div>
            <button
              type="submit"
              className="btn-secondary"
              disabled={creating || !name.trim()}
            >
              Créer
            </button>
          </form>

          <div className="friends-list">
            {groups.length === 0 && (
              <p className="list-view-empty">Aucun groupe pour le moment.</p>
            )}
            {groups.map((group) => (
              <div className="friends-row" key={group.id}>
                <span className="friends-row-name">
                  {group.name}
                  <span className="compte-trends-count">
                    {group.memberCount}
                  </span>
                </span>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => setOpenGroup(group)}
                >
                  Ouvrir
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {openGroup && (
        <GroupModal
          group={openGroup}
          authToken={authToken}
          userId={userId}
          onClose={() => setOpenGroup(undefined)}
          onLeft={() => {
            setOpenGroup(undefined);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// Phase 4.10 ("Groupes avancés") - the rich detail content shared by the
// modal chrome (GroupModal, unchanged call sites: sidebar mini-list,
// GroupsBlock, ForumPanel's meetup flow) and the new inline pane inside
// Messages' "Groupes" tabs. Everything here is real: member avatars/count,
// a moderator's real pending-request queue, a meetup point derived from
// the linked event's actual venue, and member-added schedule/attendance/
// checklist modules - no online presence, no kick/removal, no content
// moderation beyond the existing author-only delete (DEC-0013 v1.2).
type GroupDetailTab = 'organize' | 'discussion' | 'members' | 'manage';

function GroupDetailContent({
  group,
  authToken,
  userId,
  onGroupUpdated,
  onLeave,
  onOpenEventForum
}: {
  group: Group;
  authToken: string | undefined;
  userId: string;
  onGroupUpdated: (group: Group) => void;
  onLeave?: () => void;
  onOpenEventForum?: (eventId: string) => void;
}) {
  const [posts, setPosts] = useState<GroupPost[]>([]);
  const [postsState, setPostsState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(
    new Set()
  );
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<PublicUser[]>([]);
  const [joining, setJoining] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [tab, setTab] = useState<GroupDetailTab>('organize');

  useEffect(() => {
    setTab('organize');
  }, [group.id]);

  const refreshPosts = useCallback(() => {
    if (!authToken || !group.isMember) return;
    setPostsState('loading');
    fetch(`${API_BASE_URL}/groups/${group.id}/posts`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setPosts(groupPostsResponseSchema.parse(json).data);
        setPostsState('success');
      })
      .catch(() => setPostsState('error'));
  }, [authToken, group.id, group.isMember]);

  useEffect(() => {
    refreshPosts();
  }, [refreshPosts]);

  useEffect(() => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/groups/${group.id}/members`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => setMembers(groupMembersResponseSchema.parse(json).data))
      .catch(() => {});
  }, [authToken, group.id]);

  const refreshGroup = useCallback(() => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/groups/${group.id}`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => onGroupUpdated(groupResponseSchema.parse(json).data))
      .catch(() => {});
  }, [authToken, group.id, onGroupUpdated]);

  const joinGroupAction = () => {
    if (!authToken || joining) return;
    setJoining(true);
    fetch(`${API_BASE_URL}/groups/${group.id}/members`, {
      method: 'POST',
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(() => refreshGroup())
      .catch(() => {})
      .finally(() => setJoining(false));
  };

  const leaveGroupAction = () => {
    if (!authToken) return;
    void fetch(`${API_BASE_URL}/groups/${group.id}/members`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${authToken}` }
    }).then(() => {
      if (onLeave) onLeave();
      else refreshGroup();
    });
  };

  // Phase 4.14 - which groups show in the sidebar shortcut list is the
  // member's own choice, not "every group I've joined". Optimistic: the
  // route returns 204, there's nothing to reconcile against.
  const [pinning, setPinning] = useState(false);
  const togglePin = () => {
    if (!authToken || pinning) return;
    setPinning(true);
    const nextPinned = !group.pinned;
    fetch(`${API_BASE_URL}/groups/${group.id}/pin`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ pinned: nextPinned })
    })
      .then((response) =>
        response.ok
          ? onGroupUpdated({ ...group, pinned: nextPinned })
          : Promise.reject()
      )
      .catch(() => {})
      .finally(() => setPinning(false));
  };

  const submitPost = (parentId?: string) => {
    const body = (parentId ? replyDrafts[parentId] : draft)?.trim();
    if (!authToken || !body || posting) return;
    setPosting(true);
    fetch(`${API_BASE_URL}/groups/${group.id}/posts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ body, ...(parentId ? { parentId } : {}) })
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(() => {
        if (parentId) {
          setReplyDrafts((prev) => ({ ...prev, [parentId]: '' }));
          setExpandedReplies((prev) => new Set(prev).add(parentId));
        } else {
          setDraft('');
        }
        refreshPosts();
      })
      .catch(() => {})
      .finally(() => setPosting(false));
  };

  const removePost = (postId: string) => {
    if (!authToken) return;
    void fetch(`${API_BASE_URL}/groups/${group.id}/posts/${postId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${authToken}` }
    }).then(() => refreshPosts());
  };

  const toggleLike = (post: GroupPost) => {
    if (!authToken) return;
    setPosts((prev) =>
      prev.map((candidate) =>
        candidate.id === post.id
          ? {
              ...candidate,
              likedByMe: !candidate.likedByMe,
              likeCount: candidate.likeCount + (candidate.likedByMe ? -1 : 1)
            }
          : candidate
      )
    );
    fetch(`${API_BASE_URL}/groups/${group.id}/posts/${post.id}/like`, {
      method: post.likedByMe ? 'DELETE' : 'POST',
      headers: { authorization: `Bearer ${authToken}` }
    }).catch(() => refreshPosts());
  };

  const toggleExpanded = (postId: string) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  const topLevelPosts = posts.filter((post) => !post.parentId);
  const repliesFor = (postId: string) =>
    posts.filter((post) => post.parentId === postId);

  return (
    <div className="group-detail">
      <div className="group-detail-header">
        <div className="group-detail-cover" aria-hidden="true">
          <span>{group.name.slice(0, 1).toUpperCase()}</span>
          <i />
          <i />
          <i />
        </div>
        <div className="group-detail-header-top">
          <div className="group-detail-header-info">
            <span className="groups-page-eyebrow">
              {group.eventId ? 'Groupe événement' : 'Communauté permanente'}
            </span>
            <strong>{group.name}</strong>
            <div className="group-detail-status-row">
              <span className="group-detail-visibility-badge">
                {group.visibility === 'restricted'
                  ? '◇ Sur demande'
                  : '◎ Accès libre'}
              </span>
              {group.isModerator && (
                <span className="group-detail-role-badge">Gestionnaire</span>
              )}
            </div>
            {group.eventId && group.eventTitle && (
              <span className="group-detail-event-badge">
                Groupe lié à{' '}
                <button
                  type="button"
                  className="group-detail-event-link"
                  onClick={() =>
                    group.eventId &&
                    onOpenEventForum &&
                    onOpenEventForum(group.eventId)
                  }
                  disabled={!onOpenEventForum}
                >
                  {group.eventTitle}
                  {group.eventStartsAt &&
                    ` — ${new Date(group.eventStartsAt).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })}`}
                  {group.meetupVenue && ` · ${group.meetupVenue.name}`}
                </button>
              </span>
            )}
          </div>
          {group.isMember && (
            <div className="group-detail-header-actions">
              <button
                type="button"
                className={`text-btn ${group.pinned ? 'active' : ''}`}
                onClick={togglePin}
                disabled={pinning}
                title={
                  group.pinned
                    ? 'Retirer des raccourcis'
                    : 'Épingler dans les raccourcis'
                }
              >
                {group.pinned ? '📌 Épinglé' : '📌 Épingler'}
              </button>
              <button
                type="button"
                className="text-btn"
                onClick={leaveGroupAction}
              >
                Quitter
              </button>
            </div>
          )}
        </div>
        {group.description && (
          <p className="group-detail-description">{group.description}</p>
        )}
        <div className="group-detail-members-row">
          {members.length > 0 && (
            <div className="forum-members-avatars">
              {members.slice(0, 8).map((member) => (
                <span
                  className="friends-row-avatar"
                  key={member.id}
                  title={member.displayName}
                >
                  {member.avatarUrl ? (
                    <img src={member.avatarUrl} alt="" />
                  ) : (
                    member.displayName.slice(0, 1).toUpperCase()
                  )}
                </span>
              ))}
            </div>
          )}
          <span className="forum-members-count">
            {group.memberCount} membre{group.memberCount !== 1 ? 's' : ''}
          </span>
          {group.isMember && (
            <button
              type="button"
              className="text-btn"
              onClick={() => setInviteOpen(true)}
            >
              Inviter des amis
            </button>
          )}
        </div>
      </div>

      {!group.isMember && group.myStatus !== 'pending' && (
        <div className="group-detail-join-banner">
          <p>
            {group.visibility === 'restricted'
              ? 'Ce groupe est à accès limité - ta demande sera envoyée au modérateur.'
              : 'Rejoins ce groupe pour discuter, voter, et voir le programme.'}
          </p>
          <button
            type="button"
            className="btn-secondary"
            onClick={joinGroupAction}
            disabled={joining}
          >
            {joining
              ? 'Un instant…'
              : group.visibility === 'restricted'
                ? 'Demander à rejoindre'
                : 'Rejoindre'}
          </button>
        </div>
      )}
      {group.myStatus === 'pending' && (
        <div className="group-detail-join-banner">
          <p>Demande envoyée, en attente d'approbation du modérateur.</p>
        </div>
      )}

      {group.isMember && (
        <>
          <nav className="group-detail-tabs" aria-label="Espaces du groupe">
            <button
              type="button"
              className={tab === 'organize' ? 'active' : ''}
              onClick={() => setTab('organize')}
            >
              <span aria-hidden="true">▦</span>
              Organiser
            </button>
            <button
              type="button"
              className={tab === 'discussion' ? 'active' : ''}
              onClick={() => setTab('discussion')}
            >
              <span aria-hidden="true">◌</span>
              Discussion
              {posts.length > 0 && <small>{posts.length}</small>}
            </button>
            <button
              type="button"
              className={tab === 'members' ? 'active' : ''}
              onClick={() => setTab('members')}
            >
              <span aria-hidden="true">◎</span>
              Membres
              <small>{group.memberCount}</small>
            </button>
            {group.isModerator && (
              <button
                type="button"
                className={tab === 'manage' ? 'active' : ''}
                onClick={() => setTab('manage')}
              >
                <span aria-hidden="true">◇</span>
                Gestion
                {(group.pendingRequestCount ?? 0) > 0 && (
                  <small className="attention">
                    {group.pendingRequestCount}
                  </small>
                )}
              </button>
            )}
          </nav>

          {tab === 'organize' && (
            <section className="group-organize-view">
              <div className="group-view-heading">
                <div>
                  <span className="groups-page-eyebrow">
                    Tableau d’organisation
                  </span>
                  <h2>Préparez la prochaine sortie ensemble.</h2>
                </div>
                <p>Chaque action ici est partagée avec tous les membres.</p>
              </div>
              <div className="group-modules-grid">
                {group.meetupVenue && (
                  <GroupMeetupCard venue={group.meetupVenue} />
                )}
                <GroupScheduleCard groupId={group.id} authToken={authToken} />
                <GroupAttendanceCard groupId={group.id} authToken={authToken} />
                <GroupChecklistCard groupId={group.id} authToken={authToken} />
              </div>
            </section>
          )}

          {tab === 'discussion' && (
            <section className="group-detail-discussion">
              <div className="group-view-heading">
                <div>
                  <span className="groups-page-eyebrow">Fil du groupe</span>
                  <h2>Décidez, échangez, avancez.</h2>
                </div>
                <p>
                  {posts.length} message{posts.length !== 1 ? 's' : ''}
                </p>
              </div>
              <form
                className="forum-composer group-main-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitPost();
                }}
              >
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Partage une idée, une question ou une décision…"
                  maxLength={2000}
                  rows={3}
                />
                <div className="group-main-composer-footer">
                  <span>{draft.length}/2000</span>
                  <button
                    type="submit"
                    className="btn-secondary"
                    disabled={posting || !draft.trim()}
                  >
                    {posting ? 'Publication…' : 'Publier'}
                  </button>
                </div>
              </form>
              <div className="forum-posts group-posts-feed">
                {postsState === 'loading' && (
                  <p className="list-view-empty">Chargement…</p>
                )}
                {postsState === 'error' && (
                  <p className="list-view-empty">
                    Impossible de charger le fil pour le moment.
                  </p>
                )}
                {postsState === 'success' && topLevelPosts.length === 0 && (
                  <div className="group-empty-feed">
                    <span aria-hidden="true">◌</span>
                    <strong>Lance la première conversation.</strong>
                    <p>
                      Une question simple suffit souvent à organiser toute une
                      sortie.
                    </p>
                  </div>
                )}
                {postsState === 'success' &&
                  topLevelPosts.map((post) => (
                    <GroupPostRow
                      key={post.id}
                      post={post}
                      userId={userId}
                      authToken={authToken}
                      onLike={toggleLike}
                      onDelete={removePost}
                      replies={repliesFor(post.id)}
                      expanded={expandedReplies.has(post.id)}
                      onToggleExpanded={() => toggleExpanded(post.id)}
                      replyDraft={replyDrafts[post.id] ?? ''}
                      onReplyDraftChange={(value) =>
                        setReplyDrafts((prev) => ({
                          ...prev,
                          [post.id]: value
                        }))
                      }
                      onSubmitReply={() => submitPost(post.id)}
                      posting={posting}
                    />
                  ))}
              </div>
            </section>
          )}

          {tab === 'members' && (
            <section className="group-members-view">
              <div className="group-view-heading">
                <div>
                  <span className="groups-page-eyebrow">La communauté</span>
                  <h2>
                    {group.memberCount} membre
                    {group.memberCount !== 1 ? 's' : ''}
                  </h2>
                </div>
                <button
                  type="button"
                  className="groups-create-submit"
                  onClick={() => setInviteOpen(true)}
                >
                  Inviter des amis
                </button>
              </div>
              <div className="group-members-grid">
                {members.map((member) => (
                  <div className="group-member-card" key={member.id}>
                    <span className="friends-row-avatar friends-row-avatar-lg">
                      {member.avatarUrl ? (
                        <img src={member.avatarUrl} alt="" />
                      ) : (
                        member.displayName.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span>
                      <strong>{member.displayName}</strong>
                      <small>
                        {member.id === group.createdBy
                          ? 'Créateur du groupe'
                          : 'Membre'}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {tab === 'manage' && group.isModerator && (
            <section className="group-management-view">
              <div className="group-view-heading">
                <div>
                  <span className="groups-page-eyebrow">
                    Espace gestionnaire
                  </span>
                  <h2>Gérer les accès au groupe.</h2>
                </div>
                <span className="group-management-role">
                  Créateur · Gestionnaire
                </span>
              </div>
              <div className="group-management-summary">
                <div>
                  <span>Accès</span>
                  <strong>
                    {group.visibility === 'restricted'
                      ? 'Sur approbation'
                      : 'Libre'}
                  </strong>
                </div>
                <div>
                  <span>Membres</span>
                  <strong>{group.memberCount}</strong>
                </div>
                <div>
                  <span>Demandes</span>
                  <strong>{group.pendingRequestCount ?? 0}</strong>
                </div>
              </div>
              {group.visibility === 'restricted' ? (
                <GroupJoinRequestsCard
                  groupId={group.id}
                  authToken={authToken}
                  onResolved={refreshGroup}
                  showEmpty
                />
              ) : (
                <div className="group-detail-card group-management-empty">
                  <span aria-hidden="true">◎</span>
                  <div>
                    <strong>Ce groupe est en accès libre.</strong>
                    <p>
                      Les membres le rejoignent sans passer par une demande.
                    </p>
                  </div>
                </div>
              )}
              <div className="group-management-scope">
                <strong>Pouvoirs actuellement disponibles</strong>
                <p>
                  Le gestionnaire peut approuver ou refuser les demandes. Les
                  rôles multiples, la configuration des modules et la mise en
                  avant d’événements restent proposés pour la prochaine décision
                  produit.
                </p>
              </div>
            </section>
          )}
        </>
      )}

      {inviteOpen && (
        <InviteToGroupModal
          group={group}
          authToken={authToken}
          onClose={() => setInviteOpen(false)}
        />
      )}
    </div>
  );
}

// A small, non-interactive MapLibre instance centered on the linked
// event's real venue - same map tech/style already used everywhere else
// in the app, not a third-party static-image API (no new dependency, no
// cost). Absent entirely for permanent groups (no event to derive a
// meetup point from).
function GroupMeetupCard({ venue }: { venue: GroupMeetupVenue }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    const instance = new maplibregl.Map({
      container: container.current,
      center: [venue.longitude, venue.latitude],
      zoom: 15,
      style: MAP_STYLE_URL,
      interactive: false,
      attributionControl: false
    });
    new maplibregl.Marker({ color: '#c026d3' })
      .setLngLat([venue.longitude, venue.latitude])
      .addTo(instance);
    return () => instance.remove();
  }, [venue.longitude, venue.latitude]);

  return (
    <div className="group-detail-card group-module-card group-meetup-card">
      <div className="group-module-heading">
        <span aria-hidden="true">⌖</span>
        <div>
          <h3>Point de rendez-vous</h3>
          <p>Le lieu réel lié à l’événement.</p>
        </div>
      </div>
      <div className="group-meetup-map" ref={container} />
      <div className="group-meetup-address">
        <strong>{venue.name}</strong>
        <span>{venue.address}</span>
      </div>
    </div>
  );
}

// "Programme" - real items added by members, sorted by time. No item is
// ever guessed or auto-filled.
function GroupScheduleCard({
  groupId,
  authToken
}: {
  groupId: string;
  authToken: string | undefined;
}) {
  const [items, setItems] = useState<GroupScheduleItem[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [label, setLabel] = useState('');
  const [time, setTime] = useState('');
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/groups/${groupId}/schedule`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setItems(groupScheduleItemsResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken, groupId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem = () => {
    if (!authToken || !label.trim() || !time || adding) return;
    setAdding(true);
    fetch(`${API_BASE_URL}/groups/${groupId}/schedule`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        label: label.trim(),
        scheduledAt: new Date(time).toISOString()
      })
    })
      .then((response) => (response.ok ? undefined : Promise.reject()))
      .then(() => {
        setLabel('');
        setTime('');
        refresh();
      })
      .catch(() => {})
      .finally(() => setAdding(false));
  };

  return (
    <div className="group-detail-card group-module-card group-schedule-card">
      <div className="group-module-heading">
        <span aria-hidden="true">◷</span>
        <div>
          <h3>Programme</h3>
          <p>Construisez le déroulé de la sortie.</p>
        </div>
      </div>
      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'success' && items.length === 0 && (
        <p className="list-view-empty">Aucun horaire pour l'instant.</p>
      )}
      {state === 'success' && items.length > 0 && (
        <ul className="group-schedule-list">
          {items.map((item) => (
            <li key={item.id}>
              <span className="group-schedule-time">
                {new Date(item.scheduledAt).toLocaleTimeString('fr-CA', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="group-schedule-form"
        onSubmit={(event) => {
          event.preventDefault();
          addItem();
        }}
      >
        <input
          type="datetime-local"
          value={time}
          onChange={(event) => setTime(event.target.value)}
        />
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Ex: Rendez-vous au bar"
          maxLength={120}
        />
        <button
          type="submit"
          className="text-btn"
          disabled={adding || !label.trim() || !time}
        >
          + Ajouter
        </button>
      </form>
    </div>
  );
}

const ATTENDANCE_LABELS: Record<AttendanceResponse, string> = {
  yes: 'Oui',
  maybe: 'Peut-être',
  no: 'Non'
};

// "Qui vient ?" - real votes from real members, percentages computed from
// the real total of votes cast (never simulated, never assumed).
function GroupAttendanceCard({
  groupId,
  authToken
}: {
  groupId: string;
  authToken: string | undefined;
}) {
  const [summary, setSummary] = useState<GroupAttendanceSummary>();
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );

  const refresh = useCallback(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/groups/${groupId}/attendance`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setSummary(groupAttendanceSummarySchema.parse(json));
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken, groupId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const vote = (response: AttendanceResponse) => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/groups/${groupId}/attendance`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ response })
    }).then(() => refresh());
  };

  const total = summary ? summary.yes + summary.maybe + summary.no : 0;

  return (
    <div className="group-detail-card group-module-card group-attendance-card">
      <div className="group-module-heading">
        <span aria-hidden="true">◎</span>
        <div>
          <h3>Qui vient ?</h3>
          <p>Une réponse claire par membre.</p>
        </div>
      </div>
      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'success' && summary && (
        <>
          <div className="group-attendance-bars">
            {(['yes', 'maybe', 'no'] as const).map((key) => {
              const count = summary[key];
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div className="group-attendance-row" key={key}>
                  <span className="group-attendance-label">
                    {ATTENDANCE_LABELS[key]}
                  </span>
                  <div className="group-attendance-bar-track">
                    <div
                      className={`group-attendance-bar-fill group-attendance-${key}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="group-attendance-count">
                    {count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
          <p className="group-attendance-total">
            {total} réponse{total !== 1 ? 's' : ''}
          </p>
          <div className="group-attendance-actions">
            {(['yes', 'maybe', 'no'] as const).map((key) => (
              <button
                type="button"
                key={key}
                className={`text-btn ${summary.myResponse === key ? 'active' : ''}`}
                onClick={() => vote(key)}
              >
                {ATTENDANCE_LABELS[key]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// "Checklist" - checkedCount/totalMembers reflects real, individual
// members checking an item off for themselves, never a fabricated
// fraction.
function GroupChecklistCard({
  groupId,
  authToken
}: {
  groupId: string;
  authToken: string | undefined;
}) {
  const [items, setItems] = useState<GroupChecklistItem[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/groups/${groupId}/checklist`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setItems(groupChecklistItemsResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken, groupId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem = () => {
    if (!authToken || !label.trim() || adding) return;
    setAdding(true);
    fetch(`${API_BASE_URL}/groups/${groupId}/checklist`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ label: label.trim() })
    })
      .then((response) => (response.ok ? undefined : Promise.reject()))
      .then(() => {
        setLabel('');
        refresh();
      })
      .catch(() => {})
      .finally(() => setAdding(false));
  };

  const toggle = (item: GroupChecklistItem) => {
    if (!authToken) return;
    const nextChecked = !item.checkedByMe;
    setItems((prev) =>
      prev.map((candidate) =>
        candidate.id === item.id
          ? {
              ...candidate,
              checkedByMe: nextChecked,
              checkedCount: candidate.checkedCount + (nextChecked ? 1 : -1)
            }
          : candidate
      )
    );
    fetch(`${API_BASE_URL}/groups/${groupId}/checklist/${item.id}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ checked: nextChecked })
    }).catch(() => refresh());
  };

  return (
    <div className="group-detail-card group-module-card group-checklist-card">
      <div className="group-module-heading">
        <span aria-hidden="true">✓</span>
        <div>
          <h3>Checklist</h3>
          <p>Les choses à prévoir avant de partir.</p>
        </div>
      </div>
      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'success' && items.length === 0 && (
        <p className="list-view-empty">Aucun item pour l'instant.</p>
      )}
      {state === 'success' && items.length > 0 && (
        <ul className="group-checklist-list">
          {items.map((item) => (
            <li key={item.id}>
              <label className="group-checklist-item">
                <input
                  type="checkbox"
                  checked={item.checkedByMe}
                  onChange={() => toggle(item)}
                />
                <span>{item.label}</span>
              </label>
              <span className="group-checklist-fraction">
                {item.checkedCount}/{item.totalMembers}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="group-checklist-form"
        onSubmit={(event) => {
          event.preventDefault();
          addItem();
        }}
      >
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Ex: Tickets"
          maxLength={120}
        />
        <button
          type="submit"
          className="text-btn"
          disabled={adding || !label.trim()}
        >
          + Ajouter un item
        </button>
      </form>
    </div>
  );
}

// Moderator-only (Phase 4.10, DEC-0013 v1.2) - the only moderation power
// a group's creator has: approving/declining join requests for a
// restricted group. Nothing else.
function GroupJoinRequestsCard({
  groupId,
  authToken,
  onResolved,
  showEmpty = false
}: {
  groupId: string;
  authToken: string | undefined;
  onResolved: () => void;
  showEmpty?: boolean;
}) {
  const [requests, setRequests] = useState<PublicUser[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );

  const refresh = useCallback(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/groups/${groupId}/join-requests`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setRequests(groupJoinRequestsResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken, groupId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const respond = (targetUserId: string, action: 'accept' | 'decline') => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/groups/${groupId}/join-requests/${targetUserId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ action })
    }).then(() => {
      refresh();
      onResolved();
    });
  };

  if (state === 'success' && requests.length === 0 && !showEmpty) return null;

  return (
    <div className="group-detail-card group-join-requests-card">
      <h3>Demandes en attente</h3>
      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'success' && requests.length === 0 && (
        <div className="group-management-empty-inline">
          <span aria-hidden="true">✓</span>
          <p>Aucune demande à traiter pour le moment.</p>
        </div>
      )}
      {requests.map((request) => (
        <div className="amis-row" key={request.id}>
          <span className="friends-row-avatar friends-row-avatar-lg">
            {request.avatarUrl ? (
              <img src={request.avatarUrl} alt="" />
            ) : (
              request.displayName.slice(0, 1).toUpperCase()
            )}
          </span>
          <span className="amis-row-name">{request.displayName}</span>
          <div className="amis-row-actions">
            <button
              type="button"
              className="amis-btn-accept"
              onClick={() => respond(request.id, 'accept')}
            >
              Accepter
            </button>
            <button
              type="button"
              className="amis-btn-ghost"
              onClick={() => respond(request.id, 'decline')}
            >
              Refuser
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// "Inviter des amis" - never joins someone on their behalf (membership
// stays a self-service action per DEC-0013); sends a direct message with
// a link, same real mechanism as EventHero's "Envoyer à un ami".
function InviteToGroupModal({
  group,
  authToken,
  onClose
}: {
  group: Group;
  authToken: string | undefined;
  onClose: () => void;
}) {
  const [friendsList, setFriendsList] = useState<PublicUser[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [sendingTo, setSendingTo] = useState<string>();

  useEffect(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/me/friends`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setFriendsList(friendsResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken]);

  const sendInvite = (friendId: string) => {
    if (!authToken || sendingTo) return;
    setSendingTo(friendId);
    const url = `${window.location.origin}/groups/${group.id}`;
    fetch(`${API_BASE_URL}/me/friends/${friendId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        body: `Rejoins le groupe « ${group.name} » sur Pulso !\n${url}`
      })
    })
      .then((response) => (response.ok ? undefined : Promise.reject()))
      .then(() => setSentTo((prev) => new Set(prev).add(friendId)))
      .catch(() => {})
      .finally(() => setSendingTo(undefined));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="share-friend-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="conversation-modal-header">
          <strong>Inviter des amis</strong>
          <button type="button" className="text-btn" onClick={onClose}>
            Fermer
          </button>
        </div>
        <div className="share-friend-list">
          {state === 'loading' && (
            <p className="list-view-empty">Chargement…</p>
          )}
          {state === 'error' && (
            <p className="list-view-empty">
              Impossible de charger vos amis pour le moment.
            </p>
          )}
          {state === 'success' && friendsList.length === 0 && (
            <p className="list-view-empty">
              Ajoute des amis pour pouvoir les inviter.
            </p>
          )}
          {state === 'success' &&
            friendsList.map((friend) => (
              <div className="friends-row" key={friend.id}>
                <span className="friends-row-avatar">
                  {friend.avatarUrl ? (
                    <img src={friend.avatarUrl} alt="" />
                  ) : (
                    friend.displayName.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="friends-row-name">{friend.displayName}</span>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => sendInvite(friend.id)}
                  disabled={sendingTo === friend.id || sentTo.has(friend.id)}
                >
                  {sentTo.has(friend.id)
                    ? 'Envoyé ✓'
                    : sendingTo === friend.id
                      ? 'Envoi…'
                      : 'Inviter'}
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function GroupModal({
  group,
  authToken,
  userId,
  onClose,
  onLeft
}: {
  group: Group;
  authToken: string | undefined;
  userId: string;
  onClose: () => void;
  onLeft: () => void;
}) {
  const [current, setCurrent] = useState(group);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="group-modal" onClick={(event) => event.stopPropagation()}>
        <div className="group-modal-close-row">
          <button type="button" className="text-btn" onClick={onClose}>
            Fermer
          </button>
        </div>
        <GroupDetailContent
          group={current}
          authToken={authToken}
          userId={userId}
          onGroupUpdated={setCurrent}
          onLeave={onLeft}
        />
      </div>
    </div>
  );
}

function GroupPostRow({
  post,
  userId,
  authToken,
  onLike,
  onDelete,
  replies,
  expanded,
  onToggleExpanded,
  replyDraft,
  onReplyDraftChange,
  onSubmitReply,
  posting
}: {
  post: GroupPost;
  userId: string;
  authToken: string | undefined;
  onLike: (post: GroupPost) => void;
  onDelete: (postId: string) => void;
  replies: GroupPost[];
  expanded: boolean;
  onToggleExpanded: () => void;
  replyDraft: string;
  onReplyDraftChange: (value: string) => void;
  onSubmitReply: () => void;
  posting: boolean;
}) {
  // Groups are a small, personal space between people who already know
  // each other (unlike the public, categorized Forum) - real chat bubbles
  // with a clear "mine vs. theirs" color/side distinction read as personal
  // in a way the Forum's public post-card feed deliberately doesn't.
  const renderBubble = (item: GroupPost, isReply: boolean) => {
    const mine = item.author.id === userId;
    return (
      <div
        key={item.id}
        className={`group-bubble-row ${mine ? 'mine' : 'theirs'}`}
      >
        {!mine && (
          <span className="friends-row-avatar group-bubble-avatar">
            {item.author.avatarUrl ? (
              <img src={item.author.avatarUrl} alt="" />
            ) : (
              item.author.displayName.slice(0, 1).toUpperCase()
            )}
          </span>
        )}
        <div className="group-bubble-col">
          <span className="group-bubble-author">
            {mine ? 'Vous' : item.author.displayName}
            <time dateTime={item.createdAt}>
              {formatRelativeTime(item.createdAt)}
            </time>
          </span>
          <div className="group-bubble">
            <p>{item.body}</p>
          </div>
          <div className="group-bubble-actions">
            <button
              type="button"
              className={`forum-like-btn ${item.likedByMe ? 'active' : ''}`}
              onClick={() => onLike(item)}
            >
              <HeartIcon filled={item.likedByMe} />
              <span>{item.likedByMe ? 'Aimé' : 'J’aime'}</span>
              {item.likeCount > 0 && <b>{item.likeCount}</b>}
            </button>
            {!isReply && (
              <button
                type="button"
                className="text-btn"
                onClick={onToggleExpanded}
              >
                {item.replyCount === 0
                  ? 'Répondre'
                  : `${item.replyCount} réponse${item.replyCount !== 1 ? 's' : ''}`}
              </button>
            )}
            {mine ? (
              <button
                type="button"
                className="text-btn"
                onClick={() => onDelete(item.id)}
              >
                Supprimer
              </button>
            ) : (
              <button
                type="button"
                className="text-btn"
                onClick={() => reportContent(authToken, 'group_post', item.id)}
              >
                Signaler
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {renderBubble(post, false)}
      {expanded && (
        <div className="group-bubble-replies">
          {replies.map((reply) => renderBubble(reply, true))}
          <form
            className="forum-composer forum-reply-composer"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmitReply();
            }}
          >
            <textarea
              value={replyDraft}
              onChange={(event) => onReplyDraftChange(event.target.value)}
              placeholder="Répondre…"
              maxLength={2000}
              rows={1}
            />
            <button
              type="submit"
              className="btn-secondary"
              disabled={posting || !replyDraft.trim()}
            >
              Répondre
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function SearchPanel({
  query,
  result,
  processing,
  error,
  onQueryChange,
  onSubmit,
  onClear,
  onClearConstraint,
  onPreview,
  locale
}: {
  query: string;
  result: IntelligentSearchResponse | undefined;
  processing: boolean;
  error: boolean;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  onClearConstraint: (key: SearchConstraintKey) => void;
  onPreview: (event: PublicEvent) => void;
  locale: SupportedLocale;
}) {
  // The results panel overlays the map, so clicking the map to dismiss it is
  // the obvious gesture - it used to require finding "Effacer la recherche",
  // which also throws the query away rather than just closing the panel.
  const panelRef = useRef<HTMLElement>(null);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => setDismissed(false), [result, error]);
  useEffect(() => {
    if ((!result && !error) || dismissed) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setDismissed(true);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDismissed(true);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [result, error, dismissed]);

  return (
    <aside
      ref={panelRef}
      className="search-panel"
      aria-label={translate(locale, 'search.panelAria')}
    >
      <form
        className="search-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor="intelligent-search" className="sr-only">
          {translate(locale, 'search.question')}
        </label>
        <div className="search-input-wrapper">
          <CitySelector />
          <span className="search-divider" aria-hidden="true" />
          <span className="search-icon" aria-hidden="true">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </span>
          <input
            id="intelligent-search"
            value={query}
            maxLength={240}
            placeholder={translate(locale, 'search.placeholder')}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
      </form>

      {(processing || ((error || result) && !dismissed)) && (
        <div className="search-dropdown">
          <div className="search-dropdown-content">
            {processing && (
              <p role="status">{translate(locale, 'search.processing')}</p>
            )}
            {error && <p role="alert">{translate(locale, 'search.error')}</p>}
            {result && !processing && (
              <div className="search-interpretation" aria-live="polite">
                <div className="search-heading">
                  <h2>{translate(locale, 'search.understood')}</h2>
                  <button type="button" onClick={onClear}>
                    {translate(locale, 'search.clearSearch')}
                  </button>
                </div>
                <p>{localizeSearchMessage(locale, result.message)}</p>
                {result.clarification && (
                  <p className="clarification">
                    {translate(locale, 'search.clarificationPrefix', {
                      message: localizeSearchMessage(
                        locale,
                        result.clarification
                      )
                    })}
                  </p>
                )}
                <h3>{translate(locale, 'search.hardConstraints')}</h3>
                <ul>
                  {result.interpretation.constraints.map((constraint) => {
                    const label = localizeSearchMessage(
                      locale,
                      constraint.message
                    );
                    return (
                      <li key={`${constraint.key}-${constraint.message.code}`}>
                        {label}{' '}
                        {isSearchConstraintKey(constraint.key) && (
                          <button
                            type="button"
                            aria-label={translate(
                              locale,
                              'search.clearConstraint',
                              { label }
                            )}
                            onClick={() =>
                              onClearConstraint(
                                constraint.key as SearchConstraintKey
                              )
                            }
                          >
                            {translate(locale, 'search.clear')}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {result.interpretation.rankingSignals.length > 0 && (
                  <>
                    <h3>{translate(locale, 'search.rankingSignals')}</h3>
                    <ul>
                      {result.interpretation.rankingSignals.map((signal) => (
                        <li key={`${signal.key}-${signal.message.code}`}>
                          {localizeSearchMessage(locale, signal.message)}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            {result && result.data.length > 0 && (
              <div
                className="search-results"
                aria-label={translate(locale, 'search.resultsAria')}
              >
                <h3>{translate(locale, 'search.results')}</h3>
                {result.data.map(({ event, matchType }, index) => (
                  <button
                    type="button"
                    key={event.id}
                    aria-label={translate(locale, 'search.previewResultAria', {
                      index: index + 1,
                      matchType: translate(locale, `search.match.${matchType}`)
                    })}
                    onClick={() => {
                      onPreview(event);
                    }}
                  >
                    {translate(locale, 'search.previewResult', {
                      title: event.title,
                      matchType: translate(locale, `search.match.${matchType}`)
                    })}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function isSearchConstraintKey(value: string): value is SearchConstraintKey {
  return ['date', 'categories', 'price', 'excluded_categories'].includes(value);
}

function toDiscoveryFilters(
  filters: IntelligentSearchResponse['interpretation']['effectiveFilters']
): DiscoveryFilters {
  return {
    date: filters.date,
    categories: [...filters.categories],
    price: filters.price,
    ...(filters.customStartDate
      ? { customStartDate: filters.customStartDate }
      : {}),
    ...(filters.customEndDate ? { customEndDate: filters.customEndDate } : {})
  };
}

function applySearchFilterEdits(
  search: ActiveSearch,
  current: DiscoveryFilters,
  next: DiscoveryFilters
): ActiveSearch {
  const manualFilters = {
    ...search.manualFilters,
    categories: [...search.manualFilters.categories]
  };
  const disabled = new Set(search.disabledDerivedKeys);
  if (
    current.date !== next.date ||
    current.customStartDate !== next.customStartDate ||
    current.customEndDate !== next.customEndDate
  ) {
    manualFilters.date = next.date;
    if (next.customStartDate)
      manualFilters.customStartDate = next.customStartDate;
    else delete manualFilters.customStartDate;
    if (next.customEndDate) manualFilters.customEndDate = next.customEndDate;
    else delete manualFilters.customEndDate;
    disabled.add('date');
  }
  if (
    current.categories.length !== next.categories.length ||
    current.categories.some((category) => !next.categories.includes(category))
  ) {
    manualFilters.categories = [...next.categories];
    disabled.add('categories');
  }
  if (current.price !== next.price) {
    manualFilters.price = next.price;
    disabled.add('price');
  }
  return {
    ...search,
    manualFilters,
    disabledDerivedKeys: [...disabled]
  };
}

/**
 * The map-embedded filter bar: Date/Prix/Catégorie as compact dropdown
 * chips, plus a "Plus de filtres" chip opening the full FilterOverlay -
 * replaces the previous always-expanded ActiveFilters chip row per user
 * feedback that a second, redundant pill "ne sert a rien" on the map.
 */
function MapFilterBar({
  filters,
  onChange,
  onOpenMore,
  locale
}: {
  filters: DiscoveryFilters;
  onChange: (filters: DiscoveryFilters) => void;
  onOpenMore: () => void;
  locale: SupportedLocale;
}) {
  const [openChip, setOpenChip] = useState<'date' | 'price' | 'category'>();
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openChip) return;
    const onPointerDown = (event: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) {
        setOpenChip(undefined);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [openChip]);

  const toggleChip = (chip: 'date' | 'price' | 'category') =>
    setOpenChip((prev) => (prev === chip ? undefined : chip));

  const toggleCategory = (category: EventCategory) => {
    onChange({
      ...filters,
      categories: filters.categories.includes(category)
        ? filters.categories.filter((value) => value !== category)
        : [...filters.categories, category]
    });
  };

  const categoryLabel =
    filters.categories.length === 0
      ? translate(locale, 'filters.categories')
      : filters.categories
          .map((category) => SHORT_CATEGORY_LABELS[locale][category])
          .join(', ');

  return (
    <div className="map-filter-bar" ref={barRef}>
      <div className="map-filter-chip-wrapper">
        <button
          type="button"
          className={`map-filter-chip ${openChip === 'date' ? 'open' : ''}`}
          onClick={() => toggleChip('date')}
          aria-expanded={openChip === 'date'}
          aria-haspopup="true"
        >
          {getDateFilterLabel(locale, filters.date)}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {openChip === 'date' && (
          <div className="map-filter-dropdown">
            {DATE_FILTER_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="map-date-filter"
                  checked={filters.date === option.value}
                  onChange={() => {
                    onChange(withoutCustomDates(filters, option.value));
                    setOpenChip(undefined);
                  }}
                />
                {getDateFilterLabel(locale, option.value)}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="map-filter-chip-wrapper">
        <button
          type="button"
          className={`map-filter-chip ${openChip === 'price' ? 'open' : ''}`}
          onClick={() => toggleChip('price')}
          aria-expanded={openChip === 'price'}
          aria-haspopup="true"
        >
          {getPriceLabel(locale, filters.price)}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {openChip === 'price' && (
          <div className="map-filter-dropdown">
            {PRICE_FILTER_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="map-price-filter"
                  checked={filters.price === option.value}
                  onChange={() => {
                    onChange({ ...filters, price: option.value });
                    setOpenChip(undefined);
                  }}
                />
                {getPriceLabel(locale, option.value)}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="map-filter-chip-wrapper">
        <button
          type="button"
          className={`map-filter-chip ${openChip === 'category' ? 'open' : ''} ${filters.categories.length > 0 ? 'active' : ''}`}
          onClick={() => toggleChip('category')}
          aria-expanded={openChip === 'category'}
          aria-haspopup="true"
        >
          {categoryLabel}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {openChip === 'category' && (
          <div className="map-filter-dropdown">
            {CATEGORY_FILTER_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  type="checkbox"
                  checked={filters.categories.includes(option.value)}
                  onChange={() => toggleCategory(option.value)}
                />
                {SHORT_CATEGORY_LABELS[locale][option.value]}
              </label>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        className="map-filter-chip map-filter-more"
        onClick={onOpenMore}
      >
        Plus de filtres
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </div>
  );
}

function AboutPanel({
  onClose,
  visible
}: {
  onClose: () => void;
  visible: boolean;
}) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // The header's own "À propos" button already toggles open/closed
      // itself - if this outside-click handler also closed on the same
      // click, reopening from the button's onClick right after created an
      // open-close-open flicker (mousedown closes it, then the click event
      // that follows immediately reopens it).
      if (target.closest('[data-about-toggle]')) return;
      if (panelRef.current && !panelRef.current.contains(target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [onClose]);

  return (
    <aside
      className={`filter-overlay glass-panel panel-transition ${visible ? 'panel-visible' : ''}`}
      aria-label="À propos de Pulso"
      ref={panelRef}
    >
      <div className="filter-heading">
        <h2>À propos de Pulso</h2>
        <button type="button" onClick={onClose}>
          Fermer
        </button>
      </div>
      <div className="about-content">
        <p>
          Pulso est un répertoire d'événements festifs, musicaux et de soirée
          géolocalisés à Montréal : concerts, clubs, bars, spectacles, comedy
          clubs et catégories similaires. Vous pouvez explorer la carte sans
          compte ni intention précise, ou chercher exactement ce que vous voulez
          en langage naturel.
        </p>
        <p>
          L'objectif est de regrouper le plus grand nombre possible d'événements
          montréalais correctement référencés, avec un accès en une action vers
          la billetterie ou la source d'origine — sans réservation ni billet
          géré par Pulso lui-même.
        </p>
        <h3>Vous organisez un événement ?</h3>
        <p>
          Si vous voulez que votre événement soit listé sur Pulso, ou que vous
          représentez une salle, un organisateur ou une billetterie intéressé·e
          à collaborer, écrivez-nous :
        </p>
        <a
          className="primary-action-btn glow-purple"
          href="mailto:rmeynaud@pulsonight.com"
        >
          rmeynaud@pulsonight.com
        </a>
      </div>
    </aside>
  );
}

function FilterOverlay({
  filters,
  onChange,
  onClose,
  onClearAll,
  locale,
  visible,
  distanceKm,
  onDistanceChange,
  onApplyDistance,
  distanceFilterActive,
  geoStatus
}: {
  filters: DiscoveryFilters;
  onChange: (filters: DiscoveryFilters) => void;
  onClose: () => void;
  onClearAll: () => void;
  locale: SupportedLocale;
  visible: boolean;
  distanceKm: number;
  onDistanceChange: (km: number) => void;
  onApplyDistance: () => void;
  distanceFilterActive: boolean;
  geoStatus: GeoStatus;
}) {
  const today = getMontrealCalendarDate(new Date());
  const setDate = (date: DiscoveryFilters['date']) => {
    if (date === 'custom') {
      onChange({
        ...filters,
        date,
        customStartDate: filters.customStartDate ?? today,
        customEndDate: filters.customEndDate ?? filters.customStartDate ?? today
      });
    } else {
      onChange(withoutCustomDates(filters, date));
    }
  };
  const toggleCategory = (category: EventCategory) => {
    onChange({
      ...filters,
      categories: filters.categories.includes(category)
        ? filters.categories.filter((value) => value !== category)
        : [...filters.categories, category]
    });
  };

  return (
    <aside
      id="map-filters"
      className={`filter-overlay glass-panel panel-transition ${visible ? 'panel-visible' : ''}`}
      aria-label={translate(locale, 'filters.title')}
    >
      <div className="filter-heading">
        <h2>{translate(locale, 'filters.title')}</h2>
        <button type="button" onClick={onClose}>
          {translate(locale, 'filters.close')}
        </button>
      </div>
      <fieldset>
        <legend>{translate(locale, 'filters.dateTime')}</legend>
        {DATE_FILTER_OPTIONS.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name="date-filter"
              value={option.value}
              checked={filters.date === option.value}
              onChange={() => setDate(option.value)}
            />
            {getDateFilterLabel(locale, option.value)}
          </label>
        ))}
        {filters.date === 'custom' && (
          <div className="date-range">
            <label>
              {translate(locale, 'filters.startDate')}
              <input
                type="date"
                value={filters.customStartDate ?? today}
                onChange={(event) =>
                  applyCustomDate(filters, onChange, event.target.value, true)
                }
              />
            </label>
            <label>
              {translate(locale, 'filters.endDate')}
              <input
                type="date"
                min={filters.customStartDate ?? today}
                value={
                  filters.customEndDate ?? filters.customStartDate ?? today
                }
                onChange={(event) =>
                  applyCustomDate(filters, onChange, event.target.value, false)
                }
              />
            </label>
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend>{translate(locale, 'filters.categories')}</legend>
        <p className="filter-help">
          {translate(locale, 'filters.categoriesHelp')}
        </p>
        {CATEGORY_FILTER_OPTIONS.map((option) => (
          <label key={option.value}>
            <input
              type="checkbox"
              checked={filters.categories.includes(option.value)}
              onChange={() => toggleCategory(option.value)}
            />
            {getCategoryLabel(locale, option.value)}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>{translate(locale, 'filters.price')}</legend>
        {PRICE_FILTER_OPTIONS.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name="price-filter"
              value={option.value}
              checked={filters.price === option.value}
              onChange={() => onChange({ ...filters, price: option.value })}
            />
            {getPriceLabel(locale, option.value)}
          </label>
        ))}
        <p className="filter-help">{translate(locale, 'filters.priceHelp')}</p>
      </fieldset>
      <fieldset>
        <legend>{translate(locale, 'filters.distance')}</legend>
        <div className="distance-slider-container">
          <input
            type="range"
            min="1"
            max="30"
            value={distanceKm}
            onChange={(event) => onDistanceChange(Number(event.target.value))}
            onMouseUp={onApplyDistance}
            onTouchEnd={onApplyDistance}
            onKeyUp={onApplyDistance}
            className="distance-slider"
          />
          <div className="distance-labels">
            <span>1km</span>
            <span>10km</span>
            <span>20km</span>
            <span>30km</span>
          </div>
          <p className="distance-value">
            {distanceFilterActive
              ? `Rayon actif : ${distanceKm} km`
              : `Rayon max (${distanceKm} km) — non appliqué`}
            {geoStatus === 'pending' && ' · localisation…'}
            {geoStatus === 'denied' && ' · position non partagée'}
            {geoStatus === 'unsupported' &&
              ' · non disponible sur cet appareil'}
          </p>
        </div>
      </fieldset>
      <dl className="fixed-filter-rules">
        <div>
          <dt>{translate(locale, 'filters.geography')}</dt>
          <dd>{translate(locale, 'filters.geographyHelp')}</dd>
        </div>
        <div>
          <dt>{translate(locale, 'filters.status')}</dt>
          <dd>{translate(locale, 'filters.statusHelp')}</dd>
        </div>
      </dl>
      <button type="button" className="clear-all" onClick={onClearAll}>
        {translate(locale, 'filters.clearAll')}
      </button>
    </aside>
  );
}

function withoutCustomDates(
  filters: DiscoveryFilters,
  date: DiscoveryFilters['date'] = 'next7'
): DiscoveryFilters {
  const next = { ...filters, date };
  delete next.customStartDate;
  delete next.customEndDate;
  return next;
}

function applyCustomDate(
  filters: DiscoveryFilters,
  onChange: (filters: DiscoveryFilters) => void,
  value: string,
  isStart: boolean
) {
  if (!value) return;
  if (isStart) {
    onChange({
      ...filters,
      date: 'custom',
      customStartDate: value,
      customEndDate:
        filters.customEndDate && filters.customEndDate >= value
          ? filters.customEndDate
          : value
    });
  } else {
    onChange({ ...filters, date: 'custom', customEndDate: value });
  }
}

function EventPreview({
  event,
  searchMatch,
  detailsButton,
  onClose,
  onDetails,
  isFavorite,
  onToggleFavorite,
  locale
}: {
  event: PublicEvent;
  searchMatch: IntelligentSearchResponse['data'][number] | undefined;
  detailsButton: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onDetails: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  locale: SupportedLocale;
}) {
  const fields = eventPreviewFields(event, locale);
  return (
    <div className="event-preview-card" aria-live="polite">
      <div
        className="event-preview-media"
        style={
          event.imageUrl
            ? {
                backgroundImage: `url(${event.imageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }
            : undefined
        }
      >
        {!event.imageUrl && <EventImageFallback category={event.category} />}
        <button
          type="button"
          className="card-fav"
          aria-pressed={isFavorite}
          aria-label={translate(
            locale,
            isFavorite ? 'favorites.remove' : 'favorites.add'
          )}
          onClick={onToggleFavorite}
        >
          <HeartIcon filled={isFavorite} />
        </button>
      </div>
      <div className="event-preview-body">
        <div className="preview-header-actions">
          <div
            className="card-badge"
            style={{
              position: 'relative',
              top: 0,
              left: 0,
              background:
                CATEGORY_COLORS[event.category] ?? CATEGORY_COLORS['other']
            }}
          >
            {SHORT_CATEGORY_LABELS[locale][event.category]}
          </div>
          <div className="event-preview-header-right">
            <button
              type="button"
              className="event-preview-close"
              onClick={() => void shareEvent(event, locale)}
              aria-label={translate(locale, 'details.share')}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </button>
            <button
              type="button"
              className="event-preview-close"
              onClick={onClose}
              aria-label={translate(locale, 'preview.close')}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <h3>{fields.title}</h3>
        <ul className="event-preview-fields">
          <li>
            <span aria-hidden="true">📍</span> {fields.venue}
          </li>
          <li>
            <span aria-hidden="true">📅</span> {fields.dateTime}
          </li>
          <li>
            <span aria-hidden="true">💰</span> {fields.price}
          </li>
        </ul>
        {searchMatch && (
          <div
            className="match-explanation"
            aria-label={translate(locale, 'search.whyExact')}
          >
            <strong>
              {searchMatch.matchType === 'exact'
                ? translate(locale, 'search.whyExact')
                : translate(locale, 'search.whyAlternative')}
            </strong>
            <ul>
              {searchMatch.reasons.map((reason, index) => (
                <li key={`${reason.code}-${index}`}>
                  {localizeSearchMessage(locale, reason)}
                </li>
              ))}
              {searchMatch.differences.map((difference, index) => (
                <li
                  key={`${difference.code}-${index}`}
                  className="alternative-difference"
                >
                  {localizeSearchMessage(locale, difference)}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          ref={detailsButton}
          type="button"
          className="primary-action-btn"
          onClick={onDetails}
        >
          {translate(locale, 'preview.details')}
        </button>
      </div>
    </div>
  );
}

// Shared by EventDetails and the dedicated ForumPanel (Phase 4.8 follow-up) -
// both open on the same event and need the same share action.
async function shareEvent(event: PublicEvent, locale: SupportedLocale) {
  const url = `${window.location.origin}/events/${event.id}`;
  if (navigator.share) {
    try {
      await navigator.share({
        title: event.title,
        text: translate(locale, 'details.shareText', { title: event.title }),
        url
      });
    } catch (err) {
      console.warn('Share failed', err);
    }
  } else {
    await navigator.clipboard.writeText(url);
    alert(translate(locale, 'details.linkCopied'));
  }
}

// The cover-to-edge hero (Phase 4.8 live feedback: back/share/favorite
// overlay the image itself rather than sitting in a separate row above it)
// - shared by EventDetails and ForumPanel so both panels look identical at
// the top regardless of which one is showing.
function EventHero({
  event,
  presentation,
  headingRef,
  onBack,
  isFavorite,
  onToggleFavorite,
  locale,
  hideBackButton,
  inlineBadge,
  user,
  authToken
}: {
  event: PublicEvent;
  presentation: ReturnType<typeof eventDetailsFields>['presentation'];
  headingRef?: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  locale: SupportedLocale;
  // ForumPanel renders its own, more prominent standalone Retour button
  // above the hero instead (live feedback: the overlaid one wasn't visible
  // enough against a bright/busy cover image) - EventDetails keeps the
  // overlaid one as-is, already confirmed working there.
  hideBackButton?: boolean;
  // Live feedback: the category badge doesn't need its own "banner" row -
  // put it on the same row as Partager/Envoyer/Favori instead, badge on
  // the left where Retour used to sit. Only used by ForumPanel (paired
  // with hideBackButton) - EventDetails keeps its own confirmed layout.
  inlineBadge?: boolean;
  // "Envoyer à un ami" (live feedback: external share is fine, but also
  // want to re-share within the app) - undefined since an anonymous
  // visitor viewing this hero has no signed-in user to share as.
  user: User | undefined;
  authToken: string | undefined;
}) {
  const [shareFriendOpen, setShareFriendOpen] = useState(false);
  return (
    <div
      className="details-hero"
      style={
        event.imageUrl
          ? {
              backgroundImage: `linear-gradient(180deg, rgba(13,11,20,0.35), rgba(13,11,20,0.85)), url(${event.imageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }
          : undefined
      }
    >
      <div className="details-hero-actions">
        {/* Back and the category badge are one left-hand group: with all
            three as direct space-between children the badge floated into
            the middle of the banner, detached from both. */}
        <div className="details-hero-actions-left">
          {!hideBackButton && (
            <button type="button" className="back-button" onClick={onBack}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Retour
            </button>
          )}
          {inlineBadge && (
            <div className="details-badge details-badge-inline">
              {SHORT_CATEGORY_LABELS[locale][event.category]}
            </div>
          )}
        </div>
        <div className="details-hero-actions-right">
          <button
            type="button"
            className="share-button"
            onClick={() => void shareEvent(event, locale)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            {translate(locale, 'details.share')}
          </button>
          {user && (
            <button
              type="button"
              className="share-friend-button"
              aria-label="Envoyer à un ami"
              title="Envoyer à un ami"
              onClick={() => setShareFriendOpen(true)}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
          <button
            type="button"
            className="favorite-button"
            aria-pressed={isFavorite}
            aria-label={translate(
              locale,
              isFavorite ? 'favorites.remove' : 'favorites.add'
            )}
            onClick={onToggleFavorite}
          >
            <HeartIcon filled={isFavorite} />
          </button>
        </div>
      </div>
      {!inlineBadge && (
        <div className="details-badge">
          {SHORT_CATEGORY_LABELS[locale][event.category]}
        </div>
      )}
      <h2 ref={headingRef} tabIndex={-1} className="details-title">
        {event.title}
      </h2>
      {presentation.organizer && (
        <p className="details-subtitle">{presentation.organizer}</p>
      )}
      {shareFriendOpen && user && (
        <ShareToFriendModal
          event={event}
          authToken={authToken}
          onClose={() => setShareFriendOpen(false)}
        />
      )}
    </div>
  );
}

// "Envoyer à un ami" (live feedback: external share is fine, but people
// also want to re-share an event with a friend directly in the app).
// Reuses the existing friends + direct-message infrastructure as-is - a
// message with the event's title and its own /events/:id deep link, no new
// backend concept needed.
function ShareToFriendModal({
  event,
  authToken,
  onClose
}: {
  event: PublicEvent;
  authToken: string | undefined;
  onClose: () => void;
}) {
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [sendingTo, setSendingTo] = useState<string>();

  useEffect(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/me/friends`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setFriends(friendsResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken]);

  const sendToFriend = (friendId: string) => {
    if (!authToken || sendingTo) return;
    setSendingTo(friendId);
    const url = `${window.location.origin}/events/${event.id}`;
    fetch(`${API_BASE_URL}/me/friends/${friendId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ body: `${event.title}\n${url}` })
    })
      .then((response) => (response.ok ? undefined : Promise.reject()))
      .then(() => setSentTo((prev) => new Set(prev).add(friendId)))
      .catch(() => {})
      .finally(() => setSendingTo(undefined));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="share-friend-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="conversation-modal-header">
          <strong>Envoyer à un ami</strong>
          <button type="button" className="text-btn" onClick={onClose}>
            Fermer
          </button>
        </div>
        <div className="share-friend-list">
          {state === 'loading' && (
            <p className="list-view-empty">Chargement…</p>
          )}
          {state === 'error' && (
            <p className="list-view-empty">
              Impossible de charger vos amis pour le moment.
            </p>
          )}
          {state === 'success' && friends.length === 0 && (
            <p className="list-view-empty">
              Ajoutez des amis pour pouvoir leur envoyer des événements.
            </p>
          )}
          {state === 'success' &&
            friends.map((friend) => (
              <div className="friends-row" key={friend.id}>
                <span className="friends-row-avatar">
                  {friend.avatarUrl ? (
                    <img src={friend.avatarUrl} alt="" />
                  ) : (
                    friend.displayName.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="friends-row-name">{friend.displayName}</span>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => sendToFriend(friend.id)}
                  disabled={sendingTo === friend.id || sentTo.has(friend.id)}
                >
                  {sentTo.has(friend.id)
                    ? 'Envoyé ✓'
                    : sendingTo === friend.id
                      ? 'Envoi…'
                      : 'Envoyer'}
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// Event date/venue/price/description + primary ticket-or-info action -
// shared by EventDetails' "À propos" tab and ForumPanel's "Événement" tab
// (Phase 4.8 follow-up: the dedicated forum panel needs a light peek at the
// event too, without duplicating this whole block by hand).
function EventAboutContent({
  event,
  presentation,
  isFavorite,
  onToggleFavorite,
  externalHref
}: {
  event: PublicEvent;
  presentation: ReturnType<typeof eventDetailsFields>['presentation'];
  isFavorite: boolean;
  onToggleFavorite: () => void;
  externalHref: string;
}) {
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const DESCRIPTION_PREVIEW_LENGTH = 180;
  const description = presentation.description ?? '';
  const descriptionIsLong = description.length > DESCRIPTION_PREVIEW_LENGTH;
  const visibleDescription =
    descriptionIsLong && !descriptionExpanded
      ? `${description.slice(0, DESCRIPTION_PREVIEW_LENGTH).trimEnd()}…`
      : description;

  return (
    <>
      <div className="details-info-list">
        <div className="info-item">
          <span className="info-icon">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </span>
          <div>
            <strong>Date et heure</strong>
            <p>{presentation.dateTime}</p>
          </div>
        </div>
        <div className="info-item">
          <span className="info-icon">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </span>
          <div>
            <strong>Lieu</strong>
            <p>{event.venue.name}</p>
            <p className="info-sub">{event.venue.address}</p>
          </div>
        </div>
        <div className="info-item">
          <span className="info-icon">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
          </span>
          <div>
            <strong>Prix</strong>
            <p>{presentation.price}</p>
          </div>
        </div>
      </div>

      <div className="details-actions-main">
        {presentation.externalAction ? (
          <a
            className="primary-action-btn glow-purple"
            href={externalHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            {presentation.externalAction}
          </a>
        ) : (
          <button className="primary-action-btn disabled" disabled>
            {presentation.externalUnavailable}
          </button>
        )}
        <button className="secondary-action-btn" onClick={onToggleFavorite}>
          <HeartIcon filled={isFavorite} />
          {isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        </button>
      </div>

      <div className="details-section">
        <p className="details-description">{visibleDescription}</p>
        {descriptionIsLong && (
          <button
            type="button"
            className="text-btn"
            onClick={() => setDescriptionExpanded((prev) => !prev)}
          >
            {descriptionExpanded ? 'Voir moins' : 'Voir plus'}
          </button>
        )}
      </div>
    </>
  );
}

function EventDetails({
  event,
  headingRef,
  onBack,
  isFavorite,
  onToggleFavorite,
  locale,
  user,
  authToken,
  onLogin,
  attendanceVisibility,
  onSetAttendance,
  onClearAttendance,
  initialTab,
  onOpenForumPanel
}: {
  event: PublicEvent;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  locale: SupportedLocale;
  user: User | undefined;
  authToken: string | undefined;
  onLogin: () => void;
  attendanceVisibility: AttendanceVisibility | undefined;
  onSetAttendance: (visibility: AttendanceVisibility) => void;
  onClearAttendance: () => void;
  initialTab: EventDetailsTab | undefined;
  // Live feedback (Phase 4.8 follow-up): this panel's own "Forum" tab is
  // now just a teaser (member count + last message + a button) rather than
  // the full posting UI - clicking through switches the parent into
  // ForumPanel mode for the same event instead of duplicating that
  // experience here.
  onOpenForumPanel: () => void;
}) {
  const [tab, setTab] = useState<EventDetailsTab>(initialTab ?? 'about');
  // EventDetails stays mounted across different events (see rightPanelMount)
  // rather than remounting per open, so the tab has to be reset explicitly
  // whenever a new event is opened - a plain useState initializer alone
  // would only apply on the very first mount.
  useEffect(() => {
    setTab(initialTab ?? 'about');
  }, [event.id, initialTab]);
  const { presentation } = eventDetailsFields(event, locale);
  const externalHref = `${API_BASE_URL}/events/${event.id}/external`;

  const [friendsAttending, setFriendsAttending] = useState<PublicUser[]>([]);
  useEffect(() => {
    if (!authToken) {
      setFriendsAttending([]);
      return;
    }
    fetch(`${API_BASE_URL}/events/${event.id}/friends-attending`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) =>
        setFriendsAttending(friendsAttendingResponseSchema.parse(json).data)
      )
      .catch(() => setFriendsAttending([]));
  }, [authToken, event.id]);

  return (
    <div
      className="event-details-content"
      aria-label={translate(locale, 'details.label')}
    >
      <EventHero
        event={event}
        presentation={presentation}
        headingRef={headingRef}
        onBack={onBack}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        locale={locale}
        user={user}
        authToken={authToken}
      />

      <div className="details-tabs details-tabs-centered">
        <button
          type="button"
          className={tab === 'about' ? 'active' : ''}
          onClick={() => setTab('about')}
        >
          À propos
        </button>
        <button
          type="button"
          className={tab === 'participants' ? 'active' : ''}
          onClick={() => setTab('participants')}
        >
          Participants
        </button>
        <button
          type="button"
          className={tab === 'forum' ? 'active' : ''}
          onClick={() => setTab('forum')}
        >
          Forum
        </button>
      </div>

      {tab === 'about' && (
        <EventAboutContent
          event={event}
          presentation={presentation}
          isFavorite={isFavorite}
          onToggleFavorite={onToggleFavorite}
          externalHref={externalHref}
        />
      )}

      {tab === 'participants' && (
        <div className="details-section">
          {!user ? (
            <SignInPrompt
              message="Connectez-vous pour voir qui de vos amis participe et indiquer votre propre présence."
              onLogin={onLogin}
            />
          ) : (
            <>
              <div className="attendance-row">
                <button
                  type="button"
                  className={`forum-follow-cta attendance-cta ${attendanceVisibility ? 'active' : ''}`}
                  onClick={() =>
                    attendanceVisibility
                      ? onClearAttendance()
                      : onSetAttendance('private')
                  }
                >
                  {attendanceVisibility ? '✓ Vous y allez' : "🎟️ J'y vais"}
                </button>
                {attendanceVisibility && (
                  <AttendanceVisibilityToggle
                    value={attendanceVisibility}
                    onChange={onSetAttendance}
                  />
                )}
              </div>
              {friendsAttending.length > 0 ? (
                <div className="attendance-friends">
                  {friendsAttending.map((attendee) => (
                    <span className="attendance-friend" key={attendee.id}>
                      <span className="friends-row-avatar">
                        {attendee.avatarUrl ? (
                          <img src={attendee.avatarUrl} alt="" />
                        ) : (
                          attendee.displayName.slice(0, 1).toUpperCase()
                        )}
                      </span>
                      {attendee.displayName}
                    </span>
                  ))}
                  <span className="attendance-friends-label">
                    {friendsAttending.length === 1
                      ? 'y va aussi'
                      : 'y vont aussi'}
                  </span>
                </div>
              ) : (
                <p className="list-view-empty">
                  Aucun de vos amis n'a indiqué y participer.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'forum' && (
        <div className="details-section">
          {!user ? (
            <SignInPrompt
              message="Connectez-vous pour lire et participer au forum de cet événement."
              onLogin={onLogin}
            />
          ) : (
            <ForumTeaser
              eventId={event.id}
              authToken={authToken}
              onOpenForumPanel={onOpenForumPanel}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Live feedback (Phase 4.8 follow-up): this panel's "Forum" tab should only
// let you quickly reach/join the discussion, not post directly - the full
// posting UI (categories, composer) lives solely in the dedicated
// ForumPanel now, so the real forum experience stays centralized in one
// place instead of duplicated here.
function ForumTeaser({
  eventId,
  authToken,
  onOpenForumPanel
}: {
  eventId: string;
  authToken: string | undefined;
  onOpenForumPanel: () => void;
}) {
  const [members, setMembers] = useState<PublicUser[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );

  useEffect(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/events/${eventId}/forum/members`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setMembers(forumMembersResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken, eventId]);

  // "Ajouter ce forum" (live feedback) - lets someone keep a forum in "Mes
  // forums" straight from the plain event panel's teaser, without opening
  // the full ForumPanel or posting anything.
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  useEffect(() => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/events/${eventId}/forum/follow`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) =>
        setFollowing(forumFollowResponseSchema.parse(json).following)
      )
      .catch(() => {});
  }, [authToken, eventId]);
  const toggleFollow = () => {
    if (!authToken || followLoading) return;
    setFollowLoading(true);
    const nextFollowing = !following;
    setFollowing(nextFollowing);
    fetch(`${API_BASE_URL}/events/${eventId}/forum/follow`, {
      method: nextFollowing ? 'POST' : 'DELETE',
      headers: { authorization: `Bearer ${authToken}` }
    })
      .catch(() => setFollowing(!nextFollowing))
      .finally(() => setFollowLoading(false));
  };

  return (
    <div className="forum-teaser">
      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'error' && (
        <p className="list-view-empty">
          Impossible de charger le forum pour le moment.
        </p>
      )}
      {state === 'success' && members.length > 0 && (
        <div className="forum-teaser-members">
          <div className="forum-members-avatars">
            {members.slice(0, 6).map((member) => (
              <span
                className="friends-row-avatar"
                key={member.id}
                title={member.displayName}
              >
                {member.avatarUrl ? (
                  <img src={member.avatarUrl} alt="" />
                ) : (
                  member.displayName.slice(0, 1).toUpperCase()
                )}
              </span>
            ))}
          </div>
          <span className="forum-members-count">
            {members.length} membre{members.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
      {state === 'success' && members.length === 0 && (
        <p className="list-view-empty">
          Personne n'a encore écrit ici. Sois le premier !
        </p>
      )}
      <div className="forum-teaser-actions">
        <button type="button" className="meetup-btn" onClick={onOpenForumPanel}>
          Rejoindre la discussion
        </button>
        <button
          type="button"
          className={`forum-follow-cta ${following ? 'active' : ''}`}
          onClick={toggleFollow}
          disabled={followLoading}
        >
          {following ? '✓ Forum ajouté' : '+ Ajouter ce forum'}
        </button>
      </div>
    </div>
  );
}

type ForumPanelTab =
  'discussion' | 'evenement' | 'membres' | 'photos' | 'apropos';

const FORUM_PANEL_TAB_LABELS: Record<ForumPanelTab, string> = {
  discussion: 'Discussion',
  evenement: 'Événement',
  membres: 'Membres',
  photos: 'Photos',
  apropos: 'À propos'
};

// The dedicated Forum panel (Phase 4.8 follow-up) - opened specifically
// from the Forums discovery grid, not from Carte/Événements/Lieux (those
// keep the plainer EventDetails with its lightweight ForumTeaser). This is
// where the full, rich forum experience lives: category pills + composer,
// real member list, "Rencontrer avant l'événement" - centralized here
// rather than duplicated across panels, matching the reference mockup.
function ForumPanel({
  event,
  onBack,
  isFavorite,
  onToggleFavorite,
  locale,
  user,
  authToken,
  onLogin,
  eventFirst,
  attendanceVisibility,
  onSetAttendance,
  onClearAttendance
}: {
  event: PublicEvent;
  onBack: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  locale: SupportedLocale;
  user: User | undefined;
  authToken: string | undefined;
  onLogin: () => void;
  // Phase 4.14: which tab this panel opens on/lists first. True from every
  // entry point except the Forums section itself (ActiveForumsPage), which
  // keeps "Discussion" first since browsing forums is the whole point
  // there - "Événement" first everywhere else (Événements, Lieux, Groupes,
  // Messages, the connected Carte page's pin popup).
  eventFirst?: boolean;
  // Live feedback: this is now the panel almost every real entry point
  // opens (Carte, Événements, Lieux, Forums, Groupes, Messages all pass
  // asForumPanel:true) - it had no "J'y vais" control at all, only the
  // rarer plain EventDetails did. Same real attendance state/handlers as
  // EventDetails, just threaded here too.
  attendanceVisibility: AttendanceVisibility | undefined;
  onSetAttendance: (visibility: AttendanceVisibility) => void;
  onClearAttendance: () => void;
}) {
  const [tab, setTab] = useState<ForumPanelTab>(
    eventFirst ? 'evenement' : 'discussion'
  );
  const [friendsAttending, setFriendsAttending] = useState<PublicUser[]>([]);
  useEffect(() => {
    if (!authToken) {
      setFriendsAttending([]);
      return;
    }
    fetch(`${API_BASE_URL}/events/${event.id}/friends-attending`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) =>
        setFriendsAttending(friendsAttendingResponseSchema.parse(json).data)
      )
      .catch(() => setFriendsAttending([]));
  }, [authToken, event.id]);
  useEffect(() => {
    setTab(eventFirst ? 'evenement' : 'discussion');
  }, [event.id, eventFirst]);

  const { presentation } = eventDetailsFields(event, locale);
  const externalHref = `${API_BASE_URL}/events/${event.id}/external`;

  const [members, setMembers] = useState<PublicUser[]>([]);
  const [membersState, setMembersState] = useState<
    'loading' | 'success' | 'error'
  >('loading');
  useEffect(() => {
    if (!authToken) return;
    setMembersState('loading');
    fetch(`${API_BASE_URL}/events/${event.id}/forum/members`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setMembers(forumMembersResponseSchema.parse(json).data);
        setMembersState('success');
      })
      .catch(() => setMembersState('error'));
  }, [authToken, event.id]);

  const [meetupGroup, setMeetupGroup] = useState<Group>();
  const [meetupLoading, setMeetupLoading] = useState(false);
  const openMeetupGroup = () => {
    if (!authToken || meetupLoading) return;
    setMeetupLoading(true);
    fetch(`${API_BASE_URL}/events/${event.id}/meetup-group`, {
      method: 'POST',
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => setMeetupGroup(groupResponseSchema.parse(json).data))
      .catch(() => {})
      .finally(() => setMeetupLoading(false));
  };

  // "Suivre ce forum" (Phase 4.8 follow-up) - a real, explicit bookmark
  // distinct from posting or favoriting/attending the event, so someone
  // can keep a forum in "Mes forums" just by wanting to follow it.
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  useEffect(() => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/events/${event.id}/forum/follow`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) =>
        setFollowing(forumFollowResponseSchema.parse(json).following)
      )
      .catch(() => {});
  }, [authToken, event.id]);
  const toggleFollow = () => {
    if (!authToken || followLoading) return;
    setFollowLoading(true);
    const nextFollowing = !following;
    setFollowing(nextFollowing);
    fetch(`${API_BASE_URL}/events/${event.id}/forum/follow`, {
      method: nextFollowing ? 'POST' : 'DELETE',
      headers: { authorization: `Bearer ${authToken}` }
    })
      .catch(() => setFollowing(!nextFollowing))
      .finally(() => setFollowLoading(false));
  };

  return (
    <div className="forum-panel-layout" aria-label="Forum de l'événement">
      <div className="forum-panel-main">
        <div className="forum-panel-hero-wrap">
          <button type="button" className="forum-panel-back" onClick={onBack}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Retour
          </button>

          <EventHero
            event={event}
            presentation={presentation}
            isFavorite={isFavorite}
            onToggleFavorite={onToggleFavorite}
            locale={locale}
            onBack={onBack}
            hideBackButton
            inlineBadge
            user={user}
            authToken={authToken}
          />
        </div>

        {user && (
          <div className="details-meetup-row">
            <button
              type="button"
              className={`forum-follow-cta attendance-cta ${attendanceVisibility ? 'active' : ''}`}
              onClick={() =>
                attendanceVisibility
                  ? onClearAttendance()
                  : onSetAttendance('private')
              }
            >
              {attendanceVisibility ? '✓ Vous y allez' : "🎟️ J'y vais"}
            </button>
            {attendanceVisibility && (
              <AttendanceVisibilityToggle
                value={attendanceVisibility}
                onChange={onSetAttendance}
              />
            )}
            <button
              type="button"
              className="meetup-btn"
              onClick={openMeetupGroup}
              disabled={meetupLoading}
            >
              🤝{' '}
              {meetupLoading ? 'Un instant…' : "Rencontrer avant l'événement"}
            </button>
          </div>
        )}
        {user && friendsAttending.length > 0 && (
          <div className="attendance-friends forum-panel-attendance-friends">
            {friendsAttending.map((attendee) => (
              <span className="attendance-friend" key={attendee.id}>
                <span className="friends-row-avatar">
                  {attendee.avatarUrl ? (
                    <img src={attendee.avatarUrl} alt="" />
                  ) : (
                    attendee.displayName.slice(0, 1).toUpperCase()
                  )}
                </span>
                {attendee.displayName}
              </span>
            ))}
            <span className="attendance-friends-label">
              {friendsAttending.length === 1 ? 'y va aussi' : 'y vont aussi'}
            </span>
          </div>
        )}

        <div className="details-tabs">
          {(
            [
              ...(eventFirst
                ? (['evenement', 'discussion'] as const)
                : (['discussion', 'evenement'] as const)),
              'membres',
              'photos',
              'apropos'
            ] as ForumPanelTab[]
          ).map((tabId) => (
            <button
              key={tabId}
              type="button"
              className={tab === tabId ? 'active' : ''}
              onClick={() => setTab(tabId)}
            >
              {FORUM_PANEL_TAB_LABELS[tabId]}
            </button>
          ))}
        </div>

        {tab === 'discussion' && (
          <div className="details-section">
            {!user ? (
              <SignInPrompt
                message="Connectez-vous pour lire et participer au forum de cet événement."
                onLogin={onLogin}
              />
            ) : (
              <EventForum
                eventId={event.id}
                authToken={authToken}
                userId={user.id}
                user={user}
              />
            )}
          </div>
        )}

        {tab === 'evenement' && (
          <EventAboutContent
            event={event}
            presentation={presentation}
            isFavorite={isFavorite}
            onToggleFavorite={onToggleFavorite}
            externalHref={externalHref}
          />
        )}

        {tab === 'membres' && (
          <div className="details-section">
            {membersState === 'loading' && (
              <p className="list-view-empty">Chargement…</p>
            )}
            {membersState === 'error' && (
              <p className="list-view-empty">
                Impossible de charger les membres pour le moment.
              </p>
            )}
            {membersState === 'success' && members.length === 0 && (
              <p className="list-view-empty">
                Personne n'a encore écrit ici. Lance la discussion dans l'onglet
                Discussion !
              </p>
            )}
            {membersState === 'success' && members.length > 0 && (
              <div className="forum-members-list">
                {members.map((member) => (
                  <div className="friends-row" key={member.id}>
                    <span className="friends-row-avatar">
                      {member.avatarUrl ? (
                        <img src={member.avatarUrl} alt="" />
                      ) : (
                        member.displayName.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span className="friends-row-name">
                      {member.displayName}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'photos' && (
          <div className="details-section">
            {!user ? (
              <SignInPrompt
                message="Connectez-vous pour voir et partager des photos de cet événement."
                onLogin={onLogin}
              />
            ) : (
              <EventPhotosTab
                eventId={event.id}
                authToken={authToken}
                userId={user.id}
              />
            )}
          </div>
        )}

        {tab === 'apropos' && (
          <div className="details-section forum-about-grid">
            <div className="forum-about-card">
              <span className="forum-about-icon" aria-hidden="true">
                💬
              </span>
              <div>
                <strong>Un espace pour cet événement</strong>
                <p>
                  Discutez de « {event.title} », posez vos questions et trouvez
                  des partenaires pour la soirée.
                </p>
              </div>
            </div>
            <div className="forum-about-card">
              <span className="forum-about-icon" aria-hidden="true">
                ✏️
              </span>
              <div>
                <strong>Un message, une fois</strong>
                <p>
                  Un message publié n'est pas modifiable après coup — seulement
                  supprimable par son auteur.
                </p>
              </div>
            </div>
            <div className="forum-about-card">
              <span className="forum-about-icon" aria-hidden="true">
                🎟️
              </span>
              <div>
                <strong>Revente entre particuliers</strong>
                <p>
                  La revente de billets entre participants reste entièrement
                  pair-à-pair — Pulso n'y est jamais partie prenante.
                </p>
              </div>
            </div>
            <div className="forum-about-card">
              <span className="forum-about-icon" aria-hidden="true">
                🚩
              </span>
              <div>
                <strong>Signalement</strong>
                <p>
                  Chaque message peut être signalé. Restez courtois·e envers les
                  autres participants.
                </p>
              </div>
            </div>
          </div>
        )}

        {meetupGroup && user && (
          <GroupModal
            group={meetupGroup}
            authToken={authToken}
            userId={user.id}
            onClose={() => setMeetupGroup(undefined)}
            onLeft={() => setMeetupGroup(undefined)}
          />
        )}
      </div>

      <aside className="forum-panel-rail">
        <div className="forum-panel-rail-card">
          <h3>À propos de l'événement</h3>
          <div className="forum-panel-rail-event">
            <div
              className="forum-panel-rail-thumb"
              style={
                event.imageUrl
                  ? {
                      backgroundImage: `url(${event.imageUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center'
                    }
                  : undefined
              }
            >
              {!event.imageUrl && (
                <EventImageFallback category={event.category} />
              )}
            </div>
            <div className="forum-panel-rail-event-info">
              <span>{presentation.dateTime}</span>
              <span>{event.venue.name}</span>
              <span className="forum-panel-rail-address">
                {event.venue.address}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="text-btn"
            onClick={() => setTab('evenement')}
          >
            Voir l'événement
          </button>
        </div>

        <div className="forum-panel-rail-card">
          <h3>Membres</h3>
          {membersState === 'success' && members.length > 0 ? (
            <div className="forum-panel-members-row">
              <div className="forum-members-avatars">
                {members.slice(0, 8).map((member) => (
                  <span
                    className="friends-row-avatar"
                    key={member.id}
                    title={member.displayName}
                  >
                    {member.avatarUrl ? (
                      <img src={member.avatarUrl} alt="" />
                    ) : (
                      member.displayName.slice(0, 1).toUpperCase()
                    )}
                  </span>
                ))}
              </div>
              <span className="forum-members-count">
                {members.length} membre{members.length !== 1 ? 's' : ''}
              </span>
            </div>
          ) : (
            <p className="list-view-empty">Personne n'a encore écrit ici.</p>
          )}
        </div>

        <div className="forum-panel-rail-card">
          <h3>Règles du forum</h3>
          <ul className="forum-panel-rail-rules">
            <li>Respect et bienveillance avant tout</li>
            <li>Pas de spam ni de publicité</li>
            <li>Revente de billets uniquement pair-à-pair</li>
            <li>Reste sur le sujet de l'événement</li>
          </ul>
        </div>

        {user && (
          <div className="forum-panel-rail-card">
            <h3>Actions rapides</h3>
            <button
              type="button"
              className={`forum-follow-cta ${following ? 'active' : ''}`}
              onClick={toggleFollow}
              disabled={followLoading}
            >
              {following ? '✓ Forum suivi' : '+ Suivre ce forum'}
            </button>
            <button
              type="button"
              className="forum-panel-rail-action"
              onClick={() => setTab('membres')}
            >
              Voir les membres
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

// Real photos of the event (Phase 4.8 follow-up) - stored on the API's own
// local disk (see event-photos.ts), distinct from the forum's text-only
// posts. Organizers publishing about their own event is a monetization
// idea the user raised for later; this is just the base sharing feature.
function EventPhotosTab({
  eventId,
  authToken,
  userId
}: {
  eventId: string;
  authToken: string | undefined;
  userId: string;
}) {
  const [photos, setPhotos] = useState<EventPhoto[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/events/${eventId}/photos`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setPhotos(eventPhotosResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken, eventId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const uploadPhoto = (file: File) => {
    if (!authToken || uploading) return;
    setUploading(true);
    setUploadError(false);
    const form = new FormData();
    form.append('file', file);
    fetch(`${API_BASE_URL}/events/${eventId}/photos`, {
      method: 'POST',
      headers: { authorization: `Bearer ${authToken}` },
      body: form
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        eventPhotoResponseSchema.parse(json);
        refresh();
      })
      .catch(() => setUploadError(true))
      .finally(() => setUploading(false));
  };

  const removePhoto = (photoId: string) => {
    if (!authToken) return;
    setPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
    void fetch(`${API_BASE_URL}/events/${eventId}/photos/${photoId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${authToken}` }
    }).catch(() => refresh());
  };

  return (
    <>
      <div className="event-photos-upload">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) uploadPhoto(file);
          }}
        />
        <button
          type="button"
          className="btn-secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Envoi en cours…' : '📷 Ajouter une photo'}
        </button>
        {uploadError && (
          <span className="event-photos-upload-error">
            L'envoi a échoué. Réessayez avec une photo JPEG, PNG, WebP ou GIF.
          </span>
        )}
      </div>

      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'error' && (
        <p className="list-view-empty">
          Impossible de charger les photos pour le moment.
        </p>
      )}
      {state === 'success' && photos.length === 0 && (
        <p className="list-view-empty">
          Aucune photo pour l'instant. Partage la première !
        </p>
      )}
      {state === 'success' && photos.length > 0 && (
        <div className="event-photos-grid">
          {photos.map((photo) => (
            <div className="event-photo-card" key={photo.id}>
              <img src={photo.url} alt="" loading="lazy" />
              {photo.uploader.id === userId && (
                <button
                  type="button"
                  className="event-photo-delete"
                  onClick={() => removePhoto(photo.id)}
                  aria-label="Supprimer cette photo"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SignInPrompt({
  message,
  onLogin
}: {
  message: string;
  onLogin: () => void;
}) {
  return (
    <div className="sign-in-prompt">
      <span className="sign-in-prompt-icon" aria-hidden="true">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="10" cy="7" r="4" />
          <path d="M22 8v6M19 11h6" />
        </svg>
      </span>
      <p>{message}</p>
      <button type="button" className="sign-in-prompt-btn" onClick={onLogin}>
        Se connecter
      </button>
    </div>
  );
}

const FORUM_ROOM_PRESENTATION: Record<
  ForumCategory,
  {
    icon: string;
    description: string;
    placeholder: string;
    emptyMessage: string;
  }
> = {
  general: {
    icon: '💬',
    description: 'Questions, conseils et impressions autour de la sortie.',
    placeholder: 'Pose une question ou partage un bon plan…',
    emptyMessage:
      'Pose la première question ou partage ton conseil sur la soirée.'
  },
  find_partners: {
    icon: '👋',
    description: 'Présente-toi et trouve des personnes avec qui y aller.',
    placeholder: 'Dis qui tu es et avec qui tu aimerais y aller…',
    emptyMessage:
      'Présente-toi et propose un point de rendez-vous avant l’événement.'
  },
  ticket_resale: {
    icon: '🎟️',
    description: 'Propositions de billets entre membres de la communauté.',
    placeholder: 'Décris clairement le billet que tu proposes ou recherches…',
    emptyMessage:
      'Indique le type de billet recherché ou proposé, sans partager de données sensibles.'
  },
  find_someone: {
    icon: '🔎',
    description: 'Retrouve une personne croisée pendant l’événement.',
    placeholder: 'Décris le contexte de votre rencontre avec respect…',
    emptyMessage:
      'Décris sobrement le moment et le lieu de la rencontre pour lancer la recherche.'
  }
};

function EventForum({
  eventId,
  authToken,
  userId,
  user
}: {
  eventId: string;
  authToken: string | undefined;
  userId: string;
  user: User;
}) {
  const [category, setCategory] = useState<ForumCategory>('general');
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(
    new Set()
  );
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [roomCounts, setRoomCounts] = useState<
    Partial<Record<ForumCategory, number>>
  >({});

  const refresh = useCallback(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/events/${eventId}/forum/${category}`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        const nextPosts = forumPostsResponseSchema.parse(json).data;
        setPosts(nextPosts);
        setRoomCounts((previous) => ({
          ...previous,
          [category]: nextPosts.length
        }));
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken, eventId, category]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;
    Promise.all(
      FORUM_CATEGORIES.map(async (room) => {
        const response = await fetch(
          `${API_BASE_URL}/events/${eventId}/forum/${room}`,
          { headers: { authorization: `Bearer ${authToken}` } }
        );
        if (!response.ok) throw new Error('forum-room-count');
        const json = await response.json();
        return [
          room,
          forumPostsResponseSchema.parse(json).data.length
        ] as const;
      })
    )
      .then((entries) => {
        if (!cancelled) {
          setRoomCounts(Object.fromEntries(entries));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authToken, eventId]);

  const submitPost = (parentId?: string) => {
    const body = (parentId ? replyDrafts[parentId] : draft)?.trim();
    if (!authToken || !body || posting) return;
    setPosting(true);
    fetch(`${API_BASE_URL}/events/${eventId}/forum/${category}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ body, ...(parentId ? { parentId } : {}) })
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(() => {
        if (parentId) {
          setReplyDrafts((prev) => ({ ...prev, [parentId]: '' }));
          setExpandedReplies((prev) => new Set(prev).add(parentId));
        } else {
          setDraft('');
        }
        refresh();
      })
      .catch(() => {})
      .finally(() => setPosting(false));
  };

  const removePost = (postId: string) => {
    if (!authToken) return;
    void fetch(`${API_BASE_URL}/events/${eventId}/forum/posts/${postId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${authToken}` }
    }).then(() => refresh());
  };

  // Optimistic toggle, resynced from the server on failure - a like is
  // low-stakes enough not to need a pending/error state of its own.
  const toggleLike = (post: ForumPost) => {
    if (!authToken) return;
    setPosts((prev) =>
      prev.map((candidate) =>
        candidate.id === post.id
          ? {
              ...candidate,
              likedByMe: !candidate.likedByMe,
              likeCount: candidate.likeCount + (candidate.likedByMe ? -1 : 1)
            }
          : candidate
      )
    );
    fetch(`${API_BASE_URL}/events/${eventId}/forum/posts/${post.id}/like`, {
      method: post.likedByMe ? 'DELETE' : 'POST',
      headers: { authorization: `Bearer ${authToken}` }
    }).catch(() => refresh());
  };

  const toggleExpanded = (postId: string) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  const topLevelPosts = posts.filter((post) => !post.parentId);
  const repliesFor = (postId: string) =>
    posts.filter((post) => post.parentId === postId);
  const activeRoom = FORUM_ROOM_PRESENTATION[category];
  const totalMessages = Object.values(roomCounts).reduce(
    (sum, count) => sum + (count ?? 0),
    0
  );

  return (
    <div className="event-forum">
      <div className="forum-community-intro">
        <div>
          <span className="forum-section-eyebrow">L’agora de l’événement</span>
          <h2>Choisis ton espace de discussion</h2>
          <p>
            Quatre salons, un seul événement : va directement vers la
            conversation qui t’intéresse.
          </p>
        </div>
        <span className="forum-community-count">
          <b>{totalMessages}</b>
          message{totalMessages !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="forum-rooms" role="tablist" aria-label="Salons du forum">
        {FORUM_CATEGORIES.map((option) => (
          <button
            type="button"
            key={option}
            role="tab"
            aria-selected={category === option}
            className={`forum-room-card ${category === option ? 'active' : ''}`}
            onClick={() => setCategory(option)}
          >
            <span className="forum-room-icon" aria-hidden="true">
              {FORUM_ROOM_PRESENTATION[option].icon}
            </span>
            <span className="forum-room-copy">
              <strong>{FORUM_CATEGORY_LABELS[option]}</strong>
              <small>{FORUM_ROOM_PRESENTATION[option].description}</small>
            </span>
            <span className="forum-room-count">
              {roomCounts[option] ?? '—'}
            </span>
          </button>
        ))}
      </div>

      <section className="forum-feed-shell" aria-labelledby="forum-feed-title">
        <div className="forum-feed-heading">
          <span className="forum-room-icon" aria-hidden="true">
            {activeRoom.icon}
          </span>
          <div>
            <span className="forum-section-eyebrow">Salon sélectionné</span>
            <h3 id="forum-feed-title">{FORUM_CATEGORY_LABELS[category]}</h3>
            <p>{activeRoom.description}</p>
          </div>
          <span className="forum-feed-count">
            {roomCounts[category] ?? 0} message
            {(roomCounts[category] ?? 0) !== 1 ? 's' : ''}
          </span>
        </div>

        {category === 'ticket_resale' && (
          <p className="forum-disclaimer">
            <span aria-hidden="true">!</span>
            <span>
              <strong>Échange entre particuliers uniquement.</strong> Pulso
              n’intervient pas dans la transaction : aucun paiement ni billet ne
              transite par la plateforme.
            </span>
          </p>
        )}

        <form
          className="forum-composer forum-main-composer"
          onSubmit={(event) => {
            event.preventDefault();
            submitPost();
          }}
        >
          <span className="friends-row-avatar forum-composer-avatar">
            {renderUserAvatarContent(user)}
          </span>
          <div className="forum-composer-body">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={activeRoom.placeholder}
              aria-label={`Écrire dans le salon ${FORUM_CATEGORY_LABELS[category]}`}
              maxLength={2000}
              rows={3}
            />
            <div className="forum-composer-footer">
              <span>{draft.length}/2000</span>
              <button
                type="submit"
                className="btn-secondary"
                disabled={posting || !draft.trim()}
              >
                {posting ? 'Publication…' : 'Publier'}
              </button>
            </div>
          </div>
        </form>

        <div className="forum-posts">
          {state === 'loading' && (
            <p className="list-view-empty">Chargement…</p>
          )}
          {state === 'error' && (
            <p className="list-view-empty">
              Impossible de charger le forum pour le moment.
            </p>
          )}
          {state === 'success' && topLevelPosts.length === 0 && (
            <div className="forum-empty-conversation">
              <span aria-hidden="true">{activeRoom.icon}</span>
              <strong>La conversation n’attend que toi.</strong>
              <p>{activeRoom.emptyMessage}</p>
            </div>
          )}
          {state === 'success' &&
            topLevelPosts.map((post) => (
              <ForumPostRow
                key={post.id}
                post={post}
                userId={userId}
                authToken={authToken}
                onLike={toggleLike}
                onDelete={removePost}
                replies={repliesFor(post.id)}
                expanded={expandedReplies.has(post.id)}
                onToggleExpanded={() => toggleExpanded(post.id)}
                replyDraft={replyDrafts[post.id] ?? ''}
                onReplyDraftChange={(value) =>
                  setReplyDrafts((prev) => ({ ...prev, [post.id]: value }))
                }
                onSubmitReply={() => submitPost(post.id)}
                posting={posting}
              />
            ))}
        </div>
      </section>
    </div>
  );
}

function ForumPostAuthorRow({
  post,
  userId,
  authToken,
  onDelete
}: {
  post: ForumPost;
  userId: string;
  authToken: string | undefined;
  onDelete: () => void;
}) {
  return (
    <div className="forum-post-meta">
      <span className="forum-post-author">
        <strong>{post.author.displayName}</strong>
        <time dateTime={post.createdAt}>
          {formatRelativeTime(post.createdAt)}
        </time>
      </span>
      {post.author.id === userId ? (
        <button type="button" className="text-btn" onClick={onDelete}>
          Supprimer
        </button>
      ) : (
        <button
          type="button"
          className="text-btn"
          onClick={() => reportContent(authToken, 'forum_post', post.id)}
        >
          Signaler
        </button>
      )}
    </div>
  );
}

function ForumPostRow({
  post,
  userId,
  authToken,
  onLike,
  onDelete,
  replies,
  expanded,
  onToggleExpanded,
  replyDraft,
  onReplyDraftChange,
  onSubmitReply,
  posting
}: {
  post: ForumPost;
  userId: string;
  authToken: string | undefined;
  onLike: (post: ForumPost) => void;
  onDelete: (postId: string) => void;
  replies: ForumPost[];
  expanded: boolean;
  onToggleExpanded: () => void;
  replyDraft: string;
  onReplyDraftChange: (value: string) => void;
  onSubmitReply: () => void;
  posting: boolean;
}) {
  return (
    <div className={`forum-post ${post.author.id === userId ? 'mine' : ''}`}>
      <span className="friends-row-avatar">
        {post.author.avatarUrl ? (
          <img src={post.author.avatarUrl} alt="" />
        ) : (
          post.author.displayName.slice(0, 1).toUpperCase()
        )}
      </span>
      <div className="forum-post-body">
        <ForumPostAuthorRow
          post={post}
          userId={userId}
          authToken={authToken}
          onDelete={() => onDelete(post.id)}
        />
        <p>{post.body}</p>
        <div className="forum-post-actions">
          <button
            type="button"
            className={`forum-like-btn ${post.likedByMe ? 'active' : ''}`}
            onClick={() => onLike(post)}
          >
            <HeartIcon filled={post.likedByMe} />
            <span>{post.likedByMe ? 'Aimé' : 'J’aime'}</span>
            {post.likeCount > 0 && <b>{post.likeCount}</b>}
          </button>
          <button type="button" className="text-btn" onClick={onToggleExpanded}>
            {post.replyCount === 0
              ? 'Répondre'
              : `${post.replyCount} réponse${post.replyCount !== 1 ? 's' : ''}`}
          </button>
        </div>

        {expanded && (
          <div className="forum-replies">
            {replies.map((reply) => (
              <div
                className={`forum-post forum-reply ${reply.author.id === userId ? 'mine' : ''}`}
                key={reply.id}
              >
                <span className="friends-row-avatar">
                  {reply.author.avatarUrl ? (
                    <img src={reply.author.avatarUrl} alt="" />
                  ) : (
                    reply.author.displayName.slice(0, 1).toUpperCase()
                  )}
                </span>
                <div className="forum-post-body">
                  <ForumPostAuthorRow
                    post={reply}
                    userId={userId}
                    authToken={authToken}
                    onDelete={() => onDelete(reply.id)}
                  />
                  <p>{reply.body}</p>
                  <button
                    type="button"
                    className={`forum-like-btn ${reply.likedByMe ? 'active' : ''}`}
                    onClick={() => onLike(reply)}
                  >
                    <HeartIcon filled={reply.likedByMe} />
                    <span>{reply.likedByMe ? 'Aimé' : 'J’aime'}</span>
                    {reply.likeCount > 0 && <b>{reply.likeCount}</b>}
                  </button>
                </div>
              </div>
            ))}
            <form
              className="forum-composer forum-reply-composer"
              onSubmit={(event) => {
                event.preventDefault();
                onSubmitReply();
              }}
            >
              <textarea
                value={replyDraft}
                onChange={(event) => onReplyDraftChange(event.target.value)}
                placeholder="Répondre…"
                maxLength={2000}
                rows={1}
              />
              <button
                type="submit"
                className="btn-secondary"
                disabled={posting || !replyDraft.trim()}
              >
                Répondre
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
