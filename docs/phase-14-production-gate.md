# TASK-14-06 — Production deployment verification

**Gate result:** PASS

Verifiable checks in this environment passed. Items marked `NOT VERIFIABLE IN CURRENT ENVIRONMENT` are listed below and are not treated as completed verification.

## Environment

Local Compose on `127.0.0.1`: PostgreSQL `wayloom_test`, the API process from `gate:start-api-local`, the rebuilt planning container, and the existing web container. Application commit before this report: `8787e05`. No public hostname and no TLS listener are configured.

## Services

`GET /health` returned `{"status":"ok"}` for the API and the planning process. `GET /ready` returned `{"status":"ready","database":"ok"}` for the API and `{"status":"ready"}` for the planning process. The API check does not include AI and does not run planning.

## Four-role workflow

`lifecycle.test.ts` passed inside the API suite: one order moves through store, dispatcher, loader, and driver without AI. A second live replay was not started. The seeded order is already receipt confirmed, and this gate did not reset `wayloom_test`.

## Planning, offline, and security

Planning tests: 42 passed, including cutoff equality and hard constraints. Web tests: 80 passed, including offline replay and rejection of a session secret. API tests: 178 passed, including CSRF, object authorization, production cookies, and configuration redaction.

## Backup and restore

A `wayloom_test` custom dump was checked with `pg_restore --list` (110322 bytes). Restore into `wayloom_restore` read 14 migrations, 4 users, 120 outlets, and 2 orders. That temporary database was dropped. `wayloom_development` and `wayloom_test` remained. The API was not pointed at the temporary database.

## README

The root README matches the local commands, the deterministic planner, and `GET /health` versus `GET /ready`.

## NOT VERIFIABLE IN CURRENT ENVIRONMENT

- Public HTTPS. Local ports are HTTP. Production `Secure` cookies and HSTS are covered by tests when `NODE_ENV=production` and `WEB_HTTPS=true`.
- A fresh live four-role browser walkthrough on a new order.
- An API process bound to the temporary restore database.

## Checks

API 178, web 80, planning 42, typecheck, lint, and build passed. Phase 15 was not started.
