import {
  DATE_FILTER_VALUES,
  DEFAULT_DISCOVERY_FILTERS,
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  FRESHNESS_STATES,
  LOCATION_CONFIDENCE_STATES,
  PRICE_FILTER_VALUES,
  TRUST_LABELS
} from '@pulso/domain';
import type { DiscoveryFilters, EventCategory, MapBounds } from '@pulso/domain';
import { z } from 'zod';

export const geographicPointSchema = z.object({
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90)
});

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year!, month! - 1, day!));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() + 1 === month &&
      date.getUTCDate() === day
    );
  }, 'The selected Montréal calendar date is invalid.');
const categoryListQuerySchema = z
  .string()
  .min(1)
  .transform((value) => value.split(','))
  .pipe(z.array(z.enum(EVENT_CATEGORIES)).min(1))
  .refine((values) => new Set(values).size === values.length, {
    message: 'Categories must not contain duplicates.'
  });

export const mapBoundsQuerySchema = z
  .object({
    west: z.coerce.number().min(-180).max(180),
    south: z.coerce.number().min(-90).max(90),
    east: z.coerce.number().min(-180).max(180),
    north: z.coerce.number().min(-90).max(90),
    date: z.enum(DATE_FILTER_VALUES).default('next7'),
    categories: categoryListQuerySchema.optional().default([]),
    price: z.enum(PRICE_FILTER_VALUES).default('all'),
    dateStart: dateStringSchema.optional(),
    dateEnd: dateStringSchema.optional()
  })
  .strict()
  .refine(
    (bounds) => bounds.west < bounds.east && bounds.south < bounds.north,
    {
      message: 'Bounds must have increasing west/east and south/north values.'
    }
  )
  .superRefine((query, context) => {
    if (query.date === 'custom' && !query.dateStart) {
      context.addIssue({
        code: 'custom',
        path: ['dateStart'],
        message: 'A selected date is required for a custom date filter.'
      });
    }
    if (query.date !== 'custom' && (query.dateStart || query.dateEnd)) {
      context.addIssue({
        code: 'custom',
        path: ['dateStart'],
        message: 'Selected dates are valid only with the custom date filter.'
      });
    }
    if (query.dateStart && query.dateEnd && query.dateEnd < query.dateStart) {
      context.addIssue({
        code: 'custom',
        path: ['dateEnd'],
        message: 'The selected date range must end on or after it starts.'
      });
    }
  });

export const directDistanceQuerySchema = z.object({
  longitude: z.coerce.number().min(-180).max(180),
  latitude: z.coerce.number().min(-90).max(90),
  radiusMeters: z.coerce.number().positive().max(50_000)
});

export const publicEventSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  category: z.enum(EVENT_CATEGORIES),
  status: z.enum(EVENT_STATUSES),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().optional(),
  timezone: z.literal('America/Toronto'),
  price: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('free'), currency: z.literal('CAD') }),
    z.object({
      kind: z.literal('paid'),
      currency: z.literal('CAD'),
      minimumAmount: z.number().nonnegative().optional()
    }),
    z.object({ kind: z.literal('unknown'), currency: z.literal('CAD') })
  ]),
  description: z.string().min(1).optional(),
  organizer: z.string().min(1).optional(),
  accessInformation: z.string().min(1),
  venue: z.object({
    id: z.uuid(),
    name: z.string().min(1),
    address: z.string().min(1),
    point: geographicPointSchema
  }),
  source: z.object({
    name: z.string().min(1),
    url: z.url(),
    observedAt: z.iso.datetime()
  }),
  trust: z.object({
    label: z.enum(TRUST_LABELS),
    freshness: z.enum(FRESHNESS_STATES),
    locationConfidence: z.enum(LOCATION_CONFIDENCE_STATES)
  }),
  externalDestination: z
    .object({
      label: z.string().min(1),
      kind: z.enum(['event_source', 'ticketing']),
      status: z.enum(['available', 'unavailable'])
    })
    .optional(),
  distanceMeters: z.number().nonnegative().optional()
});

export const eventListResponseSchema = z.object({
  data: z.array(publicEventSchema)
});
export const eventDetailsResponseSchema = z.object({ data: publicEventSchema });
export const errorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() })
});

export type PublicEvent = z.infer<typeof publicEventSchema>;
export type EventListResponse = z.infer<typeof eventListResponseSchema>;
export type EventDetailsResponse = z.infer<typeof eventDetailsResponseSchema>;
export type MapBoundsQuery = z.infer<typeof mapBoundsQuerySchema>;
export type DirectDistanceQuery = z.infer<typeof directDistanceQuerySchema>;

export const DATE_FILTER_OPTIONS = [
  { value: 'next7', label: 'Next 7 days' },
  { value: 'tonight', label: 'Tonight' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'weekend', label: 'This weekend' },
  { value: 'custom', label: 'Selected date or range' }
] as const;

export const CATEGORY_FILTER_OPTIONS: ReadonlyArray<{
  value: EventCategory;
  label: string;
}> = [
  { value: 'music', label: 'Music / concerts' },
  {
    value: 'nightlife',
    label: 'Nightlife / DJ / club / qualifying bar events'
  },
  { value: 'festival', label: 'Festivals / festive events' },
  { value: 'show', label: 'Shows' },
  { value: 'comedy', label: 'Comedy' },
  { value: 'other', label: 'Other qualifying scheduled events' }
];

export const PRICE_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'free', label: 'Free' },
  { value: 'paid', label: 'Paid' }
] as const;

export function buildMapEventsQuery(
  bounds: MapBounds,
  filters: DiscoveryFilters
): string {
  const parameters = new URLSearchParams({
    west: String(bounds.west),
    south: String(bounds.south),
    east: String(bounds.east),
    north: String(bounds.north),
    date: filters.date,
    price: filters.price
  });
  if (filters.categories.length > 0) {
    parameters.set('categories', filters.categories.join(','));
  }
  if (filters.date === 'custom' && filters.customStartDate) {
    parameters.set('dateStart', filters.customStartDate);
    if (filters.customEndDate) {
      parameters.set('dateEnd', filters.customEndDate);
    }
  }
  return parameters.toString();
}

export interface ActiveFilterSummary {
  key: 'date' | 'category' | 'price';
  value: string;
  label: string;
}

export function summarizeActiveFilters(
  filters: DiscoveryFilters
): ActiveFilterSummary[] {
  const summary: ActiveFilterSummary[] = [];
  if (filters.date !== DEFAULT_DISCOVERY_FILTERS.date) {
    const dateLabel = DATE_FILTER_OPTIONS.find(
      ({ value }) => value === filters.date
    )!.label;
    const selectedRange =
      filters.date === 'custom' && filters.customStartDate
        ? filters.customEndDate &&
          filters.customEndDate !== filters.customStartDate
          ? `: ${filters.customStartDate} to ${filters.customEndDate}`
          : `: ${filters.customStartDate}`
        : '';
    summary.push({
      key: 'date',
      value: filters.date,
      label: `${dateLabel}${selectedRange}`
    });
  }
  for (const category of filters.categories) {
    summary.push({
      key: 'category',
      value: category,
      label: CATEGORY_FILTER_OPTIONS.find(({ value }) => value === category)!
        .label
    });
  }
  if (filters.price !== DEFAULT_DISCOVERY_FILTERS.price) {
    summary.push({
      key: 'price',
      value: filters.price,
      label: PRICE_FILTER_OPTIONS.find(({ value }) => value === filters.price)!
        .label
    });
  }
  return summary;
}

const CATEGORY_LABELS: Record<PublicEvent['category'], string> = {
  music: 'Music / concerts',
  nightlife: 'Nightlife / DJ / club',
  festival: 'Festivals / festive events',
  show: 'Shows',
  comedy: 'Comedy',
  other: 'Other scheduled event'
};

const STATUS_LABELS: Record<PublicEvent['status'], string> = {
  scheduled: 'Scheduled',
  cancelled: 'Cancelled',
  postponed: 'Postponed'
};

const TRUST_LABEL_TEXT: Record<PublicEvent['trust']['label'], string> = {
  confirmed: 'Confirmed',
  probable: 'Probable',
  to_verify: 'To verify',
  conflicting: 'Conflicting'
};

export interface EventPresentation {
  category: string;
  status: string;
  dateTime: string;
  price: string;
  trust: string;
  freshness: string;
  location: string;
  description: string;
  organizer: string;
  externalAction?: string;
  externalUnavailable: string;
  materialWarning?: string;
}

export function presentEvent(event: PublicEvent): EventPresentation {
  const startsAt = new Intl.DateTimeFormat('en-CA', {
    timeZone: event.timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(new Date(event.startsAt));
  const price =
    event.price.kind === 'free'
      ? 'Free'
      : event.price.kind === 'unknown'
        ? 'Price unknown'
        : event.price.minimumAmount === undefined
          ? 'Paid — price not confirmed'
          : `From ${new Intl.NumberFormat('en-CA', {
              style: 'currency',
              currency: event.price.currency
            }).format(event.price.minimumAmount)}`;
  const trust = TRUST_LABEL_TEXT[event.trust.label];
  const materialWarning =
    event.status === 'cancelled'
      ? 'This event is cancelled.'
      : event.status === 'postponed'
        ? 'This event is postponed. Check the known schedule before leaving.'
        : event.trust.label === 'to_verify'
          ? 'Some event information is not confirmed.'
          : event.trust.label === 'conflicting'
            ? 'Sources disagree about this event.'
            : event.trust.locationConfidence === 'uncertain'
              ? 'The event location is uncertain.'
              : undefined;
  const externalAvailable =
    event.status !== 'cancelled' &&
    event.externalDestination?.status === 'available'
      ? `Open ${event.externalDestination.label}`
      : undefined;

  return {
    category: CATEGORY_LABELS[event.category],
    status: STATUS_LABELS[event.status],
    dateTime: startsAt,
    price,
    trust,
    freshness:
      event.trust.freshness === 'stale'
        ? `Information may be stale. Last checked ${new Intl.DateTimeFormat(
            'en-CA',
            { timeZone: event.timezone, dateStyle: 'medium' }
          ).format(new Date(event.source.observedAt))}.`
        : `Last checked ${new Intl.DateTimeFormat('en-CA', {
            timeZone: event.timezone,
            dateStyle: 'medium'
          }).format(
            new Date(event.source.observedAt)
          )}. No freshness claim is made without an approved policy.`,
    location:
      event.trust.locationConfidence === 'confirmed'
        ? 'Location confirmed'
        : 'Location not confirmed',
    description: event.description ?? 'Description unknown',
    organizer: event.organizer ?? 'Organizer unknown',
    externalUnavailable:
      event.status === 'cancelled'
        ? 'The external event or ticket-source action is unavailable because this event is cancelled.'
        : 'No external destination is currently available. Use the known access information above.',
    ...(externalAvailable ? { externalAction: externalAvailable } : {}),
    ...(materialWarning ? { materialWarning } : {})
  };
}
