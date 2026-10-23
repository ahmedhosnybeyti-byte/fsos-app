# Executable engineering reliability gates

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
