import {
  Camera,
  Map,
  Marker,
  type StyleSpecification
} from '@maplibre/maplibre-react-native';
import { eventListResponseSchema, type PublicEvent } from '@pulso/contracts';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View
} from 'react-native';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.0.2.2:3001';
const center: [number, number] = [-73.5673, 45.5017];
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

export default function App() {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [selected, setSelected] = useState<PublicEvent>();
  const [state, setState] = useState<'loading' | 'success' | 'empty' | 'error'>(
    'loading'
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `${API_BASE_URL}/events?west=-73.75&south=45.4&east=-73.4&north=45.7`,
      {
        signal: controller.signal
      }
    )
      .then(async (response) => {
        if (!response.ok) throw new Error('Event API unavailable');
        return eventListResponseSchema.parse(await response.json());
      })
      .then((result) => {
        setEvents(result.data);
        setState(result.data.length === 0 ? 'empty' : 'success');
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setState('error');
      });
    return () => controller.abort();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Pulso technical slice</Text>
        <Text style={styles.title}>Explore Montréal</Text>
      </View>
      <View style={styles.mapShell}>
        <Map style={styles.map} mapStyle={localStyle}>
          <Camera initialViewState={{ center, zoom: 11 }} />
          {events.map((event) => (
            <Marker
              id={event.id}
              key={event.id}
              lngLat={[event.venue.point.longitude, event.venue.point.latitude]}
              onPress={() => setSelected(event)}
            >
              <View style={styles.marker} />
            </Marker>
          ))}
        </Map>
        <View style={styles.status}>
          {state === 'loading' && <ActivityIndicator color="#76f0a8" />}
          <Text style={styles.statusText}>
            {state === 'loading' && 'Loading events…'}
            {state === 'success' && `${events.length} synthetic event visible.`}
            {state === 'empty' && 'No synthetic events are visible.'}
            {state === 'error' && 'The local event API is unavailable.'}
          </Text>
        </View>
        {selected && (
          <View style={styles.preview}>
            <Pressable
              onPress={() => setSelected(undefined)}
              accessibilityRole="button"
            >
              <Text style={styles.close}>Close</Text>
            </Pressable>
            <Text style={styles.previewTitle}>{selected.title}</Text>
            <Text style={styles.body}>{selected.venue.name}</Text>
            <Text style={styles.body}>{selected.venue.address}</Text>
            <Text style={styles.meta}>
              {selected.trust.freshness} · {selected.trust.locationConfidence}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
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
    top: 12,
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#07191bee'
  },
  statusText: { color: '#f5fcf8' },
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
  previewTitle: { color: '#f5fcf8', fontSize: 20, fontWeight: '700' },
  body: { color: '#f5fcf8' },
  meta: { color: '#a8c5c8', marginTop: 6 }
});
