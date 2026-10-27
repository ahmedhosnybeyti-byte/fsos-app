# Vehicle stock unification — stopped before opening-balance cutover

2026-10-25. Local source review and isolated synthetic PostgreSQL tests only.
Review base: `f482d9bde14b94e3619e221d61a416b145874ca6`; existing unrelated WIP
is preserved. No Production connection, migration, deployment or operating-data
change. This is a blocked implementation handoff, not a completed unification.

## Proven current paths

- The existing authoritative WMS position is `wms_custody_positions`, keyed by
  company / recipient user / warehouse / batch, in exact base quantities. Reuse
  it; do not introduce another mutable inventory balance or copy it into imported
  canonical rows.
- `wms_loading_command` in `20261020150000_wms_phase02` increases that position
  on `load.accept`. The already implemented FULL_ERP recipient handover runs
  dispatch and acceptance atomically after persisted consent. Existing command
  replay prevents a second stock effect.
- `20261021100000_wms_core_closure` decreases the same position only when a
  reviewed rep-to-warehouse return is posted. It requires an accepted source,
  enforces remaining source quantity and custody, and separates warehouse
  quarantine from available stock.
- `RieScalableQueryService.activeEntityRowsCte` still reads canonical
  `Van Inventory` snapshots for stock. The generic query and management stock,
  loading, staleness and vehicle-product queries share this source. Assistant
  dataset reads and `ExcelDatasetEntityProvider` have additional direct reads;
  the latter also checks file/version availability. Changing Smart Loading alone
  would leave inconsistent stock sources. No reader was switched in this task.
- The sales API currently exposes create/save/cancel/check for `sales_drafts`.
  Its SQL status constraint permits only DRAFT/CANCELLED. `check()` returns
  `nonbinding: true, approvalAllowed: false` and runs read-only. Imported invoice
  status or draft save is not evidence of an operational posted sale.
- Existing WMS return documents support SUPPLIER and REP. There is no approved
  customer-to-vehicle return document/posting path to attach a credit to. A GOOD
  rep-to-warehouse return is not a customer return.

## Safety stop requested by the owner

The two stock sources have different identities and units:

- Canonical snapshot: ReportDate / RouteID / ProductCode / Unit (optional batch
  and expiry fields).
- Operational custody: authenticated recipient / warehouse / physical batch /
  exact base quantity.

There is no established opening reconciliation checkpoint connecting these
sources: no verified cutoff that says which accepted shipments, sales and returns
are already included in the snapshot. Route access assignments alone do not
establish custody ownership/history or a unit/batch conversion.

For example, a snapshot of ten cartons and custody of seven cartons may mean
either ten total (shipment already included) or seventeen total (shipment later).
Choosing seven loses the old opening; adding them may double count. No query can
recover the missing business evidence from these quantities alone.

Consequently no opening balances were migrated, summed, overwritten or marked
reconciled. There is no automatic FULL_ERP source switch or silent fallback added.
ANALYSIS_ONLY and SFA runtime behavior remain unchanged.

## Required before proceeding with the cutover

1. Obtain an approved opening inventory or physical count at an explicit cutoff,
   per company / vehicle-recipient / actual route identity / product / unit /
   batch and condition. Establish which existing WMS movements it already
   includes. Missing quantities must remain unknown rather than manufactured zero.
2. Reconcile that opening once against existing custody in a reversible,
   auditable, idempotent plan. Preview discrepancies without posting them. This
   task explicitly stopped before that migration because the evidence is missing.
3. Introduce a single scoped RIE stock-source contract after reconciliation,
   covering generic/specialized reads, availability metadata and the entity
   provider. Preserve hierarchy scope and exact base/carton conversion. Current
   positions cannot answer historical as-of balances without movement history.
4. Connect real approved sales and customer-return documents when their posting
   contracts exist. Do not add a generic quantity-adjustment endpoint or pretend
   an imported invoice/draft is approved. Customer returns require source-sale
   remaining-quantity checks and condition-based sellable versus held stock.

## Focused verification actually executed

Using installed test-only PGlite 0.5.8 with the existing offline test hook (real
network/database connections disabled), against synthetic companies only:

- `wms-recipient-handover.postgres.spec.ts`: five passed, zero skipped. Consent,
  shortage, company/recipient/role/version boundaries, exactly-once handover and
  atomic audit-failure rollback.
- `wms-core.postgres.spec.ts`: six passed, zero skipped. Posted rep returns,
  custody/source limits, replay, quality and isolation. These core tests use the
  existing SFA fixture; the handover suite exercises FULL_ERP separately.
- `sales-drafts.postgres.spec.ts`: twelve passed, zero skipped after correcting
  its fixture to update the operating-mode rows already created by `wmsFixture`
  instead of recreating the table. Actual create/save/cancel/check paths preserve
  stock/custody/GL/AR/reference fingerprints; own eligible custody excludes other
  recipients and expired lots. No business assertions were removed or weakened.
- Shared schema TypeScript compilation passed.

The initial combined run had eleven passes and two draft setup failures
(`company_operating_settings already exists`). The focused draft rerun passed
all twelve cases after the fixture correction. No broad audit, release suite,
load test or Production operation was performed. No new runtime path is claimed
tested. There was no stock-unification runtime implementation to typecheck.

System Design Gate: BLOCK for the requested complete cutover — unreconciled
openings and absent approved sales/customer-return posting sources. The only
code change is isolated test-fixture compatibility.

Scalability Gate: N/A for changes made — no runtime/data-access change. Synthetic
functional fixtures used two companies at serial concurrency one; SQL count,
HTTP p95, lock/pool waits and capacity were not measured. No new operational or
150-user capacity claim.
