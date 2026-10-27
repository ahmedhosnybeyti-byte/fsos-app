# RIE data-source correction — phase 1: Smart Loading product labels

Local-only change, 2026-10-25; review base
`f482d9bde14b94e3619e221d61a416b145874ca6`. Existing unrelated working changes
remain outside this task. No commit, deployment, operating migration or company
database access.

## Scope and source ownership

Only the session's existing bounded Products lookup is changed. The dedicated
`querySmartLoadingProductMetadata` RIE contract takes company plus at most 5,000
product codes and returns product code/name/category with the existing page shape.
It does not list the whole catalogue or change recommendations' inputs/formulas.

- ANALYSIS_ONLY, absent settings and unrecognised modes retain the original
  canonical rows, duplicates, projection and entity-key ordering.
- SFA/FULL_ERP read code/name from the existing company-owned `wms_products`.
  Canonical product metadata supplies category and imported-only identities.
  No import file/active-version existence check gates an operational identity.
- PostgreSQL merges normalized codes before returning results. Native identity
  wins over matching imported identity; duplicate normalized native identities
  fail closed. No product, fact, ledger, stock or import row is modified.
- Inactive product labels remain available to historical recommendations.
  Missing category remains null; no category or operational transaction is invented.

Company scope and requested-code filters precede the scalar merge. Mode resolution
is part of the same coordinated SQL statement; no extra roundtrip, per-product
query, poll, persistent cache, connection pool or concurrency change. Existing
Smart Loading admission and request budgets remain in force.

## Verification and limits

The focused offline run passed 48 cases (new isolated SQL/source/session cases,
existing Smart Loading staleness/returns, request planner and coordinator).
The new fixture contains no files or dataset-version tables. It covers both
operational modes, default/ANALYSIS_ONLY parity, tenant isolation, native edits,
historical/native coexistence, ambiguous codes and one/5,000-code request bounds.

Initial comparable synthetic observations are retained in
`.quality/rie-product-metadata/observations-focused-initial.json`:
24,021 rows across operational products, canonical products and settings; actual
concurrency 1; one SQL adapter execution per lookup at both sizes. Ten samples per
scenario after one warmup. Service/adapter elapsed p95 in milliseconds:

| Requested codes | Original ANALYSIS_ONLY | Changed ANALYSIS_ONLY | FULL_ERP |
| --- | ---: | ---: | ---: |
| 1 | 6.50 | 5.05 | 5.81 |
| 5,000 | 54.46 | 94.62 | 54.18 |

These are PGlite/Node elapsed observations, not API p95, native PostgreSQL server
time or a capacity baseline. The larger ANALYSIS_ONLY tail remains a concern;
do not claim a performance improvement or proven absence of regression. Native
plans, pool/lock waits, RIE queue samples, stale statistics, concurrent mixed
ingestion and multi-user HTTP capacity remain unmeasured. Normalized native-code
filtering may scan the tenant's product range using the existing company index;
this requires representative native-plan evidence before deployment acceptance.

A second alternating before/after probe retained at
`.quality/rie-product-metadata/paired-profile.json` uses 24,002 synthetic rows,
three warmups and 20 samples per variant at concurrency 1. It ran alongside the
offline quality gate, so its absolute times are not comparable to the initial run.
Its ANALYSIS_ONLY service p95 was 53.08→62.11 ms (one key) and 352.53→406.75 ms
(5,000 keys); FULL_ERP was 36.51→45.77 ms and 303.76→447.50 ms. These observations
do not establish performance non-regression. PGlite EXPLAIN confirmed that the
ANALYSIS_ONLY branch executes no WMS scan; the operational branch scans each
requested tenant source once, but uses sequential tenant filtering in this
fixture. There is no per-key scan loop. Representative native-plan and latency
evidence is an acceptance blocker for the scalability requirement, not a PASS.

API TypeScript passes after local Prisma generation and shared-schema build;
see `.quality/rie-product-metadata/typecheck-after-schema-build.txt`. The full
local quality run is recorded in `.quality/changed.json`; required pre-existing
sales-draft/procurement/coverage SQL fixtures fail while creating an already
existing `company_operating_settings` table. The one full gate run completed
154 suites with 651 passes, 20 failures and no skips/TODOs/cancellations; other
failures are unchanged sales-draft editor and WMS coverage UI expectations.
The gate therefore skipped its own typecheck stage, but the separately run API
typecheck passed. Passing focused cases alone is not engineering/release
acceptance. No dependency was installed and Prisma generation
did not connect to a database. System Design Gate: BLOCK for overall local
acceptance; Scalability Gate: WARN (unverified capacity and non-regression).

## Deliberate boundary and next step

This does not make the entire Smart Loading session operate without imported
customers, sales or vehicle snapshots: those unchanged paths still determine
which product codes the session requests. Recalculation, management risk caches,
generic RIE Products reads and all other entities remain on their existing paths.

Before phase 2, resolve any outstanding local gate failures and obtain focused
native performance evidence for this contract. Only then assess an explicit
route/date/UOM contract between operational custody and analytical vehicle stock;
do not substitute stock, merge historical quantities or create postings here.

## Performance/quality closure — native PostgreSQL, 2026-10-25

Only `RieScalableQueryService.querySmartLoadingProductMetadata` was refined during
closure. Native EXPLAIN showed the requested-key joins, native WindowAgg sort,
historical DISTINCT sort and final sort in the first implementation. The refined
query retains one hashable requested-code relation and uses one grouped scalar
merge, without the native window or historical DISTINCT relation. Default/missing
mode and ANALYSIS_ONLY keep canonical row/duplicate/order parity. No index,
schema, dependency, cache, connection limit or operational source was changed.

A parameter-array `= ANY` prototype was rejected after repeated native requests
showed bad cached-plan behavior, despite fast custom EXPLAIN. Its raw evidence is
retained in `closure/native-array-prototype.json`; the final query uses a key
relation, not repeated linear membership probes.

The existing local cluster was positively checked as PostgreSQL 18.6 under
`.quality/wms/pgdata`; fresh UUID-named databases were created exclusively for
synthetic fixtures. No application URL or .env was loaded. Main catalogue size
is **100 products per company**, as clarified by the owner. The 5,000-code case
is only the existing maximum response-bound exercise. There are two test companies
for isolation; 200,000 synthetic non-product rows exercise entity-scope index
selection. Neither count claims to describe customer/Production data.

The same native fixture, warmups, alternating variant order and pool are used for
legacy, unaccepted phase 1, and refined SQL. Each cell below is synthetic loopback
HTTP p95 in ms, 24 measured requests per variant, excluding warmups. This is an
HTTP wrapper around real RIE/coordinator/Prisma, **not the Nest/JWT-authenticated
application endpoint**. Request/JSON/driver time is included; SQL execution is
measured separately with native EXPLAIN ANALYZE/BUFFERS.

| 100-product catalogue | Actual HTTP concurrency | Legacy | Phase 1 | Refined |
| --- | ---: | ---: | ---: | ---: |
| ANALYSIS_ONLY | 1 | 20.69 | 18.10 | 17.15 |
| ANALYSIS_ONLY | 4 | 17.50 | 15.60 | 16.91 |
| FULL_ERP | 1 | 16.94 | 19.69 | 17.73 |
| FULL_ERP | 4 | 16.82 | 17.92 | 15.47 |

The refined four-client HTTP means are 12.94/13.97 ms for ANALYSIS_ONLY/FULL_ERP;
service p95s are 1.93/2.07 ms. Each request still executes one RIE SQL statement.
Native 100-code SQL execution observations: ANALYSIS_ONLY 0.347→0.295 ms and
FULL_ERP 0.572→0.541 ms (phase 1→refined), versus legacy 0.150/0.142 ms. Native
reads add real source work; these observations do not prove zero overhead versus
canonical-only reads. At the 5,000-code boundary with four clients, HTTP p95 is
88.52→61.91 ms (ANALYSIS_ONLY) and 85.88→76.75 ms (FULL_ERP).

Workload pool connections are capped at four and observed at four; a separate
one-connection statistics observer is disclosed. Queries under the 100-product
fixture are often shorter than the sampling interval, so sampled active-query
counts are not proof of SQL overlap or zero waits. Direct RIE queue samples are
retained. Prisma pool acquisition wait is unmeasured/null; no lock-wait duration
or multi-user capacity claim. Files:
`closure/catalog-100/native-after.json`, per-case native EXPLAIN JSONs, and the
same script's larger boundary control at `closure/native-after.json`.

Failure classification reuses the previous 651-pass/20-fail gate and runs only
the seven previously failing files with/without the three phase-1 runtime
changes. Both controls have four passing and the same 20 failing cases:

| Existing failure family | Count | Cause independent of the product-label path |
| --- | ---: | --- |
| Sales draft B1/base/B2 | 4 | Shared WMS fixture already creates company settings; another setup creates it again |
| Procurement | 5 | Same duplicate settings-table setup |
| WMS coverage SQL | 5 | Same duplicate settings-table setup |
| Sales draft editor | 2 | Static render expects product text inside a collapsed accordion |
| Coverage UI ar/en | 4 | Existing copy/presentation expectations disagree with rendered component |

The pre-phase-1 control substitutes the three exact Git-baseline files in the
test loader; it retains identical surrounding WIP/test files. All failed names
and causes match; **zero introduced failures**. No old fixture/UI error was fixed
or waived. Raw controls/classification: `closure/failures-baseline.json`,
`closure/failures-current.json`, `closure/failure-classification.json`.

Focused regression: 48 pass, zero skips/failures; API TypeScript passes. The full
suite was not rerun, per the explicit task boundary. System Design Gate remains
BLOCK for overall repository acceptance because required old tests still fail;
the product-label contract itself has no detected failure. Scalability Gate
remains WARN: no approved performance budget/baseline exists, pool waits and the
full authenticated endpoint are unmeasured, and small p95 differences are not
proof of absolute non-regression. Ready for narrow local review, **not final
repository/deployment approval**. Phase 2 and deployment were not performed.
