# Executable engineering reliability gates

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
