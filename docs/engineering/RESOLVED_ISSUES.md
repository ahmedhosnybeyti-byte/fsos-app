# Murshidak Resolved Engineering Issues

This is durable engineering history. A **RESOLVED** item is historical evidence, not a permanent assumption. It may be reopened only when new measurements prove a regression; cite that new evidence before changing the previous design.

## Operational Leaflet basemap API-key watermark

- **Symptom:** Operational maps displayed a repeated `API KEY REQUIRED` watermark across their tile surface.
- **Root cause:** Eleven Leaflet components independently used Carto's unauthenticated raster endpoint, which can return an API-key-required image tile.
- **Fix:** Centralized the operational basemap in `operational-basemap.ts` and moved every affected Leaflet map to Esri's keyless Light Gray Canvas endpoint with the provider's required attribution retained.
- **Commit/deployed:** `6ecb4fd`.
- **Regression-prevention rule:** Do not introduce direct tile-provider URLs in map components. Use the shared operational-basemap helper, and only change providers after confirming production credentials and required attribution.

## Mixed-load RIE bottleneck

- **Symptom/evidence:** A 100 Sales Rep concurrent test passed 100%. A heavy 100-user Mixed test achieved about 13.79% success, with about 200 timeouts, p95 around 30 seconds, and RIE queue wait around 29 seconds.
- **Root cause/evidence:** The constrained RIE queue was the visible bottleneck under mixed load. Raising RIE concurrency from 20 to 30 did not solve it and substantially increased PostgreSQL CPU/RAM.
- **Regression-prevention rule:** Do **not** treat increasing RIE concurrency as the default solution. Identify and measure the real bottleneck first.

## Dashboard Performance — redundant daily distinct aggregation

- **Symptom/evidence:** At 150 VU, `GET /dashboard-performance` accumulated 349,497ms of RIE queue wait and 57 client timeouts.
- **Root cause:** The daily `Invoice Items` aggregation calculated three `COUNT(DISTINCT)` values which were subsequently replaced by period-level `distinctFor()` results.
- **Fix:** Remove only the unused daily distinct aggregates; retain `distinctFor()` as the final source of invoice, customer, and SKU distinct values.
- **Commit:** `codex/dashboard-remove-redundant-distinct`.
- **Regression-prevention rule:** Do not compute daily distinct values when the response always overwrites them with period-level distinct values.

## Management Smart Loading — repeated loading-risk calculation

- **Symptom/evidence:** The Company Admin management loading-risk endpoint was the first mixed-load failure at 50 VU (8 timeouts in 21 requests, p95 about 30 seconds), while it rebuilt the same scoped Van Inventory, Invoices, Invoice Items, Routes, Employees, and Products analysis for every open.
- **Root cause:** No prepared read model existed for an unchanged management scope; the Route × Product calculation and JSON rollup always re-ran in PostgreSQL/RIE.
- **Fix:** Persist the exact prepared endpoint result by company, date window, management aggregation level, and permission-derived route scope. Validate scope before every read; on cache miss run the unchanged RIE calculation and store it. Canonical changes invalidate only overlapping Van Inventory route scopes when known, and conservatively invalidate that company for other dependent sources.
- **Commit:** `df47353646d0d65512cc5c62705a1ed95d10dd9d`.
- **Regression-prevention rule:** Never serve a management snapshot before resolving the caller's current hierarchy scope, and invalidate it in the same transaction as a real dependent canonical-row change.

## RIE request-level acquisition and fan-out

- **Symptom/evidence:** A production Smart Loading session performed 16 logical RIE operations, 29 PostgreSQL operations, 34 hierarchy-resolution calls, and 15 active-version resolutions in one action (Phase 0 telemetry, 2026-09-13).
- **Root cause:** Related facade calls were individually governed, but had no shared request-level coordination for hierarchy scope, active-version metadata, or feature fan-out.
- **Fix:** Add the request-scoped `RieRequestPlannerService`; it caps migrated action fan-out at three simultaneous facade operations and 24 total operations, and reuses only hierarchy route sets and active-version counts. Smart Loading session is the first migrated feature; its specialized management bundle and response contract are unchanged.
- **Commit:** `3224a36987328765d583cd6d612e40b858a92a5c`.
- **Regression-prevention rule:** Migrate a feature through `RieFacade.runPlannedRequest()` before adding concurrent RIE work. Never place fact rows in the planner cache, bypass PostgreSQL scoping, or raise the global RIE semaphore as a substitute for a request budget.

## Smart Loading — `queryManagementStockAlignment`

- **Symptom:** Slow/heavy query execution and materialization pressure.
- **Root cause:** Large Inventory, Invoice, Invoice Item, and Product materialization; wide `source.*` rows; temp-file/`BuffileWrite` pressure; and insufficient early narrowing of Invoice Items and Products.
- **Fix:** Scope invoice keys early, use scalar projections, and reduce materialization size.
- **Commits:** Original optimization `0f534eb`; production replay/deploy `d181217577a2ad499d470714916917c099e4bdfa`.
- **Regression-prevention rule:** Bound Invoice Items and Products by scoped invoice keys and avoid wide source-row materialization.

## Smart Loading — `queryManagementVehicleProducts`

- **Symptom:** Unnecessarily broad fact materialization risk.
- **Fix:** Use scalar Inventory, Invoice, and Invoice Item CTEs, with Invoice Items bounded by scoped invoice keys.
- **Commit/deployed:** `3464b6b5cb9153d3c8ae38afacc4b0f08456c585`.
- **Regression-prevention rule:** Keep fact CTEs scalar and scope child facts through already-scoped parent keys.

## Smart Loading — `queryRouteProductStaleness`

- **Status:** Verified already optimized with scoped scalar CTEs and scoped invoice keys; no change was required.
- **Regression-prevention rule:** Do not rewrite this query without measured evidence of a regression or bottleneck.

## Smart Loading Management — duplicate heavy RIE acquisitions

- **Symptom/evidence:** One management session independently ran route/product staleness, stock alignment, and vehicle products. Those three results consumed four expensive permits because staleness also acquired one for active-version metadata. The surrounding active-route read added another expected acquisition (and, in the generic implementation, one additional logged metadata acquisition).
- **Root cause:** The three operations rebuilt the same scoped Van Inventory foundation, while stock alignment and vehicle products also rebuilt the same fixed-window Invoice/Invoice Item sales aggregate.
- **Fix:** A management-only bundle now resolves route permission once, obtains active-version metadata through an ungated helper while holding one outer permit, shares latest inventory/stock and fixed-window sales CTEs, and retains a separate through-target-date sales branch for staleness. The management active-route read is likewise coordinated under one permit. PostgreSQL still owns newest-wins resolution, filtering, joins, Route × Product aggregation, and compact JSON result construction.
- **Commit:** `c4f6e44`.
- **Regression-prevention rule:** Keep the three Smart Loading management calculations behind one bundle permit; never call the public gated active-version helper from inside a held permit, merge the distinct staleness/window horizons, or move Route × Product facts into Node.

## Decision Analytics Studio — duplicate Visits scan

- **Symptom:** Current/prior visit KPI computation scanned the Visits fact more than once.
- **Fix:** Derive total, distinct, and productive visit counts from one scoped Visits query.
- **Commit:** `3464b6b5cb9153d3c8ae38afacc4b0f08456c585`.
- **Regression-prevention rule:** Related visit KPIs in one request should share one scoped Visits fact query whenever semantics allow.

## Team Performance — duplicate comparison-period fact scans

- **Symptom/evidence:** With comparison dates enabled, one request executed six independent current/prior per-rep fact scans (Sales, Collections, and Returns), plus summary and target work.
- **Root cause:** Each comparison period was issued as a separate RIE query even though both periods shared the same company, hierarchy, route, active-version, and grouping contract.
- **Fix:** One scoped RIE query per metric now applies an OR-union of the two date ranges before aggregation and uses PostgreSQL `FILTER` aggregates to produce current and prior values independently. Overlapping ranges deliberately contribute to both values, preserving prior semantics.
- **Commit:** `dbca799`.
- **Regression-prevention rule:** For comparison-period Team Performance metrics, scan each scoped fact relation once and use independently filtered PostgreSQL aggregates; do not split current and prior into separate fact queries.

## Visit Copilot performance

- **Status:** Already optimized. It resolves the scoped customer slice first and performs fact aggregation in PostgreSQL.
- **Regression-prevention rule:** Do not rework it merely because it uses multiple calls; require measured evidence of a regression or bottleneck first.

## Smart Loading unintended automatic refresh

- **Symptom:** Smart Loading requests refreshed automatically on window focus or network reconnect after becoming stale.
- **Root cause:** TanStack Query default refetch behavior.
- **Fix:** Set `refetchOnWindowFocus: false` and `refetchOnReconnect: false` for the main Smart Loading session, management loading risk, and management lost opportunities.
- **Commits:** Original `cde96f5`; production `13980fe9c623165540d5e2e212996c8fa7b73ac8`.
- **Regression-prevention rule:** Preserve the Smart Loading management UX: Company Admin → Manager → optional Supervisor → optional Sales Rep → selected hierarchy scope/routes only. Never revert to whole-company loading by default.

## Smart Loading — last-sale input queue pressure

- **Symptom/evidence:** `GET /smart-loading/session` repeatedly aggregated `MAX(InvoiceDate)` over `Invoice Items → Invoices` for every request, contributing to RIE queue waits and 30-second client timeouts under mixed load.
- **Fix:** Persist only Route × Product last-sale inputs keyed by company, route, target date, and an active-source freshness signature. Resolve hierarchy scope live; use a snapshot only when every visible route is covered and the signature matches, otherwise retain the existing PostgreSQL aggregate and populate the input snapshot.
- **Commit:** Pending commit for this change.
- **Regression-prevention rule:** Never cache a final Smart Loading session. Keep threshold evaluation, Stale, Lost Opportunities final stock filtering, user scope, and response assembly live; a missing or stale input snapshot must fall back to PostgreSQL.
