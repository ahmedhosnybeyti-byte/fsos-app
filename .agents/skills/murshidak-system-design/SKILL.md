---
name: murshidak-system-design
description: Required right-sized system-design and production-safety review before implementing or substantially changing Murshidak backend, database, RIE, integrations, ERP/SFA operational flows, APIs, or performance-sensitive frontend data access. Use lightweight checks for small changes; do not invoke for prose-only tasks.
---

# Murshidak System Design Gate

## Goal

Ship useful FMCG / water-distribution features without sacrificing company isolation, transactional correctness, responsiveness, availability, or future scalability. This is an **implementation gate**, not an invitation to redesign the architecture or build for hypothetical billions of users.

## Read the actual code first

Before implementing, inspect only the code and repository instructions necessary for the change; verify current facts rather than trusting historical notes. Reuse NestJS/Next.js/Prisma/PostgreSQL, RIE, shared authorization, service boundaries and existing conventions. Respect all applicable `AGENTS.md` files. Keep investigations focused and bounded.

## Risk-proportional workflow

1. **Identify the path:** changed API/DB/RIE/SFA, external integration, background job, or UI data access; list inputs, outputs, data owner, and tenant scope.
2. **Name the main failure mode:** excessive queries, RIE/PG contention, race condition, duplicate posting, stale data, data leak, incompatible migration, or unavailable dependency.
3. **Select the simplest safe design:** state a relevant trade-off (latency vs consistency, simplicity vs isolation, cost vs resilience); don't introduce an extra service, cache, queue or infrastructure without evidence.
4. **Implement and verify:** run focused tests and typechecks; add concurrency/security tests when relevant. Do not run load tests for trivial changes.
5. **Report:** `System Design Gate: PASS / WARN / BLOCK`, the important trade-off, evidence, and any remaining blocker in no more than 5 short lines.

For a narrow UI-only styling fix with no data impact, use a one-line `no architecture impact` check; the dedicated UI design skill remains authoritative for visual changes.

## Non-negotiable checks

### Tenant isolation and authorization

- Every operational read/write must be scoped to the authenticated company and resource boundary at the server/database query layer, not by client-side filtering.
- Enforce capability and operation-specific permissions and hierarchy/route/resource ownership where appropriate; default-deny on missing security metadata.
- Respect company mode: `ANALYSIS_ONLY` remains the default and keeps legacy Excel/RIE behavior. `SFA` requires explicit company activation **and** user permission. Never assume enabling the company grants user roles.
- Avoid leaking records or cross-company state through caching, background jobs, logs, error messages or bulk exports.

### Database, load, latency, availability

- Push scope/filter/join/aggregate to bounded, indexed PostgreSQL queries where practical. Avoid unbounded scans, N+1, full entity materialization, repeated per-request reads and heavy UI payloads.
- Check query plans/indexes when actual access patterns warrant it. Bound pagination and time ranges; avoid promising capacity without measurements.
- RIE is an analytical workload: preserve Result-First, query budgets, concurrency/queue controls and current business formulas unless explicitly approved. Historically RIE/PostgreSQL queue saturation occurred without high CPU/RAM; don't equate unused CPU with capacity.
- Ensure long-running analytics do not unnecessarily block short operational writes; use measured timeouts/limits and explicit error handling, not speculative infrastructure.
- Consider failure modes (dependency outage, partial write, retry, duplicate request); use observability suitable for diagnosis without logging secrets or sensitive customer data.

### SFA operational correctness

- Treat warehouse inventory, van custody, invoice posting, returns, collections and balances as **authoritative transactions**, separate from analytical projections.
- Use typed operational tables and exact decimal arithmetic for money/quantities; appropriate constraints, atomic commits and traceable stock/financial movements.
- Prevent negative or double-reserved inventory according to approved business rules, and cover concurrent posting with transactions/locking/optimistic versioning as appropriate.
- Make retried business commands idempotent (or explicitly deduplicate with unique business keys). Model posted/cancelled/reversed transitions; prefer auditable reversal over deletion of posted entries.
- Don't mix subscription `Payment` records with trade/customer collections.
- Excel onboarding/history and opening balances must not double-post invoices, stock or receivables. Preserve `ANALYSIS_ONLY` imports; do not mutate RIE canonical Excel tables as if they were transactional ledgers.
- External ERP integration is a distinct future data-source concern: avoid duplicate ingestion and ownership conflicts. Do not implement it without explicit scope.

### Safe change and migration

- Prefer additive, backwards-compatible changes; verify default paths for existing customers and API clients. Never make existing production tenants dependent on newly initialized SFA data.
- Review migrations using isolated/local test databases only unless user explicitly authorizes another environment. Make compatibility, constraints, rollback/failure paths clear.
- Do not touch Production, real databases, deployments, pushes, secrets or existing WIP/restoration points without explicit authorization. No unauthorized changes to RIE formulas or existing business logic.
- Do not introduce microservices, Redis, event buses, new cloud providers or complex sharding just because scalability is mentioned; propose only when measurements and trade-offs justify the cost.

## Tests by change type

- **Mode/security:** default ANALYSIS_ONLY; unauthorized user/company denied; isolation across two companies; resource-scope denial; legacy paths unaffected.
- **Warehouse/financial:** atomic posting, duplicate retries, concurrent writes, boundary quantity and rounding, insufficient stock, cancellation/reversal, opening-balance import behavior.
- **RIE/Excel:** unchanged formulas and import behavior; bounded reads and resource budgets; analytical/operational coexistence where relevant.
- **Migration/API:** isolated migration, backwards-compatible defaults, validation/error states and TypeScript/tests suitable for the changed files.
- **Performance-heavy change:** targeted query/load evidence only if risk justifies it; explain measured limits, don't invent throughput claims.

## Visual design relationship

When implementing a new frontend screen or substantial visual redesign, also read `.codex/skills/murshidak-ui-design-system/SKILL.md` (or the repository's current equivalent) and `docs/design/MURSHIDAK_UI_DESIGN_SYSTEM.md`. The UI skill owns appearance; this skill owns architecture, data access and operational correctness. Don't run visual checks for backend-only tasks.

## Executable evidence (existing architecture, enforced acceptance)

Use [the repository gate contract](../../../docs/engineering/ENGINEERING_RELIABILITY.md) and `pnpm quality --base <actual-review-base>` instead of inventing another checklist. Always retain the critical core; select additional SQL/AI/ERP tests by the affected contract. SQL parity/migrations run on the approved test-only PGlite runtime, never a customer database. Missing runtime, skip/TODO, timeout, failed assertion or typecheck is BLOCK, not a successful reduced run.

Before impactful releases, `pnpm quality:release` is necessary alongside Linux packaging, measured load/query evidence where relevant, and isolated recovery evidence. Unit/PGlite tests cannot establish capacity, native PostgreSQL locking, off-device backup custody or complete ERP ledger correctness. For new posting paths require atomic failure, duplicate retry/concurrent command, exact decimal/stock boundary, permission and reversal tests before readiness. For changed external calls require a bounded deadline/attempt count and mocked outage, throttling and malformed-output tests; do not impose a fallback/circuit breaker/queue without a demonstrated need.

CI's `Engineering reliability / required` reports failure automatically. Enforcing branch protection or Railway wait-for-CI is a separately authorized repository/platform setting; do not imply local files alone prevent direct deployment. Never raise RIE concurrency/budgets or change business formulas to satisfy a gate. Test selection cannot prove arbitrary SQL is bounded: retain scoped query plans, query-count/result-size budgets and parity evidence for changed paths.

## Mandatory handoff result

Report succinctly:
- `System Design Gate: PASS / WARN / BLOCK` and why.
- Most significant scalability/availability/consistency trade-off.
- Tests actually run, and outstanding risk (if any).
- If a risk is BLOCK, do not claim the change is ready or silently expand scope.
