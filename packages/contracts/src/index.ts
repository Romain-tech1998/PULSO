import {
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  FRESHNESS_STATES,
  LOCATION_CONFIDENCE_STATES
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
    freshness: z.enum(FRESHNESS_STATES),
    locationConfidence: z.enum(LOCATION_CONFIDENCE_STATES)
  }),
  distanceMeters: z.number().nonnegative().optional()
});

export const eventListResponseSchema = z.object({
  data: z.array(publicEventSchema)
});
export const errorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() })
});

export type PublicEvent = z.infer<typeof publicEventSchema>;
export type EventListResponse = z.infer<typeof eventListResponseSchema>;
export type MapBoundsQuery = z.infer<typeof mapBoundsQuerySchema>;
export type DirectDistanceQuery = z.infer<typeof directDistanceQuerySchema>;
