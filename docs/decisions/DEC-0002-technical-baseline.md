# DEC-0002 — Technical Baseline

**Identifier:** DEC-0002
**Version:** 0.1
**Status:** Draft
**Dependencies:** PRD-0001, RFC-0001
**Last updated:** 2026-07-15

## Purpose

Record the exact dependency baseline and verification evidence produced by the first implementation task in RFC-0001. This decision does not change product scope or replace the technical gates in RFC-0001.

The document remains Draft because the local PostgreSQL/PostGIS runtime spike and the native Android development-build render could not run on the available workstation.

## Exact baseline selected

| Area | Exact selection | Compatibility evidence |
| --- | --- | --- |
| Runtime | Node.js 24.18.0 | Installed runtime; satisfies Next.js, React Native, Vitest, Playwright, and workspace engine ranges |
| Workspace | pnpm 11.7.0 | Installed runtime; clean workspace install and lockfile completed |
| Language | TypeScript 6.0.3, strict mode | Expo SDK 57 template line; full workspace strict type check passes |
| Web | Next.js 16.2.10 | React 19.2 peer range; production build passes on Node.js 24 |
| Shared UI runtime | React 19.2.3 / React DOM 19.2.3 | Expo SDK 57 template patch; Next.js 16 peer range accepts React 19 |
| Mobile | Expo 57.0.6 / React Native 0.86.0 | Expo template-aligned graph; Expo configuration, strict type check, and Android JS export pass |
| API | Fastify 5.10.0 | Strict type check, build, request injection, and Zod contract tests pass |
| Database access | Drizzle ORM 0.45.2 / Drizzle Kit 0.31.10 / pg 8.22.0 | Strict type check and build pass; runtime spatial gate remains open |
| Runtime contracts | Zod 4.4.3 | Shared domain/API/client contract tests pass |
| Web map | maplibre-gl 5.24.0 | Next.js production build passes; browser render remains covered by the Playwright surface test |
| Native map | @maplibre/maplibre-react-native 11.3.6 | Expo 57 / React 19.2 / React Native 0.86 peer ranges pass; configuration, type check, and Android JS export pass; native render gate remains open |
| Unit/integration tests | Vitest 4.1.10 | Five unit/contract tests pass; three database integration tests are present but skipped without `DATABASE_URL` |
| Browser tests | Playwright 1.61.1 | Test discovery passes; browser execution is assigned to CI or a prepared local browser environment |
| Local spatial database | postgis/postgis:18-3.6 | Maintained Docker Hub tag verified on 2026-07-15; Docker is unavailable on this workstation |
| Formatting/lint | Prettier 3.9.5 / ESLint 10.0.1 / typescript-eslint 8.64.0 | Repository formatting and lint checks pass |

Package versions were resolved from official npm registry metadata and locked by pnpm. The Node.js line follows the official Node.js release policy. The PostGIS image tag was checked against the official `postgis/postgis` Docker Hub repository. No production provider was selected.

## Repository scope created

The incremental workspace contains only:

- `apps/web`;
- `apps/mobile`;
- `apps/api`;
- `packages/domain`;
- `packages/contracts`;
- `packages/database`;
- `tests/fixtures`;
- `tests/integration` and the browser smoke-test surface;
- root workspace, strict TypeScript, formatting, linting, testing, environment-example, local database, and CI configuration.

It does not contain a worker application, ingestion/search/observability packages, a separate validation package, or production authentication, AI, analytics, deployment, map-style, or monitoring providers.

## Synthetic geospatial slice

The slice defines one synthetic Montréal event and venue at SRID 4326. The reviewed SQL migration enables PostGIS, stores the venue point, and creates GiST indexes for geometry bounds and geography distance behavior. All spatial queries are parameterized and remain in `packages/database`.

The repository exposes:

- bounds lookup through `ST_MakeEnvelope`;
- direct-distance lookup in metres through `ST_DWithin` and `ST_Distance`, without routing semantics;
- shared Zod public-event and query contracts;
- Fastify bounds and direct-distance endpoints;
- a Next.js MapLibre surface that loads the point through the API contract;
- an Expo/MapLibre development-build surface that loads the same API contract.

No real event source, production map provider, routing, booking, authentication, AI, or analytics capability is introduced.

## Verification evidence

Completed locally on Windows with Node.js 24.18.0 and pnpm 11.7.0:

- exact dependency resolution and lockfile installation;
- strict TypeScript checks for all six workspaces;
- ESLint and Prettier checks;
- five Vitest unit/contract/API/presentation tests;
- package builds, API build, and Next.js 16 production build;
- Expo public configuration resolution;
- Expo strict TypeScript validation;
- Android JavaScript export including the MapLibre native module;
- Playwright test discovery.

The CI workflow supplies the version-pinned PostGIS service, runs migrations and the synthetic seed before the complete verification command, and executes the browser smoke test. It performs no deployment.

## Open verification gates

### PostgreSQL/PostGIS runtime gate

Docker and Docker Compose are not installed on the available workstation. Consequently, the following tests exist but have not produced local runtime evidence:

- PostGIS extension creation and migrations from an empty database;
- SRID 4326 coordinate round trip;
- bounds query result;
- direct-distance result in metres;
- GiST index use for the spatial predicate;
- API response backed by the live spatial database.

This blocks completion of the ARC-007 canonical spatial-schema spike, not the repository structure or non-database builds.

### Native Android gate

Java, the Android SDK, ADB, and an emulator/device are unavailable. Expo configuration and Android JavaScript export pass, but Android prebuild/compile, development-build installation, and visible MapLibre point rendering remain unverified. Expo Go is not a valid substitute.

This blocks acceptance of the native renderer evidence, not shared contracts or the web/API scaffold.

### Browser execution

Playwright 1 test discovery passes. Browser binaries were not installed locally. The committed CI workflow owns browser installation and execution; this does not block the dependency baseline.

## Reversibility

The version pins are isolated in workspace manifests and the lockfile. Product and API contracts do not expose Drizzle, PostGIS, or map-renderer representations. If either mandatory spike fails, a follow-up documented database-layer or renderer revision may replace that boundary without changing Accepted product scope.

## Acceptance condition

DEC-0002 may move to version 1.0 Accepted only after:

1. the version-pinned PostGIS container starts and all migration, seed, bounds, distance, SRID, and index-use integration checks pass; and
2. an Expo SDK 57 Android development build compiles, installs, and visibly renders the synthetic point with MapLibre 11.

Presentation polish, real ingestion, provider selection, and full product implementation are outside this decision.
