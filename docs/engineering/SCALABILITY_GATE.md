# Mandatory Murshidak Scalability Gate

Permanent contract, 2026-10-23. Owned by the existing
[system-design skill](../../.agents/skills/murshidak-system-design/SKILL.md)
and root [AGENTS.md](../../AGENTS.md). No parallel skill or runtime service.

## Acceptance and commands

Every impactful API, PostgreSQL, RIE, WMS, stock/custody, accounting, analytics,
ingestion or frontend data-access change must assess performance before local
acceptance. Preserve company/hierarchy/date scope, SQL-side prepared results,
business parity, default ANALYSIS_ONLY, explicit SFA admission and current RIE
limits. Follow PERFORMANCE_GUARDRAILS.md and RESOLVED_ISSUES.md first.

- `pnpm quality --base <actual-review-base>` retains the security/recovery core,
  adds the fast evidence/comparator and existing bounded-query/admission tests,
  and selects existing SQL/transaction regressions. It **does not start load**.
- `pnpm quality:postgres` remains mandatory for DB/data-access changes. These
  isolated SQL tests do not prove native locking or capacity.
- `pnpm quality:scalability` assesses local evidence and archives a sanitized
  summary under `.quality/scalability/runs/`; current summary is `latest.json`.
  Optional `--evidence <file> --baseline <file>` selects other local evidence.
- `pnpm quality:scalability --require-verified` exits nonzero for WARN or BLOCK.
  The existing `quality:release` runner also requires verified scalability.
  Release packaging/recovery/authorization requirements remain additional gates.
- `pnpm quality:scalability --fingerprint` prints the current maintained-source
  SHA-256. Capture it with HEAD's full revision after final code changes. Any
  later code/tool/policy change invalidates current evidence until remeasurement.

`quality` records **functionalStatus** separately from **scalability**. Critical
failures always exit nonzero. Local UNVERIFIED/WARN may exit zero, but the overall
JSON status is WARN and this is not capacity or release acceptance. A measured
approved-budget violation exits nonzero even if functional tests pass. Docs and
pure styling/text changes with no data impact are N/A; no load is required.
Path/source selection is conservative and cannot waive a known affected contract.

## Evidence producers and measurement contract

Reuse existing tests/harnesses rather than adding an automatic network probe.
`tools/quality/sales-drafts-performance.cjs [--foundation-b1]` already measures
actual synthetic HTTP/Prisma counts, separate RIE admission, transactions and
native EXPLAIN with protected-ledger parity. It is **explicit/manual**, verifies
its native cluster and clones its synthetic fixture; do not run it on operating
DBs or silently start services. WMS/accounting/visit native runners contain
independent-connection contention/rollback cases. Extend those when their
contracts change. The generic evidence gate does not execute these scripts.

| Risk | Required focused evidence for an affected path |
| --- | --- |
| SQL count / N+1 / unlimited reads | Real engine statements per request, including auth/BEGIN/COMMIT; counts at 1 and bounded maximum items; explicit column/result/page bounds; fail the contract assertion on per-item growth or unlimited results. Internal PL/pgSQL statements must be disclosed separately. |
| Important API p95 | Exclude warmups; record all measured request samples, error classes, dataset fingerprint/size, same environment/config, actual overlapping clients, workload duration. Compare only like-for-like baselines. A single request is an observation. |
| PostgreSQL execution / lock / pool | Native server execution from EXPLAIN ANALYZE or server instrumentation; direct acquisition/lock-wait observations across independent connections. Prisma/driver duration is not pure server time. Missing direct instrumentation is null, never zero. |
| RIE | Direct coordinator queue-wait series separate from SQL execution; admission elapsed includes coordination. Do not subtract independent p95 values to infer waits. Retain existing queue/admission/budget tests. |
| Long transactions / stock / custody | Transaction duration, independent overlapping posting/reservation/custody/retry scenarios, no duplicate/negative business effects and atomic audit rollback. A mock/PGlite race cannot certify native locks. |
| Analytics versus ingestion | Separate ingestion-only control and same-size mixed analytics+ingestion scenario; distinct authorized actors, observed overlap, write/API latency, queue/pool/locks/errors and recovery. Absence is UNVERIFIED. |
| Index / plan / growth / stale stats | Native plans at representative tenant sizes/skews, rows scanned/returned, sequential fact-scan loops, actual index use and estimate/actual ratio. Retain fresh and stale-statistics scenarios separately. Index existence is not proof of use; tiny sequential scans are not automatically defects. |

Do not run a 25/50/100/150-user test for every edit. Choose a small isolated
scenario when it answers the change's risk. Capacity claims require authorized,
representative mixed load, duration, observed concurrency and saturation/recovery
evidence; serial fixture results cannot supply that claim. No new service,
dependency, approved SLO, Production action or concurrency increase is implied.

## Machine-readable format (version 1)

Place new **synthetic, sanitized** evidence at `.quality/scalability/current.json`
and the immutable comparison run at `baseline.json`. The validator rejects
unknown fields, incomplete samples, negative/nonfinite values, duplicate scenario
IDs and non-synthetic input. Missing measurements must be explicit nulls.
Only identifiers/numeric measurements are accepted, not SQL text/parameters,
EXPLAIN payloads, URLs, credentials, names, customer rows or operating data.
Human notes and sanitized native-plan artifacts stay in a separately reviewed
local report. Input must be checked before saving; schema validation cannot prove
that an identifier is anonymized or that an operator measured it truthfully.

Root fields:

| Field | Value |
| --- | --- |
| schemaVersion / synthetic | `1` / `true` |
| revision / sourceDigest | Full 40-character Git HEAD / maintained-source SHA-256 |
| environment | Sanitized identifier for machine/runtime/PG version/config; change it if contention/config changes |
| scenarios | Nonempty array of the following records |

Each scenario has `id`, `workload` (`read`, `write`, `mixed`), `dataset`
(`fingerprint`: SHA-256 of synthetic seed/version/distribution; `rows`: total
fixture rows; `statistics`: `fresh`, `stale`, `unknown`), `concurrency` (actual
active overlapping clients, not configured target), `warmup` (excluded requests),
`durationMs` (fixed measured window), `samples`, `plans`, and `checks`.
Create separate scenario IDs for growth sizes, cold/warm cache, stale statistics,
ingestion-only and mixed workload. The environment/dataset fingerprints must
include preparation, skew, runtime/config and query/measurement method changes.

Every request sample contains every key below, numeric or null:

```json
{
  "apiMs": null, "sqlCount": null, "sqlExecutionMs": null,
  "lockWaitMs": null, "poolWaitMs": null, "rieQueueMs": null,
  "transactionMs": null, "rowsScanned": null, "rowsReturned": null,
  "responseBytes": null, "rssBytes": null, "errors": null
}
```

For parallel SQL, document whether `sqlExecutionMs` is summed server execution
or a critical-path measure; keep the definition fixed across runs. `rssBytes` is
process RSS, not incremental feature memory. `errors` excludes explicitly
classified deliberate negative requests; keep those as separate scenarios.

Each normalized plan has `id`, `indexUsed` (boolean), `rowsScanned`,
`rowsReturned`, `maxFactScanLoops` (sequential fact scans only, not indexed probes)
and `estimateRatio` (larger of estimate/actual and actual/estimate; use a documented
zero-row convention). Capture raw EXPLAIN only from reviewed read-only queries
on disposable native fixtures; never EXPLAIN ANALYZE an operating write.

`checks` contains `boundedReads`, `noNPlusOne`, `stockContention`,
`custodyContention`, `analyticsIngestion`: true for measured/focused-test success,
false for failure, null for untested, `not-applicable` only when the handoff
explains why the scenario has no such risk. A false always BLOCKs; a null WARNs.
These are producer assertions: the comparator does not infer query correctness
or discover all endpoints. Automated producers must assert bounds from actual
results/counts and native race effects, not hardcode success.

## Approved budgets and trustworthy comparisons

`tools/quality/scalability-budgets.json` intentionally starts with **no approvals**.
Foundation 002-A and 002-B1 are useful observations with different preparation
and contention; neither is an approved universal baseline. B1's stale-statistics
failure remains open; ANALYZE of a disposable fixture does not resolve it.

An approval is a reviewed record with `scenario`, `approval` (decision reference),
`baselineSha256` (SHA-256 of exact immutable sanitized baseline file bytes),
`minSamples` (at least two, chosen by the reviewer for the workload) and `limits`.
Each metric limit may have `max` and/or `regressionPercent`, nonnegative.
Optional `planLimits` entries specify `id` plus `maxFactScanLoops`,
`maxRowsScanned`, `maxEstimateRatio` and/or `requireIndex`. Do not copy synthetic
test budgets from `scalability.test.mjs` into policy or raise budgets to hide a
failure. Changing an approval requires explicit owner/reviewer agreement and
the measured rationale; the script cannot authenticate that human agreement.

API/server/lock/pool/RIE limits compare nearest-rank p95. SQL/error counts,
scan/result/bytes/RSS and transaction limits compare **max**, so one N+1 burst,
unlimited payload or long transaction is not hidden in a percentile. Absolute
approved limits fail even without a baseline. Relative limits require a matching
approved baseline hash and identical environment, workload, data distribution,
statistics, concurrency, warmup, sample count, window and plan identities.
Mismatch, missing baseline/approval or stale source gives UNVERIFIED/WARN.
Unknown statistics warn. A dedicated stale-statistics scenario may verify its
own approved limits only against an equally prepared stale baseline; it never
substitutes for representative fresh-statistics or mixed-load evidence.
An approved metric/plan that is missing gives BLOCK. No new SLO is invented.

Summaries preserve actual scenario sizes/concurrency/counts/p95; warnings name
unmeasured signals. `.quality/` is already excluded from Git and Docker.
CI uploads the sanitized summary, not private input or raw customer/query data.
Keep original measurement inputs immutable locally when comparing iterations.

## Enforcement limits and mandatory handoff

Root AGENTS and the discoverable `.agents/skills` entry persist across sessions.
The critical contract test detects their removal/disconnection, missing CLI/CI
wiring and intentional comparator regressions. Existing RIE query-count/budget,
scoped SQL and race suites remain the executable behavior checks. This is not a
universal static SQL/N+1 detector, automatic native monitor, or measurement of
unmodified endpoints. New endpoint discovery, representative scenario selection,
instrumentation truth, baseline/budget approval and handoff completeness remain
engineering review responsibilities. Missing measurements are visible as WARN;
release verification fails closed. Branch protection/Railway settings remain
external and are not configured/claimed by local files.

Every impactful handoff includes:

`Scalability Gate: PASS / WARN / BLOCK` — scenario; rows/distribution; actual
concurrency; SQL count; API p95; measured bottleneck; untested risks; artifact.
For no impact: `Scalability Gate: N/A — <reason>`.

Functional local acceptance, measured scenario performance and deployment/user
capacity readiness are separate conclusions. No commit, push, Docker, deployment,
Production access or operating DB migration is authorized by these commands.
