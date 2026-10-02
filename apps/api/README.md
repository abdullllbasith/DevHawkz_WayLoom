# apps/api

WayLoom Node.js + TypeScript API foundation.

The server uses the Node.js `http` module. No second backend framework is added. Business endpoints, authentication, and planning calls are not implemented. Prisma is configured for PostgreSQL, and the WayLoom domain schema is not defined yet.

## Commands

From the repository root:

```text
npm run dev:api
npm run build
npm run start --workspace @wayloom/api
```

`npm run dev` still starts the frontend only. `npm run dev:api` builds this package and starts the API.

## Configuration

The process reads the repository root `.env` when that file exists. `NODE_ENV` must be `development`, `test`, or `production`.

In development and test, `API_HOST` defaults to `127.0.0.1` and `API_PORT` defaults to `4000`. In production both values are required.

`GET /health` reports that this process is up. It does not check PostgreSQL or the planning service. A readiness endpoint is not exposed until those dependencies exist.

## Prisma

Prisma CLI and Client `7.10.0` use PostgreSQL through `@prisma/adapter-pg`. The schema has no application models. No migration has been created. The first WayLoom migration belongs to Phase 2.

`DATABASE_URL` is the development database. `TEST_DATABASE_URL` is the test database. Prisma reads the repository root `.env`. Generated client files are created by `prisma generate` during `npm run build` and are not committed.

Commands, from `apps/api` or with `--workspace @wayloom/api`:

```text
npm run prisma:validate
npm run prisma:generate
npm run prisma:status -- development
npm run prisma:status -- test
npm run prisma:check -- development
npm run prisma:check -- test
npm run prisma:reset-test
```

`prisma:status` runs `prisma migrate status` after checking the target database name. `prisma:check` connects with Prisma Client and runs `SELECT 1`. `prisma:reset-test` runs `prisma migrate reset --force` only when the target is test and `TEST_DATABASE_URL` points at `wayloom_test`. A missing target, an unknown target, production, and a reset of development are refused. These commands do not print database URLs.

## Competition import

`npm run import:competition --workspace @wayloom/api` checks the local development database, then looks for `outlets.csv`, `vehicles.csv`, and `calendar.csv` in `data/competition-import`. A missing file stops the command before any write. The command refuses production and does not print database URLs.

`npm run import:outlets --workspace @wayloom/api` imports `outlets.csv` into the Outlet table. A validation failure writes nothing. Vehicle and calendar files are not imported by that command.

## Errors

Unexpected failures return JSON:

```json
{ "error": { "code": "internal_error", "message": "Internal server error." } }
```

Production responses do not include stack traces. The server logs the failure without printing passwords, session secrets, or connection strings.
