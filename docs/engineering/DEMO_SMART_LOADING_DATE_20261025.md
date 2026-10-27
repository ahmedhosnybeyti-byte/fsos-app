# Demo Smart Loading — existing canonical data by selected date

> Superseded by [the central daily RIE policy](RIE_DEMO_DAILY_POLICY_20261025.md).
> The ceiling is now today's Asia/Riyadh day, not a future selected display day.
> Active Demo also bypasses persistent result-cache reads/writes. The historical
> implementation and measurements below describe the earlier local iteration.

Local-only, 2026-10-25. Base `f482d9bde14b94e3619e221d61a416b145874ca6`;
uncommitted, unrelated WIP preserved. No import, synchronization, new data source,
database migration, operating-data mutation, Production connection or deployment.

## Existing behavior and narrow correction

The session's primary inventory reads already select the latest canonical
`Van Inventory.ReportDate` per visible route **on or before targetDate**.
Management reads have the same upper bound. Future canonical dates are not
rejected merely because they are after today's date. The existing PostgreSQL
rows can therefore support successive selected days without uploading again.
`Van Loads` is not an inventory fallback and was not made one.

Two auxiliary reads did not carry this date ceiling:

1. `SmartLoadingService.recalculate` selected the maximum ReportDate across
   the caller's scope, including future snapshots, before fetching quantities.
   Because the screen runs recalculation, its stock could disagree with the
   correctly scoped initial session.
2. The session's lost-opportunity stock lookup used latest-per-route without
   a date ceiling, so later inventory could wrongly suppress an opportunity.

Those reads now pass `demoInventoryAsOfDate` to the existing RIE generic query.
One central predicate is applied **before** MAX/latest-per/grouping. It activates
only if the authenticated query company exactly matches the nonempty backend
`RIE_DEMO_CANONICAL_COMPANY_ID` AND its database mode is FULL_ERP. The mode check
is an uncorrelated scoped subquery in the same SQL statement, not an additional
request or per-product query. Other tenants never receive the extra SQL.
ANALYSIS_ONLY, SFA, absent/unknown modes and an unset marker preserve their
existing results. The field is constructed by the server; no new public endpoint
or permission grant exists.

The local API `.env` marker was set only for the previously verified Demo
company `cmri8nwt1000tegks6tesnwkv`, using the retained company/warehouse identity
receipts, without reading Production. `.env.example` documents the opt-in and
defaults it to empty. No environment credential values were printed or changed.
An API process must load/reload its local environment to use this setting.
No running application server or deployment was changed.

## Dates and data that remain necessary

- Selecting **2026-10-31 (Saturday)** uses a snapshot on or before that selected
  day, not November/December. Selecting the next day can use its already imported
  snapshot. The existing day/date/route/customer filters remain in place.
- This does not synthesize daily balances from loading movements. A missing
  `Van Inventory` snapshot remains missing; loads plus insufficient sales cannot
  establish a closing balance. The existing UI/API null/unavailable behavior is
  preserved.
- Demand still follows the user's existing sales from/to period and confirmed
  invoice/return rules. This patch does not redefine recommendation formulas or
  reinterpret an imported invoice as an operational posting.
- The UI/API **loading target** keeps its established tomorrow-or-later rule and
  default. There is no new independent display-date picker or current-day bypass.
  The generic as-of parser's existing default is today's Riyadh date; that is
  distinct from the loading-target default. On Oct 31, the ordinary preparation
  target defaults to Nov 1. This task did not change that operational contract.
- The actual tenant's Oct 31 coverage was not queried in this local-only task.
  Therefore no claim is made that all routes have snapshots, Saturday customers,
  Products, confirmed sales or matching units for that day. These remain the
  data prerequisites for a populated presentation. The supplied workbook was not
  re-imported or treated as a runtime source.
- Other companies' existing source-selection behavior was not changed. This
  does not complete the separately blocked operational vehicle-stock unification.

## Verification

35 focused cases pass across the new isolated SQL/demo/session/recalculation
suite and existing Smart Loading returns/staleness suites, zero skips/TODOs.
The new suite freezes the clock on Oct 25 to keep the Oct 31 case reproducible.
It uses only existing-format canonical rows and settings: no files, version,
workbook, import or WMS table. Two companies / 30 synthetic canonical rows:
Oct 25/30/31, Nov 1 and Dec 31 stock, Saturday customers, products, confirmed
sales, later sales and load-only data, plus an inaccessible route. It proves:

- date selection and latest filtering before aggregation;
- real recalculation reads Oct 31 stock 30 rather than Dec 31 stock 999;
- a session opportunity uses 30, so December stock cannot suppress it;
- no substitution of load quantity 777 for missing inventory;
- tenant/route and mode isolation, opt-out parity and unchanged canonical rows;
- one SQL execution per bounded inventory read, including the mode guard.

Mandatory critical core: 103 pass. API TypeScript passes outside the Windows
sandbox's symlink restriction; the sandbox attempt could not resolve existing
Prisma/Express types. The pnpm launcher failed on workspace realpath before
running the gate; the identical checked-in `node tools/quality/run.mjs critical`
entrypoint ran successfully. No dependency was installed.

No broad changed/all-Postgres/release suite, audit, Docker build or large load
test was run, following the owner's focused/local-only scope. Local functional
verification is not repository-wide or deployment acceptance.

System Design Gate: PASS for this narrow read-only Demo contract. The performance
trade-off is one indexed tenant-mode lookup inside a Demo stock SQL statement,
with unchanged query count and existing RIE admission/bounds.

Scalability Gate: WARN — synthetic PGlite, 30 rows / two companies, actual serial
concurrency one, one SQL per stock lookup. Ten service observations after warmup
are retained at `.quality/demo-smart-loading-date/focused.json` (latest p95
9.995 ms). HTTP/API p95, native plans, acquisition/lock waits, comparable approved
baseline and concurrent capacity were not measured. No 150-user claim.
