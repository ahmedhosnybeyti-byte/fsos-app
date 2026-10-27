# Executable engineering reliability gates

## Complete loading orders — authorized Production closure (2026-10-25)

No numerical product ceiling replaces the removed 20-product/100-allocation
restrictions. Explicit owner approval covered replacing two existing function
definitions only: backups retained, no table/schema/migration-history/stock or
custody changes. CLI API `a2817329` and web `5c24b90d` both SUCCESS with Linux
builds; readiness/assets 200, anonymous recipient access 401. After deployment,
the service/database path returned all 40 submitted products and quantities to
the recipient and inbox inside a rolled-back transaction; zero stock commands
or permanent test data. Interactive HTTP/browser acceptance is not claimed.
23 focused cases, isolated API/web types and native 1,000-product/two-client
once-only acceptance passed; no comprehensive rerun. System Design Gate PASS
for this authorized scope; Scalability Gate WARN for missing comparable baseline,
HTTP p95, pool/lock waits and mixed-user capacity. Native observations: create
604 ms/10 SQL, reserve 1,847 ms/seven, recipient detail 192 ms/three, reject 14 ms/
eight; concurrent acceptance/replay 1,056 ms/24 statements across two clients.
Fixture: two companies, three warehouses, 1,000 employee records and 1,000 order
products/allocations; internal PL/pgSQL statements excluded. No capacity claim.
Detailed scope, single-document projection exception and recovery evidence:
`WMS_COMPLETE_LOADING_20261025.md`, `.quality/complete-loading-20261025/`.

## Demo cold-session repair — Production verification (2026-10-25)

Explicitly authorized API-only deployment and trusted-company activation
`7957b220` succeeded after Linux build/readiness. Actual empty-result-cache GET:
200 / 22 admissions; repeated GET: 200 / 21, with unchanged cache fingerprint
and zero future last-sale days. No RIE budget/runtime errors during the smoke.
Hierarchy was warm; fully cold 24 proof remains local. No source/stock edits,
cache deletion, migrations or web deployment. See
`RIE_DEMO_COLD_SESSION_FIX_20261025.md` and the release receipt. System Design
PASS; Scalability WARN: serial observations 8.435s/5.453s, no API p95/capacity
proof or spare admissions on the fully cold local path.

## Demo first-session repair — local proof, no deployment (2026-10-25)

[Focused incident repair](RIE_DEMO_COLD_SESSION_FIX_20261025.md) reproduces the
archived baseline (24 admissions), failed Demo (25 attempted, last denied),
and one-file request metadata deduplication (24 cold / 21 repeated; 24 at Saudi
midnight / 21 repeated). Real hierarchy, facade, planner, coordinator, lost
opportunities, isolated SQL and existing persistent cache tables are exercised.
30 focused cases and isolated API types pass; tenant/Analysis full-response
parity is verified. No raised budgets, disabled cache, Production write or deploy.
System Design PASS locally; Scalability WARN: 96 synthetic canonical rows,
3 companies, actual concurrency 1; native API p95, waits and capacity unverified,
and the cold action uses all 24 admissions. Broad suites were not repeated.

## Demo cache release — rolled back after cold-session failure (2026-10-25)

[Release incident](RIE_DEMO_DAILY_CACHE_RELEASE_20261025.md): existing caches
restored, pinned types and 25 focused cases pass, Railway Linux image builds.
Activation smoke exposed a first-session HTTP 500 / 24-execution RIE budget
failure, despite successful retry/recalculations. User-requested rollback began
immediately; no admission budget increase, stock/source change or web deployment.
System Design Gate: BLOCK; Scalability Gate: BLOCK for that observed failure.
The earlier preflight/local evidence below is historical, not release approval.

## Demo daily policy — isolated release preflight (2026-10-25)

[Release review](DEMO_DAILY_RELEASE_READINESS_20261025.md): seven runtime files
isolated over the verified live `747bd4ec-5cee-4949-8de1-5d24073bd763` archive;
all 600 candidate file hashes rechecked. Candidate-only types and 16 Demo cases
pass. No repeated full suite, deployment, variable edit or Production write.

Read-only real-data verification confirms the Demo identity, 16 routes/1,600
customers, but inventory snapshots are periodic/monthly: Sep 30 is the latest
eligible on Oct 25, with future snapshots through Dec 31. The deployment marker
is absent. Limited one-route serial read observations completed, but cache-bypass
concurrency/API p95 are unverified (Scalability WARN). Local Linux Docker image
verification is unavailable because the engine is not running; release readiness
remains BLOCK pending packaging and the authorized activation/smoke sequence.
No migration/data restore is needed for rollback to the live base and prior
absent-marker state. Private receipts/archive: `.quality/demo-daily-release-20261025/`.

## RIE Demo daily reads — local evidence (2026-10-25)

The trusted Demo company in FULL_ERP reads dated canonical facts/effective rows
through the current Asia/Riyadh day at the common RIE SQL boundary and direct
adapters. Smart Loading keeps tomorrow preparation but uses current facts;
active Demo bypasses persistent result caches without writing derived rows.
No operating data, schema, WMS, deployment or admission budget change.

44 focused cases, 33 existing RIE SQL/planner/coordinator cases, 103 critical
core and API TypeScript pass. The explicitly requested focused scope did not
run the broad changed/all-Postgres/release gates; this is not release acceptance.
See [the scoped report](RIE_DEMO_DAILY_POLICY_20261025.md).

Scalability Gate: WARN. Synthetic 1,000 headers + 10,000 items, concurrency one,
1/20/100 product keys: one SQL and one parent-relation scan each. Last PGlite/Node
service p95 observations: 29.10 / 32.23 / 52.45 ms (ten samples after warmup).
These include driver/coordinator work and are not native server or API p95.
`.quality/demo-daily-read-policy/focused.json` retains samples and scan counts;
no approved comparison, native waits, pool timing, mixed workload or capacity
is established. System Design Gate: PASS for the narrow local read contract.

## Smart Loading — request-only admission for every FULL_ERP company (2026-10-24)

Supersedes the warehouse-permission admission in the earlier web-only repair.
The rep sends to an explicitly assigned active warehouse in the authenticated
company; the existing WMS proposal/load engine creates only REQUESTED state.
No shared-role permission grant, automatic user assignment, new database table,
migration or recommendation change. Requests fix the sender as recipient and
cannot carry a tenant, recipient or arbitrary WMS operation. General warehouse
read/reservation/review/approval/dispatch permissions remain unchanged.

Thirteen focused cases pass: seven button/Excel checks, five isolated SQL
permission/request/bounds checks, and the prior proposal replay regression.
Two FULL_ERP companies succeed independently with reps lacking all WMS grants;
unassigned/cross-company warehouses and Analysis/SFA/default modes are denied.
Stock, movements, allocations and custody are unchanged; failed audit rolls back
both existing WMS documents. Schema build and API/web TypeScript pass. Broad gates
were not rerun per explicit owner instruction.

System Design Gate: PASS for the focused security/consistency contract.
Scalability Gate: WARN — synthetic actual concurrency 1; 1/20-line requests each
use seven SQL adapter calls and a bounded 20-row warehouse page uses two. Those
counts exclude engine transaction boundaries, internal PL/pgSQL and HTTP auth;
end-to-end SQL count, API p95, native waits/bottleneck and comparable capacity
baseline remain unmeasured. No load/capacity claim.

CLI releases: API `a51001ee-c0aa-4b71-a861-de9b8a84cb47` SUCCESS, then web
`e6fa9e1d-04e4-43fd-9427-6a1da75e55f8` SUCCESS. Linux builds/type validation
passed; API registered both new request routes. Sixty-four migration/schema/
seed/startup files were compared to deployed API `cd3a79b` and are unchanged.
API/web payloads were pruned and scanned, without environment/credential files.
Sanitized manifests, focused measurements and served-asset verification:
`.quality/smart-loading-request-access/`. No Production test request or role/
warehouse grant was performed. A rep without a warehouse assignment now receives
an explicit empty-state explanation; no assignment is inferred from company mode.

## Smart Loading order action — scoped web release (2026-10-24)

- Runtime delta: three web files on successful deployment
  `bd01e75c-2966-4bbc-859f-895c9cee9e99`; preserve Excel in Analysis/SFA and open
  the existing authorized WMS request flow only in FULL_ERP. No API, SQL,
  recommendation, migration, company-mode or permission changes.
- Verification: seven focused button/callback/render tests, one isolated SQL
  proposal/request/list regression, web TypeScript and actual Railway Linux
  build/type validation passed. Broad gates were not rerun per explicit owner
  instruction. Real REQUESTED load has company/author/recipient and exact units;
  stock, allocations, movements and custody remain unchanged. Existing command
  replay/proposal uniqueness and permission/company denial pass.
- CLI web deployment `12160e88-f512-4d76-8b33-ceee5ff224fe`: SUCCESS. Public
  Smart Loading HTML and its new action bundle both return 200. No authenticated
  Production request was created. Upload was pruned to existing web/config/schema
  build sources only: 384 files / 3,002,511 bytes, no environment/credential/API/DB
  files or matched secret signatures. Manifest and sanitized evidence:
  `.quality/smart-loading-order/`.
- System Design Gate: PASS for this scoped functional/isolation repair.
  Scalability Gate: WARN — synthetic two-company/one-product/ten-carton fixture,
  actual concurrency 1; SQL count/API p95/pool/lock waits and bottleneck are
  unmeasured; no trusted capacity baseline or concurrent-user claim.
- Screenshot follow-up: read-only inspection confirmed the rep's company is
  FULL_ERP and warehouse feature ENABLED, but the role lacks `wms.read` and
  `wms.request.create`, and the account has zero warehouse assignments. This
  correctly keeps submission disabled. Shared role has 65 active holders;
  granting those permissions requires explicit authorization of that role effect.

Permanent scalability acceptance is specified in [SCALABILITY_GATE.md](SCALABILITY_GATE.md).
The existing quality runner now records functional and scalability outcomes
separately: approved regressions block, absent comparable evidence is WARN and
release verification refuses WARN. No load starts automatically. See the
[2026-10-23 verification](SCALABILITY_GATE_VERIFICATION_20261023.md) for actual
tests, fresh-session discovery, host-policy/runtime limits and enforcement gaps.

## Sales drafts Foundation 002-B1 — local read-only evidence (2026-10-22)

See [the B1 report](SALES_DRAFTS_FOUNDATION_002B1.md) and
[Scalability Gate: WARN](SALES_DRAFTS_SCALABILITY_GATE_002B1.md).
The additive check response binds results to saved revision/warehouse, reports
independent exact WMS/custody/lot states and fails closed on unapproved price/credit.
The transaction is READ ONLY. Actual HTTP with overlapping/different-unit/future
prices, a high imported limit and existing GL still returns setup required; 19
protected-table digests match. Native fixture-statistics failure is retained and
does not establish stale-statistics robustness. Current prepared-fixture plan
assertions pass without changing their budgets or RIE admission settings.
Local gates: 621 checks / 141 suites and four typechecks; standalone SQL 167 / 29;
zero failures/skips/TODOs/cancellations. Real B1 browser results passed 20 locale/
theme/viewport checks. This is no release approval and adds no posting/ZATCA path.

## Sales drafts Foundation 002-A — local evidence (2026-10-22)

See [SALES_DRAFTS_FOUNDATION_002A.md](SALES_DRAFTS_FOUNDATION_002A.md).
Draft-only operations have explicit company/rep/route/mode/permission boundaries,
durable replay/version protection and atomic audit. Native PostgreSQL independent
connections verify creation/edit/cancel/visit-finish races; actual HTTP and browser
checks verify admission and persisted behavior. Exact protected-table digests
remain unchanged for WMS, custody, GL, AR and canonical reference facts. No stock
or financial posting is implemented or certified by this slice.

Final isolated gate artifacts are `.quality/changed.json` and
`.quality/postgres.json`; browser/native evidence is under `.quality/sales-drafts/`.
Tests run locally without Docker/Production/Railway. This is no release approval:
Node 22/Linux packaging, representative performance/recovery and external platform
gates remain outside this local foundation. Existing Foundation 001 evidence and
unrelated local changes remain intact.

Final changed gate: 613 checks / 140 suites, four passing typechecks, zero
failures/skips/TODOs. Independent SQL gate: 161 checks / 28 suites, zero failures/
skips/TODOs. Actual HTTP: 13 grouped checks; browser: 20 locale/theme/
viewport combinations plus failure/retry states and the verified reconnect/
concurrent-session preservation regression. See the separate
[Scalability Gate: WARN](SALES_DRAFTS_SCALABILITY_GATE_002A.md): serial synthetic
check-20 p95 48.2 ms after correcting a measured 2,055 ms repeated-scan defect;
save-1/save-20 each use 31 SQL statements including admission/auth/transaction
control. These observations do not certify 25/50/100/150-user capacity or resolve
the previous shared RIE/PostgreSQL saturation issue. System Design Gate: WARN
for the unmeasured representative concurrent workload; no critical failed test
is waived by this warning.

This extends the existing AGENTS/System Design/Performance rules; it does not
replace the UI system or change application behavior. No Production access is
needed. Existing Railway Docker builds, readiness probe and separate migration
action are unchanged. No CI workflow existed in the inspected checkout.

## Commands and acceptance

Use Node 22 (the Docker/CI runtime) and pnpm 11.11.0. After a frozen install,
generate Prisma with `pnpm --filter @field-sales-os/database generate` (generation
does not migrate/connect). The gate compiles shared schemas to avoid stale dist.

| Tier | Command | Required evidence |
| --- | --- | --- |
| Every change | `pnpm quality --base <actual-review-base>` | Critical auth/company/SFA/secret-redaction/audit/RIE-admission/readiness tests; affected regressions and typechecks for code changes. Docs-only runs the core without application typechecks. |
| DB/data access | `pnpm quality:postgres` (also selected automatically) | Existing SQL parity fixtures, fresh full migration chain, no implicit SFA activation/grants, tenant constraints and audit-failure rollback. |
| AI/external or ERP | `pnpm quality --base <actual-review-base>` | All offline regressions plus focused failure/permission/transaction tests; add tests for changed contracts where current coverage is insufficient. Data-access detection also selects SQL suites. |
| Impactful release | `pnpm quality:release` | All discovered source specs with no skips, four workspace typechecks, plus separate Linux builds and relevant measured load/recovery evidence below. |

The runner discovers specs only in maintained source/quality roots; it does not
run seed/import/backup/ad hoc integration scripts. Child processes strip inherited
credentials and database endpoints and reject real fetch/socket connections.
Tests use explicit mocks or fresh in-memory PostgreSQL. Two test-file processes
at a time and per-file 120-second deadlines limit local resource usage. Missing
mandatory suites or PGlite, zero tests, any failure/skip/TODO/cancellation or failed
typecheck returns nonzero. `.quality/*.json` contains revision, changed paths,
selected suites, counts and completed typechecks, and is excluded from Git/Docker.
Early preflight failures are visible in the nonzero CI log; no success is emitted.

PGlite 0.5.8 was explicitly approved for tests in this task. Its separate
`packages/quality-gates` workspace has no application consumers, so app-specific
Turbo prune does not include it. No package is installed automatically by the gate.
`RIE_TEST_PGLITE_MODULE` can override the test runtime with an existing local module.

CI runs on all PRs/pushes, without a deploy step or Production secrets. Manual
dispatch runs the full regression gate. The review status to require is
`Engineering reliability / required`. **Branch protection and Railway wait-for-CI
have not been configured by this task.** Existing direct deployment can bypass CI;
do not claim platform enforcement until those external settings are approved and
verified. Release readiness remains BLOCK when required evidence fails/misses.

## Coverage audit

| Requirement | Existing protection now exercised by gates | Remaining limit / acceptance for affected changes |
| --- | --- | --- |
| PostgreSQL/RIE efficiency and query pileups | Process limit 20; request serialization; 24-execution budget; planner fan-out and metadata single-flight tests; SQL parity and bounded query mocks. | No universal N+1/unbounded-query detector. Changed contracts need tenant/hierarchy/date scope before fact joins, explicit projection/result/query budgets and representative EXPLAIN/query-count evidence. Do not raise concurrency to hide contention. |
| Concurrency/wait/deadlines | Existing coordinator admission limits, lease release, queue timeout/cancellation and planner tests; ingestion claim/recovery tests. | Queue timeout is not a running SQL statement timeout. Queue length has no hard cardinality cap. No blanket database statement-timeout guarantee; propose measured controls separately. |
| AI/external reliability | Gemini already has a 12-second abort deadline and validated fallback. New mocked tests cover 401/429/503, malformed/missing output, abort and absent key with no writes/retry storm. Existing provider/schema tests also run for relevant changes. | Assistant `callClaude` has no fetch abort deadline and exposes provider error details; this remains an explicit gap. Other integrations require call-specific deadline/attempt/output/redaction tests. No global circuit breaker/fallback was introduced. |
| Company/permissions | Auth/session revocation, SFA dual activation/permission, screen gates, company-mode and resource-denial tests; SQL parity fixtures include scope. | Not a proof for every endpoint. New/changed endpoints need two-tenant read/write denial and hierarchy/resource tests at the server boundary. |
| Atomicity/idempotency | Existing same-transaction warehouse/mode audits, tenant uniqueness/default SQL tests; new warehouse service audit-failure rollback fixture. Audit retries reuse event keys and stop at three; transaction-client errors propagate once. | Warehouse registry is not a stock ledger. Financial/stock ERP posting is not implemented/validated by these tests; future paths require atomic rollback, duplicate and concurrent retry, decimal/rounding, stock boundary and reversal tests on native PostgreSQL. Subscription Payment is not a trade collection. |
| Audit/secrets | Durable audit error propagation/deduplication, URL redaction, public-user projection and seed-security regressions. Test processes cannot inherit Production credentials. | No complete secret scanner or universal audit-metadata scrubber. Changed logs/errors must prove no tokens/credentials/customer payload leakage; existing Assistant provider detail is not certified safe. |
| Failure/recovery | Health DB-unavailable/draining tests, ingestion recovery, refresh and audit failure tests. Existing backup/restore tooling and prior recovery evidence are preserved. | Regression tests do not establish a current off-device recoverable backup. Recovery drills require isolated destinations, integrity checks and measured restore time; do not run source backup tooling from generic CI. |
| Performance/load | Existing query-budget/fan-out tests and SQL result parity now have automatic execution. Existing measured bottleneck history remains authoritative. | These are not capacity tests. Native PG plans, mixed-load p95/errors/queue wait/RAM and saturation recovery remain release-specific evidence. No new service/subscription/load-test dependency is introduced. |

## Deeper release evidence (only when risk warrants it)

For database/query/RIE changes, use synthetic representative data on an isolated
native PostgreSQL environment with the target major version. Record dataset grain,
row count, index/plan, scanned-to-returned rows, query count, output bytes, p50/p95,
timeouts/errors, queue wait and peak RAM. Compare the same scenarios to the prior
revision, including company/hierarchy/date slices and semantic parity.

For mixed-load changes, record rep plus management traffic, representative
concurrency, workload duration, expected error/p95/queue/RAM budgets **before**
execution, and post-saturation recovery. Missing budgets/evidence or exceeding
approved budgets blocks the impactful release. Do not invent a universal VU or
latency threshold from unit tests. Do not direct load at Production/customer data.

For transaction changes, additionally exercise native PostgreSQL race/locking and
duplicate retries across two independent connections; verify one business effect
and matching audit/stock/financial entries. PGlite is useful for SQL semantics and
additive migrations, not a substitute for native locking/load/restore validation.
Keep Redis/workers/queues/circuit breakers as proposals unless measurements show
need and the user approves the architecture/dependency change.

## Verification for this task — 2026-10-20

- Initial full regression attempt: 108 files, 474 passing tests, 3 failures, zero skips.
  Two failures were the test loader's missing existing `@/` alias support; one
  existing ratio test required exact equality for equivalent division orders
  differing by one IEEE-754 ULP. Fixed the loader and that assertion only.
- Targeted rerun of those three files: 21/21 passed, zero skips. Admission/policy
  checks: 5/5 passed. Final mandatory core: 82 passed across 23 files, zero
  failures/skips/TODOs, recorded in `.quality/critical.json`.
- Finalization reran `node tools/quality/run.mjs release` successfully: **488
  passing tests across 109 files**, zero failures/skips/TODOs/cancellations,
  and passing API/web/database/schemas typechecks (209,487 ms). It includes all
  three previously failing files and the added admission regression. This fresh
  success, rather than the earlier targeted reruns, establishes the full gate PASS.
- The critical command was also rerun: **82/82**, zero skips (19,534 ms).
  Machine-readable results are `.quality/release.json` and `.quality/critical.json`.
- API, web, database and schemas typechecks passed. API/web Turbo prune passed;
  neither pruned lockfile contains PGlite or the quality-gates workspace.
- Full isolated migration-chain and warehouse audit-failure rollback fixtures
  passed as part of the successful final full regression. Workflow YAML parsed
  successfully; PR/push/manual triggers and read-only permissions were reviewed.
  No native PostgreSQL load test,
  Production access, Linux image rebuild, backup drill, GitHub-hosted CI run,
  push, deployment or Production migration was performed in this task.

System Design Gate: **PASS for this Reliability Gates change**: no runtime,
database schema, RIE/Smart Loading/Visit Copilot implementation or visual changes.
The full regression and critical gates now pass. This is not deployment approval:
external branch/deployment enforcement, native load/locking checks for impactful
changes, Assistant deadline/redaction gaps and future ERP posting coverage retain
the limits documented above.

Local SFA review was restored using the existing Linux standalone artifact and
a fresh synthetic-only in-memory PGlite API. Both themes were observed on the real
`/sfa/setup` screen. No image/tool download or application rebuild was needed:

- Light: <http://localhost:5338/__review?theme=light>
- Dark: <http://localhost:5338/__review?theme=dark>

Open either link in a browser on this computer; it creates a local synthetic
session and redirects to `/sfa/setup`. Reopen the entry link if the session
expires. The preview is bound to loopback and is not a Production/customer
session. Preview helpers/logs and unrelated release work remain outside this commit.

Changed files for this task (existing unrelated WIP was preserved):

- `AGENTS.md`, `.agents/skills/murshidak-system-design/SKILL.md`
- `.github/workflows/engineering-reliability.yml`
- `package.json`, `pnpm-lock.yaml`, `packages/quality-gates/package.json`
- `.gitignore`, `.dockerignore`
- `tools/quality/run.mjs`, `tools/quality/test-register.cjs`, `tools/quality/policy.mjs`
- `tools/quality/policy.test.mjs`, `tools/quality/repository-contracts.test.mjs`
- `tools/quality/admission.spec.ts`, `tools/quality/migrations.postgres.spec.ts`
- `apps/api/src/modules/prospects/gemini-intelligence.service.spec.ts`
- `apps/api/src/modules/audit-log/audit-log.service.spec.ts`
- `apps/web/src/components/smart-loading/lost-opportunity-groups.spec.ts` (test precision only)
- `docs/engineering/ENGINEERING_RELIABILITY.md`, `docs/engineering/RESOLVED_ISSUES.md`

## WMS Phase 01 local evidence (2026-10-20)

See [WMS_PHASE01.md](WMS_PHASE01.md) for the query contract, additive migration,
permissions, local preview and evidence. `pnpm quality --base 37931df` passed 497
tests with zero skips/failures and four workspace typechecks. Native PostgreSQL
18.6 independent connections additionally proved stock posting/retry/reversal
atomicity and audit-failure rollback; actual scoped query plans and eight browser
theme/locale/viewport combinations were captured in excluded `.quality/wms/`.
This is a local phase acceptance, not Linux packaging, mixed-load capacity,
backup-custody verification, deployment permission or Production migration approval.

## WMS Phase 02 local evidence (2026-10-20)

See [WMS_PHASE02.md](WMS_PHASE02.md) for the complete contract, new additive
migration, capabilities, native runner, existing-company preview and Demo integration
plan. The initial quality gate passed 516 checks with four typechecks; the standalone
isolated SQL gate passed 93, without failures/skips/TODOs. Independent native
PostgreSQL connections additionally proved competing reservations, idempotent
receipt/dispatch/acceptance, cancellation and rollback after a stock effect.
Forty-three actual local HTTP checks covered all operation permissions and tenant,
warehouse, mode and screen admission. A real mobile receiving-to-custody journey
and eight actual theme/locale/viewport renders passed. Scoped query plans and
result sizes are recorded; these are local samples, not capacity certification.
Final WMS-only gate against `624321d` passed 517 checks and four typechecks;
see the handoff and `.quality/changed.json`. No Production data,
activation, push, deployment or Production migration was performed.

## Company-only release review (2026-10-21)

Candidate `41f06ee7b29cb797a55adcd8501eaaaee3c7490d` backports company modes
onto deployed `7d59abb`, excluding WMS and new Demo work. Changed/release gates
passed 494 tests each with four typechecks; isolated SQL passed 79, without
failures/skips/TODOs. Native PostgreSQL 18.6 verified the additive enum migration
against synthetic existing-company fixtures. No RIE/fact query or budget changed.
Local API/Web build passed with a verified Windows directory-junction helper;
Linux image builds remain unperformed and will use Railway, not Docker Desktop.
Read-only Production fingerprints remained unchanged across all seven companies.
Fresh encrypted backup/isolated restore and recovery-key custody are still pending;
the release is BLOCKED before the automatic pre-deploy migration until explicit
user approval. No push/deployment/Production migration was performed.
See [the release review](COMPANY_MODES_RELEASE_REVIEW_20261021.md) for exact
deployment identities, source-provenance limits, evidence and safe rollback rules.

The owner subsequently authorized the single FULL_ERP enum migration. Fresh
encrypted backup and two isolated native PostgreSQL recoveries (including a full
restore from the authenticated decrypted archive) passed before any change.
Railway's unchanged Linux API/Web builders passed; deployments
`54567f71-e1c5-4d81-80bd-8d017733662b` and
`3ec8a484-2303-4f5a-8cea-0e607c962c35` are SUCCESS/online. Exactly one approved
migration was added; all seven company/user/subscription control fingerprints
remain unchanged. Thirteen API checks and the final eighteen-check API/Web run
passed, including actual theme/locale Create/Edit journeys without saving.
See [the completed release report](COMPANY_MODES_PRODUCTION_RELEASE_20261021.md)
for artifact/image identities, recovery limits, log samples and UI evidence.

## Visit Execution Foundation 001 — local only (2026-10-22)

New operational visit records, start retry identities, versioned save/completion,
audit-atomic changes and scoped market photos are documented in
[VISIT_EXECUTION_FOUNDATION_001.md](VISIT_EXECUTION_FOUNDATION_001.md).
The additive migration has only run on disposable synthetic test databases.
Isolated SQL/security/React-render suites and independent native PostgreSQL
connections cover the visit contract; final gate counts are in `.quality`.
Native testing caught and corrected Prisma's unsupported `void` lock result.
Final changed gate: 589 checks / 135 suites, all four typechecks passed;
separate PostgreSQL gate: 149 checks / 27 suites; native connection races: six
passed. No failures, skips or TODOs. See `.quality/changed.json`,
`.quality/postgres.json` and `.quality/visit-execution/native.json`.
The configured local image store at `localhost:9000` refuses TCP connections;
real storage/camera integration and rendered Light/Dark mobile/desktop QA remain
unverified. Financial operation links and future entry adapters remain deferred.
System Design Gate: WARN, not release approval. No Production change, push,
deployment, role grant, new infrastructure or dependency was performed.

Final native/browser verification (same date; supersedes app-session status):
the actual Next/Nest/RIE/Prisma flow passed start, notes, OTHER validation,
save/reopen and completion on a new database in the existing native loopback
test cluster. The Visit migration followed a verified custom-format backup;
only the single synthetic rep role in that new database received permission.
No operating database was migrated. Actual guards and concurrent replay checks
passed. A context-plan accounting defect found in the browser was fixed and
verified at 10 RIE PostgreSQL calls; the new regression retains the 24-call
ceiling and proves over-budget denial. Twenty existing focused checks plus the
new plan check and API typecheck passed; 589/149 suites were not rerun per user
instruction. Real multipart image upload returned 503 and saved zero photos.
The existing localhost:9000 MinIO has only container startup configuration;
no running native alternative was found. No Docker use/repair after the user's
prohibition, no storage substitute, push or deploy. Actual image read/private
store verification remains BLOCKED; System Design Gate remains WARN and the
foundation is open. Detailed evidence and limitations are in the final section
of [VISIT_EXECUTION_FOUNDATION_001.md](VISIT_EXECUTION_FOUNDATION_001.md).

Native image closure (2026-10-22; supersedes the preceding storage BLOCKED):
with explicit user authorization, official MinIO source release
`RELEASE.2025-10-15T17-29-55Z` was compiled using a hash-verified portable Go
toolchain after official historical binary downloads returned HTTP 410.
Native MinIO now serves the unchanged local S3 endpoint on loopback with a
private bucket and independent retained test data. No Docker, provider swap,
Production credential change, operating DB migration or application dependency
change occurred. `tools/local/start-minio.cjs` preserves provenance/local-only
checks and refuses occupied ports.

The actual browser uploaded a real CC0 shelf JPEG, reloaded and displayed it;
S3 readback and read after native server restart matched its SHA-256. Tests
denied other permitted actors/companies, wrong-visit IDs, unsigned access and
tampered/expired signatures. With MinIO actually stopped, browser save and
completion still committed with audit; restart retained the image. One photo,
one photo audit and one completion audit remain after retry. Three focused
native integration scripts plus startup/launcher checks passed; 589/149 suites
were not repeated. See `.quality/visit-execution/minio-native/` evidence and
the report's native-image closure. Foundation 001 local functional acceptance:
CLOSED; System Design Gate PASS for that isolated local scope. Upstream MinIO
Community is archived/no longer maintained; this test build is not Production
runtime approval, a capacity claim or physical-camera certification. No push,
deploy or Railway change.

## Existing ERP Production continuation — 2026-10-23

Actual release status: **BLOCK for historical publication**, not a full ERP acceptance.
API/web deployments, 12 additive migrations, tested encrypted restore and approved
19-permission shared-role activation completed. See
[the current ERP result](ERP_PRODUCTION_RESUME_20261023.md) for exact deployment IDs,
source fingerprint, controls and rollback.

One original XLSX upload yielded 686,663 unique staged rows (686,684 inputs,
21 identical repetitions, zero errors), using one worker and 500-row transactions.
The publication transaction failed with PostgreSQL SQLSTATE 53100 while extending
rie_entity_rows on the existing 5,000 MB volume, observed 96% used. Scoped SQL
verified complete approval rollback and unchanged user/subscription/other-company
controls, with no live stock or financial posting. No destructive cleanup,
unapproved plan upgrade or reupload was applied.

System Design Gate: BLOCK. Scalability Gate: BLOCK for actual disk capacity.
Scenario: full 686,663-row canonical import/publication; worker concurrency 1;
sampled API memory maximum about 0.619 GB; total SQL count/API p95/mixed-load
capacity unmeasured. Local proxy-byte parity and Linux builds passed; earlier
native/operational regressions reused, no broad rerun at the owner's instruction.
Storage headroom must be restored before retrying existing-revision approval.


### 2026-10-23 — approved two-company cleanup and Saudi demo activation

System Design Gate: PASS. Fresh encrypted PostgreSQL 18 restore/decrypt, ownership/FK preflight, local rehearsal and Production preservation fingerprints across 106 tables passed. Exactly the two named approved companies remain; Saudi alone is FULL_ERP. Three separate specialist accounts passed real HTTPS login, scoped reads and denial checks. COMPANY_ADMIN operational grants were removed and backend policy denies accidental regrant; specialist creation/update/reset cannot be used by company administrators for takeover. Historical data was not reimported or posted into live ledgers.

Validation was deliberately limited to the mandatory critical core (102 passes), affected authorization/UI/WMS and isolated price-exception SQL suites, API/web typechecks, existing Railway Linux Docker builds and live scoped smoke checks. Broad previous regressions and load suites were not repeated per the explicit task constraint; broad quality/release commands are not represented as having passed. The existing 12 migrations and entire ledger/checksums were verified unchanged; no new migration. Runtime source is `29953613bdf3515d696c5cd1f7bf6ffc7bfdf691`; follow-up `0470322f198a79cd48e1ca628ae9e593c54956a7` changes only a test fixture.

Scalability Gate: WARN. Scenario: serial three-role bounded read/denial smoke, existing tenant dataset 685,949 canonical rows; actual concurrency 1, pages at most 20. SQL count, API p95, bottleneck and mixed concurrent capacity were not measured; trusted comparable capacity baseline unavailable. New duty checks do not add a fact query. No 150-user or release-capacity certification is implied. The accepted unproven Railway token revocation remains open; the token was not used. No infrastructure or paid storage added. Detailed owner-restricted operational/recovery evidence is in `.quality/company-cleanup-20261023/FINAL_REPORT.md`; do not publish the backup or secret-bearing companion files.

## Latest user amendment — company administrator read-only views

The user explicitly requested COMPANY_ADMIN read access to inventory, purchase orders and treasury balances. This supersedes the earlier statement that every operational view is hidden from administrators. A dedicated `erp.admin.read` capability was granted; no WMS/accounting/procurement write permission was restored. Runtime amendment candidate: `11fa4c725573b6077deba31d82946dbe5e636a6b`. API admission allows only exact GET routes for the warehouse picker and stock balances/products/lots, purchase-order summary/list/detail, and treasury balances. It denies operational mutations, warehouse access management, movement/custody/receiving APIs, chart/journal/party reads and financial posting. Purchase-order scope is enforced in PostgreSQL even if `kind=all/requests` or a draft ID is supplied. Existing UI is reused: management/receiving/dispatch/count/ledger panels are hidden for the administrator, procurement shows orders/tracking only, and its accounting navigation opens treasury balances only. The three specialists keep their prior duties.

Focused validation passed 23 relevant controller/navigation/seed/SQL cases, six explicit read-only/PO SQL scenarios and the mandatory critical core (103 cases), plus API/web typechecks. System Design Gate: PASS for scoped read-only authorization; Scalability Gate: WARN for unmeasured mixed concurrent capacity (same serial/scalar limits as above). No new migration, import, company or service is involved. User's existing browser tab was on mandatory password change; no credential fields were touched. Completing that existing step and signing in again is necessary before the dashboard menu can render.

### 2026-10-23 — category grouping and carton presentation

Release `3fa2f2e2ee5487c1ae80b01988c4a86877c76403` extends bounded WMS reads with scalar carton factors and canonical Category, orders/paginates categories in PostgreSQL, and divides stock by each product's factor before SQL aggregation. Existing base-quantity contracts and operational ledger/authorization boundaries remain unchanged. UI uses semantic primary category headings, carton balances across warehouse panels and carton-only whole-quantity manual loading. Decimal-string/BigInt conversion prevents floating-point command rounding; unchanged reservations preserve the original exact quantity and edited picks/legacy quarantine decisions convert back to their existing command unit. No migration, import or stock/financial mutation is part of this release. The previously authorized 100-carton demo opening remains 100 products / 10,000 cartons / 100 movements.

System Design Gate: PASS. API/web/schema compilation passed, the mandatory critical core passed 103 tests, and 44 distinct affected SQL/controller/conversion/render cases passed (including 20/4 pagination and Company Admin read-only actual component rendering). Prior broad selectors/load tests were not repeated per the owner's explicit constraint; this is not a claim that broad quality/release commands ran. The existing encrypted restore-tested backup is retained, and application rollback uses `11fa4c725573b6077deba31d82946dbe5e636a6b` without a data restore. Live API read checks through the existing procurement account passed 20-row categories, stock conversion, summary totals and missing-warehouse denial; no human password was reset.

Scalability Gate: WARN. Scenario: indexed 21-row category page against 100 operational products / 685,949 tenant canonical rows, actual concurrency 1. Canonical index scan returned 100 product master rows; one native server observation was 6.301 ms execution / 3.333 ms planning. No fact/full JSON materialization in Node or per-product request was added. Full HTTP SQL count, API p95, RAM, lock/pool waits and mixed concurrent capacity remain unmeasured; no trusted comparable capacity baseline. Railway Linux build/deployment results and final UI verification are recorded in the owner-restricted `.quality/company-cleanup-20261023/CARTON_CATEGORY_RELEASE.md` and companion JSON; do not infer a live success from this source note alone.


### 2026-10-23 — shared category accordions

Release cd3a79b557a1be96b18283f08b4e729d420c5378 replaces product-page headings with a shared accessible accordion across WMS balances/lots/coverage, receiving/loading/allocation, count/quarantine/return/custody, procurement, sales drafts and the existing Super Admin Products history preview. Smart Loading source is unchanged. Only already-authorized bounded results are grouped; original item indices are retained for draft editing. Empty categories use localized Uncategorized. Search opens supplied groups without fetching more pages. Category metadata uses company/entity/key scalar projections; no schema migration, write SQL or authorization change.

System Design Gate: PASS for functional and isolation scope. Evidence: 71 affected UI/isolated SQL cases and 103 critical cases passed, schemas built, API/web typechecks passed; exact AST comparison of write SQL and protected command/auth methods passed. No broad previous quality/release suites were repeated per explicit owner constraint; this is not a claim they ran. Existing Railway Linux builds verify deployment artifacts. Application rollback target is 3fa2f2e2ee5487c1ae80b01988c4a86877c76403; no database restore is needed.

Scalability Gate: WARN. Scenario: existing 20-row product/stock pages and bounded document lines; tenant dataset 685,949 canonical rows / 100 operational products; functional SQL uses isolated synthetic fixtures, concurrency 2 test workers (not concurrent-user capacity). New UI introduces zero HTTP requests and grouping is limited to supplied results; metadata is projected in existing SQL statements. Runtime SQL count, API p95, RAM/pool waits and mixed-user capacity are unmeasured for this release; indexed scalar lookup is the potential added cost. No trusted capacity baseline or 150-user certification is claimed. Final Railway statuses and live read proof belong in the private ACCORDION_RELEASE report.

### 2026-10-25 — Smart Loading expired date incident

Scoped HTTP logs proved session 400 responses for a restored target day that had expired after Riyadh midnight. Existing API validation and recommendation/authorization sources were unchanged; the minimal fix normalizes browser initial/selected/restored dates to the existing API calendar and drops expired day edits. The runtime delta is three frontend files over the exact previously deployed web source. No database, API, permission, warehouse assignment or calculation changes.

Five focused date regressions, web TypeScript, and the existing Railway Linux Docker build passed. Explicitly authorized web deployment `f0de759a-3c65-4705-8c69-c44638b99675` reached SUCCESS; public route and new date-guard asset both returned 200. Before this deployment, the user's normal-session screenshot and a valid-date API HTTP 200 confirmed recommendations returned; no post-deployment authenticated replay is claimed. Prior web `e6fa9e1d-04e4-43fd-9427-6a1da75e55f8` is a compatible rollback without data restoration. Broad quality/release/load suites were deliberately not rerun under the owner's narrow incident instruction; they are not represented as passed. Safe evidence is retained in `.quality/smart-loading-incident-20261025/`.

System Design Gate: PASS. Scalability Gate: N/A — frontend date validation adds no data queries, polling, SQL, aggregation or capacity change; no API p95 or concurrent-capacity claim.

### 2026-10-25 — existing warehouse served-branch routing (not released)

Local six-runtime-file candidate adds company-scoped warehouse/BranchID links,
setup configuration under existing company-admin authority, and request-only
branch admission. No Production write/deployment or shared permission grant.
Read-only discovery confirmed the existing warehouse and the actual three
requested BranchIDs; the configuration plan remains unapplied. Ordinary WMS
commands, keeper rights and stock/custody accounting remain unchanged.

21 focused cases and the 103-case critical core pass, along with schema/API
compilation and Prisma validation. Native isolated PostgreSQL confirms an
idempotent REQUESTED load visible through the keeper's existing list and
unchanged stock/custody/access; two-client revocation/send serialization passed.
Dataset: two synthetic companies, three fixture warehouses, three branches,
1,000 employees, one product. Picker SQL count two; send ten including transaction
boundaries/audit, excluding internal PL/pgSQL. Eight serial post-warmup picker
samples: service p95 2.863 ms, HTTP p95 unmeasured; actual concurrency one.
Employee probe uses its tenant/email index and returns one row. No comparable
approved baseline or mixed-user/pool-wait/capacity evidence. Broader changed,
all-Postgres and release suites/Linux packaging are pending, not claimed passed.

System Design Gate: WARN for pending release acceptance/owner approval.
Scalability Gate: WARN for unverified baseline/capacity. Full safe report:
`WMS_WAREHOUSE_BRANCH_ROUTING_20261025.md`; private evidence/candidate under
`.quality/warehouse-branches-20261025/`. This is local functional verification,
not Production deployment readiness or capacity approval.

### 2026-10-25 — approved recipient handover closure

The owner explicitly approved the handover migration, API/web deployment and
completion of the existing seven-carton request after automatic review rejected
the broader migration under the earlier branch-only authorization. That rejected
attempt did not execute. The subsequent approved migration preserved existing
all-company stock, custody, requests, access and original event fields. No role
grant, new workflow table, dependency or business-data backfill.

API `985173c1-fd39-4a3f-9d9b-35b224e2332e` and web
`02f44aec-de64-4a87-8323-0d884fba04ce` reached SUCCESS through existing Linux
Docker builds. Scope is generic to FULL_ERP companies; SA-DEMO's three actual
BranchIDs are configuration only. 19 focused SQL cases, 11 affected UI cases,
103 critical cases, API/web types and Prisma validation passed. Native isolated
PostgreSQL verified pre-consent rejection, stale/uncommitted-consent races and
concurrent replay with one stock/custody posting. The eight serial post-warmup
inbox observations used two SQL statements, service p95 7.071 ms, on two synthetic
companies / three fixture warehouses / 1,000 employees / one request and line.
Independent race clients two; HTTP p95, representative historical inbox depth,
pool waits, comparable approved baseline and mixed concurrent capacity remain
unmeasured. Broad unrelated quality/release/load commands are not claimed passed.

Normal owner-supplied rep/keeper browser sessions completed the single existing
request: rep reviewed seven requested/seven prepared/zero shortage and consented
while physical stock stayed 100 and custody zero. Keeper then confirmed handover:
ACCEPTED, P-047 physical 93 cartons, reserved/transit zero and recipient custody
seven, with exactly one confirmation/dispatch/acceptance and no direct rep grant.
No new live request, warehouse, branch, opening or manual balance adjustment.
Safe detailed evidence and photos: `.quality/loading-handover-20261025/`;
report `WMS_RECIPIENT_HANDOVER_20261025.md`.

System Design Gate: PASS for the verified owner-approved scope and real handover.
Scalability Gate: WARN for unverified comparable baseline and capacity. Functional
end-to-end success does not certify 150-user capacity.

## 2026-10-27 — local supplier master and receiving/return workspace

Candidate code `aa6d5bed6dc38e63abadd2d830ffe5f011477f5c` merges three isolated
agent worktrees above baseline `cc620884581ad1164959f7566a871ac3b585964a`.
No deployment, operating migration, backup, dependency or infrastructure action.
Existing WMS stock/approval SQL, role grants and Smart Loading runtime remain
unchanged. Supplier/date metadata shares the command transaction and replay lock;
old create/edit retries cannot clobber later metadata. Financial parties are not
created as a side effect of operational supplier entry.

Final quality: **781 passed**, zero failures/skips/TODOs, and all four selected
typechecks pass. The original 32 failing cases came from baseline test setup and
stale approved-role expectations; focused fixture corrections pass 34 cases,
including 1,000-product and actual 83-product package handovers, without weakening
authorization/stock checks. The mandatory isolated PostgreSQL gate passes
**239 cases**, zero failures/skips/TODOs; its receipt is retained separately in
`.quality/supplier-redesign/postgres-final.json`.

Synthetic PGlite supplier lookup, 1 versus 1,000 suppliers, two companies / three
warehouses, serial concurrency **1**, one excluded warmup and ten samples per size:
exactly **3 SQL statements** per service call; at most **20 returned**; service p95
**8.94 / 14.83 ms**, response maximum **100 / 1,426 bytes**. This includes service
warehouse/mode/user admission, excludes HTTP guards, and has no PL/pgSQL/transaction
on the read path. API p95, native plans/scans/lock/pool waits, approved comparable
baseline, bottleneck and mixed concurrent capacity remain unmeasured. It cannot
establish 150-user readiness.

System Design Gate: **WARN**, local functional **PASS**; Scalability Gate:
**WARN / UNVERIFIED**. Release preflight (`quality:release`, Linux packaging and
verified release/capacity evidence) has not been claimed. Additive supplier
migration must precede any future new API rollout, subject to owner approval.
Full result and agent/commit ledger: `SUPPLIER_RECEIVING_DELIVERY_20261027.md`.

## 2026-10-27 — supplier receiving release-readiness follow-up

Final source `300667f1398f8889cf7944a44f67cf99d33cad07` removes the inherited
supplier document count ceiling end-to-end, retaining existing stock/approval/
replay rules, company scope and REP/Smart Loading contracts. Additive uncap
migration follows supplier master migration `20261027150000_wms_suppliers`.
Native PostgreSQL 18.6 applies all 64 migrations and passes 21/83/1,000-line real
HTTP journeys, legacy/foreign-key checks, actual independent two-client retries
and post-effect audit rollback. Maximum driver SQL is 15; mixed five-operation
p95 observations are 53.87 / 71.37 / 748.64 ms. These are not capacity/SLO proof;
internal function SQL, native plans/scans and pool/lock/server metrics remain
unverified, with no approved comparable baseline. No budgets were altered.

`quality:release` executes **796 passing cases**, zero failures/skips/TODOs and
four passing typechecks, but correctly exits **BLOCK** on Scalability **WARN**.
CLI API/web builds and standalone page + supplier bundle HTTP 200 pass on Windows
Node 24.18.0. The owner switched to CLI instead of Docker; no Docker build or
Linux/Railway runtime proof is claimed. No Production migration/deployment,
new dependency/infrastructure or backup was introduced. Full evidence, identity
linkage decision and remaining acceptance: `SUPPLIER_RECEIVING_RELEASE_READINESS_20261027.md`.
