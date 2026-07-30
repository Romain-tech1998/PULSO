import {
  favoriteEventsRequestSchema,
  favoriteEventsResponseSchema,
  favoriteVenuesRequestSchema,
  favoriteVenuesResponseSchema,
  meResponseSchema,
  trendsResponseSchema
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

  app.get('/auth/google/callback', async (request, reply) => {
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
      return reply.status(502).send({
        error: {
          code: 'GOOGLE_USERINFO_FAILED',
          message: 'Could not read the Google profile.'
        }
      });
    }
    const profile = (await userInfoResponse.json()) as GoogleUserInfo;
    const user = await authRepository.upsertUserFromGoogle({
      googleSubject: profile.sub,
      email: profile.email,
      displayName: profile.name ?? profile.email,
      ...(profile.picture ? { avatarUrl: profile.picture } : {})
    });
    const session = await authRepository.createSession(user.id);
    const redirectUrl = new URL(google.appCallbackUrl);
    redirectUrl.searchParams.set('token', session.token);
    return reply.redirect(redirectUrl.toString());
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
