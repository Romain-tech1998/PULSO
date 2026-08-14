# Pulso API. Works as-is on Railway, Render and Fly - all three build a
# Dockerfile and can attach a persistent volume, which is what this image
# needs: uploaded event covers and forum photos are written to disk
# (DEC-0012 v1.2), and an ephemeral filesystem would lose them on every
# deploy. Mount the volume at /data and set EVENT_PHOTOS_UPLOAD_DIR=/data.
FROM node:24.18.0-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

# The API imports @pulso/contracts, @pulso/domain, @pulso/database and
# @pulso/search from source (their package exports point at src/), so the
# whole workspace has to be present - not just apps/api.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
COPY packages/database/package.json packages/database/
COPY packages/search/package.json packages/search/
COPY packages/ingestion/package.json packages/ingestion/

RUN pnpm install --frozen-lockfile --filter @pulso/api...

COPY packages/ packages/
COPY apps/api/ apps/api/

# Refuses to start unless the deployment configuration is complete - see
# apps/api/src/config.ts. Set PULSO_ENV=production on the host.
ENV NODE_ENV=production
EXPOSE 3001

# Bind to every interface: the platform's router reaches the container from
# outside, so the 127.0.0.1 development default would be unreachable.
ENV API_HOST=0.0.0.0
ENV API_PORT=3001

CMD ["pnpm", "--filter", "@pulso/api", "start"]
