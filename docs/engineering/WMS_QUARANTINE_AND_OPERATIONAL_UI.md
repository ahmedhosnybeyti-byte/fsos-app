# WMS quarantine/disposal and operational UI — local handoff

Date: 2026-10-21. Base: `9e00f44`. No push, deployment or Production migration.

**System Design Gate: PASS for the tested local scope.** No Production/release-readiness claim. The separately requested visual correction changes presentation/i18n only; all new database behavior belongs to the explicitly authorized quarantine feature.

## Quarantine contract

Inside the existing warehouse screen, an authorized user selects an existing product/lot, quantity/unit, unique reference and reason. HOLD immediately moves **unreserved, unquarantined physical stock** into quarantine, without reducing physical stock. Loading reservations are a separate balance. Quarantine is already excluded by the existing WMS availability/FEFO read contract.

`/sfa/wms/warehouses/:warehouse/quarantines` supplies candidates, paginated documents, document detail and paginated events. Every read is company/warehouse scoped and requires existing SFA access, explicit `wms.read`, enabled warehouse screen and warehouse assignment (or company administrator). Default ANALYSIS_ONLY and old Excel/RIE behavior remain unchanged.

Three separate, ungranted capabilities:

- `wms.quarantine.hold`: quarantine free physical quantity.
- `wms.quarantine.release`: approve release of inspected sound quantity from its original document.
- `wms.quarantine.writeoff`: explicitly approve permanent physical write-off from that document.

The UI requires an explicit confirmation for release/write-off. Each decision records its quantity, original unit/factor, reason, actor, time and linked immutable ledger entry. OPEN → PARTIAL → CLOSED reflects the source document's remaining quantity; one document can have multiple authorized partial decisions.

HOLD/RELEASE ledger entries have physical delta **zero** and an explicit quarantine delta. WRITE_OFF alone appends a negative physical delta, once per approved event. It also removes that amount from quarantine. No financial amount, estimated cost, journal, vehicle custody or historical data write exists in this path.

## Consistency and coexistence

The additive migration `20261021210000_wms_quarantine` adds typed documents/events/commands, tenant indexes, a unique movement-event link, movement kinds, and `quality_held` **within** the existing `quarantined` total. It does not add an extra deduction. No role grants, company activation or existing-balance backfill occurs in the migration.

`quality_held <= quarantined` and a named guard prevent unrelated generic quarantine consumers from consuming stock owned by these new documents. Existing receipts/returns/counts/loading algorithms were not rewritten. Their authorized operations can still use unowned balances; source-owned quarantines must be resolved through their own document.

Commands lock product → lot → position (with document/version locking for decisions), validate exact decimal/UOM and source remainder, and atomically save counters, stock, immutable event/movement, command result and durable audit. Retries return the original result; new-key decisions using an old version fail. Competing release/disposal cannot spend the same hold twice. Audit failure rolls everything back.

Release rechecks active product, expiry, lot quarantine and warehouse quality block under locks. It never bypasses quality restrictions. Disposal remains possible for an inactive or expired product. Releasing a hold is its auditable inverse; posted write-offs are immutable and have no deletion/edit/reversal shortcut. No new infrastructure or dependency.

Trade-off: stricter source ownership and version checking require refreshing after a concurrent decision and using the original hold document. This favors traceable, consistent quantities over implicit release from a shared pool.

## One existing Demo scenario

Reused DEMO-WH-01 in the existing synthetic `erp_history_320dbe9beed548f4928fbf66e77c7991` database on the verified loopback WMS cluster. Only the new quarantine migration was applied. No opening, historical import, count or completed workflow was replayed.

Product **P-002**, carton factor 12, reference **DEMO-QUALITY-10-6-4**:

| Stage | Physical cartons | Available cartons | Quarantined cartons | Write-off entries |
| --- | ---: | ---: | ---: | ---: |
| Existing stock | 200 | 200 | 0 | 0 |
| HOLD 10 | 200 | 190 | 10 | 0 |
| RELEASE 6 | 200 | 196 | 4 | 0 |
| WRITE_OFF 4 | 196 | 196 | 0 | 1 |

The full cycle was performed through the real browser UI with actual API and native PostgreSQL. Final physical deduction is **−48 pieces = −4 cartons**, once. Three immutable events and three durable audits record hold/release/disposal. The old ledger checksum (including the earlier P-001 count movement), custody snapshot and historical fact-table write counters match their baseline. The newly added nullable event-link column is excluded only to compare the same old-row shape.

## Focused validation

- New quarantine PGlite suite only: **4 passed; zero failures/skips/TODOs**. Includes 200/10/6/4, scoped permissions, duplicate/conflicting commands, exact fractional carton conversion, fractional-piece rejection, unowned/reserved boundaries, source ownership, expired/inactive/blocked release denial and audit rollback for all three commands.
- `node tools/quality/wms-quarantine-native.cjs`: **PASS**. Separate native connections prove duplicate hold/disposal has one effect, competing release/disposal has one winner, stale fresh-key replay fails and audit failure rolls all effects back. Existing state is seeded directly; no previous scenario is tested.
- New quarantine HTTP checks: **13 PASS**, covering anonymous/reader/other-company denials, cross-warehouse document access, validation, final state/events and rejected re-disposal.
- API and Web TypeScript/shared-schema compilation: **PASS**. `git diff --check`: PASS.
- New queries return at most 21 rows to the service/20 to UI; detail/event history remain bounded. Actual Demo capture: candidate result 21 rows/6,524 bytes (~14.2 ms observed), one document ~651 bytes, three events ~861 bytes. Exact PostgreSQL plans are retained in `.quality/wms-quarantine/query-plans.json`. No high-cardinality fact read, Node fact aggregation, load/capacity/RAM claim or polling.
- Per explicit user instruction, broad `pnpm quality --base 9e00f44`, `quality:postgres`, old count/four-operation/accounting suites, release/load/recovery and Linux deployment checks were **not run**. Their selectors rerun completed workflows. No selector/test/budget was modified to hide a failure. This is local focused acceptance, not release approval.

## Focused UI correction

Reference: existing Team Performance implementation and `MURSHIDAK_UI_DESIGN_SYSTEM.md`. Shared AppShell atmosphere, Cairo, semantic tokens, Card/Button/Input/Table/Select/Dialog/Badge/Skeleton and existing focus/disabled states are retained. No global palette/CSS/dependency or new visual system.

Replaced inline language-selector functions and literal translation tuples in the recent WMS/accounting components with **typed existing TranslationProvider dictionary keys**. `operational-messages.ts` is a message collection merged into the existing dictionaries, not another translation mechanism. Arabic/English parity: **619 keys in each**, no empty entries. Shared close/menu/theme/search-result accessibility text also uses the existing dictionary. Source-entered product/account/user names, reasons and document references retain their authored language; no operational source text was rewritten.

Select roots receive locale direction; selected-item positioning uses logical spacing. Dialog header/close position follow RTL/LTR, the close target is 44×44, and the close label is translated. Workflow arrows and timestamps follow the selected locale. Currency labels are localized without changing any amounts or formulas. The permanent from-the-start rule is saved in `AGENTS.md`.

Affected route mapping:

| Route | Existing component |
| --- | --- |
| `/sfa/warehouse` | `warehouse-screen`, operations/returns/editors, new quarantine panel |
| `/sfa/warehouse/counts` | `physical-count-screen`, `count-panel` — visual review only |
| `/sfa/accounting` | `accounting-screen`: chart, general ledger, trial balance and form |
| `/sfa/accounting/receivables` | `party-screen` CUSTOMER |
| `/sfa/accounting/payables` | `party-screen` SUPPLIER |
| `/sfa/accounting/treasury` | `treasury-screen` and shared subledger form |

The affected pages were opened in Arabic/English × Light/Dark; mobile captures verify actual 390px viewport and no page-width overflow. Read-only tables/tabs and opening/closing an empty account form were inspected; no financial command was submitted. All accounting backend/data contracts and existing WMS/count services are unchanged in the diff. The reusable table retains its own horizontal scroll on mobile. No repository-wide audit or unrelated screen redesign.

## Local previews and evidence

- WMS: `http://localhost:4458/local-login/admin`, then choose DEMO-WH-01. New cycle is in **Damage, quarantine & write-off**. API is loopback `4459`.
- Accounting visual preview: `http://localhost:4468/local-login/admin`; API is loopback `4469`, reusing the existing Accounting Demo without migrations or tests.
- Both previews remain running. They use isolated ignored preview processes/source snapshots, cached approved fonts and existing databases, with no Production endpoint or application authentication backdoor. The old count preview was superseded; its data remain intact.
- Evidence (ignored): `.quality/wms-quarantine/{native.json,focused-tests.txt,http.json,demo-held.json,demo-released.json,demo-writtenOff.json,demo-final.json,query-plans.json,ui-evidence.json,*.png}`.

Commit: local quarantine/operational-UI feature commit containing this report, parent `9e00f44`.
