# Supplier Receiving — final release readiness, 2026-10-27

Review base: `4ccd7a5e5b1a7b67dda1ff9bf8c19d09137b6b29`. Local only; no new
backup, Production migration, push or deployment is authorized/performed.

## Supplier identity decision

Keep `wms_suppliers` for this release. Its company/id and company/code constraints
and the receipt metadata's composite foreign keys prevent cross-company identity
references. It owns no balance/account or automatic procurement write. Current
financial suppliers are `accounting_parties(kind='SUPPLIER')`; procurement awards
reference those parties using a company-scoped foreign key. Financial parties are
immutable and require a liability account, so making them mandatory for receiving
would introduce financial setup and break the approved operational separation.

Future unification is an explicit, company-scoped **one-to-one identity link**:
unique `(company_id,wms_supplier_id)` and unique
`(company_id,accounting_supplier_id)`, composite foreign keys at both ends, and
database validation that the financial party is a supplier. Attaching an existing
party must be an authorized, audited transaction; names alone cannot authorize
merging. Existing documents keep their historical supplier-name snapshots.

The operational supplier becomes the canonical current identity/display source
after linking; financial-party names remain historical immutable snapshots, not
a second editable master. Accounting/procurement adapters resolve the mapped ID,
without copying balances or creating another supplier. Existing parties must be
explicitly linked before creating a financial profile; enforce link uniqueness in
PostgreSQL, not application-only deduplication. No linking table, GL account,
automatic name merge, trigger synchronization or schema rebuild is added now.

## Scope of remaining verification

- Remove item-count ceilings end-to-end for supplier receiving and supplier
  returns; retain representative-return, inventory and Smart Loading contracts.
- Read every line of one authorized document; catalogue/document lists remain
  paged. This is a complete-document projection, not an entity/fact full read.
- Use the existing command/version/replay/audit transaction and stock engine.
- Supplier command JSON gets a bounded transport byte envelope, without an item
  count ceiling. Other routes and other WMS commands retain their prior 100 KiB
  admission limit. Parser tests cover 21/83/1,000 lines and rejection boundaries.
- Run final release regression/typecheck selection once after integration, build
  the exact Linux Docker/Railway sources, and validate supplier migrations on a
  disposable native PostgreSQL database. Retain measured concurrency and unknowns.

## Final result

Code commit: `300667f1398f8889cf7944a44f67cf99d33cad07`, local candidate branch
`codex/supplier-receiving-release`. Agent commits: SQL/API `ac2beec`, schemas
`455eb85`, UI `6cdaf6a`, native evidence tool `6937196`. Existing checkout,
unrelated WIP, permissions, inventory/dispatch formulas and Smart Loading remain
unchanged. New additive migration: `20261027160000_wms_complete_supplier_documents`.

- Receipt and supplier-return item-count ceilings are removed from schemas,
  command validation, UI and SQL. Complete receipt/source/return projections keep
  every authorized document line. REP returns retain their existing contract.
  No replacement business count limit is introduced. A 25-row local DOM window
  limits rendering only: the actual UI handler saves 1,000 and accepts line 1,001.
- Focused SQL journeys pass at 21 / 83 / 1,000 lines: complete create/edit/read,
  true 6/12/24 carton factors, end-of-document validation failure rollback,
  approval, returns, replay and tenant/warehouse isolation. Direct service reads
  remain 4 / 3 / 4 SQL statements for receipt / source / return at every size.
- `pnpm quality:release --base 4ccd7a5e5b1a7b67dda1ff9bf8c19d09137b6b29`:
  **796 passed, zero failures/skips/TODOs/cancellations; four typechecks pass**.
  The command exits **1**, overall **BLOCK**, because its separate scalability
  requirement remains **WARN / UNVERIFIED**. Functional success is **PASS**.
- Both CLI builds pass on **Windows / Node 24.18.0**, and Prisma generation
  succeeds without using an operating database. Next standalone packaging needed
  a build-only, workspace-scoped directory-junction fallback for Windows symlink
  permissions; no system setting, application config or Linux recipe changed.
  Built standalone server starts on loopback and supplier page + built supplier
  bundle both return **HTTP 200**. This verifies the Windows artifact only.
- The owner's later **CLI instead of Docker** instruction superseded the Docker
  build attempt. No Docker build/deployment was performed. Only `docker-desktop`
  exists in WSL; no general Linux distribution is installed. **Linux/Railway
  runtime build compatibility remains unverified**; Windows is not substituted
  as evidence for the Node 22 Linux production recipe.
- Real isolated **PostgreSQL 18.6** applies the **64-file current migration chain**,
  including `20261027150000_wms_suppliers` and the new uncap migration. Native
  checks preserve stock/custody/GL/grants/settings, verify composite company FKs,
  supplier code/retry uniqueness, tenant isolation and metadata-free old receipts.
  Generated disposable databases are removed; no backup/dump/restore is used.

## Measured evidence and remaining gate

Real loopback Nest HTTP uses the actual parser/controllers/services and the
Roles/SFA/company-screen guards, with synthetic actor injection. JWT/subscription
and the global production RIE wrapper are outside this harness. Two independent
Prisma clients each use a single connection; both receipt approval and return
posting pairs actually overlap and commit stock once. Injected post-effect audit
failures roll back stock, documents, audit and replay state atomically.

| Lines | Mixed HTTP p95 | Maximum driver SQL | Actual overlapping clients |
| ---: | ---: | ---: | ---: |
| 21 | 53.87 ms | 15 | 2 |
| 83 | 71.37 ms | 15 | 2 |
| 1,000 | 748.64 ms | 15 | 2 |

These are nearest-rank observations over **five successful mixed operations per
size**, no excluded warmups: draft create, two approval retries and two return
posting retries. They are not one endpoint's SLO or a user-capacity test. The
1,000-line request is 230,125 bytes and passes the real HTTP parser. Driver query
events exclude statements inside PostgreSQL functions; no internal constant-SQL
or native N+1 claim is made. Existing company/receipt-line indexes are reused,
without redundant indexes. Native query plans/scans, pool/lock waits, pure server
time and a measured bottleneck remain unavailable. No approved comparable
baseline/budgets exist, so **Scalability Gate: WARN** and executable release
**System Design Gate: BLOCK** cannot be promoted to PASS.

Remaining: Linux CLI/CI validation of the existing Railway recipe and completion
of verified scalability evidence/approved baseline. No permission to install a
new Linux environment or deploy/apply Production migrations is inferred.

Receipts: `.quality/supplier-release-readiness/{release-final.json,
cli-build-receipt.json,web-startup.json}`, `.quality/supplier-readiness/native-http.json`
and `.quality/scalability/current.json`. Full source fingerprints are retained in
the local verification receipt. Previous successful suites were not rerun before
the final required release command; focused tests covered the new failure modes.
