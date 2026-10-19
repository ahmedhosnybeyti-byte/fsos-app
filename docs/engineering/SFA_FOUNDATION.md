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
