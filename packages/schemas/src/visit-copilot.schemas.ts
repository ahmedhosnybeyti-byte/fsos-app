import { z } from "zod";

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

// GET /visit-copilot/daily-brief
export const visitCopilotDailyBriefQuerySchema = z
  .object({ ...periodFields })
  .refine(customPeriodRefinement.check, customPeriodRefinement.options);
export type VisitCopilotDailyBriefQuery = z.infer<typeof visitCopilotDailyBriefQuerySchema>;

// POST /visit-copilot/plan — reorder today's visit list.
export const visitCopilotPlanModeSchema = z.enum(["route", "priority"]);
export type VisitCopilotPlanMode = z.infer<typeof visitCopilotPlanModeSchema>;

export const visitCopilotPlanRequestSchema = z
  .object({
    mode: visitCopilotPlanModeSchema,
    ...periodFields,
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
  .object({ ...periodFields })
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
