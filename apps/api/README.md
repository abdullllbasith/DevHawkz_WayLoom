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

`DATABASE_URL` is required. Development must use the local `wayloom_development` database. Test must use `127.0.0.1` and `wayloom_test`. Production must set its own database URL and cannot use those two databases or a placeholder password. The URL is not returned by the API.

`POST /api/auth/login` limits failed attempts in this process. `LOGIN_RATE_LIMIT_MAX` is the number of failures and `LOGIN_RATE_LIMIT_WINDOW_SECONDS` is the window in seconds. Development and test use 20 failures and 900 seconds when both are omitted. Production must set both. The limit uses the socket address and the login identifier. It does not read forwarded IP headers, and it is not shared across API processes.

`GET /health` reports that this process is up. It does not check PostgreSQL or the planning service. A readiness endpoint is not exposed until those dependencies exist.

The API allows credentialed browser calls only from `WEB_ORIGIN`. Development and test use `http://127.0.0.1:3000` when it is omitted. Production omits CORS headers until `WEB_ORIGIN` is an https origin, and that origin cannot be a local address. The request `Origin` is never copied into the response. Allowed methods are `GET` and `POST`. Allowed request headers are `content-type` and `x-wayloom-csrf`. A matching preflight returns `204` and does not run login, CSRF, or a business route. `WEB_HTTPS=true` adds HSTS only in production, without `includeSubDomains` or `preload`. `/api` responses use `Cache-Control: no-store`. The planning service is not a browser client and has no CORS policy.

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

`npm run import:vehicles --workspace @wayloom/api` imports `vehicles.csv` into the Vehicle table. Driver assignment is not part of that file. A validation failure writes nothing.

`npm run import:calendar --workspace @wayloom/api` imports `calendar.csv` into `calendar_source`. That table is competition source data. The source date is the row identity. A validation failure writes nothing.

`npm run import:district-travel --workspace @wayloom/api` imports `district_travel.csv` into `district_travel_source`. That table is competition source data. The source identity is depot and district. It is not part of the three-file Hackathon runtime import. A validation failure writes nothing.

`npm run import:service-allowance --workspace @wayloom/api` imports `service_allowance.csv` into `service_allowance_source`. That table is competition source data. The source identity is brand and dock type. It is not part of the three-file Hackathon runtime import. A validation failure writes nothing.

`npm run import:traffic-speed --workspace @wayloom/api` imports `traffic_speed.csv` into `traffic_speed_source` when the file is present. The source identity is district, hour, and monsoon. An absent file is reported as skipped and writes nothing. A validation failure, duplicate identity, or existing-row conflict writes nothing and exits non-zero. It is not part of the three-file Hackathon runtime import and it is not an application startup dependency.

`npm run import:road-conditions --workspace @wayloom/api` imports `road_conditions.csv` into `road_conditions_source` when the file is present. The source identity is district and date. The date stays text. An absent file is reported as skipped and writes nothing. A validation failure, duplicate identity, or existing-row conflict writes nothing and exits non-zero. It is not part of the three-file Hackathon runtime import and it is not an application startup dependency.

Password hashing uses Argon2id through `@node-rs/argon2` 2.2.1. The module keeps that library's default memory cost, time cost, and parallelism, and each hash gets a new salt. Login and sessions are not implemented.

`npm run seed:scenario --workspace @wayloom/api` creates the development users and one submitted order. It uses imported competition outlets, vehicles, and calendar rows. It does not create trips or execution records. Credentials are documented in `database/seed/README.md`.

## Errors

Unexpected failures return JSON:

```json
{ "error": { "code": "internal_error", "message": "Internal server error." } }
```

Production responses do not include stack traces. The server logs the failure without printing passwords, session secrets, or connection strings.
