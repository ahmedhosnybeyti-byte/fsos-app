# Complete loading orders without a product-count ceiling

## Production closure — explicit two-function authorization

Owner approval explicitly covered exactly the two existing function definitions
and API/web CLI deployment. Definitions were saved before replacement; no table,
migration-history, permission, stock or custody changes were performed. The SQL
is maintained outside Prisma migration discovery at
`packages/database/sql/wms-complete-loading-functions.sql`; no new migration file
was uploaded or executed. The tested/applied SQL SHA-256 is
`12687bac517ca8a6b10c7fd1733b2d2da6c13a9eb1888114956fad060973435b`.

Railway CLI deployed API `a2817329-0885-42fc-8e48-7d687c3a000a` and web
`5c24b90d-0055-449d-b6a8-01cb78cde87c`, both SUCCESS with Linux image builds.
Readiness/route/assets are 200; anonymous recipient access remains 401. Served
bundles contain complete-order submission, quantity disclosure, accept/reject
and shared category expand/collapse controls. RIE/cache source is unchanged.

After deployment, the exact deployed service sources ran against Production
inside an explicitly rolled-back transaction using the existing rep's stored
role/permissions and normal company/branch/ownership checks. All 40 submitted
products reached recipient detail with exact codes/quantities, and the order
appeared in the recipient inbox. No stock command was invoked; request/proposal/
audit changes rolled back and the test order was absent afterward. This is a
service/database test, not an authenticated HTTP/browser session. Existing stock
and custody were not modified. Evidence and function backups are under
`.quality/complete-loading-20261025/`; compatible rollback app sources are API
`35f93f9d` and web `66dc1a77`. No failure/discrepancy required rollback.

System Design Gate: PASS for the authorized release scope. Scalability Gate:
WARN for missing comparable baseline, HTTP p95, pool/lock and mixed-capacity
evidence; native 1,000-product/two-client observations remain documented below.

## Historical local preparation record (superseded by closure above)

Local candidate, 2026-10-25. Production activation was blocked pending explicit
authorization for the new function migration. Earlier authorized recipient
accept/reject deployments are API `35f93f9d-740c-4225-a021-5447bc46b05d` and web
`66dc1a77-bf17-423a-ad91-8af99bf70e56`; both SUCCESS. Readiness/route/assets are
200, anonymous recipient access is 401, and the served shared bundle contains
quantity disclosure and category expand/collapse controls. Interactive normal
rep/keeper UI acceptance was not performed: computer use stopped because Edge's
URL could not be safely established. A two-product Production engine transaction
verified accept/reject/replay and rolled back all test business changes.

## Cause and narrowly scoped change

The request confirmation dialog selected a subset, initialized selection empty
above 20 products, and sent only that subset. The screenshot's existing request
and its immutable proposal each contain one product, P-052 / seven cartons. This
does not prove which selection actions the user took; no missing rows were
invented or backfilled into that request.

Remove product-count maxima from request/proposal/load schemas and the loading
editor, remove the total-allocation maximum from preparation, and remove SQL
truncation from existing recipient and warehouse loading-document projections.
The sender serializes every positive order line with no individual deselection;
invalid positive quantities reject the whole submission instead of disappearing.
The existing 20-row sender pagination is presentation only. No replacement
product-count maximum is introduced. Receipt/return contracts are outside scope.

Migration `20261025210000_wms_loading_complete_orders` changes only the existing
`wms_loading_command` and `wms_core_execute` definitions. It preserves nonempty
documents, stock checks, company/warehouse/recipient scope, version locks, FEFO,
exact quantities, immutable events and command replay. Keep incrementing the
allocation counter for the existing empty-reservation check. Preparation indexes
the submitted allocation JSON once inside PostgreSQL instead of scanning the
complete JSON for every allocation. Existing timeout/admission settings stay
unchanged; no dependency or infrastructure is added.

## Explicit single-document projection exception

The existing document-edit/preparation contract needs all of one authorized
order's scalar lines and allocations to prepare and accept it atomically. This
is an explicit exception for a single company/warehouse/document, not a full
catalogue, canonical entity, raw fact read, or pagination loop across documents.
PostgreSQL filters, joins and calculates prepared/shortage quantities. Node
serializes that prepared document and user-entered draft quantities; it performs
no stock aggregation or catalogue join. The measured 1,000-product recipient
response is 265,445 bytes. Orders remain scoped before joins; no `source.*` is
materialized and no numeric line maximum replaces the removed restriction.

## Focused evidence

23 focused SQL/sender cases pass with no failures/skips/TODOs, including 40 and
1,000 products, complete preparation/reads, once-only acceptance, whole rejection
with unchanged balances, invalid quantities, authorization/version checks and
audit-failure rollback. Isolated API and web TypeScript pass. No broad audit,
comprehensive test rerun, budget increase or unrelated repair was performed.

Native PostgreSQL uses a clone of the existing synthetic local test database:
two companies, three warehouses, 1,000 employee records, 1,000 order products and
allocations, 100 opening cartons/product. Migration preserves the fixture's
existing stock/custody/requests. Two independent concurrent accept/replay clients
produce exactly 1,000 dispatch and acceptance rows and one carton/product in
custody; physical stock becomes 99 cartons/product, reserved/transit zero.

Single service observations (not HTTP p95): create 604 ms / 10 SQL statements;
reserve 1,847 ms / seven; pick 501 ms / seven; recipient detail 192 ms / three;
reject 14 ms / eight. Concurrent accept/replay completes in 1,056 ms, 24 statements
across both requests, actual overlapping clients two. Counts include Prisma
transaction/authorization/audit, exclude internal PL/pgSQL statements. Largest
observed step is reservation; pure SQL execution/pool/lock waits are unmeasured.
No comparable approved baseline, HTTP p95 or representative mixed-user capacity
is established. These observations do not prove unlimited throughput/capacity.

System Design Gate: PASS for the isolated functional/transaction scope;
Production activation BLOCK pending authorization and new Linux image checks.
Scalability Gate: WARN for the missing comparable baseline, HTTP p95 and
pool/lock/mixed-capacity evidence. The numerical business ceiling is removed;
this does not assert infinite computational resources.

## Packaging and rollback

Seven runtime files differ across the isolated API/web packages. RIE and Smart
Loading calculation/cache source hashes match the latest deployed API exactly.
Evidence/source manifests: `.quality/complete-loading-20261025/`. No new runtime
was deployed for this limit removal. The 20-product blocking draft was not
deployed either.

Automatic approval review rejected executing `production-migration.cjs` without
arguments (the script's preflight path), because the same script also contains
the Production apply branch and the owner's earlier deployment authorization
explicitly excluded migrations. Nothing from that invocation executed. Do not
work around the rejection. Required authorization is the new two-function
Production migration and its migration-history entry, followed by API/web CLI
deployments. It does not authorize business-data or role/permission changes.

Once authorized: save both current function definitions, apply the isolated
function migration transactionally, verify definitions, build/deploy both
packages via Railway CLI and verify readiness/assets plus scoped transactions.
On failure, restore both saved definitions and redeploy the retained compatible
API/web sources above through CLI; do not rewrite stock/custody ledgers.
