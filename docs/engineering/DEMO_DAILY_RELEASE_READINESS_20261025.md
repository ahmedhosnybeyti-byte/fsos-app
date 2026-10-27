# Demo daily RIE — isolated release review

Superseded status: cache repair and Linux build passed, but Production activation
exposed a cold-session request-budget failure and triggered rollback. See
[the release incident](RIE_DEMO_DAILY_CACHE_RELEASE_20261025.md). This earlier
read-only review is retained as evidence, not current release approval.

2026-10-25. **Prepared for review, not finally cleared for Production release.**
No deployment, environment-variable edit, import, migration, balance adjustment,
permission change or Production write occurred during this review.

## Exact release boundary

- Verified current Railway API deployment: `747bd4ec-5cee-4949-8de1-5d24073bd763`,
  SUCCESS, service `@workspace/api-server`, Production. No staged service changes.
  This is newer than the handover release and is the correct rollback/source base.
- All 599 files of its retained `rie-api-release-20261025` source matched the
  deployment manifest before making the candidate. The existing deployed product
  metadata work is preserved; unrelated working-tree changes are excluded.
- Candidate: `.quality/demo-daily-release-20261025/candidate/`, 600 files,
  **seven runtime changes only**: central Demo policy plus its six existing
  RIE/Smart Loading integration files. Zero web, migration or dependency changes.
- Review: `.quality/demo-daily-release-20261025/runtime.patch`; exact file hashes
  and all-file manifest in `candidate.json` / `manifest.json` in that directory.
- Archive: `.quality/demo-daily-release-20261025/candidate.tar.gz`, SHA-256
  `022a436b5c9c70d7ee6b930c4bc6dc1748f052a5519ac93b7e31a53af4bc5f87`.
  Manifest digest: `58673ffd260e8078652937d7342084b02269dc2241a60f64f025b4103a89c47d`.
  No environment files, operating-data receipts or local validation hooks enter
  the release. Two new tests are stored separately for review.

## Real Demo data — read-only verification

The PostgreSQL session reported `transaction_read_only=on`. Identity matched:

- Company `cmri8nwt1000tegks6tesnwkv`, **Acme Field Sales**, ACTIVE / FULL_ERP.
- Existing active warehouse **SA-DEMO**, ID
  `ce373267-f88f-48ee-b8cc-d7003a9dd879`.
- 16 real routes, 100 products, 1,600 customers. Customer routes all resolve to
  existing route masters; eight branch IDs each cover two routes/200 customers.
  Saturday has 256 customers across the 16 routes.

| Canonical entity | Rows | Stored date coverage |
| --- | ---: | --- |
| Van Inventory | 13,393 | 2025-01-31 → 2026-12-31 |
| Van Loads | 35,181 | 2025-01-05 → 2026-12-31 |
| Invoices | 79,539 | 2024-12-31 → 2026-12-30 |
| Invoice Items | 382,522 | Parent invoice date |
| Visits | 122,692 | 2024-12-31 → 2026-12-30 |
| Collections | 49,425 | 2025-01-08 → 2026-12-30 |
| Returns / Return Items | 201 / 422 | Headers through 2026-12-23 |

**Important data limitation:** inventory snapshots are periodic/monthly, not
daily. On the checked Saudi day **2026-10-25**, the last eligible snapshot for
all 16 routes is **2026-09-30**. It has 368 positions / 100 products, 14,422
cartons in total, with no invalid quantity in that selected set. There are only
three later snapshot days through Dec 31; the next is Oct 31 (361 positions).

Therefore the daily date ceiling is implementable, but these data cannot show a
new measured vehicle balance every day. The approved rule uses the last recorded
snapshot. Loads must not fill those gaps. Daily sales/visits and the future
snapshot rows exist, but their actual entity dates differ; do not promise that
every entity has records on Dec 31. The invoice/visit dates are stored as ISO
timestamps (extremes end in `T20:59:08.000Z`); inventory/load dates are date-only.
These stored-date observations were not corrected, rounded or re-imported.

Private aggregate receipts: `production-preflight.json` / `date-format-check.json`
in `.quality/demo-daily-release-20261025/`. No customer names/emails or raw fact
datasets were copied into the release or test fixtures.

## Production configuration — inspected, unchanged

The Railway connector reports the API's variable names, including sealed names;
`RIE_DEMO_CANONICAL_COMPANY_ID` is **absent**, not merely unreadable/sealed.
Without it, publishing the code alone leaves the daily Demo policy disabled.

After explicit owner approval, activation would set **only this API service in
Production** to `RIE_DEMO_CANONICAL_COMPANY_ID=cmri8nwt1000tegks6tesnwkv`.
Do not set it environment-wide or on the web service. The database mode check is
also required and was verified FULL_ERP. The local marker is not copied into the
upload. `railway-readonly.json` records the observation; no setting was staged.

Other tenants receive no policy predicate. ANALYSIS_ONLY/SFA/default modes keep
their existing results even if an operator were to point the marker at them;
synthetic isolation/mode cases passed. No shared role or warehouse grants change.

## Cache/performance review

The current candidate **still bypasses persistent result caches for active Demo**;
this review did not restore cache writes or introduce another cache. Other
companies/modes retain their existing cache path. This avoids stale/future result
reuse and writes, but recomputes the last-sale/management aggregates on repeated
requests. It is a real cost, not a necessary consequence of calendar filtering.
Retaining the existing cache with a daily/source/policy key is a possible later
adjustment, outside this prepare-only review.

Six actual read-only probes covered one real route (`rt-12`, 100 customers),
one serial sample per query/variant, 12-second statement timeouts. The complete
small result was consumed but only row/byte counts were retained:

| Query | Marker off | Daily Demo policy on |
| --- | ---: | ---: |
| Inventory | 2,139 ms | 2,025 ms |
| Net sales | 2,629 ms | 2,394 ms |
| Management bundle | 7,695 ms | 3,246 ms |

These are **psql process/connection/network/query round trips**, not pure SQL,
API p95, full-session time or cache-hit timing. The later probes can benefit from
warming. They establish that the scoped queries completed within the bound, not
a speedup, non-regression or concurrent-user capacity. No EXPLAIN ANALYZE or load
test was run against Production. Source row counts above explain why repeating
uncached queries is material. `read-probes.json` retains the sanitized numbers.

## Isolated verification and remaining release gates

- Candidate-only module resolution (including pinned shared-package source)
  passed the **16 Demo cases**, zero skips/failures. No need to repeat the prior
  44 + 33 + 103 suites for this unchanged runtime delta.
- Candidate-only API/shared-source TypeScript check **PASS**. Initial temporary
  validation attempts lacked dependency paths / had a loader fallback recursion;
  the local harness was corrected, then passed. Candidate runtime was unchanged.
- Runtime diff reviewed: all seven deltas implement this policy; the release
  manifest was generated before validation and remains separate from its hooks.
- **Linux Docker image build is not verified locally:** installed Docker cannot
  connect to `dockerDesktopLinuxEngine`. No new infrastructure was installed or
  started. The current baseline has a successful Railway Linux image, but that
  does not verify this candidate's image. No full/release gate is claimed passed.
- Existing startup, Dockerfile, dependencies, Prisma schema and separate migration
  behavior remain exactly as the live base. There is no migration to run.

System Design Gate: **PASS for the isolated functional/security delta**.
Release readiness: **BLOCK / not finally approved** until Linux packaging and
the authorized activation/smoke sequence can be verified. The missing marker is
an explicit approval-dependent activation step, not a reason to edit Production
now. Monthly snapshots are a data/expectation limitation, not a code failure of
the last-snapshot rule.

Scalability Gate: **WARN**. Local synthetic evidence: 1,000 headers + 10,000
items, concurrency one, one SQL at 1/20/100 keys and one parent scan. Actual
Production observations above: route-scoped serial reads only, one sample each.
API p95, RIE queue/pool/lock waits and mixed concurrent capacity are unverified;
no approved baseline/SLO or 150-user claim. The bottleneck is not isolated from
connection/network time. Cache-bypass concurrency remains an explicit risk.

## Approval-dependent publish and rollback plan — not executed

1. Preserve the current live deployment ID and the absent marker as the rollback
   state. Recheck both immediately before release to avoid overwriting later work.
2. Verify the candidate Linux image from this archive. Deploy only the isolated
   API source after approval; no web deploy, import or migration.
3. Activate the single service-level marker only after approval, preserving all
   other settings. Verify readiness plus one authenticated Demo session and
   recalculation: tomorrow target, data ceiling today, last eligible snapshot.
   A non-Demo/Analysis scoped smoke must retain its old behavior. No WMS command.
4. On failure, roll back the API to
   `747bd4ec-5cee-4949-8de1-5d24073bd763` and restore the marker's original absent
   state. Both rollback actions require the release authorization. No database
   restore or stock reversal is needed because this release has no data writes
   or schema migration. Verify readiness and the original Demo behavior.
