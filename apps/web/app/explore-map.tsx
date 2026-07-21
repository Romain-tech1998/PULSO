'use client';

import {
  buildMapEventsQuery,
  CATEGORY_FILTER_OPTIONS,
  DATE_FILTER_OPTIONS,
  eventDetailsResponseSchema,
  eventListResponseSchema,
  intelligentSearchResponseSchema,
  PRICE_FILTER_OPTIONS,
  summarizeActiveFilters,
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

function boundsUrl(bounds: MapBounds, filters: DiscoveryFilters): string {
  return `${API_BASE_URL}/events?${buildMapEventsQuery(bounds, filters)}`;
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
  const [selected, setSelected] = useState<PublicEvent>();
  const [state, setState] = useState<LoadState>('loading');
  const [basemapState, setBasemapState] = useState<BasemapState>('loading');
  const [details, setDetails] = useState<DetailsState>({ kind: 'closed' });
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
        const response = await fetch(boundsUrl(bounds, activeFilters));
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

      // Source pour les événements
      instance.addSource('events-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Layer pour les événements non-sélectionnés (cercles colorés)
      instance.addLayer({
        id: 'events-circles',
        type: 'circle',
        source: 'events-source',
        paint: {
          'circle-radius': 8,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF'
        },
        filter: ['!=', ['get', 'id'], selected?.id ?? '']
      });

      // Layer pour l'événement sélectionné (grand pin lumineux)
      instance.addLayer({
        id: 'events-selected',
        type: 'circle',
        source: 'events-source',
        paint: {
          'circle-radius': 12,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#FFFFFF',
          'circle-pitch-alignment': 'map'
        },
        filter: ['==', ['get', 'id'], selected?.id ?? '']
      });

      // Interactions
      instance.on('click', 'events-circles', (e) => {
        if (!e.features?.[0]) return;
        const featureId = e.features[0].properties.id;
        const event = eventsRef.current.find(ev => ev.id === featureId);
        if (event) setSelected(event);
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
    instance.addControl(new maplibregl.NavigationControl(), 'top-right');
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
    const sel = selectedRef.current;
    const visibleEvents = showFavs ? evs.filter(e => favs.includes(e.id)) : evs;
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
          color: CATEGORY_COLORS[event.category] ?? CATEGORY_COLORS['other']
        }
      }))
    });
    if (instance.getLayer('events-circles')) {
      instance.setFilter('events-circles', ['!=', ['get', 'id'], sel?.id ?? '']);
      instance.setFilter('events-selected', ['==', ['get', 'id'], sel?.id ?? '']);
    }
  }, []);

  // Refs pour éviter les closures périmées dans pushEventsToMap
  const favoritesRef = useRef(favorites);
  const showFavoritesOnlyRef = useRef(showFavoritesOnly);
  const selectedRef = useRef(selected);
  useEffect(() => { favoritesRef.current = favorites; }, [favorites]);
  useEffect(() => { showFavoritesOnlyRef.current = showFavoritesOnly; }, [showFavoritesOnly]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // Synchronisation des données vers la carte (se déclenche aussi quand on revient à la carte)
  useEffect(() => {
    if (map.current) pushEventsToMap(map.current);
  }, [events, favorites, showFavoritesOnly, selected, pushEventsToMap]);

  async function openDetails(eventId: string) {
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

  return (
    <div className="app-container">
      <header className="top-navbar">
        <div className="nav-logo">
          <img
            src="/brand/pulso-logo-horizontal-dark.svg"
            alt={translate(locale, 'app.title')}
          />
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
            <button className="view-toggle-btn active">Carte</button>
            <button className="view-toggle-btn">Liste</button>
            <button className="view-toggle-btn">Calendrier</button>
          </div>

          <div className="filter-group">
            <div className="filter-group-header">
              <span>Filtres</span>
              <button className="filter-reset" onClick={clearAll}>Réinitialiser</button>
            </div>
            <div className="pill-list">
              <button className="filter-pill active">Aujourd'hui</button>
              <button className="filter-pill">Ce week-end</button>
              <button className="filter-pill">Cette semaine</button>
            </div>
          </div>

          <div className="filter-group">
            <div className="filter-group-header">
              <span>Catégories</span>
              <button className="filter-reset">Voir tout</button>
            </div>
            <div className="category-grid">
              <div className="category-item active">
                <div className="category-icon">🎟️</div>
                <span>Tous</span>
              </div>
              <div className="category-item">
                <div className="category-icon">🎸</div>
                <span>Concerts</span>
              </div>
              <div className="category-item">
                <div className="category-icon">🪩</div>
                <span>Soirées</span>
              </div>
              <div className="category-item">
                <div className="category-icon">⚡</div>
                <span>Techno</span>
              </div>
            </div>
          </div>

          <div className="promo-card">
             <div className="promo-content">
               <h4>Téléchargez Pulso</h4>
               <p>Emportez la ville dans votre poche.</p>
             </div>
          </div>
        </aside>

        {/* Map Area */}
        <section className="map-container-wrapper" aria-label={translate(locale, 'map.label')}>
          <div className="map-shell" data-map-context="preserved">
             <div ref={container} className="map" />
             <button className="map-floating-search" onClick={() => loadEvents(currentBounds.current, filters)}>
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: 8}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
               Rechercher dans cette zone
             </button>

             <div className="map-floating-filters">
                <button className="map-filter-btn" onClick={() => setFiltersOpen(true)}>
                  Plus de filtres
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginLeft: 8}}><path d="M6 9l6 6 6-6"/></svg>
                </button>
             </div>
             
             {basemapState !== 'loaded' && (
              <p className="map-basemap-status" role="status">
                {basemapState === 'loading' ? 'Loading map...' : 'Map unavailable'}
              </p>
             )}
          </div>
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

      {/* Selected marker preview fallback logic */}
      {selected && details.kind === 'closed' && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 50, maxWidth: 400, width: '100%' }}>
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
           {events.slice(0, 10).map(evt => (
              <div className="event-card" key={evt.id} onClick={() => openDetails(evt.id)} style={{cursor: 'pointer'}}>
                <div className="event-card-img">
                   <div className="card-badge">{evt.category || 'EVENT'}</div>
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
           {events.length === 0 && <p>Aucun événement trouvé.</p>}
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

function LanguageSelector({
  locale,
  onChange
}: {
  locale: SupportedLocale;
  onChange: (locale: SupportedLocale) => void;
}) {
  return (
    <fieldset className="language-selector">
      <legend>{translate(locale, 'language.label')}</legend>
      {(['fr', 'en'] as const).map((value) => (
        <label key={value}>
          <input
            type="radio"
            name="language"
            value={value}
            checked={locale === value}
            onChange={() => onChange(value)}
          />
          {translate(locale, `language.${value}`)}
        </label>
      ))}
    </fieldset>
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

function ActiveFilters({
  filters,
  onChange,
  locale
}: {
  filters: DiscoveryFilters;
  onChange: (filters: DiscoveryFilters) => void;
  locale: SupportedLocale;
}) {
  const summary = summarizeActiveFilters(filters, locale);
  if (summary.length === 0) {
    return (
      <span className="default-filter">
        {translate(locale, 'filters.default')}
      </span>
    );
  }
  return (
    <div
      className="active-filters"
      aria-label={translate(locale, 'filters.activeAria')}
    >
      {summary.map((item) => (
        <button
          type="button"
          key={`${item.key}-${item.value}`}
          aria-label={translate(locale, 'filters.clearAria', {
            label: item.label
          })}
          onClick={() => {
            if (item.key === 'date') {
              onChange(withoutCustomDates(filters));
            } else if (item.key === 'price') {
              onChange({ ...filters, price: 'all' });
            } else {
              onChange({
                ...filters,
                categories: filters.categories.filter(
                  (category) => category !== item.value
                )
              });
            }
          }}
        >
          {item.label} ×
        </button>
      ))}
    </div>
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
      className="filter-overlay"
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
    <article className="preview fade-in slide-up glass-panel" aria-live="polite">
      <div className="preview-header-actions">
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
          <span aria-hidden="true">{isFavorite ? '❤️' : '🤍'}</span>
        </button>
        <button type="button" className="close-button" onClick={onClose}>
          {translate(locale, 'preview.close')}
        </button>
      </div>
      <p className="chip">{fields.category}</p>
      <h2>{fields.title}</h2>
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
    </article>
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
    <section
      className="details-screen glass-panel slide-up"
      aria-label={translate(locale, 'details.label')}
    >
      <div className="details-header-actions">
        <button type="button" className="back-button" onClick={onBack}>
          {translate(locale, 'details.back')}
        </button>
        <div>
          <button
            type="button"
            className="share-button"
            onClick={onShare}
            style={{ marginRight: '12px' }}
          >
            <span aria-hidden="true">↗️</span> {translate(locale, 'details.share')}
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
            <span aria-hidden="true">{isFavorite ? '❤️' : '🤍'}</span>
          </button>
        </div>
      </div>
      <p className="eyebrow">{translate(locale, 'details.label')}</p>
      <h2 ref={headingRef} tabIndex={-1}>
        {event.title}
      </h2>
      <p className="detail-lead">
        {presentation.status} · {presentation.category}
      </p>
      {presentation.materialWarning && (
        <p className="warning" role="alert">
          {presentation.materialWarning}
        </p>
      )}
      <dl className="detail-grid">
        <div>
          <dt>{translate(locale, 'details.dateTime')}</dt>
          <dd>{presentation.dateTime}</dd>
        </div>
        <div>
          <dt>{translate(locale, 'details.venue')}</dt>
          <dd>{event.venue.name}</dd>
        </div>
        <div>
          <dt>{translate(locale, 'details.address')}</dt>
          <dd>{event.venue.address}</dd>
        </div>
        <div>
          <dt>{translate(locale, 'details.price')}</dt>
          <dd>{presentation.price}</dd>
        </div>
        <div>
          <dt>{translate(locale, 'details.description')}</dt>
          <dd>{presentation.description}</dd>
        </div>
        <div>
          <dt>{translate(locale, 'details.organizer')}</dt>
          <dd>{presentation.organizer}</dd>
        </div>
        <div>
          <dt>{translate(locale, 'details.access')}</dt>
          <dd>{event.accessInformation}</dd>
        </div>
        <div>
          <dt>{translate(locale, 'details.source')}</dt>
          <dd>{event.source.name}</dd>
        </div>
        <div>
          <dt>{translate(locale, 'details.trust')}</dt>
          <dd>
            {presentation.trust} · {presentation.location}
          </dd>
        </div>
        <div>
          <dt>{translate(locale, 'details.verification')}</dt>
          <dd>{presentation.freshness}</dd>
        </div>
      </dl>
      {presentation.externalAction ? (
        <a className="primary-action glow-button" href={externalHref} target="_blank" rel="noopener noreferrer">
          {presentation.externalAction} —{' '}
          {translate(locale, 'details.externalSuffix')}
        </a>
      ) : (
        <p className="unavailable" role="status">
          {presentation.externalUnavailable}
        </p>
      )}
      <p className="external-note">
        {translate(locale, 'details.externalNote')}
      </p>
    </section>
  );
}
