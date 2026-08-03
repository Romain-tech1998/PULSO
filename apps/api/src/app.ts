import {
  directDistanceQuerySchema,
  eventDetailsResponseSchema,
  eventIdsQuerySchema,
  eventListResponseSchema,
  intelligentSearchRequestSchema,
  intelligentSearchResponseSchema,
  mapBoundsQuerySchema,
  venueListResponseSchema,
  venuesQuerySchema
} from '@pulso/contracts';
import type { MapBoundsQuery, SearchMessage } from '@pulso/contracts';
import type {
  AttendanceRepository,
  AuthRepository,
  EventPhotosRepository,
  EventRepository,
  FavoritesRepository,
  ForumRepository,
  FriendsRepository,
  GroupsRepository,
  MessagesRepository,
  ProfileRepository,
  RatingsRepository,
  ReportsRepository,
  TrendsRepository
} from '@pulso/database';
import {
  createFilteredDiscoveryWindow,
  type DiscoveryFilters
} from '@pulso/domain';
import {
  interpretDeterministicSearch,
  rankAndExplainEvents
} from '@pulso/search';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { z, ZodError } from 'zod';

import { registerAuthRoutes, type GoogleAuthConfig } from './auth.js';
import { registerEventPhotosRoutes } from './event-photos.js';
import { registerForumRoutes } from './forum.js';
import { registerGroupsRoutes } from './groups.js';
import { registerMessagesRoutes } from './messages.js';
import { registerProfileRoutes } from './profile.js';
import { registerRatingsRoutes } from './ratings.js';
import { registerReportsRoutes } from './reports.js';
import { registerSocialRoutes } from './social.js';

const MAX_PHOTO_UPLOAD_BYTES = 8 * 1024 * 1024;

const eventParamsSchema = z.object({ id: z.uuid() });

export function buildApp(
  repository: EventRepository,
  options: {
    logger?: boolean;
    now?: () => Date;
    // Both absent (the common case in dev/test without Google credentials
    // configured) simply means the account layer is unavailable - every
    // other route works identically either way, per DEC-0007/MVP-0001's
    // "account stays optional" principle.
    authRepository?: AuthRepository;
    favoritesRepository?: FavoritesRepository;
    trendsRepository?: TrendsRepository;
    friendsRepository?: FriendsRepository;
    attendanceRepository?: AttendanceRepository;
    forumRepository?: ForumRepository;
    messagesRepository?: MessagesRepository;
    reportsRepository?: ReportsRepository;
    groupsRepository?: GroupsRepository;
    profileRepository?: ProfileRepository;
    eventPhotosRepository?: EventPhotosRepository;
    ratingsRepository?: RatingsRepository;
    // Where uploaded photo files live on disk, and the base URL the API
    // serves them back from (see the /uploads static mount below) - local
    // disk rather than a cloud object store, matching the project's
    // current pre-deployment stage (DEC-0012 v1.2).
    uploadDir?: string;
    publicUploadUrl?: string;
    google?: GoogleAuthConfig;
  } = {}
) {
  const app = Fastify({ logger: options.logger ?? false });

  if (options.uploadDir) {
    app.register(fastifyMultipart, {
      limits: { fileSize: MAX_PHOTO_UPLOAD_BYTES }
    });
    app.register(fastifyStatic, {
      root: options.uploadDir,
      prefix: '/uploads/'
    });
  }

  if (
    options.authRepository &&
    options.favoritesRepository &&
    options.trendsRepository &&
    options.friendsRepository &&
    options.attendanceRepository &&
    options.forumRepository &&
    options.messagesRepository &&
    options.reportsRepository &&
    options.groupsRepository &&
    options.profileRepository &&
    options.eventPhotosRepository &&
    options.ratingsRepository &&
    options.uploadDir &&
    options.publicUploadUrl &&
    options.google
  ) {
    registerAuthRoutes(
      app,
      options.authRepository,
      options.favoritesRepository,
      options.trendsRepository,
      options.google
    );
    registerSocialRoutes(
      app,
      options.authRepository,
      options.friendsRepository,
      options.attendanceRepository,
      options.profileRepository
    );
    registerForumRoutes(
      app,
      options.authRepository,
      options.forumRepository,
      options.favoritesRepository,
      options.attendanceRepository,
      repository
    );
    registerMessagesRoutes(
      app,
      options.authRepository,
      options.messagesRepository
    );
    registerReportsRoutes(
      app,
      options.authRepository,
      options.reportsRepository
    );
    registerGroupsRoutes(
      app,
      options.authRepository,
      options.groupsRepository,
      repository
    );
    registerProfileRoutes(
      app,
      options.authRepository,
      options.profileRepository
    );
    registerEventPhotosRoutes(
      app,
      options.authRepository,
      options.eventPhotosRepository,
      options.uploadDir,
      options.publicUploadUrl
    );
    registerRatingsRoutes(
      app,
      options.authRepository,
      options.ratingsRepository
    );
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_REQUEST',
          message: 'The request parameters are invalid.'
        }
      });
    }
    request.log.error(error);
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The request could not be completed.'
      }
    });
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('access-control-allow-origin', '*');
    reply.header(
      'access-control-allow-methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    );
    reply.header('access-control-allow-headers', 'content-type, authorization');
    return payload;
  });

  app.options('/search', async (_request, reply) => reply.status(204).send());
  // A browser preflights any cross-origin request carrying an Authorization
  // header, regardless of method - a wildcard catch-all covers every
  // account-scoped route (current and future) instead of one OPTIONS
  // handler per route.
  app.options('/*', async (_request, reply) => reply.status(204).send());

  app.get('/events', async (request) => {
    const query = mapBoundsQuerySchema.parse(request.query);
    return eventListResponseSchema.parse({
      data: await repository.findInBounds(
        query,
        createFilteredDiscoveryWindow(options.now?.() ?? new Date(), {
          date: query.date,
          ...(query.dateStart ? { customStartDate: query.dateStart } : {}),
          ...(query.dateEnd ? { customEndDate: query.dateEnd } : {})
        })
      )
    });
  });

  app.post('/search', async (request) => {
    const search = intelligentSearchRequestSchema.parse(request.body);
    const interpreted = interpretDeterministicSearch(
      search.query,
      search.disabledDerivedKeys,
      search.locale
    );
    const manualFilters = normalizeDiscoveryFilters(search.manualFilters);
    const effectiveFilters: DiscoveryFilters = {
      ...manualFilters,
      ...(interpreted.derivedFilters.date
        ? { date: interpreted.derivedFilters.date }
        : {}),
      ...(interpreted.derivedFilters.categories
        ? {
            categories: [
              ...new Set([
                ...manualFilters.categories,
                ...interpreted.derivedFilters.categories
              ])
            ]
          }
        : {}),
      ...(interpreted.derivedFilters.price
        ? { price: interpreted.derivedFilters.price }
        : {})
    };
    if (effectiveFilters.date !== 'custom') {
      delete effectiveFilters.customStartDate;
      delete effectiveFilters.customEndDate;
    }

    const responseBase = {
      interpretation: {
        engine: 'deterministic' as const,
        language: interpreted.language,
        constraints: interpreted.constraints,
        rankingSignals: interpreted.rankingSignals,
        effectiveFilters
      }
    };
    if (interpreted.resolution === 'clarification') {
      return intelligentSearchResponseSchema.parse({
        ...responseBase,
        condition: 'clarification',
        message: { code: 'search.message.clarificationRequired' },
        clarification: interpreted.clarification,
        data: []
      });
    }
    if (interpreted.resolution === 'no_reliable_result') {
      return intelligentSearchResponseSchema.parse({
        ...responseBase,
        condition: 'no_reliable_result',
        message: interpreted.message,
        data: []
      });
    }

    const boundsQuery = toMapBoundsQuery(search.bounds, effectiveFilters);
    const now = options.now?.() ?? new Date();
    const window = createFilteredDiscoveryWindow(now, effectiveFilters);
    const exactEvents = await repository.findInBounds(boundsQuery, window, {
      excludedCategories: interpreted.excludedCategories
    });
    if (exactEvents.length > 0) {
      return intelligentSearchResponseSchema.parse({
        ...responseBase,
        condition: 'exact',
        message: {
          code: 'search.message.exactCount',
          params: { count: exactEvents.length }
        },
        data: rankAndExplainEvents(exactEvents, interpreted, 'exact')
      });
    }

    const alternative = await findExplainedAlternative(
      repository,
      search.bounds,
      manualFilters,
      effectiveFilters,
      interpreted,
      now
    );
    if (alternative) {
      return intelligentSearchResponseSchema.parse({
        ...responseBase,
        condition: 'alternative',
        message: { code: 'search.message.alternative' },
        data: rankAndExplainEvents(
          alternative.events,
          interpreted,
          'alternative',
          alternative.differences
        )
      });
    }

    return intelligentSearchResponseSchema.parse({
      ...responseBase,
      condition: 'no_reliable_result',
      message: { code: 'search.message.noReliableResult' },
      data: []
    });
  });

  app.get('/events/:id', async (request, reply) => {
    const { id } = eventParamsSchema.parse(request.params);
    const event = await repository.findById(id);
    if (!event) {
      return reply.status(404).send({
        error: { code: 'EVENT_NOT_FOUND', message: 'The event was not found.' }
      });
    }
    return eventDetailsResponseSchema.parse({ data: event });
  });

  app.get('/events/:id/external', async (request, reply) => {
    const { id } = eventParamsSchema.parse(request.params);
    const destination = await repository.findExternalDestination(id);
    if (
      !destination ||
      destination.status !== 'available' ||
      destination.eventStatus === 'cancelled'
    ) {
      return reply.status(409).send({
        error: {
          code: 'DESTINATION_UNAVAILABLE',
          message: 'The external destination is currently unavailable.'
        }
      });
    }
    const url = new URL(destination.url);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return reply.status(409).send({
        error: {
          code: 'DESTINATION_UNAVAILABLE',
          message: 'The external destination is currently unavailable.'
        }
      });
    }
    return reply.redirect(url.toString());
  });

  app.get('/events/near', async (request) => {
    const query = directDistanceQuerySchema.parse(request.query);
    return eventListResponseSchema.parse({
      data: await repository.findWithinDirectDistance(query)
    });
  });

  app.get('/events/by-ids', async (request) => {
    const query = eventIdsQuerySchema.parse(request.query);
    return eventListResponseSchema.parse({
      data: await repository.findByIds(query.ids)
    });
  });

  app.get('/venues', async (request) => {
    const query = venuesQuerySchema.parse(request.query);
    return venueListResponseSchema.parse({
      data: await repository.findVenuesWithoutUpcomingEvents(query)
    });
  });

  return app;
}

function normalizeDiscoveryFilters(filters: {
  date: DiscoveryFilters['date'];
  categories: DiscoveryFilters['categories'];
  price: DiscoveryFilters['price'];
  customStartDate?: string | undefined;
  customEndDate?: string | undefined;
}): DiscoveryFilters {
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

function toMapBoundsQuery(
  bounds: { west: number; south: number; east: number; north: number },
  filters: DiscoveryFilters
): MapBoundsQuery {
  return {
    ...bounds,
    date: filters.date,
    categories: filters.categories,
    price: filters.price,
    ...(filters.customStartDate ? { dateStart: filters.customStartDate } : {}),
    ...(filters.customEndDate ? { dateEnd: filters.customEndDate } : {})
  };
}

async function findExplainedAlternative(
  repository: EventRepository,
  bounds: { west: number; south: number; east: number; north: number },
  manualFilters: DiscoveryFilters,
  effectiveFilters: DiscoveryFilters,
  interpreted: ReturnType<typeof interpretDeterministicSearch>,
  now: Date
): Promise<
  | {
      events: Awaited<ReturnType<EventRepository['findInBounds']>>;
      differences: SearchMessage[];
    }
  | undefined
> {
  const plans: Array<{
    filters: DiscoveryFilters;
    excludedCategories: typeof interpreted.excludedCategories;
    differences: SearchMessage[];
  }> = [];
  if (interpreted.derivedFilters.price) {
    plans.push({
      filters: { ...effectiveFilters, price: manualFilters.price },
      excludedCategories: interpreted.excludedCategories,
      differences: [
        {
          code: 'search.difference.price',
          params: { price: interpreted.derivedFilters.price }
        }
      ]
    });
  }
  if (interpreted.derivedFilters.categories?.length) {
    plans.push({
      filters: { ...effectiveFilters, categories: manualFilters.categories },
      excludedCategories: interpreted.excludedCategories,
      differences: [{ code: 'search.difference.category' }]
    });
  }
  if (interpreted.excludedCategories.length > 0) {
    plans.push({
      filters: effectiveFilters,
      excludedCategories: [],
      differences: [{ code: 'search.difference.excludedCategory' }]
    });
  }
  for (const plan of plans) {
    const events = await repository.findInBounds(
      toMapBoundsQuery(bounds, plan.filters),
      createFilteredDiscoveryWindow(now, plan.filters),
      { excludedCategories: plan.excludedCategories }
    );
    if (events.length > 0) return { events, differences: plan.differences };
  }
  return undefined;
}
