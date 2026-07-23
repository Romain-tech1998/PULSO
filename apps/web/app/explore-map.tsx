'use client';

import {
  buildMapEventsQuery,
  CATEGORY_FILTER_OPTIONS,
  DATE_FILTER_OPTIONS,
  eventDetailsResponseSchema,
  eventListResponseSchema,
  intelligentSearchResponseSchema,
  PRICE_FILTER_OPTIONS,
  type IntelligentSearchResponse,
  type SearchConstraintKey,
  type PublicEvent
} from '@pulso/contracts';
import {
  DEFAULT_DISCOVERY_FILTERS,
  getMontrealCalendarDate,
  CATEGORY_COLORS,
  type DiscoveryFilters,
  type EventCategory,
  type MapBounds
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

const MONTREAL_CENTER: [number, number] = [-73.5673, 45.5017];
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
  canvas.width = PIN_WIDTH;
  canvas.height = PIN_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable.');

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

  return ctx.getImageData(0, 0, PIN_WIDTH, PIN_HEIGHT);
}

const CLUSTER_BADGE_SIZE = 72;

/**
 * Cluster badge: a soft brand-gradient disc (UI-0001's canonical
 * #7336C1 → #EA3E81 → #FE7C5C gradient) with a white ring, replacing the
 * previous flat single-color circle - the point-count text is drawn by a
 * separate symbol layer stacked on top, unchanged.
 */
function buildClusterBadgeImageData(): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = CLUSTER_BADGE_SIZE;
  canvas.height = CLUSTER_BADGE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable.');

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

  return ctx.getImageData(0, 0, CLUSTER_BADGE_SIZE, CLUSTER_BADGE_SIZE);
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

export function ExploreMap({
  initialLocale
}: {
  initialLocale: SupportedLocale;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
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
  const [filters, setFilters] = useState<DiscoveryFilters>(filtersRef.current);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterNotice, setFilterNotice] = useState<string>();
  const [queryInput, setQueryInput] = useState('');
  const [searchResult, setSearchResult] = useState<IntelligentSearchResponse>();
  const [searchProcessing, setSearchProcessing] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [locale, setLocale] = useState(initialLocale);
  const { favorites, toggleFavorite } = useFavorites();
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  // Client-side only: filters the already-fetched events by source.name.
  // Empty = no restriction. Not sent to the API since every currently wired
  // source (Ticketmaster, Ville de Montréal) is already fetched together;
  // this only narrows what's shown on the map/list, same pattern as
  // showFavoritesOnly below.
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set()
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

  const [viewMode, setViewMode] = useState<'map' | 'list' | 'calendar'>('map');
  const [aboutOpen, setAboutOpen] = useState(false);
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
    if (viewMode === 'calendar') {
      void loadCalendarEvents(calendarMonth, calendarCategories, calendarPrice);
    }
  }, [viewMode, calendarMonth, calendarCategories, calendarPrice, loadCalendarEvents]);

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
        instance.addImage(`pin-${category}`, buildPinImageData(color));
      }
      instance.addImage('cluster-badge', buildClusterBadgeImageData());

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
    el.innerHTML = '<span class="user-location-marker-pulse"></span>';
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

  async function openDetails(eventId: string) {
    setPickerList(undefined);
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
  const sourceFilteredEvents =
    selectedSources.length === 0
      ? events
      : events.filter((event) => selectedSources.includes(event.source.name));
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
          <div className="nav-logo">
            <img
              src="/brand/pulso-logo-horizontal-dark.svg"
              alt={translate(locale, 'app.title')}
            />
          </div>
          <div className="nav-actions-links">
             <button
               type="button"
               className={!aboutOpen ? 'active' : ''}
               onClick={() => setAboutOpen(false)}
             >
               Explorer
             </button>
             <button
               type="button"
               className={!aboutOpen && viewMode === 'list' && showFavoritesOnly ? 'active' : ''}
               onClick={() => {
                 setAboutOpen(false);
                 if (viewMode === 'list' && showFavoritesOnly) {
                   // Already showing the favorites list - clicking again
                   // turns it off rather than doing nothing.
                   setShowFavoritesOnly(false);
                   setViewMode('map');
                 } else {
                   setShowFavoritesOnly(true);
                   setViewMode('list');
                 }
               }}
             >
               Favoris
             </button>
             <button
               type="button"
               className={aboutOpen ? 'active' : ''}
               onClick={() => setAboutOpen(true)}
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
          <div className="location-selector">
            <span>Montréal</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
          </div>
          <LanguageSelector locale={locale} onChange={selectLocale} />
        </div>
      </header>

      <div className="dashboard-main">
        {/* Left Sidebar */}
        <aside className="sidebar-left">
          <h2 className="sidebar-section-title">Découvrir</h2>

          <div className="view-toggles">
            <div className="view-toggles-list">
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
                onClick={() => setViewMode('list')}
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
            </div>
            <button
              type="button"
              className={`view-toggle-fav ${showFavoritesOnly ? 'active' : ''}`}
              aria-label={showFavoritesOnly ? 'Afficher tous les événements' : 'Afficher uniquement mes favoris'}
              aria-pressed={showFavoritesOnly}
              onClick={() => setShowFavoritesOnly((prev) => !prev)}
            >
              <HeartIcon filled={showFavoritesOnly} />
            </button>
          </div>

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
            <div className="pill-list">
              <button className="filter-pill active">🔥 Énergique</button>
              <button className="filter-pill">☕ Chill</button>
              <button className="filter-pill">🥂 Romantique</button>
              <button className="filter-pill">🎉 Festif</button>
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

          <div className="promo-card">
             <div className="promo-content">
               <h4>Téléchargez Pulso</h4>
               <p>Emportez la ville dans votre poche.</p>
             </div>
          </div>
        </aside>

        {/* Map Area */}
        <section className="map-container-wrapper" aria-label={translate(locale, 'map.label')}>
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
              events={sourceFilteredEvents}
              favorites={favorites}
              showFavoritesOnly={showFavoritesOnly}
              onToggleFavorite={toggleFavorite}
              onOpenDetails={openDetails}
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
                  setPickerList({
                    title: new Date(`${day}T00:00:00`).toLocaleDateString(
                      locale === 'fr' ? 'fr-CA' : 'en-CA',
                      { weekday: 'long', day: 'numeric', month: 'long' }
                    ),
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

        {/* Right Sidebar (Details) */}
        {details.kind !== 'closed' && (
           <div className="sidebar-right">
             {details.kind === 'success' && (
               <EventDetails
                 event={details.event}
                 headingRef={detailsHeading}
                 onBack={returnToMap}
                 isFavorite={favorites.includes(details.event.id)}
                 onToggleFavorite={() => toggleFavorite(details.event.id)}
                 locale={locale}
               />
             )}
             {details.kind === 'loading' && (
               <div style={{padding: '2rem'}}>Chargement...</div>
             )}
             {details.kind === 'error' && (
               <div style={{padding: '2rem'}}>
                 Erreur de chargement.
                 <button className="btn-secondary" onClick={() => void openDetails(details.eventId)} style={{marginTop: '1rem'}}>Réessayer</button>
               </div>
             )}
           </div>
        )}

        {details.kind === 'closed' && pickerList && (
          <div className="sidebar-right">
            <PickerList
              title={pickerList.title}
              events={pickerList.events}
              favorites={favorites}
              locale={locale}
              onClose={() => setPickerList(undefined)}
              onSelect={(id) => void openDetails(id)}
            />
          </div>
        )}
      </div>

      {filtersOpen && (
        <FilterOverlay
          filters={filters}
          onChange={applyFilters}
          onClose={() => setFiltersOpen(false)}
          onClearAll={clearAll}
          locale={locale}
        />
      )}

      {aboutOpen && <AboutPanel onClose={() => setAboutOpen(false)} />}

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
           <a href="#" className="view-all">Voir tous les événements <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign: 'middle', marginLeft: 4}}><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg></a>
         </div>
         
         <div className="event-carousel">
           {carouselEvents.slice(0, 15).map(evt => (
              <div className="event-card" key={evt.id} onClick={() => openDetails(evt.id)} style={{cursor: 'pointer'}}>
                <div
                  className="event-card-img"
                  style={{
                    background: `linear-gradient(160deg, ${CATEGORY_COLORS[evt.category] ?? CATEGORY_COLORS['other']}55, ${CATEGORY_COLORS[evt.category] ?? CATEGORY_COLORS['other']}11)`
                  }}
                >
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

function CategoryIcon({ category }: { category: EventCategory }) {
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
      {CATEGORY_ICON_PATHS[category]}
    </svg>
  );
}

function ViewModeIcon({ kind }: { kind: 'map' | 'list' | 'calendar' }) {
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

function ListView({
  events,
  favorites,
  showFavoritesOnly,
  onToggleFavorite,
  onOpenDetails,
  locale
}: {
  events: PublicEvent[];
  favorites: string[];
  showFavoritesOnly: boolean;
  onToggleFavorite: (id: string) => void;
  onOpenDetails: (id: string) => void;
  locale: SupportedLocale;
}) {
  const visible = showFavoritesOnly
    ? events.filter((event) => favorites.includes(event.id))
    : events;

  return (
    <div className="list-view">
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

const CALENDAR_WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

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
          return (
            <button
              type="button"
              key={cell.key}
              className={`calendar-cell ${selectedDay === cell.key ? 'selected' : ''} ${dayCount > 0 ? 'has-events' : ''}`}
              onClick={() =>
                onSelectDay(
                  selectedDay === cell.key ? undefined : cell.key,
                  eventsByDay.get(cell.key) ?? []
                )
              }
            >
              <span className="calendar-day-number">{cell.day}</span>
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
        {action}
      </div>
      {!collapsed && children}
    </div>
  );
}

const LOCALE_META: Record<SupportedLocale, { flag: string; code: string; title: string }> = {
  fr: { flag: '🇫🇷', code: 'FR', title: 'Français' },
  en: { flag: '🇬🇧', code: 'EN', title: 'English' }
};

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
        <span aria-hidden="true" className="lang-flag">{LOCALE_META[locale].flag}</span>
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
            <span aria-hidden="true">{LOCALE_META[other].flag}</span>
            {LOCALE_META[other].title}
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

function AboutPanel({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [onClose]);

  return (
    <aside
      className="filter-overlay glass-panel slide-up"
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
  locale
}: {
  filters: DiscoveryFilters;
  onChange: (filters: DiscoveryFilters) => void;
  onClose: () => void;
  onClearAll: () => void;
  locale: SupportedLocale;
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
      className="filter-overlay glass-panel slide-up"
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
      <div className="details-hero">
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
