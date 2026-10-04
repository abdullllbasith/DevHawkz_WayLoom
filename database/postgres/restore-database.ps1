[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile
)

$ErrorActionPreference = "Stop"

$dump = Resolve-Path $BackupFile
if ($dump.Path -notmatch "\.dump$") {
  Write-Error "Refusing to restore. Pass a .dump file from backup-database.ps1."
  exit 1
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$database = "wayloom_restore"

function Invoke-Postgres {
  param([string]$Statement)
  docker compose exec -T postgres psql -v ON_ERROR_STOP=1 --username wayloom_bootstrap --dbname postgres -c $Statement
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Push-Location $repoRoot
try {
  Invoke-Postgres @"
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$database' AND pid <> pg_backend_pid();
"@
  Invoke-Postgres "DROP DATABASE IF EXISTS $database;"
  Invoke-Postgres "CREATE DATABASE $database OWNER wayloom_app;"
  Invoke-Postgres "REVOKE ALL ON DATABASE $database FROM PUBLIC;"
  Invoke-Postgres "GRANT CONNECT, TEMP ON DATABASE $database TO wayloom_app;"

  docker compose cp $dump.Path "postgres:/tmp/wayloom-restore.dump"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  docker compose exec -T postgres pg_restore --username wayloom_app --dbname $database --no-owner --no-password --exit-on-error /tmp/wayloom-restore.dump
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  docker compose exec -T postgres psql -v ON_ERROR_STOP=1 --username wayloom_app --dbname $database -c "SELECT current_database() AS database, (SELECT count(*) FROM _prisma_migrations) AS migrations, (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM outlets) AS outlets, (SELECT count(*) FROM orders) AS orders;"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
  docker compose exec -T postgres rm -f /tmp/wayloom-restore.dump | Out-Null
  docker compose exec -T postgres psql -v ON_ERROR_STOP=1 --username wayloom_bootstrap --dbname postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$database' AND pid <> pg_backend_pid();" | Out-Null
  docker compose exec -T postgres psql -v ON_ERROR_STOP=1 --username wayloom_bootstrap --dbname postgres -c "DROP DATABASE IF EXISTS $database;" | Out-Null
  Pop-Location
}

Write-Output "Restore verification finished and the temporary database was dropped."
