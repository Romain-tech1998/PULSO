# DEC-0002 — Technical Baseline

**Identifier:** DEC-0002
**Version:** 1.0
**Status:** Accepted
**Dependencies:** PRD-0001, RFC-0001
**Last updated:** 2026-07-15

## Purpose

Record the exact dependency baseline and verification evidence produced by the first implementation task in RFC-0001. This decision does not change product scope or replace the technical gates in RFC-0001.

The local PostgreSQL/PostGIS runtime spike and the native Android development-build render validation are complete. This Accepted decision records the reviewed technical baseline and its successful runtime evidence.

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
| Database access | Drizzle ORM 0.45.2 / Drizzle Kit 0.31.10 / pg 8.22.0 | Strict type check and build pass; live migration, seed, repository, spatial-plan, and API integration checks pass |
| Runtime contracts | Zod 4.4.3 | Shared domain/API/client contract tests pass |
| Web map | maplibre-gl 5.24.0 | Next.js production build passes; browser render remains covered by the Playwright surface test |
| Native map | @maplibre/maplibre-react-native 11.3.6 | Expo 57 / React 19.2 / React Native 0.86 peer ranges pass; an x86_64 Android development build compiles, installs, launches, loads `libmaplibre.so`, and visibly renders the synthetic point and event preview |
| Unit/integration tests | Vitest 4.1.10 | Five unit/contract tests and six live-database integration tests pass with `DATABASE_URL` |
| Browser tests | Playwright 1.61.1 | Test discovery passes; browser execution is assigned to CI or a prepared local browser environment |
| Local spatial database | postgis/postgis:18-3.6 | Docker Engine 29.6.1 and Compose 5.3.0 run the Linux/amd64 image; PostgreSQL 18.4 and PostGIS 3.6.4 pass the runtime gate |
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

Completed locally on 2026-07-15 with Docker Desktop's Linux/WSL 2 engine:

- `postgis/postgis:18-3.6` started healthy and accepted connections through the Compose health check;
- both existing migrations applied from an empty `pulso` database, and a second migration run completed without reapplying them;
- the fictional event and venue seed completed and stored their expected identifiers, text fields, source, Montréal coordinates, and trust fields;
- `pg_extension` reported PostGIS 3.6.4 on PostgreSQL 18.4;
- the venue point round-tripped at SRID 4326 with longitude `-73.5673` and latitude `45.5017`;
- the Montréal bounding box returned the fictional event and used `venues_location_gist_idx` in an `EXPLAIN (ANALYZE, BUFFERS)` index scan;
- the direct-distance query returned the event at `22.228` metres from the test point and used `venues_location_geography_gist_idx` in an `EXPLAIN (ANALYZE, BUFFERS)` index scan;
- both geometry and geography GiST indexes were present in `pg_indexes`;
- all six live-database integration tests passed, including Fastify bounds and proximity responses parsed by the shared Zod contracts;
- the spatial API and contracts expose direct distance in metres only and add no routing, travel-time, or itinerary semantics.

Completed locally on 2026-07-15 with Android Studio Quail 2 (2026.1.2), its bundled OpenJDK 21.0.10 runtime, and the running Android 16 emulator:

- Expo continuous native generation produced the ignored Android project for `com.pulso.mobile` without changing the product contracts;
- the generated project resolved compile and target SDK 36, minimum SDK 24, Android Gradle Plugin 8.12.0, Gradle 9.3.1, NDK 27.1.12297006, and its required CMake 3.30.5 and 3.22.1 toolchains;
- the x86_64 development APK compiled successfully after shortening pnpm virtual-store paths for Windows-native CMake/Ninja inputs;
- ADB 37.0.0 installed version `0.0.1` (`versionCode` 1) on `emulator-5554`, an `sdk_gphone16k_x86_64` Android 16 / API 36 emulator;
- a cold `MainActivity` launch completed successfully in 2,423 ms and Metro bundled the Android application with 861 modules;
- the emulator reached the local Fastify API through `10.0.2.2`, and the API returned the existing fictional `Synthetic Montréal Pulse` fixture;
- Android process logs show the x86_64 MapLibre native library `libmaplibre.so` loading successfully, with no fatal exception in the validated process;
- the inspected emulator screenshot at `%TEMP%\pulso-android-map.png` shows the MapLibre surface and synthetic Montréal marker;
- the inspected screenshot at `%TEMP%\pulso-android-event-selected-final.png` shows the selected marker and the expected fictional event name, venue, address, and trust information;
- the validated mobile interaction adds no routing, travel-time, itinerary, native booking, or production-provider behavior.

The CI workflow supplies the version-pinned PostGIS service, runs migrations and the synthetic seed before the complete verification command, and executes the browser smoke test. It performs no deployment.

## Verification gates

### PostgreSQL/PostGIS runtime gate — complete

The ARC-007 runtime gate completed on 2026-07-15. The live version-pinned container produced evidence for:

- PostGIS extension creation and tracked migrations from an empty database;
- idempotent migration and seed execution;
- SRID 4326 coordinate round trip;
- bounds and direct-distance results for the fictional event;
- metre-based geography distance without routing semantics;
- both GiST index definitions and index-backed execution plans;
- database-backed Fastify bounds and proximity responses conforming to shared Zod contracts.

This gate no longer blocks the ARC-007 canonical spatial-schema spike.

### Native Android gate — complete

The ARC-009 native renderer gate ran on 2026-07-15. The Expo SDK 57 Android development build compiled for x86_64, installed and launched on the API 36 emulator, loaded MapLibre Native, visibly rendered the fictional Montréal marker, and displayed the expected event preview after selection. Package, launch, filtered logcat, and screenshot evidence was captured outside the repository.

The technical gate no longer blocks the native renderer baseline. The package, launch, logcat, and visible-render evidence was reviewed successfully; Expo Go was not used as a substitute.

### Browser execution

Playwright 1 test discovery passes. Browser binaries were not installed locally. The committed CI workflow owns browser installation and execution; this does not block the dependency baseline.

## Reversibility

The version pins are isolated in workspace manifests and the lockfile. Product and API contracts do not expose Drizzle, PostGIS, or map-renderer representations. If future evidence identifies a native renderer incompatibility, a follow-up documented renderer revision may replace that boundary without changing Accepted product scope.

## Acceptance condition

The two technical acceptance criteria now have runtime evidence:

1. **Complete:** the version-pinned PostGIS container starts and all migration, seed, bounds, distance, SRID, index-use, and database-backed API integration checks pass; and
2. **Complete:** an Expo SDK 57 Android development build compiles, installs, and visibly renders the synthetic point with MapLibre 11.

DEC-0002 is version 1.0 Accepted because the captured PostGIS and native Android evidence, including the visible MapLibre result, satisfies both criteria.

Presentation polish, real ingestion, provider selection, and full product implementation are outside this decision.
