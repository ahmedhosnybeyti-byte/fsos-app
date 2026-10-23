# WMS Phase 01 — local implementation contract

Review base: `37931df` (`codex/erp-foundation`). Existing untracked release and
recovery work is excluded. No production access, activation, migration, push or
deployment is authorized. The innovation bank was read through Drive on
2026-10-20; WMS-004/005/016 and USR-006/008/010/012 define this phase.

## Ownership, access and transaction contract

Reuse `warehouses`, current authentication/subscription, company screen and SFA
guards. New `warehouse-core` screen defaults HIDDEN. Every action requires
persisted SFA mode, `sfa.access`, `wms.read`, and its specific permission.
COMPANY_ADMIN sees its company warehouses; other tenant roles require explicit
warehouse assignment. No platform bypass and no automatic role grants.
Assignments are managed by a company administrator with `wms.access.manage`.
Products and lot identity/date metadata are company master data; stock quantities
and movements are restricted to the authorized warehouse. A selected product can
list company lot identities with zero stock at the selected warehouse, allowing
reuse of the same lot without exposing another warehouse balance. Master editing
requires `wms.products.manage` and an authorized warehouse context. Openings/reversals require `wms.opening.post`.

Typed PostgreSQL tables own products, lots, positions, immutable movements and
warehouse assignments. Composite foreign keys enforce tenant boundaries.
Quantities are NUMERIC(24,6), sent as decimal strings; piece/carton conversion is
performed in PostgreSQL. Packaging/tracking cannot change after first movement.
Expiry requires lot tracking; expiry date is exclusive (expires today = blocked).
Unknown production dates stay unknown; consumed life is null, never estimated.

Opening is a positive, documented command, not a stock adjustment. Each position
can have only one unreversed opening. A changed command needs an explicit reversal
and a new reference. Reversals are immutable, once-only, atomic, and fail if stock
has been consumed/reserved. An opening can record expired/quarantined physical
stock, but it never becomes available. No issue/reserve/dispatch route is exposed
in this phase. Future issue paths must use the database eligibility check and
atomic stock constraints; hiding an expired row is insufficient authorization.

Posting locks idempotency key, product and position; retry with the same key and
payload returns the original effect, changed payload conflicts. Product edits
take the same row lock. The movement, position and existing audit record commit
together through Prisma transaction; audit failure rolls everything back.
Prefer consistency and traceable reversal over silent correction or throughput.

## Read/query contract (before UI)

Operational reads use scoped PostgreSQL, separate from analytical RIE/canonical
Excel sources. No RIE, Smart Loading or Visit Copilot changes. Tenant/warehouse
scope precedes joins. Master/lot/ledger pages return at most 20 + one lookahead;
search is submitted, page <= 1000. Warehouse picker is paged. Summary scans the
selected warehouse positions once and returns unit-grouped balances and counts;
never sum unlike base units. Available excludes reserved/quarantined/expired and
inactive-product stock. Expiry alerts use real positive lot balances and a
user-selected 1–365 day horizon. No AI scores, fabricated KPIs or polling.

## Delivered behavior and files

- Product create/edit: tenant-unique uppercase code, optional tenant-unique
  barcode, PIECE/KG/LITRE base unit, exact carton conversion for pieces, lot/expiry
  flags, sensitive-handling flag/notes and optimistic edit version. Packaging and
  tracking lock after the first lot; posted lot metadata and movements are immutable.
- Lot foundation: production/expiry dates, warehouse quantities, remaining UTC
  calendar days and bounded consumed-life percentage. Missing dates stay explicit.
- Documented opening and full reversal, exact decimal strings, immutable ledger,
  once-only business references, idempotent retries, zero/negative safeguards,
  same-transaction audit and permission/warehouse scope.
- `/sfa/warehouse`: real warehouse picker, unit-grouped stock, products, lots,
  near-expiry filter, ledger, product/lot/opening/reversal dialogs and paged access
  assignment. Actions follow capabilities; no unavailable executable controls.
- Existing setup checklist now probes operational products and unreversed openings;
  customers/prices remain NOT_AVAILABLE. The existing registry is reused.

New implementation groups:

- `packages/database/prisma/migrations/20261020100000_wms_phase01/migration.sql`:
  five tables, composite tenant constraints/indexes, immutable/protection triggers,
  stock-state view, posting/reversal/eligibility functions and four ungranted
  permission catalogue entries. No operational records or mode backfill.
- `packages/database/prisma/schema.prisma`: matching operational models/relations.
- `packages/schemas/src/wms.schemas.ts` and `.spec.ts`: shared strict contracts.
- `apps/api/src/modules/wms/`: controller, service, module and isolated tests.
- `apps/web/src/components/wms/`, `apps/web/src/lib/api/wms.ts`, and
  `apps/web/src/app/(dashboard)/sfa/warehouse/page.tsx`: actual screen and actions.
- Shared screen registry/navigation/dictionaries, AppModule and setup checklist
  integration. `tools/quality/wms-native.cjs` records independent-connection evidence.

## Acceptance evidence — 2026-10-20 (local)

- `System Design Gate: PASS` for this local phase. Scope precedes operational
  joins, exact PostgreSQL posting and auditable reversal favor consistency. No
  analytical RIE/canonical paths or external dependencies changed.
- `Design System Gate: PASS` for implementation verification. Reused AppShell,
  Cairo, shared primitives, one glass hero and existing semantic tokens. Eight
  actual browser captures cover Arabic RTL/English LTR × Light/Dark × 1440/390px.
  Additional 430/480/767px checks found no horizontal page overflow. Owner visual
  acceptance is the next review, not inferred from automated checks.
- `pnpm quality --base 37931df`: **497 passed**, zero failed/skipped/TODO/cancelled;
  API, database, schemas and web typechecks passed. Evidence `.quality/changed.json`.
- `pnpm quality:postgres`: **83 passed**, zero failed/skipped/TODO/cancelled across
  15 isolated suites. Evidence `.quality/postgres.json`.
- Native PostgreSQL **18.6**, a fresh database under `.quality/wms/pgdata`, all
  **45 migrations** applied. Two independent Prisma connections proved duplicate
  retry = one movement/one audit; concurrent identical reversal = one reversal;
  different concurrent opening keys = one accepted effect; audit failure rolls
  back untracked lot, position and movement. Evidence `.quality/wms/native.json`.
- Real HTTP guard chain: **22 passed**, covering anonymous/default mode/screen,
  missing operation permissions, forged tenant, other-company/unassigned warehouse,
  invalid input, and actual setup-checklist integration. These state changes were
  confined to the explicitly synthetic fixture company and restored afterwards.
- Browser actions passed: mobile product create/edit, expiry lot creation,
  `2 cartons × 12 = 24 pieces`, duplicate rejection, documented reversal to zero,
  empty warehouse, clerk/read-only behavior and a simulated read outage/retry.
  **Zero page exceptions**. Skeleton loading, keyboard focus/Tab, Escape, selected
  and hover states also passed. Evidence `.quality/wms/browser.json` and screenshots.
- Native scoped query evidence: 2,001 positions in selected warehouse plus 2,000
  other-tenant positions. Summary uses two SQL calls including scope and returns
  **249 bytes**; 20 local samples p50 **20.52ms**, p95 **138.13ms**. Captured EXPLAIN
  execution: summary **21.50ms**, product page **1.58ms**, lot page **1.45ms**, ledger
  **0.24ms**. Product/lot/ledger output <= 21 rows before UI lookahead removal;
  lot/ledger master joins occur after bounded pages. Summary aggregates selected
  warehouse positions once. Process RSS snapshot **137.0 MiB**, not peak RAM.
  Small fixture dimension tables may use planner-chosen sequential scans; facts
  remain warehouse/tenant scoped and no raw fact arrays reach Node.

Initial failed attempts were repaired and superseded: a decimal-zero formatting
assertion, strict TypeScript undefined return inference, and a missing module in
the ignored local session helper. No gate budget was raised and no test removed.
Local Node is 24.18.0; native PG and browser evidence is Windows-local. Linux/Node22
packaging, mixed-load capacity and recovery custody remain separate release gates.
`quality:release`/Docker builds were not run for this non-release local phase.

Prisma's existing Windows DLL was held by another local process. Schema/client
validation succeeded into a separate `.quality/wms/generated` output, with the
already installed engines, without stopping that process or adding dependencies.
The default generated types and all four typechecks also passed. A clean release
must perform its normal client generation; never package the test output.

## Local review

The ignored preview processes bind loopback only, strip inherited credentials,
block external integrations and use only the fresh synthetic database. The preview
copy adds a visible test-data banner around the actual screen. The session helper
exists only in `.quality/wms/preview-api.cjs`/`preview-web.cjs`, never app source.

- Admin: <http://localhost:4358/local-login/admin>
- Warehouse clerk: <http://localhost:4358/local-login/clerk>
- Read-only manager: <http://localhost:4358/local-login/reader>
- Actual route after local session: <http://localhost:4358/sfa/warehouse>

These links remain valid while the local preview processes run. No password or
real-company activation is required. Local artifacts are excluded from Git/Docker.
No commit, push, deployment, Production migration or real-company activation was
performed. Pre-existing untracked release/recovery/temp work remains untouched.

## Phase 02 boundary

Propose receiving and approved stock correction/reversal workflows, stock
reservation and FEFO eligibility, pick/dispatch documents and phased Smart Loading
integration, followed by explicit custody receipt. Quarantine release/write-off,
advanced procurement, shortage allocation, vehicle reconciliation, accounting and
predictive analytics remain unimplemented. No second-phase action is authorized
by this local handoff. Review phase 01 first.
