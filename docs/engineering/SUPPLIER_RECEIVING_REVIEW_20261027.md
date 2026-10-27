# Supplier receiving integration review — 2026-10-27

Scope: operational supplier identities, invoice-like receiving and source-linked
supplier returns. Existing WMS posting, quantity rules, role duties and Smart
Loading remain authoritative. Synthetic fixtures only; no Production actions.

## Contract review

- Supplier listing/creation uses warehouse-authorized, company-scoped access.
  Creation requires existing `wms.receiving.create`; a warehouse manager is not
  granted keeper creation duties. Existing accounting suppliers require financial
  setup, so this implementation uses a minimal operational master.
- Receipts retain the existing WMS command contract. Optional supplier identity
  and document date persist in company/receipt metadata alongside the transaction.
  Foreign supplier IDs and mismatched supplier names must fail. A replay of an
  earlier create/edit must never overwrite metadata from a later edit.
- Receipt lines use exact BASE quantities for pieces. Each product's own
  `piecesPerCarton` determines conversion: 2 cartons + 5 pieces means 29 for
  factor 12 and 17 for factor 6. Weight/volume preserve decimal base quantities.
- Draft/save/submit/review do not post stock. Existing manager approval posts
  accepted plus quarantined quantities, while rejected quantities stay outside
  stock. Source-linked supplier returns keep their existing review/post path.
- Product alias search stays inside the bounded company-scoped PostgreSQL query.
  Literal `%` and `_` must not become wildcard characters. No catalogue fetch or
  client-side aggregation is introduced for search.

## Focused verification

`supplier-receiving-quantities.spec.ts`: **5 passed**, zero failures/skips/TODOs.
Executed against Agent 2's actual helper source. Covers factor 12 versus 6, exact
fractional carton rehydration, fractional-piece rejection, invalid factors,
12-digit backend limits, exact decimal sums, partial deliveries, excess totals,
required hold/rejection reason, and non-piece decimals.

`supplier-receiving.postgres.spec.ts`: **3 passed** on the combined source:

1. Create water supplier → receipt draft → edit/replay → submit → manager review
   and approval → source-linked return. Assert stock before/after each stage,
   keeper escalation denial, current metadata after old replays, and once-only
   return movement.
2. Foreign supplier/name rejection and audit-failure atomic rollback of receipt,
   supplier metadata and stock.
3. Registered Arabic/English aliases and literal special-character search,
   with foreign-company alias isolation.

The main agent ran the combined integration and mandatory quality gate against
`cc620884581ad1164959f7566a871ac3b585964a`: **781 passed**, zero failures/skips,
and four successful typechecks. `pnpm quality:postgres` separately passes all
**239** cases without failures/skips. The original 32 failures were reproduced or
diagnosed as stale baseline fixtures; 34 affected fixture cases pass after
test-only corrections. Separate PostgreSQL and final release limits are recorded
in `SUPPLIER_RECEIVING_DELIVERY_20261027.md`.

## Readiness limits

- System Design Gate: **WARN; local functional PASS, capacity unverified**. Identified
  replay-metadata clobbering risk was reported before implementation acceptance
  and is covered by the new integration assertions.
- Scalability Gate: **WARN / UNVERIFIED**. Scenario: isolated synthetic two-water-
  product receipt and return, three company/warehouse fixtures, serial client
  (actual concurrency 1). HTTP p95, actual SQL count, native lock/pool waits,
  comparable baseline and measured bottleneck are not available. Functional
  tests do not establish commercial capacity or 150-user readiness.
- Browser visual/keyboard/scanner acceptance is owned by the integrated UI
  review; this agent has not claimed a rendered or real barcode-device pass.
- No deployment or migration of an operating database was performed.
