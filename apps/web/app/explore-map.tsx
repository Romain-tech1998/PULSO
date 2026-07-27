'use client';

import {
  buildMapEventsQuery,
  CATEGORY_FILTER_OPTIONS,
  DATE_FILTER_OPTIONS,
  eventDetailsResponseSchema,
  eventListResponseSchema,
  intelligentSearchResponseSchema,
  meResponseSchema,
  PRICE_FILTER_OPTIONS,
  VENUE_CATEGORY_FILTER_OPTIONS,
  venueListResponseSchema,
  type IntelligentSearchResponse,
  type SearchConstraintKey,
  type PublicEvent,
  type PublicVenue,
  type User
} from '@pulso/contracts';
import {
  DEFAULT_DISCOVERY_FILTERS,
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
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from 'react';

import { eventDetailsFields, eventPreviewFields } from './event-view-model';
import { persistBrowserLocale, resolveBrowserLocale } from './locale-client';
import { deriveVenuePriceTier, type VenuePriceTier } from './venue-price-tier';

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
// Style dark garanti sans clé - MapLibre démo dark
const MAP_STYLE_DARK: maplibregl.StyleSpecification = {
  version: 8,
  name: 'Pulso Dark',
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap &copy; CartoDB'
    }
  },
  layers: [
    {
      id: 'carto-dark',
      type: 'raster',
      source: 'carto'
    }
  ]
};
const MAP_STYLE_URL: string | maplibregl.StyleSpecification =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? MAP_STYLE_DARK;

const PIN_WIDTH = 34;
const PIN_HEIGHT = 44;
// Pins are rasterized once at load time, not re-drawn per zoom level -
// without oversampling, MapLibre stretches these few dozen source pixels
// across many device pixels on any HiDPI screen, which is what read as a
// jagged/discontinuous outline rather than a clean stroke. Rendering at 3x
// and declaring that via addImage's pixelRatio option keeps the edge crisp
// regardless of screen density or icon-size zoom scaling.
const PIN_SCALE = 3;

/**
 * Classic teardrop map-pin shape (colored fill, white ring, white dot
 * center), rasterized on a canvas - replaces the plain flat circle markers,
 * which read as generic dots rather than map pins. Drawn on canvas and
 * passed to maplibre as raw ImageData rather than an SVG data URI fed
 * through Map.loadImage(): that path threw "source image could not be
 * decoded" in this environment, silently dropping every pin.
 */
function buildPinImageData(color: string): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = PIN_WIDTH * PIN_SCALE;
  canvas.height = PIN_HEIGHT * PIN_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable.');
  ctx.scale(PIN_SCALE, PIN_SCALE);

  ctx.beginPath();
  ctx.moveTo(17, 0);
  ctx.bezierCurveTo(7.611, 0, 0, 7.611, 0, 17);
  ctx.bezierCurveTo(0, 29.75, 17, 44, 17, 44);
  ctx.bezierCurveTo(17, 44, 34, 29.75, 34, 17);
  ctx.bezierCurveTo(34, 7.611, 26.389, 0, 17, 0);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(17, 17, 6.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

const CLUSTER_BADGE_SIZE = 72;

/**
 * Cluster badge: a soft brand-gradient disc (UI-0001's canonical
 * #7336C1 → #EA3E81 → #FE7C5C gradient) with a white ring, replacing the
 * previous flat single-color circle - the point-count text is drawn by a
 * separate symbol layer stacked on top, unchanged. Oversampled at PIN_SCALE
 * for the same reason as buildPinImageData above.
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
  const gradient = ctx.createLinearGradient(0, 0, CLUSTER_BADGE_SIZE, CLUSTER_BADGE_SIZE);
  gradient.addColorStop(0, '#7336C1');
  gradient.addColorStop(0.5, '#EA3E81');
  gradient.addColorStop(1, '#FE7C5C');

  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
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

interface ActiveSearch {
  query: string;
  manualFilters: DiscoveryFilters;
  disabledDerivedKeys: SearchConstraintKey[];
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
  const [location, setLocation] = useState<{ longitude: number; latitude: number }>();

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

function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);
  useEffect(() => {
    const stored = localStorage.getItem('pulso-favorites');
    if (stored) {
      try { setFavorites(JSON.parse(stored)); } catch (err) { console.warn('Failed to parse favorites', err); }
    }
  }, []);
  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      localStorage.setItem('pulso-favorites', JSON.stringify(next));
      return next;
    });
  };
  return { favorites, toggleFavorite };
}

// A separate favorites list for venues, not events - own localStorage key,
// own storage/filtering logic, per explicit user request rather than
// reusing the event favorites list for a different kind of entity.
function useFavoriteVenues() {
  const [favoriteVenues, setFavoriteVenues] = useState<string[]>([]);
  useEffect(() => {
    const stored = localStorage.getItem('pulso-favorite-venues');
    if (stored) {
      try { setFavoriteVenues(JSON.parse(stored)); } catch (err) { console.warn('Failed to parse favorite venues', err); }
    }
  }, []);
  const toggleFavoriteVenue = (id: string) => {
    setFavoriteVenues((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      localStorage.setItem('pulso-favorite-venues', JSON.stringify(next));
      return next;
    });
  };
  return { favoriteVenues, toggleFavoriteVenue };
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
    fetch(`${API_BASE_URL}/me`, { headers: { authorization: `Bearer ${token}` } })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => setUser(meResponseSchema.parse(json).data))
      .catch(() => {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setAuthToken(undefined);
      });
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

  return { user, authToken, login, logout };
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
  const [nearbyEvents, setNearbyEvents] = useState<PublicEvent[]>([]);
  const [nearbyState, setNearbyState] = useState<LoadState>('loading');
  const [selected, setSelected] = useState<PublicEvent>();
  const [state, setState] = useState<LoadState>('loading');
  const [basemapState, setBasemapState] = useState<BasemapState>('loading');
  const [details, setDetails] = useState<DetailsState>({ kind: 'closed' });
  const [pickerList, setPickerList] = useState<
    { title: string; events: PublicEvent[] } | undefined
  >();
  const [venuePickerList, setVenuePickerList] = useState<
    { title: string; groups: VenueGroup[] } | undefined
  >();
  const [filters, setFilters] = useState<DiscoveryFilters>(filtersRef.current);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersOverlayMount = useTransitionedMount(filtersOpen);
  const [filterNotice, setFilterNotice] = useState<string>();
  const [queryInput, setQueryInput] = useState('');
  const [searchResult, setSearchResult] = useState<IntelligentSearchResponse>();
  const [searchProcessing, setSearchProcessing] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [locale, setLocale] = useState(initialLocale);
  const { favorites, toggleFavorite } = useFavorites();
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const { favoriteVenues, toggleFavoriteVenue } = useFavoriteVenues();
  const [showFavoriteVenuesOnly, setShowFavoriteVenuesOnly] = useState(false);
  const { user, login, logout } = useAuth();
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
  // Empty = no restriction. Not sent to the API since every currently wired
  // source (Ticketmaster, Ville de Montréal) is already fetched together;
  // this only narrows what's shown on the map/list, same pattern as
  // showFavoritesOnly below.
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(['filtres', 'categories', 'prix', 'distance', 'ambiance', 'source'])
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
  const [distanceKm, setDistanceKm] = useState(15);
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

  const [section, setSection] = useState<'evenement' | 'lieu' | 'explorer' | 'favoris'>(
    'evenement'
  );
  const [viewMode, setViewMode] = useState<'map' | 'list' | 'calendar'>('map');
  const [lieuTab, setLieuTab] = useState<'map' | 'list' | 'calendar'>('list');
  // Reset to 'event' every time Explorer is (re-)entered rather than
  // persisted - simplest, least surprising default per the restructuring
  // plan.
  const [explorerPinKind, setExplorerPinKind] = useState<'event' | 'venue'>('event');
  const [venueCategoryFilter, setVenueCategoryFilter] = useState<VenueCategory[]>([]);
  const [lieuPriceFilter, setLieuPriceFilter] = useState<VenuePriceTier[]>([]);
  const [noEventVenues, setNoEventVenues] = useState<PublicVenue[]>([]);
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
  const [calendarCategories, setCalendarCategories] = useState<EventCategory[]>([]);
  const [calendarPrice, setCalendarPrice] = useState<DiscoveryFilters['price']>('all');

  const loadCalendarEvents = useCallback(
    async (month: Date, categories: EventCategory[], price: DiscoveryFilters['price']) => {
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
    if (viewMode === 'calendar' || (section === 'lieu' && lieuTab === 'calendar')) {
      void loadCalendarEvents(calendarMonth, calendarCategories, calendarPrice);
    }
  }, [viewMode, section, lieuTab, calendarMonth, calendarCategories, calendarPrice, loadCalendarEvents]);

  useEffect(() => {
    if (section !== 'lieu') return;
    const bounds = currentBounds.current;
    fetch(
      `${API_BASE_URL}/venues?west=${bounds.west}&south=${bounds.south}&east=${bounds.east}&north=${bounds.north}`
    )
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => setNoEventVenues(venueListResponseSchema.parse(json).data))
      .catch(() => setNoEventVenues([]));
  }, [section]);

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
      setState('loading');
      setSearchError(false);

      // Stale-While-Revalidate : Charger le cache instantanément
      try {
        const cached = localStorage.getItem('pulso-offline-events');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.length > 0) {
            setEvents(parsed);
            setState('success');
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
          const foundEvents = result.data.map(({ event }) => event);
          setEvents(foundEvents);
          localStorage.setItem('pulso-offline-events', JSON.stringify(foundEvents));
          setSelected((current) =>
            current && foundEvents.some(({ id }) => id === current.id)
              ? current
              : undefined
          );
          setState(foundEvents.length === 0 ? 'empty' : 'success');
          setSearchProcessing(false);
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
        const response = await fetch(boundsUrl(bounds, activeFilters, near));
        if (!response.ok) throw new Error('Event API unavailable');
        const result = eventListResponseSchema.parse(await response.json());
        setEvents(result.data);
        localStorage.setItem('pulso-offline-events', JSON.stringify(result.data));
        setSelected((current) =>
          current && result.data.some(({ id }) => id === current.id)
            ? current
            : undefined
        );
        setState(result.data.length === 0 ? 'empty' : 'success');
      } catch {
        setState('error');
        if (activeSearch.current) setSearchError(true);
        setSearchProcessing(false);
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
    if (selected) {
      setSelected(undefined);
      setFilterNotice(translate(localeRef.current, 'filters.previewClosed'));
    } else {
      setFilterNotice(undefined);
    }
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
    setFilterNotice(translate(localeRef.current, 'search.previewClosed'));
    void loadEvents(currentBounds.current);
  }

  useEffect(() => {
    if (!container.current) return;
    const instance = new maplibregl.Map({
      container: container.current,
      center: MONTREAL_CENTER,
      zoom: 11,
      style: MAP_STYLE_URL
    });

    instance.on('load', () => {
      setBasemapState('loaded');

      // Pin icons must be registered before any layer references them, or
      // that layer silently renders nothing for that image.
      for (const [category, color] of Object.entries(CATEGORY_COLORS)) {
        instance.addImage(`pin-${category}`, buildPinImageData(color), { pixelRatio: PIN_SCALE });
      }
      instance.addImage('cluster-badge', buildClusterBadgeImageData(), { pixelRatio: PIN_SCALE });

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
          'circle-color': '#7058ff',
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
          'icon-size': ['step', ['get', 'point_count'], 0.56, 10, 0.83, 50, 1.1],
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
          'icon-size': 0.85,
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
        const ids = [...new Set(e.features.map((f) => f.properties?.id as string))];
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
          | maplibregl.GeoJSONSource
          | undefined;
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
      // is a real intent to look at the map - close the details panel on
      // its own rather than making the user hit "Retour" first. Layer-
      // specific handlers above also fire for this same click, so this
      // only acts when the click hit nothing interactive.
      instance.on('click', (e) => {
        if (detailsRef.current.kind === 'closed') return;
        const hits = instance.queryRenderedFeatures(e.point, {
          layers: ['events-circles', 'clusters']
        });
        if (hits.length === 0) {
          setDetails({ kind: 'closed' });
          requestAnimationFrame(() => map.current?.resize());
        }
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
    const source = instance.getSource('events-source') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const evs = pendingDataRef.current;
    const favs = favoritesRef.current;
    const showFavs = showFavoritesOnlyRef.current;
    const sources = selectedSourcesRef.current;
    const sel = selectedRef.current;
    const visibleEvents = evs
      .filter((e) => (showFavs ? favs.includes(e.id) : true))
      .filter((e) => (sources.length === 0 ? true : sources.includes(e.source.name)));
    source.setData({
      type: 'FeatureCollection',
      features: visibleEvents.map(event => ({
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
      instance.setFilter('events-selected', ['==', ['get', 'id'], sel?.id ?? '']);
    }
  }, []);

  // Refs pour éviter les closures périmées dans pushEventsToMap
  const favoritesRef = useRef(favorites);
  const showFavoritesOnlyRef = useRef(showFavoritesOnly);
  const selectedSourcesRef = useRef(selectedSources);
  const selectedRef = useRef(selected);
  const detailsRef = useRef(details);
  useEffect(() => { favoritesRef.current = favorites; }, [favorites]);
  useEffect(() => { showFavoritesOnlyRef.current = showFavoritesOnly; }, [showFavoritesOnly]);
  useEffect(() => { selectedSourcesRef.current = selectedSources; }, [selectedSources]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { detailsRef.current = details; }, [details]);
  useEffect(() => { distanceKmRef.current = distanceKm; }, [distanceKm]);
  useEffect(() => {
    distanceFilterActiveRef.current = distanceFilterActive;
  }, [distanceFilterActive]);

  // Synchronisation des données vers la carte (se déclenche aussi quand on revient à la carte)
  useEffect(() => {
    if (map.current) pushEventsToMap(map.current);
  }, [events, favorites, showFavoritesOnly, selectedSources, selected, pushEventsToMap]);

  // keepPickerList: when an event is opened from a picker list (cluster,
  // venue, or calendar day), leave that list in state instead of discarding
  // it - returnToMap only closes `details`, so the underlying list
  // reappears automatically instead of the whole panel closing. A fresh
  // direct open (map pin, deep link, carousel) has no list to return to, so
  // it keeps the old clear-on-open behavior.
  async function openDetails(eventId: string, options: { keepPickerList?: boolean } = {}) {
    if (!options.keepPickerList) setPickerList(undefined);
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
    showingDetails || pickerList !== undefined || venuePickerList !== undefined;
  const rightPanelMount = useTransitionedMount(rightPanelOpen);
  const lastRightPanelContentRef = useRef<
    | { kind: 'details'; state: DetailsState }
    | { kind: 'picker'; list: { title: string; events: PublicEvent[] } }
    | { kind: 'venue-picker'; list: { title: string; groups: VenueGroup[] } }
    | { kind: 'none' }
  >({ kind: 'none' });
  useEffect(() => {
    if (showingDetails) {
      lastRightPanelContentRef.current = { kind: 'details', state: details };
    } else if (pickerList !== undefined) {
      lastRightPanelContentRef.current = { kind: 'picker', list: pickerList };
    } else if (venuePickerList !== undefined) {
      lastRightPanelContentRef.current = { kind: 'venue-picker', list: venuePickerList };
    }
  }, [showingDetails, details, pickerList, venuePickerList]);
  const shownRightPanelContent = rightPanelOpen
    ? showingDetails
      ? ({ kind: 'details', state: details } as const)
      : pickerList !== undefined
        ? ({ kind: 'picker', list: pickerList } as const)
        : ({ kind: 'venue-picker', list: venuePickerList! } as const)
    : lastRightPanelContentRef.current;
  const sourceFilteredEvents =
    selectedSources.length === 0
      ? events
      : events.filter((event) => selectedSources.includes(event.source.name));
  // noEventVenues (fixed reference points like Clébard, La Rockette - real
  // venues seeded ahead of any event ever being recorded there, see
  // seed-curated-venues.ts) can never share an id with an event-derived
  // group: findVenuesWithoutUpcomingEvents only returns venues with zero
  // event rows, ever.
  const venueGroups: VenueGroup[] = [
    ...groupEventsByVenue(sourceFilteredEvents),
    ...noEventVenues.map(
      (venue): VenueGroup => ({
        id: venue.id,
        name: venue.name,
        address: venue.address,
        point: venue.point,
        events: [],
        categories: [],
        ...(venue.category !== undefined ? { venueCategory: venue.category } : {})
      })
    )
  ];
  // Never guessed: a venue with no known type/price simply isn't matched by
  // an active filter rather than being bucketed into a default - same
  // "omit, don't guess" rule as the untyped-venue card display.
  const filteredVenueGroups = venueGroups
    .filter(
      (group) =>
        venueCategoryFilter.length === 0 ||
        (group.venueCategory !== undefined && venueCategoryFilter.includes(group.venueCategory))
    )
    .filter(
      (group) =>
        lieuPriceFilter.length === 0 ||
        (group.priceTier !== undefined && lieuPriceFilter.includes(group.priceTier))
    )
    .filter((group) => !showFavoriteVenuesOnly || favoriteVenues.includes(group.id));

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
      | maplibregl.GeoJSONSource
      | undefined;
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
      style: MAP_STYLE_URL
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
          'icon-size': 0.85,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        }
      });

      instance.on('click', 'venues-circles', (e) => {
        if (!e.features?.[0]) return;
        const ids = [...new Set(e.features.map((f) => f.properties?.id as string))];
        const matched = ids
          .map((id) => venueGroupsRef.current.find((g) => g.id === id))
          .filter((g): g is VenueGroup => Boolean(g));
        if (matched.length === 0) return;
        setDetails({ kind: 'closed' });
        if (matched.length === 1) {
          const group = matched[0]!;
          setVenuePickerList(undefined);
          setPickerList({ title: `${group.name} — ${group.address}`, events: group.events });
          return;
        }
        setPickerList(undefined);
        setVenuePickerList({ title: `${matched.length} lieux à cet endroit`, groups: matched });
      });
      instance.on('click', 'venue-clusters', (e) => {
        const feature = e.features?.[0];
        const clusterId = feature?.properties?.cluster_id;
        const source = instance.getSource('venues-source') as
          | maplibregl.GeoJSONSource
          | undefined;
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

      pushVenuesToMap(instance);
    });

    lieuMap.current = instance;
    return () => instance.remove();
  }, [pushVenuesToMap]);

  useEffect(() => {
    if (lieuMap.current) pushVenuesToMap(lieuMap.current);
  }, [filteredVenueGroups, pushVenuesToMap]);

  // Explorer: a third, genuinely independent MapLibre instance - no sidebar,
  // just the map and a floating toggle switching which of two always-loaded
  // sources (events, venues) is visible. Both sources/layer sets are set up
  // up front so switching the toggle is a cheap visibility flip, not a
  // teardown/rebuild.
  useEffect(() => {
    explorerPinKindRef.current = explorerPinKind;
    if (!explorerMap.current) return;
    const visible = (kind: 'event' | 'venue') => (explorerPinKind === kind ? 'visible' : 'none');
    for (const layer of ['explorer-events-glow', 'explorer-events-circles']) {
      if (explorerMap.current.getLayer(layer)) {
        explorerMap.current.setLayoutProperty(layer, 'visibility', visible('event'));
      }
    }
    for (const layer of [
      'explorer-venue-clusters-glow',
      'explorer-venue-clusters',
      'explorer-venue-cluster-count',
      'explorer-venues-circles'
    ]) {
      if (explorerMap.current.getLayer(layer)) {
        explorerMap.current.setLayoutProperty(layer, 'visibility', visible('venue'));
      }
    }
  }, [explorerPinKind]);

  useEffect(() => {
    if (section === 'explorer') setExplorerPinKind('event');
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
    }
  }, [section]);

  const explorerPinKindRef = useRef(explorerPinKind);
  const explorerVenueGroupsRef = useRef<VenueGroup[]>([]);
  useEffect(() => {
    explorerVenueGroupsRef.current = venueGroups;
  }, [venueGroups]);

  const pushExplorerDataToMap = useCallback((instance: maplibregl.Map) => {
    const eventSource = instance.getSource('explorer-events-source') as
      | maplibregl.GeoJSONSource
      | undefined;
    if (eventSource) {
      eventSource.setData({
        type: 'FeatureCollection',
        features: eventsRef.current.map((event) => ({
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
    }
    const venueSource = instance.getSource('explorer-venues-source') as
      | maplibregl.GeoJSONSource
      | undefined;
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
      style: MAP_STYLE_URL
    });

    instance.on('load', () => {
      for (const [category, color] of Object.entries(CATEGORY_COLORS)) {
        instance.addImage(`explorer-pin-${category}`, buildPinImageData(color), {
          pixelRatio: PIN_SCALE
        });
      }
      instance.addImage('explorer-cluster-badge', buildClusterBadgeImageData(), {
        pixelRatio: PIN_SCALE
      });
      instance.addImage('explorer-pin-venue', buildPinImageData(VENUE_PIN_COLOR), {
        pixelRatio: PIN_SCALE
      });

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

      const eventVisible = explorerPinKindRef.current === 'event' ? 'visible' : 'none';
      const venueVisible = explorerPinKindRef.current === 'venue' ? 'visible' : 'none';

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
          'icon-size': 0.85,
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
          'icon-size': 0.85,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        }
      });

      instance.on('click', 'explorer-events-circles', (e) => {
        if (!e.features?.[0]) return;
        const ids = [...new Set(e.features.map((f) => f.properties?.id as string))];
        const matched = ids
          .map((id) => eventsRef.current.find((ev) => ev.id === id))
          .filter((ev): ev is PublicEvent => Boolean(ev));
        if (matched.length === 0) return;
        setDetails({ kind: 'closed' });
        setVenuePickerList(undefined);
        if (matched.length === 1) {
          setPickerList(undefined);
          void openDetails(matched[0]!.id);
          return;
        }
        setPickerList({ title: `${matched.length} événements à cet endroit`, events: matched });
      });

      instance.on('click', 'explorer-venues-circles', (e) => {
        if (!e.features?.[0]) return;
        const ids = [...new Set(e.features.map((f) => f.properties?.id as string))];
        const matched = ids
          .map((id) => explorerVenueGroupsRef.current.find((g) => g.id === id))
          .filter((g): g is VenueGroup => Boolean(g));
        if (matched.length === 0) return;
        setDetails({ kind: 'closed' });
        if (matched.length === 1) {
          const group = matched[0]!;
          setVenuePickerList(undefined);
          setPickerList({ title: `${group.name} — ${group.address}`, events: group.events });
          return;
        }
        setPickerList(undefined);
        setVenuePickerList({ title: `${matched.length} lieux à cet endroit`, groups: matched });
      });

      instance.on('click', 'explorer-venue-clusters', (e) => {
        const feature = e.features?.[0];
        const clusterId = feature?.properties?.cluster_id;
        const source = instance.getSource('explorer-venues-source') as
          | maplibregl.GeoJSONSource
          | undefined;
        if (clusterId === undefined || !source || !feature) return;
        const coordinates = (
          feature.geometry as { type: 'Point'; coordinates: [number, number] }
        ).coordinates;
        source.getClusterLeaves(clusterId, Infinity, 0).then((leaves) => {
          const ids = leaves.map((leaf) => leaf.properties?.id as string);
          const matched = ids
            .map((id) => explorerVenueGroupsRef.current.find((g) => g.id === id))
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

      for (const layer of ['explorer-events-circles', 'explorer-venues-circles', 'explorer-venue-clusters']) {
        instance.on('mouseenter', layer, () => {
          instance.getCanvas().style.cursor = 'pointer';
        });
        instance.on('mouseleave', layer, () => {
          instance.getCanvas().style.cursor = '';
        });
      }

      pushExplorerDataToMap(instance);
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
    explorerMap.current = instance;
    return () => {
      instance.off('moveend', onMoveEnd);
      instance.remove();
    };
  }, [pushExplorerDataToMap, loadEvents]);

  useEffect(() => {
    if (explorerMap.current) pushExplorerDataToMap(explorerMap.current);
  }, [events, venueGroups, pushExplorerDataToMap]);

  // Prefer real-distance nearby results; fall back to the bounds-based list
  // when geolocation was denied/unsupported or hasn't resolved yet.
  const carouselEvents = userLocation && nearbyState === 'success' ? nearbyEvents : events;
  const carouselEmpty =
    userLocation && (nearbyState === 'success' || nearbyState === 'empty')
      ? nearbyEvents.length === 0
      : events.length === 0;

  return (
    <div className="app-container">
      <header className="top-navbar">
        <div className="nav-left">
          <button type="button" className="nav-logo" onClick={goHome} aria-label={translate(locale, 'app.title')}>
            <img
              src="/brand/pulso-logo-horizontal-dark.svg"
              alt={translate(locale, 'app.title')}
            />
          </button>
          <div className="nav-actions-links">
             <button
               type="button"
               className={!aboutOpen && section === 'evenement' ? 'active' : ''}
               onClick={() => {
                 setAboutOpen(false);
                 setSection('evenement');
               }}
             >
               Événement
             </button>
             <button
               type="button"
               className={!aboutOpen && section === 'lieu' ? 'active' : ''}
               onClick={() => {
                 setAboutOpen(false);
                 setSection('lieu');
               }}
             >
               Lieu
             </button>
             <button
               type="button"
               className={!aboutOpen && section === 'explorer' ? 'active' : ''}
               onClick={() => {
                 setAboutOpen(false);
                 setSection('explorer');
               }}
             >
               Explorer
             </button>
             <button
               type="button"
               className={!aboutOpen && section === 'favoris' ? 'active' : ''}
               onClick={() => {
                 setAboutOpen(false);
                 setSection('favoris');
               }}
             >
               Favoris
             </button>
             <button
               type="button"
               data-about-toggle
               className={aboutOpen ? 'active' : ''}
               onClick={() => setAboutOpen((prev) => !prev)}
             >
               À propos
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
          <CitySelector />
          <LanguageSelector locale={locale} onChange={selectLocale} />
          <AccountMenu user={user} onLogin={login} onLogout={logout} />
        </div>
      </header>

      <div className="dashboard-main">
        {(section === 'evenement' || section === 'lieu') && (
        /* Left Sidebar */
        <aside className="sidebar-left">
          <h2 className="sidebar-section-title">
            {section === 'evenement' ? 'Événement' : 'Lieu'}
          </h2>

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
                aria-label={showFavoritesOnly ? 'Afficher tous les événements' : 'Afficher uniquement mes favoris'}
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
                aria-label={showFavoriteVenuesOnly ? 'Afficher tous les lieux' : 'Afficher uniquement mes lieux favoris'}
                aria-pressed={showFavoriteVenuesOnly}
                onClick={() => setShowFavoriteVenuesOnly((prev) => !prev)}
              >
                <HeartIcon filled={showFavoriteVenuesOnly} />
              </button>
            )}
          </div>

          {section === 'evenement' && (
          <>
          <CollapsibleFilterGroup
            title="Filtres"
            collapsed={collapsedSections.has('filtres')}
            onToggle={() => toggleSection('filtres')}
            action={
              <button className="filter-reset" onClick={clearAll}>
                Réinitialiser
              </button>
            }
          >
            <div className="pill-list pill-list-long">
              {(['today', 'weekend', 'next7'] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  className={`filter-pill ${filters.date === value ? 'active' : ''}`}
                  onClick={() => applyFilters(withoutCustomDates(filters, value))}
                >
                  {getDateFilterLabel(locale, value)}
                </button>
              ))}
            </div>
          </CollapsibleFilterGroup>

          <CollapsibleFilterGroup
            title="Catégories"
            collapsed={collapsedSections.has('categories')}
            onToggle={() => toggleSection('categories')}
          >
            <p className="category-legend-hint">
              La couleur de chaque catégorie correspond à celle des pins sur la carte.
            </p>
            <div className="category-grid">
              {CATEGORY_FILTER_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={`category-item ${filters.categories.includes(option.value) ? 'active' : ''}`}
                  onClick={() => {
                    const nextCategories = filters.categories.includes(option.value)
                      ? filters.categories.filter((c) => c !== option.value)
                      : [...filters.categories, option.value];
                    applyFilters({ ...filters, categories: nextCategories });
                  }}
                >
                  <div
                    className="category-icon"
                    style={
                      filters.categories.includes(option.value)
                        ? {
                            background: CATEGORY_COLORS[option.value],
                            borderColor: CATEGORY_COLORS[option.value],
                            color: '#fff'
                          }
                        : {
                            borderColor: CATEGORY_COLORS[option.value],
                            color: CATEGORY_COLORS[option.value]
                          }
                    }
                  >
                    <CategoryIcon category={option.value} />
                  </div>
                  <span>{SHORT_CATEGORY_LABELS[locale][option.value]}</span>
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
                  onClick={() => applyFilters({ ...filters, price: option.value })}
                >
                  {getPriceLabel(locale, option.value)}
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
                max="15"
                value={distanceKm}
                onChange={(event) => setDistanceKm(Number(event.target.value))}
                onMouseUp={applyDistanceFilter}
                onTouchEnd={applyDistanceFilter}
                onKeyUp={applyDistanceFilter}
                className="distance-slider"
              />
              <div className="distance-labels">
                <span>1km</span>
                <span>5km</span>
                <span>10km</span>
                <span>15km</span>
              </div>
              <p className="distance-value">
                {distanceFilterActive
                  ? `Rayon actif : ${distanceKm} km`
                  : `Rayon max (${distanceKm} km) — non appliqué`}
                {geoStatus === 'pending' && ' · localisation…'}
                {geoStatus === 'denied' && ' · position non partagée'}
                {geoStatus === 'unsupported' && ' · non disponible sur cet appareil'}
              </p>
            </div>
          </CollapsibleFilterGroup>

          <CollapsibleFilterGroup
            title="Ambiance"
            collapsed={collapsedSections.has('ambiance')}
            onToggle={() => toggleSection('ambiance')}
          >
            <p className="category-legend-hint">
              Bientôt : une IA déterminera l'ambiance de chaque événement.
            </p>
            <div className="pill-list">
              <button className="filter-pill" disabled>🔥 Énergique</button>
              <button className="filter-pill" disabled>☕ Chill</button>
              <button className="filter-pill" disabled>🥂 Romantique</button>
              <button className="filter-pill" disabled>🎉 Festif</button>
            </div>
          </CollapsibleFilterGroup>

          <CollapsibleFilterGroup
            title="Source"
            collapsed={collapsedSections.has('source')}
            onToggle={() => toggleSection('source')}
          >
            <div className="source-filter-grid">
              {KNOWN_EVENT_SOURCES.map((source) => (
                <button
                  type="button"
                  key={source.matchName}
                  className={`source-filter-item ${selectedSources.includes(source.matchName) ? 'active' : ''} ${!source.available ? 'disabled' : ''}`}
                  disabled={!source.available}
                  onClick={() =>
                    setSelectedSources((prev) =>
                      prev.includes(source.matchName)
                        ? prev.filter((name) => name !== source.matchName)
                        : [...prev, source.matchName]
                    )
                  }
                >
                  <span className="source-filter-logo">
                    <SourceIcon kind={source.icon} />
                  </span>
                  <span>{source.label}</span>
                  {!source.available && <span className="source-soon">Bientôt</span>}
                </button>
              ))}
            </div>
          </CollapsibleFilterGroup>
          </>
          )}

          {section === 'lieu' && (
          <>
          <CollapsibleFilterGroup
            title="Catégorie de lieu"
            collapsed={collapsedSections.has('lieu-categorie')}
            onToggle={() => toggleSection('lieu-categorie')}
          >
            <div className="pill-list venue-category-pills">
              {VENUE_CATEGORY_FILTER_OPTIONS.map((option) => {
                const active = venueCategoryFilter.includes(option.value);
                return (
                  <button
                    type="button"
                    key={option.value}
                    className={`filter-pill ${active ? 'active' : ''}`}
                    style={
                      active
                        ? {
                            background: VENUE_CATEGORY_COLORS[option.value],
                            borderColor: VENUE_CATEGORY_COLORS[option.value],
                            color: '#fff'
                          }
                        : {
                            borderColor: VENUE_CATEGORY_COLORS[option.value],
                            color: VENUE_CATEGORY_COLORS[option.value]
                          }
                    }
                    onClick={() =>
                      setVenueCategoryFilter((prev) =>
                        prev.includes(option.value)
                          ? prev.filter((value) => value !== option.value)
                          : [...prev, option.value]
                      )
                    }
                  >
                    {VENUE_CATEGORY_LABELS[locale][option.value]}
                  </button>
                );
              })}
            </div>
          </CollapsibleFilterGroup>

          <CollapsibleFilterGroup
            title="Prix"
            collapsed={collapsedSections.has('lieu-prix')}
            onToggle={() => toggleSection('lieu-prix')}
          >
            <div className="pill-list">
              {(['$', '$$', '$$$'] as const).map((tier) => (
                <button
                  type="button"
                  key={tier}
                  className={`filter-pill ${lieuPriceFilter.includes(tier) ? 'active' : ''}`}
                  onClick={() =>
                    setLieuPriceFilter((prev) =>
                      prev.includes(tier) ? prev.filter((value) => value !== tier) : [...prev, tier]
                    )
                  }
                >
                  {tier}
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
                max="15"
                value={distanceKm}
                onChange={(event) => setDistanceKm(Number(event.target.value))}
                onMouseUp={applyDistanceFilter}
                onTouchEnd={applyDistanceFilter}
                onKeyUp={applyDistanceFilter}
                className="distance-slider"
              />
              <div className="distance-labels">
                <span>1km</span>
                <span>5km</span>
                <span>10km</span>
                <span>15km</span>
              </div>
              <p className="distance-value">
                {distanceFilterActive
                  ? `Rayon actif : ${distanceKm} km`
                  : `Rayon max (${distanceKm} km) — non appliqué`}
                {geoStatus === 'pending' && ' · localisation…'}
                {geoStatus === 'denied' && ' · position non partagée'}
                {geoStatus === 'unsupported' && ' · non disponible sur cet appareil'}
              </p>
            </div>
          </CollapsibleFilterGroup>

          <CollapsibleFilterGroup
            title="Ambiance"
            collapsed={collapsedSections.has('ambiance')}
            onToggle={() => toggleSection('ambiance')}
          >
            <p className="category-legend-hint">
              Bientôt : une IA déterminera l'ambiance de chaque lieu.
            </p>
            <div className="pill-list">
              <button className="filter-pill" disabled>🔥 Énergique</button>
              <button className="filter-pill" disabled>☕ Chill</button>
              <button className="filter-pill" disabled>🥂 Romantique</button>
              <button className="filter-pill" disabled>🎉 Festif</button>
            </div>
          </CollapsibleFilterGroup>
          </>
          )}

          <div className="promo-card">
             <div className="promo-content">
               <h4>Téléchargez Pulso</h4>
               <p>Emportez la ville dans votre poche.</p>
             </div>
          </div>
        </aside>
        )}

        {/* Événement map + content - always mounted (never conditionally
            unmounted by section) so the MapLibre instance attached to
            `container` is never torn down and recreated; only its CSS
            display toggles. A map created while its container isn't in the
            DOM never recovers its size once it reappears. */}
        <section
          className="map-container-wrapper"
          aria-label={translate(locale, 'map.label')}
          style={{ display: section === 'evenement' ? undefined : 'none' }}
        >
          <div
            className="map-shell"
            data-map-context="preserved"
            style={{ display: viewMode === 'map' ? undefined : 'none' }}
          >
             <div ref={container} className="map" />
             <button className="map-floating-search" onClick={() => loadEvents(currentBounds.current, filters)}>
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: 8}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
               Rechercher dans cette zone
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
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
               </button>
               <button
                 type="button"
                 className="map-zoom-btn"
                 aria-label={translate(locale, 'map.zoomOut')}
                 onClick={() => map.current?.zoomOut()}
               >
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
               </button>
               <button
                 type="button"
                 className="map-zoom-btn map-recenter-btn"
                 aria-label={translate(locale, 'map.recenter')}
                 disabled={!userLocation}
                 onClick={() => {
                   if (!userLocation) return;
                   map.current?.flyTo({ center: [userLocation.longitude, userLocation.latitude], zoom: 14 });
                 }}
               >
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
               </button>
             </div>

             {basemapState !== 'loaded' && (
              <p className="map-basemap-status" role="status">
                {basemapState === 'loading' ? 'Loading map...' : 'Map unavailable'}
              </p>
             )}
          </div>

          {viewMode === 'list' && (
            <ListView
              events={listOverride?.events ?? sourceFilteredEvents}
              favorites={favorites}
              showFavoritesOnly={showFavoritesOnly}
              onToggleFavorite={toggleFavorite}
              onOpenDetails={openDetails}
              title={listOverride?.title}
              onClearTitle={listOverride ? () => setListOverride(undefined) : undefined}
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
                  const dayLabel = new Date(`${day}T00:00:00`).toLocaleDateString(
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
                    title: festiveLabel ? `${dayLabel} — ${festiveLabel}` : dayLabel,
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
            <div className="map-shell" style={{ display: lieuTab === 'map' ? undefined : 'none' }}>
              <div ref={lieuMapContainer} className="map" />
            </div>
            {lieuTab === 'list' && (
              <VenueListView
                groups={filteredVenueGroups}
                onSelectVenue={(group) => {
                  // A newly-picked list must win over an already-open
                  // details panel (same rule as map cluster/pin clicks) -
                  // without this, clicking another venue while one's
                  // events are open silently swapped the list behind the
                  // visible details panel.
                  setDetails({ kind: 'closed' });
                  setVenuePickerList(undefined);
                  setPickerList({
                    title: `${group.name} — ${group.address}`,
                    events: group.events
                  });
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
                    const dayLabel = new Date(`${day}T00:00:00`).toLocaleDateString(
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

        {/* Explorer map - same always-mounted rationale. */}
        <section
          className="map-container-wrapper"
          style={{ display: section === 'explorer' ? undefined : 'none' }}
        >
          <div className="map-shell">
            <div ref={explorerMapContainer} className="map" />
            <div className="map-floating-pin-toggle">
              <button
                type="button"
                className={explorerPinKind === 'event' ? 'active' : ''}
                onClick={() => setExplorerPinKind('event')}
              >
                Événements
              </button>
              <button
                type="button"
                className={explorerPinKind === 'venue' ? 'active' : ''}
                onClick={() => setExplorerPinKind('venue')}
              >
                Lieux
              </button>
            </div>
          </div>
        </section>

        {section === 'favoris' && (
          <FavorisSection
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            onOpenDetails={openDetails}
            favoriteVenueGroups={venueGroups.filter((group) => favoriteVenues.includes(group.id))}
            favoriteVenues={favoriteVenues}
            onToggleFavoriteVenue={toggleFavoriteVenue}
            onSelectVenue={(group) => {
              setDetails({ kind: 'closed' });
              setVenuePickerList(undefined);
              setPickerList({ title: `${group.name} — ${group.address}`, events: group.events });
              setSection('lieu');
            }}
            locale={locale}
          />
        )}

        {/* Right Sidebar (Details / cluster picker) - one shared slot, see
            rightPanelMount above for why these aren't two independent panels. */}
        {rightPanelMount.mounted && (
           <div className={`sidebar-right panel-transition ${rightPanelMount.visible ? 'panel-visible' : ''}`}>
             {shownRightPanelContent.kind === 'details' && shownRightPanelContent.state.kind === 'success' && (() => {
               const shownEvent = shownRightPanelContent.state.event;
               return (
                 <EventDetails
                   event={shownEvent}
                   headingRef={detailsHeading}
                   onBack={returnToMap}
                   isFavorite={favorites.includes(shownEvent.id)}
                   onToggleFavorite={() => toggleFavorite(shownEvent.id)}
                   locale={locale}
                 />
               );
             })()}
             {shownRightPanelContent.kind === 'details' && shownRightPanelContent.state.kind === 'loading' && (
               <div style={{padding: '2rem'}}>Chargement...</div>
             )}
             {shownRightPanelContent.kind === 'details' && shownRightPanelContent.state.kind === 'error' && (() => {
               const failedEventId = shownRightPanelContent.state.eventId;
               return (
                 <div style={{padding: '2rem'}}>
                   Erreur de chargement.
                   <button className="btn-secondary" onClick={() => void openDetails(failedEventId, { keepPickerList: true })} style={{marginTop: '1rem'}}>Réessayer</button>
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
                 onSelect={(id) => void openDetails(id, { keepPickerList: true })}
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
                   setPickerList({
                     title: `${group.name} — ${group.address}`,
                     events: group.events
                   });
                 }}
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
        />
      )}

      {aboutPanelMount.mounted && (
        <AboutPanel onClose={() => setAboutOpen(false)} visible={aboutPanelMount.visible} />
      )}

      {/* Selected marker preview fallback logic */}
      {selected && details.kind === 'closed' && (
        <div className="event-preview-wrapper">
          <EventPreview
            event={selected}
            searchMatch={searchResult?.data.find(({ event }) => event.id === selected.id)}
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
             Voir tous les événements <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign: 'middle', marginLeft: 4}}><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
           </button>
         </div>
         
         <div className="event-carousel">
           {carouselEvents.slice(0, 15).map(evt => (
              <div className="event-card" key={evt.id} onClick={() => openDetails(evt.id)} style={{cursor: 'pointer'}}>
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
                     style={{ background: CATEGORY_COLORS[evt.category] ?? CATEGORY_COLORS['other'] }}
                   >
                     {getCategoryLabel(locale, evt.category)}
                   </div>
                   <button className="card-fav" onClick={(e) => { e.stopPropagation(); toggleFavorite(evt.id); }}>
                     {favorites.includes(evt.id) ? '❤️' : '🤍'}
                   </button>
                </div>
                <div className="event-card-content">
                   <h3>{evt.title}</h3>
                   <p>{evt.venue?.name}</p>
                   <p className="card-price">{evt.startsAt ? new Date(evt.startsAt).toLocaleDateString() : ''}</p>
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
                <p>Explorez votre ville et découvrez des événements autour de vous en temps réel.</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">🔍</div>
              <div className="feature-text">
                <h4>Recherche puissante</h4>
                <p>Trouvez exactement ce que vous cherchez grâce à la recherche et à nos suggestions.</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">❤️</div>
              <div className="feature-text">
                <h4>Vos favoris</h4>
                <p>Sauvegardez vos événements préférés et ne manquez jamais une sortie.</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">👥</div>
              <div className="feature-text">
                <h4>Communauté</h4>
                <p>Rejoignez des milliers de passionnés et partagez vos meilleures découvertes.</p>
              </div>
            </div>
         </div>
      </div>
    </div>
  );
}

// getCategoryLabel returns MVP-0001's precise scope-boundary text (e.g.
// "Nightlife / DJ / club / qualifying bar events"), which is exactly right
// for the filter overlay's checkboxes but too long to fit the sidebar grid
// on one line. Short display-only labels for that grid; the overlay still
// uses the full scope text.
const SHORT_CATEGORY_LABELS: Record<SupportedLocale, Record<EventCategory, string>> = {
  fr: {
    music: 'Musique',
    nightlife: 'Vie nocturne',
    festival: 'Festivals',
    show: 'Spectacles',
    comedy: 'Humour',
    other: 'Autres'
  },
  en: {
    music: 'Music',
    nightlife: 'Nightlife',
    festival: 'Festivals',
    show: 'Shows',
    comedy: 'Comedy',
    other: 'Other'
  }
};

const VENUE_CATEGORY_LABELS: Record<SupportedLocale, Record<VenueCategory, string>> = {
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

function CategoryIcon({ category, size = 20 }: { category: EventCategory; size?: number }) {
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

function ViewModeIcon({ kind }: { kind: 'map' | 'list' | 'venues' | 'calendar' }) {
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

/**
 * Known event sources for the sidebar "Source" filter. `matchName` must be
 * the exact `PublicEvent.source.name` string produced by the corresponding
 * ingestion connector - Instagram (Pulso Scout, DEC-0006) has no live
 * connector yet, so it's shown disabled rather than implying a working
 * filter for data that doesn't exist.
 */
const KNOWN_EVENT_SOURCES: Array<{
  matchName: string;
  label: string;
  icon: 'ticket' | 'city' | 'instagram';
  available: boolean;
}> = [
  { matchName: 'Ticketmaster', label: 'Ticketmaster', icon: 'ticket', available: true },
  {
    matchName: 'Ville de Montréal — Événements publics',
    label: 'Ville de Montréal',
    icon: 'city',
    available: true
  },
  { matchName: 'Instagram', label: 'Instagram', icon: 'instagram', available: false }
];

function resolveSourceIconKind(
  sourceName: string
): 'ticket' | 'city' | 'instagram' | 'generic' {
  return (
    KNOWN_EVENT_SOURCES.find((source) => source.matchName === sourceName)?.icon ??
    'generic'
  );
}

function SourceIcon({ kind }: { kind: 'ticket' | 'city' | 'instagram' | 'generic' }) {
  const paths: Record<typeof kind, ReactNode> = {
    ticket: (
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z" />
    ),
    city: (
      <>
        <path d="M4 21V9l6-4 6 4v12" />
        <path d="M16 21v-8l4 2v6" />
        <line x1="9" y1="13" x2="9" y2="13.01" />
        <line x1="9" y1="17" x2="9" y2="17.01" />
      </>
    ),
    instagram: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <line x1="17.5" y1="6.5" x2="17.5" y2="6.5" />
      </>
    ),
    generic: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" />
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
        <button type="button" className="close-button" onClick={onClose} aria-label="Fermer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div className="picker-list-rows">
        {events.length === 0 && (
          <p className="list-view-empty">Aucun événement prévu pour le moment.</p>
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
                style={{ background: CATEGORY_COLORS[event.category] ?? CATEGORY_COLORS['other'] }}
              />
              <span className="list-view-main">
                <strong>{fields.title}</strong>
                <span className="list-view-sub">{fields.venue} · {fields.dateTime}</span>
              </span>
              <span className="list-view-price">{fields.price}</span>
              {favorites.includes(event.id) && <span aria-hidden="true">❤️</span>}
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
        <button type="button" className="close-button" onClick={onClose} aria-label="Fermer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
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
              style={{ background: CATEGORY_COLORS[group.categories[0] ?? 'other'] }}
            />
            <span className="list-view-main">
              <strong>{group.name}</strong>
              <span className="list-view-sub">
                {group.address}
                {group.venueCategory && ` · ${VENUE_CATEGORY_LABELS[locale][group.venueCategory]}`}
              </span>
            </span>
            <span className="list-view-price">
              {group.events.length} événement{group.events.length > 1 ? 's' : ''}
            </span>
            {favoriteVenues.includes(group.id) && <span aria-hidden="true">❤️</span>}
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
  locale
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
}) {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [kind, setKind] = useState<'event' | 'venue'>('event');

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

  return (
    <section className="map-container-wrapper favoris-section">
      <div className="favoris-kind-toggle">
        <button type="button" className={kind === 'event' ? 'active' : ''} onClick={() => setKind('event')}>
          Événements
        </button>
        <button type="button" className={kind === 'venue' ? 'active' : ''} onClick={() => setKind('venue')}>
          Lieux
        </button>
      </div>
      {kind === 'event' && (
        <div className="favoris-block">
          {state === 'loading' && <p className="list-view-empty">Chargement de vos favoris…</p>}
          {state === 'error' && (
            <p className="list-view-empty">Impossible de charger vos favoris pour le moment.</p>
          )}
          {(state === 'success' || state === 'empty') && (
            <ListView
              events={events}
              favorites={favorites}
              showFavoritesOnly={false}
              onToggleFavorite={onToggleFavorite}
              onOpenDetails={onOpenDetails}
              locale={locale}
            />
          )}
        </div>
      )}
      {kind === 'venue' && (
        <div className="favoris-block">
          <VenueListView
            groups={favoriteVenueGroups}
            onSelectVenue={onSelectVenue}
            favoriteVenues={favoriteVenues}
            onToggleFavoriteVenue={onToggleFavoriteVenue}
            locale={locale}
          />
        </div>
      )}
    </section>
  );
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
              style={{ background: CATEGORY_COLORS[event.category] ?? CATEGORY_COLORS['other'] }}
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
  priceTier?: VenuePriceTier;
  imageUrl?: string;
}

// Groups the currently-loaded events (same source-filtered set the List view
// uses) by venue.id rather than fetching a separate venues endpoint - venue
// grouping is a client-side view over data already on screen, not new data.
// Two kinds of rows are excluded as not being a real, referenceable place to
// browse: "Unknown venue" is the mapper's placeholder (to-public-event.ts)
// for events with no name/address at all, and name === address is the
// signature of a reverse-geocode fallback that had no real venue name to
// find (a park, a street corner) - see geocode-fallback.ts's shortLabel.
function groupEventsByVenue(events: PublicEvent[]): VenueGroup[] {
  const byId = new Map<string, VenueGroup>();
  for (const event of events) {
    if (event.venue.name === 'Unknown venue' || event.venue.name === event.venue.address) {
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
        ...(event.venue.category !== undefined ? { venueCategory: event.venue.category } : {})
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
        <p className="list-view-empty">Aucun lieu à afficher dans cette zone.</p>
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
            style={{ cursor: 'pointer' }}
          >
            <div
              className="venue-card-thumb"
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
              <button
                type="button"
                className="card-fav"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavoriteVenue(group.id);
                }}
              >
                {favoriteVenues.includes(group.id) ? '❤️' : '🤍'}
              </button>
            </div>
            <div className="venue-card-body">
              <div className="venue-card-title-row">
                <strong className="venue-card-name">{group.name}</strong>
                {group.priceTier && (
                  <span className="venue-card-price">{group.priceTier}</span>
                )}
              </div>
              <span className="venue-card-address">{group.address}</span>
              <div className="venue-card-categories">
                {group.venueCategory && (
                  <span
                    className="venue-card-type-badge"
                    style={{
                      background: VENUE_CATEGORY_COLORS[group.venueCategory],
                      borderColor: VENUE_CATEGORY_COLORS[group.venueCategory],
                      color: '#fff'
                    }}
                  >
                    {VENUE_CATEGORY_LABELS[locale][group.venueCategory]}
                  </span>
                )}
                {group.categories.slice(0, 3).map((category) => (
                  <span
                    key={category}
                    className="venue-card-category-dot"
                    style={{ background: CATEGORY_COLORS[category] ?? CATEGORY_COLORS['other'] }}
                    title={SHORT_CATEGORY_LABELS[locale][category]}
                  />
                ))}
                {group.categories.length > 3 && (
                  <span className="venue-card-more">+{group.categories.length - 3}</span>
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
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
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

  const monthLabel = month.toLocaleDateString(locale === 'fr' ? 'fr-CA' : 'en-CA', {
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="calendar-view">
      <div className="calendar-header">
        <button
          type="button"
          onClick={() => onChangeMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          aria-label="Mois précédent"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h3>{monthLabel}</h3>
        <button
          type="button"
          onClick={() => onChangeMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          aria-label="Mois suivant"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
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
          if (!cell) return <div className="calendar-cell empty" key={`blank-${index}`} />;
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
              {festiveLabel && <span className="calendar-festive-dot" aria-hidden="true" />}
              {dayCount > 0 && <span className="calendar-day-count">{dayCount}</span>}
            </button>
          );
        })}
      </div>

      {state === 'loading' && <p className="calendar-status">Chargement…</p>}
      {state === 'error' && <p className="calendar-status">Erreur de chargement.</p>}
    </div>
  );
}

function CollapsibleFilterGroup({
  title,
  collapsed,
  onToggle,
  action,
  children
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  action?: ReactNode;
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
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{
              transform: collapsed ? 'rotate(-90deg)' : 'none',
              transition: 'transform 0.15s'
            }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          <span>{title}</span>
        </button>
        {!collapsed && action}
      </div>
      {!collapsed && children}
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
    <div className="lang-selector" aria-label={translate(locale, 'language.label')}>
      <button
        type="button"
        className="lang-selector-current"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span className="lang-flag"><LocaleFlagIcon locale={locale} /></span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
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
            <span className="lang-flag"><LocaleFlagIcon locale={other} /></span>
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
const OTHER_CANADIAN_CITIES = ['Toronto', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa'];

function CitySelector() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
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
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

function AccountMenu({
  user,
  onLogin,
  onLogout
}: {
  user: User | undefined;
  onLogin: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  if (!user) {
    // Le compte reste facultatif (DEC-0007/MVP-0001) - ce bouton est la
    // seule chose qui change tant qu'on n'est pas connecté.
    return (
      <button type="button" className="account-login-btn" onClick={onLogin}>
        Se connecter
      </button>
    );
  }

  return (
    <div className="account-menu" ref={wrapperRef}>
      <button
        type="button"
        className="account-menu-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={user.displayName}
      >
        <span className="account-avatar">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" />
          ) : (
            user.displayName.slice(0, 1).toUpperCase()
          )}
          <span className="account-online-dot" aria-hidden="true" />
        </span>
      </button>
      {open && (
        <div className="account-menu-dropdown">
          <p className="account-menu-name">{user.displayName}</p>
          <button
            type="button"
            className="account-menu-logout"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            Se déconnecter
          </button>
        </div>
      )}
    </div>
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
  return (
    <aside
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
          <span className="search-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

      {(processing || error || result) && (
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
                      message: localizeSearchMessage(locale, result.clarification)
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
        >
          {getDateFilterLabel(locale, filters.date)}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
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
        >
          {getPriceLabel(locale, filters.price)}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
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
        >
          {categoryLabel}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
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

      <button type="button" className="map-filter-chip map-filter-more" onClick={onOpenMore}>
        Plus de filtres
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>
    </div>
  );
}

function AboutPanel({ onClose, visible }: { onClose: () => void; visible: boolean }) {
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
        <button type="button" onClick={onClose}>Fermer</button>
      </div>
      <div className="about-content">
        <p>
          Pulso est un répertoire d'événements festifs, musicaux et de soirée
          géolocalisés à Montréal : concerts, clubs, bars, spectacles, comedy
          clubs et catégories similaires. Vous pouvez explorer la carte sans
          compte ni intention précise, ou chercher exactement ce que vous
          voulez en langage naturel.
        </p>
        <p>
          L'objectif est de regrouper le plus grand nombre possible
          d'événements montréalais correctement référencés, avec un accès en
          une action vers la billetterie ou la source d'origine — sans
          réservation ni billet géré par Pulso lui-même.
        </p>
        <h3>Vous organisez un événement ?</h3>
        <p>
          Si vous voulez que votre événement soit listé sur Pulso, ou que vous
          représentez une salle, un organisateur ou une billetterie
          intéressé·e à collaborer, écrivez-nous :
        </p>
        <a className="primary-action-btn glow-purple" href="mailto:rmeynaud@pulsonight.com">
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
  visible
}: {
  filters: DiscoveryFilters;
  onChange: (filters: DiscoveryFilters) => void;
  onClose: () => void;
  onClearAll: () => void;
  locale: SupportedLocale;
  visible: boolean;
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
      <div className="preview-header-actions">
        <div className="card-badge" style={{position: 'relative', top: 0, left: 0}}>{fields.category}</div>
        <div style={{display: 'flex', gap: '0.5rem'}}>
          <button
            type="button"
            className="card-fav"
            style={{position: 'relative', top: 0, right: 0}}
            aria-pressed={isFavorite}
            aria-label={translate(
              locale,
              isFavorite ? 'favorites.remove' : 'favorites.add'
            )}
            onClick={onToggleFavorite}
          >
            <HeartIcon filled={isFavorite} />
          </button>
          <button type="button" className="close-button" onClick={onClose} style={{background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 28, height: 28, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <h3 style={{margin: '0.5rem 0 0 0', fontSize: '1.25rem'}}>{fields.title}</h3>
      <dl className="preview-fields">
        <div>
          <dt>{translate(locale, 'preview.when')}</dt>
          <dd>{fields.dateTime}</dd>
        </div>
        <div>
          <dt>{translate(locale, 'preview.venue')}</dt>
          <dd>{fields.venue}</dd>
        </div>
        <div>
          <dt>{translate(locale, 'preview.price')}</dt>
          <dd>{fields.price}</dd>
        </div>
      </dl>
      {fields.warning && <p className="warning">{fields.warning}</p>}
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
        className="primary-action"
        onClick={onDetails}
      >
        {translate(locale, 'preview.details')}
      </button>
    </div>
  );
}

function EventDetails({
  event,
  headingRef,
  onBack,
  isFavorite,
  onToggleFavorite,
  locale
}: {
  event: PublicEvent;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  locale: SupportedLocale;
}) {
  const { presentation } = eventDetailsFields(event, locale);
  const externalHref = `${API_BASE_URL}/events/${event.id}/external`;
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const DESCRIPTION_PREVIEW_LENGTH = 180;
  const description = presentation.description ?? '';
  const descriptionIsLong = description.length > DESCRIPTION_PREVIEW_LENGTH;
  const visibleDescription =
    descriptionIsLong && !descriptionExpanded
      ? `${description.slice(0, DESCRIPTION_PREVIEW_LENGTH).trimEnd()}…`
      : description;

  const onShare = async () => {
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
  };

  return (
    <div
      className="event-details-content"
      aria-label={translate(locale, 'details.label')}
    >
      <div className="details-header-actions">
        <button type="button" className="back-button" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          Retour
        </button>
        <div>
          <button
            type="button"
            className="share-button"
            onClick={onShare}
            style={{ marginRight: '12px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3"/>
              <circle cx="6" cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            {translate(locale, 'details.share')}
          </button>
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
        <div className="details-badge">{presentation.category}</div>
        <h2 ref={headingRef} tabIndex={-1} className="details-title">
          {event.title}
        </h2>
        {presentation.organizer && (
          <p className="details-subtitle">{presentation.organizer}</p>
        )}
      </div>

      <div className="details-info-list">
        <div className="info-item">
          <span className="info-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </span>
          <div>
            <strong>Date et heure</strong>
            <p>{presentation.dateTime}</p>
          </div>
        </div>
        <div className="info-item">
          <span className="info-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </span>
          <div>
            <strong>Lieu</strong>
            <p>{event.venue.name}</p>
            <p className="info-sub">{event.venue.address}</p>
          </div>
        </div>
        <div className="info-item">
          <span className="info-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
          </span>
          <div>
            <strong>Prix</strong>
            <p>{presentation.price}</p>
          </div>
        </div>
      </div>

      <div className="details-actions-main">
        {presentation.externalAction ? (
          <a className="primary-action-btn glow-purple" href={externalHref} target="_blank" rel="noopener noreferrer">
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
        <h3>À propos</h3>
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

      <div className="details-section">
        <h3>Sources</h3>
        <div className="source-item">
          <span className="source-logo">
            <SourceIcon kind={resolveSourceIconKind(event.source.name)} />
          </span>
          <span>{event.source.name}</span>
          <span className="source-trust">{presentation.trust}</span>
        </div>
        {event.additionalSources?.map((source) => (
          <div className="source-item" key={source.url}>
            <span className="source-logo">
              <SourceIcon kind={resolveSourceIconKind(source.name)} />
            </span>
            <span>{source.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
