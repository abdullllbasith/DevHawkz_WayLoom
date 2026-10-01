# PostgreSQL

Local development and test database foundation. This is not a production database.

PostgreSQL `18.6` is pinned as `postgres:18.6` in `docker-compose.yml`. The repository did not specify a version. `18.6` is the current stable patch of the official image, not a floating `latest` or `18` tag.

## Naming

| Name                  | Use                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------- |
| `wayloom_bootstrap`   | Infrastructure superuser. Used only to initialize and reset databases.                  |
| `wayloom_app`         | Application role. Not a superuser. Owns the development and test databases.             |
| `wayloom_development` | Development database.                                                                   |
| `wayloom_test`        | Test database. Separate from development.                                               |
| `postgres`            | Maintenance database. Reset commands connect here, not to the database being recreated. |

The server listens on `127.0.0.1:5432` only.

## Environment

Copy `.env.example` to an untracked `.env` and replace every `PASSWORD` placeholder. Do not commit `.env`.

| Variable               | Purpose                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `POSTGRES_PASSWORD`    | Password for `wayloom_bootstrap`.                                  |
| `WAYLOOM_APP_PASSWORD` | Password for `wayloom_app`.                                        |
| `DATABASE_URL`         | Development connection for `wayloom_app` to `wayloom_development`. |
| `TEST_DATABASE_URL`    | Test connection for `wayloom_app` to `wayloom_test`.               |

`DATABASE_URL` and `TEST_DATABASE_URL` must use the same `wayloom_app` password as `WAYLOOM_APP_PASSWORD`. Production credentials are supplied outside the repository.

## Startup

From the repository root:

```text
docker compose up -d postgres
docker compose ps postgres
```

The named volume `wayloom_postgres_data` keeps development and test data across restarts. The init script runs only when that volume is empty. It creates `wayloom_app`, `wayloom_development`, and `wayloom_test`.

## Connection check

Use the application role, not the bootstrap superuser:

```text
docker compose exec -T postgres psql "postgresql://wayloom_app@/wayloom_development" -c "SELECT 1;"
```

Pass the password through the client environment or a prompt. Do not put it in the command line or in logs. A successful check returns one row. Also confirm `current_database()` and that `usesuper` is false for `wayloom_app`.

Repeat the check with `TEST_DATABASE_URL` against `wayloom_test`.

## Reset

Reset one database at a time. The script refuses a missing or unknown target, so it cannot guess and it cannot reset both databases at once.

```text
powershell -File database/postgres/reset-database.ps1 -Target development
powershell -File database/postgres/reset-database.ps1 -Target test
```

Each command drops and recreates only the named database, then restores ownership to `wayloom_app`. The other database is left in place. The bootstrap role is used only for this operation because the application role is not allowed to create databases.

To recreate the whole local instance, stop PostgreSQL and remove the named volume explicitly:

```text
docker compose down postgres
docker volume rm wayloom_wayloom_postgres_data
docker compose up -d postgres
```

That deletes both local databases. It is not a reset of one environment. The volume name includes the Compose project name `wayloom`.

## Compose

This `postgres` service is the only PostgreSQL definition. The API, planning, and web services in `docker-compose.yml` reuse it. The API container connects with hostname `postgres`. Host commands keep using `127.0.0.1`. `wayloom_development` and `wayloom_test` stay separate. The planning service does not connect to PostgreSQL.
