# SFA foundation — phase 1

Backend configuration only; no inventory, invoices, UI, or source switching.

- `CompanyOperatingSettings` is optional and company-owned. Missing settings mean
  `ANALYSIS_ONLY`; the migration does not backfill companies or change Excel/RIE data.
- `GET /companies/me/operating-settings` reads the authenticated tenant's mode.
  Platform administrators can GET/PATCH `/companies/:id/operating-settings`.
  PATCH accepts only `{ "operatingMode": "ANALYSIS_ONLY" | "SFA" }` and audits real
  changes in the same transaction. Changing mode does not grant permissions.
- New SFA controllers must use `@Auth(...)`, `@RequiresSfa(...)` and resource-level
  company/hierarchy scope. The global gate requires `sfa.access`, any declared
  operation permissions, and current persisted `SFA` mode. Controller and method
  requirements are cumulative. Platform admins have no implicit tenant bypass.
- `/sfa` is reserved: routes in this namespace without capability metadata are
  denied. Legacy routes without this metadata perform no SFA database reads.
- The migration registers `sfa.access` but grants it to no existing role. Use the
  existing platform role-permission administration explicitly. These role grants
  are global in the current RBAC model; company mode remains a separate gate.
- Prepare/review the migration and generated Prisma client before a later rollout.
  No real database migration or seed is run as part of this development task.
  Existing Company scalar reads are unchanged because settings live separately.
- Before operational documents are introduced, disabling SFA will need rules for
  open custody and transactions. Phase 1 has no such documents or workflows.

Tests use mocks and installed PGlite in memory only. In this Windows sandbox,
TypeScript's native realpath may fail with EPERM for pnpm links; verification uses
an in-memory compiler host with `fs.realpathSync`, without changing tsconfig.

## Phase 2 — setup checklist and warehouse registry

- `/sfa/setup` reuses the dashboard shell, Cairo, shared Card/Button/Input/Label/
  Dialog/Switch/Badge/Skeleton, semantic tokens and locale direction. No new CSS
  palette or component system. Navigation is shown only for an authorized company
  administrator with persisted SFA mode. No polling or per-keystroke requests.
- All `/sfa/setup-checklist` and `/sfa/warehouses` API operations require the
  existing `COMPANY_ADMIN` role, `sfa.access` and `company.manage`, plus active
  subscription checks. No new RBAC registry or implicit grants. This phase does
  not yet grant warehouse-clerk access. Company identity comes from authentication.
- Query contract: checklist returns exactly six statuses using two tenant-scoped
  indexed existence probes (`ACTIVE` Employee, active Warehouse), never full lists.
  `PRESENT` means records exist, not complete commercial readiness. Products,
  customers, prices and opening balances are `NOT_AVAILABLE`: operational models
  do not exist yet. Canonical Excel rows must never falsely complete these items.
- Warehouse list: tenant filter before search, five-field projection, stable ID
  order, page size 1–50 (default 20), one lookahead row, page at most 1000. No total
  count, whole-table reads or Node aggregation. Search is submitted explicitly.
  Registry queries are bounded Prisma operations, not large analytical RIE reads.
- Warehouse writes are tenant-scoped and audited in the same transaction. Code is
  normalized uppercase and unique per company. No delete route, balances, stock
  movements, employee custody links, automatic seeding or source switching.
- Migration adds only `warehouses` and tenant-prefixed indexes. Existing company
  scalars, Employee and RIE data/contracts remain unchanged. Future imports can use
  the company/code business key; import/mapping itself is not implemented here.
- Local interactive testing needs a disposable database with both pending SFA
  migrations, local auth/subscription fixtures, an SFA-enabled company and explicit
  permissions. None are applied to a real database by this task. New companies
  have no auto-created warehouses or operational balances.

### Local verification (2026-10-19)

- 91 tests passed across 19 files, including both isolated migration fixtures,
  tenant/role/capability rejection and Excel/RIE/Visit Copilot regressions. Network
  attempts were blocked and recorded as zero; PGlite was in-memory only.
- Shared schemas compiled; API and web TypeScript each reported zero diagnostics
  with the pnpm realpath workaround. Prisma Client was generated locally only.
- Source review matches the design-system guide and Team Performance primitives:
  Cairo inherited from layout, logical RTL spacing, light/dark semantic tokens,
  responsive grid, shared focus/dialog and loading/empty/error components.
- An isolated interactive fixture bundle compiled, but the available browser
  could not reach its local preview (connection timeout). Visual/interaction
  acceptance at mobile/desktop and light/dark remains pending; do not represent
  this as a completed visual gate or an end-to-end database-backed acceptance test.
- This earlier fixture verification preceded the local release-gate commit.
  Production migrations remain unapplied; the later restored PostgreSQL 18
  compatibility checks are documented in `SFA_BLOCKERS_20261019.md`.

## Controlled release integration

`sfa-setup` is now part of the existing screen registry and defaults to HIDDEN.
Super Admin can edit company operating mode on the existing company-details page;
screen activation remains in its existing screen-access editor. Both are required
alongside the existing role permissions and subscription checks. The permission
catalogue in existing Access Control includes capabilities not granted to any role,
so `sfa.access` can be granted explicitly without a seed or manual database edit.
Grants remain global by role, not per user. Deployment grants/activates nothing.

See [SFA_PRODUCTION_READINESS.md](SFA_PRODUCTION_READINESS.md) for the controlled
release history, activation steps and rollback prerequisites.

The later blocker verification is now recorded in
[SFA_BLOCKERS_20261019.md](SFA_BLOCKERS_20261019.md): protected logical backup and
real isolated restore, Linux standalone packaging/runtime, explicit global-role
scope and tenant-isolation checks. No Production activation or deployment was
performed.
