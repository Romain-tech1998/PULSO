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
  EventAccessRepository,
  TicketingRepository,
  EventPhotosRepository,
  UserPhotosRepository,
  ImageModerationRepository,
  EventRepository,
  FavoritesRepository,
  ForumRepository,
  FriendsRepository,
  GroupsRepository,
  MessagesRepository,
  NotificationsRepository,
  OrganizerRepository,
  ProfileRepository,
  RatingsRepository,
  ReportsRepository,
  TrendsRepository
} from '@pulso/database';
import {
  createFilteredDiscoveryWindow,
  type DiscoveryFilters
} from '@pulso/domain';
import type { SupportedLocale } from '@pulso/domain/localization';
import type { LiveVenueCandidate } from '@pulso/ingestion';
import {
  interpretDeterministicSearch,
  interpretIntelligentSearch,
  rankAndExplainEvents,
  refineSearchText,
  type DeterministicInterpretation
} from '@pulso/search';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { z, ZodError } from 'zod';

import {
  registerAuthRoutes,
  resolveBearerUser,
  type GoogleAuthConfig
} from './auth.js';
import { resolveAllowedOrigin, resolveApiConfig } from './config.js';
import { registerCreatedEventsRoutes } from './created-events.js';
import { registerEventAccessRoutes } from './event-access.js';
import { registerTicketingRoutes } from './ticketing.js';
import { registerPaymentsRoutes } from './payments-routes.js';
import type { PaymentProvider } from './payments.js';
import { registerEventPhotosRoutes } from './event-photos.js';
import { registerUserPhotosRoutes } from './user-photos.js';
import type { ImageModerationProvider } from './image-moderation.js';
import { registerImageModerationRoutes } from './image-moderation-routes.js';
import { registerForumRoutes } from './forum.js';
import { registerGroupsRoutes } from './groups.js';
import { registerMessagesRoutes } from './messages.js';
import { registerNotificationsRoutes } from './notifications.js';
import { registerOrganizerRoutes } from './organizer.js';
import { registerProfileRoutes } from './profile.js';
import { registerRatingsRoutes } from './ratings.js';
import { registerReportsRoutes } from './reports.js';
import { registerSocialRoutes } from './social.js';

const MAX_PHOTO_UPLOAD_BYTES = 8 * 1024 * 1024;

const eventParamsSchema = z.object({ id: z.uuid() });

// Enough to pick from without turning the picker into a scrollable directory.
const VENUE_SEARCH_LIMIT = 20;
const venueSearchQuerySchema = z.object({
  // Two characters match half the city, which reads as "Pulso ignored what I
  // typed" rather than as a search.
  query: z.string().trim().min(3).max(120)
});

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
    notificationsRepository?: NotificationsRepository;
    organizerRepository?: OrganizerRepository;
    eventAccessRepository?: EventAccessRepository;
    ticketingRepository?: TicketingRepository;
    // DEC-0022 §1. Absent means this instance does not sell: free ticketing
    // keeps working and a priced type stays unbuyable, which is the correct
    // answer for a deployment with no Stripe keys.
    paymentProvider?: PaymentProvider;
    eventPhotosRepository?: EventPhotosRepository;
    userPhotosRepository?: UserPhotosRepository;
    imageModerationRepository?: ImageModerationRepository;
    // DEC-0021. Injected the same way `interpretQuery` is: the real network
    // call only happens when nothing is supplied, so the test suite never
    // reaches OpenAI. Absent in production too means every upload is
    // flagged for review rather than published unscreened.
    imageModerationProvider?: ImageModerationProvider;
    ratingsRepository?: RatingsRepository;
    // Where uploaded photo files live on disk, and the base URL the API
    // serves them back from (see the /uploads static mount below) - local
    // disk rather than a cloud object store, matching the project's
    // current pre-deployment stage (DEC-0012 v1.2).
    uploadDir?: string;
    publicUploadUrl?: string;
    google?: GoogleAuthConfig;
    // The live venue lookup behind a search that found nothing (see
    // @pulso/ingestion lookup-venue.ts). Injected rather than imported so the
    // test suite never reaches the network, and so a deployment can turn the
    // behaviour off by simply not passing it - search then answers exactly as
    // it did before, which is a real degradation but not a failure.
    lookupVenues?: (text: string) => Promise<LiveVenueCandidate[]>;
    // Stands in for the OpenRouter call. Without it the AI branch is only
    // reachable by holding a live API key, which left the behaviour that
    // depends on what the *model* answered - notably a refusal Pulso has to
    // second-guess - with no test at all.
    interpretQuery?: (
      query: string,
      locale: SupportedLocale
    ) => Promise<DeterministicInterpretation>;
  } = {}
) {
  const app = Fastify({ logger: options.logger ?? false });
  const apiConfig = resolveApiConfig();

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
    options.eventAccessRepository &&
    options.ticketingRepository &&
    options.eventPhotosRepository &&
    options.userPhotosRepository &&
    options.imageModerationRepository &&
    options.ratingsRepository &&
    options.notificationsRepository &&
    options.organizerRepository &&
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
      options.profileRepository,
      options.notificationsRepository
    );
    registerForumRoutes(
      app,
      options.authRepository,
      options.forumRepository,
      options.favoritesRepository,
      options.attendanceRepository,
      repository,
      options.notificationsRepository
    );
    registerMessagesRoutes(
      app,
      options.authRepository,
      options.messagesRepository,
      options.notificationsRepository
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
      repository,
      options.notificationsRepository,
      options.organizerRepository,
      options.uploadDir,
      options.publicUploadUrl
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
    registerUserPhotosRoutes(
      app,
      options.authRepository,
      options.userPhotosRepository,
      options.imageModerationRepository,
      options.uploadDir,
      options.publicUploadUrl,
      options.imageModerationProvider
    );
    registerImageModerationRoutes(
      app,
      options.authRepository,
      options.imageModerationRepository,
      options.organizerRepository,
      options.uploadDir,
      options.publicUploadUrl
    );
    registerRatingsRoutes(
      app,
      options.authRepository,
      options.ratingsRepository
    );
    registerNotificationsRoutes(
      app,
      options.authRepository,
      options.notificationsRepository
    );
    registerOrganizerRoutes(
      app,
      options.authRepository,
      options.organizerRepository,
      options.notificationsRepository,
      repository,
      // The group-verification queue is the same console behind the same
      // is_admin gate, so it lives here rather than in a second admin
      // module with its own copy of the authorization check.
      options.groupsRepository
    );
    registerCreatedEventsRoutes(
      app,
      options.authRepository,
      repository,
      options.uploadDir,
      options.publicUploadUrl
    );
    registerEventAccessRoutes(
      app,
      options.authRepository,
      options.eventAccessRepository,
      repository,
      options.notificationsRepository
    );
    registerTicketingRoutes(
      app,
      options.authRepository,
      options.ticketingRepository,
      apiConfig.ticketSigningSecret,
      apiConfig.applicationFeeBps
    );
    registerPaymentsRoutes(
      app,
      options.authRepository,
      options.ticketingRepository,
      {
        webUrl: apiConfig.webUrl,
        applicationFeeBps: apiConfig.applicationFeeBps,
        checkoutHoldMinutes: apiConfig.checkoutHoldMinutes
      },
      options.paymentProvider
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

  // `*` while everything is on localhost; once the API answers on a public
  // domain it should only answer to Pulso's own front end (config.ts).
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header(
      'access-control-allow-origin',
      resolveAllowedOrigin(apiConfig, request.headers.origin)
    );
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

  // DEC-0017: account-created events are connected-experience only, so this
  // opts in to them exactly when the request carries a valid session. An
  // anonymous caller - including one that passes ?after=true - still gets
  // the sourced directory and nothing else.
  app.get('/events', async (request) => {
    const query = mapBoundsQuerySchema.parse(request.query);
    const viewer = options.authRepository
      ? await resolveBearerUser(request, options.authRepository)
      : undefined;
    const signedIn = Boolean(viewer);
    return eventListResponseSchema.parse({
      data: await repository.findInBounds(
        query,
        createFilteredDiscoveryWindow(options.now?.() ?? new Date(), {
          date: query.date,
          ...(query.dateStart ? { customStartDate: query.dateStart } : {}),
          ...(query.dateEnd ? { customEndDate: query.dateEnd } : {})
        }),
        {
          includeCreated: signedIn,
          after: signedIn && query.after === 'true',
          viewerId: viewer?.id ?? null
        }
      )
    });
  });

  app.post('/search', async (request) => {
    const search = intelligentSearchRequestSchema.parse(request.body);
    // DEC-0022 §6. Search does not opt into created events today, so nothing
    // it returns is withheld - but the reader is resolved anyway rather than
    // hard-coding null, so that turning `includeCreated` on here later is a
    // one-line change instead of a disclosure.
    const viewerId = options.authRepository
      ? ((await resolveBearerUser(request, options.authRepository))?.id ?? null)
      : null;
    let interpreted;
    try {
      if (options.interpretQuery) {
        interpreted = await options.interpretQuery(search.query, search.locale);
      } else {
        if (!process.env.OPENROUTER_API_KEY)
          throw new Error('OPENROUTER_API_KEY is not set');
        interpreted = await interpretIntelligentSearch(
          search.query,
          process.env.OPENROUTER_API_KEY,
          search.locale,
          // Swap models without a code change: any OpenRouter model id works,
          // e.g. PULSO_AI_MODEL=openai/gpt-4o for harder queries. Unset keeps
          // the small default.
          process.env.PULSO_AI_MODEL
            ? { model: process.env.PULSO_AI_MODEL }
            : {}
        );
      }
      // Remove disabled keys if any, to respect manual overrides
      if (search.disabledDerivedKeys.length > 0) {
        for (const key of search.disabledDerivedKeys) {
          if (key === 'date') delete interpreted.derivedFilters.date;
          if (key === 'price') delete interpreted.derivedFilters.price;
          if (key === 'categories')
            delete interpreted.derivedFilters.categories;
          if (key === 'excluded_categories')
            interpreted.excludedCategories = [];
          interpreted.constraints = interpreted.constraints.filter(
            (c) => c.key !== key
          );
        }
      }
    } catch (error) {
      // Logged with the cause: a silent fallback hides an AI search that is
      // failing every single call behind results that still look plausible.
      request.log.warn(
        { err: error },
        'AI search failed or unavailable, falling back to deterministic search'
      );
      interpreted = interpretDeterministicSearch(
        search.query,
        search.disabledDerivedKeys,
        search.locale
      );
    }

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
        engine: interpreted.engine,
        language: interpreted.language,
        constraints: interpreted.constraints,
        rankingSignals: interpreted.rankingSignals,
        effectiveFilters
      },
      ...(interpreted.suggestedLocation
        ? { suggestedLocation: interpreted.suggestedLocation }
        : {}),
      ...(interpreted.suggestedNearMe ? { suggestedNearMe: true } : {})
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
      // "I cannot map this to a date, a price or a category" is not the same
      // claim as "there is nothing to find", and returning here treated them
      // as one - the directory was never asked. Observed live: "clébard"
      // dead-ended while "Clébard" was answered, the same bar found or not
      // found on a capital letter, because the model reads a capitalized word
      // as a proper noun and a lowercase one as vocabulary.
      //
      // So look before concluding there is nothing. The model's judgement is
      // not overridden on a guess: the refusal stands untouched unless the
      // directory actually holds something by that name.
      const residual =
        interpreted.message?.code === 'search.message.unsupported'
          ? refineSearchText(search.query)
          : undefined;
      const rescued = residual
        ? await repository.searchVenues({ text: residual })
        : [];
      if (rescued.length === 0) {
        return intelligentSearchResponseSchema.parse({
          ...responseBase,
          condition: 'no_reliable_result',
          message: interpreted.message,
          data: []
        });
      }
      return intelligentSearchResponseSchema.parse({
        ...responseBase,
        condition: 'exact',
        message: {
          code: 'search.message.exactCount',
          params: { count: rescued.length }
        },
        searchText: residual,
        venues: rescued,
        // Places, not an evening: the query the model could not read as a
        // request for events is not answered with events it never asked for.
        data: []
      });
    }

    // A named neighbourhood changes where the request is about. The client
    // used to fly there only after the server had searched the old viewport,
    // producing the contradictory "Plateau" + "current map area" result.
    const effectiveBounds = interpreted.suggestedLocation
      ? boundsAround(interpreted.suggestedLocation)
      : search.bounds;
    const effectiveNear = interpreted.suggestedLocation
      ? undefined
      : search.near;
    const boundsQuery = toMapBoundsQuery(
      effectiveBounds,
      effectiveFilters,
      effectiveNear
    );
    const now = options.now?.() ?? new Date();

    // A query that named something is answered differently from one that
    // described an evening. It searches the whole directory rather than the
    // visible map - "Centre Bell" means the Centre Bell, not "the Centre Bell
    // if it is currently on screen" - and, when the visitor named no date, it
    // looks further ahead than the seven-day browsing window, since a show
    // three weeks out is still the show they asked for.
    const namedSearch =
      interpreted.searchText !== undefined ||
      (interpreted.venueCategories?.length ?? 0) > 0;
    if (namedSearch) {
      const namedWindow = interpreted.derivedFilters.date
        ? createFilteredDiscoveryWindow(now, effectiveFilters)
        : { startsAt: now, endsAt: addDays(now, NAMED_SEARCH_HORIZON_DAYS) };

      // "bar" on its own is a request for bars, not for whatever happens to
      // be programmed in one. Answering it with 42 events buried the twelve
      // actual bars under them. A kind of place with nothing else attached
      // is therefore answered with places; add a date, a category or a name
      // ("bar ce soir", "bar jazz") and the events come back.
      const venueLedSearch =
        (interpreted.venueCategories?.length ?? 0) > 0 &&
        interpreted.searchText === undefined &&
        Object.keys(interpreted.derivedFilters).length === 0;

      const [namedEvents, namedVenues] = await Promise.all([
        venueLedSearch
          ? Promise.resolve([])
          : repository.searchEvents(
              {
                ...(interpreted.searchText
                  ? { text: interpreted.searchText }
                  : {}),
                ...(interpreted.venueCategories
                  ? { venueCategories: interpreted.venueCategories }
                  : {}),
                categories: effectiveFilters.categories,
                price: effectiveFilters.price
              },
              namedWindow,
              {
                excludedCategories: interpreted.excludedCategories,
                viewerId
              }
            ),
        repository.searchVenues(
          {
            ...(interpreted.searchText ? { text: interpreted.searchText } : {}),
            ...(interpreted.venueCategories
              ? { categories: interpreted.venueCategories }
              : {})
          },
          venueLedSearch ? VENUE_LED_RESULT_LIMIT : undefined
        )
      ]);

      if (namedEvents.length > 0 || namedVenues.length > 0) {
        return intelligentSearchResponseSchema.parse({
          ...responseBase,
          condition: 'exact',
          message: {
            code: 'search.message.exactCount',
            params: { count: namedEvents.length + namedVenues.length }
          },
          ...(interpreted.searchText
            ? { searchText: interpreted.searchText }
            : {}),
          venues: namedVenues,
          data: rankAndExplainEvents(namedEvents, interpreted, 'exact')
        });
      }

      // Nothing in Pulso's own directory carries that name. Before telling
      // someone the bar they are standing outside does not exist, ask
      // OpenStreetMap once - and keep the answer, so the next visitor gets it
      // from Pulso rather than from a stranger's server.
      //
      // Guarded by shouldLookUpVenue, which refuses a query Pulso has already
      // looked up and failed: the point is to answer real names, not to turn
      // every typo into traffic on a volunteer-run service.
      if (interpreted.searchText && options.lookupVenues) {
        const lookupText = interpreted.searchText;
        if (await repository.shouldLookUpVenue(lookupText)) {
          const found = await options.lookupVenues(lookupText);
          // Called even when nothing was found: "Montréal has no such place"
          // is the answer most worth remembering, since it is the one that
          // would otherwise be asked again on every repeat of the query.
          const savedVenues = await repository.saveLookedUpVenues(
            lookupText,
            found
          );
          if (savedVenues.length > 0) {
            return intelligentSearchResponseSchema.parse({
              ...responseBase,
              condition: 'exact',
              message: {
                code: 'search.message.foundLive',
                params: { count: savedVenues.length }
              },
              searchText: lookupText,
              venues: savedVenues,
              // A place, not an evening. These have no programming attached -
              // that is precisely why they were missing - so `data` stays
              // empty rather than being padded with unrelated events.
              data: []
            });
          }
        }
      }

      // Nothing carries that name. If the query said anything else Pulso can
      // act on, answer *that* rather than dead-ending - and label the gap, so
      // the visitor sees which part went unanswered instead of wondering why
      // these results came back.
      //
      // Dead-ending here is what made "un evenement humouristique" return
      // nothing: one unrecognised word was treated as a name, matched no
      // record, and took the whole query down with it.
      const hasOtherCriteria =
        Object.keys(interpreted.derivedFilters).length > 0 ||
        interpreted.excludedCategories.length > 0;
      if (hasOtherCriteria) {
        const fallbackWindow = createFilteredDiscoveryWindow(
          now,
          effectiveFilters
        );
        const fallbackEvents = await repository.findInBounds(
          boundsQuery,
          fallbackWindow,
          {
            excludedCategories: interpreted.excludedCategories,
            viewerId
          }
        );
        if (fallbackEvents.length > 0) {
          return intelligentSearchResponseSchema.parse({
            ...responseBase,
            condition: 'alternative',
            message: { code: 'search.message.alternative' },
            ...(interpreted.searchText
              ? { searchText: interpreted.searchText }
              : {}),
            venues: [],
            data: rankAndExplainEvents(
              fallbackEvents,
              interpreted,
              'alternative',
              interpreted.searchText
                ? [
                    {
                      code: 'search.difference.searchText' as const,
                      params: { text: interpreted.searchText }
                    }
                  ]
                : []
            )
          });
        }
      }

      return intelligentSearchResponseSchema.parse({
        ...responseBase,
        condition: 'no_reliable_result',
        message: { code: 'search.message.noReliableResult' },
        ...(interpreted.searchText
          ? { searchText: interpreted.searchText }
          : {}),
        venues: [],
        data: []
      });
    }

    const window = createFilteredDiscoveryWindow(now, effectiveFilters);
    const exactEvents = await repository.findInBounds(boundsQuery, window, {
      excludedCategories: interpreted.excludedCategories,
      viewerId
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
      effectiveBounds,
      manualFilters,
      effectiveFilters,
      interpreted,
      now,
      viewerId,
      effectiveNear
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
    const viewer = options.authRepository
      ? await resolveBearerUser(request, options.authRepository)
      : undefined;
    const event = await repository.findById(id, viewer?.id ?? null);
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
    const viewer = options.authRepository
      ? await resolveBearerUser(request, options.authRepository)
      : undefined;
    return eventListResponseSchema.parse({
      data: await repository.findWithinDirectDistance(query, viewer?.id ?? null)
    });
  });

  app.get('/events/by-ids', async (request) => {
    const query = eventIdsQuerySchema.parse(request.query);
    const viewer = options.authRepository
      ? await resolveBearerUser(request, options.authRepository)
      : undefined;
    return eventListResponseSchema.parse({
      data: await repository.findByIds(query.ids, viewer?.id ?? null)
    });
  });

  app.get('/venues', async (request) => {
    const query = venuesQuerySchema.parse(request.query);
    return venueListResponseSchema.parse({
      data: await repository.findVenuesWithoutUpcomingEvents(query)
    });
  });

  /**
   * Finding a venue by name, anywhere in the directory.
   *
   * The two surfaces that need to name a place - claiming one as its
   * organizer, and hosting an event in one - were both built on the events
   * already loaded for the fourteen-day window, because no venue search
   * endpoint existed. That was workable while the directory only held venues
   * an event had put there. It is not workable now: of 1412 venues, the vast
   * majority have no programming at all, so the Clébard could not be claimed
   * by its own owner and an event could not be attached to it.
   *
   * Deliberately unauthenticated and read-only. It returns exactly what
   * `/search` already returns for the same text to anyone who asks; requiring
   * a token here would protect nothing and would stop the event-creation form
   * from offering a place before the visitor signs in.
   */
  app.get('/venues/search', async (request) => {
    const { query } = venueSearchQuerySchema.parse(request.query);
    return venueListResponseSchema.parse({
      data: await repository.searchVenues({ text: query }, VENUE_SEARCH_LIMIT)
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

/**
 * How far ahead a named search looks when the visitor gave no date. Long
 * enough that a show announced for next month is findable, short enough that
 * "lion king" does not return a year of tour dates.
 */
const NAMED_SEARCH_HORIZON_DAYS = 120;

/**
 * How many places a bare kind-of-place query returns. Higher than the
 * incidental venue list attached to a named search: here the places *are*
 * the answer.
 */
const VENUE_LED_RESULT_LIMIT = 40;

function boundsAround(point: { longitude: number; latitude: number }): {
  west: number;
  south: number;
  east: number;
  north: number;
} {
  return {
    west: point.longitude - 0.045,
    south: point.latitude - 0.035,
    east: point.longitude + 0.045,
    north: point.latitude + 0.035
  };
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

function toMapBoundsQuery(
  bounds: { west: number; south: number; east: number; north: number },
  filters: DiscoveryFilters,
  near?: { longitude: number; latitude: number; radiusMeters: number }
): MapBoundsQuery {
  return {
    ...bounds,
    date: filters.date,
    categories: filters.categories,
    price: filters.price,
    ...(filters.customStartDate ? { dateStart: filters.customStartDate } : {}),
    ...(filters.customEndDate ? { dateEnd: filters.customEndDate } : {}),
    ...(near
      ? {
          nearLongitude: near.longitude,
          nearLatitude: near.latitude,
          nearRadiusMeters: near.radiusMeters
        }
      : {})
  };
}

async function findExplainedAlternative(
  repository: EventRepository,
  bounds: { west: number; south: number; east: number; north: number },
  manualFilters: DiscoveryFilters,
  effectiveFilters: DiscoveryFilters,
  interpreted: ReturnType<typeof interpretDeterministicSearch>,
  now: Date,
  viewerId: string | null,
  near?: { longitude: number; latitude: number; radiusMeters: number }
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
      toMapBoundsQuery(bounds, plan.filters, near),
      createFilteredDiscoveryWindow(now, plan.filters),
      { excludedCategories: plan.excludedCategories, viewerId }
    );
    if (events.length > 0) return { events, differences: plan.differences };
  }
  return undefined;
}
