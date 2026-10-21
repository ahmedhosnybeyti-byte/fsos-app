# WMS physical counts — local acceptance (2026-10-21)

System Design Gate: **PASS for the tested local scope**. Release/deployment approval is outside this task.

## Contract and ownership

- `/sfa/warehouse/counts` opens the authorized warehouse picker at DEMO-WH-01. The existing warehouse screen links to this page with its warehouse code. The count page requests only its own scoped data; it does not load receipt/loading/return workflows.
- `GET /sfa/wms/warehouses/:warehouse/counts[/candidates|/:id]` requires SFA/FULL_ERP, enabled `warehouse-core`, explicit `sfa.access`/`wms.read`, company scope and warehouse access. Default ANALYSIS_ONLY is unchanged. Candidates/list fetch at most 21 rows and return 20; detail is bounded to 20 lines and three events.
- `POST .../counts` and `POST .../counts/:id/cancel` additionally require `wms.count.create`; approval requires the separate `wms.count.approve`. Roles are not automatically granted permissions. All writes recheck server permissions and warehouse scope inside the transaction.
- A draft contains an immutable snapshot per existing warehouse lot: system quantity, position revision, counted quantity, unit and conversion factor. Zero is valid. Duplicate lots, invalid precision, fractional pieces and cross-resource input are rejected. Draft creation/cancellation has no stock effect.
- Approval atomically posts **one ADJUSTMENT per differing lot**, changes only that warehouse position, records approver/time/reason, writes the immutable count event and durable audit. The requested one-line Demo produces exactly one movement. Matching quantities produce no zero movement. No accounting cost/value/journal, vehicle custody update, Excel/RIE history mutation or old-ledger rewrite exists in this path.
- Existing reservations and quarantined quantities are preserved. A count below their sum is rejected; quality/reservation resolution remains with the existing authorized workflow. Positive differences on expired/blocked/quarantined lots enter quarantine. No silent release of held goods.

## Consistency and migration

`20261021200000_wms_physical_counts` is additive: four count tables, tenant/parent indexes and constraints, optional unique ledger count-line link, the new movement kind, and two ungranted capabilities. No Prisma model or generated-client change is required for these SQL-owned operational tables.

The position revision trigger increments on every update, including reservations, quality changes and quantity changes that later return to the same value (ABA). Creation and approval reject stale revisions. Locks follow product ID then lot ID, compatible with existing WMS posting locks. Same-key commands return the original result; document state/version and the unique ledger line link also prevent a fresh key from posting twice. Audit failure rolls back the entire transaction.

Trade-off: no warehouse freeze during a human count. Any intervening stock-state change requires cancelling the draft and recounting. This favors consistency over silently applying an outdated physical count. Posted documents/lines/events/movements are immutable; correction requires a new explicit count, with no editing or deletion of the old settlement.

Only this migration was applied to the verified existing synthetic Demo database on the loopback WMS cluster. No pending migration chain, Production database, push or deploy was used. Reverting application code can retain the additive schema/evidence; never roll stock back by deleting posted entries. Production migration review remains separate.

## Focused evidence

- Five isolated PGlite count tests: **5 pass, 0 failures/skips/TODOs**. Covers inert drafts, 200→197, surplus/zero/match, exact conversions, permissions/company/warehouse isolation, duplicate retries, immutable history, stale/ABA snapshots, reserved/held boundaries and audit/multi-line rollback.
- `node tools/quality/wms-count-native.cjs`: **PASS**. Independent native PostgreSQL connections prove concurrent create/approve deduplication, competing document exclusion, fresh-key duplicate protection and audit rollback. It seeds existing state directly and never replays opening or the four completed workflows.
- Focused actual HTTP checks against the new count routes: **14 PASS**, including anonymous/read-only/other-tenant denial, cross-warehouse detail denial, input validation and reapproval rejection.
- API/Web TypeScript and shared-schema compilation: **PASS**. Sandbox junction-access errors were resolved by reading the already installed dependencies outside the restricted shell; no package installation.
- UI: actual save/approve through the browser, Arabic RTL and English LTR, light/dark, desktop and 390/430/480/767 widths. Mobile shows a comparison card with all four quantities. Skeleton, empty and API error paths use shared components. No new visual language or polling.
- Per the user's explicit **focused tests only / do not retest completed workflows** instruction, `pnpm quality --base b8f6004` and `pnpm quality:postgres` were **not run**: their conservative selectors rerun earlier WMS suites and unrelated contracts. No gate selector was changed or test removed. The broad release gate, Linux builds, recovery/load suites and Production readiness are not claimed.

Ignored local evidence: `.quality/wms-count/{focused-tests.txt,native.json,http.json,demo-before.json,demo-result.json,demo-posted.png,mobile-dark-en.png}`. Preview helpers are isolated ignored processes, not application authentication routes.

## One Demo result

Reused the existing `erp_history_320dbe9beed548f4928fbf66e77c7991` synthetic database and DEMO-WH-01; no historical import/opening rerun.

| Item | Verified value |
| --- | --- |
| Product | P-001 — حليب طويل الأجل كامل الدسم 1ل×12 - نقاء |
| Reference | DEMO-COUNT-197-20261021 |
| Saved draft | System 200 cartons, counted 197, shortage 3; position still 200; zero adjustments |
| Approved | 197 cartons = 2,364 pieces |
| Ledger | Exactly one ADJUSTMENT: −3 cartons × 12 = −36 pieces |
| Audit | Creator + approver, reasons and timestamps; same-transaction durable audit |
| Preserved | Existing opening rows' original-field digest, other warehouse positions and custody equal pre-migration snapshots; historical fact-table write counters unchanged |

The nullable count-line column added to old movement rows is excluded from the pre/post digest so the comparison uses the same original-field shape. No raw historical facts were scanned for the verification.

Actual scoped Demo plans: candidate query scans 101 tiny position rows (100 in this warehouse), returns 21 to the service/20 to UI, ~7.3 KB internal rows, 2.48 ms measured query / 0.256 ms EXPLAIN execution. PostgreSQL chooses sequential scans on the tiny 100-row masters; existing tenant/warehouse and product indexes remain available. Detail uses one count, one line, two events and indexed movement/actor lookups. No full high-cardinality entity reads or Node fact aggregation; no capacity/RAM claim from this small fixture.

Local preview: `http://localhost:4438/sfa/warehouse/counts`; local test-session bootstrap: `http://localhost:4438/local-login/admin`. API is bound to `127.0.0.1:4439`, with non-loopback outbound connections blocked in both preview processes.

Commit: the local physical-count feature commit containing this document, based on `b8f6004`. No push.
