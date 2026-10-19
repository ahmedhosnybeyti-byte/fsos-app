# SFA Setup — production blocker verification, 2026-10-19

Branch: `codex/erp-foundation`. No push, deploy, Production migration, permission
grant, tenant activation or RIE change is part of this task.

## Current gate

- Backup & Restore: PASS.
- Linux Build: PASS.
- Security & Permissions: PASS.
- Release Readiness: GO for final release review; this does not authorize deployment.

## Railway backup options verified

Read-only Railway metadata confirms the existing Hobby plan and PostgreSQL 18
service in project `intuitive-miracle`, Production environment
`90ca5e39-5234-4774-8a53-d8c7873e9cbf`. The 5,000 MB volume reports
2,672.36 MB used (53.45%). Only the old `Pre-Security-Patch Backup` is listed:
created 2026-08-23, expiry 2026-09-22. No backup schedule is configured.

- Manual/scheduled volume snapshots exist, but the documented manual threshold
  is 50% of volume capacity. Raising capacity or obtaining a limit exception is
  an infrastructure action outside this task. A volume restore targets the same
  project/environment and requires a deployment; it is unsuitable for this drill.
- PITR can restore a sibling database, but enabling it changes variables and
  redeploys the source. It is not configured on the inspected service and was
  not enabled here.
- A logical `pg_dump` is portable and can be restored locally without deploying
  anything. No additional subscription was purchased or needed for this route;
  ordinary Railway TCP egress remains billable under the existing plan.

References: [Railway backups](https://docs.railway.com/volumes/backups),
[PostgreSQL restore guide](https://docs.railway.com/guides/postgres-backups-restores).

The repeatable Windows drill is `tools/release/backup-restore-drill.ps1` with a
PostgreSQL 18 `-PgBin` path. It checks the explicit source endpoint, reads its
credentials in memory, enforces read-only source sessions, and takes one
consistent custom-format dump with a five-second lock wait limit. Full database
export is the explicitly authorized disaster-recovery exception, outside the
application/RIE request paths; no raw fact dataset is loaded into Node.

Restore always uses a fresh local PostgreSQL 18 cluster on `127.0.0.1:55479`,
never a caller-supplied database URL. Errors abort the restore transaction.
Evidence compares relation names and migration history and records local restored
company/user counts. Owners/SQL ACLs are intentionally omitted; application RBAC
tables are included. This is an application-database backup, not a backup of
Railway configuration or object-storage files.

Backup directories are restricted to the current Windows user and SYSTEM.
`protect-database-backup.ps1` encrypts the dump with AES-256-CBC and HMAC-SHA256,
protects its random key with Windows DPAPI CurrentUser, and verifies decryption
against the original SHA-256 before removing plaintext. Recovery uses
`expand-database-backup.ps1 -EncryptedArchive <production.dump.aes>`; preserve the
same Windows profile and the `.key.dpapi`, `.hmac`, and `.encryption.json` files.
This local copy has no automatic expiry; it is not an off-device backup.
`.local-backups` is excluded from Git and Docker, and temporary verification
directories are excluded from Docker context. No database archive is committed.

The real Production dump completed successfully (114,785,871 bytes), restored
without errors on PostgreSQL 18.6, and matched the source's 50 public relations
and migration-history records. The encrypted archive and private evidence are in
`.local-backups/20261019T120905Z/`. Original dump SHA-256:
`959A28A4D0B119ED113A01161E7A861CFE2EF29DE51EBFE9B51A60B24436CB39`.
The source history contains 43 records, 42 successfully applied migrations; all
applied migration contents match the repository allowing LF/CRLF line endings.
Only the two expected SFA migrations are pending. Both were additionally checked
against the real restored PostgreSQL 18 schema inside BEGIN/ROLLBACK: no backfill
or SFA role grant. No migration file or Production migration record was changed.

The first local restore attempt exposed a PowerShell daemon-pipe wait. The
launcher was corrected and the same completed archive was reused; no second
full dump was taken. The local server is stopped after verification. An earlier
interrupted archive is not counted as a valid backup. Preserve the verified
encrypted archive and its DPAPI recovery material together.

## Linux standalone evidence

The Docker Desktop daemon could not start because of its stale inference socket.
Verification instead used WSL2 with a task-owned ext4 image and the official
Linux/amd64 `node:22-slim` root filesystem, without changing Docker settings.
The image layers were SHA-256 verified. The same prune/install/build/standalone
copy steps as `Dockerfile.web` ran on Node 22.23.3 with pnpm 11.11.0 and the frozen
lockfile. Google fonts were fetched normally; no mocked fonts or application
configuration workaround was used.

- Image digest: `sha256:efd0ab5780c2d9ab1f0f869571a00d5edb17793bff4cce4a2792e3eb0ffc7562`.
- 292 source files were compared byte-for-byte with the working tree.
- Source manifest SHA-256: `5520e9d64f4fae5d6b967c476b13b45ff22daffbe6707352d9778d8b964f42a8`.
- Compilation, type validation, all 44 static pages, tracing and standalone
  packaging passed. The assembled runtime served `/sfa/setup` and a referenced
  JavaScript asset with HTTP 200.

The previously observed pnpm-symlink EPERM is a Windows verification-environment
failure and did not reproduce on Linux. No application build fix was warranted.

## Permission scope evidence

The existing role grants are global: granting `sfa.access` and `company.manage`
to COMPANY_ADMIN affects every holder of that role. This is not per-company or
per-user RBAC. Access Control now states this scope explicitly. `company.manage`
already belongs to the intended company-administrator role and does not grant
platform/company activation permissions.

34 focused checks against the actual Nest API and a fresh in-memory PostgreSQL
fixture verified two companies using the same globally granted role: independent
warehouse codes, scoped lists, cross-company read/write rejection, no self/global
permission escalation, no bypass of analysis mode or locked screens, and immediate
denial after revoking either permission on an existing session. All fixture
changes were isolated. No real roles or companies were changed.

The previously successful 101 tests / 22 suites and earlier typechecks were not
repeated. Linux packaging and the additional global-role security scenarios are
new evidence. The encryption/recovery helpers also passed one random-data
roundtrip. Visual acceptance remains the user's final UI review; the runtime
smoke check does not claim visual acceptance.

## System Design Gate

PASS for the reviewed implementation: tenant predicates, default ANALYSIS_ONLY,
explicit SFA/mode/screen/role gates and bounded existing query contracts remain.
The trade-off is a local logical backup and isolated restore instead of changing
Production infrastructure. Deployment remains an explicit later decision.
