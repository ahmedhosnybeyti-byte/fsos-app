# Accounting Core — Phase 2 (local, 2026-10-21)

- Parent: `72d3791`. Reuses the Phase 1 chart, posting/reversal functions,
  periods, general ledger and trial balance. No previous suites rerun.
- Adds company-scoped customers/suppliers, dedicated existing chart accounts,
  explicit openings, approved receipt/payment vouchers and cash/bank registration.
  Each party has one unused matching GL account (asset AR, liability AP).
- The GL is the only balance authority. A voucher, its two exact journal lines,
  command deduplication and audit commit together. Corrections use linked reversal.
  Generic GL commands cannot bypass the managed party account/voucher boundary.
- Openings have `EXPLICIT_OPENING` provenance and one-per-party uniqueness.
  No historical invoices, Canonical or WMS are read or reposted as debt.
- Existing Full ERP/company-screen admission remains; new AR/AP/read/post/opening/
  treasury capabilities require explicit grants. Migration adds the catalogue only.
- PostgreSQL locks the existing book before balance/reference checks and posting.
  Duplicate retries/business references, overpayment, insufficient funds, invalid
  types, backdating and closed periods fail atomically. Writes serialize per company;
  this favors financial consistency over parallel posting within one book.
- Query contract: tenant → party/account scope → SQL aggregation; lists/statements
  return at most 20 rows (+1 lookahead). Party and treasury balances aggregate only
  accounts selected for the page. Added scoped line and statement indexes.
- Verified: 8 new focused checks (0 failures/skips), native independent-connection
  duplicate/overpayment/reversal races and audit rollback; browser examples, 8
  theme/locale/viewport combinations, mobile/keyboard/loading/error/retry states;
  API/web/database typechecks and Prisma validation. Evidence: local
  `.quality/accounting/phase2-{focused.log,native.json,browser.json,ui-states.json}`.
- Existing local Demo: C-DEMO `1000 − 300 = 700` (DR cash 300 / CR AR 300);
  S-DEMO `1000 − 300 = 700` (DR AP 300 / CR cash 300). Both journals are visible
  from their account statements; the existing trial reports matching balances.
- Preview retained at `http://localhost:4368/local-login/admin`, then
  `/sfa/accounting/receivables`, `/payables`, `/treasury` under the accounting route.
- System Design Gate: WARN — new financial contracts pass; the broad quality/SQL
  selectors would rerun previous phases and were excluded by the explicit task scope.
  This is local feature evidence, not production/release approval.
- No tax invoices, purchases, bank integration, AI, new dependency, push, deploy,
  or Production migration. Existing unrelated work remains outside this commit.
