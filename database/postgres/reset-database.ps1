[CmdletBinding()]
param(
  [Parameter()]
  [string]$Target
)

$ErrorActionPreference = "Stop"

$databases = @{
  development = "wayloom_development"
  test        = "wayloom_test"
}

if ([string]::IsNullOrWhiteSpace($Target) -or -not $databases.ContainsKey($Target)) {
  Write-Error "Refusing to reset. Pass -Target development or -Target test."
  exit 1
}

$database = $databases[$Target]
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

$statements = @(
  @"
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$database' AND pid <> pg_backend_pid();
"@,
  "DROP DATABASE IF EXISTS $database;",
  "CREATE DATABASE $database OWNER wayloom_app;",
  "REVOKE ALL ON DATABASE $database FROM PUBLIC;",
  "GRANT CONNECT, TEMP ON DATABASE $database TO wayloom_app;"
)

Push-Location $repoRoot
try {
  foreach ($statement in $statements) {
    docker compose exec -T postgres psql -v ON_ERROR_STOP=1 --username wayloom_bootstrap --dbname postgres -c $statement
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }
}
finally {
  Pop-Location
}

Write-Output "Reset the $Target database ($database)."
