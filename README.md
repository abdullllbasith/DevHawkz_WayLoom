# WayLoom

Monorepo for the WayLoom logistics application. The application coordinates orders, planning, loading, delivery, and receipt across Dispatcher, Loader, Driver, and Store Manager roles.

## Layout

```text
apps/web/                 Next.js frontend
apps/api/                 Node.js API
services/planning/        Python FastAPI process foundation
packages/ui/              shared UI
packages/domain/          shared domain contracts
packages/planning/        deterministic planning engine
packages/shared/          generic shared utilities
database/migrations/      Prisma migrations
database/seed/            local development and test seed
data/competition-import/  local competition inputs; do not commit datasets
docs/                     design and review notes
```

`packages/planning/` is the deterministic planning engine. The API executes it. `services/planning/` is a separate FastAPI process. It does not run that engine, call a solver, or write planning results.

## Prerequisites

- Node.js `>=24.19.0`, declared in `package.json` `engines`
- npm `11.17.0`, the only JavaScript package manager for this repository
- Python 3.12 for the planning service, declared in `services/planning/.python-version`

The planning service uses a local virtual environment and pip. Dependencies are locked in `services/planning/pylock.toml`. The virtual environment is not committed.

## Package manager

Use npm only. The lockfile is `package-lock.json`. Do not add `yarn.lock` or `pnpm-lock.yaml`.

## Environment

`.env.example` lists variable names and placeholders. It contains no secrets.

| Context     | Where configuration comes from                          | Database                        |
| ----------- | ------------------------------------------------------- | ------------------------------- |
| Development | Untracked local `.env`, copied from `.env.example`      | `DATABASE_URL`                  |
| Test        | A separate test environment, not the development `.env` | `TEST_DATABASE_URL`             |
| Production  | Deployment configuration                                | Supplied outside the repository |

Do not commit `.env` or any `.env.*` file other than `.env.example`. Do not reuse development values for test or production. Production secrets are never stored in the repository. `LOG_LEVEL=info` is a safe default. Database user, password, session secret, and any future provider key are secrets and must be supplied outside source control.

`npm run dev` starts the Next.js frontend only. `npm run dev:api` starts the Node.js API only. The planning service starts with its own Python command, documented in `services/planning/README.md`. Those host commands use `127.0.0.1`.

`docker compose up -d` starts PostgreSQL, the API, the planning service, and the frontend. The API container talks to PostgreSQL through the Compose hostname `postgres`. Published ports stay on `127.0.0.1`. Database names, roles, and reset rules are in `database/postgres/README.md`.

Local PostgreSQL setup, when `DATABASE_URL` is remote, is:

```text
docker compose up -d postgres
npm run gate:setup-local --workspace @wayloom/api
npm run gate:start-api-local --workspace @wayloom/api
```

`gate:setup-local` deploys migrations, imports the local competition files, and runs the development seed against `wayloom_test`. It refuses a non-local database. The seed password is documented in `database/seed/README.md` and is not a production credential. A progressed seed order is left unchanged.

## Commands

```text
npm install
npm run dev
npm run dev:api
npm run typecheck
npm run lint
npm run format
npm run format:check
npm run build
npm test --workspace @wayloom/api
npm test --workspace @wayloom/web
npm test --workspace @wayloom/planning
```

Build the API before its tests. `GET /health` on the API reports that the API process is up. It does not check PostgreSQL, planning, or AI. `npm run build` compiles the API and creates the frontend production build. It does not start the planning service.

## Git

Git ignores dependencies, build output, local environment files, editor and OS metadata, Python virtual environments, and local database files. The `data/` directory is not ignored. Do not commit competition datasets or secrets just because a path is visible to Git.
