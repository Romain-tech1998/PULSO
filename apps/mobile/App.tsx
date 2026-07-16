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
  PRICE_FILTER_OPTIONS,
  presentEvent,
  summarizeActiveFilters,
  type PublicEvent
} from '@pulso/contracts';
import {
  DEFAULT_DISCOVERY_FILTERS,
  getMontrealCalendarDate,
  type DiscoveryFilters,
  type EventCategory
} from '@pulso/domain';
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
  const filtersRef = useRef<DiscoveryFilters>({
    ...DEFAULT_DISCOVERY_FILTERS,
    categories: []
  });
  const [filters, setFilters] = useState(filtersRef.current);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterNotice, setFilterNotice] = useState<string>();

  const loadEvents = useCallback(
    async (
      nextBounds: readonly [number, number, number, number],
      activeFilters = filtersRef.current
    ) => {
      setBounds(nextBounds);
      setState('loading');
      try {
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
      }
    },
    []
  );

  useEffect(() => {
    void loadEvents(initialBounds);
  }, [loadEvents]);

  function applyFilters(nextFilters: DiscoveryFilters) {
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
              'No events match the active filters in this map area.'}
            {state === 'error' &&
              'Events could not be loaded. Your map context is preserved.'}
          </Text>
          {(state === 'empty' || state === 'error') && (
            <Pressable
              onPress={() =>
                state === 'empty'
                  ? applyFilters({
                      ...DEFAULT_DISCOVERY_FILTERS,
                      categories: []
                    })
                  : void loadEvents(bounds)
              }
              accessibilityRole="button"
              accessibilityLabel={
                state === 'empty' ? 'Clear all filters' : 'Retry loading events'
              }
            >
              <Text style={styles.link}>
                {state === 'empty' ? 'Clear all filters' : 'Retry'}
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
          />
        )}
        {selected && details.kind === 'closed' && (
          <EventPreview
            event={selected}
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
  onClose
}: {
  filters: DiscoveryFilters;
  onChange: (filters: DiscoveryFilters) => void;
  onClose: () => void;
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
          onPress={() =>
            onChange({ ...DEFAULT_DISCOVERY_FILTERS, categories: [] })
          }
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
  onClose,
  onDetails
}: {
  event: PublicEvent;
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
    top: 82,
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
    zIndex: 10,
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
    backgroundColor: '#07191bf5'
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
    padding: 18
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
