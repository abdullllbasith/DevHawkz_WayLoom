[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("development", "test")]
  [string]$Target
)

$ErrorActionPreference = "Stop"

$databases = @{
  development = "wayloom_development"
  test        = "wayloom_test"
}
$database = $databases[$Target]
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$backupDir = Join-Path $repoRoot "backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$stamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")
$output = Join-Path $backupDir "$database-$stamp.dump"

Push-Location $repoRoot
try {
  docker compose exec -T postgres pg_dump --username wayloom_app --dbname $database --format=custom --no-password --file /tmp/wayloom-backup.dump
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  docker compose cp "postgres:/tmp/wayloom-backup.dump" $output
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  docker compose exec -T postgres pg_restore --list /tmp/wayloom-backup.dump | Out-Null
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  docker compose exec -T postgres rm -f /tmp/wayloom-backup.dump
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
  Pop-Location
}

$length = (Get-Item $output).Length
if ($length -le 0) {
  Write-Error "Backup artifact is empty."
  exit 1
}
Write-Output "Backup verified ($length bytes)."
