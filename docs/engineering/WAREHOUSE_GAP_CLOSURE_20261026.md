# Warehouse permission gap closure — local candidate

Base: `f894647235121afb65783ab5c84b5d050933eeed`.

## Implemented

- A platform-only `POST /api/v1/platform/companies/:companyId/warehouses/:warehouseId/manager-bootstrap`
  accepts exactly `managerUserId` and a mandatory justification `reason`. JWT and
  existing role/permission guards protect the route. The service verifies the
  persisted active SUPER_ADMIN identity with no company membership, then verifies
  the explicit active company, enabled warehouse module, operational mode, active
  company manager role and active warehouse in that same company.
- Target-manager row locking serializes initial assignment. Only an unassigned
  manager can receive an initial warehouse. Repeating the same assignment is a
  no-op; another initial warehouse is rejected. Assignment and audit are atomic.
  No user/role grants or global SFA bypass are introduced. Existing scoped
  delegation remains the route for subsequent management.
- Additive migration `20261026180000_wms_count_separate_approver` adds a NOT VALID
  check on existing count documents. New inserts/updates cannot have identical
  `created_by` and `approved_by`. Enforcement is at PostgreSQL level, including
  direct count-function calls. Failure rolls back the enclosing posting and stock
  movement; legacy documented approvals are not rewritten or invalidated.

## Explicitly unresolved

No existing notification service, delivery channel, subscription or recipient
inbox was found in the base commit or current maintained backend. Warehouse
assignment also does not identify a unique responsible keeper. Audit and count
events are retained but are not notification delivery. Gap 3 remains OPEN because
building a new notification system was excluded by the request.

No single-owner exception policy exists. No automatic exception, role bypass or
inference from employee count is introduced. A single-person company needs a
separate authorized approver; any alternative requires prior business approval
of eligibility, explicit exceptional approval, justification/evidence and audit.

## Verification and boundaries

Focused offline tests exercise persisted platform identity, actor/target role and
tenant denial, initial assignment replay/conflict, module/mode denial, audit
rollback, SQL-level self-approval denial, legacy-document preservation and separate
documented approval with idempotency. Existing guards/warehouse admission are
checked separately; API and schema typechecks use this isolated candidate.
All 21 focused cases (four SQL/admission cases and 17 existing guard/role cases)
passed without skips; API and schema typechecks passed.

No warehouse/supplier UI, existing role grants, account provisioning, operating
database, notification infrastructure, inventory formula, RIE setting, push or
deployment is changed. The new constraint was applied only to disposable synthetic
PGlite fixtures; applying it to another environment is a separate authorized step.

System Design Gate: WARN — bootstrap/separation verified locally, but notification
delivery and any single-owner exception are not implemented.
Scalability Gate: WARN — synthetic fixtures with two companies, three warehouses
and six identity rows, one active client; bootstrap
uses scalar identity/scope queries and LIMIT 2 assignment admission. New count
approval adds a row-local check. Whole-HTTP SQL count, API p95, native lock/pool
waits and concurrent bootstrap/revocation behavior remain unmeasured. No baseline
or capacity claim; PGlite does not certify native PostgreSQL concurrency.
