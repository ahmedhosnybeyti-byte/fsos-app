# WMS Phase 02 — local implementation and review

Phase 01 baseline: `6b6f21a`. WMS-only review base: `624321d` (company modes,
committed by the concurrent company task). Preserve unrelated release/recovery work.
No push, deployment, Production migration or real-company activation. No new Demo
company: use the existing isolated Phase 01 preview company; the separate full ERP
Demo will attach to the same tenant-neutral contracts after explicit activation.

## System design contract (before implementation)

Reuse operational products/lots/positions, immutable ledger, warehouse assignments,
SFA/current screen/subscription guards, exact NUMERIC quantities and transaction
audit. No RIE formulas, canonical Excel data or analytics ownership changes.
The concurrent company-mode task committed `supportsSfaOperations`: persisted
`SFA` or `FULL_ERP` + `sfa.access`, screen, subscription and operation capabilities.
WMS reuses that shared gate; ANALYSIS_ONLY remains the default. This phase changes
only the warehouse module description to match implemented functions.

Receiving: immutable snapshots of at most 20 lines per document. Expected quantity
and accepted/quarantined/rejected delivered quantities use the selected unit and
captured conversion factor. Partial means delivered < expected; undelivered stock
is never posted. Further supplier deliveries use independent references (the same
supplier reference may recur), without inventing purchase orders. DRAFT can be
revised, then SUBMITTED → REVIEWED → POSTED. Review can return it to DRAFT with a
reason. Posted correction is an explicit full reversal, allowed only when the
accepted stock is free and quarantine quantities are still present.

Loading: REQUESTED → RESERVED → PICKED → REVIEWED → APPROVED → IN_TRANSIT →
ACCEPTED. Cancellation before dispatch releases all remaining reservations.
Picking explicitly confirms every reserved allocation; under-picking requires a
reason and releases the difference. Never pick more than reserved or substitute
an unreserved batch. Replan through cancellation/new request. Recipient rejection
leaves RETURN_REQUESTED transit until the warehouse confirms physical return;
returned goods enter quarantine. Only the named current recipient can accept.
Acceptance creates a minimal operational custody balance, separate from analytical
Van Inventory and a future full vehicle-custody module.

FEFO is PostgreSQL-owned: company/warehouse/product scope, active product, positive
free stock, no lot quarantine, expiry strictly after max(UTC today,target date),
and persisted customer minimum shelf-life (unknown expiry cannot satisfy a positive
minimum). Expiry ascending, null expiry last, stable batch ID tie-break. Show the
reason/cutoff. Preview never reserves. Re-evaluate eligibility on reserve, pick,
review, approval, dispatch and acceptance; a policy change cannot be bypassed by
an old reservation. Policy edits require their own explicit capability.

One idempotent command gateway owns immutable workflow events and stock movements.
Lock command key, document, products in stable ID order, then positions. Product
locks retain Phase 01 packaging consistency and favor correctness over throughput.
Every state change, stock effect, command receipt and audit commits together.
Bound commands to 20 lines and 100 allocations; return a clear limit error rather
than paginating facts into Node. PostgreSQL performs FEFO windows and aggregates.
List pages return 20 + lookahead; detail is bounded by the document limits and 20
recent events. No polling. On Hand excludes dispatched stock; Reserved is a subset
of On Hand; Available excludes reservation/quarantine/expiry; In Transit is outside
the warehouse awaiting acceptance or physical return.

Smart Loading remains a proposal. The existing actual suggestion rows can create
a WMS request through an explicit warehouse/recipient confirmation. Only positive
quantities with an existing company operational product-code mapping are accepted;
zero/negative/unmapped inputs create no reservation or dispatch. Reservation and
all subsequent actions require their own WMS capabilities and current stock checks.

## Verification and handoff

Implemented service/API contracts and actual browser journey cover receipt drafts,
partial/UOM receipt review and posting, quarantine/rejection, explicit reversals,
FEFO preview/atomic reservation, actual picking with shortage reason/release,
review/dispatch approval, physical dispatch, named recipient acceptance, cancellation
and rejected delivery physical return into quarantine. Every operation has a fixed
capability and immutable event; stock effects additionally enter the movement ledger.

System Design Gate: PASS for local phase acceptance. Bound SQL work and exact
transactional stock changes replace full reads; stable product locks deliberately
serialize writes to the same product across warehouses. No capacity or release claim.
Design System Gate: PASS. Existing Cairo/Lucide, shared primitives, glass surfaces
and one warehouse hero; eight real theme/locale/viewport combinations, 1440px/390px,
with no horizontal overflow or browser exceptions. Read-only hides write actions.
Mobile loading skeleton, outage/retry recovery, dialog keyboard focus/Escape and
embedded product search without accidental form submission also passed.

Verification (2026-10-20):

- Initial quality gate against Phase 01: 516 passed, zero failures/skips/TODOs,
  API/database/schemas/web typechecks passed. Final WMS-only gate against `624321d`: **517 passed**, zero failures/skips/TODOs,
  four passing API/database/schemas/web typechecks.
- `pnpm quality:postgres`: 93 passed, zero failures/skips/TODOs. Includes all
  fresh migrations, no tenant creation/activation/role grants, receiving audit
  rollback, precision/expiry/policy failures, tenant/RBAC, bounded allocations and
  atomic multi-line shortages. No network or Production data.
- Native PostgreSQL 18.6, independent connections: duplicate receiving approval
  creates one movement/audit; competing reservations cannot over-reserve; picking
  shortage releases stock; dispatch and recipient acceptance retry once; a failure
  after posting rolls back all effects; competing cancellation keys release once.
  An additive upgrade also preserved existing Phase 01 positions and role grants.
- 43 actual local HTTP checks: every operation capability, anonymous/foreign
  tenant/unassigned warehouse denial, ANALYSIS_ONLY denial, explicit FULL_ERP
  compatibility, hidden screen denial, invalid/zero/negative proposals.
- Actual mobile browser performed receipt → review/post → FEFO → reserve → short
  pick → review/approve → dispatch → recipient acceptance. No accepted custody
  existed at dispatch. Administrator could not accept for the named recipient.
- Scoped query samples on existing synthetic fixtures with >2,000 positions per
  tenant: summary returned one 274-byte result; product/lot SQL pages at most 21
  rows (7.6KB before lookahead removal), FEFO one 382-byte result. Sample SQL
  execution: summary 25.845ms, product 1.883ms, lots 1.698ms, ledger 0.406ms,
  request list 0.176ms, FEFO 1.638ms. These are local samples, not load benchmarks.
- Prisma generation succeeded into an isolated output; no locked runtime used by
  another task was replaced. No dependency/infrastructure was introduced.

Excluded reproducible evidence: `.quality/wms-phase02/{native-results,query-evidence,
http-results,browser-results,quality-first}.json`, `.quality/{changed,postgres}.json`,
and screenshots. Native test runner is tracked at
`tools/quality/wms-phase02-native.cjs` with explicit test-database/cluster guards.
Local commit: the independent WMS Phase 02 commit containing this document.

## Local preview

The existing Phase 01 synthetic company/database is reused; no second Demo company
was created. API port 4399, web port 4398, loopback only, external sockets blocked.
Preview session bootstraps exist only in excluded test helpers, never application code.

- Administrator: http://localhost:4398/local-login/admin
- Warehouse clerk / named recipient: http://localhost:4398/local-login/clerk
- Read-only: http://localhost:4398/local-login/reader

Select the Riyadh warehouse. The receiving/loading tabs contain recorded documents
from the real UI journey (reference `WMS2-UI-1792522613208`). Start a new receipt
to review the draft → review → posting workflow. Select a loading request to inspect
allocations, picked/dispatch quantities and immutable history. Local helpers must be
running; a normal Production login is never used by these links.

## Changed files and migration

- New additive migration: `20261020150000_wms_phase02/migration.sql`: nine typed
  document/policy/allocation/custody/event/command tables, transit and ledger deltas,
  composite tenant FKs/indexes, immutable history and exact SQL command functions.
- `packages/database/prisma/schema.prisma`: corresponding models/relations only.
- `packages/schemas/src/wms-operations.schemas{,.spec}.ts`, WMS DTOs, export and
  warehouse module description.
- `apps/api/src/modules/wms/wms-operations.{controller,service,postgres.spec}.ts`,
  module registration, core authorization/stock read projections, SQL test fixture
  and guard regressions.
- `apps/web/src/components/wms/{operations-panel,operation-editors,operation-labels,
  smart-loading-bridge}.tsx` (labels is .ts), existing warehouse screen/shared
  controls, typed WMS operations API and one Smart Loading UI bridge insertion.
- Fresh migration acceptance and the native runner; this handoff, reliability
  evidence and resolved-issue rule.

## Full ERP Demo integration plan

Use the one existing/full ERP Demo company from the separate task, with an
explicit authorized activation. Apply approved additive migrations there, then:

1. Retain its company identity, plan/subscription and chosen SFA/FULL_ERP mode.
   Explicitly enable warehouse-core and grant the required capabilities by role;
   catalogue permissions/mode eligibility never grant a role or warehouse access.
2. Reuse its operational product/lot masters and opening balances. Do not seed or
   repost openings. Resolve Smart Loading analytical codes to existing active
   operational product codes; confirm unit interpretation before requesting.
3. Assign the existing warehouse to clerk/reader/receiving representative; grant
   the representative explicit custody acceptance access. Select active recipients
   from that company. No application code assumes a company name or ID.
4. Record synthetic receiving documents and loading requests through these same
   commands. Review/post, reserve/pick, approve/dispatch and let the named recipient
   accept. Use policy/cancellation/rejection scenarios without bypassing quality.

This task did not activate a real company or modify the separate Demo seeder.

## Remaining scope

Future phases: PO-driven supplier balances and advanced purchasing, approved partial
returns/corrections/replanning/substitution, quarantine release/disposal, full vehicle
custody and analytical van-stock reconciliation, accounting/invoicing, shortage
crisis management and predictive analytics. Supplier is recorded as a receiving
party/reference; no unfinished purchasing master is implied. Customer shelf-life
policies use operational customer codes, with no write to analytical customer data.
No notifications, Redis, paid AI, deployment or Production migration were added.
Linux packaging/recovery/capacity release evidence remains a separately authorized
release task. Stop here for review before the next WMS phase.
