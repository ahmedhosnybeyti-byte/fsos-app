# Sales Growth Intelligence (SGI) — Vision & Phased Roadmap

Status: **approved. Phase 1 implementation starting.** Written after the
product owner shared a full vision brief (reproduced in spirit below) and
asked for it to be filtered into something buildable against the actual
FSOS codebase, rather than executed as one giant ticket. All open
questions (§5) and the one migration sign-off (§3 point 1, the `Target`
model) were reviewed and confirmed by the product owner directly.

This doc has two jobs: preserve the full vision so nothing gets lost, and
turn it into phases that are each independently shippable, reuse what
already exists, and flag the handful of points that need an explicit
go-ahead before any code gets written (per this repo's own CLAUDE.md rule:
migrations and irreversible architecture decisions are stop-and-confirm
points, not something to default into).

---

## 1. Vision (condensed)

SGI is not a dashboard, not a chatbot, not a CRM. It's meant to be FSOS's
business brain: continuously turn company data into concrete field-sales
decisions, so a rep always knows what to do now, which customer to visit,
which product to sell, why, and what the expected impact is. It should
think like a Sales Director, remember like a CRM, coach like a trainer,
and improve from what actually happened after each recommendation.

Ten engines were specified: Goal Planning, Business Intelligence Layer,
Situation Detection, Opportunity Discovery, Recommendation, Opportunity
Scoring, Dynamic Execution Planner, Growth Playbooks, Live Decision
Engine, and Confidence & Explainability — plus an Executive Sales Coach,
a persistent Sales Memory Engine, an AI Learning Loop, voice-first field
interaction, and a new "How to Increase Your Sales" main screen with ten
sections (goal, opportunities, risks, recommended customers, recommended
products, playbooks, coach, voice mic, execution plan, live progress).

Architecture principles given alongside the vision — all directly
compatible with how this codebase already works: no business logic in UI
components, modular/reusable/extensible engines, UI only consumes engine
output, reuse the existing theme/routing/state/API/component layer, full
RTL, never break existing screens.

## 2. Reality check — what the codebase actually looks like today

Verified directly against `packages/database/prisma/schema.prisma`,
`packages/schemas/src/enums.ts`, and the existing `apps/api/src/modules/*`
before writing a single line of this roadmap — the vision brief's own
instruction was "understand the existing code first," so this section is
that homework, not an assumption.

- **No persistent Invoice/Visit/Product domain tables.** Every current
  module (Customer Similarity, Heat Map, Route Planning, Team Performance,
  Visit Efficiency, Geo Intelligence, the Assistant, the legacy GPT
  Action) reads business data the same way: a company uploads an Excel
  file, `FilesService` stores it (S3/R2-compatible storage) and parses its
  headers, and each feature's service downloads the buffer, parses it with
  `xlsx`, and computes in memory per request. There is no live
  "an invoice just got created" event anywhere in the system.
- **`File.datasetType` is a free string, not a closed enum** — and
  `SUGGESTED_DATASET_TYPES` (`packages/schemas/src/enums.ts`) already
  lists `Invoices, Customers, Payments, Returns, Products, Inventory,
  Pricing, Routes, Visits, Collections, Targets, Competitors`. This
  matters a lot for SGI: **Targets and Invoices are already anticipated
  dataset categories** at the platform level, even though not every
  company necessarily uploads all of them, and even though nothing
  guarantees SKU-level line items are present in whatever "Invoices" file
  a given company uploads (some companies' sales files are already
  customer-level totals only, per Customer Similarity's "SKU column is
  optional" design).
- **Row-level access control already exists and is generic.**
  `applyHierarchyFilter` (`apps/api/src/modules/files/dataset-query.util.ts`)
  narrows any file's rows to a rep's/supervisor's own data once a
  COMPANY_ADMIN has mapped that file's rep/supervisor column. Every module
  built this session routes through it. SGI must do the same — a rep-
  facing "recommended customers" list has to respect this, not bypass it.
- **`AiReport` already exists as a generic, unused-so-far persistence
  stub** (`companyId, userId, fileId, reportType: String, content: Json`)
  — its own schema comment says it exists "so persisting GPT-generated
  analysis output later needs zero migration." This is a genuinely
  significant finding: **the Sales Memory Engine's storage layer likely
  doesn't need a new migration for v1.** `reportType` can carry values
  like `"sgi_situation"`, `"sgi_recommendation"`, `"sgi_execution_result"`,
  and `content` can carry whatever shape each engine needs, versioned
  informally inside the JSON itself. This should be tried before proposing
  a bespoke `SalesMemory` table — only add a real migration if `AiReport`'s
  shape turns out to be genuinely insufficient (e.g. needs relational
  queries `Json` can't do efficiently), and that decision gets its own
  explicit sign-off when it comes up, not a default.
- **Scheduled/periodic execution is already proven infra**, not something
  to introduce. `apps/api/src/modules/scheduled-tasks/scheduled-tasks.service.ts`
  already runs an hourly `@Cron` job (via `@nestjs/schedule`) for
  subscription expiry. The same mechanism can run SGI's situation/
  opportunity recompute on a schedule (e.g. every few hours, or nightly)
  per active company — a legitimate, low-risk stand-in for "Live Decision
  Engine" until/unless the product actually gets a real live data-entry
  path. Recompute-on-new-file-upload (hooking into `FilesService`'s
  existing processing pipeline) covers the other common trigger.
- **The Assistant module is a ready-made foundation for the Executive
  Coach and voice-text scenarios**, not something to build fresh.
  `apps/api/src/modules/assistant/assistant.service.ts` already runs a
  Claude tool-use loop (`claude-haiku-4-5`, prompt caching, a condensed
  DNA system prompt, keyword-matched scenario retrieval, and dataset
  queries that go through the same hierarchy filter and row/column
  utilities every other module uses). A text-based "before/during/after
  visit" coach, and the "Murshidak, how do I increase today's sales?" /
  "customer rejected because of price" / "what happened with this
  customer last week" scenarios from the vision brief, are naturally an
  extension of this existing tool-use loop with SGI-specific tools added
  (e.g. `get_todays_opportunities`, `record_objection`,
  `recall_customer_history`) — not a new AI subsystem.
- **Voice is the one piece with genuinely zero existing infrastructure.**
  There's no speech-to-text, no text-to-speech, no mic-capture/streaming
  code anywhere in this repo today. This is a real, separate technical
  track (browser mic permissions, an STT provider, a TTS provider or
  device-native speech synthesis, and a decision on streaming vs.
  request/response), not a checkbox on top of the Assistant loop.
- **Existing module shape to follow** (14 backend modules today —
  `analysis-studio, assistant, audit-log, auth, companies,
  customer-similarity, files, geo-intelligence, gpt, health, heatmap,
  payments, plans, platform-settings, roles, route-planning,
  scheduled-tasks, subscriptions, team-performance, usage-analytics,
  users, visit-efficiency`): Zod schema in `packages/schemas/src`,
  service + controller + module in `apps/api/src/modules/<name>`, a
  dashboard page in `apps/web/src/app/(dashboard)/dashboard/<name>`, a nav
  entry + `ModuleColorKey` in `lib/module-colors.ts`. SGI should be a new
  module (or a small family of modules) in this same shape, not a
  parallel structure.

## 3. What needs explicit sign-off before it gets built

Per this repo's CLAUDE.md, these are the points where the default is
"stop and ask," not "proceed":

1. **A new, small `Target` Prisma model — proposed, awaiting confirmation.**
   Product owner confirmed (see §5) Targets must support *both* an
   uploaded `Targets`-type file *and* direct in-platform entry (a simple
   list/form — "one target per rep/territory per month"). Forcing the
   manually-entered path through the existing File/Excel-buffer pipeline
   (fabricating a workbook server-side just to satisfy the same reader)
   would work but is contorted, and it'd leave Goal Planning needing to
   understand two different code paths for what's conceptually one number.
   Cleaner: a small dedicated table —
   `Target(companyId, repOrTerritoryKey, periodMonth, value, source: "upload"|"manual", createdByUserId)`
   — as the single source of truth Goal Planning always reads from; an
   uploaded `Targets` file gets parsed and upserted into it row-by-row
   (source: "upload"), the in-platform list writes directly into it
   (source: "manual"). This is a real migration, so it needs an explicit
   yes before Phase 1 implementation starts, per CLAUDE.md's own rule —
   flagged here rather than added silently just because it's small.
2. **Any other new Prisma model/migration** — only comes up if `AiReport`
   proves insufficient for the Sales Memory Engine (see §2 above).
   Flagged so it's never silently introduced either.
3. **Voice infrastructure choice** — confirmed in scope (see §5), but
   *which* STT/TTS provider (or browser-native `SpeechRecognition`/
   `SpeechSynthesis` APIs — zero new backend infra, but real browser-
   support and Arabic-accuracy caveats), streaming vs. push-to-talk, and
   provider cost are still open and get decided when Phase 5 actually
   starts, not now — real cost/product-scope implications, not a detail.

## 4. Phased roadmap

Each phase is meant to ship and be usable on its own — not a slice of an
unusable whole.

### Phase 0 — Data audit (no code)

Product owner confirmed (§5): assume per-company data is often
incomplete rather than waiting to verify against real sample files.
Every engine below must therefore degrade gracefully per company — e.g.
Situation Detection items that need SKU-level invoice rows (Out Of Stock,
Slow Moving) simply don't fire for a company whose Sales file is
customer-level totals only, with an honest "needs X data" state rather
than a wrong or fabricated answer, the same honest-empty-state pattern
already used in Team Performance. Phase 0 becomes a short checklist baked
into each engine's design (what's the minimum viable column set for this
situation to fire?) rather than a manual survey step.

### Phase 1 — Core intelligence loop, minimal screen, Targets foundation

Backend: a new `sales-growth-intelligence` module implementing Situation
Detection → Opportunity Discovery → Recommendation → Opportunity Scoring,
reading from whichever of Sales/Collection/Returns/Customers files a
company has already uploaded (same file-picker + column-mapping pattern
as every other module — no new upload UX), plus the new `Target` table
(§3, point 1 — pending confirmation) as Goal Planning's single source of
truth regardless of whether a given target came from an uploaded
`Targets` file or was entered directly in a simple in-platform list.
Recompute triggered by (a) a manual "recalculate" action and (b) the
existing `scheduled-tasks` cron, per company. Situations/recommendations
persisted via `AiReport` (`reportType: "sgi_recommendation"` etc.) so
history isn't lost between recomputes — this is baseline history, not
yet the full Sales Memory Engine (that's Phase 3).

Frontend: the "How to Increase Your Sales" screen, but starting with only
3 of the 10 sections from the vision — Monthly Goal, Today's Biggest
Opportunities, Today's Risks. Conversational, business-language copy per
the vision's "speak like a Sales Manager, not software" rule (reuses the
`t()`/dictionary pattern already in place for bilingual support).

### Phase 2 — Recommended customers/products, playbooks, execution plan

Adds the Dynamic Execution Planner (turns a recommendation into a
concrete action: customer, products, quantity, reason, expected revenue,
confidence, priority), the ranked Recommended Customers / Recommended
Products sections, and the first set of Growth Playbooks as
declarative trigger/condition/steps/KPI/exit-condition records (a
straightforward structured-data feature, no new infra).

### Phase 3 — Executive Coach + Sales Memory Engine (merged)

Merged deliberately, per product owner direction: memory is what makes
coaching valuable — advice grounded in what actually happened with this
rep and this customer before, not generic tips. Building them together
means the Coach's very first version already searches memory before
answering, rather than bolting that on to an already-shipped Coach later.

Extends the existing Assistant Claude tool-use loop with SGI-aware tools
(before/during/after-visit coaching, "why this customer / why this
product / why now" explanations) backed by a proper Sales Memory Engine —
still stored via `AiReport` (§2; distinct `reportType` values per record
kind: objections, customer behavior, rep behavior, company best
practices), but now with real "search memory first, then adapt" retrieval
logic wired into the Coach's tools, matching the vision brief's explicit
rule. New tools on the existing loop (e.g. `recall_customer_history`,
`record_objection`, `get_todays_opportunities`) — not a new AI subsystem.

### Phase 4 — AI Learning Loop

Builds on Phase 3's now-real Sales Memory Engine rather than a thin
Phase-1-only version: once an execution's real outcome is known (e.g. the
customer's next invoice arrives on a later file upload), compare it
against what was recommended and store the delta as another Sales Memory
record (`reportType: "sgi_execution_result"`), feeding future
Recommendation/Scoring runs.

### Phase 5 — Voice-first field interaction

Confirmed in scope for the first release (§5), but deliberately last —
it depends on SGI (Phase 1), the Sales Memory Engine and Coach (Phase 3),
and the Learning Loop (Phase 4) already existing; once that foundation is
there, voice is "just an interaction surface," not its own project. Mic
capture, STT, the scenario set from the vision brief (ask for today's
best opportunity, log a rejection reason, recall last week's visit, "I'm
entering customer 18 now," "evaluate my day"), each mapped onto the same
Assistant tool-use loop as Phase 3's text coach, plus TTS for spoken
replies. Provider/streaming choices per sign-off point 3 (§3), decided
when this phase actually starts.

---

## 5. Open questions — resolved

1. **Data may well be incomplete per company.** Every engine designs for
   graceful degradation from the start rather than assuming a full
   dataset — see Phase 0.
2. **Targets: both** an uploaded `Targets`-type file and direct
   in-platform list entry, feeding one shared source of truth — see the
   proposed `Target` model, §3 point 1 (awaiting confirmation).
3. **Voice is in scope for the first release**, but placed last in
   sequence (Phase 5) since it depends on SGI + Sales Memory + Coach
   existing first — confirmed explicitly, see the reasoning in Phase 5.
4. **One phase-order change**: Executive Coach and Sales Memory Engine
   are now merged into a single Phase 3 (previously Coach was its own
   phase with memory spread thinly across Phase 1 and a separate Phase 4
   Learning Loop) — reasoning: memory is what makes coaching valuable,
   so they should ship together. AI Learning Loop moved to Phase 4,
   Voice stays Phase 5.

## 6. Sign-off received

1. **`Target` model migration — approved.** Confirmed directly by the
   product owner. Phase 1 implementation proceeds as speced in §3 point 1
   and §4 Phase 1.
2. **Voice (Phase 5) — confirmed**: in scope for the first release, but
   deliberately built last, after SGI, the Sales Memory Engine, and the
   Coach are done — voice is an interaction surface on top of that
   foundation, not a parallel track.
