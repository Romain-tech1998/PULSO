import {
  createPool,
  PostgresAttendanceRepository,
  PostgresAuthRepository,
  PostgresEventPhotosRepository,
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
import { join } from 'node:path';

import { buildApp } from './app.js';

const pool = createPool();

const apiBaseUrl = `http://${process.env.API_HOST ?? '127.0.0.1'}:${process.env.API_PORT ?? 3001}`;
// Local disk storage for uploaded event photos (Phase 4.8 follow-up) -
// matches the project's current pre-deployment stage rather than adding a
// cloud object store dependency before the product is feature-complete
// (see DEC-0012 v1.2).
const uploadDir =
  process.env.EVENT_PHOTOS_UPLOAD_DIR ?? join(process.cwd(), 'uploads');
const publicUploadUrl = `${apiBaseUrl}/uploads`;
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
        eventPhotosRepository: new PostgresEventPhotosRepository(pool),
        ratingsRepository: new PostgresRatingsRepository(pool),
        notificationsRepository: new PostgresNotificationsRepository(pool),
        organizerRepository: new PostgresOrganizerRepository(pool),
        uploadDir,
        publicUploadUrl,
        google
      }
    : {})
});

const host = process.env.API_HOST ?? '127.0.0.1';
const port = Number(process.env.API_PORT ?? 3001);

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
