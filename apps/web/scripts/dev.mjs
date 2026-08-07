// Loads the monorepo-root .env before Next.js starts, so NEXT_PUBLIC_* vars
// (baked into the client bundle at dev-server-start time) always reflect it,
// regardless of who launches `pnpm dev` or which shell they're in. Without
// this, NEXT_PUBLIC_API_BASE_URL silently falls back to its localhost
// default whenever .env wasn't manually sourced first - a real recurring
// bug, since apps/api's own API_HOST default is 127.0.0.1: the browser
// treats those two hosts as different cookie origins, so Google OAuth's
// state-cookie check fails every time the two disagree.
//
// Can't just pass `node --env-file=../../.env` on the CLI like apps/api
// does (see its dev script) - Next.js forwards node's exec args into
// NODE_OPTIONS for the child processes it spawns internally, and
// `--env-file` is one of the flags Node explicitly refuses inside
// NODE_OPTIONS, so the dev server would fail to start entirely.
// `process.loadEnvFile` is the same loader without that side effect.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const rootEnvPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../.env'
);
process.loadEnvFile(rootEnvPath);

await import('next/dist/bin/next');
