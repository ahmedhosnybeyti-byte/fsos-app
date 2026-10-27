# Demo daily policy and cache — release stopped, 2026-10-25

Follow-up: the cold failure is now reproduced and repaired **locally only** by
deduplicating one hierarchy file-metadata read. See
[the focused repair proof](RIE_DEMO_COLD_SESSION_FIX_20261025.md). Production
remains on the rollback baseline; this historical release was not retried.

The existing Smart Loading last-sale and management caches were restored locally.
Their Demo context includes Saudi read day, authenticated user, role, org scope
and sorted permissions; existing source versions/mutation timestamps and route,
company and target keys remain in use. There is no new cache or migration.
The daily SQL ceiling and latest eligible inventory snapshot rule are preserved.

Exactly seven runtime files were isolated over verified deployed API source
`747bd4ec-5cee-4949-8de1-5d24073bd763`. Manifest digest:
`f00b974faecce3279057aa1979c9e5099a37ac9d9c8f539beca29d6e6d0bfe5a`.
No web, dependency, source-data, permission or WMS change entered the package.

Pinned candidate TypeScript and 25 focused cases passed with no skips/TODOs.
Cases cover persistent cache reuse, Saudi midnight with identical request dates,
source changes, permission/user/tenant isolation, three-caller coalescing and
latest snapshot selection without treating loads as balances. Railway's Linux
Docker build succeeded. These checks did not prove the complete cold-session
request would stay inside its execution budget.

Candidate `713d3f9b-a8ed-4e60-9198-324b1c6bee31` deployed successfully with the
marker absent. Activation `44471c85-8dc2-41c6-ae47-a211e97b136c` also succeeded,
with the exact previously verified FULL_ERP Demo company marker. Readiness was
HTTP 200. The existing browser session was Sales Rep Omar Al-Dosari. Only the
Smart Loading page and recalculation were exercised; no loading command,
warehouse handover, receipt or stock edit was executed.

**Production smoke failed:** the first GET session at 14:26:58 UTC returned 500:
`RiePostgresExecutionBudgetExceededError`, exceeding the existing 24-execution
request budget. Automatic retry returned 200 and recalculations returned 201,
but a successful retry does not clear the initial failure. No budget was raised.
The exact additional execution cause has not been established; do not claim the
cache tests establish complete cold-start reliability.

Following the user's explicit rollback instruction, the marker was cleared
(empty string is disabled by the existing trimmed truthy check) and rollback
deployment `11fcdcd7-ec71-4b9c-bb11-7505c5b87b5b` was started from baseline
`747bd4ec-5cee-4949-8de1-5d24073bd763`. Final rollback verification is recorded
in `.quality/demo-daily-cache-release-20261025/production-result.json`.
Read-only before/after fingerprints matched all 100 Demo WMS positions and its
one custody position. Normal derived cache writes are distinct from source or
operational ledger writes. No data restore or migration is needed.

System Design Gate: BLOCK for release until the first-session failure has a
focused reproduction and fix. Scalability Gate: BLOCK for the observed critical
request-budget failure. Earlier local capacity evidence remains WARN: synthetic
11,000 rows, actual serial concurrency 1, one SQL/parent scan for 1/20/100 keys;
no native API p95 or 150-user capacity proof. Three coalesced test callers are
not a capacity test. No broad suite/load test was repeated.

The known data limitation remains: Demo inventory snapshots are periodic. On
Oct 25 the latest eligible snapshot is Sep 30; Oct 31 cannot appear early.
The code is uncommitted, with unrelated work preserved. A later release must
reproduce a complete cold session under unchanged request budgets before retry.
