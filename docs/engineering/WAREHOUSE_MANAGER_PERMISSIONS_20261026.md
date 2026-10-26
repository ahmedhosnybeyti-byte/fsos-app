# Warehouse manager permissions — isolated local phase

Base: `06f3f664c532b914386f302bb433fc36ca590941`.

## Contract

`WAREHOUSE_MANAGER` is a protected specialist role in the existing role registry.
Its Arabic/English names are exported as existing shared role metadata. Generic
`MANAGER`, `WAREHOUSE_KEEPER`, `COMPANY_ADMIN`, procurement and accounting grants
are not modified. Existing specialist account administration remains platform-only.

Manager capabilities are explicit and capped by `warehouseManagerPermissions`,
including when a caller supplies excess permissions: inventory reads, receiving
review/approval, picking review, dispatch approval, supplier/rep-return review and
posting, count approval, quarantine release/write-off, registry and assignment
management. Preparation, dispatch execution, product maintenance, opening-stock
posting, company/user administration and financial/purchasing capabilities are
not included. Existing operation-to-permission mappings are preserved.

Warehouse stock and document APIs continue to require an active authorized
warehouse in the authenticated company. No manager-wide company warehouse bypass
was added. Existing assignment APIs admit a delegated manager only for a warehouse
already assigned to that actor and only for target users in the same company.

Registry routes are under `/sfa/wms/registry/warehouses`, separate from the existing
Company Admin setup routes. They require the manager role, `sfa.access`, `wms.read`,
`wms.warehouses.manage`, an enabled warehouse module and SFA/FULL_ERP mode. The
service rechecks company/actor status, current DB role, module and mode; writes
repeat admission inside the transaction. Lists use an indexed assignment predicate
before filtering/pagination (maximum 51 fetched rows). Updating an existing
warehouse locks both its row and the actor's assignment, including for inactive
warehouses. Creation grants the actor access to that new warehouse atomically
with creation and audit. No branch routing or tenant activation is introduced.

Inventory adjustments still use the existing count document, approved posting,
movement ledger, idempotency and transactional audit. There is no balance-edit
endpoint or change to inventory SQL functions. A manager cannot bypass those
documents using an opening-stock permission injected into its permissions array.

## Migration and activation

`20261026170000_warehouse_manager_role/migration.sql` only registers the new role,
missing capability rows, and that role's grants. It is replay-safe and does not
edit other role grants, create users, assign existing warehouses, activate a
company or alter stock/financial data. No Prisma schema change is needed because
roles and grants are existing tables.

The migration has been executed only against disposable synthetic PGlite fixtures.
It must be reviewed/applied separately in an authorized environment before later
account provisioning. No real company or account has been changed. No deployment
or account creation is authorized by this handoff. Warehouse/supplier UI work is
excluded from this branch; consuming the new role in those interfaces is separate.

## Focused verification and limits

Focused schema/guard/user/auth/WMS regressions, new manager admission tests and
six isolated SQL scenarios cover migration parity for existing role grants,
company/warehouse scope, revoked access, mode/module admission, bounded paging,
registry create/update audit rollback, keeper preparation versus manager approval,
and document-backed count adjustment with replay/audit failure. API and schema
typechecks use the isolated candidate and existing local dependencies. All 36
focused cases passed with no skips; the amended registry-assignment case also
passed independently after the final assignment assertions were added.

System Design Gate: PASS for the tested local permission/transaction contracts.
Scalability Gate: WARN — synthetic registry scenario: 59 warehouses, 20/50 rows
returned, two measured SQL statements per direct service call, actual concurrency
one. Total HTTP-request SQL (including authentication and guards) is unmeasured.
The additional registry admission query is the main added latency source. API
p95, native lock/pool waits and concurrent capacity are unmeasured; no trusted
comparable baseline or release/capacity claim. PGlite tests are not proof of native
PostgreSQL concurrent locking. No broad quality run, browser automation, load test,
network service, new dependency, Production action or push was performed.
