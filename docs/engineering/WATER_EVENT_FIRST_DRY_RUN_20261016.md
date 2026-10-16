# Water Event-First Opportunity Radar — Dry Run

Date: 2026-10-16
Mode: read-only PostgreSQL comparison; no migration, import, or deployment executed
Target company: `cmri8nwt1000tegks6tesnwkv`
Workbook SHA-256: `2AF76BCC0F6F60491F80F075F57B011CF7ABD3E0E6A0E8948379982865805DEB`

## Scope

- Read `ابدأ هنا` and all 64 rows in `مرشحات الفعاليات`.
- Kept the 10 rows in `فرص توريد أخرى` outside this primary Event-First import.
- Used `جهات التواصل` and `مواقع مرجعية` only as research context.
- Treated every workbook Maps URL as a search link, never as a verified navigation pin.

## Mutually exclusive result

| Result | Count | Treatment |
|---|---:|---|
| Verified new active event | 13 | Eligible for idempotent import after approval |
| Verified duplicate | 2 | Merge verified event metadata into the existing market record; no new company row |
| Existing duplicate with trusted postponement | 1 | Keep the same market/company record and history; mark the market fact held/closed |
| Needs source verification | 39 | Do not activate or import |
| Needs end-date review | 6 | Do not activate or import |
| Held without import | 2 | Postponed or needs official recheck |
| Expired/source conflict | 1 | Do not activate or import |
| **Total** | **64** | Every primary candidate accounted for exactly once |

The 13 verified additions are `EVT-005`, `EVT-023`, `EVT-024`, `EVT-028`, `EVT-029`, `EVT-035`, `EVT-039`, `EVT-043`, `EVT-046`, `EVT-051`, `EVT-052`, `EVT-055`, and `EVT-056`.

The verified duplicates are `EVT-027` → `radar-research-20261016-b24` and `EVT-038` → `radar-research-20261016-b05`. `EVT-058` → `radar-research-20261016-b19` is the existing FIFAe record whose official source reports postponement without a replacement date.

## PostgreSQL comparison

- Existing company opportunities: 54
- Referenced duplicate records found: 3/3
- Identity mismatches across name/date/city/source review: 0
- Existing assigned opportunities: 6
- Existing personal favorite/hidden preferences: 2
- Existing linked visit intents: 1

The apply path snapshots all 54 pre-existing company workflow rows and refuses to commit if status, assignee, assigning user/date, contact date, notes, outcome, order value/quantity, preference count, or linked visit-intent count changes. New records use deterministic ids plus unique market and company keys, and all writes run in one serializable, advisory-locked transaction.

## Activation boundary

The importer defaults to dry-run and requires both `--apply` and an explicit `--company-id` to write. Applying it also enables the `EVENT_FIRST_WATER` radar policy for that company only; every other company remains `STANDARD`. No automatic periodic crawler or paid discovery service was introduced. Schedule/location changes are represented by market-opportunity revision history so a future verified refresh can update the same record.
