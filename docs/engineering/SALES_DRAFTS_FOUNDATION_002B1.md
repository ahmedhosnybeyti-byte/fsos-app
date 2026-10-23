# Sales drafts — Foundation 002-B1 (local only, 2026-10-22)

Review base: `f482d9bde14b94e3619e221d61a416b145874ca6`. Foundation 001/002-A
and unrelated local work remain in place. This slice stops at read-only checks.

## Design contract (before implementation)

Owner: the authenticated company/SALES_REP/visit/customer and saved draft revision.
Reuse the existing explicit draft permissions, current RIE customer authorization,
warehouse access and repeatable-read check transaction. No new write, migration,
dependency, polling, operational approval setting or financial permission.

The check response retains 002-A fields and adds draft identity/version/warehouse,
`nonbinding: true`, `approvalAllowed: false`, explicit commercial blockers, and
per-line unit/warehouse/custody states: AVAILABLE, UNAVAILABLE, NEEDS_REVIEW.
The UI must reject displaying a result for another saved revision; local dirty
content remains protected from reconnect refresh. A check is an observation, never
an approval token or a promise of availability at later approval/delivery.

Query order: existing RIE current-only company/hierarchy/customer authorization;
then company/rep/visit/draft; at most 20 saved lines; selected company products,
warehouse positions and own custody; quality/expiry/customer shelf-life filters;
one SQL aggregate per stock/custody source; at most 20 prepared result rows.
Add eligible-lot counts and nearest eligible expiry to those same aggregates,
not another lot query or Node aggregation. No per-line HTTP/Prisma loops.

## Established sources and deliberate blockers

Read both 002-A reports and the original inspection in chat
`فحص تأسيس فواتير المبيعات` (`01a16196-f8ae-7780-bd27-f09a1cf2646d`,
initial turn `01a16197-1a59-7bd0-86a5-59b7c4b31294`). This is a continuation,
not a new whole-project audit.

- Canonical Customers has DefaultPriceListCode, PaymentTerms and CreditLimit;
  Price List has ProductCode, Unit, StartDate, EndDate, Status, prices/VAT/currency.
  Import validation is not operational approval. The analytical latest-start-date
  precedence in RIE is not an approved invoicing conflict policy.
- No verified operational price approval/version owner, overlapping-price priority,
  customer override priority, invoice effective date/timezone, cross-source UOM
  mapping acceptance or monetary rounding/tax/discount contract exists. B1 must
  therefore return REQUIRES_SETUP for every price, including apparently unique,
  multiple, historic, future and different-unit imported prices. It must not read
  candidate amounts and imply that a diagnostic candidate is an approved price.
  Actual candidate conflict resolution is blocked; no latest/lowest/first fallback.
- WMS typed products/conversion, inventory view, batches, quality and own custody
  are usable for a preliminary check. Reuse wms_min_days, including its existing
  zero-day default; expose the applied minimum rather than invent a new policy.
  Missing positions are unknown. Warehouse and custody remain separate sources;
  B1 has no approved sale-source/delivery selection. No stock is reserved/consumed.
- GL is authoritative for balances, but AccountingParty.code is not an explicit
  approved canonical-customer link; imported CreditLimit/PaymentTerms lack approval,
  currency/effective policy/exposure/overdue/override rules. Draft totals are absent.
  B1 returns credit REQUIRES_SETUP even with an existing GL balance and imported
  limit. It does not expose accounting details through rep permissions or infer cash.

## Delivered and verified

- Additive API response, no schema migration. The check transaction explicitly
  sets READ ONLY and a 10-second statement deadline. The existing repeatable-read
  snapshot, current permission/mode/hierarchy/warehouse checks and draft write
  replay/version/audit behavior remain in place.
- Per-line exact WMS unit validation, independent warehouse/custody availability
  states, applied shelf-life days, positive eligible-lot counts and nearest eligible
  dated expiry. Inactive/changed product definitions require review for both sources;
  missing balances remain unknown, never a passing zero. Quantities stay exact SQL
  numerics; Node neither compares rounded quantities nor aggregates lot datasets.
- Price and credit have explicit NEEDS_REVIEW / REQUIRES_SETUP results and named
  blockers, even when quantity checks pass. Per-line pricing remains unapproved;
  `approvalAllowed` is always false. Tax/discount/totals are still unset. This slice
  does **not** deliver an approved operational price or credit evaluator: the source
  approval and business decisions required for either are still absent.
- UI displays the checked saved revision/time, distinguishes preliminary availability
  from future approval, and suppresses a result for a different draft/revision/warehouse.
  Dirty local content already hides checks. Explicit saved-content reload and disabled
  detail reconnect/focus refresh remain unchanged; no polling or offline write queue.

Actual checks:

1. Isolated SQL B1 cases: exact carton/piece boundary, six-decimal weight, warehouse
   coverage with insufficient own custody, no-balance ambiguity, near-expiry exclusion
   and inclusion at the existing 2/3-day policy boundary, eligible-lot evidence,
   packaging-change rejection by WMS, inactive-product review, unchanged snapshots,
   existing GL with credit still requiring setup, and no check-created commands/audit.
   Existing 002-A SQL parity/security/replay/rollback/visit-close cases also pass.
2. Actual Nest/auth/RIE/Prisma HTTP on a disposable clone of the retained synthetic
   fixture: two overlapping Piece prices, a Carton price, unsupported Pack price,
   a future price, imported limit 100000 and pre-existing nonzero GL. Price/credit
   stay unapproved; a 30-carton request has sufficient warehouse stock but insufficient
   own custody. This tests refusal to promote unapproved data, **not** implementation
   of an approved price precedence/effective-date engine. No imported amount is used.
3. Exact before/after digests for 19 protected WMS/custody/allocation/policy/accounting/
   canonical/version/file tables match after the actual HTTP sequence. SQL cases
   also compare draft/header/command/audit and protected ledgers around repeated checks.
   Only intentional synthetic fixture setup and draft commands occur outside checks.
4. Rendered regression cases cover distinct availability, setup blockers and rejecting
   stale identity/version/warehouse results. Actual browser uses the saved completed
   002-A visit and real B1 API response; completed content remains read-only. Arabic RTL
   and English LTR × light/dark × 1440/767/480/430/390 = 20 result-present layout checks,
   no horizontal overflow; retained screenshots were visually inspected. No new offline
   emulation was run: 002-A reconnect evidence is retained, and its editor behavior is
   unchanged. Loading/error/permission cases remain covered by the regression suites.

Commands: `pnpm quality --base f482d9bde14b94e3619e221d61a416b145874ca6`,
`pnpm quality:postgres`,
`node tools/quality/sales-drafts-performance.cjs --foundation-b1`.
The installed pnpm was used with `npm_config_manage_package_manager_versions=false`
to prevent automatic manager installation. No dependency was added.

Changed gate: 621 passing checks / 141 suites, four passing API/database/schemas/web
typechecks; independent SQL gate: 167 passing checks / 29 suites. Zero failures,
skips, TODOs or cancellations. Node 24.18 is the existing local runtime, not Node 22
release parity. No Docker/Linux packaging or release gate was run for this local slice.

Evidence: `.quality/{changed,postgres}.json`,
`.quality/sales-drafts/{b1-performance,b1-browser}.json`,
`b1-quality-final.log`, `b1-postgres.log`, `screenshots/b1-*`.
The performance JSON retains before/after digests; runtime secrets are not published.
See [the B1 Scalability Gate](SALES_DRAFTS_SCALABILITY_GATE_002B1.md).

## Required decisions before Foundation 002-B2

| Blocker | Required authoritative decision/data |
| --- | --- |
| P1 price ownership | Operational approval owner, tenant/customer price-list assignment and immutable policy/source version; imported/current-only data alone is insufficient. |
| P2 price conflicts | Overlap/override priority and explicit conflict outcomes. Do not inherit analytical latest-start-date precedence. |
| P3 product/unit/date | Accepted ERP/WMS product and price-UOM mapping, treatment of cartons/packs, pricing date/timezone and validity boundaries. Do not infer a carton price. |
| P4 monetary contract | Currency, tax, discount/free goods and exact rounding policy before reliable draft monetary exposure. |
| C1 accounting link | Approved canonical-customer → AccountingParty identity, balance ownership/freshness and rep-safe authorization contract. Matching codes are not approval. |
| C2 credit policy | Approved effective limits/currency/terms, outstanding/reserved exposure, overdue rules and exception authority; do not infer cash/credit from channel. |
| S1 delivery/source | Explicit warehouse versus own-custody delivery source and target date/customer shelf-life acceptance, including the existing WMS zero-day default. Revalidate at any future approval; do not count both sources together. |
| Q1 scale evidence | Representative scoped query plans/statistics/skew, mixed RIE contention and recovery evidence before any capacity/release claim. No large load was run in B1. |

**System Design Gate: WARN.** Authorized B1 functional/security/SQL/type gates pass;
operational price/credit decisions remain blocked and representative scale is unproved.
**Scalability Gate: WARN.** Bounded serial evidence passes with explicit fixture
statistics; stale-statistics robustness and representative shared load remain open.
Trade-off: fresh scoped, read-only observations with explicit missing approval over
cached/offline business clearance. B2 must resolve its applicable blockers first.

No invoice approval/posting, fiscal document/number, GL/AR mutation, collection,
custody deduction, reservation, stock movement or ZATCA path was introduced.
No operating DB, Production, Railway, Docker, push or deployment was used. Existing
Foundation 001/002-A and unrelated WIP remain uncommitted and preserved.
