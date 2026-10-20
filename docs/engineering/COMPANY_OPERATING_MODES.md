# Company operating modes and Distribution Demo — 2026-10-20

## Contract and compatibility

The Super Admin Create Company dialog accepts `operatingMode` independently of
`initialPlanCode`. Omission remains `ANALYSIS_ONLY`. The Company management page
uses the same bilingual selector and module registry. The API persists a new
company's mode inside its existing provisioning/audit transaction. Self-service
registration and existing companies retain their existing behavior.

`FULL_ERP` is an additive PostgreSQL enum value. Its migration changes no company
rows, settings, role grants, screen access, subscription, Excel/RIE history or
operational balance. Missing settings continue to mean Analytics. Company-specific
mode changes remain Super Admin only and audited atomically. Downgrades revoke
admission to later operational requests without deleting/reversing existing data.
Already admitted transactions retain their existing transaction/reversal rules.

| Mode | Capability ceiling |
| --- | --- |
| Murshidak Analytics / مرشدك للتحليلات | Existing Excel, RIE and analytical screens under their current authorization |
| Murshidak SFA / مرشدك للمبيعات الميدانية | Analytics plus implemented operations under explicit permissions and screen gates |
| Murshidak Full ERP / مرشدك ERP المتكامل | SFA plus future approved ERP units; no unfinished unit becomes accessible |

The shared module registry reports delivery separately from eligibility. It is
not an authorization grant. Existing SFA warehouse eligibility is preserved.
Operational requests still require authenticated company scope, `sfa.access`,
operation permissions, enabled screen and resource/warehouse ownership. There is
no platform-admin bypass of SFA admission. Invalid/missing mode fails closed.
Full ERP does not modify global role permissions. Accounting, purchasing, invoice
posting, returns and trade collection posting are explicitly deferred. Warehouse
Phase 01 is partial (products, lots, openings), not certification of a full WMS.
Concurrent WMS Phase 02 work is outside this change and is not certified here.

## Query and failure contract

Mode reads retain the existing bounded company primary-key lookups (one company,
one settings row). Operational admission reads one settings row for the
authenticated company; legacy Excel/RIE endpoints still perform zero new mode
queries. No new fact scans, polling, integration calls or runtime dependency were
added. Existing screen and resource scopes remain server-side. Creating a company
rolls back its mode, admin and subscription if provisioning/audit fails. The
consistency trade-off is fresh admission checks instead of a mode cached in JWTs.

The real Create Company rehearsal also exposed a pre-existing provisioning
failure: organizational events wrote their durable audit on the root connection,
which could not see the uncommitted tenant and violated the company foreign key.
Event audit now accepts and uses the caller's transaction for organizational
creation and the provisioning CompanyCreated event. Audit failures still abort
the transaction. Listener behavior and other event callers are unchanged.

## Canonical workbook audit

Reference: `demo-data/FSOS_Canonical_Database_v1.0_Seed_Data.xlsx`.
SHA-256: `f3c8ed0edfaef5fc97135f9d7cc13280245399bbaf6eed7d75b942bc3a1d95a2`.

The read-only streaming audit covered 19 entities and **526,139 rows**, including
2 source companies, 44 employees, 1,600 customers, 100 products, 61,234 invoices,
294,926 invoice items, 31,926 collections and 11,056 van inventory snapshots.
It found zero blank/duplicate declared primary keys and zero broken references
among the tested company/region/branch/employee/route/customer/product/document
relationships. This establishes referential structure, not full accounting,
tax, monetary or cross-company business reconciliation of the source workbook.

The workbook contains two source companies. They must not be blindly merged into
a third tenant. Van Inventory is a route/date snapshot, not a reviewed warehouse
opening count. There is no warehouse-opening or general-ledger opening source.
These openings remain deferred; history is never replayed over opening balances.

Reproduce the structural audit with the existing bundled Python/openpyxl runtime:
`python tools/quality/inspect-demo-canonical.py`. It exports schema/counts/failure
counts only to `.quality/company-modes/canonical-audit.json`, without source
contacts or row payloads. Offline key indexes are an explicit ingestion QA
exception; no application request materializes this workbook.

## Demo prepared and rehearsed locally

`Murshidak Demo Distribution`, fixed slug `murshidak-demo-distribution`, uses
Full ERP in an isolated persistent PGlite rehearsal under
`.quality/company-modes/demo-pg`. The other two tenants in that database are
synthetic Egypt/Saudi compatibility fixtures, never copies of real companies.
No real/company database was opened or changed.

`node tools/quality/company-demo.cjs` reproduces the rehearsal using the existing
test-only PGlite dependency. It strips inherited endpoints/credentials and blocks
network sockets. No app/API/web workspace depends on the quality workspace.
The bounded v1 bundle uses the Canonical schema and fully synthetic identities,
contacts (`example.invalid`), amounts and documents. It copies no source record.
It deliberately contains **175 rows**: 3 employees, 12 customers, 4 products,
24 invoices, 48 lines, 24 visits, 12 collections, 4 van loads, 4 van snapshots and
supporting reference/planning rows. The invoice/line total is SAR 552; historical
collections are SAR 276. Stock snapshots reconcile with this synthetic history.

The importer publishes immutable RIE versions using the existing canonical
lifecycle triggers in a single SQL transaction. Retry is `UNCHANGED`, with zero
new rows/audit entries. Identity collisions, unreviewed bundle changes and
manifest drift are rejected. An audit error rolls back the whole new tenant and
history. There are **zero operational stock/financial postings or role grants**.
Employee rows are analytical references, not automatically granted login users.
No subscription Payment is used as a customer collection.

This is a reviewed fixed synthetic v1 rehearsal, not a generic production
importer or a complete 360-degree ERP. It refuses modified v1 input; a future
dataset revision requires an explicit reviewed import plan. Blob download and
Excel reprocessing are not available for these JSON-only fixture sources.
Production onboarding must use the existing validated Excel ingestion/storage
pipeline or a separately reviewed adapter with equivalent publication/audit
semantics. PostgreSQL owns the imported history; future implemented operations
must use authoritative typed ledgers, never rewrite RIE rows as stock postings.

## Local review and evidence

The real admin frontend and API are available for this session at
`http://localhost:4368/local-login`, using a fresh isolated PostgreSQL database
in the pre-existing local test cluster. It verifies the cluster directory, uses
synthetic tenants only, blocks non-loopback networking and does not read `.env`.
Review source/migrations are frozen to committed WMS Phase 01 plus this mode
change, so unrelated Phase 02 edits do not alter the preview.

- Focused mode/provisioning/security/Demo SQL regressions: **17 passed**, zero
  failures/skips/TODOs. Evidence: `.quality/company-modes/focused.log`.
- Source audit and persistent Demo retry rehearsal: PASS. Evidence:
  `canonical-audit.json` and `demo-rehearsal.json` in the same directory.
- Egypt/Saudi compatibility uses synthetic fixtures for missing settings and SFA
  settings, fact/balance preservation and tenant-specific transitions. Production
  tenant settings were not inspected and are not claimed verified.
- `pnpm quality --base 6b6f21a`: **511 passed**, zero failures/skips/TODOs and
  passing API/web/database/schemas TypeScript checks. Earlier runs encountered
  incomplete concurrent WMS Phase 02 SQL/fixtures; this successful final run
  supersedes those failures. Evidence: `.quality/company-modes/quality-final2.log`
  and `.quality/changed.json` (working tree evidence includes concurrent WIP).
- `pnpm quality:postgres`: **92 passed**, zero failures/skips/TODOs. Final
  independent SQL evidence: `.quality/company-modes/postgres-final.log` and
  `.quality/postgres.json`; this supersedes the earlier WMS fixture failures.
- The real browser created a Full ERP tenant with an independent plan, then
  saved Analytics and Full ERP in turn. Native PostgreSQL verification confirmed
  both organization event audits and mode audits, unchanged Egypt/Saudi settings,
  all 175 Demo history rows, zero global role grants and zero stock postings.
  A targeted database audit failure through the real API rolled back company,
  branch, admin, subscription, mode and audit writes. Evidence:
  `.quality/company-modes/native-acceptance.json`.
- Design System Gate: PASS for the new field/panel. Shared Dialog/Select/Label/
  Badge/Button and existing glass cards, no new palette/font/icon dependency.
  Actual Create/Edit renders were checked in Arabic RTL and English LTR, light
  and dark, desktop/tablet/phone widths (767/480/430/390), with keyboard selection,
  focus, selected/disabled states and the real create/save flows. API failure
  rollback was verified independently. Captures
  are in `.quality/company-modes/screenshots/`. Existing unrelated admin content
  retains its previous translations/layout.

System Design Gate: PASS for company modes/provisioning and the bounded local
synthetic rehearsal, including the final standalone SQL gate. This is not
release readiness: Linux packaging/release-wide checks, recovery verification,
Production import approval and complete operational ERP remain outstanding.

## Protected Production plan — requires explicit approval

1. Review a clean release revision with this change isolated from other WIP.
   Re-run `pnpm quality --base <actual-release-base>`, `pnpm quality:postgres`,
   `pnpm quality:release`, existing Linux API/web Docker builds and applicable
   native PostgreSQL/recovery checks. Verify backup restoration and record the
   evidence in ENGINEERING_RELIABILITY.md. Keep current separate migration and
   Docker/startup behavior. Verify external deployment gates separately.
   The user reported a general Railway deployment problem during this task;
   deployment readiness must also wait for platform recovery to be verified.
2. Obtain explicit approval for push, deployment, the additive Production
   migration and Demo creation. None is authorized by this implementation.
3. Back up and record existing Egypt/Saudi modes, screens, roles, subscriptions
   and analytical counts. Apply the enum migration separately, then deploy the
   approved API and web revision. Do not backfill/activate existing tenants.
4. Create the third company through protected Super Admin provisioning, select
   Full ERP and a separately chosen commercial plan. Approve any Demo screen and
   user grants explicitly; do not change shared roles for convenience.
5. Import the reviewed synthetic dataset through approved existing ingestion,
   reconcile history and verify retry/tenant isolation. Create operational
   openings only from a separately approved opening source; never replay history.
   Keep unimplemented accounting/ERP units deferred.
6. Verify Demo at `https://www.murshidakapp.com` and smoke-test Egypt/Saudi without
   changing their behavior. On application failure, roll back application code
   before enabling Full ERP tenants. Leave the additive enum value in place;
   removing it is not a routine rollback. A Demo access problem can be contained
   by suspending the company/screen access without deleting its data.
