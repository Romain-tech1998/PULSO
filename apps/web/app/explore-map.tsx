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

type LoadState = 'loading' | 'success' | 'empty' | 'error';
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

export function ExploreMap({
  initialLocale
}: {
  initialLocale: SupportedLocale;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
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
  const [details, setDetails] = useState<DetailsState>({ kind: 'closed' });
  const [filters, setFilters] = useState<DiscoveryFilters>(filtersRef.current);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterNotice, setFilterNotice] = useState<string>();
  const [queryInput, setQueryInput] = useState('');
  const [searchResult, setSearchResult] = useState<IntelligentSearchResponse>();
  const [searchProcessing, setSearchProcessing] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [locale, setLocale] = useState(initialLocale);

  useEffect(() => {
    const resolved = resolveBrowserLocale([initialLocale], localStorage);
    localeRef.current = resolved;
    setLocale(resolved);
    document.documentElement.lang = resolved;
  }, [initialLocale]);

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
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': '#102a2d' }
          }
        ]
      }
    });
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
      markers.current.forEach((marker) => marker.remove());
      instance.remove();
    };
  }, [loadEvents]);

  useEffect(() => {
    if (!map.current) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = events.map((event) => {
      const button = document.createElement('button');
      button.className = 'marker';
      button.type = 'button';
      button.setAttribute(
        'aria-label',
        translate(locale, 'map.previewAria', { title: event.title })
      );
      button.addEventListener('click', () => setSelected(event));
      return new maplibregl.Marker({ element: button })
        .setLngLat([event.venue.point.longitude, event.venue.point.latitude])
        .addTo(map.current!);
    });
  }, [events, locale]);

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
    <main>
      <header>
        <div className="header-row">
          <div className="brand-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-horizontal.png"
              alt={translate(locale, 'app.title')}
              className="brand-logo"
            />
            <h1 className="sr-only">{translate(locale, 'app.title')}</h1>
            <p className="eyebrow">{translate(locale, 'app.eyebrow')}</p>
          </div>
          <LanguageSelector locale={locale} onChange={selectLocale} />
        </div>
        <p>{translate(locale, 'app.description')}</p>
      </header>
      <section
        className="map-shell"
        aria-label={translate(locale, 'map.label')}
        hidden={showingDetails}
        data-map-context="preserved"
      >
        <div ref={container} className="map" />
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
        <div className="filter-controls">
          <button
            type="button"
            className="filter-trigger"
            aria-expanded={filtersOpen}
            aria-controls="map-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            {translate(locale, 'filters.trigger', {
              count: summarizeActiveFilters(filters, locale).length
            })}
          </button>
          <ActiveFilters
            filters={filters}
            onChange={applyFilters}
            locale={locale}
          />
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
        <div className={`status status-${state}`} role="status">
          {state === 'loading' && translate(locale, 'map.loading')}
          {state === 'empty' && (
            <>
              {searchResult
                ? localizeSearchMessage(locale, searchResult.message)
                : translate(locale, 'map.empty')}
              <button
                type="button"
                onClick={searchResult ? clearSearch : clearAll}
              >
                {searchResult
                  ? translate(locale, 'search.clearSearch')
                  : translate(locale, 'filters.clearAll')}
              </button>
            </>
          )}
          {state === 'error' && (
            <>
              {translate(locale, 'map.error')}
              <button type="button" onClick={() => void loadEvents()}>
                {translate(locale, 'common.retry')}
              </button>
            </>
          )}
          {state === 'success' &&
            translate(
              locale,
              events.length === 1 ? 'map.count.one' : 'map.count.many',
              { count: events.length }
            )}
        </div>
        {filterNotice && (
          <p className="filter-notice" role="status">
            {filterNotice}
          </p>
        )}
        {selected && (
          <EventPreview
            event={selected}
            searchMatch={searchResult?.data.find(
              ({ event }) => event.id === selected.id
            )}
            detailsButton={detailsButton}
            onClose={() => setSelected(undefined)}
            onDetails={() => void openDetails(selected.id)}
            locale={locale}
          />
        )}
      </section>

      {details.kind === 'loading' && (
        <section
          className="details-screen"
          aria-label={translate(locale, 'details.label')}
        >
          <button type="button" className="back-button" onClick={returnToMap}>
            {translate(locale, 'details.back')}
          </button>
          <p role="status">{translate(locale, 'details.loading')}</p>
        </section>
      )}

      {details.kind === 'error' && (
        <section
          className="details-screen"
          aria-label={translate(locale, 'details.label')}
        >
          <button type="button" className="back-button" onClick={returnToMap}>
            {translate(locale, 'details.back')}
          </button>
          <p role="alert">{translate(locale, 'details.error')}</p>
          <button
            type="button"
            onClick={() => void openDetails(details.eventId)}
          >
            {translate(locale, 'details.retry')}
          </button>
        </section>
      )}

      {details.kind === 'success' && (
        <EventDetails
          event={details.event}
          headingRef={detailsHeading}
          onBack={returnToMap}
          locale={locale}
        />
      )}
    </main>
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
  const [open, setOpen] = useState(false);
  return (
    <aside
      className={`search-panel${open ? '' : ' search-panel-collapsed'}`}
      aria-label={translate(locale, 'search.panelAria')}
    >
      <button
        type="button"
        className="search-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {translate(locale, open ? 'search.collapse' : 'search.expand')}
      </button>
      {open && (
        <>
          <form
            className="search-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <label htmlFor="intelligent-search">
              {translate(locale, 'search.question')}
            </label>
            <div>
              <input
                id="intelligent-search"
                value={query}
                maxLength={240}
                placeholder={translate(locale, 'search.placeholder')}
                onChange={(event) => onQueryChange(event.target.value)}
              />
              <button type="submit" disabled={processing || !query.trim()}>
                {translate(locale, 'search.submit')}
              </button>
            </div>
          </form>
          <p className="search-help">{translate(locale, 'search.help')}</p>
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
                  onClick={() => onPreview(event)}
                >
                  {translate(locale, 'search.previewResult', {
                    title: event.title,
                    matchType: translate(locale, `search.match.${matchType}`)
                  })}
                </button>
              ))}
            </div>
          )}
        </>
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
  locale
}: {
  event: PublicEvent;
  searchMatch: IntelligentSearchResponse['data'][number] | undefined;
  detailsButton: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onDetails: () => void;
  locale: SupportedLocale;
}) {
  const fields = eventPreviewFields(event, locale);
  return (
    <article className="preview" aria-live="polite">
      <button type="button" className="close-button" onClick={onClose}>
        {translate(locale, 'preview.close')}
      </button>
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
  locale
}: {
  event: PublicEvent;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  locale: SupportedLocale;
}) {
  const { presentation } = eventDetailsFields(event, locale);
  const externalHref = `${API_BASE_URL}/events/${event.id}/external`;
  return (
    <section
      className="details-screen"
      aria-label={translate(locale, 'details.label')}
    >
      <button type="button" className="back-button" onClick={onBack}>
        {translate(locale, 'details.back')}
      </button>
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
        <a className="primary-action" href={externalHref}>
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
