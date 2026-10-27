# RIE Demo daily read policy

Status update: the cache-bypass design below was superseded by reuse of the
existing caches. Production activation then failed its first-session smoke and
was rolled back. See [the current release incident](RIE_DEMO_DAILY_CACHE_RELEASE_20261025.md).

Local-only implementation, 2026-10-25; review base
`f482d9bde14b94e3619e221d61a416b145874ca6`, uncommitted. Existing unrelated WIP
is preserved. This supersedes the selected-display-date Demo stock ceiling.
No Production connection, deployment, import/synchronization, source mutation,
schema migration, permission change, WMS posting or new runtime dependency.

## One policy at the existing RIE source boundary

`demo-daily-read-policy.ts` reuses the existing backend-only
`RIE_DEMO_CANONICAL_COMPANY_ID` marker. Exact company identity plus a database
FULL_ERP setting are both required. Names, warehouse codes, client flags and
future source rows never activate the policy. The local marker remains the
previously verified Demo company; no daily setting update is necessary.

The policy derives the current calendar day with `Asia/Riyadh` on each read.
There is no fixed exhibition date, data-end date, job, import or polling loop.
It advances at Saudi midnight even when no canonical row/version changes.
Requested report/target dates may narrow the result but cannot widen this ceiling.

Company/entity/route scope and the new date predicate apply inside the existing
SQL source, before joins, MAX/latest-per, aggregation, sorting and pagination.
The mode check is an uncorrelated subquery within the existing statement.
Non-Demo queries receive no added policy SQL. ANALYSIS_ONLY/SFA/default/unknown
modes retain their old results; the generic ANALYSIS_ONLY behavior is unchanged.

| Canonical data | Business visibility date |
| --- | --- |
| Invoices, Returns, Visits, Collections | InvoiceDate / ReturnDate / VisitDate / CollectionDate |
| Van Loads, Van Inventory | LoadDate / ReportDate; separate entities, never interchangeable |
| Invoice Items, Return Items | Company-scoped parent invoice/return date, including item-only reads |
| Price List, Route Assignments | StartDate; future EndDate does not hide a currently effective row |
| Employees | Optional HireDate; unknown optional hire date preserves the identity |
| Targets | First day of the supplied Year/Month |
| Sales Calendar | CalendarDate, including the existing typed PostgreSQL adapter |

Dated facts with missing/invalid dates and orphan invoice/return lines cannot
establish visibility and are excluded for active Demo. A new/unknown entity is
also excluded until it has an explicit temporal contract. Undated Companies,
Regions, Branches, Routes, Customers and Products keep their identity semantics.
Expiry, due and end dates are horizons of an existing record, not future business
events; they are not used to discard otherwise current records.

## Covered read paths

- Shared `activeEntityRowsCte`: generic RIE queries plus specialized management,
  Smart Loading, Visit Copilot, FSOS 360 and WMS-demand coverage queries that
  already use this builder. Their formulas, scopes, projections and budgets stay
  in place.
- Assistant's direct dataset/count/hint source.
- The entity provider's direct canonical materialization reads, including
  navigation/query-execution consumers; its existing calendar adapter uses the
  same day/mode rule.
- Direct invoice-sales reads in `RieFacade`.
- The existing ERP historical preview also caps known typed event dates. Undated
  operational history is not treated as evidence of a current event. Requested
  historical `asOf` metadata is preserved; it cannot admit later records.
- Hierarchy's current employee reads use the same HireDate guard. Its undated
  route cache remains; employee snapshots are not reused across mode changes.
  Existing request-scoped hierarchy coalescing remains enabled.

The two direct canonical sources that read only Products/Customers identity
labels have no event date and therefore need no temporal fact predicate. Version
and file availability are metadata, not stock/sales quantities; their admission
semantics remain unchanged.

## Smart Loading and persistent caches

Preparing tomorrow remains supported with its existing target-date rule, while
the facts used for the calculation stop at today's Saudi day. Recalculation
clips a future sales-period end to today and computes the period length from
that effective end; an entirely future period is rejected by the existing range
validation. Demo vehicle stock uses the latest eligible snapshot **per route**,
so a route with an older last snapshot is not dropped by another route's date.
There is no inference of a closing balance from loads or incomplete sales.

Active Demo bypasses the two existing **persistent** Smart Loading result caches
(last-sale snapshots and management loading-risk snapshots). This both prevents
reuse of an old/future result and avoids creating/updating PostgreSQL cache rows
in a read-only task. It reuses the existing RIE aggregate/compute function rather
than creating a cache or parallel workflow. Other companies and ANALYSIS_ONLY
retain their existing persistent-cache behavior.

Trade-off: active Demo recomputes those bounded aggregates on a new request,
under existing RIE admission and query budgets, instead of a persistent cache hit.
There is one scoped mode read in affected Smart Loading workflows, independent
of product count. No concurrency limit or request budget was increased.

## Focused verification actually run

- **44 cases pass**, zero failures/skips/TODOs, in the two Demo SQL suites,
  direct-facade regression, existing Smart Loading returns and staleness suites.
  Tests use real isolated PGlite SQL and canonical-format synthetic fixtures,
  not imported workbook bytes. The clock crosses UTC 21:00 / Saudi midnight
  without changing rows or settings. Covered: tomorrow/future target cannot
  widen reads, direct child/date leakage, mode/tenant/route isolation, calendar,
  history, provider, Demo cache bypass/no writes, multi-route snapshot selection,
  effective recalculation period and no load-to-balance substitution.
- **33 cases pass** in the existing canonical SQL/newest-wins/parity regression
  and RIE planner/coordinator regressions. No global admission change.
- Mandatory critical core: **103 pass**. API TypeScript passes using the existing
  installed compiler outside the Windows sandbox's symlink restriction.
- No source/operating database or WMS table was modified. Test trace assertions
  reject INSERT/UPDATE/DELETE/TRUNCATE in application read statements. All fixture
  writes are isolated synthetic setup. No API server or browser session was used.
- No broad changed/all-Postgres/release suite, full audit or large load test was
  run, matching the explicit focused/local-only scope. This is not repository-wide
  or deployment acceptance and does not waive existing release requirements.

## Performance evidence and limits

`.quality/demo-daily-read-policy/focused.json`: separate synthetic plan tenant,
1,000 invoice headers + 10,000 items. Requests for 1/20/100 product keys each use
one SQL adapter execution and return only the grouped product result. PGlite
EXPLAIN ANALYZE confirms the parent-key relation executes once (500 eligible,
500 future headers removed), not once per item. Ten service timing samples per
size follow a warmup; raw observations are retained. Internal mode subplans are
inside that one statement; this is not a claim of one internal table access.

System Design Gate: **PASS for the scoped local functional/security contract**.

Scalability Gate: **WARN / UNVERIFIED** — scenario above, 11,000 tenant fact rows,
actual concurrency **one**, one SQL/read. HTTP/API p95, native PostgreSQL execution,
pool/lock waits, mixed workload, comparable approved baseline and user capacity
were not measured. PGlite/Node service elapsed is not API p95; the parent scan
shape is measured but the end-to-end bottleneck is not isolated. No capacity or
150-user assertion. Machine assessment remains `.quality/scalability/latest.json`.

## Remaining boundaries

All identified dated RIE fact/effective-source paths now enforce this daily
ceiling for the marked FULL_ERP Demo. Undated identity metadata and future
expiry/due/end horizons intentionally remain visible. Direct database access
outside RIE and real WMS/custody operations are not changed by this policy.

The ceiling advances automatically on a **new read**; this does not push new
content into an already rendered browser payload or introduce client polling.
Actual Demo dataset completeness for a particular route/day was not queried in
this local-only task. If a daily snapshot is absent, the last eligible recorded
snapshot is used; no daily inventory is fabricated. This also does not complete
the separately blocked operational vehicle-stock unification.
