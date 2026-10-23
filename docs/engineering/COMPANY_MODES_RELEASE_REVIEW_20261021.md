# Company modes release review — 2026-10-21

## Decision

**Production release: BLOCK pending explicit migration approval and remaining Railway verification.** No push, deployment, Production migration, company activation or Demo creation was performed. Docker Desktop was not repaired or reconfigured; project Docker/startup configuration is preserved.

Candidate: `41f06ee7b29cb797a55adcd8501eaaaee3c7490d`, local branch `codex/company-modes-production-20261021`, clean isolated checkout `.quality/company-release-20261021/review`. This backports Company Modes from `624321d` onto deployed source `7d59abb`, with test-only reliability tooling from `37931df`. The root checkout and concurrent WMS edits were preserved.

## Included and excluded

- Super Admin Create Company and company settings/edit: bilingual operating modes `ANALYSIS_ONLY`, `SFA`, `FULL_ERP`; Initial Plan remains independent. Existing user permissions, screen admission and subscription controls still apply.
- Server mode checks support FULL_ERP without granting users permissions or activating existing tenants. Deferred warehouse/accounting/invoice operations are identified as unavailable.
- Atomic provisioning/audit transaction fix is included.
- WMS phase 01/02/core, their migrations, new Demo seed/import and unrelated local work are excluded. No new operational invoice screen/controller exists in this release; existing invoice analytics remain unchanged.

## Evidence

All commands ran against the isolated candidate, using the actual release base `7d59abb`:

| Check | Result |
| --- | --- |
| `pnpm quality --base 7d59abb` | PASS: 494 tests, four workspace typechecks |
| `pnpm quality:postgres` | PASS: 79 isolated SQL tests |
| `pnpm quality:release` | PASS: 494 tests, four workspace typechecks |
| Failures / skips / TODOs in passing gates | Zero |
| API + Web production build | PASS locally; see Windows qualification below |
| Native PostgreSQL 18.6 migration compatibility | PASS on existing isolated loopback test cluster; deployed baseline plus new enum, synthetic Egypt/Saudi fingerprints unchanged |
| Production preservation inspection | PASS: bounded read-only metadata fingerprints unchanged for all seven companies, user/role/subscription controls, settings and migration ledger |

The ordinary Windows build failed at standalone directory symlink creation (`EPERM`), after compilation/typechecks/static generation. Re-running the unchanged build with an external local helper that verifies equivalent directory junction targets passed all three build tasks. No application or deployment configuration was modified. This is Windows packaging evidence, **not Linux container evidence**. Linux API/Web image builds remain unperformed and must succeed through Railway's existing builders after migration approval. No new Production login/create/edit smoke test has been performed because there is no new deployment. No real customer company was edited.

Prior local browser checks of the shared company UI covered RTL, themes and mobile; the final isolated release candidate has not had a fresh complete browser acceptance run. Design System Gate: **WARN** for that remaining verification. System Design Gate: **PASS for local implementation** (authorization, isolation, additive compatibility and transactional audit checks); **BLOCK for Production release** until the conditions below are met. No fact/RIE query, aggregation or concurrency budget changed; no new capacity claim is made.

Machine evidence is retained in `.quality/company-release-20261021/`: `quality.log`, `postgres.log`, `release.log`, `build-windows-result.json`, `native-migration.json`, `production-preservation.json`; gate JSON reports are in `review/.quality/`. Test source revision is the full candidate SHA above.

## Existing Production identity

Railway project `intuitive-miracle` (`1f6ed45a-31f6-4442-a882-406dde417f5d`), Production environment `90ca5e39-5234-4774-8a53-d8c7873e9cbf`:

- API `@workspace/api-server`: current deployment `5c5ec417-743a-4662-a6ad-ff1e49554ec6`, SUCCESS.
- Web `fsos-app`: current deployment `b73932f5-f1ad-4c67-9966-d4f1d9a0f0bc`, SUCCESS.

These are **previous deployments**, not this candidate. Their source `7d59abb` is correlated using the retained controlled-release report and matching archive SHA-256 `0E10440E006D0E418FBB0BC2971AD7A3B87516C71BA5737D0FDEF6AAF7DC121E`; CLI-upload Railway metadata does not expose a commit hash. Fetched `origin/murshidak/consolidated` at `8c077e3` is an ancestor of that deployed base, so its hotfixes are retained. Railway API/Web were online with no recent failures/pending work; PostgreSQL had one warning whose detail has not been resolved. A fresh deployment's availability has not been proven. Configured deployment source and Dockerfiles are unchanged; external CI enforcement is not claimed.

## Required approval and protected execution plan

Production currently has only ANALYSIS_ONLY/SFA enum labels. The **only pending candidate migration** is `20261020130000_company_full_erp_mode`:

```sql
ALTER TYPE "CompanyOperatingMode" ADD VALUE 'FULL_ERP';
```

It has no row updates, data backfill, role grants or company activation. The existing API pre-deploy command runs `migrate:deploy`, so even starting a new API deployment would execute it. Stop here for the user's separate explicit migration approval.

After approval, before any migration: create a fresh encrypted backup using the existing approved recovery workflow, verify readable recovery-key custody and an isolated restore, and retain a manifest/checksum plus the company/settings/grants/subscription fingerprints. The prior release's backup is not a fresh backup for this release; independent recoverability has not been reverified here. Stop if recovery verification fails. Do not use Production for tests.

Then package only the clean exact candidate, verify the migration set/checksums, and use Railway's existing Linux builders and unchanged startup/pre-deploy settings. Do not add a second manual migration invocation. Verify build success and exact artifact/commit identity, API readiness, then Web rollout. Inspect bounded API/Web logs and perform authenticated Super Admin/form checks without creating Demo or modifying customer companies. Successful provisioning/failure-rollback checks belong in the isolated test environment; any persistent Production test tenant needs separate review. Re-check preservation fingerprints.

Rollback retains the additive enum value and all company data. Before any FULL_ERP setting has been written, prior API/Web images may be restored after compatibility checks. **After a FULL_ERP setting exists, the old enum-unaware Prisma/API is not an automatic safe rollback**: retain the compatible API, optionally roll back Web, or use a separately reviewed compatible fix. Never automatically downgrade tenant modes, delete data, remove enum values or restore an old database. Database restoration is a separate incident decision requiring approval.
