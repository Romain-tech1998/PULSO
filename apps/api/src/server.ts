import {
  createPool,
  PostgresAttendanceRepository,
  PostgresAuthRepository,
  PostgresEventAccessRepository,
  PostgresTicketingRepository,
  PostgresEventPhotosRepository,
  PostgresImageModerationRepository,
  PostgresUserPhotosRepository,
  PostgresEventRepository,
  PostgresFavoritesRepository,
  PostgresForumRepository,
  PostgresFriendsRepository,
  PostgresGroupsRepository,
  PostgresMessagesRepository,
  PostgresProfileRepository,
  PostgresNotificationsRepository,
  PostgresOrganizerRepository,
  PostgresRatingsRepository,
  PostgresReportsRepository,
  PostgresTrendsRepository
} from '@pulso/database';
import { lookupVenueByName } from '@pulso/ingestion';
import { buildApp } from './app.js';
import { createOpenAiModerationProvider } from './image-moderation-openai.js';
import { createStripePaymentProvider } from './payments-stripe.js';
import { resolveApiConfig } from './config.js';

// Throws before anything else happens if the deployment configuration is
// incomplete - see config.ts for why a silent localhost fallback is worse
// than refusing to boot.
const config = resolveApiConfig();

const pool = createPool();

const apiBaseUrl = config.publicUrl;
// Disk storage for uploaded photos (DEC-0012 v1.2). In production this must
// be a persistent volume: config.ts refuses to start without an explicit
// path, because an ephemeral filesystem loses every upload on redeploy.
const uploadDir = config.uploadDir;
const publicUploadUrl = config.publicUploadUrl;
const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackUri: `${apiBaseUrl}/auth/google/callback`,
        appCallbackUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/callback`
      }
    : undefined;

const app = buildApp(new PostgresEventRepository(pool), {
  logger: true,
  // Wired here rather than inside app.ts so the network call has a single,
  // visible owner: this is the only place Pulso reaches a third-party service
  // during a visitor request.
  lookupVenues: (text) => lookupVenueByName(text),
  ...(google
    ? {
        authRepository: new PostgresAuthRepository(pool),
        favoritesRepository: new PostgresFavoritesRepository(pool),
        trendsRepository: new PostgresTrendsRepository(pool),
        friendsRepository: new PostgresFriendsRepository(pool),
        attendanceRepository: new PostgresAttendanceRepository(pool),
        forumRepository: new PostgresForumRepository(pool),
        messagesRepository: new PostgresMessagesRepository(pool),
        reportsRepository: new PostgresReportsRepository(pool),
        groupsRepository: new PostgresGroupsRepository(pool),
        profileRepository: new PostgresProfileRepository(pool),
        eventAccessRepository: new PostgresEventAccessRepository(pool),
        ticketingRepository: new PostgresTicketingRepository(pool),
        eventPhotosRepository: new PostgresEventPhotosRepository(pool),
        userPhotosRepository: new PostgresUserPhotosRepository(pool),
        imageModerationRepository: new PostgresImageModerationRepository(pool),
        // DEC-0021: absent means every upload is flagged for review rather
        // than published unscreened, which is the correct default for an
        // instance that has not been given a key.
        ...(process.env.OPENAI_API_KEY
          ? {
              imageModerationProvider: createOpenAiModerationProvider(
                process.env.OPENAI_API_KEY
              )
            }
          : {}),
        // DEC-0022 §1 and §8. Both halves required: a secret key with no
        // webhook secret could open a checkout it could never confirm.
        ...(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET
          ? {
              paymentProvider: createStripePaymentProvider(
                process.env.STRIPE_SECRET_KEY,
                process.env.STRIPE_WEBHOOK_SECRET
              )
            }
          : {}),
        ratingsRepository: new PostgresRatingsRepository(pool),
        notificationsRepository: new PostgresNotificationsRepository(pool),
        organizerRepository: new PostgresOrganizerRepository(pool),
        uploadDir,
        publicUploadUrl,
        google
      }
    : {})
});

const { host, port } = config;

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  await pool.end();
  process.exitCode = 1;
}

const close = async () => {
  await app.close();
  await pool.end();
};

process.on('SIGINT', close);
process.on('SIGTERM', close);
