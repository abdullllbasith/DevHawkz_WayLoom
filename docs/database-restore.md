# PostgreSQL restore verification

Restore is verified on a temporary database named `wayloom_restore`. That database is not `wayloom_development`, `wayloom_test`, or a production database. The script drops it after the checks. It is not a second application database.

## Command

```text
powershell -File database/postgres/restore-database.ps1 -BackupFile backups\<dump>
```

The dump must come from `backup-database.ps1`. The script creates `wayloom_restore` as `wayloom_app`, restores with `pg_restore`, then reads `current_database()`, the `_prisma_migrations` count, and the `users`, `outlets`, and `orders` counts. It does not print passwords or row contents. A complete dump already contains the migrated schema, so this check does not run `prisma migrate deploy`.

The API configuration accepts only `wayloom_test` in test and `wayloom_development` in development. This verification does not point the API at `wayloom_restore`, because that would require a new database name in the approved configuration. Connectivity is the application role reading the restored database. The running API health check stays on `wayloom_test`.

One local restore does not define a recovery-point or recovery-time guarantee.

The `wayloom_test` dump from 2026-10-04 restored 14 migration rows, 4 users, 120 outlets, and 2 orders. The temporary database was then dropped. `wayloom_test` was not overwritten.
