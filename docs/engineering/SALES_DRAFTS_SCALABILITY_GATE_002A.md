# Foundation 002-A — Scalability Gate: WARN

Local evidence, 2026-10-22. This is **not** evidence of capacity for 150 users.
The functional gate and this capacity gate are separate.

## Measured contract

- The actual browser loaded Visit Copilot context once. Three draft saves caused
  three PATCH requests and **zero additional context requests**. Only the draft
  list and selected detail were refreshed; no polling or heavy analytics on save.
- Native PostgreSQL 18.6, verified `.quality/wms/pgdata`, loopback port 55561.
  `tools/quality/sales-drafts-performance.cjs` verifies that identity, dumps the
  retained synthetic draft fixture, restores a uniquely named temporary clone,
  seeds 20 products / 200 lots and corresponding stock/own-custody positions,
  runs actual Nest/auth/RIE/Prisma HTTP, verifies protected-table digests, and drops
  only its own clone. No operating database or operating environment file is used.
- Two synthetic customers, 22 company products, at most 20 draft lines, **one
  active request at a time**. Three warmups excluded, 25 measured requests per
  endpoint. Create has one observation, not a meaningful percentile; five stale
  requests deliberately return 409 and are counted separately.

| Endpoint | API p95 ms | SQL statements/request | Engine query duration p95 ms | Transaction p95 ms |
| --- | ---: | ---: | ---: | ---: |
| Save 1 line | 42.6 | 31 | 2 | 20.2 |
| Save 20 lines | 44.7 | 31 | 6 | 25.2 |
| Read detail | 18.9 | 14 | 1 | — |
| Check 20 lines | 48.2 | 20 | 25 | 32.7 |
| List drafts | 21.7 | 14 | 0 | — |
| Product picker | 24.4 | 15 | 0 | — |

These are local observations, not service-level promises. Rounded
engine durations of zero mean below its millisecond precision, not free queries.

Counts come from Prisma engine query events and include auth, mode, hierarchy,
BEGIN/COMMIT and transaction control. They exclude SQL executed *inside*
PL/pgSQL functions/triggers. Save's 23 Prisma operations are **not** its 31 SQL
statements; one-versus-20 lines has identical network-query count. Product checks,
line replacement and snapshots are batched; bounded database triggers still
validate each line. There is no per-product HTTP/Prisma query loop.

RIE global queue p95 was 0 ms; coordinator admission elapsed p95 was at most
0.21 ms in these serial endpoint samples. Admission elapsed also includes local
coordination overhead and is not pure PostgreSQL execution time. Save-20
transaction acquisition p95 was 1.2 ms. SQL-client duration includes driver/pool/
wire time; engine duration includes engine-side query time and possible waits.
Native EXPLAIN ANALYZE provides the separate server execution measurement.
Percentiles from different series must not be added or subtracted to infer waits.
There were no unexpected 4xx, SQL errors or 5xx; the five intentional stale
commands returned 409. Six unattributed startup recovery statements are recorded
separately, outside requests; scheduled jobs are stopped during the sample.

## Measured query defect and fix

The initial 200-lot check had API p95 **2,055 ms**, engine-query p95 2,034 ms,
with RIE queue wait 0 ms. Native plans exposed repeated nested-loop scans and
re-evaluated stock/custody aggregates. A first aggregate-only change improved a
short sample but was unstable in the longer prepared-query run; it was rejected.

The final query materializes narrow selected-line, lot, inventory and own-custody
sets after company/product/warehouse/rep scope, then aggregates each once. The
existing `wms_inventory_state.available` remains authoritative; its formula and
all WMS functions/tables are unchanged. Customer shelf-life policy is evaluated
once. The grouped custody predicate retains parity with the existing WMS quality
function; exact expiry, quarantine, missing quality and undated-lot cases are
covered by SQL parity tests. Node receives at most 20 prepared rows.

Final native quantity plan: planning 3.583 ms, server execution **3.121 ms**,
20 rows returned. Stock/custody aggregate loops = 1 each. The tiny plan scans
201 warehouse positions once and 201 own-custody positions once; batches are
read once for selected-lot metadata and once inside the reused inventory view,
201 rows per read, rather than being repeatedly scanned per selected line.
The executable sample rejects repeated WMS fact sequential scans and repeated
aggregate execution on this fixture. Protected WMS/custody/GL/AR/RIE digests
are exactly unchanged after all measured requests.

Nine critical plan shapes were captured: mode, RIE customer, visit ownership,
command deduplication, draft list/detail, warehouse access, quantities, products.
Native command lookup used `sales_draft_commands_pkey`; the final tiny fixture
mostly chose sequential scans. Index existence is not claimed as index usage.
Available paths include:

- `sales_drafts_visit(company_id,rep_id,visit_id,created_at DESC,id)` and the
  partial unique active-draft index `(company_id,visit_id)`.
- Company/draft unique keys, line `(company_id,draft_id,line_no)` and command
  `(company_id,rep_id,command_key)` primary keys.
- Existing visit customer/history `(company_id,rep_id,customer_code,started_at,id)`;
  there is no new unrestricted customer/global draft listing.
- Existing batch company/product/expiry, warehouse-access, position
  company/warehouse/batch and custody company/recipient/warehouse/batch indexes.

No RIE concurrency/budget, planner global setting, cache or infrastructure was
changed. Writes hold the per-visit lock only for the short local transaction;
RIE authorization happens before that transaction. Native independent-connection
race and rollback tests provide correctness evidence, not throughput evidence.

## What remains unproved

**Scalability Gate: WARN.** The discovered serial-query bottleneck is corrected
on the measured fixture. There is no new serial bottleneck observed after the
fix; absence of a new concurrency bottleneck is **not established**. The previous
150-user RIE/PostgreSQL contention issue is not claimed resolved.

Each UI save currently adds one save plus two draft refresh requests: about
**59 SQL statements** on this fixture (31 + 14 + 14), including repeated fresh
authorization. This is bounded but can add pressure to shared RIE/DB admission.
No representative tenant size/skew, mixed analytical traffic, 25/50/100/150-user
load, saturated connection-pool/lock waits, memory/RSS or recovery-under-load
measurement was performed. Product substring search and query/index selection
at large company sizes need representative-data plans. Functional success and
unused CPU/RAM do not waive these risks.

## Proposed isolated load plan — not executed

Use the existing approved native isolated test environment, synthetic data only,
with a verified test DB identity and disposable database/backup before seeding.
No Docker, Railway, Production, new dependency or infrastructure. Prepare a
reviewed workload with representative history volume, tenant skew, customers,
routes, products, lot/expiry/quality distributions and **distinct authorized
reps/visits**, rather than 150 requests contending on one visit lock. Include
existing RIE analytical traffic alongside drafts. Keep current concurrency and
query budgets unchanged.

| Stage | Active users | Ramp | Warmup excluded | Steady measurement | Recovery |
| --- | ---: | --- | --- | --- | --- |
| Baseline | Same stage sizes, existing RIE/visit traffic | Gradual | 2 min | 10 min | 2 min |
| 1 | 25 | 1 min | 2 min | 10 min | 2 min |
| 2 | 50 | 1 min | 2 min | 10 min | 2 min |
| 3 | 100 | 2 min | 2 min | 10 min | 2 min |
| 4 | 150 | 2 min | 2 min | 10 min | 2 min |

Use human think times and the actual sequence: context once per visit, product
search, bounded 1/5/20-line save, list/detail refresh, occasional explicit check,
reopen and finish. Record replay/conflict/security scenarios separately from
normal errors. Compare each stage with its baseline before proceeding.

Record API p50/p95/p99, throughput/timeouts/error classes, SQL statements/request,
RIE global/local queue and admission, PostgreSQL server execution, pool acquisition,
wait events/blockers/deadlocks/transaction duration, rows examined/returned and
EXPLAIN buffers, plus event-loop delay and RSS/recovery. Separate these timings;
CPU/RAM percentages alone cannot locate the bottleneck.

Proposed review budgets before running: normal operation p95 <= 1 s and p99 <=
2 s, unexpected errors < 1%, no query-budget failures/deadlocks/duplicates or
protected-ledger mutations, no growing queue or failure to return to baseline
after recovery. Pause escalation on a failed stage; retain the failed evidence
and diagnose waits before changing limits. These are proposed test criteria,
not achieved capacity or authorization to expand this implementation.

Evidence: `.quality/sales-drafts/performance{,-before-query-fix}.json`,
`performance-final.log`, `copilot-refetch.json`, and the functional report
[SALES_DRAFTS_FOUNDATION_002A.md](SALES_DRAFTS_FOUNDATION_002A.md).
