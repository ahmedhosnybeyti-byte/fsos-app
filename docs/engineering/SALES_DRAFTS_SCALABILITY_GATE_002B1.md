# Foundation 002-B1 — Scalability Gate: WARN

Local synthetic evidence, 2026-10-22. Read the
[functional report](SALES_DRAFTS_FOUNDATION_002B1.md) for the commercial blockers.

- Same existing authorization/query boundary; maximum 20 saved lines, selected
  company/products/warehouse/own rep, one stock and one custody aggregate. Additional
  lot counts/nearest dates reuse those bounded aggregates. No raw-lot payload,
  per-line SQL loop, polling, canonical price scan, GL scan or new infrastructure.
- `node tools/quality/sales-drafts-performance.cjs --foundation-b1` verifies the native
  cluster directory `.quality/wms/pgdata`, loopback 55561 and the retained synthetic
  source name. It backs up/clones only that synthetic source, prepares 20 products /
  200 lots, runs actual Nest/auth/RIE/Prisma HTTP serially, records query events and
  native EXPLAIN, and removes only its uniquely named clone. No operating DB or .env.
- Three warmups excluded, 25 observations per warm endpoint, one active request at
  a time. Five intentional stale saves return 409; no unexpected 4xx/5xx/SQL errors.
  Counts include authentication/admission and transaction control, not internal
  PL/pgSQL statements. This is not a concurrency test or capacity certification.

The last retained run measured check-20 API p95 **51.4 ms**, 22 SQL statements,
10,682 response bytes / 20 prepared rows, and native execution **11.560 ms**.
The sample overlapped local offline quality work; wall times vary between runs.
An earlier successful B1 sample measured p95 29.9 ms / native 2.668 ms. These are
observations, not a speedup claim versus 002-A's differently prepared fixture.
002-A used 20 check statements; B1 adds exactly READ ONLY and statement-timeout
setup statements, giving 22. Save-1 and save-20 retain 31 statements each.

Final plan scans 201 selected-company warehouse positions and 201 own-custody
positions once each, reads 201 batch rows once for selected lot metadata, and uses
200 single-row indexed batch probes inside the unchanged inventory view. Both
stock/custody aggregates execute once; there are no repeated fact sequential scans
in the prepared fixture. The 19 protected-table before/after digests are identical.
Maximum observed full Node test-process RSS during check samples was approximately
443 MiB; it includes Nest, TypeScript loading and fixture tooling, and is not the
incremental memory cost of B1 or evidence of memory behavior under load.

## Fixture-statistics failure retained, not treated as a runtime fix

The first B1 run failed the existing no-repeated-fact-scan assertion: native plans
estimated one company row while scanning 201 newly inserted rows, and repeated
batch sequential scans appeared inside `wms_inventory_state`. An `IN`→`ANY` trial
did not solve it and was reverted. The retained failed evidence is
`.quality/sales-drafts/b1-performance-stale-statistics.json`.

The harness now explicitly ANALYZEs the **disposable synthetic fixture** after
restore/seeding, removing dependence on autovacuum timing; the existing plan
assertion is unchanged and passes. No application/global planner setting, production
statistics job, query budget or concurrency limit changed. This establishes the
plan only for prepared statistics. It does **not** certify the earlier 002-A fix
as robust under stale statistics, or establish representative tenant/skew behavior.
Stale-statistics/runtime plans remain an open scalability risk for later evidence.

**Scalability Gate: WARN.** No large load, 25/50/100/150-user traffic, shared RIE
saturation, native pool/lock contention or recovery-under-load test was run.
The prior 150-user issue remains open. B1 changes neither analytical formulas nor
RIE admission limits. No release readiness is claimed.

Evidence: `.quality/sales-drafts/b1-performance.json` (metrics, samples, native
plans, commercial refusal case, exact protected digests and clone cleanup),
`.quality/sales-drafts/b1-browser.json` (20 layouts), and local quality reports.
