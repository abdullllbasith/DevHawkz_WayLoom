# WayLoom

WayLoom is the Hackathon operations system for one depot network. A Store Manager submits outlet orders. A Dispatcher confirms them and runs planning. A Loader verifies what was loaded. A Driver records the delivery and proof. The Store Manager confirms receipt.

There are four roles: Dispatcher, Loader, Driver, and Store Manager.

Dates and the planning cutoff use `Asia/Colombo` (UTC+05:30). Next-day orders close at 16:00 on the calendar day before the delivery day. A submission before that instant can enter that planning run. A submission at or after it waits for a later run. The imported competition calendar runs from `2024-01-01` through `2026-06-28`.

The deterministic planner decides allocation. AI, when enabled, explains a stored plan. It does not allocate, defer, or change an order.

## Seeded accounts

`npm run seed:scenario --workspace @wayloom/api` creates these users after outlets, vehicles, and the calendar are imported. Every account uses the password `wayloom-dev-only`. That password is a development seed value. It is not a production credential.

| Role | Login | Display name |
| --- | --- | --- |
| Dispatcher | `seed.dispatcher` | Seed Dispatcher |
| Loader | `seed.loader` | Seed Loader |
| Driver | `seed.driver` | Seed Driver |
| Store Manager | `seed.store-manager` | Seed Store Manager |

The seed also:

- assigns `seed.store-manager` to competition outlet `OUT001`
- assigns `seed.driver` to vehicles `VEH001` and `VEH035`
- creates one submitted chilled order, delivery id `SEED-2026-06-02-OUT001`, order date `2026-06-02`, submitted at `2026-06-01T08:00:00.000Z` (13:30 in Colombo, before that day's 16:00 cutoff)

It does not create a trip, loading record, delivery, proof, or receipt. If that delivery id already exists and has moved past `Submitted`, the seed leaves the order as it is. It does not rewind it.

The login page at [http://127.0.0.1:3000](http://127.0.0.1:3000) fills the matching login when a role is selected. The server session role is the one that grants access. The role chip does not override it.

## Setup

### Prerequisites

- Node.js `>=24.19.0`
- npm `11.17.0` (the only JavaScript package manager; lockfile is `package-lock.json`)
- Docker, for PostgreSQL 18.6
- Python 3.12 only if you start the separate planning process (it is not required for a planning run)

### Environment

```text
copy .env.example .env
```

Replace every `PASSWORD` placeholder in the untracked `.env`. `.env.example` has names and placeholders only. Do not commit `.env`.

Set both local URLs, using the same `wayloom_app` password as `WAYLOOM_APP_PASSWORD`:

```text
DATABASE_URL=postgresql://wayloom_app:PASSWORD@127.0.0.1:5432/wayloom_development
TEST_DATABASE_URL=postgresql://wayloom_app:PASSWORD@127.0.0.1:5432/wayloom_test
```

| Context | Database |
| --- | --- |
| Development | `wayloom_development` |
| Test and the judge setup below | `wayloom_test` |
| Production | A URL that names neither of those databases |

`LOG_LEVEL=info` is a safe default. `AI_ENABLED` is off unless it is the string `true`. Production variables are listed in `docs/production-configuration.md`. No public hostname is configured in this repository.

### Judge setup (recommended)

This path migrates, imports, and seeds `wayloom_test`, then runs the API against that database. From `DevHawkz_WayLoom`:

```text
docker compose up -d postgres
npm install
npm run build --workspace @wayloom/api
npm run gate:setup-local --workspace @wayloom/api
npm run gate:start-api-local --workspace @wayloom/api
npm run dev
```

`gate:setup-local` refuses a non-local database. It deploys Prisma migrations, imports the competition files in `data/competition-import`, and runs the seed. `gate:start-api-local` listens on `127.0.0.1:4000` with `NODE_ENV=test`. `npm run dev` starts the Next.js app on `127.0.0.1:3000`.

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

`GET http://127.0.0.1:4000/health` reports that the API process is up. `GET http://127.0.0.1:4000/ready` checks PostgreSQL.

To repeat the walkthrough after `SEED-2026-06-02-OUT001` has already been receipt-confirmed, reset only the test database and run setup again:

```text
powershell -File database/postgres/reset-database.ps1 -Target test
npm run gate:setup-local --workspace @wayloom/api
```

### Docker Compose

`docker compose config` validates the compose file. `docker compose up -d` starts four services. It does not deploy migrations, import competition files, or seed users. The API image starts `npm run start` and does not migrate on boot. Login fails until the database that process uses has been prepared.

| Service | Published address | Role |
| --- | --- | --- |
| `web` | `127.0.0.1:3000` | Next.js dev server |
| `api` | `127.0.0.1:4000` | Node API, database `wayloom_development` via hostname `postgres` |
| `planning` | `127.0.0.1:8000` | Python process, `GET /health` and `GET /ready` only |
| `postgres` | `127.0.0.1:5432` | PostgreSQL 18.6 |

Do not run the Compose API and `gate:start-api-local` together. Both bind port `4000`.

To use Compose for the application, prepare `wayloom_development` from the host first, then start the stack:

```text
docker compose up -d postgres
npm install
npm run build --workspace @wayloom/api
npm run gate:setup-local:dev --workspace @wayloom/api
docker compose up -d
```

`gate:setup-local:dev` requires `DATABASE_URL` or `TEST_DATABASE_URL` to be `127.0.0.1` and database `wayloom_development`. Inside Compose, the API receives its own `DATABASE_URL` pointing at hostname `postgres`. That container URL is not a browser setting.

The Python planning process is optional for the judge walkthrough. Planning runs inside the API.

### Other commands

```text
npm run typecheck
npm run lint
npm run build
npm test --workspace @wayloom/api
npm test --workspace @wayloom/web
npm test --workspace @wayloom/planning
```

Build the API before its tests. Production configuration, HTTPS, backup, restore, and health checks are in `docs/`. This repository does not include a public deployment URL.

## Numbered judge walkthrough

Sign in at [http://127.0.0.1:3000](http://127.0.0.1:3000). Use **Log out** in the workspace before switching roles. One browser session is one user.

Use delivery id `SEED-2026-06-02-OUT001` while its status is still **Submitted**. On the Dispatcher header, choose operational date **2026-06-02**. The header does not select a date for you.

A new order created from **Create Order** stores `submitted_at` at the current server time. The last calendar row is `2026-06-28`, and that Sunday is not an operating day. The last operating date in the file is `2026-06-27`. Its cutoff is `2026-06-26` at 16:00 Colombo. A submission after that instant is past the cutoff for every remaining operating date, so planning will not allocate it. The seeded order is eligible because its submission time is fixed on `2026-06-01`.

`seed.driver` sees trips only for `VEH001` and `VEH035`. The planner chooses the vehicle. **Vehicles** cannot reassign a driver. If the plan uses another vehicle, **My Routes** stays empty and steps 5 and 6 cannot be completed with the seeded driver.

The API lifecycle test covers this state sequence. A fresh live browser pass on a new order was not part of the last production-gate record.

### 1. Store Manager

1. Select **Store Manager**. The login identifier becomes `seed.store-manager`. Password: `wayloom-dev-only`.
2. You land on **Store Dashboard** (`/store`).
3. Open **Pending Deliveries** (`/store/orders`). The seeded order `SEED-2026-06-02-OUT001` is listed for outlet `OUT001` when it is still submitted.
4. Open that order (`/store/orders/[id]`). The page shows status. Vehicle, route, and arrival are shown as unavailable. There is no live map.
5. **Create Order** (`/store/orders/new`) can save a draft and submit it. For this demonstration, stay with the seeded order. A submission after `2026-06-26` 16:00 Colombo is not cutoff-eligible for any remaining operating date in the imported calendar.

What you should see: the order belongs to the assigned outlet, and its status is submitted until the Dispatcher confirms it.

### 2. Dispatcher — confirm, plan, and approve

1. Log out. Sign in as `seed.dispatcher` / `wayloom-dev-only`. You land on **Dashboard** (`/dispatcher`).
2. In the header, select operational date `2026-06-02`.
3. Open **Orders** (`/dispatcher/orders`). Confirm `SEED-2026-06-02-OUT001`. Status becomes confirmed. Planning does not accept a hand-picked subset of orders.
4. Open **AI Planning** (`/dispatcher/planning`). **Run planning**.
5. Read the trips and the deferred-order list. Each deferral uses one stored reason: `NO_CAPACITY`, `NO_REEFER`, `VAN_ACCESS`, `WINDOW_CONFLICT`, `DEPOT_MISMATCH`, or `TIME_BUDGET`. The same list is on **Deferrals** (`/dispatcher/deferrals`).
6. **Approve plan**. That confirms each trip whose status is still planned. Trip status becomes `CONFIRMED`. The order status becomes **Planned / Allocated**.
7. **Allocation confirmation** (`/dispatcher/allocation-confirmation`) shows that result. It does not create a loading task or notify a loader. **Plan comparison** and **Edit plan** stay unavailable.

The planner inside the API is authoritative. **Refresh explanation** on AI Planning, and the **Chat** tab on the Dashboard **Planning** card, describe the stored result. They do not change trips, vehicles, or order status. With AI left off, the screen says decision support is unavailable and planning continues. See [AI](#ai).

### 3. Loader

1. Log out. Sign in as `seed.loader` / `wayloom-dev-only`.
2. Open **Loading** (`/loader/loading`). Eligible work is every confirmed trip stop whose order is **Planned / Allocated** and which has no loading record yet. There is no loader assignment before this step. The loader who verifies the stop becomes the owner of that loading record.
3. Select the stop for `SEED-2026-06-02-OUT001`. Expected units are `10`. Enter the loaded units and choose **Verify loading**.
4. The order moves to **Loaded**. A second verification conflicts.
5. **Loading Records** (`/loader/records`) lists records this loader verified. A shortfall can be reported once on that record. It does not change the order quantity.

If the trip is still planned, or the order is not yet allocated, the stop list is empty. Approve the plan in step 2 first.

### 4. Dispatcher — dispatch

1. Log out. Sign in again as `seed.dispatcher`.
2. Keep operational date `2026-06-02`. Open **Routes** (`/dispatcher/routes`), then the trip.
3. **Dispatch trip** is enabled only when every stop on that trip is **Loaded**.
4. Dispatch moves those orders to **Dispatched**. The trip status stays `CONFIRMED`. The route page states that the driver can now record the delivery.

**Routes** says live vehicle locations and GPS are not available.

### 5. Driver

1. Log out. Sign in as `seed.driver` / `wayloom-dev-only`.
2. Open **My Routes** (`/driver`). A trip appears only when its vehicle is `VEH001` or `VEH035`.
3. Open the stop (`/driver/stops/[tripId]`).
4. Record the result on **Delivery Outcome** (`/driver/outcome?stop=<tripStopId>`). Outcome text is free text. Units and notes are optional. The order becomes **Delivered**. This is rejected unless the order is **Dispatched** and the trip is confirmed.
5. Record **Proof of Delivery** (`/driver/pod?stop=<tripStopId>`). Enter an evidence reference. Photos, signatures, and map position are not captured. Proof is not required for the outcome, and it does not confirm the store receipt.

Offline behavior is described in [Offline](#offline). A live browser demonstration of a dropped network was not recorded for this submission. The outcome and proof screens do keep a failed save on the device.

### 6. Store Manager — receipt

1. Log out. Sign in as `seed.store-manager`.
2. Open **Received Deliveries** (`/store/receipts`). The heading is **Confirm receipt and report an issue**.
3. For the delivered order, enter a result. Issue details are optional.
4. Confirm. Status becomes **Receipt Confirmed**. Issue text stays on the receipt. It does not create a Dispatcher exception.

A second receipt for the same delivery conflicts. Receipt is available only after the order is delivered, and only for outlet `OUT001`.

### 7. Final state

The seeded order is **Receipt Confirmed**. The trip remains `CONFIRMED`. The database holds the loading record, the delivery, the proof, and the receipt. The Dispatcher can still open the order, the route, and any deferrals. **Exceptions** (`/dispatcher/exceptions`) is a separate Dispatcher record. It does not move the order by itself.

Running the seed again does not return this order to **Submitted**.

## AI

AI is the Dispatcher's explanation layer. The planner in `packages/planning` remains authoritative for feasibility, allocation, and deferral reasons.

Connected to the UI:

| Screen | Action | API |
| --- | --- | --- |
| AI Planning | **Refresh explanation** | `POST /api/planning/:date/explanation` |
| Dashboard, Planning card, **Chat** tab | Ask about the stored plan | `POST /api/planning/:date/chat` |

Both read the stored planning result. `allocationChanged` stays false. Exception explanation and operational-insight code exist in `apps/api/src/ai` and are not called by an HTTP route or a screen.

Providers, selected in server configuration:

| `AI_ENABLED` | `AI_PROVIDER` | Behavior |
| --- | --- | --- |
| omitted or not `true` | any | Disabled. The UI says decision support is unavailable. Planning and delivery continue. |
| `true` | `deterministic` | The server restates the approved facts. No external model is called. |
| `true` | `openrouter` | The API calls `https://openrouter.ai/api/v1/chat/completions` with model `google/gemini-2.5-flash-lite`. |
| `true` | anything else | Stays disabled. |

`AI_PROVIDER_API_KEY` is read only on the server. The browser, the web app, and client storage do not receive it. No key is committed. There is no `AI_MODEL` variable. Timeout, rate limit, invalid model output, and a missing key return a bounded fallback built from the stored facts. A live OpenRouter session in the browser was not part of the recorded gates. The provider path is covered by API tests.

Full disclosure: [docs/ai-tool-disclosure.md](docs/ai-tool-disclosure.md). Authority rules: [docs/ai-service-boundary.md](docs/ai-service-boundary.md) and [docs/ai-governance.md](docs/ai-governance.md).

### AI tools used during development

The WayLoom team used ChatGPT and Cursor IDE while building the system. Those tools assisted development. They are separate from the AI provider that runs inside the application.

Runtime decision support uses only the server settings in the provider table above. ChatGPT and Cursor are not values of `AI_PROVIDER`. The API does not call them, and they do not allocate, defer, or explain a stored plan. The team directed each use, reviewed the result, and decided what entered the repository.

**ChatGPT** was used for:

- Product and architecture reasoning
- UX and UI ideation
- Technical analysis
- Documentation
- Testing and debugging guidance
- Development planning

**Cursor IDE** was used for:

- AI-assisted implementation
- Code generation
- Refactoring
- Repository analysis
- Test creation
- Implementation review

#### Development effort and AI resource constraints

The team aimed to complete WayLoom as a fully functional, reliable solution within the available development time and resources. Because the project required substantial AI-assisted development and validation, the team collaboratively invested in paid AI plans and services to extend available development capacity.

Even with those additional resources, the available AI usage and development time remained limited compared with the amount of work required to fully realize every aspect of the original vision.

The team therefore prioritized the official competition requirements, the core logistics workflow, deterministic planning, offline capability, security, architecture, and the most valuable AI decision-support features. Any capability that was not safely implementable within the approved architecture was intentionally left unimplemented, and was not fabricated or presented as complete.

## Offline

Offline recording is the Driver delivery outcome and proof of delivery only. Loader, Dispatcher, and Store Manager actions are not queued.

When the outcome or proof request fails to reach the server, the page writes one pending event in the browser IndexedDB database `wayloom-offline`. The event keeps a `clientEventId`, the event type (`delivery outcome` or `proof of delivery`), the stop id, and the payload. The screen says: "Saved on this device. The server has not confirmed it." Passwords, session tokens, and cookies are not stored in that payload.

When the driver shell is online it submits `POST /api/sync/batch`. The same `clientEventId` is not applied twice. The sync row is a reconciliation record. The delivery or proof row is the business record. The batch payload is not stored on the server.

What the driver can see after sync:

| Result | Label |
| --- | --- |
| Applied | synchronized successfully |
| Same client event already stored | already synchronized |
| Network or temporary server failure, under the retry limit | retrying |
| Rejected or unauthorized | rejected |
| Lifecycle or concurrency conflict | conflict requiring attention |

A conflict does not replace the server record with the queued copy. Pending events are not deleted on logout. Local states include Saved Locally, Pending Sync, Syncing, Synced, and Failed / Needs Attention.

Mechanism tests cover replay, rejection, and conflict labels. A live offline browser run against a dispatched seeded route was not completed. The Phase 9 gate was blocked before dispatch existed, and the later production gate did not repeat a live offline pass.

## Significant departures from Designathon

| Designathon expectation | Hackathon implementation | Why it matters to a judge |
| --- | --- | --- |
| Blueprint diagram shows Python and OR-Tools as the planner | `packages/planning` runs inside the Node API. `services/planning` answers `/health` and `/ready` only. OR-Tools is not called. `solverStatus` stays null. | A planning run does not depend on the Python process. |
| Planning screen is a planning workspace | Navigation is labeled **AI Planning**. Allocation is still the deterministic planner. | Use **Run planning** and **Approve plan** for the operational result. Chat and **Refresh explanation** are advisory. |
| Assigned loading tasks | No loader is assigned before verification. Any Loader sees confirmed, unrecorded stops and claims a stop by verifying it. Confirmation does not create a manifest. | Start at **Loading** after the plan is approved. Do not look for a pre-assigned task list. |
| Confirm Receipt and Report Issues | The screen is **Received Deliveries** (`/store/receipts`). Issue details stay on the receipt. | They do not appear under Dispatcher **Exceptions**. |
| Order confirmation and tracking | The order page shows status. Vehicle, route, and arrival are unavailable. | Do not expect a live position. |
| Route map and proof capture | Routes state that GPS is not available. Proof of delivery is one evidence reference. | Photos, signatures, and map position are not part of the demo. |
| Extra Dispatcher areas in the shell | **Vehicles**, **Workflow**, **Analytics**, **Reports**, and **Settings** render "is not available". | They do not add a workflow. Search in the Dispatcher frame is also unavailable. |

## Architecture

```mermaid
flowchart TB
  browser["Browser"]
  web["Next.js apps/web"]
  api["Node.js API apps/api"]
  planner["packages/planning in the API process"]
  ai["Decision-support AI in the API"]
  db["PostgreSQL"]
  py["Python FastAPI services/planning"]

  browser --> web
  web -->|"same-origin /api proxies, session cookie"| api
  api --> planner
  api --> ai
  api --> db
  py -.->|"GET /health and GET /ready only"| py
```

| Piece | What it is |
| --- | --- |
| `apps/web` | Next.js 16, React 19, TypeScript. Role workspaces and proxies under `app/api`. |
| `apps/api` | Node.js `http` server, TypeScript. Domain rules, sessions, import, and seed. |
| `packages/planning` | Deterministic planning engine, contract version 1. |
| `services/planning` | FastAPI process foundation. Not the planner. |
| PostgreSQL | System of record. Prisma 7 with `@prisma/adapter-pg`. |
| OpenRouter | Optional server-side model for plan explanations. |

The browser does not talk to PostgreSQL or to the Python process. Next.js forwards the session cookie to the API.

Sessions last 12 hours. The cookie is `wayloom_session`, `HttpOnly`, `SameSite=Strict`. `Secure` is added when `NODE_ENV` is `production`. The raw session id is stored only as a hash. State-changing requests send `x-wayloom-csrf`, an HMAC of the session id. A header that contains the session id itself is rejected. Passwords are Argon2id. Failed logins are limited in the single API process.

Object scope: Store Manager uses `user_outlets`. Loader records are owned by the loader who verified them. Driver routes use `vehicles.driver_user_id`. A client-supplied role or user id is not accepted.

`docs/architecture.md` records session, CORS, and audit decisions and points at the data model. The diagram above is the running system. The Python box in older blueprint drawings is the process foundation, not the planner.

## Data model

Internal ids are UUIDs. Business ids stay separate (`delivery_id`, outlet `outlet_id`, vehicle `vehicle_id`, `route_id`).

Operational records: User, Session, UserOutlet, Outlet, Vehicle, Order, Trip, TripStop, LoadingRecord, DeliveryRecord, ProofOfDelivery, Deferral, Exception, Receipt, SyncEvent, AuditEvent.

Competition source tables, not updated by planning or delivery: `calendar_source`, `district_travel_source`, `service_allowance_source`, `traffic_speed_source`, `road_conditions_source`. Traffic speed and road conditions are stored and are not inputs to the current trip-time or fuel formulas.

Order status path:

```text
Draft -> Submitted -> Confirmed -> Planned / Allocated -> Loading -> Loaded -> Dispatched -> Delivered -> Receipt Confirmed
```

From Confirmed, planning may set **Deferred**. From Loading, the order may enter **Exception Reported**. Trip status is only `PLANNED` or `CONFIRMED`. Dispatch does not add a third trip status.

Schema and lineage: [docs/data-model.md](docs/data-model.md). Lifecycle rules: [docs/domain-invariants.md](docs/domain-invariants.md). Prisma schema: `apps/api/prisma/schema.prisma`. Migrations: `apps/api/prisma/migrations`.

## Security relevant to judging

- Server session in an `HttpOnly` cookie. The browser script does not store the session token.
- CSRF header on cookie-authenticated state changes.
- Argon2id password hashes.
- Role checks, then object checks, on business routes.
- Store, loader, and driver scope as described above.
- `AI_PROVIDER_API_KEY` stays on the server.
- `/api` responses use `Cache-Control: no-store`.

Login, logout, role denial, object denial, and CSRF rejection write an `AuditEvent`. There is no audit-history screen.

## Known limitations

- The seeded order is the walkthrough order. After it is receipt-confirmed, create-order cannot replace it for a date inside the imported calendar, because submission time is the server clock and the calendar ends `2026-06-28`. Reset `wayloom_test` and run `gate:setup-local` to start again.
- The seeded driver only sees `VEH001` and `VEH035`. A plan that uses another vehicle cannot be delivered with `seed.driver`, and the Vehicles screen cannot change the assignment.
- Loader work is discovered at verification time. There is no prior assignment.
- GPS, live tracking, photos, and signatures are not implemented.
- **Vehicles**, **Workflow**, **Analytics**, **Reports**, and **Settings** have no data source.
- AI exception explanation and operational insights are not connected to a screen. OpenRouter was not exercised live in the browser for the recorded gates.
- Offline queue behavior is implemented and covered by tests. A live offline browser pass on a dispatched route was not recorded.
- A fresh four-role browser walkthrough on a new order was not part of the production-gate record. The API lifecycle test is the recorded end-to-end state sequence.
- No public HTTPS hostname is configured. Local ports are HTTP.

## Documentation

| Topic | File |
| --- | --- |
| AI tool disclosure | [docs/ai-tool-disclosure.md](docs/ai-tool-disclosure.md) |
| AI boundary and governance | [docs/ai-service-boundary.md](docs/ai-service-boundary.md), [docs/ai-governance.md](docs/ai-governance.md) |
| Data model | [docs/data-model.md](docs/data-model.md) |
| Domain invariants | [docs/domain-invariants.md](docs/domain-invariants.md) |
| Architecture notes | [docs/architecture.md](docs/architecture.md) |
| API contracts | [apps/api/README.md](apps/api/README.md) |
| Planning formulas | [packages/planning/README.md](packages/planning/README.md) |
| Python process | [services/planning/README.md](services/planning/README.md) |
| Frontend and CSP | [apps/web/README.md](apps/web/README.md) |
| Local PostgreSQL | [database/postgres/README.md](database/postgres/README.md) |
| Seed | [database/seed/README.md](database/seed/README.md) |
| Competition files | [data/competition-import/README.md](data/competition-import/README.md) |
| Production configuration | [docs/production-configuration.md](docs/production-configuration.md) |
| Health checks | [docs/production-health.md](docs/production-health.md) |
| HTTPS | [docs/production-https.md](docs/production-https.md) |
| Backup and restore | [docs/database-backup.md](docs/database-backup.md), [docs/database-restore.md](docs/database-restore.md) |
| Production gate | [docs/phase-14-production-gate.md](docs/phase-14-production-gate.md) |

Phase review records are the other `docs/phase-*.md` files. They are evidence notes, not a second setup guide.
