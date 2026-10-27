# Existing warehouse branch routing — 2026-10-25

Initial implementation/verification was local. After the owner's conditional
approval and targeted Production identity/migration checks, API deployment
`0c75cac5-ee7b-4d44-84f9-9c1817716d36` reached SUCCESS and the existing SA-DEMO
warehouse was linked to the three verified branches. Migration parity confirmed
unchanged all-company stock, custody, warehouses and direct access. No warehouse,
branch or shared role grant was created. The owner later explicitly authorized
the recipient-handover extension; see `WMS_RECIPIENT_HANDOVER_20261025.md`.

The existing `SA-DEMO` warehouse is `ce373267-f88f-48ee-b8cc-d7003a9dd879`.
Read-only discovery verified current company BranchIDs `BR-05` (Jeddah), `BR-06`
(Makkah) and `BR-07` (Madinah), with three active matched representative accounts
per branch, one assigned active warehouse keeper and 100 existing stock positions.
These are actual RIE current-state Branch records in PostgreSQL; the company's
manual OrgUnit branch list is empty. No replacement OrgUnits were invented.

## Contract and change

An additive `wms_warehouse_branches` relation stores the existing warehouse's
served company BranchIDs. Its warehouse FK is company-scoped. BranchIDs are
validated against active company Branches during configuration and sending;
rebuildable canonical row IDs are deliberately not used as business references.
Missing/inactive data denies branch access. The existing setup controller has
one company-admin `PATCH /sfa/warehouses/:id/branches`, protected by its existing
`company.manage`, SFA admission and setup-screen gate; the service additionally
requires exact FULL_ERP mode. No shared role grant or new UI is introduced.

The existing request-only warehouse list/send paths allow an authenticated
SALES_REP with existing SFA admission to use either the established direct
assignment or the served branch of its current active Employee identity.
Identity is matched to the authenticated DB user's company/email; two matching
active records deny branch admission. The DB account role is authoritative;
the source Role label can legitimately be `Sales Rep`. Neither the client nor
the request can select a company, recipient, branch or operational command.
Future employees in served branches inherit request routing without a user
grant. No branch grant enters ordinary WMS read/reserve/review/approve/dispatch
admission. Analysis/SFA export paths, recommendations and formulas are unchanged.

Warehouse configuration and sending lock the same warehouse before checking
branch links. Both operations retain transaction/audit rollback. Sending reuses
the existing proposal/load engine and idempotency ledger, creates REQUESTED,
and performs no reservation, stock deduction, allocation or custody creation.

## Verification and limits

- 21 focused SQL/controller/service cases passed, with zero skips/TODOs/failures.
  Cases cover all three branch identities, future employee inheritance,
  source row-ID replacement with the same official BranchID, tenant isolation,
  branch/employee/link revocation, ambiguous identity, mode checks, strict
  configuration input, audit rollback, replay and denied WMS commands/reads.
- Mandatory critical core passed 103 cases. Shared schemas compile, API
  TypeScript passes and Prisma schema validation passes. Full changed-selector,
  all-Postgres and release suites were not rerun: the checkout contains substantial
  unrelated work and the owner requested the minimum affected checks. This is
  not a claim that those broader commands or Linux release builds passed.
- A separate native PostgreSQL synthetic fixture confirmed real WMS request
  persistence, keeper visibility, replay and unchanged pre-existing stock,
  custody, access and warehouse rows. Two independent connections confirmed
  configuration revocation blocks a pending send and denies it after commit.
- Dataset: two synthetic companies, three pre-existing fixture warehouses,
  three branch records, 1,000 Employee rows and one product. No customer data
  or operating database was copied into the test. List uses two SQL statements;
  a send uses ten including BEGIN/COMMIT and audit inserts. Internal PL/pgSQL
  statements are excluded. Isolated adapter counts are eight at both 1/20 lines.
- Eight measured serial list samples after two warmups had service p95 2.863 ms;
  this is not HTTP p95 or a concurrency-capacity result. Actual list concurrency
  was one; lock testing used two independent clients. Native employee lookup
  used the new tenant/email index and returned one row (observed 0.015 ms scan).
  No comparable approved performance baseline, mixed-user load, HTTP p95,
  pool-wait series or capacity certification is available.

System Design Gate: PASS for the owner-approved focused scope: identity,
migration parity, Linux build/deployment and the normal-session real request
passed. Broader unrelated release/capacity checks are not claimed.
Scalability Gate: WARN — bounded indexed local behavior measured; capacity and
comparable baseline remain unverified. No infrastructure or RIE-limit change.

Private safe evidence: `.quality/warehouse-branches-20261025/` contains the
read-only configuration plan, native evidence, exact six-file runtime candidate
over API deployment `a51001ee-c0aa-4b71-a861-de9b8a84cb47`, and review patch.
Existing unrelated schema/workspace changes are excluded from that candidate.
Commit: uncommitted source patch; no push. The owner-approved CLI configuration
transaction inserted exactly the three existing BranchIDs for the verified
company/warehouse and recorded an audit event. A normal representative browser
session created exactly one REQUESTED load, which appeared in the owner's normal
warehouse-keeper session. No stock deduction or custody occurred on sending.
Rollback preserves existing tables/stock: restore compatible API source and
remove only this warehouse's served-branch links if they were applied; no stock
restore or destructive migration rollback is required.
