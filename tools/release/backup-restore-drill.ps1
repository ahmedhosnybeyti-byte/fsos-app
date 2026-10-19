# Run from the official workspace with PostgreSQL 18 portable client/server tools.
# DATABASE_PUBLIC_URL is read in memory from the explicit Railway service only.
# Production is read-only; restore always uses a new local loopback-only cluster.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$PgBin, [string]$ExistingArchive)
$ErrorActionPreference = 'Stop'
if ((Get-Location).Path.TrimEnd('\') -ne 'D:\Field Sales OS') { throw 'Official workspace required' }
$PgBin = (Resolve-Path -LiteralPath $PgBin).Path
$backupRoot = Join-Path (Get-Location) '.local-backups'
if ($ExistingArchive) {
  $ExistingArchive=(Resolve-Path -LiteralPath $ExistingArchive).Path
  if (!$ExistingArchive.StartsWith([IO.Path]::GetFullPath("$backupRoot\"),[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($ExistingArchive) -ne 'production.dump') { throw 'Unexpected existing archive' }
  $runPath=Split-Path -Parent $ExistingArchive
} else {
  $runPath = Join-Path $backupRoot ([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ'))
  New-Item -ItemType Directory -Path $runPath | Out-Null
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $runPath /inheritance:r /grant:r "${identity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE) { throw 'Unable to secure backup directory' }
$dump = Join-Path $runPath 'production.dump'
$data = Join-Path $runPath 'restore-data'
$saved = @{}
$pgNames=@('PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT') + @(Get-ChildItem Env: | Where-Object Name -like 'PG*' | Select-Object -ExpandProperty Name)
foreach ($name in ($pgNames | Select-Object -Unique)) {
  $saved[$name] = [Environment]::GetEnvironmentVariable($name)
  [Environment]::SetEnvironmentVariable($name,$null)
}
$started = $false
function Run-Pg([string]$Program, [string[]]$Arguments) {
  & (Join-Path $PgBin "$Program.exe") @Arguments
  if ($LASTEXITCODE) { throw "$Program failed (exit $LASTEXITCODE)" }
}
$schemaSql = @'
SELECT jsonb_build_object('relations', (SELECT jsonb_agg(jsonb_build_array(c.relname,c.relkind) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','S','v','m')), 'migrations', (SELECT jsonb_agg(jsonb_build_array(migration_name,checksum,finished_at IS NOT NULL,rolled_back_at IS NOT NULL) ORDER BY migration_name) FROM _prisma_migrations));
'@
try {
  $variablesRaw = & railway variable list --project 1f6ed45a-31f6-4442-a882-406dde417f5d --environment 90ca5e39-5234-4774-8a53-d8c7873e9cbf --service f31e5378-c864-4e5c-9d61-11d11dd9de22 --json
  if ($LASTEXITCODE) { throw 'Railway variable access unavailable' }
  $variables = ($variablesRaw -join "`n") | ConvertFrom-Json
  $url = [Uri]$variables.DATABASE_PUBLIC_URL
  if ($url.Host -ne 'tokaido.proxy.rlwy.net' -or $url.Port -ne 55392) { throw 'Unexpected source endpoint' }
  $login = $url.UserInfo.Split(':',2)
  $env:PGHOST=$url.Host; $env:PGPORT=[string]$url.Port; $env:PGDATABASE=$url.AbsolutePath.TrimStart('/')
  $env:PGUSER=[Uri]::UnescapeDataString($login[0]); $env:PGPASSWORD=[Uri]::UnescapeDataString($login[1])
  $env:PGSSLMODE='require'; $env:PGCONNECT_TIMEOUT='15'
  $env:PGOPTIONS='-c default_transaction_read_only=on -c lock_timeout=5000 -c statement_timeout=120000'
  $variablesRaw=$null; $variables=$null; $url=$null; $login=$null
  $sourceSchema = (Run-Pg 'psql' @('-X','-A','-t','-v','ON_ERROR_STOP=1','-c',$schemaSql)) -join ''
  $version = (Run-Pg 'psql' @('-X','-A','-t','-c','SHOW server_version_num')) -join ''
  if ([int]$version -lt 180000 -or [int]$version -ge 190000) { throw 'Expected PostgreSQL 18 source' }
  Write-Output 'READ_ONLY_SOURCE_VERIFIED; starting consistent custom-format backup'
  [IO.File]::WriteAllText((Join-Path $runPath 'source-schema.json'),$sourceSchema)
  if (!$ExistingArchive) {
    Run-Pg 'pg_dump' @('--format=custom','--no-owner','--no-privileges','--lock-wait-timeout=5000',"--file=$dump")
  } else {
    Run-Pg 'pg_restore' @('--list',$dump) | Out-Null
  }
  $dumpHash=(Get-FileHash -LiteralPath $dump -Algorithm SHA256).Hash
  Write-Output 'BACKUP_CREATED; starting isolated PostgreSQL 18 restore'
  $restorePassword = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  $passwordFile = Join-Path $runPath 'init.password'
  [IO.File]::WriteAllText($passwordFile,$restorePassword)
  Run-Pg 'initdb' @('-D',$data,'-U','postgres','-A','scram-sha-256',"--pwfile=$passwordFile",'--encoding=UTF8','--locale=C') | Out-Null
  Remove-Item -LiteralPath $passwordFile
  $env:PGHOST='127.0.0.1'; $env:PGPORT='55479'; $env:PGUSER='postgres'; $env:PGPASSWORD=$restorePassword
  $env:PGDATABASE='postgres'; $env:PGSSLMODE='disable'; $env:PGOPTIONS=''
  # A daemon's inherited pipe handles can keep a PowerShell native pipeline
  # open after pg_ctl exits. Wait for that process, not the server tree/pipes.
  $serverLog=Join-Path $runPath 'postgres.log'
  $startArgs="-D `"$data`" -l `"$serverLog`" -o `"-h 127.0.0.1 -p 55479 -c ssl=off`" -w start"
  $starter=Start-Process -FilePath (Join-Path $PgBin 'pg_ctl.exe') -ArgumentList $startArgs -WindowStyle Hidden -PassThru
  if (!$starter.WaitForExit(60000) -or $starter.ExitCode -ne 0) { throw 'Local PostgreSQL failed to start' }
  $started=$true
  Run-Pg 'psql' @('-X','-v','ON_ERROR_STOP=1','-c','CREATE DATABASE restore_verify TEMPLATE template0') | Out-Null
  $env:PGDATABASE='restore_verify'
  Run-Pg 'pg_restore' @('--exit-on-error','--single-transaction','--no-owner','--no-privileges','--dbname=restore_verify',$dump)
  $restoredSchema=(Run-Pg 'psql' @('-X','-A','-t','-v','ON_ERROR_STOP=1','-c',$schemaSql)) -join ''
  if ($sourceSchema -ne $restoredSchema) { throw 'Restored relations/migration history differ from source' }
  $restoredCounts=(Run-Pg 'psql' @('-X','-A','-t','-v','ON_ERROR_STOP=1','-c',"SELECT json_build_object('companies',(SELECT count(*) FROM companies),'users',(SELECT count(*) FROM users),'migrations',(SELECT count(*) FROM _prisma_migrations));")) -join ''
  @{checkedAt=[DateTime]::UtcNow.ToString('o');result='PASS';sourceServerVersion=$version;dumpSha256=$dumpHash;dumpBytes=(Get-Item -LiteralPath $dump).Length;schemaAndMigrationParity=$true;restoreCounts=($restoredCounts | ConvertFrom-Json);productionWrites=$false;restoreTarget='new local PostgreSQL 18 cluster on 127.0.0.1:55479';scope='logical application database; ownership/ACL intentionally excluded'} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $runPath 'evidence.json')
  Write-Output "BACKUP_RESTORE_PASS $runPath"
  & (Join-Path $PSScriptRoot 'protect-database-backup.ps1') -ArchivePath $dump
} finally {
  if ($started) { & (Join-Path $PgBin 'pg_ctl.exe') -D $data -m fast -w stop | Out-Null }
  foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name,$saved[$name]) }
  # Keep the encrypted archive and ACL-restricted stopped cluster for inspection.
  # Never upload this directory or add it to Git/build context.
}
