import { z } from "zod";

// Sales Growth Intelligence (SGI) — Phase 1 engines. See docs/SGI_ROADMAP.md.
//
// Pipeline: Situation Detection -> Opportunity Discovery -> Recommendation ->
// Opportunity Scoring, exactly as named in the vision brief. Migration #8
// (ADR-001 / RIE Migration Plan) — no file/column mapping. Sales/Invoice
// data and Collections are read via RieFacade against the Canonical Schema
// (Invoice Items joined to Invoices, and Collections — the same sources
// Migration #7/Team Performance uses), producing a flat list of
// "situations", each carrying its own severity (the scoring step) and a
// ready-to-act Arabic recommendation (never a bare number with no next step
// — the vision brief's golden rule). Per explicit product decision, the
// Target model (Prisma `Target`, see targets.schemas.ts) is NOT part of
// this migration — TARGET_BEHIND still reads Prisma Target unchanged; only
// the sales/collection reads that feed the other four situation types (and
// TARGET_BEHIND's own "actual" side) moved to RIE.
//
// Phase 1 covers 5 situation types, the 4 the product owner picked as
// reliably computable from customer/rep-level totals (no SKU-level detail
// required) plus Target Behind which the Target model (see
// target.schemas.ts) was built for:
//   - TARGET_BEHIND: a rep/territory's sales-to-date is behind the pace
//     needed to hit its monthly Target.
//   - LOST_SALES: a customer bought meaningfully last period and bought
//     nothing this period — a sudden, recent stop.
//   - CUSTOMER_DECLINING: a customer is still buying, but materially less
//     than last period (trending toward zero, not there yet).
//   - CUSTOMER_INACTIVE: a customer has had zero activity in both the
//     current and prior windows — dormant longer than one period, not just
//     a one-off gap (distinct from LOST_SALES's "just stopped" signal).
//   - COLLECTION_RISK: a customer bought a lot this period but paid back
//     disproportionately little of it — an accumulating receivable.
//
// 2026-07-20: added a 6th type, GROWTH_OPPORTUNITY, per explicit product
// feedback that every situation up to this point was risk/behavioral —
// nothing pointed a rep toward upside. Deliberately NOT geo-based (unlike
// Geo Intelligence's Customer Comparison, which anchors on lat/lon nearest-
// neighbors) — SGI's recalculation pass is a single flat scan over Invoice
// Items with no per-customer geo lookups, and not every customer has valid
// coordinates. Instead it compares a customer's own current-period product
// set against what OTHER customers on the same rep's book already buy — the
// same "peer group" the rep already owns, cheap to compute in the same
// pass, no new data requirement:
//   - GROWTH_OPPORTUNITY: a product a meaningful share of a rep's other
//     active customers buy this period, that this specific (also active)
//     customer does not — a concrete cross-sell/upsell suggestion, not just
//     "visit them."
//
// 2026-07-21: added a 7th type, PRODUCT_DECLINE, per explicit product
// request while scoping the Reports/PowerPoint feature ("نمو الاصناف او
// انخفاضها" — GROWTH_OPPORTUNITY already covers the "نمو" half, this is
// the "انخفاض" half). The inverse question to GROWTH_OPPORTUNITY, but at
// the product level within a single STILL-ACTIVE customer rather than
// across a rep's peer book: among products this customer bought last
// period, which one dropped sharply (or vanished) this period, while the
// customer overall is still buying SOMETHING (acc.current > 0)?
// Deliberately independent from the LOST_SALES/CUSTOMER_DECLINING/
// CUSTOMER_INACTIVE else-if chain (see sgi.service.ts) — a customer can be
// both "overall declining" and "stopped buying Product X specifically";
// the second is a more concrete, actionable signal (ask about that one
// product) than the first.
//   - PRODUCT_DECLINE: a specific product a still-active customer used to
//     buy meaningfully last period that they've now sharply cut back or
//     dropped entirely this period.
export const sgiSituationTypeSchema = z.enum([
  "TARGET_BEHIND",
  "LOST_SALES",
  "CUSTOMER_DECLINING",
  "CUSTOMER_INACTIVE",
  "COLLECTION_RISK",
  "GROWTH_OPPORTUNITY",
  "PRODUCT_DECLINE",
]);
export type SgiSituationType = z.infer<typeof sgiSituationTypeSchema>;

export const sgiSeveritySchema = z.enum(["high", "medium", "low"]);
export type SgiSeverity = z.infer<typeof sgiSeveritySchema>;

export const sgiSituationSchema = z.object({
  id: z.string(),
  type: sgiSituationTypeSchema,
  severity: sgiSeveritySchema,
  entityType: z.enum(["rep", "customer"]),
  entityKey: z.string(),
  entityLabel: z.string(),
  title: z.string(),
  detail: z.string(),
  recommendation: z.string(),
  metricValue: z.number(),
  metricValuePrior: z.number().nullable(),
  periodMonth: z.string(),
  // The rep considered "responsible" for this situation, for row-level
  // visibility filtering only (see sgi.service.ts) — not necessarily shown
  // in the UI. Null when it couldn't be derived (e.g. the underlying
  // RouteID has no SalesRepID on Routes), in which case only
  // COMPANY_ADMIN/MANAGER/SUPER_ADMIN can see the situation (fail closed,
  // same convention as RIE's Hierarchy Row-Level Filter).
  ownerRepEmail: z.string().nullable(),
});
export type SgiSituation = z.infer<typeof sgiSituationSchema>;

// Migration #8 — no file/column mapping. The Canonical Schema fixes which
// entities and fields sales/collection read from, so only the date window
// remains as input (identical in spirit to Migration #7/Team Performance's
// shrunk query schema).
export const sgiRecalculateInputSchema = z.object({
  periodMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "periodMonth must be in YYYY-MM format"),
  dateFrom: z.string().min(1).max(50),
  dateTo: z.string().min(1).max(50),
  priorDateFrom: z.string().min(1).max(50),
  priorDateTo: z.string().min(1).max(50),
});
export type SgiRecalculateInput = z.infer<typeof sgiRecalculateInputSchema>;

// Reports feature (Task #259, explicit product request — the "360 درجة"
// section of the Reports/PowerPoint wizard): a per-rep KPI snapshot beyond
// what situations[] alone conveys (sales vs target, collection, active
// customer count, top products) — computed once at recalculation time from
// data SgiService already has in hand (reps/repTargetTotals/
// repActiveCustomers/repProductAgg, plus a new per-rep collection rollup),
// no extra reads. Same fail-closed exposure convention as repDirectory:
// GET /sgi/latest filters this down to only the emails the viewer is
// already allowed to see.
export const sgiRepStatsSchema = z.object({
  salesActual: z.number(),
  salesTarget: z.number().nullable(),
  collectionActual: z.number(),
  activeCustomers: z.number(),
  topProducts: z.array(z.object({ name: z.string(), value: z.number() })),
});
export type SgiRepStats = z.infer<typeof sgiRepStatsSchema>;

export const sgiRecalculateResultSchema = z.object({
  generatedAt: z.string(),
  periodMonth: z.string(),
  situations: z.array(sgiSituationSchema),
  // Rep -> supervisor email, resolved during the same pass that builds the
  // situations from Employees.DirectManagerID (the formal reporting line —
  // same source Migration #7/Team Performance uses, not a per-row vote
  // anymore) — persisted alongside the situations so GET /sgi/latest can
  // scope results to a SUPERVISOR's own team without re-reading source data.
  repSupervisorMap: z.record(z.string(), z.string()),
  // Rep email -> that rep's OWN target/actual for the period, captured at
  // recalculation time alongside repSupervisorMap. Internal only, never
  // sent to the frontend directly — getLatest() uses it to build a
  // per-viewer summary.monthlyGoal (a rep's own numbers, a supervisor's
  // team total, everyone else the company-wide total) instead of always
  // returning the single company-wide figure baked into `summary` below.
  // 2026-07-20: added because summary.monthlyGoal was being returned
  // verbatim (company-wide) to every role — a rep's "الهدف الشهري" card
  // was showing the same numbers as the Company Admin's.
  repMonthlyGoals: z.record(
    z.string(),
    z.object({
      targetTotal: z.number().nullable(),
      actualTotal: z.number(),
    }),
  ),
  // See sgiRepStatsSchema above — persisted per-rep, filtered down to the
  // viewer's own visible reps in getLatest() before being sent out.
  repStats: z.record(z.string(), sgiRepStatsSchema),
  warnings: z.array(z.string()),
  summary: z.object({
    totalSituations: z.number(),
    highSeverityCount: z.number(),
    monthlyGoal: z.object({
      targetTotal: z.number().nullable(),
      actualTotal: z.number(),
      progressPct: z.number().nullable(),
    }),
  }),
  // A 2-3 sentence Arabic opening summary, generated by SgiService itself
  // (templated from the same computed summary/situations — not an LLM
  // call) so every consumer — the Sales Growth screen, the Assistant, and
  // later Voice — can display or relay the exact same "here's what matters
  // today" framing without re-deriving it. See sgi.service.ts's
  // buildBriefing(). Recomputed against each viewer's own filtered
  // situations in getLatest(), so a rep's briefing leads with their own
  // top item, not the company-wide one.
  briefing: z.string(),
});
export type SgiRecalculateResult = z.infer<typeof sgiRecalculateResultSchema>;

// Human-readable labels for the entities behind a viewer's own (already
// filtered) situations — email -> display name, plus each rep's
// supervisor (email + name) when known. Built in getLatest() from the
// same repSupervisorMap + User table lookup already used for
// TARGET_BEHIND's rep labels in runRecalculation — no new decision logic,
// just names for entities SgiService already identified. Exists so the
// Priority Center hierarchy (Sector/Supervisor -> Rep -> Priorities) can
// render real names instead of raw emails; naturally scoped to whatever
// the viewer can already see (a SUPERVISOR's directory only ever contains
// their own reps, since it's built from their already-filtered situations).
export const sgiRepDirectoryEntrySchema = z.object({
  email: z.string(),
  name: z.string(),
  supervisorEmail: z.string().nullable(),
  supervisorName: z.string().nullable(),
});
export type SgiRepDirectoryEntry = z.infer<typeof sgiRepDirectoryEntrySchema>;

// A subset of sgiRecalculateResultSchema — what GET /sgi/latest returns
// after server-side hierarchy filtering (repSupervisorMap is internal only,
// never sent back to the frontend; repDirectory is the filtered,
// display-name-only replacement for it).
export const sgiLatestResultSchema = z.object({
  generatedAt: z.string(),
  periodMonth: z.string(),
  situations: z.array(sgiSituationSchema),
  warnings: z.array(z.string()),
  summary: sgiRecalculateResultSchema.shape.summary,
  briefing: z.string(),
  repDirectory: z.array(sgiRepDirectoryEntrySchema),
  // Filtered to exactly the emails in repDirectory above — same visibility
  // boundary, just KPI numbers instead of names.
  repStats: z.record(z.string(), sgiRepStatsSchema),
  scopedToOwnTeam: z.boolean(),
});
export type SgiLatestResult = z.infer<typeof sgiLatestResultSchema>;
