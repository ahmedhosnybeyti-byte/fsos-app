# SFA Setup — controlled release gate (2026-10-19)

## Current status: controlled release deployed — 2026-10-20

The owner authorized Production deployment, temporarily accepted the external
recovery-custody risk and requested a protected read-only preview before visual
approval. API and Web were deployed; see
[SFA_CONTROLLED_PRODUCTION_RELEASE_20261020.md](SFA_CONTROLLED_PRODUCTION_RELEASE_20261020.md)
for actual deployment IDs, fresh backup/restore evidence, security checks and
the owner's subsequent manual screen-visibility change. No company SFA mode
was activated by the agent. The previous NO-GO below is historical.

## Previous final-preparation decision: NO-GO — independent custody and visual approval pending

See [SFA_FINAL_RELEASE_PREPARATION.md](SFA_FINAL_RELEASE_PREPARATION.md) for the
2026-10-20 final review, the portable recovery test, actual off-device custody
blocker, preview links and the approval-only deployment/rollback sequence.

## Previous technical review: GO — no Production changes applied

The backup, Linux packaging and global-role permission blockers were verified in
the follow-up task. See [SFA_BLOCKERS_20261019.md](SFA_BLOCKERS_20261019.md) for
current evidence, the protected real database backup, restore and migration
compatibility checks, and the exact Linux build verification. Changes are saved
in a local commit only. Final deployment and visual acceptance remain the user's
decision; no push, deploy or Production migration was performed.

## Archived blocked snapshot — superseded by the verification above

Read-only Railway metadata identified project `intuitive-miracle`, Production
environment `90ca5e39-5234-4774-8a53-d8c7873e9cbf`, PostgreSQL service
`f31e5378-c864-4e5c-9d61-11d11dd9de22` (PostgreSQL 18).

The backup API returned only `Pre-Security-Patch Backup`
(`79f7c62f-8883-4710-b018-dd8dcc41207b`), created 2026-08-23, with expiry
2026-09-22 03:47 UTC. It returned no backup schedules. This does not establish
a current recoverable database backup. The local project ZIP is a source backup,
not a backup of Production PostgreSQL. No database migration, seed, permission
grant, tenant activation, commit, push, infrastructure mutation or deploy is
authorized to proceed under this gate result. No staging was created.

## Prepared behavior

- `sfa-setup` uses the existing screen registry and Super Admin screen-access
  editor. Missing configuration means HIDDEN for this screen only; legacy screen
  defaults remain ENABLED. Reset-to-defaults does not activate ERP.
- Direct API calls additionally require CompanyScreenAccessGuard, current SFA
  mode, COMPANY_ADMIN authorization and explicit `sfa.access` + `company.manage`.
- The existing company-details page gains the operating-mode editor, backed by
  the existing Super Admin API and transactional audit service. Nothing changes
  until the administrator explicitly saves a mode change.
- The existing Access Control page now loads the permission catalogue, including
  registered but ungranted capabilities. Previously its union of assigned role
  permissions would hide an ungranted `sfa.access` capability entirely.
- No demo accounts, passwords or fixtures belong in a release artifact. Default
  migration behavior creates no operating-settings or warehouse rows for tenants,
  and grants `sfa.access` to no role.

## Administrator activation after a verified release

1. `/admin/companies`: open the intended company. Under operating mode choose SFA
   and explicitly save. This alone neither grants permissions nor reveals UI.
2. On the same page, set Operations setup to ENABLED and save screen permissions.
3. `/admin/access-control`: for COMPANY_ADMIN retain `company.manage`, select
   `sfa.access`, save and confirm. Existing RBAC grants apply to the global role;
   other companies remain blocked by their mode and screen gates. This is not
   a per-user permission system. Use existing user administration to manage
   company membership, role and active status.
4. An authorized active company administrator can then open `/sfa/setup`, subject
   to the existing subscription guard. No company or role is activated on deploy.

## Archived release prerequisites (see current verification above)

- Obtain and verify a current recoverable Production database backup with an
  identified restore procedure and retention window. Do not test a restore over
  Production. Verify migration history/schema compatibility read-only against the
  actual target; fresh-fixture tests do not prove target-schema parity.
- Validate the two additive migrations on separate PostgreSQL (target major
  version 18 where possible), including defaults, unique keys, tenant FKs and
  unchanged legacy rows. No destructive down migration is needed for code rollback.
- Build and review a clean artifact containing selected source only, excluding
  `.tmp`, local preview databases, ZIP archives, credentials and unrelated WIP.
- Run the migration once using the documented one-off release command, never
  per-replica startup. Release API before web; keep every SFA gate closed.
- Roll back application images if checks fail, leaving the additive tables in
  place and SFA disabled. Known current deployment IDs before any release:
  API `243c7e34-1a29-4552-aeb0-0b3971f6821b`,
  web `8dcaf605-5292-461c-bd10-e6e388308b56`.
- Verify health, authenticated legacy Excel/RIE reads and direct SFA rejection
  after release, without modifying formulas, uploading to real tenants or
  manufacturing customer data. Visual acceptance remains with the user.

## Local evidence

- 101 tests passed across 22 suites without failures/skips or network attempts,
  including Excel/RIE/Visit Copilot regression coverage and isolated additive SQL
  migration tests. An old `/account` test expectation was aligned with the already
  registered account route; its runtime behavior was not changed.
- 15 additional real API checks against a fresh in-memory PostgreSQL/PGlite test
  database verified the Super Admin mode/screen/permission workflow, ungranted
  catalogue discovery, tenant isolation, and immediate lock/revocation. All 44
  migrations ran on that test database only. No Production schema parity or
  restore rehearsal is claimed from these fixture checks.
- API and web TypeScript: zero diagnostics. API build emitted successfully to a
  temporary directory. Credentials/demo account scan found no findings in the
  28 changed/new source files reviewed at that point. Preview helpers and their
  test accounts remain outside the release source under `.tmp`.
- Web production compilation, type validation and all 44 static pages succeeded
  in the isolated source snapshot. Final standalone packaging failed on Windows
  with EPERM creating pnpm symlinks. A complete deployable web artifact is therefore
  not verified. Do not change application settings to hide this failure; verify
  packaging in a suitable Linux build environment before a future release. Local
  font transport and NODE_ENV setup failures were corrected in the temporary
  verification runner only, not in project source/configuration.
