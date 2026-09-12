# Murshidak Resolved Engineering Issues

This is durable engineering history. A **RESOLVED** item is historical evidence, not a permanent assumption. It may be reopened only when new measurements prove a regression; cite that new evidence before changing the previous design.

## Mixed-load RIE bottleneck

- **Symptom/evidence:** A 100 Sales Rep concurrent test passed 100%. A heavy 100-user Mixed test achieved about 13.79% success, with about 200 timeouts, p95 around 30 seconds, and RIE queue wait around 29 seconds.
- **Root cause/evidence:** The constrained RIE queue was the visible bottleneck under mixed load. Raising RIE concurrency from 20 to 30 did not solve it and substantially increased PostgreSQL CPU/RAM.
- **Regression-prevention rule:** Do **not** treat increasing RIE concurrency as the default solution. Identify and measure the real bottleneck first.

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

## Decision Analytics Studio — duplicate Visits scan

- **Symptom:** Current/prior visit KPI computation scanned the Visits fact more than once.
- **Fix:** Derive total, distinct, and productive visit counts from one scoped Visits query.
- **Commit:** `3464b6b5cb9153d3c8ae38afacc4b0f08456c585`.
- **Regression-prevention rule:** Related visit KPIs in one request should share one scoped Visits fact query whenever semantics allow.

## Visit Copilot performance

- **Status:** Already optimized. It resolves the scoped customer slice first and performs fact aggregation in PostgreSQL.
- **Regression-prevention rule:** Do not rework it merely because it uses multiple calls; require measured evidence of a regression or bottleneck first.

## Smart Loading unintended automatic refresh

- **Symptom:** Smart Loading requests refreshed automatically on window focus or network reconnect after becoming stale.
- **Root cause:** TanStack Query default refetch behavior.
- **Fix:** Set `refetchOnWindowFocus: false` and `refetchOnReconnect: false` for the main Smart Loading session, management loading risk, and management lost opportunities.
- **Commits:** Original `cde96f5`; production `13980fe9c623165540d5e2e212996c8fa7b73ac8`.
- **Regression-prevention rule:** Preserve the Smart Loading management UX: Company Admin → Manager → optional Supervisor → optional Sales Rep → selected hierarchy scope/routes only. Never revert to whole-company loading by default.
