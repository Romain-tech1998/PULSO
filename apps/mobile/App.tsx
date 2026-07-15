import {
  Camera,
  Map,
  Marker,
  type StyleSpecification
} from '@maplibre/maplibre-react-native';
import {
  eventDetailsResponseSchema,
  eventListResponseSchema,
  presentEvent,
  type PublicEvent
} from '@pulso/contracts';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
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

function eventUrl(bounds: readonly [number, number, number, number]) {
  const [west, south, east, north] = bounds;
  return `${API_BASE_URL}/events?west=${west}&south=${south}&east=${east}&north=${north}`;
}

export default function App() {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [selected, setSelected] = useState<PublicEvent>();
  const [state, setState] = useState<LoadState>('loading');
  const [bounds, setBounds] =
    useState<readonly [number, number, number, number]>(initialBounds);
  const [details, setDetails] = useState<DetailsState>({ kind: 'closed' });

  const loadEvents = useCallback(
    async (nextBounds: readonly [number, number, number, number]) => {
      setBounds(nextBounds);
      setState('loading');
      try {
        const response = await fetch(eventUrl(nextBounds));
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
        <View style={styles.status} accessibilityLiveRegion="polite">
          {state === 'loading' && <ActivityIndicator color="#76f0a8" />}
          <Text style={styles.statusText}>
            {state === 'loading' && 'Loading events…'}
            {state === 'success' &&
              `${events.length} fictional event${events.length === 1 ? '' : 's'} visible in the rolling seven-day window.`}
            {state === 'empty' &&
              'No eligible events are visible in this map area for the next seven Montréal calendar days.'}
            {state === 'error' &&
              'Events could not be loaded. Your map context is preserved.'}
          </Text>
          {(state === 'empty' || state === 'error') && (
            <Pressable
              onPress={() => void loadEvents(bounds)}
              accessibilityRole="button"
              accessibilityLabel="Retry loading events"
            >
              <Text style={styles.link}>Retry</Text>
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
    top: 12,
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#07191bee'
  },
  statusText: { color: '#f5fcf8', flexShrink: 1 },
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
