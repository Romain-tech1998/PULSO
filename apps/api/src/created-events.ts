import {
  createdEventResponseSchema,
  createEventRequestSchema,
  geocodeResponseSchema,
  myEventsResponseSchema,
  updateEventRequestSchema
} from '@pulso/contracts';
import type { AuthRepository, EventRepository } from '@pulso/database';
import { DirectoryVenueCannotHideAddressError } from '@pulso/database';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';
import { savePhotoUpload, STILL_IMAGE_MIME_TYPES } from './photo-upload.js';

const eventParamsSchema = z.object({ id: z.uuid() });
const geocodeQuerySchema = z.object({ address: z.string().min(4).max(300) });
const pinRequestSchema = z.object({ pinned: z.boolean() });

/**
 * DEC-0022 §6. Withholding is only meaningful for an address the organizer
 * typed themselves; a venue already in the directory published its own long
 * ago. Refused with a reason rather than silently downgraded to 'public',
 * which would leave the organizer believing an address was hidden.
 */
function sendDirectoryVenueRefusal(reply: FastifyReply) {
  return reply.status(400).send({
    error: {
      code: 'DIRECTORY_VENUE_ADDRESS_PUBLIC',
      message:
        'The address of a venue already listed in Pulso cannot be withheld. Type the address instead of choosing an existing venue.'
    }
  });
}

/**
 * DEC-0017: an account can publish an event.
 *
 * The origin (`verified_organizer` vs `community`) is decided in the
 * repository from whether the account holds a `venue_organizers` row for the
 * chosen venue. The client never sends it - a caller can only turn out to be
 * a verified organizer, it cannot claim to be one.
 */
export function registerCreatedEventsRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  eventRepository: EventRepository,
  uploadDir: string,
  publicUploadUrl: string,
  fetchImpl: typeof fetch = fetch
) {
  app.get('/me/events', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    return myEventsResponseSchema.parse({
      data: await eventRepository.listCreatedEvents(user.id)
    });
  });

  // DEC-0017 v1.1: a typed address resolved to real coordinates. Kept here
  // rather than importing @pulso/ingestion's batch enrichment - the API has
  // no reason to depend on the whole ingestion package (and its connector
  // dependencies) for one interactive lookup.
  app.get('/me/events/geocode', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { address } = geocodeQuerySchema.parse(request.query);
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', address.replace(/;/g, ','));
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'ca');
    let results: Array<{ lat?: string; lon?: string; display_name?: string }>;
    try {
      const response = await fetchImpl(url.toString(), {
        headers: { 'User-Agent': 'Pulso/1.0 (montreal event directory)' }
      });
      if (!response.ok) return geocodeResponseSchema.parse({ data: null });
      results = await response.json();
    } catch {
      // A geocoder outage must not read as "this address does not exist".
      // Publication stays blocked either way rather than falling back to a
      // guessed pin, but the client can tell the two apart and retry.
      return reply.status(503).send({
        error: {
          code: 'GEOCODER_UNAVAILABLE',
          message: 'The address could not be checked right now.'
        }
      });
    }
    const first = results[0];
    const latitude = Number(first?.lat);
    const longitude = Number(first?.lon);
    if (
      !first?.display_name ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return geocodeResponseSchema.parse({ data: null });
    }
    return geocodeResponseSchema.parse({
      data: { longitude, latitude, label: first.display_name }
    });
  });

  app.put('/me/events/:id', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = eventParamsSchema.parse(request.params);
    const input = updateEventRequestSchema.parse(request.body);
    let updated;
    try {
      updated = await eventRepository.updateCreatedEvent(user.id, id, {
        ...input,
        ticketingUrl: input.ticketingUrl,
        addressDisclosure: input.addressDisclosure ?? 'public',
        isAfter: input.isAfter ?? false,
        price:
          input.price.kind === 'paid'
            ? { kind: 'paid', minimumAmount: input.price.minimumAmount }
            : { kind: input.price.kind }
      });
    } catch (error) {
      if (error instanceof DirectoryVenueCannotHideAddressError)
        return sendDirectoryVenueRefusal(reply);
      throw error;
    }
    if (!updated) {
      return reply.status(404).send({
        error: { code: 'EVENT_NOT_FOUND', message: 'The event was not found.' }
      });
    }
    return createdEventResponseSchema.parse({ data: updated });
  });

  // Same local-disk storage as DEC-0012 v1.2's event photos - no cloud
  // object store introduced while Pulso is pre-deployment.
  app.post('/me/events/:id/cover', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = eventParamsSchema.parse(request.params);
    // The narrower allow-list is passed explicitly: a cover is rendered at
    // card size in every listing, so it stays still images only. Adopting
    // the shared helper also fixes an oversized upload, which used to reach
    // an unguarded toBuffer() and answer 500 instead of 413.
    const upload = await savePhotoUpload(
      await request.file(),
      reply,
      uploadDir,
      'event-covers',
      STILL_IMAGE_MIME_TYPES
    );
    if (!upload.ok) return upload.reply;
    const relativePath = upload.filePath;
    const applied = await eventRepository.setCreatedEventImage(
      user.id,
      id,
      `${publicUploadUrl}/${relativePath}`
    );
    if (!applied) {
      // Written before ownership was known; remove the orphan rather than
      // leaving a file for an event the caller does not own.
      await unlink(join(uploadDir, relativePath)).catch(() => {});
      return reply.status(404).send({
        error: { code: 'EVENT_NOT_FOUND', message: 'The event was not found.' }
      });
    }
    return reply
      .status(201)
      .send({ data: { imageUrl: `${publicUploadUrl}/${relativePath}` } });
  });
  app.post('/me/events', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const input = createEventRequestSchema.parse(request.body);

    if (new Date(input.startsAt).getTime() <= Date.now()) {
      return reply.status(400).send({
        error: {
          code: 'EVENT_STARTS_IN_PAST',
          message: 'An event must start in the future.'
        }
      });
    }
    if (input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) {
      return reply.status(400).send({
        error: {
          code: 'EVENT_ENDS_BEFORE_START',
          message: 'An event must end after it starts.'
        }
      });
    }

    let created;
    try {
      created = await eventRepository.createEvent(user.id, {
        title: input.title,
        category: input.category,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        accessInformation: input.accessInformation,
        description: input.description,
        imageUrl: input.imageUrl,
        ticketingUrl: input.ticketingUrl,
        addressDisclosure: input.addressDisclosure ?? 'public',
        isAfter: input.isAfter ?? false,
        price:
          input.price.kind === 'paid'
            ? { kind: 'paid', minimumAmount: input.price.minimumAmount }
            : { kind: input.price.kind },
        venue: input.venue
      });
    } catch (error) {
      if (error instanceof DirectoryVenueCannotHideAddressError)
        return sendDirectoryVenueRefusal(reply);
      throw error;
    }
    return reply
      .status(201)
      .send(createdEventResponseSchema.parse({ data: created }));
  });

  app.post('/me/events/:id/pin', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = eventParamsSchema.parse(request.params);
    const { pinned } = pinRequestSchema.parse(request.body);
    const applied = await eventRepository.setCreatedEventPinned(
      user.id,
      id,
      pinned
    );
    if (!applied) {
      return reply.status(404).send({
        error: { code: 'EVENT_NOT_FOUND', message: 'The event was not found.' }
      });
    }
    return reply.status(204).send();
  });

  app.delete('/me/events/:id', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = eventParamsSchema.parse(request.params);
    const deleted = await eventRepository.deleteCreatedEvent(user.id, id);
    // 404 rather than 403 when it belongs to someone else: the caller has no
    // business learning that this id exists.
    if (!deleted) {
      return reply.status(404).send({
        error: {
          code: 'EVENT_NOT_FOUND',
          message: 'The event was not found.'
        }
      });
    }
    return reply.status(204).send();
  });
}
