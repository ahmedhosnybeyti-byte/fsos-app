# Procurement Phase 01 — local handoff

Review base: `729c743`. Local implementation only; no push, deployment or Production migration.

- Route: `/sfa/procurement`; explicitly activated screen, FULL_ERP, `sfa.access`,
  `wms.read`, `procurement.read` and operation permissions. Existing warehouse
  assignments remain authoritative. Request authors cannot approve themselves.
- Five views: dashboard, requests, orders, existing accounting supplier registry,
  receiving tracking. Draft editing/submission, approval/rejection, one conversion,
  optional explicitly entered SAR prices, cancellation before receiving and WMS links.
- Suppliers retain their existing identity/immutable accounting registry. Supplier
  registration remains in the existing Accounting screen with its own permissions;
  this phase does not introduce a second supplier store or relax edit restrictions.
- Only WMS POSTED accepted/quarantined quantities count as delivered. Multiple
  receipts, direct WMS draft edits, reversal and duplicate/concurrent posting pass
  through the existing inventory ledger. A database guard serializes linked
  postings and rejects quantities beyond the order. No estimated costs or GL posting.
- PostgreSQL scopes company/warehouse first; lists return 20 (+1 pagination sentinel),
  details at most 20 lines/100 receipt links/20 events. Dashboard materializes its
  scoped progress once. No raw Canonical facts, polling or new dependencies.

Verified new functionality:

- 6 focused schema/isolated PostgreSQL tests: pass, zero failures/skips/TODOs.
- Native independent PostgreSQL connections: duplicate create/conversion/post,
  competing over-receipts and atomic audit failure rollback: pass.
- 10 real local HTTP checks: admission, tenant/warehouse scope, bounded reads,
  missing documents and invalid input: pass. Observed successful reads 21–51 ms
  on this small Demo; no capacity claim.
- Shared schema build, API and Web strict typechecks: pass. Windows dependency
  junctions required the normal local runtime outside restricted filesystem reads.
- Actual UI Demo, `DEMO-WH-01`, original `P-001`: baseline **197 cartons**, order
  leaves **197**, WMS receipt **25 → 222**, remaining **15**, WMS receipt
  **15 → 237**, order COMPLETED, exactly **2 movements / +40 cartons**.
- Rendered Arabic/English × Light/Dark × desktop/mobile; no page-wide overflow
  in the mobile DOM checks. Tables retain their own horizontal scrolling.
- Evidence: ignored `.quality/procurement/` (native/HTTP/Demo JSON, test/typecheck
  logs and eight visual captures). Preview: `http://localhost:4488/local-login/admin`;
  approver: `/local-login/clerk`. API binds only `127.0.0.1:4489`; preview session
  helpers exist only in ignored local launchers, never application authentication.

System Design Gate: **PASS for the focused local scope**. Consistency uses order
locking and posted receipt-derived progress instead of a second mutable stock
balance. In accordance with the task's explicit new-functionality-only limit,
the broad `pnpm quality --base 729c743` / `quality:postgres`, old WMS/accounting
suites and release/load checks were not rerun. This is not release approval.
