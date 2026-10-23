# Sales drafts — Foundation 002-A (local only, 2026-10-22)

Review base: `f482d9bde14b94e3619e221d61a416b145874ca6`. Existing uncommitted
Foundation 001 and unrelated work are preserved. No commit, push, deployment,
Docker, Railway, operating `.env` edit or `field_sales_os` connection.

## Delivered boundary

- Visit Execution includes a separate **Create sales draft** panel. It retains
  Foundation 001's independent notes/photos/outcome/finish behavior. Actual tax
  invoice, return, receipt and sales-order posting entries remain deferred.
- Only the signed-in SALES_REP owning the visit can use this path, with all of
  `sfa.access`, `visits.execute`, `sales.drafts.manage`, an active user and current
  SFA/FULL_ERP mode. The migration adds the permission catalogue entry only;
  it grants no roles, enables no companies and confers no accounting authority.
- Company, visit, rep, customer and names come from the authorized server visit.
  Inputs are strict; client tenant/rep/customer/status/financial fields are denied.
  Current customer access is rechecked through existing scoped RIE. Existing
  hierarchy semantics remain: an explicit current route assignment wins; when
  absent, the existing canonical Employees/Routes fallback still applies.
- DRAFT/CANCELLED documents have permanent UUIDs, exact typed lines and server
  snapshots of product code/name/base unit/conversion. One active draft per visit
  resumes across browser keys. Cancellation preserves content; a deliberate new
  create may start another draft. All historical documents remain paginated/readable.
- At most 20 distinct active company WMS products. BASE and approved WMS CARTON
  conversion only; cartons require PIECE base, fractional pieces are rejected.
  PACK or inferred imported UOM conversion is not supported. Weight/liquid BASE
  quantities retain six-decimal exactness. Master changes never rewrite saved lines.
- Warehouse selection requires explicit existing warehouse access. Current
  warehouse eligibility and **only the requesting rep's** custody are shown
  separately, excluding ineligible expiry/quality according to current records
  and customer shelf-life policy. They are never summed. Absent operational
  balance rows stay **unknown**, not manufactured zeros. This remains indicative:
  custody is not vehicle identity or customer delivery proof.
- Imported prices have no verified operational approval contract in this repo.
  Price/source, tax, discount and credit therefore explicitly require setup;
  no historical-price fallback, inferred VAT or financial total exists.
- Arabic/English, RTL/LTR, shared glass/cards/controls/tokens, mobile, loading,
  empty/error/retry, persisted cancelled/completed and unavailable-data states.
- Cash Van, HORECA, wholesale and modern trade share this inert draft boundary
  only. Warehouse/custody hints do not select a delivery source or imply cash,
  credit, delivery or collection completion; channel workflows remain deferred.

## Transactions, replay and visit completion

Every write rechecks database mode/active actor, locks the **same visit row** used
by Foundation 001 finish, checks a durable company/rep/command identity and payload
digest, and then checks OPEN visit, DRAFT state and expected draft version. The
draft, bounded lines, command result and durable audit share one PostgreSQL
transaction. Product/access locks preserve verified conversion/resource scope.

Same-key retries return their original recorded result; changed payload conflicts.
A different create key resumes the current active draft. Old keys remain tied to
their original document after cancellation. New edits with stale versions conflict.
Audit failure rolls back every write. No external service is called while holding
the write transaction. Current RIE customer authorization happens before it and
fails closed when unavailable.

Finish and save serialize: a save either commits while OPEN or conflicts after
finish. Completed visits retain readable drafts; all new create/save/cancel commands
are rejected. Replaying an already committed command performs no mutation. The UI
refreshes current detail after success and disables editing using the visit state.
Later completion is an independent future workflow/permission, not provided here.

SQL constraints/triggers protect identity, terminal cancellation, line bounds,
product/unit snapshots and immutable command history. There is no posting state,
official invoice number, stock command, reservation, custody deduction, GL/AR
mutation, collection, ZATCA request or canonical/Excel write in the module.

## Query contract

| Read | Bound and owner |
| --- | --- |
| Authorize customer | Existing RIE current-company/hierarchy/customer, one projected CustomerCode |
| List drafts | company/rep/visit index, 20 + 1 lookahead |
| Read draft | company/rep/visit/id, header + at most 20 lines in one SQL snapshot |
| Warehouse/product picker | company/access/search, 20 + 1; explicit search/paging, no page accumulation |
| Quantity check | saved draft's at most 20 products, selected company/warehouse/rep, SQL aggregates only |

Quantity checks use one repeatable-read transaction so concurrent draft edits do
not mix a warehouse from one revision with lines from another. They never lock
or change stock. The authoritative stock/GL models remain the existing models.
No polling, new cache, dependency or infrastructure was added. Saving never
invalidates the analytical Copilot context; the actual browser retained one
context request across three saves. See the separate
[Scalability Gate](SALES_DRAFTS_SCALABILITY_GATE_002A.md) for measured p95,
SQL counts, native plans, the corrected repeated-scan defect and the staged
25/50/100/150-user load plan, which has **not** been executed.

Native tiny-fixture list plan used `sales_drafts_visit`, returned two rows, and
executed in approximately 0.087 ms. This is scoped-query evidence only, **not**
a representative capacity, p95, RAM or production load claim.

## Isolated evidence

New synthetic native database:
`sales_drafts_verify_267eb566725842b4a6be59f7dfd6d06f`, PostgreSQL 18.6 on loopback
port 55561. The script verifies `SHOW data_directory` equals
`D:/Field Sales OS/.quality/wms/pgdata` before creation. The normal port 5432 and
`field_sales_os` are not used. The original migration chain runs on the new empty
database; the new additive migration runs separately in one transaction after
a verified custom-format backup. Archive listing/checksum evidence is retained;
this is not a restore drill or release approval.

- SQL service/constraint tests: CRUD/reopen/cancel, same/re-key retries, stale
  versions, strict identity, SFA/FULL_ERP/Analysis Only, company/rep/route/warehouse
  isolation, inactive/foreign products, unsupported UOM, fractional pieces, exact
  weight, missing balance ambiguity, audit rollback and completed visits.
- Native independent connections: duplicate and re-key create, conflicting edits,
  identical save, duplicate cancel, finish/save race and audit failure rollback.
- Actual Nest/Prisma/RIE HTTP: 13 grouped checks, including real authentication,
  assignment transfer, permission revocation, tenant/rep denial, unavailable finance,
  real quantity results and DB-triggered audit failure. Native test RIE doubles
  are not used for these HTTP scope checks.
- Browser: actual login/guards and business requests; create/resume, select WMS
  product/carton, save/reload, real concurrent API edit + UI conflict/reload,
  nonbinding check, cancel/new draft and Foundation 001 finish/read-only behavior.
  Arabic/English × light/dark × 1440/767/480/430/390; no horizontal page overflow.
  Separate transport-failure checks cover rendered loading/error/retry and
  unavailable quantity checks without replacing successful business responses.
- Reconnect regression: the original automatic detail refetch overwrote an
  unsaved local quantity 7 with another session's saved 2 after cache staleness.
  Detail reconnect-refetch is disabled; a real 31-second offline browser check
  now retains 7, shows the expected version conflict without erasing it, and
  restores saved 2 only through explicit reload. Finish still makes it read-only.
- Exact before/after table digests include nonzero WMS stock/custody and a real
  synthetic customer opening/GL balance, plus immutable reference facts/versions.
  Native, HTTP and post-browser verification prove no protected-table changes.
- Prisma schema/client generation succeeds to an isolated output directory;
  the existing preview's loaded Windows DLL is not replaced. No package installed.

Commands: `pnpm quality --base f482d9bde14b94e3619e221d61a416b145874ca6`,
`pnpm quality:postgres`, `node tools/quality/sales-drafts-native.cjs`,
`node tools/quality/sales-drafts-http.cjs`. The two latter scripts are explicit
synthetic-local verification, not automatically run against an application DB.

Final changed gate: **613 passing checks / 140 suites**, zero failures/skips/TODOs/
cancellations, all four API/database/schemas/web typechecks pass. Standalone SQL
gate: **161 passing checks / 28 suites**, zero failures/skips/TODOs/cancellations;
evidence is `.quality/postgres.json`. The final changed gate includes
the missing-balance/weight case and the grouped WMS eligibility parity regression.
Local execution used the existing Node 24.18 runtime; Node 22 release parity is
not claimed. Generation used installed Prisma 6.19.3, not a new dependency.

Evidence: `.quality/sales-drafts/{native.json,http.json,browser.json,ui-states.json,
final-verification.json,performance.json,copilot-refetch.json,reconnect.json,screenshots/}`, `.quality/changed.json`,
`.quality/postgres.json`. Local runtime secrets stay in ignored `runtime-private.json`.
The retained browser visit may be completed by acceptance; use the authorized
Foundation 001 start path for another synthetic visit. No normal database
migration or permission grant is implied by this preview.

## Source files for this slice

- New API: `apps/api/src/modules/sales-drafts/sales-drafts.{service,controller,module}.ts`,
  `sales-drafts.postgres.spec.ts`, `sales-drafts.controller.spec.ts`,
  `sales-drafts-test-fixture.ts`.
- Existing Foundation 001 module: one additive SalesDraftsModule import in
  `apps/api/src/modules/visit-execution/visit-execution.module.ts`.
- DB: additive models/relations in `packages/database/prisma/schema.prisma` and
  `packages/database/prisma/migrations/20261022140000_sales_drafts/migration.sql`.
- Shared contract: `packages/schemas/src/sales-draft.schemas.ts`, additive export
  in `packages/schemas/src/index.ts`.
- UI: `apps/web/src/components/visit-execution/sales-drafts-panel.tsx`,
  `sales-drafts.spec.ts`, one panel import/render in `visit-execution-screen.tsx`.
- API/i18n: `apps/web/src/lib/api/sales-drafts.ts`,
  `apps/web/src/lib/i18n/sales-draft-messages.ts`, additive dictionary registration
  in `apps/web/src/lib/i18n/dictionaries.ts`.
- Explicit verification: `tools/quality/sales-drafts-native.cjs`,
  `tools/quality/sales-drafts-http.cjs`, `tools/quality/sales-drafts-performance.cjs`.
- Documentation: this file, `SALES_DRAFTS_SCALABILITY_GATE_002A.md` and additive evidence/memory entries in
  `docs/engineering/{ENGINEERING_RELIABILITY,RESOLVED_ISSUES}.md`.

Other files shown by the existing dirty working tree belong to prior work and
were not reset, reformatted or incorporated into this slice.

## Deferred / gate

**System Design Gate: WARN.** Local functional/transaction/security gates pass;
**Scalability Gate: WARN** because representative mixed concurrent load remains
unmeasured. The corrected serial quantity-query defect is verified, but the
prior 150-user contention issue is not certified resolved. Consistency
trade-off: short per-visit serialized draft writes and fresh scope checks instead
of offline writes or cached operational balances. RIE/DB authorization availability
remains necessary. No release readiness, Node 22/Linux packaging, representative
capacity or external deployment protection is certified here.

Still deferred: invoice approval/posting and fiscal numbering, operational price/
tax/discount/credit policy, sale-source custody consumption, delivery workflows,
valuation/COGS, invoice-source GL support, trade collections/allocation, customer
returns/credit notes and ZATCA compliance/integration. Nothing in this slice
authorizes implementation of those paths.
