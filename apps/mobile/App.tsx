import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
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
  CATEGORY_COLORS,
  type DiscoveryFilters,
  type EventCategory
} from '@pulso/domain';
import {
  getCategoryLabel,
  getDateFilterLabel,
  getPriceLabel,
  localizeSearchMessage,
  translate,
  type SupportedLocale
} from '@pulso/domain/localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MOBILE_SEARCH_PANEL_LAYOUT } from './search-layout';
import { loadMobileLocale, persistMobileLocale } from './locale';
import { getLocales } from 'expo-localization';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { theme } from './theme';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Share
} from 'react-native';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.0.2.2:3001';
const center: [number, number] = [-73.5673, 45.5017];
const initialBounds = [-73.75, 45.4, -73.4, 45.7] as const;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mobileBrandLogo = require('./assets/brand/pulso-logo-horizontal-dark.png');
const MAP_STYLE_URL =
  process.env.EXPO_PUBLIC_MAP_STYLE_URL ??
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

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

function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);
  useEffect(() => {
    AsyncStorage.getItem('pulso-favorites').then((stored) => {
      if (stored) {
        try {
          setFavorites(JSON.parse(stored));
        } catch (err) {
          console.warn('Failed to parse favorites', err);
        }
      }
    });
  }, []);
  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      void AsyncStorage.setItem('pulso-favorites', JSON.stringify(next));
      return next;
    });
  };
  return { favorites, toggleFavorite };
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
  const [fontsLoaded] = useFonts({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    'Satoshi-Regular': require('./assets/fonts/satoshi/Satoshi-Regular.otf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    'Satoshi-Medium': require('./assets/fonts/satoshi/Satoshi-Medium.otf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    'Satoshi-Bold': require('./assets/fonts/satoshi/Satoshi-Bold.otf')
  });
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
  const localeRef = useRef<SupportedLocale>('fr');
  const [locale, setLocale] = useState<SupportedLocale>();
  const { favorites, toggleFavorite } = useFavorites();
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  useEffect(() => {
    void loadMobileLocale(
      getLocales().map(({ languageTag }) => languageTag),
      AsyncStorage
    ).then((resolved) => {
      localeRef.current = resolved;
      setLocale(resolved);
    });
  }, []);

  function selectLocale(nextLocale: SupportedLocale) {
    localeRef.current = nextLocale;
    setLocale(nextLocale);
    void persistMobileLocale(nextLocale, AsyncStorage);
  }

  const loadEvents = useCallback(
    async (
      nextBounds: readonly [number, number, number, number],
      activeFilters = filtersRef.current
    ) => {
      setBounds(nextBounds);
      setState('loading');
      setSearchError(false);

      // Stale-While-Revalidate : Charger le cache instantanément
      try {
        const cached = await AsyncStorage.getItem('pulso-offline-events');
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
          const [west, south, east, north] = nextBounds;
          const response = await fetch(`${API_BASE_URL}/search`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              query: activeSearch.current.query,
              locale: localeRef.current,
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
          void AsyncStorage.setItem('pulso-offline-events', JSON.stringify(foundEvents));
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
        void AsyncStorage.setItem('pulso-offline-events', JSON.stringify(result.data));
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

  // Deep linking listener
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      const match = url.match(/eventId=([^&]+)/) || url.match(/\/events\/([^/?]+)/);
      if (match && match[1]) {
        void openDetails(match[1]);
      }
    };
    Linking.getInitialURL().then(handleUrl).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, []);

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
    setFilterNotice(translate(localeRef.current, 'search.previewClosed'));
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

  if (!fontsLoaded || !locale) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered} accessibilityLiveRegion="polite">
          <ActivityIndicator color={theme.pink} />
          <Text style={styles.body}>{translate('fr', 'map.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Image
              source={mobileBrandLogo}
              style={styles.brandLogo}
              resizeMode="contain"
              accessibilityLabel={translate(locale, 'app.title')}
            />
            <Text style={styles.eyebrow}>
              {translate(locale, 'app.eyebrow')}
            </Text>
          </View>
          <MobileLanguageSelector locale={locale} onChange={selectLocale} />
        </View>
      </View>
      <View
        style={styles.mapShell}
        accessibilityLabel={translate(locale, 'map.label')}
      >
        <Map
          style={styles.map}
          mapStyle={MAP_STYLE_URL}
          onRegionDidChange={({ nativeEvent }) => {
            if (!nativeEvent.userInteraction) return;
            void loadEvents(nativeEvent.bounds);
          }}
        >
          <Camera initialViewState={{ center, zoom: 11 }} />
          {events
            .filter((event) =>
              showFavoritesOnly ? favorites.includes(event.id) : true
            )
            .map((event) => (
              <Marker
                id={event.id}
                key={event.id}
                lngLat={[event.venue.point.longitude, event.venue.point.latitude]}
                onPress={() => setSelected(event)}
                accessible
                accessibilityRole="button"
                accessibilityLabel={translate(locale, 'map.previewAria', {
                  title: event.title
                })}
              >
                <View
                  style={[
                    styles.marker,
                    {
                      backgroundColor:
                        CATEGORY_COLORS[event.category] ?? CATEGORY_COLORS.other,
                      transform: [
                        { scale: selected?.id === event.id ? 1.3 : 1 }
                      ]
                    }
                  ]}
                />
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
          locale={locale}
        />
        <View style={styles.filterControls}>
          <Pressable
            style={styles.filterButton}
            onPress={() => setFiltersOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: filtersOpen }}
            accessibilityLabel={translate(locale, 'filters.triggerAria', {
              count: summarizeActiveFilters(filters, locale).length
            })}
          >
            <Text style={styles.filterButtonText}>
              {translate(locale, 'filters.trigger', {
                count: summarizeActiveFilters(filters, locale).length
              })}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.favoriteTrigger,
              showFavoritesOnly && styles.favoriteTriggerActive
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: showFavoritesOnly }}
            onPress={() => setShowFavoritesOnly(!showFavoritesOnly)}
          >
            <Text
              style={[
                styles.filterButtonText,
                showFavoritesOnly && styles.favoriteTriggerTextActive
              ]}
            >
              {translate(
                locale,
                showFavoritesOnly
                  ? 'favorites.showFavoritesOnly'
                  : 'favorites.showAll'
              )}
            </Text>
          </Pressable>
          <MobileActiveFilters
            filters={filters}
            onChange={applyFilters}
            locale={locale}
          />
        </View>
        <View style={styles.status} accessibilityLiveRegion="polite">
          {state === 'loading' && <ActivityIndicator color={theme.pink} />}
          <Text style={styles.statusText}>
            {state === 'loading' && translate(locale, 'map.loading')}
            {state === 'success' &&
              translate(
                locale,
                events.length === 1 ? 'map.count.one' : 'map.count.many',
                { count: events.length }
              )}
            {state === 'empty' &&
              (searchResult
                ? localizeSearchMessage(locale, searchResult.message)
                : translate(locale, 'map.empty'))}
            {state === 'error' && translate(locale, 'map.error')}
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
                    ? translate(locale, 'search.clearSearch')
                    : translate(locale, 'filters.clearAll')
                  : translate(locale, 'common.retry')
              }
            >
              <Text style={styles.link}>
                {state === 'empty'
                  ? searchResult
                    ? translate(locale, 'search.clearSearch')
                    : translate(locale, 'filters.clearAll')
                  : translate(locale, 'common.retry')}
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
                  accessibilityLabel={translate(locale, 'map.previewAria', {
                    title: event.title
                  })}
                  style={styles.markerAction}
                >
                  <Text style={styles.markerActionText} numberOfLines={1}>
                    {translate(locale, 'map.previewButton', {
                      title: event.title
                    })}
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
            locale={locale}
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
            isFavorite={favorites.includes(selected.id)}
            onToggleFavorite={() => toggleFavorite(selected.id)}
            locale={locale}
          />
        )}
        {details.kind !== 'closed' && (
          <DetailsOverlay
            state={details}
            onBack={() => setDetails({ kind: 'closed' })}
            onRetry={openDetails}
            isFavorite={
              details.kind === 'success'
                ? favorites.includes(details.event.id)
                : false
            }
            onToggleFavorite={
              details.kind === 'success'
                ? () => toggleFavorite(details.event.id)
                : () => {}
            }
            locale={locale}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function MobileLanguageSelector({
  locale,
  onChange
}: {
  locale: SupportedLocale;
  onChange: (locale: SupportedLocale) => void;
}) {
  return (
    <View
      style={styles.languageSelector}
      accessible
      accessibilityLabel={translate(locale, 'language.label')}
    >
      {(['fr', 'en'] as const).map((value) => (
        <Pressable
          key={value}
          style={[
            styles.languageChoice,
            locale === value && styles.languageChoiceActive
          ]}
          accessibilityRole="radio"
          accessibilityState={{ checked: locale === value }}
          onPress={() => onChange(value)}
        >
          <Text style={styles.languageChoiceText}>
            {translate(locale, `language.${value}`)}
          </Text>
        </Pressable>
      ))}
    </View>
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
    <View
      style={styles.searchPanel}
      accessibilityLabel={translate(locale, 'search.panelAria')}
      pointerEvents="box-none"
    >
      <View style={styles.searchPanelContent}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={query}
            maxLength={240}
            placeholder={translate(locale, 'search.placeholder')}
            placeholderTextColor={theme.textMuted}
            accessibilityLabel={translate(locale, 'search.question')}
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
            <Text style={styles.filterButtonText}>
              {translate(locale, 'search.submit')}
            </Text>
          </Pressable>
        </View>

        {(processing || error || result) && (
        <ScrollView
          style={styles.searchDropdown}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          {processing && (
            <View
              style={styles.searchProgress}
              accessibilityLiveRegion="polite"
            >
              <ActivityIndicator color={theme.pink} />
              <Text style={styles.body}>
                {translate(locale, 'search.processing')}
              </Text>
            </View>
          )}
          {error && (
            <Text style={styles.warning} accessibilityLiveRegion="assertive">
              {translate(locale, 'search.error')}
            </Text>
          )}
          {result && !processing && (
            <View style={styles.searchInterpretation}>
              <View style={styles.searchHeading}>
                <Text
                  style={styles.searchResultTitle}
                  accessibilityRole="header"
                >
                  {translate(locale, 'search.understood')}
                </Text>
                <Pressable accessibilityRole="button" onPress={onClear}>
                  <Text style={styles.link}>
                    {translate(locale, 'search.clearSearch')}
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.body}>
                {localizeSearchMessage(locale, result.message)}
              </Text>
              {result.clarification && (
                <Text style={styles.warningText}>
                  {translate(locale, 'search.clarificationPrefix', {
                    message: localizeSearchMessage(locale, result.clarification)
                  })}
                </Text>
              )}
              <Text style={styles.filterLegend}>
                {translate(locale, 'search.hardConstraints')}
              </Text>
              {result.interpretation.constraints.map((constraint) => {
                const label = localizeSearchMessage(locale, constraint.message);
                return (
                  <View
                    style={styles.searchConstraint}
                    key={`${constraint.key}-${constraint.message.code}`}
                  >
                    <Text style={styles.body}>{label}</Text>
                    {isSearchConstraintKey(constraint.key) && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={translate(
                          locale,
                          'search.clearConstraint',
                          { label }
                        )}
                        onPress={() =>
                          onClearConstraint(
                            constraint.key as SearchConstraintKey
                          )
                        }
                      >
                        <Text style={styles.link}>
                          {translate(locale, 'search.clear')}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
              {result.interpretation.rankingSignals.length > 0 && (
                <>
                  <Text style={styles.filterLegend}>
                    {translate(locale, 'search.rankingSignals')}
                  </Text>
                  {result.interpretation.rankingSignals.map((signal) => (
                    <Text
                      style={styles.body}
                      key={`${signal.key}-${signal.message.code}`}
                    >
                      • {localizeSearchMessage(locale, signal.message)}
                    </Text>
                  ))}
                </>
              )}
            </View>
          )}
          {result && result.data.length > 0 && (
            <View style={styles.searchResults}>
              <Text style={styles.filterLegend}>
                {translate(locale, 'search.results')}
              </Text>
              {result.data.map(({ event, matchType }, index) => (
                <Pressable
                  key={event.id}
                  style={styles.markerAction}
                  accessibilityRole="button"
                  accessibilityLabel={translate(
                    locale,
                    'search.previewResultAria',
                    {
                      index: index + 1,
                      matchType: translate(locale, `search.match.${matchType}`)
                    }
                  )}
                  onPress={() => onPreview(event)}
                >
                  <Text style={styles.markerActionText}>
                    {translate(locale, 'search.previewResult', {
                      title: event.title,
                      matchType: translate(locale, `search.match.${matchType}`)
                    })}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
        )}
      </View>
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
      <Text style={styles.defaultFilter}>
        {translate(locale, 'filters.default')}
      </Text>
    );
  }
  return (
    <ScrollView horizontal contentContainerStyle={styles.activeFilters}>
      {summary.map((item) => (
        <Pressable
          key={`${item.key}-${item.value}`}
          style={styles.filterChip}
          accessibilityRole="button"
          accessibilityLabel={translate(locale, 'filters.clearAria', {
            label: item.label
          })}
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
    <View style={styles.filterOverlay} accessibilityViewIsModal>
      <View style={styles.filterHeading}>
        <Text style={styles.filterTitle} accessibilityRole="header">
          {translate(locale, 'filters.title')}
        </Text>
        <Pressable accessibilityRole="button" onPress={onClose}>
          <Text style={styles.close}>{translate(locale, 'filters.close')}</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.filterContent}>
        <Text style={styles.filterLegend}>
          {translate(locale, 'filters.dateTime')}
        </Text>
        {DATE_FILTER_OPTIONS.map((option) => (
          <FilterChoice
            key={option.value}
            label={getDateFilterLabel(locale, option.value)}
            selected={filters.date === option.value}
            kind="radio"
            onPress={() => setDate(option.value)}
          />
        ))}
        {filters.date === 'custom' && (
          <View style={styles.customDates}>
            <Text style={styles.detailLabel}>
              {translate(locale, 'filters.startDate')} (YYYY-MM-DD)
            </Text>
            <TextInput
              style={styles.dateInput}
              defaultValue={filters.customStartDate ?? today}
              accessibilityLabel={translate(
                locale,
                'filters.selectedStartDate'
              )}
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
            <Text style={styles.detailLabel}>
              {translate(locale, 'filters.endDate')} (YYYY-MM-DD)
            </Text>
            <TextInput
              style={styles.dateInput}
              defaultValue={
                filters.customEndDate ?? filters.customStartDate ?? today
              }
              accessibilityLabel={translate(locale, 'filters.selectedEndDate')}
              onEndEditing={({ nativeEvent: { text: value } }) => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
                if (value < (filters.customStartDate ?? today)) return;
                onChange({ ...filters, date: 'custom', customEndDate: value });
              }}
            />
          </View>
        )}

        <Text style={styles.filterLegend}>
          {translate(locale, 'filters.categories')}
        </Text>
        <Text style={styles.filterHelp}>
          {translate(locale, 'filters.categoriesHelp')}
        </Text>
        {CATEGORY_FILTER_OPTIONS.map((option) => (
          <FilterChoice
            key={option.value}
            label={getCategoryLabel(locale, option.value)}
            selected={filters.categories.includes(option.value)}
            kind="checkbox"
            onPress={() => toggleCategory(option.value)}
          />
        ))}

        <Text style={styles.filterLegend}>
          {translate(locale, 'filters.price')}
        </Text>
        {PRICE_FILTER_OPTIONS.map((option) => (
          <FilterChoice
            key={option.value}
            label={getPriceLabel(locale, option.value)}
            selected={filters.price === option.value}
            kind="radio"
            onPress={() => onChange({ ...filters, price: option.value })}
          />
        ))}
        <Text style={styles.filterHelp}>
          {translate(locale, 'filters.priceHelp')}
        </Text>

        <Text style={styles.filterLegend}>
          {translate(locale, 'filters.geography')}
        </Text>
        <Text style={styles.filterHelp}>
          {translate(locale, 'filters.geographyHelp')}
        </Text>
        <Text style={styles.filterLegend}>
          {translate(locale, 'filters.status')}
        </Text>
        <Text style={styles.filterHelp}>
          {translate(locale, 'filters.statusHelp')}
        </Text>
        <Pressable
          style={styles.clearAll}
          accessibilityRole="button"
          onPress={onClearAll}
        >
          <Text style={styles.filterButtonText}>
            {translate(locale, 'filters.clearAll')}
          </Text>
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
  onDetails,
  isFavorite,
  onToggleFavorite,
  locale
}: {
  event: PublicEvent;
  searchMatch: IntelligentSearchResponse['data'][number] | undefined;
  onClose: () => void;
  onDetails: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  locale: SupportedLocale;
}) {
  const presentation = presentEvent(event, locale);
  return (
    <View style={styles.preview} accessibilityLiveRegion="polite">
      <View style={styles.previewHeaderActions}>
        <Pressable
          onPress={onToggleFavorite}
          accessibilityRole="button"
          accessibilityState={{ selected: isFavorite }}
          accessibilityLabel={translate(
            locale,
            isFavorite ? 'favorites.remove' : 'favorites.add'
          )}
        >
          <Text style={styles.favoriteButton}>{isFavorite ? '❤️' : '🤍'}</Text>
        </Pressable>
        <Pressable onPress={onClose} accessibilityRole="button">
          <Text style={styles.close}>{translate(locale, 'preview.close')}</Text>
        </Pressable>
      </View>
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
          accessibilityLabel={translate(locale, 'search.whyExact')}
        >
          <Text style={styles.filterLegend}>
            {searchMatch.matchType === 'exact'
              ? translate(locale, 'search.whyExact')
              : translate(locale, 'search.whyAlternative')}
          </Text>
          {searchMatch.reasons.map((reason, index) => (
            <Text key={`${reason.code}-${index}`} style={styles.body}>
              • {localizeSearchMessage(locale, reason)}
            </Text>
          ))}
          {searchMatch.differences.map((difference, index) => (
            <Text
              key={`${difference.code}-${index}`}
              style={styles.warningText}
            >
              • {localizeSearchMessage(locale, difference)}
            </Text>
          ))}
        </View>
      )}
      <Pressable
        style={styles.primaryAction}
        onPress={onDetails}
        accessibilityRole="button"
      >
        <Text style={styles.primaryActionText}>
          {translate(locale, 'preview.details')}
        </Text>
      </Pressable>
    </View>
  );
}

function DetailsOverlay({
  state,
  onBack,
  onRetry,
  isFavorite,
  onToggleFavorite,
  locale
}: {
  state: Exclude<DetailsState, { kind: 'closed' }>;
  onBack: () => void;
  onRetry: (eventId: string) => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  locale: SupportedLocale;
}) {
  return (
    <View style={styles.detailsOverlay} accessibilityViewIsModal>
      <View style={styles.previewHeaderActions}>
        <Pressable onPress={onBack} accessibilityRole="button">
          <Text style={styles.back}>{translate(locale, 'details.back')}</Text>
        </Pressable>
        {state.kind === 'success' && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable
              onPress={() => {
                Share.share({
                  message: `${translate(locale, 'details.shareText', { title: state.event.title })}\nhttps://pulso.app/events/${state.event.id}`,
                  url: `https://pulso.app/events/${state.event.id}`,
                  title: state.event.title
                }).catch(console.warn);
              }}
              accessibilityRole="button"
              accessibilityLabel={translate(locale, 'details.share')}
              style={{ marginRight: 16 }}
            >
              <Text style={styles.favoriteButton}>↗️ {translate(locale, 'details.share')}</Text>
            </Pressable>
            <Pressable
              onPress={onToggleFavorite}
              accessibilityRole="button"
              accessibilityState={{ selected: isFavorite }}
              accessibilityLabel={translate(
                locale,
                isFavorite ? 'favorites.remove' : 'favorites.add'
              )}
            >
              <Text style={styles.favoriteButton}>{isFavorite ? '❤️' : '🤍'}</Text>
            </Pressable>
          </View>
        )}
      </View>
      {state.kind === 'loading' && (
        <View style={styles.centered} accessibilityLiveRegion="polite">
          <ActivityIndicator color={theme.pink} />
          <Text style={styles.body}>
            {translate(locale, 'details.loading')}
          </Text>
        </View>
      )}
      {state.kind === 'error' && (
        <View style={styles.centered} accessibilityLiveRegion="assertive">
          <Text style={styles.warning}>
            {translate(locale, 'details.error')}
          </Text>
          <Pressable
            style={styles.primaryAction}
            onPress={() => onRetry(state.eventId)}
            accessibilityRole="button"
          >
            <Text style={styles.primaryActionText}>
              {translate(locale, 'details.retry')}
            </Text>
          </Pressable>
        </View>
      )}
      {state.kind === 'success' && (
        <EventDetails event={state.event} locale={locale} />
      )}
    </View>
  );
}

function EventDetails({
  event,
  locale
}: {
  event: PublicEvent;
  locale: SupportedLocale;
}) {
  const presentation = presentEvent(event, locale);
  return (
    <ScrollView contentContainerStyle={styles.detailsContent}>
      <Text style={styles.eyebrow}>{translate(locale, 'details.label')}</Text>
      <Text style={styles.detailsTitle} accessibilityRole="header">
        {event.title}
      </Text>
      <Text style={styles.meta}>
        {presentation.status} · {presentation.category}
      </Text>
      {presentation.materialWarning && (
        <Text style={styles.warning}>{presentation.materialWarning}</Text>
      )}
      <Detail
        label={translate(locale, 'details.dateTime')}
        value={presentation.dateTime}
      />
      <Detail
        label={translate(locale, 'details.venue')}
        value={event.venue.name}
      />
      <Detail
        label={translate(locale, 'details.address')}
        value={event.venue.address}
      />
      <Detail
        label={translate(locale, 'details.price')}
        value={presentation.price}
      />
      <Detail
        label={translate(locale, 'details.description')}
        value={presentation.description}
      />
      <Detail
        label={translate(locale, 'details.organizer')}
        value={presentation.organizer}
      />
      <Detail
        label={translate(locale, 'details.access')}
        value={event.accessInformation}
      />
      <Detail
        label={translate(locale, 'details.source')}
        value={event.source.name}
      />
      <Detail
        label={translate(locale, 'details.trust')}
        value={`${presentation.trust} · ${presentation.location}`}
      />
      <Detail
        label={translate(locale, 'details.verification')}
        value={presentation.freshness}
      />
      {presentation.externalAction ? (
        <Pressable
          style={styles.primaryAction}
          onPress={() =>
            void Linking.openURL(`${API_BASE_URL}/events/${event.id}/external`)
          }
          accessibilityRole="link"
          accessibilityHint={translate(locale, 'details.externalHint')}
        >
          <Text style={styles.primaryActionText}>
            {presentation.externalAction} —{' '}
            {translate(locale, 'details.externalSuffix')}
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.warning}>{presentation.externalUnavailable}</Text>
      )}
      <Text style={styles.meta}>
        {translate(locale, 'details.externalNote')}
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
  safeArea: { flex: 1, backgroundColor: theme.background },
  header: { paddingHorizontal: 20, paddingVertical: 16 },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  headerCopy: { flex: 1 },
  languageSelector: {
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    padding: 4
  },
  languageChoice: {
    borderRadius: 6,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 8
  },
  languageChoiceActive: { backgroundColor: theme.elevated },
  languageChoiceText: { color: theme.text, fontWeight: '700' },
  eyebrow: {
    color: theme.pink,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase'
  },
  brandLogo: { height: 34, width: 152, marginBottom: 8 },
  mapShell: { flex: 1, margin: 12, borderRadius: 16, overflow: 'hidden' },
  map: { flex: 1 },
  marker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: theme.pink,
    shadowColor: theme.pink,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 5
  },
  status: {
    position: 'absolute',
    left: 12,
    right: 64,
    top: 344,
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: theme.surfaceOverlay
  },
  statusText: { color: theme.text, flexShrink: 1 },
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
    zIndex: MOBILE_SEARCH_PANEL_LAYOUT.layer,
    elevation: MOBILE_SEARCH_PANEL_LAYOUT.layer
  },
  searchPanelContent: {
    maxHeight: MOBILE_SEARCH_PANEL_LAYOUT.expandedMaxHeight
  },
  searchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    backgroundColor: '#1A1A24',
    borderColor: theme.border,
    borderRadius: 999,
    borderWidth: 1,
    color: theme.text,
    paddingHorizontal: 16
  },
  searchButton: {
    minHeight: 48,
    justifyContent: 'center',
    borderColor: theme.pink,
    backgroundColor: theme.surfaceOverlayStrong,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16
  },
  searchDropdown: {
    borderColor: theme.border,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: MOBILE_SEARCH_PANEL_LAYOUT.backgroundColor,
    padding: 12,
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
  searchResultTitle: { color: theme.text, fontSize: 18, fontWeight: '700' },
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
    borderColor: theme.pink,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: theme.surfaceOverlayStrong,
    paddingHorizontal: 12
  },
  filterButtonText: { color: theme.text, fontWeight: '700' },
  favoriteTrigger: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    borderColor: theme.border,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: theme.surfaceOverlay,
    paddingHorizontal: 12,
    marginLeft: 8
  },
  favoriteTriggerActive: {
    borderColor: theme.pink,
    backgroundColor: 'rgba(212, 83, 126, 0.1)'
  },
  favoriteTriggerTextActive: {
    color: theme.pink
  },
  defaultFilter: {
    alignSelf: 'flex-start',
    color: theme.textMuted,
    backgroundColor: theme.surfaceOverlay,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  activeFilters: { gap: 6 },
  filterChip: {
    minHeight: 36,
    justifyContent: 'center',
    borderColor: theme.pink,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: theme.surfaceOverlayStrong,
    paddingHorizontal: 9
  },
  filterChipText: { color: theme.pink, fontSize: 12, fontWeight: '700' },
  filterNotice: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    color: theme.text,
    backgroundColor: theme.surfaceOverlay,
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
    borderColor: theme.border,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: theme.surfaceOverlayOpaque,
    padding: 14
  },
  filterHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  filterTitle: { color: theme.text, fontSize: 24, fontWeight: '700' },
  filterContent: { gap: 8, paddingBottom: 28 },
  filterLegend: {
    color: theme.pink,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 14
  },
  filterHelp: { color: theme.textMuted },
  filterChoice: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 44,
    gap: 10
  },
  filterChoiceIndicator: { color: theme.pink, fontSize: 20 },
  customDates: { gap: 6 },
  dateInput: {
    minHeight: 44,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.text,
    paddingHorizontal: 10
  },
  clearAll: {
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
    borderColor: theme.pink,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 16
  },
  markerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  markerAction: {
    alignSelf: 'flex-start',
    borderColor: theme.pink,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: '100%',
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  markerActionText: { color: theme.pink, fontWeight: '700' },
  link: { color: theme.pink, fontWeight: '700' },
  preview: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(30, 30, 38, 0.85)',
    zIndex: 30,
    elevation: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  previewHeaderActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  favoriteButton: {
    fontSize: 24
  },
  close: { color: theme.pink, textAlign: 'right', fontWeight: 'bold' },
  chip: {
    color: theme.pink,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  previewTitle: { color: theme.text, fontSize: 20, fontWeight: '700' },
  body: { color: theme.text, marginTop: 3 },
  meta: { color: theme.textMuted, marginTop: 8 },
  warning: {
    color: theme.text,
    backgroundColor: theme.surface,
    borderLeftColor: theme.coral,
    borderLeftWidth: 4,
    marginTop: 10,
    padding: 10
  },
  warningText: { color: theme.coral, marginTop: 4 },
  matchExplanation: {
    borderTopColor: theme.elevated,
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 4
  },
  primaryAction: {
    alignSelf: 'flex-start',
    backgroundColor: theme.pink,
    borderRadius: 999,
    marginTop: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    shadowColor: theme.pink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },
  primaryActionText: { color: theme.background, fontWeight: '800', textAlign: 'center' },
  detailsOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    backgroundColor: theme.surface,
    padding: 18,
    zIndex: 40,
    elevation: 40
  },
  back: {
    color: theme.pink,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  detailsContent: { paddingBottom: 36 },
  detailsTitle: { color: theme.text, fontSize: 30, fontWeight: '700' },
  detailRow: { marginTop: 14 },
  detailLabel: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase'
  }
});
