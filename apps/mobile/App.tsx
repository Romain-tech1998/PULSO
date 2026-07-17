import {
  Camera,
  Map,
  Marker,
  type StyleSpecification
} from '@maplibre/maplibre-react-native';
import {
  buildMapEventsQuery,
  CATEGORY_FILTER_OPTIONS,
  DATE_FILTER_OPTIONS,
  eventDetailsResponseSchema,
  eventListResponseSchema,
  intelligentSearchResponseSchema,
  PRICE_FILTER_OPTIONS,
  presentEvent,
  summarizeActiveFilters,
  type IntelligentSearchResponse,
  type SearchConstraintKey,
  type PublicEvent
} from '@pulso/contracts';
import {
  DEFAULT_DISCOVERY_FILTERS,
  getMontrealCalendarDate,
  type DiscoveryFilters,
  type EventCategory
} from '@pulso/domain';
import { MOBILE_SEARCH_PANEL_LAYOUT } from './search-layout';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.0.2.2:3001';
const center: [number, number] = [-73.5673, 45.5017];
const initialBounds = [-73.75, 45.4, -73.4, 45.7] as const;
const localStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#102a2d' }
    }
  ]
};

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

function eventUrl(
  bounds: readonly [number, number, number, number],
  filters: DiscoveryFilters
) {
  const [west, south, east, north] = bounds;
  return `${API_BASE_URL}/events?${buildMapEventsQuery(
    { west, south, east, north },
    filters
  )}`;
}

export default function App() {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [selected, setSelected] = useState<PublicEvent>();
  const [state, setState] = useState<LoadState>('loading');
  const [bounds, setBounds] =
    useState<readonly [number, number, number, number]>(initialBounds);
  const [details, setDetails] = useState<DetailsState>({ kind: 'closed' });
  const activeSearch = useRef<ActiveSearch | undefined>(undefined);
  const filtersRef = useRef<DiscoveryFilters>({
    ...DEFAULT_DISCOVERY_FILTERS,
    categories: []
  });
  const [filters, setFilters] = useState(filtersRef.current);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterNotice, setFilterNotice] = useState<string>();
  const [queryInput, setQueryInput] = useState('');
  const [searchResult, setSearchResult] = useState<IntelligentSearchResponse>();
  const [searchProcessing, setSearchProcessing] = useState(false);
  const [searchError, setSearchError] = useState(false);

  const loadEvents = useCallback(
    async (
      nextBounds: readonly [number, number, number, number],
      activeFilters = filtersRef.current
    ) => {
      setBounds(nextBounds);
      setState('loading');
      setSearchError(false);
      try {
        if (activeSearch.current) {
          setSearchProcessing(true);
          const [west, south, east, north] = nextBounds;
          const response = await fetch(`${API_BASE_URL}/search`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              query: activeSearch.current.query,
              bounds: { west, south, east, north },
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
        const response = await fetch(eventUrl(nextBounds, activeFilters));
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

  useEffect(() => {
    void loadEvents(initialBounds);
  }, [loadEvents]);

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
      setFilterNotice(
        'The open event preview was closed because the filters changed.'
      );
    } else {
      setFilterNotice(undefined);
    }
    void loadEvents(bounds, nextFilters);
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
    void loadEvents(bounds, manualFilters);
  }

  function clearSearch() {
    const restored = activeSearch.current?.manualFilters ?? filtersRef.current;
    activeSearch.current = undefined;
    setQueryInput('');
    setSearchResult(undefined);
    setSearchError(false);
    filtersRef.current = restored;
    setFilters(restored);
    void loadEvents(bounds, restored);
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
    void loadEvents(bounds, defaults);
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
    setFilterNotice(
      'The open event preview was closed because the search interpretation changed.'
    );
    void loadEvents(bounds);
  }

  async function openDetails(eventId: string) {
    setDetails({ kind: 'loading', eventId });
    try {
      const response = await fetch(`${API_BASE_URL}/events/${eventId}`);
      if (!response.ok) throw new Error('Event details unavailable');
      const result = eventDetailsResponseSchema.parse(await response.json());
      setDetails({ kind: 'success', event: result.data });
    } catch {
      setDetails({ kind: 'error', eventId });
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Pulso · Free exploration</Text>
        <Text style={styles.title} accessibilityRole="header">
          Explore Montréal
        </Text>
      </View>
      <View style={styles.mapShell} accessibilityLabel="Montréal event map">
        <Map
          style={styles.map}
          mapStyle={localStyle}
          onRegionDidChange={({ nativeEvent }) => {
            if (!nativeEvent.userInteraction) return;
            void loadEvents(nativeEvent.bounds);
          }}
        >
          <Camera initialViewState={{ center, zoom: 11 }} />
          {events.map((event) => (
            <Marker
              id={event.id}
              key={event.id}
              lngLat={[event.venue.point.longitude, event.venue.point.latitude]}
              onPress={() => setSelected(event)}
              accessible
              accessibilityRole="button"
              accessibilityLabel={`Preview ${event.title}`}
            >
              <View style={styles.marker} />
            </Marker>
          ))}
        </Map>
        <MobileSearchPanel
          query={queryInput}
          result={searchResult}
          processing={searchProcessing}
          error={searchError}
          onQueryChange={setQueryInput}
          onSubmit={submitSearch}
          onClear={clearSearch}
          onClearConstraint={clearDerivedConstraint}
          onPreview={setSelected}
        />
        <View style={styles.filterControls}>
          <Pressable
            style={styles.filterButton}
            onPress={() => setFiltersOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: filtersOpen }}
            accessibilityLabel={`Filters, ${summarizeActiveFilters(filters).length} active`}
          >
            <Text style={styles.filterButtonText}>
              Filters ({summarizeActiveFilters(filters).length})
            </Text>
          </Pressable>
          <MobileActiveFilters filters={filters} onChange={applyFilters} />
        </View>
        <View style={styles.status} accessibilityLiveRegion="polite">
          {state === 'loading' && <ActivityIndicator color="#76f0a8" />}
          <Text style={styles.statusText}>
            {state === 'loading' && 'Loading events…'}
            {state === 'success' &&
              `${events.length} matching fictional event${events.length === 1 ? '' : 's'} in this map area.`}
            {state === 'empty' &&
              (searchResult?.message ??
                'No events match the active filters in this map area.')}
            {state === 'error' &&
              'Events could not be loaded. Your map context is preserved.'}
          </Text>
          {(state === 'empty' || state === 'error') && (
            <Pressable
              onPress={() =>
                state === 'empty'
                  ? searchResult
                    ? clearSearch()
                    : clearAll()
                  : void loadEvents(bounds)
              }
              accessibilityRole="button"
              accessibilityLabel={
                state === 'empty'
                  ? searchResult
                    ? 'Clear search'
                    : 'Clear all filters'
                  : 'Retry loading events'
              }
            >
              <Text style={styles.link}>
                {state === 'empty'
                  ? searchResult
                    ? 'Clear search'
                    : 'Clear all filters'
                  : 'Retry'}
              </Text>
            </Pressable>
          )}
          {state === 'success' && (
            <View style={styles.markerActions}>
              {events.map((event) => (
                <Pressable
                  key={event.id}
                  onPress={() => setSelected(event)}
                  accessibilityRole="button"
                  accessibilityLabel={`Preview ${event.title}`}
                  style={styles.markerAction}
                >
                  <Text style={styles.markerActionText} numberOfLines={1}>
                    Preview {event.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        {filterNotice && (
          <Text style={styles.filterNotice} accessibilityLiveRegion="polite">
            {filterNotice}
          </Text>
        )}
        {filtersOpen && (
          <MobileFilterOverlay
            filters={filters}
            onChange={applyFilters}
            onClose={() => setFiltersOpen(false)}
            onClearAll={clearAll}
          />
        )}
        {selected && details.kind === 'closed' && (
          <EventPreview
            event={selected}
            searchMatch={searchResult?.data.find(
              ({ event }) => event.id === selected.id
            )}
            onClose={() => setSelected(undefined)}
            onDetails={() => void openDetails(selected.id)}
          />
        )}
        {details.kind !== 'closed' && (
          <DetailsOverlay
            state={details}
            onBack={() => setDetails({ kind: 'closed' })}
            onRetry={(eventId) => void openDetails(eventId)}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function MobileSearchPanel({
  query,
  result,
  processing,
  error,
  onQueryChange,
  onSubmit,
  onClear,
  onClearConstraint,
  onPreview
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
}) {
  const [open, setOpen] = useState(false);
  return (
    <View
      style={[styles.searchPanel, !open && styles.searchPanelCollapsed]}
      accessibilityLabel="Optional intelligent search"
      pointerEvents={open ? 'auto' : 'box-none'}
    >
      <Pressable
        style={styles.searchToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
      >
        <Text style={styles.filterButtonText}>
          {open ? 'Collapse search' : 'Intelligent search'}
        </Text>
      </Pressable>
      {open && (
        <ScrollView
          style={styles.searchPanelContent}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.searchLabel}>What do you want to do?</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={query}
              maxLength={240}
              placeholder="Free music tonight"
              placeholderTextColor="#7f9da0"
              accessibilityLabel="What do you want to do?"
              returnKeyType="search"
              onChangeText={onQueryChange}
              onSubmitEditing={onSubmit}
            />
            <Pressable
              style={styles.searchButton}
              accessibilityRole="button"
              accessibilityState={{ disabled: processing || !query.trim() }}
              disabled={processing || !query.trim()}
              onPress={onSubmit}
            >
              <Text style={styles.filterButtonText}>Search</Text>
            </Pressable>
          </View>
          <Text style={styles.searchHelp}>
            Optional deterministic matching; manual filters remain available. No
            external AI provider is used.
          </Text>
          {processing && (
            <View
              style={styles.searchProgress}
              accessibilityLiveRegion="polite"
            >
              <ActivityIndicator color="#76f0a8" />
              <Text style={styles.body}>Interpreting request…</Text>
            </View>
          )}
          {error && (
            <Text style={styles.warning} accessibilityLiveRegion="assertive">
              Search could not be completed. The map and filters remain
              available.
            </Text>
          )}
          {result && !processing && (
            <View style={styles.searchInterpretation}>
              <View style={styles.searchHeading}>
                <Text
                  style={styles.searchResultTitle}
                  accessibilityRole="header"
                >
                  Pulso understood
                </Text>
                <Pressable accessibilityRole="button" onPress={onClear}>
                  <Text style={styles.link}>Clear search</Text>
                </Pressable>
              </View>
              <Text style={styles.body}>{result.message}</Text>
              {result.clarification && (
                <Text style={styles.warningText}>
                  One clarification: {result.clarification}
                </Text>
              )}
              <Text style={styles.filterLegend}>Hard constraints</Text>
              {result.interpretation.constraints.map((constraint) => (
                <View
                  style={styles.searchConstraint}
                  key={`${constraint.key}-${constraint.label}`}
                >
                  <Text style={styles.body}>{constraint.label}</Text>
                  {isSearchConstraintKey(constraint.key) && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Clear derived constraint ${constraint.label}`}
                      onPress={() =>
                        onClearConstraint(constraint.key as SearchConstraintKey)
                      }
                    >
                      <Text style={styles.link}>Clear</Text>
                    </Pressable>
                  )}
                </View>
              ))}
              {result.interpretation.rankingSignals.length > 0 && (
                <>
                  <Text style={styles.filterLegend}>Ranking signals</Text>
                  {result.interpretation.rankingSignals.map((signal) => (
                    <Text
                      style={styles.body}
                      key={`${signal.key}-${signal.label}`}
                    >
                      • {signal.label}
                    </Text>
                  ))}
                </>
              )}
            </View>
          )}
          {result && result.data.length > 0 && (
            <View style={styles.searchResults}>
              <Text style={styles.filterLegend}>Results on this map</Text>
              {result.data.map(({ event, matchType }, index) => (
                <Pressable
                  key={event.id}
                  style={styles.markerAction}
                  accessibilityRole="button"
                  accessibilityLabel={`Preview search result ${index + 1}: ${matchType}`}
                  onPress={() => onPreview(event)}
                >
                  <Text style={styles.markerActionText}>
                    Preview {event.title} ({matchType})
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
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

function withoutCustomDates(
  filters: DiscoveryFilters,
  date: DiscoveryFilters['date'] = 'next7'
): DiscoveryFilters {
  const next = { ...filters, date };
  delete next.customStartDate;
  delete next.customEndDate;
  return next;
}

function MobileActiveFilters({
  filters,
  onChange
}: {
  filters: DiscoveryFilters;
  onChange: (filters: DiscoveryFilters) => void;
}) {
  const summary = summarizeActiveFilters(filters);
  if (summary.length === 0) {
    return <Text style={styles.defaultFilter}>Next 7 days · map area</Text>;
  }
  return (
    <ScrollView horizontal contentContainerStyle={styles.activeFilters}>
      {summary.map((item) => (
        <Pressable
          key={`${item.key}-${item.value}`}
          style={styles.filterChip}
          accessibilityRole="button"
          accessibilityLabel={`Clear ${item.label} filter`}
          onPress={() => {
            if (item.key === 'date') onChange(withoutCustomDates(filters));
            else if (item.key === 'price')
              onChange({ ...filters, price: 'all' });
            else
              onChange({
                ...filters,
                categories: filters.categories.filter(
                  (category) => category !== item.value
                )
              });
          }}
        >
          <Text style={styles.filterChipText}>{item.label} ×</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function MobileFilterOverlay({
  filters,
  onChange,
  onClose,
  onClearAll
}: {
  filters: DiscoveryFilters;
  onChange: (filters: DiscoveryFilters) => void;
  onClose: () => void;
  onClearAll: () => void;
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
    <View style={styles.filterOverlay} accessibilityViewIsModal>
      <View style={styles.filterHeading}>
        <Text style={styles.filterTitle} accessibilityRole="header">
          Filters
        </Text>
        <Pressable accessibilityRole="button" onPress={onClose}>
          <Text style={styles.close}>Close filters</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.filterContent}>
        <Text style={styles.filterLegend}>Date and time</Text>
        {DATE_FILTER_OPTIONS.map((option) => (
          <FilterChoice
            key={option.value}
            label={option.label}
            selected={filters.date === option.value}
            kind="radio"
            onPress={() => setDate(option.value)}
          />
        ))}
        {filters.date === 'custom' && (
          <View style={styles.customDates}>
            <Text style={styles.detailLabel}>Start date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.dateInput}
              defaultValue={filters.customStartDate ?? today}
              accessibilityLabel="Selected start date"
              onEndEditing={({ nativeEvent: { text: value } }) => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
                onChange({
                  ...filters,
                  date: 'custom',
                  customStartDate: value,
                  customEndDate:
                    filters.customEndDate && filters.customEndDate >= value
                      ? filters.customEndDate
                      : value
                });
              }}
            />
            <Text style={styles.detailLabel}>End date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.dateInput}
              defaultValue={
                filters.customEndDate ?? filters.customStartDate ?? today
              }
              accessibilityLabel="Selected end date"
              onEndEditing={({ nativeEvent: { text: value } }) => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
                if (value < (filters.customStartDate ?? today)) return;
                onChange({ ...filters, date: 'custom', customEndDate: value });
              }}
            />
          </View>
        )}

        <Text style={styles.filterLegend}>Categories</Text>
        <Text style={styles.filterHelp}>
          Multiple categories match with OR.
        </Text>
        {CATEGORY_FILTER_OPTIONS.map((option) => (
          <FilterChoice
            key={option.value}
            label={option.label}
            selected={filters.categories.includes(option.value)}
            kind="checkbox"
            onPress={() => toggleCategory(option.value)}
          />
        ))}

        <Text style={styles.filterLegend}>Price</Text>
        {PRICE_FILTER_OPTIONS.map((option) => (
          <FilterChoice
            key={option.value}
            label={option.label}
            selected={filters.price === option.value}
            kind="radio"
            onPress={() => onChange({ ...filters, price: option.value })}
          />
        ))}
        <Text style={styles.filterHelp}>
          Unknown prices appear only under All.
        </Text>

        <Text style={styles.filterLegend}>Geography</Text>
        <Text style={styles.filterHelp}>
          Current visible map area. Distance is not applied because no reference
          location was supplied; no routing or implicit location.
        </Text>
        <Text style={styles.filterLegend}>Status</Text>
        <Text style={styles.filterHelp}>
          Upcoming and postponed events; cancelled events are excluded.
        </Text>
        <Pressable
          style={styles.clearAll}
          accessibilityRole="button"
          onPress={onClearAll}
        >
          <Text style={styles.filterButtonText}>Clear all filters</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function FilterChoice({
  label,
  selected,
  kind,
  onPress
}: {
  label: string;
  selected: boolean;
  kind: 'radio' | 'checkbox';
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.filterChoice}
      accessibilityRole={kind}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
    >
      <Text style={styles.filterChoiceIndicator}>{selected ? '●' : '○'}</Text>
      <Text style={styles.body}>{label}</Text>
    </Pressable>
  );
}

function EventPreview({
  event,
  searchMatch,
  onClose,
  onDetails
}: {
  event: PublicEvent;
  searchMatch: IntelligentSearchResponse['data'][number] | undefined;
  onClose: () => void;
  onDetails: () => void;
}) {
  const presentation = presentEvent(event);
  return (
    <View style={styles.preview} accessibilityLiveRegion="polite">
      <Pressable onPress={onClose} accessibilityRole="button">
        <Text style={styles.close}>Close preview</Text>
      </Pressable>
      <Text style={styles.chip}>{presentation.category}</Text>
      <Text style={styles.previewTitle} accessibilityRole="header">
        {event.title}
      </Text>
      <Text style={styles.body}>{presentation.dateTime}</Text>
      <Text style={styles.body}>{event.venue.name}</Text>
      <Text style={styles.body}>{presentation.price}</Text>
      {presentation.materialWarning && (
        <Text style={styles.warning}>{presentation.materialWarning}</Text>
      )}
      {searchMatch && (
        <View
          style={styles.matchExplanation}
          accessibilityLabel="Why this event matches"
        >
          <Text style={styles.filterLegend}>
            {searchMatch.matchType === 'exact'
              ? 'Why this matches'
              : 'Why this is an alternative'}
          </Text>
          {searchMatch.reasons.map((reason) => (
            <Text key={reason} style={styles.body}>
              • {reason}
            </Text>
          ))}
          {searchMatch.differences.map((difference) => (
            <Text key={difference} style={styles.warningText}>
              • {difference}
            </Text>
          ))}
        </View>
      )}
      <Pressable
        style={styles.primaryAction}
        onPress={onDetails}
        accessibilityRole="button"
      >
        <Text style={styles.primaryActionText}>View event details</Text>
      </Pressable>
    </View>
  );
}

function DetailsOverlay({
  state,
  onBack,
  onRetry
}: {
  state: Exclude<DetailsState, { kind: 'closed' }>;
  onBack: () => void;
  onRetry: (eventId: string) => void;
}) {
  return (
    <View style={styles.detailsOverlay} accessibilityViewIsModal>
      <Pressable onPress={onBack} accessibilityRole="button">
        <Text style={styles.back}>← Back to map</Text>
      </Pressable>
      {state.kind === 'loading' && (
        <View style={styles.centered} accessibilityLiveRegion="polite">
          <ActivityIndicator color="#76f0a8" />
          <Text style={styles.body}>Loading event details…</Text>
        </View>
      )}
      {state.kind === 'error' && (
        <View style={styles.centered} accessibilityLiveRegion="assertive">
          <Text style={styles.warning}>
            Event details could not be loaded. Your map context is preserved.
          </Text>
          <Pressable
            style={styles.primaryAction}
            onPress={() => onRetry(state.eventId)}
            accessibilityRole="button"
          >
            <Text style={styles.primaryActionText}>Retry details</Text>
          </Pressable>
        </View>
      )}
      {state.kind === 'success' && <EventDetails event={state.event} />}
    </View>
  );
}

function EventDetails({ event }: { event: PublicEvent }) {
  const presentation = presentEvent(event);
  return (
    <ScrollView contentContainerStyle={styles.detailsContent}>
      <Text style={styles.eyebrow}>Event Details</Text>
      <Text style={styles.detailsTitle} accessibilityRole="header">
        {event.title}
      </Text>
      <Text style={styles.meta}>
        {presentation.status} · {presentation.category}
      </Text>
      {presentation.materialWarning && (
        <Text style={styles.warning}>{presentation.materialWarning}</Text>
      )}
      <Detail label="Date and time" value={presentation.dateTime} />
      <Detail label="Venue" value={event.venue.name} />
      <Detail label="Address" value={event.venue.address} />
      <Detail label="Price" value={presentation.price} />
      <Detail label="Description" value={presentation.description} />
      <Detail label="Organizer" value={presentation.organizer} />
      <Detail
        label="Known access information"
        value={event.accessInformation}
      />
      <Detail label="Source" value={event.source.name} />
      <Detail
        label="Trust"
        value={`${presentation.trust} · ${presentation.location}`}
      />
      <Detail label="Verification" value={presentation.freshness} />
      {presentation.externalAction ? (
        <Pressable
          style={styles.primaryAction}
          onPress={() =>
            void Linking.openURL(`${API_BASE_URL}/events/${event.id}/external`)
          }
          accessibilityRole="link"
          accessibilityHint="Opens the identified external destination outside Pulso"
        >
          <Text style={styles.primaryActionText}>
            {presentation.externalAction} — external destination
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.warning}>{presentation.externalUnavailable}</Text>
      )}
      <Text style={styles.meta}>
        Pulso does not book, charge, store tickets, route, or create an
        itinerary.
      </Text>
    </ScrollView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow} accessible>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.body}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#07191b' },
  header: { paddingHorizontal: 20, paddingVertical: 16 },
  eyebrow: {
    color: '#76f0a8',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase'
  },
  title: { color: '#f5fcf8', fontSize: 32, fontWeight: '700' },
  mapShell: { flex: 1, margin: 12, borderRadius: 16, overflow: 'hidden' },
  map: { flex: 1 },
  marker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: 'white',
    backgroundColor: '#ff4f71'
  },
  status: {
    position: 'absolute',
    left: 12,
    right: 64,
    top: 344,
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#07191bee'
  },
  statusText: { color: '#f5fcf8', flexShrink: 1 },
  filterControls: {
    position: 'absolute',
    left: 12,
    right: 58,
    top: 12,
    gap: 6
  },
  searchPanel: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: MOBILE_SEARCH_PANEL_LAYOUT.top,
    maxHeight: MOBILE_SEARCH_PANEL_LAYOUT.expandedMaxHeight,
    borderColor: '#527579',
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: MOBILE_SEARCH_PANEL_LAYOUT.backgroundColor,
    padding: 10,
    zIndex: MOBILE_SEARCH_PANEL_LAYOUT.layer,
    elevation: MOBILE_SEARCH_PANEL_LAYOUT.layer
  },
  searchPanelCollapsed: {
    maxHeight: MOBILE_SEARCH_PANEL_LAYOUT.collapsedMaxHeight,
    borderWidth: 0,
    backgroundColor: 'transparent',
    padding: 0
  },
  searchToggle: {
    alignSelf: 'flex-end',
    minHeight: 44,
    justifyContent: 'center',
    borderColor: '#76f0a8',
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: '#07191bf5',
    paddingHorizontal: 12,
    marginBottom: 6
  },
  searchLabel: { color: '#76f0a8', fontWeight: '700' },
  searchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 6
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    borderColor: '#527579',
    borderRadius: 8,
    borderWidth: 1,
    color: '#f5fcf8',
    paddingHorizontal: 10
  },
  searchButton: {
    minHeight: 44,
    justifyContent: 'center',
    borderColor: '#76f0a8',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12
  },
  searchHelp: { color: '#a8c5c8', fontSize: 11, marginTop: 5 },
  searchPanelContent: {
    maxHeight: MOBILE_SEARCH_PANEL_LAYOUT.contentMaxHeight
  },
  searchProgress: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 6
  },
  searchInterpretation: { marginTop: 4 },
  searchHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  searchResultTitle: { color: '#f5fcf8', fontSize: 18, fontWeight: '700' },
  searchConstraint: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8
  },
  searchResults: { gap: 6, paddingBottom: 6 },
  filterButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    borderColor: '#76f0a8',
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: '#07191bf5',
    paddingHorizontal: 12
  },
  filterButtonText: { color: '#f5fcf8', fontWeight: '700' },
  defaultFilter: {
    alignSelf: 'flex-start',
    color: '#c6d9da',
    backgroundColor: '#07191bee',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  activeFilters: { gap: 6 },
  filterChip: {
    minHeight: 36,
    justifyContent: 'center',
    borderColor: '#76f0a8',
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: '#07191bf5',
    paddingHorizontal: 9
  },
  filterChipText: { color: '#76f0a8', fontSize: 12, fontWeight: '700' },
  filterNotice: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    color: '#f5fcf8',
    backgroundColor: '#07191bee',
    borderRadius: 10,
    padding: 10
  },
  filterOverlay: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 66,
    bottom: 10,
    zIndex: 20,
    elevation: 20,
    borderColor: '#527579',
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#07191bfa',
    padding: 14
  },
  filterHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  filterTitle: { color: '#f5fcf8', fontSize: 24, fontWeight: '700' },
  filterContent: { gap: 8, paddingBottom: 28 },
  filterLegend: {
    color: '#76f0a8',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 14
  },
  filterHelp: { color: '#a8c5c8' },
  filterChoice: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 44,
    gap: 10
  },
  filterChoiceIndicator: { color: '#76f0a8', fontSize: 20 },
  customDates: { gap: 6 },
  dateInput: {
    minHeight: 44,
    borderColor: '#527579',
    borderRadius: 8,
    borderWidth: 1,
    color: '#f5fcf8',
    paddingHorizontal: 10
  },
  clearAll: {
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
    borderColor: '#76f0a8',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 16
  },
  markerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  markerAction: {
    alignSelf: 'flex-start',
    borderColor: '#76f0a8',
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: '100%',
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  markerActionText: { color: '#76f0a8', fontWeight: '700' },
  link: { color: '#76f0a8', fontWeight: '700' },
  preview: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#07191bf5',
    zIndex: 30,
    elevation: 30
  },
  close: { color: '#76f0a8', textAlign: 'right' },
  chip: {
    color: '#76f0a8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  previewTitle: { color: '#f5fcf8', fontSize: 20, fontWeight: '700' },
  body: { color: '#f5fcf8', marginTop: 3 },
  meta: { color: '#a8c5c8', marginTop: 8 },
  warning: {
    color: '#fff1dc',
    backgroundColor: '#332616',
    borderLeftColor: '#ffbd69',
    borderLeftWidth: 4,
    marginTop: 10,
    padding: 10
  },
  warningText: { color: '#ffbd69', marginTop: 4 },
  matchExplanation: {
    borderTopColor: '#315256',
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 4
  },
  primaryAction: {
    alignSelf: 'flex-start',
    backgroundColor: '#76f0a8',
    borderRadius: 10,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  primaryActionText: { color: '#07191b', fontWeight: '700' },
  detailsOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    backgroundColor: '#0d2528',
    padding: 18,
    zIndex: 40,
    elevation: 40
  },
  back: { color: '#76f0a8', fontSize: 16, fontWeight: '700', marginBottom: 10 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  detailsContent: { paddingBottom: 36 },
  detailsTitle: { color: '#f5fcf8', fontSize: 30, fontWeight: '700' },
  detailRow: { marginTop: 14 },
  detailLabel: {
    color: '#a8c5c8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase'
  }
});
