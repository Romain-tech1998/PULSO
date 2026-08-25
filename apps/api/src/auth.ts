import {
  favoriteEventsRequestSchema,
  favoriteEventsResponseSchema,
  favoriteVenuesRequestSchema,
  favoriteVenuesResponseSchema,
  meResponseSchema,
  trendsResponseSchema,
  venueFavoriteCountsResponseSchema,
  venueIdsQuerySchema
} from '@pulso/contracts';
import type {
  AuthRepository,
  FavoritesRepository,
  TrendsRepository
} from '@pulso/database';
import fastifyOauth2 from '@fastify/oauth2';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  // The API's own callback URL (Google redirects here after consent).
  callbackUri: string;
  // Where to send the browser once a session token has been issued -
  // apps/web's own callback route, which stores the token and redirects
  // into the app proper.
  appCallbackUrl: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

export async function resolveBearerUser(
  request: FastifyRequest,
  authRepository: AuthRepository
) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice('Bearer '.length);
  return authRepository.findUserBySessionToken(token);
}

// The admin refusal, beside the authentication one. It lived privately in
// organizer.ts until a second module needed the same 403 (DEC-0021's
// moderation queue), and two copies of a guard is how they drift apart.
export function sendForbidden(reply: FastifyReply) {
  return reply.status(403).send({
    error: {
      code: 'FORBIDDEN',
      message: 'This action requires an administrator account.'
    }
  });
}

export function sendUnauthenticated(reply: FastifyReply) {
  return reply.status(401).send({
    error: {
      code: 'UNAUTHENTICATED',
      message: 'Sign in to access this resource.'
    }
  });
}

/**
 * Registers Google OAuth + the account-scoped routes it enables. Only
 * called when Google credentials are actually configured (see app.ts) -
 * everything else in the API works identically with or without an account
 * layer, since the whole point of DEC-0007/MVP-0001 is that an account
 * stays optional.
 */
export function registerAuthRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  favoritesRepository: FavoritesRepository,
  trendsRepository: TrendsRepository,
  google: GoogleAuthConfig
) {
  app.register(fastifyOauth2, {
    name: 'googleOAuth2',
    scope: ['openid', 'email', 'profile'],
    credentials: {
      client: { id: google.clientId, secret: google.clientSecret },
      auth: fastifyOauth2.GOOGLE_CONFIGURATION
    },
    startRedirectPath: '/auth/google',
    callbackUri: google.callbackUri
  });

  /**
   * Sends the browser back to Pulso carrying an outcome, never a dead end.
   *
   * Every failure below used to leave the visitor on this domain looking at
   * a JSON error object - or, worse, at nothing at all while the browser sat
   * on a URL that answered with a 500. The web callback route knows how to
   * render `?error=`; it cannot render an exception. So every exit from this
   * route is a redirect into the app, and the only thing that varies is
   * whether it carries a token or a reason.
   */
  const returnToApp = (
    reply: FastifyReply,
    outcome: Record<string, string>
  ) => {
    const redirectUrl = new URL(google.appCallbackUrl);
    for (const [key, value] of Object.entries(outcome)) {
      redirectUrl.searchParams.set(key, value);
    }
    return reply.redirect(redirectUrl.toString());
  };

  app.get('/auth/google/callback', async (request, reply) => {
    // Google itself refused before we ever get a code - the visitor pressed
    // "Cancel" on the consent screen, or the client is misconfigured. It
    // reports that as a query parameter, not as an exception, so reading it
    // first keeps a declined consent from being reported as a server fault.
    const googleError = (request.query as { error?: string } | undefined)
      ?.error;
    if (googleError) {
      request.log.info({ googleError }, 'Google declined the authorization');
      return returnToApp(reply, {
        error:
          googleError === 'access_denied' ? 'ACCESS_DENIED' : 'GOOGLE_REFUSED'
      });
    }

    try {
      // The plugin decorates the instance both as the plain `name` given above
      // and as `oauth2${Capitalized name}` - only the latter is in its own
      // type declarations (as `| undefined`, since it's an index signature),
      // but it's always defined here since registerAuthRoutes always
      // registers the plugin with this exact name before this route can run.
      const { token } =
        await app.oauth2GoogleOAuth2!.getAccessTokenFromAuthorizationCodeFlow(
          request
        );
      const userInfoResponse = await fetch(
        'https://www.googleapis.com/oauth2/v3/userinfo',
        { headers: { authorization: `Bearer ${token.access_token}` } }
      );
      if (!userInfoResponse.ok) {
        request.log.error(
          { status: userInfoResponse.status },
          'Google userinfo call failed'
        );
        return returnToApp(reply, { error: 'GOOGLE_USERINFO_FAILED' });
      }
      const profile = (await userInfoResponse.json()) as GoogleUserInfo;
      const user = await authRepository.upsertUserFromGoogle({
        googleSubject: profile.sub,
        email: profile.email,
        displayName: profile.name ?? profile.email,
        ...(profile.picture ? { avatarUrl: profile.picture } : {})
      });
      const session = await authRepository.createSession(user.id);
      return returnToApp(reply, { token: session.token });
    } catch (error) {
      // The exchange throws on a state-cookie mismatch (the single most
      // common real-world failure: the cookie set by /auth/google never came
      // back, because the start and callback hosts differ), on a redirect_uri
      // Google does not recognise, and on any database fault while creating
      // the session. Whatever the cause, the visitor gets a page that says so
      // and offers to try again - not a spinner that never resolves.
      request.log.error({ err: error }, 'Google OAuth callback failed');
      return returnToApp(reply, { error: 'OAUTH_EXCHANGE_FAILED' });
    }
  });

  app.get('/me', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    return meResponseSchema.parse({ data: user });
  });

  app.get('/me/favorites', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const eventIds = await favoritesRepository.getFavoriteEventIds(user.id);
    return favoriteEventsResponseSchema.parse({ data: { eventIds } });
  });

  app.put('/me/favorites', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const body = favoriteEventsRequestSchema.parse(request.body);
    const eventIds = await favoritesRepository.setFavoriteEventIds(
      user.id,
      body.eventIds
    );
    return favoriteEventsResponseSchema.parse({ data: { eventIds } });
  });

  app.get('/me/favorite-venues', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const venueIds = await favoritesRepository.getFavoriteVenueIds(user.id);
    return favoriteVenuesResponseSchema.parse({ data: { venueIds } });
  });

  app.put('/me/favorite-venues', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const body = favoriteVenuesRequestSchema.parse(request.body);
    const venueIds = await favoritesRepository.setFavoriteVenueIds(
      user.id,
      body.venueIds
    );
    return favoriteVenuesResponseSchema.parse({ data: { venueIds } });
  });

  // Real, aggregate-only per-venue popularity (Phase 4.12's Lieux page) -
  // works for an anonymous caller too, same "it's a page enrichment, not an
  // account action" rule as /events/engagement.
  app.get('/venues/favorite-counts', async (request) => {
    const { ids } = venueIdsQuerySchema.parse(request.query);
    const counts = await favoritesRepository.getFavoriteCountsForVenues(ids);
    return venueFavoriteCountsResponseSchema.parse({
      data: ids.map((venueId) => ({
        venueId,
        favoriteCount: counts.get(venueId) ?? 0
      }))
    });
  });

  app.get('/me/trends', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const trends = await trendsRepository.getTrends(user.id);
    return trendsResponseSchema.parse({ data: trends });
  });

  app.post('/auth/logout', async (request, reply) => {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      await authRepository.deleteSession(header.slice('Bearer '.length));
    }
    return reply.status(204).send();
  });
}
