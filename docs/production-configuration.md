# Production configuration

Production uses the same API, web, planning process, and PostgreSQL database as development. It does not add a configuration service, a second database, or a second planner.

## Required when `NODE_ENV` is `production`

| Variable | Rule |
|---|---|
| `API_HOST` | Required. No default. |
| `API_PORT` | Required integer from 1 to 65535. |
| `DATABASE_URL` | Required PostgreSQL URL. It must not name `wayloom_development` or `wayloom_test`, and it must not use a placeholder password. |
| `LOGIN_RATE_LIMIT_MAX` | Required with the window. |
| `LOGIN_RATE_LIMIT_WINDOW_SECONDS` | Required with the maximum. |
| `PLANNING_HOST` | Required by the planning process. Bind address only. |
| `PLANNING_PORT` | Required by the planning process. Bind port only. |

The API fails to start when one of its required values is missing or invalid. The startup error is redacted before it is printed. `loadConfig` does not put the database password in the configuration object.

## Optional

| Variable | Rule |
|---|---|
| `LOG_LEVEL` | `error`, `warn`, `info`, or `debug`. Omitted means `info`. |
| `WEB_ORIGIN` | HTTPS origin of the deployed frontend. Omitted means the API sends no CORS headers. A local or HTTP origin is rejected. |
| `WEB_HTTPS` | `true` sends HSTS. Omitted means HSTS is not sent. `true` is rejected outside production. |
| `API_ORIGIN` | HTTPS API origin added to the frontend `connect-src`. Omitted means the page origin only. |
| `AI_ENABLED` | Must be the string `true` to enable decision support. Any other value leaves it off. |
| `AI_PROVIDER` | `deterministic` restates approved facts on the server. `openrouter` calls OpenRouter with model `google/gemini-2.5-flash-lite`. Any other value stays disabled. There is no `AI_MODEL` variable. |
| `AI_PROVIDER_API_KEY` | Server only. Required by `openrouter`. It is not returned to the browser, read by the web app, or committed. |
| `AI_TIMEOUT_MS` | Optional integer from 100 to 10000. Omitted means 2000. Bounds the provider request. |
| `AI_MAX_RESPONSE_CHARS` | Optional integer from 200 to 20000. Omitted means 4000. Bounds the model text and the validated advisory. |

`PLANNING_SERVICE_URL` is not required. No service-to-service planning URL is approved. The API runs `@wayloom/planning` in process.

## Development and test

Development and test may omit the API and planning bind address. Those defaults are `127.0.0.1` with ports `4000` and `8000`. Test `DATABASE_URL` must be `127.0.0.1` and `wayloom_test`. Development must use local `wayloom_development` or a remote `postgres` database. Login rate limits default to 20 failures and 900 seconds only when both values are omitted. `.env.example` contains placeholders, not secrets.
