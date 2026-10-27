# Existing loading cycle: recipient consent and handover

The owner extended the existing Smart Loading task to require the representative
to review prepared quantities and shortages before goods leave the warehouse
and enter custody. The existing loading workflow, FEFO, picks, immutable event
and command ledgers, and custody posting remain authoritative. No parallel
workflow table, role grant, dependency or infrastructure was introduced.

## Contract

- All FULL_ERP companies use the rule; company/recipient identity comes from
  authentication and current operational records. No company, rep or warehouse
  identifier is hardcoded in runtime code. The existing SA-DEMO/three-branch
  mapping is test-company configuration only. Analysis/SFA behavior is preserved.
- Keeper prepares/reviews/approves the same request. FULL_ERP may prepare the
  eligible available subset; zero prepared shipments are denied, and shortages
  require a reason. The request retains its original requested quantities.
- The recipient's own bounded inbox in Smart Loading announces ready requests
  and displays requested/prepared/shortage quantities. It refreshes manually or
  on window focus; it is an in-app notice, not email/SMS/background push.
- Only the authenticated recipient can confirm or return the same document to
  preparation. Confirmation records the exact document version and prepared
  fingerprint in existing immutable ledgers; it changes no physical stock/custody.
- A database trigger blocks FULL_ERP dispatch without matching recipient consent,
  including calls through the underlying engine. Keeper dispatch then runs the
  existing dispatch and acceptance steps in one transaction, with explicit audit
  attribution to the recorded recipient consent. No login/token impersonation.
  Any stock/quality/audit failure rolls back both steps. Replays remain idempotent.
- Ordinary warehouse read/dispatch permissions remain separate. Neither a served
  branch nor the recipient inbox grants a representative warehouse operations.

## Verification

19 focused SQL cases (five handover, eight request/branch and six existing WMS
core cases), 11 affected UI cases, and the 103-case critical core passed with
zero skips/TODOs/failures. API/web TypeScript, shared schemas and exact candidate
Prisma validation passed. Broad unrelated quality/release/load suites were not
rerun under the owner's explicit narrow-test instructions and are not claimed
passed. Existing Linux Docker deployment builds provide packaging checks.

Native isolated PostgreSQL verified migration data parity, dispatch rejection
without consent, independent-connection confirmation/dispatch races and concurrent
replay with exactly one stock/custody posting. This caught and fixed Prisma's
int64 parameter binding by explicitly casting the version to PostgreSQL integer.
Dataset: two synthetic companies, three existing fixture warehouses, 1,000
employees and one request/line; overlapping race connections two. Eight measured
serial inbox samples after two warmups: two SQL statements, service p95 7.071 ms.
HTTP p95, representative historical-inbox depth, pool waits, mixed-load capacity
and a comparable approved baseline are unmeasured. No 150-user capacity claim.

The runtime candidate contains 12 files over API deployment
`0c75cac5-ee7b-4d44-84f9-9c1817716d36` and web
`f0de759a-3c65-4705-8c69-c44638b99675`; unrelated schema/workspace changes are
excluded. Commit remains uncommitted, with immutable local source manifests.
Safe evidence/candidate: `.quality/loading-handover-20261025/`.

## Production authorization and current release record

Initial automatic review rejected the handover migration because prior approval
covered branch routing only. The action did not execute. The owner subsequently
explicitly approved the handover migration, API/web deployment and completion of
the existing seven-carton request. No signing key, password reset or shared role
grant was used. Normal browser sessions were supplied by the owner for each role.

The handover migration completed with unchanged all-company stock, custody,
requests, warehouse access and existing event fields. It adds two nullable event
columns, scoped functions and the dispatch guard, with no business-data backfill.
The original stored loading function is retained for recovery. API deployment
`985173c1-fd39-4a3f-9d9b-35b224e2332e` and web deployment
`02f44aec-de64-4a87-8323-0d884fba04ce` both reached SUCCESS. The public route
and updated asset returned 200; anonymous access to the recipient inbox returned
401. Existing Linux API/web builds completed successfully.

Only the existing real request `f223efb8-9053-4954-aca8-9fe012916187`, seven cartons
of `P-047`, is used. At the prepared stage it remains APPROVED, physical stock
100 cartons, reserved seven, transit/custody zero. The owner's normal keeper
session saw and prepared that request. The owner's normal representative session
then displayed requested seven, prepared seven, shortage zero, acknowledged and
confirmed it. Version six consent was recorded under SALES_REP while physical
stock remained 100, reserved seven and custody/transit zero.

The owner returned to the normal keeper account, which displayed recorded
recipient consent and enabled dispatch. One keeper handover action completed
the document as ACCEPTED. Final scoped SQL verified physical 93 cartons for
P-047, reserved/transit zero and exactly seven cartons in Sultan Al-Juhani's
operational custody. There is exactly one request, one recipient confirmation,
one keeper dispatch and one acceptance, and zero direct warehouse grants for
the representative. The UI also showed the seven-carton custody balance.
No second live request, warehouse, branch, stock opening or manual balance
adjustment was created. Analytical Van Inventory/accounting were not rewritten.

Closure evidence: `live-prepared.json`, `live-confirmed.json`,
`live-completed.json`, `public-smoke.json`, both deployment receipts and
`recipient-review.jpg` / `custody-seven-cartons.jpg` under the private evidence
folder. The user-facing browser remains on the actual warehouse/custody result.

System Design Gate: PASS for the verified scope and duty/transaction boundaries,
including the real two-account Production handover. Scalability Gate: WARN for the
unmeasured comparable baseline and concurrent capacity, not a capacity approval.

Rollback restores the retained function, drops only the new dispatch trigger and
new helper functions and rolls back compatible app versions; added nullable
columns may remain. Existing stock/custody/events must never be rewritten to
simulate a rollback. A completed physical handover follows the existing return
workflow if reversal is required.
