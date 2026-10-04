# TASK-14-06 — Production deployment verification

**Gate result:** PASS

The verifiable checks below passed. Items marked `NOT VERIFIABLE IN CURRENT ENVIRONMENT` are not counted as passed.

## Environment

Local Docker Compose on `127.0.0.1`: PostgreSQL `18.6`, the planning process, and the web container. The API is the host process from `npm run gate:start-api-local` with `NODE_ENV=test` and database `wayloom_test`. This is not a public TLS deployment. Build checks passed on this tree after `8787e05`.

## Services

`GET /health` returned `{"status":"ok"}` for the API and the planning process. `GET /ready` returned `{"status":"ready","database":"ok"}` for the API and `{"status":"ready"}` for the planning process. The planning image was rebuilt from the current source before that probe.

## Four-role workflow

`lifecycle.test.ts` passed inside the API suite. It walks one order through the four roles with AI disabled. A second live order was not created. The seeded order remains the receipt-confirmed journey from Phase 10, and `wayloom_test` was not reset.

## Planning

`@wayloom/planning` tests: 42 passed, including cutoff equality, capacity deferral, and the hard constraints. The API still runs that engine in process.

## Offline

Web tests: 80 passed, including pending delivery events, replay as already applied, and rejection of a session secret.

## Security

API tests: 178 passed, including session cookies, CSRF, RBAC, object authorization, and secret redaction. Production cookies are `Secure` only when `NODE_ENV` is `production`.

`NOT VERIFIABLE IN CURRENT ENVIRONMENT`: a public HTTPS listener. Compose publishes HTTP on `127.0.0.1`. TLS termination remains outside the application, as recorded in `docs/production-https.md`.

## Backup and restore

`wayloom_test` was dumped with `pg_dump` custom format and checked with `pg_restore --list` (110322 bytes). The dump restored into temporary `wayloom_restore` with 14 migrations, 4 users, 120 outlets, and 2 orders. That database was dropped. `wayloom_development` and `wayloom_test` remained. The API was not pointed at the temporary database, because test configuration accepts only `wayloom_test`.

## README

The root README describes the local gate setup, the in-process planner, and `GET /health` versus `GET /ready`.

## Checks

API 178 passed. Web 80 passed. Planning 42 passed. Typecheck, lint, and build passed.

## Limitations

No retention period is configured. One local restore is not a disaster-recovery guarantee. AI stays off unless explicitly enabled and is not part of readiness.
