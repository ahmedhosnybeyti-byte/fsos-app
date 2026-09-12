# Murshidak Performance & Scalability Guardrails

These guardrails are permanent. They apply to new screens, analytical endpoints, and performance-sensitive changes.

## Query and data-access design

- **Scope first.** Apply Active Version, then Company/entity, Manager/Supervisor/Sales Rep/Route hierarchy, and Date scope before fact joins wherever possible. Apply geographic scope early too.
- **Keep heavy work in PostgreSQL.** PostgreSQL performs filtering, joins, `DISTINCT`, aggregation, sorting, and pagination. RIE is the access gateway for large operational and analytical data.
- **Use scalar-only projections where possible.** Select only required columns. Avoid unnecessary `source.*`, full JSON rows, and wide materializations.
- **Return small results.** Node and the UI receive prepared, scoped results—not oversized raw facts for in-memory filtering, mapping, reducing, joining, or deduplication.
- **Avoid duplicate fact scans.** Reuse a scoped fact query/CTE when one request needs several related KPIs. Do not paginate through a large entity and aggregate across pages.
- **Preserve business semantics.** A performance change must retain business logic, permissions, hierarchy scope, newest-wins semantics, response shape, and UX. Data parity is mandatory.

## Operating model

- Murshidak is primarily D-1 / Snapshot and result-first, rather than live-field-data architecture.
- Do not add unnecessary polling or recalculation.
- Do not increase RIE concurrency as a default response to slow or timed-out workloads; measure the actual bottleneck first.
- For every new screen or analytical endpoint, define the RIE/PostgreSQL query contract before building the UI/service.

## Verification and delivery

Use the smallest validation that can answer the engineering question: safe implementation → targeted validation → commit → production deploy for runtime changes. Run a load test only when its outcome changes a real decision; do lightweight, targeted validation before considering large load tests.

Before approving a performance-sensitive implementation, review rows scanned versus returned, response time, RAM impact where relevant, and the absence of dangerous full reads. Document important verified fixes in `RESOLVED_ISSUES.md`.
