# Murshidak Data Access Architecture

These are permanent architecture rules for the project and are not specific to any individual screen.

## Official working folder

Run Murshidak work only from `D:\Field Sales OS`. If the current workspace path differs, stop before taking action.

## Persistent engineering memory

Before making performance-sensitive backend, data-query, or scalability changes, read:

- `docs/engineering/PERFORMANCE_GUARDRAILS.md`
- `docs/engineering/RESOLVED_ISSUES.md`

Keep the following rules in every implementation: PostgreSQL is the runtime source of truth; apply Company / Manager / Supervisor / Sales Rep / Route / Date scope as early as possible; let PostgreSQL perform heavy filtering, joins, and aggregation; and return small prepared results to Node/UI. Do not load large datasets for Node-side filter/map/reduce/join work, unnecessarily materialize `source.*` or full JSON rows, or repeatedly scan a large fact within one request. Murshidak primarily uses D-1 / Snapshot data, not live field data.

Performance work must preserve business logic, permissions, hierarchy scope, newest-wins semantics, response shape, and UX. Do not introduce needless polling or recalculation, and do not treat higher RIE concurrency as the default performance fix. New screens and features must be designed for performance and scalability from the outset. Do not reopen a resolved issue without new measured evidence.

After an important verified engineering fix, update `RESOLVED_ISSUES.md` with the symptom, root cause, fix, commit, and regression-prevention rule.

1. **Excel is an ingestion gateway only.** After upload:
   - New → Insert
   - Changed → Update
   - Identical → Ignore
   PostgreSQL is the source of truth for operations.

2. **No new screen requests a full entity.** Each screen requests only the data it needs, scoped by:
   Company / Date / Region / Route / Rep / Customer / Product / KPI.

3. **RIE is the access gateway** for large operational and analytical data.

4. **Default query order:**
   Active Version
   → Company/Entity Scope
   → Geographic/Hierarchy Scope
   → Date/other filters
   → Joins
   → Aggregation
   → Sort/Pagination
   → Small Result

5. **Apply geographic filters** such as Region/City before fact joins whenever possible.

6. **PostgreSQL performs:** Filtering / Joins / DISTINCT / Aggregation / Sort / Pagination.

7. **Forbidden for high-cardinality entities:**
   - Full Reads
   - Loading raw fact datasets into Node
   - Pagination loops followed by aggregation across pages
   - Large JavaScript filter/map/reduce/join/Set aggregation

8. **Node receives Small Result only**, except for a documented and explicitly justified case.

9. **Performance improvements must not change business logic or results.** Data Parity is mandatory.

10. **For every new screen or analytical endpoint:** design the RIE/PostgreSQL query contract first, then build the UI/service above it.

11. **Before approving any new implementation, review:**
    - rows scanned → returned
    - response time
    - RAM impact when applicable
    - absence of dangerous Full Reads


## Murshidak mandatory engineering gates

- Permanent UI rule: every new or updated Murshidak screen must use the existing design-system components/tokens and `TranslationProvider` dictionary keys from the start. All UI copy, states, validation and accessibility labels must support Arabic/English, RTL/LTR, Light/Dark and mobile. Do not introduce local bilingual selector functions, hard-coded single-language labels, independent colors/CSS or a parallel translation system. Visual corrections must not alter inventory/accounting logic or database behavior; validate only affected interfaces unless functional work is separately authorized.

- Before substantive changes to backend, APIs, PostgreSQL/Prisma, RIE, integrations, ERP/SFA operations, or frontend data-fetching paths, use the `murshidak-system-design` skill at `.agents/skills/murshidak-system-design/SKILL.md`. Apply a proportional, evidence-based review and report `System Design Gate: PASS / WARN / BLOCK`.
- For new frontend screens or substantial visual changes, ALSO use `.codex/skills/murshidak-ui-design-system/SKILL.md` and `docs/design/MURSHIDAK_UI_DESIGN_SYSTEM.md`; do not replace or bypass their approved visual system.
- For a trivial UI text/style-only or documentation change with no architectural impact, the system-design gate can be a one-line no-impact check. Avoid unnecessary extra tool calls and tests.
- Respect existing company isolation, default `ANALYSIS_ONLY`, explicit `SFA` permissions, unchanged Excel/RIE behavior, and production/deployment restrictions. Do not override existing repository-specific instructions; resolve conflicts explicitly.

### Executable acceptance gates

- Run `pnpm quality --base <review-base>` before considering a change ready. It always runs the critical security/admission/recovery core and selects broader tests/typechecks for affected code. Use the actual PR/release base, not just HEAD when reviewing committed changes. Documentation-only changes do not require load tests.
- DB/Prisma/RIE/data-access changes require the isolated SQL suites (`pnpm quality:postgres`); AI/integration and ERP changes require their failure/authorization/transaction regressions. The selector is conservative, not a substitute for identifying affected contracts. Add focused tests for new failure modes; never use path classification to waive a required check.
- Before an impactful release run `pnpm quality:release`, verify the existing Linux Docker builds, and provide the relevant performance/recovery evidence in [ENGINEERING_RELIABILITY.md](docs/engineering/ENGINEERING_RELIABILITY.md). A passing regression command alone is not release approval.
- Critical failures, missing test runtimes, skips, TODOs, timeouts and failed typechecks mean **BLOCK**. Do not mark a release ready, remove a test or raise a budget to conceal failure. `WARN` must identify an uncovered risk; it cannot waive a critical failure.
- GitHub Actions `Engineering reliability / required` is the required review check. Branch protection and Railway deployment gating are external settings: do not claim they are enabled without verification/authorization. Keep current Railway/Docker startup and separate migration behavior intact.
- No new infrastructure or dependencies without approval. PGlite 0.5.8 is approved for isolated tests only in `packages/quality-gates`; API/web must not depend on that workspace. No Production/customer data, network services, pushes, deployments or Production migrations are authorized by these commands.
