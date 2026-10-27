# Warehouse permission activation — local readiness

The approved keeper profile has exactly nine permissions:
`sfa.access`, `wms.read`, `wms.receiving.create`, `wms.supplier-return.create`,
`wms.rep-return.create`, `wms.reservation.manage`, `wms.picking.manage`,
`wms.dispatch.execute`, `wms.count.create`.

`wms.request.create` is explicitly excluded. Existing reserve/pick/dispatch
commands select their own permissions independently of creation. Tests use a
rep-created Smart Loading request and a keeper principal populated from the real
role-permission rows in an isolated synthetic PostgreSQL database, with no request
creation grant. No warehouse/supplier UI was modified in this closure.

Both shared server policy helpers cap the keeper profile even when a token or
legacy grant array contains excess permissions. Receipt/return posting, reviews,
count approval, inventory opening, registry/access administration and finance
are excluded. Existing company/warehouse scope remains unchanged. General
MANAGER, COMPANY_ADMIN and WAREHOUSE_MANAGER policy/grants are unchanged.

New migration: `20261027120000_warehouse_keeper_operational_profile`. It registers
the existing keeper role if absent, registers missing permission rows and adds
only the approved nine grants to that role. Existing correct grants and role
metadata are retained; excess legacy grants remain stored but are ineffective
under the server cap. No account, assignment, inventory or other role mutation.

The new migration and its idempotence passed on the previously verified local
test cluster. Other-role grant and stock digests were unchanged by migration.
The manager-role and separate-approver migrations were not replayed.

Three focused policy tests passed. Native PostgreSQL integration verified receipt
draft/submit versus manager approval; supplier and rep-return recording/submission
without posting; keeper reserve/pick without request.create; manager review and
dispatch approval; keeper dispatch in SFA; unchanged automatic recipient-confirmed
handover in FULL_ERP; count drafting, keeper approval denial despite injected
grants, SQL self-approval denial, separate manager approval, and tenant/warehouse
denial. Completed native scenarios were reused after test-harness corrections.
Evidence: `.quality/warehouse-final/keeper-native.json`.

System Design Gate: PASS for the tested local permission and workflow contracts.
Scalability Gate: N/A for this closure — static permission admission and bounded
reference-data migration only; no operational query or algorithm change. Native
workflow observations are functional checks at concurrency one, not capacity or
release evidence. No broad quality/browser/load run, Production migration, real
account creation, push or deployment occurred.

Ready for an explicitly authorized activation step. The intended environment must
apply the two previously verified permission migrations and this new keeper
profile migration if pending, then create/assign each account using the existing
platform-only user administration, protected manager bootstrap and scoped keeper
assignment. This local readiness does not authorize that step.
