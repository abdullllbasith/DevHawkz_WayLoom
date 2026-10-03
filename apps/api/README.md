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

Successful login, failed login, logout, role denial, object denial, and CSRF rejection append one `AuditEvent` each. The action names are `LOGIN_SUCCESS`, `LOGIN_FAILURE`, `LOGOUT`, `AUTHORIZATION_DENIED`, `OBJECT_AUTHORIZATION_DENIED`, and `CSRF_REJECTED`. Failed login stores no actor and no submitted identifier. The other events use the server-resolved user id. `target_type` and `target_id` stay empty because those events do not name an approved business target. Details are only `role`, `object`, or the matched route for CSRF rejection. Rate-limit rejections are not audit rows. A failed audit write does not turn a denial into success. If the login audit row cannot be stored, the new session is revoked and the response is an error. Logout still revokes the session. There is no audit-history API.

Order creation and submission live in the API domain module. A Store Manager creates a `Draft` only for an outlet assigned in `user_outlets`. Brand, district, and depot are read from that outlet. A supplied context value must match the outlet. Submission moves `Draft` to `Submitted` and sets `submitted_at` from the server clock. It does not allocate a trip, calculate cutoff eligibility, or add `dispatch_date`. The server actor is `created_by_user_id`. No business audit action name is approved, so these writes do not invent one.

Later order status changes use that same transition boundary. The path is `Submitted` to `Confirmed`, then `Deferred` or `Planned / Allocated`, then `Loading`, `Loaded`, `Dispatched`, `Delivered`, and `Receipt Confirmed`. `Loading` may enter `Exception Reported`. Dispatcher operational checks own confirmation, deferral, allocation, dispatch, and exception reporting. A loader step requires that loader's loading record. Delivery requires that driver's delivery record. `Planned / Allocated` requires an existing trip stop and does not calculate capacity, fuel, windows, or cutoff. `Deferred` requires a deferral row and no trip stop. Receipt confirmation requires `Delivered` and an existing delivery record. The status write matches the previously read status, so a stale competing write does not also succeed.

A Dispatcher persists a trip from an allocation through the trip domain. The trip number is `1` or `2`, and the vehicle depot, one brand, one district, weight, volume, reefer capability, and van-only access are checked against the stored vehicle and orders. A supplied planned arrival must sit inside the outlet window when both bounds exist. The domain does not calculate fuel or trip minutes and does not store them. Each allocated order moves to `Planned / Allocated` through the order transition. Confirmation changes only the trip status. No business audit action name is approved, so these writes do not invent one.

A Loader verifies one loading record for a confirmed trip stop. Expected units are copied from `order_units`. The order moves through `Loading` to `Loaded` on the order transition, and a shortfall is stored on that same record. The order quantity, weight, volume, and outlet context stay unchanged. A second verification or a second shortfall report conflicts. No business audit action name is approved, so these writes do not invent one.

A Driver records one delivery for a dispatched stop on the vehicle assigned to that driver. The outcome stays free text. The order moves to `Delivered` through the order transition. Proof of delivery stores an evidence reference on that delivery and does not confirm a receipt. The order quantity and outlet context stay unchanged. A second delivery for the same stop conflicts. No business audit action name is approved, so these writes do not invent one.

A Dispatcher records a deferral when a confirmed order has no trip stop. The reason is one of the six approved planning reasons. The order moves to `Deferred` through the order transition. A later different reason is appended. Earlier deferral rows stay in place, and an order that already has a trip stop is not deferred. The order quantity and outlet context stay unchanged. No business audit action name is approved, so these writes do not invent one.

A Dispatcher records an exception as its own row. The table has no order, trip, loading, delivery, or receipt link, so a client cannot attach one. Store Manager, Loader, and Driver are denied. The write does not change the order, trip, delivery, receipt, or deferral. No severity or exception status is stored. No business audit action name is approved, so these writes do not invent one.

A Store Manager confirms one receipt for a delivered order at an assigned outlet. The receipt points at that delivery record. The order moves to `Receipt Confirmed` through the order transition. Issue details stay on the receipt. The delivery outcome and the order quantity stay unchanged. A second receipt for the same delivery conflicts. No business audit action name is approved, so these writes do not invent one.

A requested order status change goes through the transition guard before the order transition writes it. The guard reads the stored order and rejects a missing actor, the wrong role, the wrong outlet or assignment, a skipped or backward step, and a missing trip stop, loading record, or delivery record. A client status, role, or actor id is not used. The guard does not calculate a plan, create an exception, or rewrite a delivery. No business audit action name is approved, so these checks do not invent one.

## API contracts

These contracts are the request and response allowlists for the core API. They do not register routes. A request with an unknown field is `invalid_input`. Dates are `YYYY-MM-DD`. Instants in responses are UTC timestamps. Quantities stay in order units, kilograms, and cubic metres. The authenticated actor is not a request field. Authorization stays in the Phase 3 checks and the domain operation.

| Request | Accepted fields | Response | Domain operation |
| --- | --- | --- | --- |
| `POST /api/auth/login` | `loginIdentifier`, `password` | `id`, `loginIdentifier`, `displayName`, `role` | existing login |
| `GET /api/auth/me` | none | same user fields | existing current user |
| `POST /api/auth/logout` | none | `{ "status": "ok" }` | existing logout |
| `GET /api/orders` | optional `orderDate`, `status`, `outletId` | order fields below | order read |
| `POST /api/orders` | `deliveryId`, `orderDate`, `outletId`, `tempRequirement`, `orderUnits`, `orderWeightKg`, `orderVolumeM3`; optional `brand`, `district`, `depot` | order fields below | `createOrder` |
| `GET /api/orders/:id` | path id | order fields below | `getOrder` |
| `POST /api/orders/:id/submit` | none | order fields below | `submitOrder` |
| `POST /api/planning/run` | `operationalDate` | `operationalDate`, trips, deferrals | planning boundary, not a client allocation |
| `GET /api/planning/:date` | path date | same planning result | planning read |
| `GET /api/trips/:id` | path id | trip and stops below | trip read |
| `POST /api/trips/:id/confirm` | none | same trip | `confirmTrip` |
| `GET /api/deferrals` | optional `orderId`, `reason` | deferral fields below | deferral read |
| `GET /api/loading/tasks` | none | loading fields below | loading read for the assigned loader |
| `POST /api/loading/:id/verify` | `loadedUnits` | loading fields below | `verifyLoading`; path id becomes `tripStopId` |
| `POST /api/loading/:id/shortfall` | `shortfallUnits`; optional `details` | loading fields below | `reportShortfall`; path id becomes `tripStopId` |
| `GET /api/driver/routes` | none | trip and stops below | trip read for the assigned driver |
| `POST /api/deliveries/:id/outcome` | `outcome`; optional `deliveredUnits`, `notes` | delivery fields below | `recordDelivery`; path id becomes `tripStopId` |
| `POST /api/deliveries/:id/pod` | `evidenceReference` | proof fields below | `recordProof`; path id becomes `tripStopId` |
| `POST /api/orders/:id/receipt` | `result`; optional `issueDetails` | receipt fields below | `confirmReceipt`; the order path selects the delivery |
| `GET /api/exceptions` | none | exception fields below | exception read |
| `POST /api/exceptions` | `category`; optional `details` | exception fields below | `recordException` |

Order response fields are `id`, `deliveryId`, `orderDate`, `outletId`, `outletCode`, `brand`, `district`, `depot`, `status`, `tempRequirement`, `orderUnits`, `orderWeightKg`, `orderVolumeM3`, and `submittedAt`. Trip response fields are `id`, `routeId`, `operationalDate`, `vehicleId`, `depot`, `tripNumber`, `status`, and stops with `id`, `tripId`, `orderId`, `sequence`, and `plannedArrival`. There is no route leg. Deferral fields are `id`, `orderId`, `reason`, and `reportedAt`. The reason is one of `NO_CAPACITY`, `NO_REEFER`, `VAN_ACCESS`, `WINDOW_CONFLICT`, `DEPOT_MISMATCH`, and `TIME_BUDGET`. Loading fields are `id`, `tripStopId`, `loaderUserId`, `expectedUnits`, `loadedUnits`, `shortfallUnits`, `verifiedAt`, `shortfallReportedAt`, and `details`. Delivery fields are `id`, `tripStopId`, `driverUserId`, `deliveredAt`, `outcome`, `deliveredUnits`, and `notes`. Proof fields are `id`, `deliveryRecordId`, `evidenceReference`, and `capturedAt`. Receipt fields are `id`, `deliveryRecordId`, `confirmedAt`, `result`, and `issueDetails`. Exception fields are `id`, `category`, `details`, and `occurredAt`.

Client requests cannot set an actor, role, status, planning result, vehicle, trip, stop sequence, loader, driver, or receipt confirmation. Optional outlet context on order creation must still match the stored outlet. A list filter does not grant access to another outlet or assignment. Responses do not include a password hash, session, cookie, or CSRF token. Sync batch contracts are not part of this boundary.

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
