# Murshidak Data Access Architecture

These are permanent architecture rules for the project and are not specific to any individual screen.

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
