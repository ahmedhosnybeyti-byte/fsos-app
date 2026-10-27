# Permanent scalability gate — verification, 2026-10-23

Official workspace: `D:\Field Sales OS`. Review base:
`f482d9bde14b94e3619e221d61a416b145874ca6`. Existing uncommitted Foundation 001,
002-A/002-B1, WMS/accounting, UI, release and concurrent capacity-report work is
preserved. No application implementation, schema, migration, dependency, RIE
setting, Production/field_sales_os/Railway, Docker, commit, push or deployment
was changed/run by this task.

## Permanent files

| Files | Responsibility |
| --- | --- |
| `AGENTS.md` | Mandatory Murshidak Scalability Gate for future sessions and impactful handoffs; N/A with reason for no-impact work. |
| `.agents/skills/murshidak-system-design/SKILL.md` | Extend the existing discoverable skill and link the executable contract; no duplicate `.codex` skill. |
| `docs/engineering/SCALABILITY_GATE.md` | Measurement/schema/baseline/budget contract and enforcement limits. |
| `tools/quality/scalability.mjs`, `scalability-budgets.json` | Offline comparison, source freshness, approved baseline hashes/budgets, separate timings, sanitized local history; no invented SLO. |
| `tools/quality/scalability.test.mjs` | Failure injection, incomparable baselines, missing metrics, count/transaction/plan budgets, redaction, CLI exit and permanent-policy wiring. |
| `tools/quality/scalability-query-count.spec.ts` | Actual RIE compiler at 1/20/100 customer IDs, constant one mocked SQL call, LIMIT 20+1 and company/route scope. |
| `tools/quality/policy.mjs`, `run.mjs` | Fast mandatory checks, impactful selection, separate functional/scalability results; approved regressions fail; release refuses WARN. |
| `package.json`, `.github/workflows/engineering-reliability.yml` | `quality:scalability` command and sanitized summary retention in existing required CI job. |
| `ENGINEERING_RELIABILITY.md`, `RESOLVED_ISSUES.md`, this report | Persistent evidence and prevention rule; existing WIP documents are extended. |

The requested `.codex/skills/murshidak-system-design/SKILL.md` does not exist.
The existing authoritative `.agents/skills/...` path was already registered in
AGENTS and the session skill catalog and was extended in place.

## Verification

- Final focused run: **20/20 passed**, zero failures/skips/TODOs. Command:
  `node --require ./tools/quality/test-register.cjs --test tools/quality/scalability-query-count.spec.ts tools/quality/scalability.test.mjs tools/quality/policy.test.mjs`.
- An independent Node child deliberately changed test API samples from 1 to
  100 ms against a **test-only approved maximum of 2 ms**. It returned BLOCK and
  exit 1, asserted by the test. These are injected comparator inputs, not measured
  API latency or Murshidak budgets. Tests also cover relative p95, one SQL-count
  burst, one unlimited-size result, long transaction, missing pool/lock/RIE
  observations, failed coexistence/stock/custody assertions, plan/index/estimate
  budgets and propagation into the required runner's acceptance result.
- RIE compiler inputs: 1, 20 and 100 synthetic customer IDs; **one** call each at
  the mocked SQL boundary with LIMIT 21 and company/route values. This does not
  count internal PostgreSQL statements, measure latency, or certify all endpoints.
- First underlying changed-runner attempt: **637 passed / 142 files**, zero
  failures/skips/TODOs/cancellations; API typecheck then failed. Standard pnpm
  startup also hit EPERM resolving local junctions. That attempt is BLOCK.
- Diagnosis reproduced EPERM from `fs.realpathSync.native` on installed Prisma
  and Express junctions while portable `fs.realpathSync` resolved the same paths.
  The existing SFA foundation documents this sandbox limitation. Full API
  typecheck using the portable resolver passed, no diagnostics. No dependency
  installation, Prisma generation, tsconfig edit or application fix was needed.
- Final `pnpm quality --base f482d9bde14b94e3619e221d61a416b145874ca6`:
  **647 passed / 144 suites**, zero failures/skips/TODOs/cancellations, all four
  API/database/schemas/web typechecks passed, exit 0, 711,347 ms. Functional
  acceptance PASS; overall/System Design Gate WARN because scalability evidence
  remains UNVERIFIED. The final focused 20/20 also covers the last summary
  provenance and separately approved stale-statistics comparison refinements.

Local runtime: Node 24.18.0 / pnpm 11.11.0. CI Node 22/Linux was not run remotely.
Temporary excluded `.quality/scalability/portable-realpath.cjs` falls back only
on EPERM and resolves the actual path. It is not shipped or loaded by application
code. It changes no compiler option, assertion, suite, timeout or budget.
`pnpm_config_verify_deps_before_run=false` prevents automatic installation; the
existing installed dependencies are reused. Final log:
`.quality/scalability/quality-final.log`; runner result: `.quality/changed.json`.
Another concurrent quality invocation was observed replacing the shared
`.quality/changed.json` start marker. This task's independent final log and
`.quality/scalability/full-gate-verification.json` preserve its own outcome;
do not attribute a shared last-run marker to this task without matching the log.
This is a changing working-tree review, not certification of an immutable commit.

## Fresh-session discovery

An actual separate ephemeral `codex exec --ignore-user-config --sandbox read-only`
session started from the official workspace after policy installation. It
independently identified the permanent gate, exact existing skill/contract paths,
quality commands, missing-baseline UNVERIFIED/WARN and why a serial request does
not prove 150-user capacity. It explicitly confirmed that project instructions
and the skill catalog were present in its initial context.

The child skill/contract read was rejected by host execution policy. **Initial
instruction/skill discovery is verified; autonomous body-file reading in that
child session is not verified.** Deterministic local contract tests separately
read/check the actual skill and linked contract. The child did not change files
or run application tests. Excluded evidence:
`.quality/scalability/fresh-session.{jsonl,md,stderr.log}`.

One retry using the usual workspace sandbox with a read-only task was initially
not executed because automatic approval review reached its usage limit. This
was a review-service failure, not an unsafe-action finding. After the stated
retry time passed, review allowed another actual fresh session. That session
again confirmed initial AGENTS/skill discovery, but both individual Get-Content
reads were blocked by host policy; it found no alternative local reader. No
restriction was disabled. Additional evidence:
`.quality/scalability/fresh-session-retry.{jsonl,md,stderr.log}`. Successful
autonomous body reading remains unverified in this CLI host, despite verified
discovery in two independent fresh contexts and direct contract-file tests.

This persistence mechanism matches official documentation: project AGENTS is
durable guidance; skills expose metadata first and load bodies on use. See
[Customization](https://learn.chatgpt.com/docs/customization/overview) and
[Build skills](https://learn.chatgpt.com/docs/build-skills). The actual child
response establishes repository discovery, not documentation alone or a claim
that instructions prevent all agent mistakes.

## Acceptance and enforcement limits

**Scalability Gate: WARN / UNVERIFIED for application capacity.** No current
trusted comparable baseline or approved application limits exist. No new API
p95, native SQL execution, lock/pool wait, stock/custody contention, mixed
analytics/ingestion throughput, representative growth/stale-statistics or user
capacity measurement was run. Existing 002-A/B1 observations and stale-statistics
failure remain intact. There is no new runtime bottleneck diagnosis or 150-user
claim. Comparator self-tests are functional evidence of the gate only.

Automated: core query-shape checks, evidence schema/freshness/comparability,
approved numeric/plan-limit failures, failure exit propagation, missing-evidence
WARN, release refusal of unverified evidence, sanitized local summaries and CI
job wiring. No large load starts automatically.

Still engineering review: finding all changed query paths, representative
scenarios, honest instrumentation, native EXPLAIN/races, baseline/budget approval,
N/A reasons, complete handoff and deployment authorization. No universal static
SQL/N+1 detector or automatic PG monitor was added. Branch protection and Railway
gating were not configured/verified. Local functional acceptance remains separate
from deployment and capacity readiness.
