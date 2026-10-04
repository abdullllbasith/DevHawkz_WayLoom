# Production health checks

`GET /health` is liveness. It reports that the process is up. It does not check PostgreSQL, the planning process, or AI, and it does not change application state.

`GET /ready` is readiness.

| Service | Ready | Not ready |
|---|---|---|
| API | PostgreSQL answers `SELECT 1`. Response `{ "status": "ready", "database": "ok" }`. | The database probe is missing or throws. HTTP 503 `{ "status": "not_ready", "database": "unavailable" }`. |
| Planning process | The process started with valid configuration. Response `{ "status": "ready" }`. | The process is not reachable. |

The API does not call the planning process. No planning integration URL is approved, and `@wayloom/planning` runs inside the API. A stopped planning process is that process's own failed probe. It is not reported as a successful planning run, and it does not make the API database readiness fail. AI is not part of either check. A disabled decision-support provider leaves the deterministic API ready.

Neither response includes a connection string, a password, a stack trace, or business data. `GET /ready` uses `Cache-Control: no-store`. Compose container health checks stay on `GET /health` so a process can be alive before a dependency probe is useful. Deployment readiness should call `GET /ready`.
