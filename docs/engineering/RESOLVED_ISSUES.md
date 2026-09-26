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

## RIE authoritative PostgreSQL execution coordination

- **Symptom/evidence:** The process-wide RIE limit was 20, but admission was operation-scoped and incomplete. One HTTP request could submit 3–6 or more PostgreSQL executions concurrently, while direct FSOS 360, nested metadata, pagination, and several Prisma-backed RIE reads did not all share the same authoritative boundary.
- **Root cause:** The semaphore lived in one query service and wrapped selected high-level operations. It could therefore be acquired before metadata/SQL construction and held through Node work, while other RIE PostgreSQL paths bypassed it entirely.
- **Fix:** Add one process-wide `RieExecutionCoordinatorService`. Every RIE-owned PostgreSQL execution now passes through its exact execution boundary; the global limit remains 20, each HTTP request has a one-execution serial gate and a 24-execution budget, nested calls are re-entrant, and SQL preparation/result processing remain outside the global lease. Request-local hierarchy and active-version lookups use single-flight reuse.
- **Commit:** This local commit (`codex/rie-execution-coordinator`).
- **Regression-prevention rule:** Never call PostgreSQL from an RIE path outside the coordinator. Build SQL before admission, release the lease as soon as Prisma retrieval settles, count pagination and metadata as executions, and do not wrap hierarchy resolution, result shaping, or response composition in a PostgreSQL permit. Keep the process limit at 20 unless separate measured evidence justifies another change.

## RIE canonical current-state reads

- **Symptom/evidence:** The shared RIE active-row CTE was used by about 43 call sites and rebuilt newest-upload-wins at request time. Multi-version reads scanned active history, extracted JSONB business keys, ran precedence windows, and rejoined source rows before route/date/screen scope; direct invoice-sales, hierarchy, and entity-provider reads also consulted historical rows.
- **Root cause:** `rie_canonical_entity_rows` existed, but its row-by-row upsert collapsed duplicate keys, skipped blank keys, and was not reconciled on replace/deactivate, so it could not safely replace the runtime historical merge.
- **Fix:** Make immutable dataset versions the ingestion history and transactionally publish the exact current projection when file/version lifecycle changes. The projection preserves precedence, same-version duplicates, blank/null keys, partial-upload fallback, READY/active eligibility, and company isolation. All RIE record reads now scope `rie_canonical_entity_rows` directly; the historical merge remains only as a PostgreSQL parity oracle in tests.
- **Commit:** This local commit.
- **Regression-prevention rule:** Never reconstruct canonical newest-wins from `rie_dataset_versions`/`rie_entity_rows` in an RIE request. Materialize every accepted canonical upload first, publish current-state only at the READY/lifecycle boundary under the company/entity advisory lock, and prove any lifecycle change against the historical parity oracle before altering the read model.

## Geo Intelligence — full canonical entity materialization

- **Symptom/evidence:** Geo customer pickers, expansion analysis, and expansion scope values loaded complete Customers datasets; expansion also loaded complete Invoices and Invoice Items datasets and joined/aggregated them in Node.
- **Root cause:** Geo still used the legacy `getEntityRecords()` facade even though its outputs need only valid customer coordinates, distinct scope values, and customer-grain sales totals.
- **Fix:** Read canonical current-state through Geo-scoped scalar SQL. PostgreSQL now applies company/hierarchy/screen scope first, selects the first valid coordinate per customer with legacy ordering, preserves exact expansion-scope matching, joins Invoice Items to the legacy-equivalent winning Invoice header, and returns only customer-grain totals. PostgreSQL parity fixtures compare these results to the old ordered Node algorithms, including duplicates, invalid coordinates, hierarchy scope, and company isolation.
- **Commit:** This local commit.
- **Regression-prevention rule:** Geo Intelligence must not call `getEntityRecords()` or page to the end of Customers, Invoices, or Invoice Items. Keep Geo facts scoped and aggregated in PostgreSQL, project only fields used by the response, and preserve old duplicate/order/null semantics with PostgreSQL parity fixtures.

## Geo Engine — KPI-aware PostgreSQL facts

- **Symptom/evidence:** Geo Engine materialized Customers and multiple operational entities in Node, then performed invoice/item joins, KPI filtering, customer/city grouping, sorting, and detail pagination in memory.
- **Root cause:** The screen had no KPI-aware PostgreSQL contract, and its invoice date expression interpreted bare ISO dates in the PostgreSQL session timezone instead of matching Node `Date.parse` UTC semantics.
- **Fix:** Add compact Geo Engine map/table RIE queries over canonical current-state rows. PostgreSQL now reads only the selected KPI facts, applies company/hierarchy/date/filter scope before joins, preserves the existing formulas and grouping semantics, and interprets bare invoice dates as midnight UTC through one shared invoice-date expression.
- **Commit:** This local commit.
- **Regression-prevention rule:** Geo Engine invoice-backed KPIs and detail reads must share the UTC-stable invoice-date expression. Keep fact selection KPI-aware, joins and aggregation in PostgreSQL, and prove customer/city parity against the legacy fixture before changing formulas or scopes.

## Heatmap — full canonical entity materialization

- **Symptom/evidence:** Heatmap materialized complete Customers, Collections, Returns, Invoices, Invoice Items, and optional Products entities for several metrics; lost-sales and opportunity joins/window comparisons ran in Node, while older optimized branches still reconstructed historical newest-wins directly.
- **Root cause:** Metric-specific code mixed legacy full RIE reads with screen-owned historical SQL instead of using one current-state, scalar, set-based boundary.
- **Fix:** Heatmap now reads bounded customer projections and grouped scope/category values, aggregates Collections/Returns at customer grain, and performs sales/category joins plus lost-sales/opportunity window logic in PostgreSQL over canonical current-state. A count window preserves the exact 5,000-customer error without returning all matching rows.
- **Commit:** This local commit.
- **Regression-prevention rule:** Heatmap must not use `getEntityRecords()`, historical RIE tables, or entity-wide pagination. Preserve duplicate Invoice/Product Map semantics separately from direct sales-join multiplicity, and verify both against the PostgreSQL parity fixture.

## Visit Efficiency — full canonical entity materialization

- **Symptom/evidence:** Visit Efficiency loaded complete Visits, Routes, Employees, and Customers entities, then performed customer scope, date filtering, joins, coordinate fallback, rep/day grouping, ordering, and distance aggregation in Node. Its scope-values endpoint also loaded all Customers.
- **Root cause:** The screen still used legacy `getEntityRecords()` reads even though the final response is a compact sequence and per-rep summary.
- **Fix:** One current-state PostgreSQL query now applies company/hierarchy/customer/date scope, preserves legacy duplicate-map precedence and coordinate fallback, sequences visits, calculates Haversine legs, and returns only final points and rep summaries. Bare ISO dates are interpreted as midnight UTC to match Node `Date.parse` exactly; grouped scope values use a scalar canonical query.
- **Commit:** This local commit.
- **Regression-prevention rule:** Visit Efficiency must not materialize canonical entities or page through Visits/Customers. Keep its date-only values UTC-stable, retain PostgreSQL parity coverage for duplicate/order/null, hierarchy, company, scope, and invalid-bound semantics, and return only the compact screen result.

## Territory Intelligence — full canonical entity materialization

- **Symptom/evidence:** Territory summary loaded complete Customers, Invoices, and Visits entities; customer-points also loaded complete Collections. City grouping, customer joins, period filtering, distinct activity/visit counts, and monetary aggregation then ran in Node.
- **Root cause:** The screen still consumed legacy entity-wide reads even though its two data contracts need only one prepared row per City or per final customer point.
- **Fix:** Dedicated canonical current-state SQL now applies company/hierarchy and exact City/date/status scope first, preserves legacy duplicate-customer mapping and source ordering, aggregates facts at City/customer grain, and projects only compact fields used by the unchanged health/SGI response formulas. Optional source availability remains explicit and SGI mapping returns only customer codes that have situations.
- **Commit:** This local commit.
- **Regression-prevention rule:** Territory Intelligence must not call `getEntityRecords()`, read full JSONB rows, or page through Customers/Invoices/Visits/Collections. Preserve its first/last duplicate behavior, UTC date-only boundaries, City slug semantics, hierarchy/company isolation, and final ordering through the PostgreSQL parity fixture.

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
- **Fix:** A management-only bundle resolves route permission once, shares latest inventory/stock and fixed-window sales CTEs, and retains a separate through-target-date sales branch for staleness. The bundle remains one fact SQL execution; active-version metadata is separately admitted at its actual PostgreSQL boundary by the systemic RIE coordinator. PostgreSQL still owns newest-wins resolution, filtering, joins, Route × Product aggregation, and compact JSON result construction.
- **Commit:** `c4f6e44`.
- **Regression-prevention rule:** Keep the three Smart Loading management calculations in one bundle SQL, but do not hold its permit across metadata resolution or SQL construction. Never merge the distinct staleness/window horizons or move Route × Product facts into Node.

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

- **Symptom/evidence:** Customer Briefing loaded complete Customers, Invoices, Invoice Items, Returns, Collections, Products, and Van Inventory entities, then performed date/customer/channel scope, joins, ranking, aggregation, and latest-stock selection in Node.
- **Root cause:** The briefing path still used entity-wide legacy reads even though its decision inputs can be represented as compact customer, product, peer, return, collection, trend, and inventory facts.
- **Fix:** One canonical current-state PostgreSQL query now applies company/hierarchy and exact date/customer/channel scope, preserves the legacy duplicate and ordering rules, and returns only prepared briefing facts. ISO timestamps are normalized to Node's UTC calendar day, while numeric Excel dates retain their established conversion.
- **Commit:** This local commit.
- **Regression-prevention rule:** Customer Briefing must not materialize full operational entities or page through their complete datasets. Keep its facts set-based and scalar-projected, and prove date, duplicate, ranking, peer, collection, and latest-inventory semantics against the legacy parity fixture.

## Smart Loading unintended automatic refresh

- **Symptom:** Smart Loading requests refreshed automatically on window focus or network reconnect after becoming stale.
- **Root cause:** TanStack Query default refetch behavior.
- **Fix:** Set `refetchOnWindowFocus: false` and `refetchOnReconnect: false` for the main Smart Loading session, management loading risk, and management lost opportunities.
- **Commits:** Original `cde96f5`; production `13980fe9c623165540d5e2e212996c8fa7b73ac8`.
- **Regression-prevention rule:** Preserve the Smart Loading management UX: Company Admin → Manager → optional Supervisor → optional Sales Rep → selected hierarchy scope/routes only. Never revert to whole-company loading by default.

## Smart Loading — last-sale input queue pressure

- **Symptom/evidence:** `GET /smart-loading/session` repeatedly aggregated `MAX(InvoiceDate)` over `Invoice Items → Invoices` for every request, contributing to RIE queue waits and 30-second client timeouts under mixed load.
- **Fix:** Persist only Route × Product last-sale inputs keyed by company, route, target date, and an active-source freshness signature. Resolve hierarchy scope live; use a snapshot only when every visible route is covered and the signature matches, otherwise retain the existing PostgreSQL aggregate and populate the input snapshot.
- **Commit:** `fa0c32e`.
- **Regression-prevention rule:** Never cache a final Smart Loading session. Keep threshold evaluation, Stale, Lost Opportunities final stock filtering, user scope, and response assembly live; a missing or stale input snapshot must fall back to PostgreSQL.

## Shared invoice-sales analytical read — unbounded Invoice Items merge

- **Symptom/evidence:** The common RIE invoice-sales read used by Geo Engine and Decision Analytics merged every active Invoice Items row before joining to the date- and permission-scoped invoices.
- **Root cause:** The Invoice Items newest-wins CTE had no dependency on the final scoped invoice set, so a narrow authorized/date slice could still deduplicate the full active item fact.
- **Fix:** Materialize the deduplicated, authorized invoice slice first and semi-join Invoice Items to those invoice keys before its newest-wins merge. Preserve the original item RouteID filter, join, aggregation grain, response shape, and permissions.
- **Commit:** Current local commit (see Git history).
- **Regression-prevention rule:** In invoice-sales reads, bind Invoice Items to the materialized scoped invoice keys before deduplication; never merge the entire active item fact when the request has an invoice scope.

## Local Decision — `GetTotalSales` full fact reads

- **Symptom:** A single Total Sales answer loaded all visible Invoices and Invoice Items into Node, then joined, date-filtered, and summed them in memory.
- **Root cause:** `handleGetTotalSales` used two legacy `getEntityRecords` full reads instead of a scoped aggregate contract.
- **Fix:** Use one dedicated PostgreSQL-first RIE contract that preserves company, hierarchy on both facts, inclusive InvoiceDate handling, canonical newest-wins and duplicate behavior, and returns only `SUM(Invoice Items.LineTotal)`.
- **Commit:** Current local commit.
- **Regression-prevention rule:** Local Decision aggregate intents must never materialize raw high-cardinality facts in Node when PostgreSQL can return the final scalar.
