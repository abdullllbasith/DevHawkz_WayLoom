# PostgreSQL backup

PostgreSQL is the only application database. This procedure uses `pg_dump` custom format from the Compose `postgres` service. It does not add another database or a backup service. No retention period is configured.

## Scope

The dump is one local database: `wayloom_development` or `wayloom_test`. It includes schema and data. It does not include roles, passwords, or the other database. Production backups use the same `pg_dump` command against the production database from the deployment host. This repository script refuses any target other than `development` or `test`.

## Command

From the repository root, with Compose PostgreSQL running:

```text
powershell -File database/postgres/backup-database.ps1 -Target test
```

The script runs `pg_dump` inside the container as `wayloom_app` over the local socket, so the password is not placed on the command line. The custom-format file is copied to `backups/` and checked with `pg_restore --list`. `backups/` is not committed. Treat the file as sensitive data.

## Schema

Restoring the dump restores the migrated schema and rows together. Prisma migrations are not replayed on top of a complete dump. A dump taken before the latest migration is behind the application until that migration is applied with `prisma migrate deploy` after restore.
