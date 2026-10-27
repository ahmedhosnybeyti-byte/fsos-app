# RIE Demo first-session execution-budget fix — local, 2026-10-25

## Production closure after explicit approval

Deployed the exact tested API package as `80ac7f3d-fcdd-4bf6-99e2-59e621b7828d`
after confirming live rollback `11fcdcd7` was unchanged. Linux build and readiness
passed. Enabled only the trusted Demo company and activated build
`7957b220-d21f-4842-a5dd-c4cb2409f389`; no source edit, migration, web deploy,
cache deletion or stock command. Live session for Omar Al-Dosari, Oct 27 target:
first GET 200, 22 admissions / 15 instrumented SQL, 8,435 ms; repeated GET 200,
21 / 14, 5,453 ms. Recalculations returned 201; no budget/runtime error observed.
Read-only preflight proved zero saved cache entries for Oct 27, then one route /
100 snapshots appeared, with no last-sale day after Oct 25; repeat fingerprints
matched. Hierarchy memory was already warm from recalculation: full process-cold
24-admission proof is local, not falsely claimed as a live measurement.
Nov 2 was additionally exercised without widening the fact-date ceiling.
ANALYSIS_ONLY full-response parity is verified locally, not via a live Analysis
account. Current source remains uncommitted with unrelated WIP excluded.
System Design PASS; Scalability WARN (serial live observations, full local cold
uses all 24; concurrency/native waits/API p95 unverified). Evidence and screenshot:
`.quality/demo-cold-session/release/production-result.json` and
`production-smart-loading.png`. Historical local-only sections below predate
this explicitly authorized release.

## Proven failure and narrow fix

Read-only logs for deployment `44471c85-8dc2-41c6-ae47-a211e97b136c`, trace
`b4d3409b-9b53-4f13-ae88-30591315736f`, show GET Smart Loading session for
target `2026-10-26`, stale threshold 4: 15 logical operations, 24 admitted
PostgreSQL executions, 14 instrumented SQL operations, then
`RiePostgresExecutionBudgetExceededError` in scalable `query`. Successful
individual operation paths were not sampled in this Production trace. They
cannot be reconstructed from that log alone; the paths below are from the
complete local reproduction, whose failure and counters match the trace.

The existing cold hierarchy fallback independently fetched the same confirmed
company file metadata for Routes and Employees. The deployed pre-Demo baseline
already needed all 24 admissions on this request shape. The new Demo mode/day
read added one, so the final lost-opportunity inventory query attempted admission
25 and was rejected. A retry succeeded after hierarchy/last-sale caches warmed.

The **only new runtime edit** calls existing coordinator `singleFlight` for
`hierarchy.files`, keyed by company and scoped to the current request. Both
hierarchy branches reuse one identical metadata result. No cross-request cache,
new service/cache, mode bypass, admission change or permission change. Existing
persistent result cache and hierarchy freshness checks remain in place.

The fixed candidate is isolated over the exact failed seven-file Demo package;
its one-file delta and SHA-256 are retained in
`.quality/demo-cold-session/isolated-fix.json`. Baseline source is the retained
successful `747bd4ec` archive. No unrelated working changes enter the candidate.

## Reproduction path, before the fix

The actual SmartLoadingService → facade/planner → real hierarchy resolver →
scalable SQL and LostOpportunityService run against synthetic PGlite data.
Prisma transport is adapted, rather than replacing hierarchy, availability,
lost opportunities, planner or coordinator with canned results. Both existing
persistent cache tables and process hierarchy cache start empty. The same request
parameters, route-fallback account shape and opportunity branch are exercised.

| Admission | Path |
| --- | --- |
| 1 | Demo mode / Saudi read day |
| 2 | Hierarchy user identity |
| 3 | Hierarchy operational route assignment (absent, canonical fallback) |
| 4 | Confirmed company files for Routes |
| 5 | Same confirmed company files for Employees — duplicate |
| 6 | Active Routes dataset versions |
| 7 | Active Employees dataset versions |
| 8 | Current canonical Routes |
| 9 | Current canonical Employees |
| 10 | Route customers for selected weekday |
| 11 | Customer visit-day counts |
| 12 | Active vehicle routes / latest snapshot date |
| 13 | Latest eligible vehicle stock |
| 14 | Last sale by Route × Product, persistent cache miss |
| 15 | Customers purchasing stale products |
| 16 | Period quantity and priority sales aggregate |
| 17 | Product labels |
| 18 | Lost-opportunity canonical source availability: files |
| 19 | Lost-opportunity canonical source availability: versions |
| 20 | Baseline invoice items / sales value |
| 21 | Recent invoice items / sales value |
| 22 | Baseline return items |
| 23 | Recent return items |
| 24 | Lost-opportunity product labels |
| 25 — denied | Lost-opportunity latest stock by Route × Product |

The fix removes admission 5, so the final stock query now executes as 24.
Metadata and cache-table SQL outside RIE admission are counted separately in
the receipts: the fixed first request has 29 adapter engine statements, including
5 source-version/cache statements. These totals do not include native Prisma
BEGIN/COMMIT, authentication, pool or server-internal statements. They are not
claimed as native HTTP SQL totals. No execution was removed from the guard.

## Focused verification

| Scenario | RIE admissions / attempts | Result |
| --- | ---: | --- |
| Pre-Demo deployed baseline, cold | 24 / 24 | Ready |
| Demo before fix, cold | 24 / 25 | Same budget failure |
| Fixed Demo, cold | 24 / 24 | Ready; correct dated facts and lost opportunity |
| Fixed Demo, repeated | 21 / 21 | Ready; persistent last-sale cache reused |
| Saudi midnight, identical still-valid target | 24 / 24 | Ready; day-bound cache refreshed |
| Repeated after midnight | 21 / 21 | Ready; new day's result reused |
| Non-Demo FULL_ERP / ANALYSIS_ONLY, cold | 23 / 23 | Full response hashes match deployed baseline |
| Different rep, cold | 24 / 24 | Only that rep's route customers |

Midnight holds target `2026-11-02` constant on both sides: the actual incident's
Oct 26 target becomes invalid at Oct 26 midnight because preparation requires
tomorrow or later. The test preserves that existing validation. Stock advances
from Sep 30's quantity 2 to Oct 26's snapshot quantity 4 at Saudi midnight;
Oct 31's quantity 900 remains excluded. Sales dated Oct 26 become eligible then,
not before. Loads are never used as a balance. A single shared request resolving
three companies makes three file reads, preserving the company key boundary.

Fixed cold/repeated response hashes match the successful pre-fix Demo retry.
Non-Demo and ANALYSIS_ONLY complete response hashes match their pre-Demo
baseline, with the one duplicate metadata query removed. Existing focused Demo
date/cache and coordinator/planner regressions also pass.

**30 focused cases pass**, no failures/skips/TODOs; two additional archive-matrix
runs confirm baseline success and the expected pre-fix failure. The isolated
candidate's full API TypeScript check passes. The initial sandbox check could
not resolve installed Prisma/Express symlinks; the same unchanged compiler and
config passed with filesystem access. No dependency was installed or test waived.

Evidence: `.quality/demo-cold-session/{production-failure,baseline,before,fixed,
comparison,isolated-fix}.json`, `focused-tests.log`, `typecheck.log`, and the new
`demo-cold-session.postgres.spec.ts`. The runtime package remains uncommitted.
No broad audit/suite, Production data read, source/stock write, config change or
deployment occurred in this repair task; Production access was logs only.

System Design Gate: PASS for this narrow local fix. Scalability Gate: WARN:
96 canonical fixture rows across 3 companies, 2 routes/company; actual request
concurrency 1 with internal admitted SQL serialized. RIE counts are measured
above, native API p95 and pool/lock waits are unmeasured. The cold request uses
the whole existing 24 budget, so there is no admission headroom on this shape.
The duplication is resolved; these functional checks are not a capacity claim
or permission to deploy.

## Sealed local package

Follow-up packaging rechecked all 599 retained baseline files and the complete
tested 600-file candidate. Exactly the seven approved daily-policy/cache runtime
files differ from the rollback source; the cold-session repair adds only its
one hierarchy-file change to that package. The archived source matches the
tested candidate; unrelated WIP, tests/evidence, secrets and build artifacts are
excluded. No tests were repeated for this packaging-only follow-up.

Archive: `.quality/demo-cold-session/release/api-source.tar.gz`, SHA-256
`20c1a48a78a5f334fa7f831da3713454818c40079f236c4e662eeb222c6d411b`.
`release/manifest.json` and `release/receipt.json` retain all hashes and rollback
metadata. This is prepared locally, not deployed; the current live state was
not re-read during packaging. Last verified live rollback is `11fcdcd7` using
the baseline `747bd4ec` image, with Demo disabled.

Any separately authorized deployment must first confirm its source base is
still current, build the fixed Linux image, verify readiness, then activate only
the trusted Demo company marker and inspect Smart Loading/session/recalculation.
On failure, disable the marker and restore the pre-deployment image immediately.
No migration, data restore, stock edit, warehouse operation or web deploy is
part of that sequence. Fixed-image Linux packaging and Production verification
remain pending; local functional success does not claim native capacity.
