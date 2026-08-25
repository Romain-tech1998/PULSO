# Deploying Pulso

Pulso is **two services plus a database**, not one app:

| Piece | Where | Why |
| --- | --- | --- |
| `apps/web` (Next.js) | Vercel | What Vercel is for. |
| `apps/api` (Fastify) | Railway / Render / Fly | Needs a long-lived process (Postgres pool) and a **persistent volume** for uploaded photos. Vercel has neither. |
| Postgres + **PostGIS** | Managed (Neon, Supabase, or the API host's own) | Every geographic query depends on PostGIS. Confirm the extension is available *before* committing to a provider. |

The API refuses to start if this configuration is incomplete — see
`apps/api/src/config.ts`. That is deliberate: every value below used to fall
back to `localhost`, which fails silently in production rather than loudly.

## Order matters

Do these in sequence; each step needs the previous one's URL.

### 1. Database

Create the instance, then enable the extension and run the migrations:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

```bash
DATABASE_URL='postgresql://…' pnpm db:migrate
```

Do **not** run `pnpm db:seed` against production — it inserts the synthetic
test fixtures the e2e suite uses.

Turn on automated backups now, not later: this database holds user-authored
content (events, forum posts, photos, messages).

### 2. API

Deploy `apps/api/Dockerfile` on the host of your choice. It builds the whole
workspace because the API imports `@pulso/*` from source.

**Attach a persistent volume** and mount it at `/data`. Without one, every
uploaded event cover and forum photo disappears on the next deploy.

Environment:

```
PULSO_ENV=production
DATABASE_URL=postgresql://…
API_PUBLIC_URL=https://api.your-domain.com   # this service's public origin
NEXT_PUBLIC_APP_URL=https://your-domain.com  # where sign-in returns the visitor
EVENT_PHOTOS_UPLOAD_DIR=/data
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…
ERROR_WEBHOOK_URL=…                          # required: see "Error monitoring"
OPENROUTER_API_KEY=…                         # optional, see below
```

`OPENROUTER_API_KEY` powers intelligent search. Leave it out and `/search`
falls back to the deterministic engine on every call — queries still work,
they are just interpreted more literally. Set it and every intelligent search
becomes a billed model call, so it is a running cost, not a free capability.

Point a subdomain (`api.your-domain.com`) at the service and let the host
issue the certificate. `API_PUBLIC_URL` must be `https://` — Google rejects a
plain-http OAuth redirect outside localhost.

### 3. Google OAuth

In the Google Cloud console, add to the OAuth client's **authorized redirect
URIs**:

```
https://api.your-domain.com/auth/google/callback
```

This is the single most common reason a first deploy "works" but nobody can
sign in.

### 4. Web

Import the repo on Vercel with **Root Directory = `apps/web`**.

These two are read at **build** time, not at runtime — they must be set
before the build, and a change to either requires a redeploy:

```
NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

Leave `NEXT_PUBLIC_ALLOW_INDEXING` unset. The closed beta ships `noindex`
(`apps/web/app/robots.ts`); set it to `true` only at public launch, and add a
sitemap with that change.

Then point the apex domain at Vercel.

## After the first deploy

Check, in this order — each one has failed silently before:

1. `https://api.your-domain.com/health` returns `{"status":"ok"}`.
2. `https://your-domain.com/robots.txt` says `Disallow: /`.
3. The map draws Pulso's violet basemap, not a grey fallback (that means
   `NEXT_PUBLIC_API_BASE_URL` reached the build).
4. Sign in with Google, end to end.
5. Upload an event cover, redeploy the API, confirm the photo still loads.

## Error monitoring

`ERROR_WEBHOOK_URL` is a **hard requirement in production** — the API refuses
to start without it, the same way it refuses without `DATABASE_URL`. DEC-0026
§4 makes error monitoring a condition of the first invitation, and the
alternative is a service that comes up looking fine while nobody is told when
it fails.

No vendor is baked in. Anything that accepts a JSON POST works: a Sentry
webhook, Betterstack, a Discord or Slack incoming webhook. The body is
`{ kind, message, stack, route, method, requestId, at }` — `route` is the
route pattern rather than the concrete path, so alerts group per endpoint,
and `requestId` ties an alert to its line in the service log.

Reported: every 500 (a 400 is the caller being wrong, and is deliberately not
reported), plus `unhandledRejection` and `uncaughtException`, which used to
leave no trace at all. The sink never throws and never blocks a response — a
monitoring outage must not become an application outage.

## Rate limiting

On by default, no configuration. Four tiers, keyed per session rather than
per address so that one venue's wifi is not one budget:

| Tier | Per minute | What it covers |
| --- | --- | --- |
| `upload` | 6 | Photos and covers — disk, plus a moderator's time |
| `authored` | 12 | Forum and group posts, messages, reports |
| `write` | 60 | Favourites, attendance, joining a group |
| `read` | 300 | Everything a GET does; `/health` is exempt |

A refused request answers `429` with `Retry-After` and a readable body.

## Known gaps
- **Mobile is unaudited** for the organizer, notifications and administration
  surfaces.
