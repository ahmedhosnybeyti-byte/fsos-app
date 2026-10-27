# Supplier Management & Receiving — local delivery, 2026-10-27

The previous frontend deployment was confirmed successful before this work.
This task is local only: no push, deployment, operating database migration,
Production fixture, new backup, dependency or infrastructure was introduced.

## Ownership and commits

All commands ran from the official `D:\Field Sales OS` workspace. Three
independent Git worktrees were created beneath its ignored `.quality/worktrees/`
directory. Their baseline captures existing maintained working files, without
changing the user's checkout, branch or staging index:
`cc620884581ad1164959f7566a871ac3b585964a`.

| Agent | Worktree / branch | Delivered work | Commits |
| --- | --- | --- | --- |
| Supplier Master | `supplier-master` / `codex/supplier-master` | Company-scoped operational supplier directory, bounded search, inline creation/selection, existing receiving permission, isolated water supplier fixture, additive supplier/receipt metadata migration | `940883da7d58f776f25178259e1d07ecd6746f57`, `94f3b812f1ba875a28a0edaf2e81317a1befdb58` |
| Supplier UI | `supplier-invoice-ui` / `codex/supplier-invoice-ui` | Inline invoice-style receipt/return editors, vertical disclosure sections, separate results and selected lines, Enter barcode input, exact product-specific carton/piece conversion, optional inspection fields, unit-separated summaries and safe document printing | `2d97cb0`, `15d56758a72990696a371d63547b4079a03d95ff` |
| Supplier Quality | `supplier-quality` / `codex/supplier-quality` | Five exact quantity regressions, three isolated end-to-end SQL journeys, replay/atomicity/tenant review; correction of stale test setup after pre-existing warehouse role separation | `3d5df00`, `055d466`, `0431c2fcf9d7823ba362e742f44edcfd14f62e4a` |
| Coordinator | Existing official checkout; candidate branch `codex/supplier-receiving-integrated` | Shared API schemas/module registration, receipt metadata transaction/replay integration, bounded alias lookup, Arabic/English messages, dedicated workspace integration/navigation, shared migration/demo regression expectations and acceptance evidence | Merge `630d9e8c14e4f8f0a972bbc65741474092927593`; final code `aa6d5bed6dc38e63abadd2d830ffe5f011477f5c` |

The integration uses the three agent tips as merge parents. Existing unrelated
working changes remain in place. The original checkout remains on
`codex/procurement-phase01`; local candidate refs do not alter it.

## Result and contracts

- Existing accounting suppliers require GL setup. A minimal `wms_suppliers`
  master avoids creating purchasing/accounting setup or financial balances.
- Reads return at most 20 suppliers plus a `hasMore` sentinel. Authorization is
  scoped to the current company and actual assigned warehouse. Creation uses
  existing `wms.receiving.create`; keeper/manager duties are unchanged.
- Optional `supplierId` and `documentDate` retain the existing receipt command
  shape for old clients. Supplier/name validation and metadata writes occur in
  the same authorized, audited transaction as the existing WMS command. Metadata
  remains in the replay envelope; old create/edit retries cannot overwrite newer
  metadata. The advisory lock result is cast to text for Prisma compatibility.
- Receipt quantities are submitted in BASE units using exact integer/decimal
  strings. Each product's `piecesPerCarton` is authoritative. PackQty is never
  substituted for CartonQty. The existing 20-line receipt/return contract remains.
- Draft creation/editing, submission and review do not post stock. Existing
  approval and source-linked return posting remain in the existing WMS engine.
  No inventory formulas, movement SQL, dispatch rules or Smart Loading runtime
  logic changed.
- Product search uses the existing bounded, tenant-scoped PostgreSQL query,
  matching name/code/barcode and registered canonical Arabic/English names or
  aliases. It does not load a catalogue or facts into Node for aggregation.
- Main receiving/supplier-return navigation opens the dedicated supplier
  workspace. Legacy document routes remain available. A rejected broad shared
  editor replacement was abandoned in favour of this bounded navigation change.
- No cost is invented or exposed. Printing uses only the already authorized
  document, escapes all text and handles blocked popups. Return creation date is
  read-only; no separate backdated return-date contract was introduced.

## Verification and failures

New feature checks: 5/5 quantity cases, 3/3 SQL integration journeys, and 3/3 print
cases pass. The SQL journeys cover supplier creation, draft/edit, submission,
manager review/approval, source-linked return, unchanged interim stock, foreign
supplier/name rejection, old create/edit replays and audit-failure rollback.

The first mandatory integrated quality run recorded 746 passed / 32 failed,
without skips/TODOs. Representative failures also reproduce on unchanged
baseline source. Causes were pre-existing test fixtures using keeper identities
for product/opening/approval setup, duplicate `company_operating_settings` DDL,
and zero-role-grant assumptions predating the approved warehouse profiles.

Fixture-only corrections preserve operational actors, negative authorization
assertions, stock/replay checks and the runtime role policy. Their five affected
suites pass 34/34, including 1,000-product handover and the actual 83-product
release-package regression. Migration/demo tests now validate exactly the
reviewed role profiles and unchanged grants across demo import; their four
focused cases pass. No critical test was skipped or weakened.

API and web direct typechecks pass with normal read access to installed pnpm
links. An initial sandbox-only attempt could not resolve those links; it is not
reported as a source failure or acceptance result.

Browser review uses the actual editor, picker, shared styles, translation and
theme components in an isolated mock-API harness. Arabic RTL / English LTR,
light/dark, desktop / 430px viewport, supplier creation/selection, Enter barcode
addition, 12-versus-6 carton disclosure, receipt draft save and source-linked
return draft save were exercised. At 430px, document scroll width was 415px,
with no horizontal overflow. A physical scanner, real session/customer data and
Production posting were not exercised. The harness is not a deployed full app.

The final `pnpm quality --base cc620884581ad1164959f7566a871ac3b585964a`
completed with **781 passed, zero failures/skips/TODOs/cancellations**, and API,
database, schemas and web typechecks all passing. Overall gate status remains
**WARN**, with **functional PASS**, because scalability is unverified. Initial
and final local receipts are kept separately under `.quality/supplier-redesign/`;
old failed evidence is retained. The required `pnpm quality:postgres` also
completed with **239 passed, zero failures/skips/TODOs/cancellations** across
39 suites. Its separate receipt is `postgres-final.json`. Both commands exit 0
for local functional acceptance while honestly retaining overall **WARN** for
unverified scalability.

Final source fingerprint:
`a423ba09fcdb8c9643965e99dfa390ca40a1d141b01c2d83b0e16e9b7b7a2273`.

## Scalability observation

Scalability Gate: **WARN / UNVERIFIED**. Synthetic read-only supplier lookup;
two companies, three warehouses; 1 and 1,000 supplier fixtures; actual
concurrency **1**; one excluded warmup and ten measured requests per size.

| Suppliers | Returned | SQL statements per service call | Service p95 | Largest response |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | 3 | 8.94 ms | 100 bytes |
| 1,000 | 20 | 3 | 14.83 ms | 1,426 bytes |

These are PGlite service observations, including warehouse admission and active
mode/user SQL, without HTTP guards. API p95, native PostgreSQL rows scanned,
lock/pool waits, approved comparable baseline and mixed concurrent capacity are
unmeasured. A bottleneck has not been established. SQL count stays constant and
payloads remain bounded; this is not a 150-user or Production capacity claim.
Raw synthetic samples: `.quality/supplier-redesign/lookup-observation.json`.

## Remaining release work

Local functional acceptance is separate from deployment readiness. A Production
release still requires verified release/capacity evidence, `pnpm quality:release`,
Linux Docker packaging checks, and deliberate application of additive migration
`20261027150000_wms_suppliers` before serving the new API/UI. Deployment remains
subject to the user's explicit approval and must use the Railway CLI.
