'use client';

import {
  buildMapEventsQuery,
  CATEGORY_FILTER_OPTIONS,
  DATE_FILTER_OPTIONS,
  eventDetailsResponseSchema,
  eventListResponseSchema,
  PRICE_FILTER_OPTIONS,
  summarizeActiveFilters,
  type PublicEvent
} from '@pulso/contracts';
import {
  DEFAULT_DISCOVERY_FILTERS,
  getMontrealCalendarDate,
  type DiscoveryFilters,
  type EventCategory,
  type MapBounds
} from '@pulso/domain';
import maplibregl from 'maplibre-gl';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject
} from 'react';

import { eventDetailsFields, eventPreviewFields } from './event-view-model';

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

function boundsUrl(bounds: MapBounds, filters: DiscoveryFilters): string {
  return `${API_BASE_URL}/events?${buildMapEventsQuery(bounds, filters)}`;
}

export function ExploreMap() {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const currentBounds = useRef(INITIAL_BOUNDS);
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

  const loadEvents = useCallback(
    async (
      bounds = currentBounds.current,
      activeFilters = filtersRef.current
    ) => {
      currentBounds.current = bounds;
      setState('loading');
      try {
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
      }
    },
    []
  );

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
    void loadEvents(currentBounds.current, nextFilters);
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
      button.setAttribute('aria-label', `Preview ${event.title}`);
      button.addEventListener('click', () => setSelected(event));
      return new maplibregl.Marker({ element: button })
        .setLngLat([event.venue.point.longitude, event.venue.point.latitude])
        .addTo(map.current!);
    });
  }, [events]);

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
    <>
      <section
        className="map-shell"
        aria-label="Montréal event map"
        hidden={showingDetails}
        data-map-context="preserved"
      >
        <div ref={container} className="map" />
        <div className="filter-controls">
          <button
            type="button"
            className="filter-trigger"
            aria-expanded={filtersOpen}
            aria-controls="map-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            Filters ({summarizeActiveFilters(filters).length})
          </button>
          <ActiveFilters filters={filters} onChange={applyFilters} />
        </div>
        {filtersOpen && (
          <FilterOverlay
            filters={filters}
            onChange={applyFilters}
            onClose={() => setFiltersOpen(false)}
          />
        )}
        <div className={`status status-${state}`} role="status">
          {state === 'loading' && 'Loading events…'}
          {state === 'empty' && (
            <>
              No events match the active filters in this map area.
              <button
                type="button"
                onClick={() =>
                  applyFilters({
                    ...DEFAULT_DISCOVERY_FILTERS,
                    categories: []
                  })
                }
              >
                Clear all filters
              </button>
            </>
          )}
          {state === 'error' && (
            <>
              Events could not be loaded. Your map context is preserved.
              <button type="button" onClick={() => void loadEvents()}>
                Retry
              </button>
            </>
          )}
          {state === 'success' &&
            `${events.length} matching fictional event${events.length === 1 ? '' : 's'} in this map area.`}
        </div>
        {filterNotice && (
          <p className="filter-notice" role="status">
            {filterNotice}
          </p>
        )}
        {selected && (
          <EventPreview
            event={selected}
            detailsButton={detailsButton}
            onClose={() => setSelected(undefined)}
            onDetails={() => void openDetails(selected.id)}
          />
        )}
      </section>

      {details.kind === 'loading' && (
        <section className="details-screen" aria-label="Event Details">
          <button type="button" className="back-button" onClick={returnToMap}>
            ← Back to map
          </button>
          <p role="status">Loading event details…</p>
        </section>
      )}

      {details.kind === 'error' && (
        <section className="details-screen" aria-label="Event Details">
          <button type="button" className="back-button" onClick={returnToMap}>
            ← Back to map
          </button>
          <p role="alert">
            Event details could not be loaded. Your map context is preserved.
          </p>
          <button
            type="button"
            onClick={() => void openDetails(details.eventId)}
          >
            Retry details
          </button>
        </section>
      )}

      {details.kind === 'success' && (
        <EventDetails
          event={details.event}
          headingRef={detailsHeading}
          onBack={returnToMap}
        />
      )}
    </>
  );
}

function ActiveFilters({
  filters,
  onChange
}: {
  filters: DiscoveryFilters;
  onChange: (filters: DiscoveryFilters) => void;
}) {
  const summary = summarizeActiveFilters(filters);
  if (summary.length === 0) {
    return (
      <span className="default-filter">Next 7 days · current map area</span>
    );
  }
  return (
    <div className="active-filters" aria-label="Active filters">
      {summary.map((item) => (
        <button
          type="button"
          key={`${item.key}-${item.value}`}
          aria-label={`Clear ${item.label} filter`}
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
    <aside id="map-filters" className="filter-overlay" aria-label="Map filters">
      <div className="filter-heading">
        <h2>Filters</h2>
        <button type="button" onClick={onClose}>
          Close filters
        </button>
      </div>
      <fieldset>
        <legend>Date and time</legend>
        {DATE_FILTER_OPTIONS.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name="date-filter"
              value={option.value}
              checked={filters.date === option.value}
              onChange={() => setDate(option.value)}
            />
            {option.label}
          </label>
        ))}
        {filters.date === 'custom' && (
          <div className="date-range">
            <label>
              Start date
              <input
                type="date"
                value={filters.customStartDate ?? today}
                onChange={(event) =>
                  applyCustomDate(filters, onChange, event.target.value, true)
                }
              />
            </label>
            <label>
              End date
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
        <legend>Categories</legend>
        <p className="filter-help">Multiple categories match with OR.</p>
        {CATEGORY_FILTER_OPTIONS.map((option) => (
          <label key={option.value}>
            <input
              type="checkbox"
              checked={filters.categories.includes(option.value)}
              onChange={() => toggleCategory(option.value)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Price</legend>
        {PRICE_FILTER_OPTIONS.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name="price-filter"
              value={option.value}
              checked={filters.price === option.value}
              onChange={() => onChange({ ...filters, price: option.value })}
            />
            {option.label}
          </label>
        ))}
        <p className="filter-help">Unknown prices appear only under All.</p>
      </fieldset>
      <dl className="fixed-filter-rules">
        <div>
          <dt>Geography</dt>
          <dd>
            Current visible map area. Distance is not applied because no
            reference location was supplied; no routing or implicit location.
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>Upcoming and postponed events; cancelled events are excluded.</dd>
        </div>
      </dl>
      <button
        type="button"
        className="clear-all"
        onClick={() =>
          onChange({ ...DEFAULT_DISCOVERY_FILTERS, categories: [] })
        }
      >
        Clear all filters
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
  detailsButton,
  onClose,
  onDetails
}: {
  event: PublicEvent;
  detailsButton: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onDetails: () => void;
}) {
  const fields = eventPreviewFields(event);
  return (
    <article className="preview" aria-live="polite">
      <button type="button" className="close-button" onClick={onClose}>
        Close preview
      </button>
      <p className="chip">{fields.category}</p>
      <h2>{fields.title}</h2>
      <dl className="preview-fields">
        <div>
          <dt>When</dt>
          <dd>{fields.dateTime}</dd>
        </div>
        <div>
          <dt>Venue</dt>
          <dd>{fields.venue}</dd>
        </div>
        <div>
          <dt>Price</dt>
          <dd>{fields.price}</dd>
        </div>
      </dl>
      {fields.warning && <p className="warning">{fields.warning}</p>}
      <button
        ref={detailsButton}
        type="button"
        className="primary-action"
        onClick={onDetails}
      >
        View event details
      </button>
    </article>
  );
}

function EventDetails({
  event,
  headingRef,
  onBack
}: {
  event: PublicEvent;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
}) {
  const { presentation } = eventDetailsFields(event);
  const externalHref = `${API_BASE_URL}/events/${event.id}/external`;
  return (
    <section className="details-screen" aria-label="Event Details">
      <button type="button" className="back-button" onClick={onBack}>
        ← Back to map
      </button>
      <p className="eyebrow">Event Details</p>
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
          <dt>Date and time</dt>
          <dd>{presentation.dateTime}</dd>
        </div>
        <div>
          <dt>Venue</dt>
          <dd>{event.venue.name}</dd>
        </div>
        <div>
          <dt>Address</dt>
          <dd>{event.venue.address}</dd>
        </div>
        <div>
          <dt>Price</dt>
          <dd>{presentation.price}</dd>
        </div>
        <div>
          <dt>Description</dt>
          <dd>{presentation.description}</dd>
        </div>
        <div>
          <dt>Organizer</dt>
          <dd>{presentation.organizer}</dd>
        </div>
        <div>
          <dt>Known access information</dt>
          <dd>{event.accessInformation}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{event.source.name}</dd>
        </div>
        <div>
          <dt>Trust</dt>
          <dd>
            {presentation.trust} · {presentation.location}
          </dd>
        </div>
        <div>
          <dt>Verification</dt>
          <dd>{presentation.freshness}</dd>
        </div>
      </dl>
      {presentation.externalAction ? (
        <a className="primary-action" href={externalHref}>
          {presentation.externalAction} — external destination
        </a>
      ) : (
        <p className="unavailable" role="status">
          {presentation.externalUnavailable}
        </p>
      )}
      <p className="external-note">
        Pulso does not book, charge, store tickets, route, or create an
        itinerary.
      </p>
    </section>
  );
}
