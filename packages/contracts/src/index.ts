import {
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  FRESHNESS_STATES,
  LOCATION_CONFIDENCE_STATES,
  TRUST_LABELS
} from '@pulso/domain';
import { z } from 'zod';

export const geographicPointSchema = z.object({
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90)
});

export const mapBoundsQuerySchema = z
  .object({
    west: z.coerce.number().min(-180).max(180),
    south: z.coerce.number().min(-90).max(90),
    east: z.coerce.number().min(-180).max(180),
    north: z.coerce.number().min(-90).max(90)
  })
  .refine(
    (bounds) => bounds.west < bounds.east && bounds.south < bounds.north,
    {
      message: 'Bounds must have increasing west/east and south/north values.'
    }
  );

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
