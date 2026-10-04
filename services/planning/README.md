# services/planning

WayLoom Python FastAPI planning service foundation.

This directory is the executable planning service. `packages/planning/` remains the separate TypeScript contract, version 1. Planning algorithms, OR-Tools, AI, and database access are not implemented. This service does not persist planning results. It is not a production deployment.

## Tooling

Python 3.12, declared in `.python-version`. Dependencies are declared in `pyproject.toml` and locked with pip in `pylock.toml`. The virtual environment is local and ignored by Git. No second Python package manager is used.

```text
python -m venv .venv
.venv\Scripts\python -m pip install --upgrade pip==26.2.1
.venv\Scripts\python -m pip install -r pylock.toml
.venv\Scripts\python -m app
```

`pylock.toml` is a pip lock for CPython 3.12 on Windows. pip 26 can install it. The virtual environment created by Python 3.12 starts with an older pip, so the upgrade step is required.

The Compose image is Linux. It installs `fastapi==0.142.2` and `uvicorn==0.54.0` from `pyproject.toml` so it does not use the Windows wheels in `pylock.toml`. There is no second lockfile.

## Configuration

The process reads the repository root `.env` when that file exists. Existing environment variables win over the file. `NODE_ENV` must be `development`, `test`, or `production`.

In development and test, `PLANNING_HOST` defaults to `127.0.0.1` and `PLANNING_PORT` defaults to `8000`. In production both values are required. Development reloads code. Production does not.

`PLANNING_HOST` and `PLANNING_PORT` are this process's bind address. They are not an approved integration URL. `GET /health` reports that this process is up. `GET /ready` reports that this process started with valid configuration. Neither check reads PostgreSQL, calls the Node.js API, runs a planning operation, or checks AI.

## Errors

Unexpected failures return JSON:

```json
{ "error": { "code": "internal_error", "message": "Internal server error." } }
```

Production responses do not include stack traces. The server logs the failure without printing passwords, session secrets, or connection strings.
