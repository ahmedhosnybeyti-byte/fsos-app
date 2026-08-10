import { z } from "zod";
import { sgiSeveritySchema } from "./sgi.schemas";

// AI Visit Copilot — Phase 1 (شاشة دعم قرار المندوب قبل/أثناء الزيارة).
// One "Analysis Scope" period governs every number on the screen: default
// last 3 months, with 1m/6m/12m and a custom from-to range as options.
// Stateless chat, same design decision as assistant.schemas.ts — the
// frontend resends the (capped) history each turn, no conversation table.

export const VISIT_COPILOT_LIMITS = {
  maxMessageLength: 2000,
  maxHistoryMessages: 10, // trimmed client-side; server also enforces this cap
  maxHistoryContentLength: 4000,
};

export const visitCopilotPeriodSchema = z.enum(["1m", "3m", "6m", "12m", "custom"]);
export type VisitCopilotPeriod = z.infer<typeof visitCopilotPeriodSchema>;

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ يجب أن يكون بصيغة YYYY-MM-DD");

// Shared period fields for every Visit Copilot request (query or body).
const periodFields = {
  period: visitCopilotPeriodSchema.default("3m"),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
};

interface PeriodFieldsShape {
  period: VisitCopilotPeriod;
  from?: string;
  to?: string;
}

const customPeriodRefinement = {
  check: (v: PeriodFieldsShape) => v.period !== "custom" || (!!v.from && !!v.to && v.from <= v.to),
  options: { message: 'period="custom" يتطلب from و to بصيغة YYYY-MM-DD و from لا يتجاوز to', path: ["from"] as (string | number)[] },
};

// Query booleans arrive as strings ("true"/"false") — coerce them here so
// controllers can pass @Query() straight through the ZodValidationPipe.
const queryBooleanSchema = z.preprocess((v) => v === true || v === "true" || v === "1", z.boolean());

// Flexible plan date (2026-07-30, explicit product request): which day's
// visit plan the rep is looking at. Defaults to today when omitted — every
// existing caller (that never sent this field) keeps behaving exactly as
// before. Future dates are allowed (pre-planning a day ahead); no lower
// bound is enforced here since the plan basis is a recurring weekday
// pattern (Customers.VisitDay — see the service), not a per-date ledger
// that could go "out of range." Only THIS field controls which day's plan
// is shown — it is completely separate from `period`/`from`/`to`, which
// remain the historical Analysis Scope used for sales/priority numbers.
const planDateField = { date: isoDateSchema.optional() };

// GET /visit-copilot/daily-brief
export const visitCopilotDailyBriefQuerySchema = z
  .object({ ...periodFields, ...planDateField, minimumScore: z.coerce.number().min(0).max(100).optional() })
  .refine(customPeriodRefinement.check, customPeriodRefinement.options);
export type VisitCopilotDailyBriefQuery = z.infer<typeof visitCopilotDailyBriefQuerySchema>;

// POST /visit-copilot/plan — reorder the selected day's visit list (see
// `date` above; defaults to today).
export const visitCopilotPlanModeSchema = z.enum(["route", "priority"]);
export type VisitCopilotPlanMode = z.infer<typeof visitCopilotPlanModeSchema>;

export const visitCopilotPlanRequestSchema = z
  .object({
    mode: visitCopilotPlanModeSchema,
    ...periodFields,
    ...planDateField,
  })
  .refine(customPeriodRefinement.check, customPeriodRefinement.options);
export type VisitCopilotPlanRequest = z.infer<typeof visitCopilotPlanRequestSchema>;

// GET /visit-copilot/briefing/:customerCode
export const visitCopilotBriefingQuerySchema = z
  .object({
    ...periodFields,
    // "Van stock filter" — when on, product recommendations exclude
    // products missing from the rep's latest Van Inventory report.
    vanStock: queryBooleanSchema.default(false),
  })
  .refine(customPeriodRefinement.check, customPeriodRefinement.options);
export type VisitCopilotBriefingQuery = z.infer<typeof visitCopilotBriefingQuerySchema>;

// POST /visit-copilot/chat
export const visitCopilotChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(VISIT_COPILOT_LIMITS.maxHistoryContentLength),
});
export type VisitCopilotChatMessage = z.infer<typeof visitCopilotChatMessageSchema>;

// Phase 2 (Customer Discovery): the chat can now also run in "Prospect
// Mode" — exactly one of customerCode | prospectId must be provided.
// customerCode alone keeps the exact Phase-1 wire shape (backward compat).
export const visitCopilotChatRequestSchema = z
  .object({
    customerCode: z.string().min(1).max(200).optional(),
    prospectId: z.string().min(1).max(200).optional(),
    ...periodFields,
    vanStock: z.boolean().default(false),
    message: z.string().min(1).max(VISIT_COPILOT_LIMITS.maxMessageLength),
    history: z.array(visitCopilotChatMessageSchema).max(VISIT_COPILOT_LIMITS.maxHistoryMessages).default([]),
  })
  .refine(customPeriodRefinement.check, customPeriodRefinement.options)
  .refine((v) => (v.customerCode ? 1 : 0) + (v.prospectId ? 1 : 0) === 1, {
    message: "أرسل customerCode أو prospectId — واحدًا منهما فقط",
    path: ["customerCode"],
  });
export type VisitCopilotChatRequest = z.infer<typeof visitCopilotChatRequestSchema>;

// ------------------------------------------------------------------
// Customer Discovery — Phase 2
// ------------------------------------------------------------------

// GET /visit-copilot/discovery + GET /visit-copilot/route-opportunities —
// period-only queries, same Analysis Scope semantics as daily-brief.
export const visitCopilotDiscoveryQuerySchema = z
  .object({ ...periodFields, ...planDateField, minimumScore: z.coerce.number().min(0).max(100).optional() })
  .refine(customPeriodRefinement.check, customPeriodRefinement.options);
export type VisitCopilotDiscoveryQuery = z.infer<typeof visitCopilotDiscoveryQuerySchema>;

// POST /visit-copilot/discovery/google-search
export const VISIT_COPILOT_DISCOVERY_LIMITS = {
  defaultRadiusMeters: 3000,
  maxRadiusMeters: 10000,
};

export const visitCopilotGoogleSearchRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  radiusMeters: z.coerce
    .number()
    .int()
    .positive()
    .max(VISIT_COPILOT_DISCOVERY_LIMITS.maxRadiusMeters, `أقصى نصف قطر للبحث ${VISIT_COPILOT_DISCOVERY_LIMITS.maxRadiusMeters} متر`)
    .default(VISIT_COPILOT_DISCOVERY_LIMITS.defaultRadiusMeters),
  minimumScore: z.coerce.number().min(0).max(100).optional(),
});
export type VisitCopilotGoogleSearchRequest = z.infer<typeof visitCopilotGoogleSearchRequestSchema>;

// PATCH /visit-copilot/prospects/:id/status — mirrors the Prisma
// ProspectStatus enum (field statuses are live operational state).
export const prospectStatusSchema = z.enum(["NEW", "VISITED", "IGNORED", "CONVERTED"]);
export type ProspectStatusValue = z.infer<typeof prospectStatusSchema>;

export const visitCopilotProspectStatusRequestSchema = z.object({
  status: prospectStatusSchema,
});
export type VisitCopilotProspectStatusRequest = z.infer<typeof visitCopilotProspectStatusRequestSchema>;

export interface VisitCopilotPeriodRange {
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
}

// Period parsing helper — one place both API and frontend resolve the
// Analysis Scope into a concrete inclusive [from, to] date range.
export function resolveVisitCopilotPeriod(input: PeriodFieldsShape, today: Date = new Date()): VisitCopilotPeriodRange {
  if (input.period === "custom" && input.from && input.to) {
    return { from: input.from, to: input.to };
  }
  const monthsByPeriod: Record<Exclude<VisitCopilotPeriod, "custom">, number> = { "1m": 1, "3m": 3, "6m": 6, "12m": 12 };
  const months = input.period === "custom" ? 3 : monthsByPeriod[input.period]; // validated upstream — "custom" without dates falls back to the 3m default
  const to = today.toISOString().slice(0, 10);
  const fromDate = new Date(today.getTime());
  fromDate.setUTCMonth(fromDate.getUTCMonth() - months);
  return { from: fromDate.toISOString().slice(0, 10), to };
}

// Resolves the plan date to use: the explicit `date` if provided (already
// validated as YYYY-MM-DD by isoDateSchema), otherwise today (server time).
// Single source of truth so the API and the frontend agree on "what does
// an omitted date mean."
export function resolveVisitCopilotPlanDate(input: { date?: string }, today: Date = new Date()): string {
  return input.date ?? today.toISOString().slice(0, 10);
}

// True when `dateIso` is strictly after today's own date (server time, UTC
// day boundary — same convention as isoDay in visit-copilot.service.ts) —
// i.e. this is a future date, so the screen must render Pre-Planning Mode
// rather than Today Execution Mode.
export function isFutureVisitCopilotPlanDate(dateIso: string, today: Date = new Date()): boolean {
  return dateIso > today.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------
// GET /visit-copilot/daily-360-summary — "ملخص اليوم 360°"
// ------------------------------------------------------------------
//
// 2026-07-28. Zero new Excel reads: the entire report is assembled from
// SgiService.getLatest(user) (already hierarchy-scoped per viewer — see
// sgi.service.ts getLatest()) plus the same daily-brief plan basis the
// screen already computes. facts/numbers/decisions all come from these two
// already-computed sources; the only AI involvement allowed anywhere in
// this feature is ONE bounded call that orders/phrases the narrative
// sections (see visit-copilot.service.ts buildDaily360Summary) — it may
// never introduce a number, customer, or product that isn't already in this
// DTO. A fixed deterministic Arabic template (buildTemplateNarrative) is the
// mandatory fallback when that call fails or is slow.
//
// Scope is derived server-side from the requesting user + org hierarchy —
// there is no scope parameter here at all (see the controller: no query
// field for it), matching SgiService.getLatest's own role-based filtering
// exactly (SALES_REP: own; SUPERVISOR: sector+reps; MANAGER/COMPANY_ADMIN:
// broader). Only `period` (the screen's existing Analysis Scope control) is
// accepted, as the comparison reference for the report's numbers.
export const visitCopilotDaily360SummaryQuerySchema = z
  .object({ ...periodFields, ...planDateField })
  .refine(customPeriodRefinement.check, customPeriodRefinement.options);
export type VisitCopilotDaily360SummaryQuery = z.infer<typeof visitCopilotDaily360SummaryQuerySchema>;


export const lostOpportunityExclusionScopeSchema = z.enum([
  "CUSTOMER_PRODUCT",
  "SALESPERSON_PRODUCT",
  "TEAM_PRODUCT",
  "COMPANY_PRODUCT",
]);
export type LostOpportunityExclusionScope = z.infer<typeof lostOpportunityExclusionScopeSchema>;

export const createLostOpportunityExclusionSchema = z.object({
  scopeType: lostOpportunityExclusionScopeSchema,
  customerCode: z.string().trim().min(1).max(200).optional(),
  productCode: z.string().trim().min(1).max(200),
  reason: z.string().trim().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.scopeType === "CUSTOMER_PRODUCT" && !value.customerCode) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customerCode"], message: "customerCode is required for CUSTOMER_PRODUCT" });
  }
  if (value.scopeType !== "CUSTOMER_PRODUCT" && value.customerCode) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customerCode"], message: "customerCode is only valid for CUSTOMER_PRODUCT" });
  }
});
export type CreateLostOpportunityExclusion = z.infer<typeof createLostOpportunityExclusionSchema>;

export const visitCopilot360StoppedProductSchema = z.object({
  productName: z.string(),
  quantity: z.number(),
  unit: z.string(),
  value: z.number(),
});
export type VisitCopilot360StoppedProduct = z.infer<typeof visitCopilot360StoppedProductSchema>;

// One "lost opportunity" customer card — up to 5 shown, ranked by decline
// value, mirroring the ChatGPT reference report's per-customer breakdown.
export const visitCopilot360LostOpportunitySchema = z.object({
  customerName: z.string(),
  declineValue: z.number(),
  valueBefore: z.number(),
  valueAfter: z.number(),
  lastVisitDate: z.string().nullable(),
  stoppedProducts: z.array(visitCopilot360StoppedProductSchema),
  diagnosis: z.string(),
  visitDecision: z.string(),
  // Added 2026-07-29 (Recommendation Builder) — additive/optional so any
  // older cached client keeps working: `likelyReason` is null whenever the
  // builder has no data-backed signal to point at (never a guessed cause
  // presented as fact); `visitGoal` is the one measurable outcome for this
  // visit, kept separate from `visitDecision`'s action step per the
  // diagnosis/reason/action/goal shape. `extraProductCount` lets the UI
  // show only the top products plus a "+N more" note instead of every chip.
  likelyReason: z.string().nullable().optional(),
  visitGoal: z.string().optional(),
  extraProductCount: z.number().optional(),
  customerCode: z.string(),
  productCode: z.string(),
  productName: z.string(),
  category: z.string().nullable(),
  baselineNetQuantity: z.number(),
  recentNetQuantity: z.number(),
  suggestedQuantity: z.number(),
});
export type VisitCopilot360LostOpportunity = z.infer<typeof visitCopilot360LostOpportunitySchema>;

export const visitCopilot360ExecutionStepSchema = z.object({
  priority: z.enum(["عالية", "متوسطة", "منخفضة"]),
  action: z.string(),
  owner: z.string(),
  successMetric: z.string(),
});
export type VisitCopilot360ExecutionStep = z.infer<typeof visitCopilot360ExecutionStepSchema>;

// The full report DTO — every field here is either a raw computed number
// (from SGI / daily-brief) or plain Arabic narrative text (either the
// deterministic template or the one bounded Claude call — never both, see
// `narrativeSource`). The frontend renders this directly; the PDF export
// (task #85) serializes the exact same DTO.
export const visitCopilot360SummarySchema = z.object({
  generatedAt: z.string(),
  reportDate: z.string(), // YYYY-MM-DD, today
  period: z.object({ from: z.string(), to: z.string() }),
  scopeLabel: z.string(), // e.g. "مندوبك: أحمد حسني" / "قطاعك وفريقك" / "الشركة بالكامل"
  userName: z.string(),
  roleLabel: z.string(),

  narrativeSource: z.enum(["ai", "template"]),

  executiveSummary: z.string(),
  topIssue: z.string().nullable(),

  goal: z.object({
    targetTotal: z.number().nullable(),
    actualTotal: z.number(),
    progressPct: z.number().nullable(),
    remainingGap: z.number().nullable(),
  }),

  sales: z.object({
    total: z.number(),
    invoiceCount: z.number(),
    visitCount: z.number(),
  }),

  lostOpportunities: z.array(visitCopilot360LostOpportunitySchema),
  lostOpportunityStatus: z.enum(["available", "no-customers", "no-baseline-sales", "no-lost-opportunities", "data-unavailable"]),

  collections: z.object({
    collected: z.number(),
    pending: z.number(),
    bounced: z.number(),
    priorityDebtors: z.array(z.object({ customerName: z.string(), amount: z.number(), dueDate: z.string().nullable() })),
  }),

  returns: z.object({
    total: z.number(),
    rate: z.number().nullable(),
    recurringRisks: z.array(z.string()),
  }),

  interventionNeeded: z.array(z.object({ name: z.string(), reason: z.string(), severity: sgiSeveritySchema })),

  rootCauses: z.object({
    narrative: z.string(),
    gaps: z.array(z.string()),
  }),

  executiveDecision: z.string(),
  executionPlan: z.array(visitCopilot360ExecutionStepSchema),

  closingPhrase: z.string(),

  warnings: z.array(z.string()),
});
export type VisitCopilot360Summary = z.infer<typeof visitCopilot360SummarySchema>;
