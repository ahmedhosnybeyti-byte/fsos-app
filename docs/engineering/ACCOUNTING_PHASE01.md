# Accounting Core — Phase 1 (local, 2026-10-21)

- Base: `41261a01f6ca89ed4d80169b097057e40cdc526b`; local work only.
- Scope: immutable minimal chart; balanced SAR manual GL; company/reference and
  command deduplication; exact reversal; atomic reversal + replacement correction;
  reason/actor/source history; inclusive closed-through cutoff; as-of trial balance.
- Admission: existing company-screen and SFA guards, FULL_ERP checked from DB,
  active same-company admin/manager, explicit read/manage/post/reverse/close grants.
  Correction requires both post and reverse. No automatic tenant or role activation.
- Consistency: short per-book PostgreSQL lock serializes posting/reversal/closure;
  deferred balance constraints and immutable posted rows protect alternate writers.
  Durable audit shares the financial transaction. This favors correctness over
  parallel writes within one company at this stage; no throughput claim.
- Query contract: company/date scope before journal-line join; aggregate once in
  PostgreSQL; 20 accounts/journals/trial rows per page, at most 100 detail lines.
  Trial totals cover the entire company, independent of page/search.
- Demo query evidence: indexed 5 journals / 10 lines → 3 trial rows, about 4.3 ms
  service query on the isolated native test fixture; see local native JSON plan.
- Verification evidence: `.quality/accounting/focused.log`, `native.json`,
  `browser.json`, typecheck logs and screenshots. No customer database was used.
- Results: 27 focused checks, 19 HTTP assertions, independent-connection native
  races and audit rollback, 8 browser theme/locale/viewport combinations, loading/
  empty/error/retry/focus states, API/web/database typechecks and Prisma validation PASS.
- Test scope follows the explicit task instruction: focused accounting, financial
  constraints and permission checks; no WMS/Canonical rerun. The broad
  `pnpm quality --base 41261a01f6ca89ed4d80169b097057e40cdc526b` and
  `pnpm quality:postgres` selectors include those excluded suites and were not run.
  This is local feature evidence, not full engineering/release approval.
- System Design Gate: WARN — focused financial acceptance passes; broader
  integration regression risk remains outside the user-authorized test scope.
- No invoices, purchasing, collections, costing, opening import, new dependency,
  Google Sheets write, push, deploy, or Production migration.
- Phase boundary: flat chart, SAR only, no account editing/deletion, no approval
  workflow or financial statements beyond trial balance. Broader accounting and
  accountant review remain future work; the reference does not expand this task.

Reference: [financial priorities and accounting foundations](https://docs.google.com/spreadsheets/d/1Ld5-KMVUUZ6FuZR1gvjcGSLTBYk8jtFOfpDq7VLo69w/edit).
