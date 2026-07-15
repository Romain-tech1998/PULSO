'use client';

import { eventListResponseSchema, type PublicEvent } from '@pulso/contracts';
import maplibregl from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';

const MONTREAL_CENTER: [number, number] = [-73.5673, 45.5017];
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export function ExploreMap() {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [selected, setSelected] = useState<PublicEvent>();
  const [state, setState] = useState<'loading' | 'success' | 'empty' | 'error'>(
    'loading'
  );

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
    map.current = instance;
    return () => {
      markers.current.forEach((marker) => marker.remove());
      instance.remove();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(
          `${API_BASE_URL}/events?west=-73.75&south=45.4&east=-73.4&north=45.7`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error('Event API unavailable');
        const result = eventListResponseSchema.parse(await response.json());
        setEvents(result.data);
        setState(result.data.length === 0 ? 'empty' : 'success');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        setState('error');
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!map.current) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = events.map((event) => {
      const button = document.createElement('button');
      button.className = 'marker';
      button.type = 'button';
      button.setAttribute('aria-label', `Preview ${event.title}`);
      button.addEventListener('click', () => setSelected(event));
      return new maplibregl.Marker({ element: button })
        .setLngLat([event.venue.point.longitude, event.venue.point.latitude])
        .addTo(map.current!);
    });
  }, [events]);

  return (
    <section className="map-shell" aria-label="Montréal event map">
      <div ref={container} className="map" />
      <p className={`status status-${state}`} role="status">
        {state === 'loading' && 'Loading events…'}
        {state === 'empty' &&
          'No synthetic events are visible in these bounds.'}
        {state === 'error' && 'The local event API is unavailable.'}
        {state === 'success' && `${events.length} synthetic event visible.`}
      </p>
      {selected && (
        <article className="preview">
          <button
            type="button"
            onClick={() => setSelected(undefined)}
            aria-label="Close preview"
          >
            ×
          </button>
          <p>{selected.category}</p>
          <h2>{selected.title}</h2>
          <p>{selected.venue.name}</p>
          <p>{selected.venue.address}</p>
          <small>
            {selected.trust.freshness} · {selected.trust.locationConfidence}
          </small>
        </article>
      )}
    </section>
  );
}
