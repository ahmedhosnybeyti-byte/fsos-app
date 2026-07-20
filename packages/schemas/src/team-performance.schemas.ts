import { z } from "zod";

// Team Performance screen — strategic point 3's second half ("عايز شاشة
// للمشرف والمدير تعطيهم معلومات عن فريق المبيعات").
//
// Migration #7 (ADR-001 / RIE Migration Plan). No file/column mapping. The
// old salesFileId/…AmountColumn/…DateColumn triplets are gone: the
// Canonical Schema fixes which entity and which fields each category reads
// from. Three architectural choices here were explicitly reviewed and
// approved by the Product Owner (not just a repeat of the Migration #6
// pattern) — each is called out at its point of use below and in
// team-performance.service.ts:
//
// 1. Sales value = Invoice Items.LineTotal joined to Invoices (not
//    Invoices.TotalAfterVAT) — same source every other migrated screen
//    uses, to keep this screen's sales figure consistent with Heat Map /
//    Customer Comparison for the same period, by explicit product decision.
// 2. Supervisor grouping = Employees.DirectManagerID (the official
//    reporting line), not Routes.SupervisorID — Team Performance
//    represents the formal management structure, not the operational
//    (route) structure, by explicit product decision.
// 3. A category (sales/collection/returns) with no Dataset uploaded at all
//    is OMITTED, not zeroed and not treated as a hard failure — the other
//    two independent categories still render. See `categoriesAvailable`
//    below and each rep row's nullable sales/collection/returns fields:
//    null means "no data uploaded for this category" (data-not-present),
//    never conflated with 0 (a real total of zero in the window).
export const teamPerformanceRieQuerySchema = z
  .object({
    dateFrom: z.string().min(1).max(50),
    dateTo: z.string().min(1).max(50),
    // Optional — omit to skip trend computation (no "prior period" to
    // compare against).
    priorDateFrom: z.string().min(1).max(50).optional(),
    priorDateTo: z.string().min(1).max(50).optional(),
  })
  .refine((v) => !(v.priorDateFrom && !v.priorDateTo) && !(v.priorDateTo && !v.priorDateFrom), {
    message: "priorDateFrom and priorDateTo must be provided together",
    path: ["priorDateFrom"],
  });
export type TeamPerformanceRieQueryInput = z.infer<typeof teamPerformanceRieQuerySchema>;

export const teamPerformanceRepRowSchema = z.object({
  // Employees.Email for the resolved rep — kept as the row identifier the
  // frontend already keys on. Falls back to the SalesRepID (or the bare
  // RouteID when the route has no SalesRepID) so rows with data-quality
  // gaps stay visible instead of being silently dropped (same fallback
  // philosophy as Migration #6's rep resolution).
  repEmail: z.string(),
  repName: z.string(),
  // Derived from the rep's Employees.DirectManagerID (product decision #2
  // above) — null when the rep has no manager set or it couldn't be
  // resolved to an Employee record.
  supervisorEmail: z.string().nullable(),
  supervisorName: z.string().nullable(),
  // null = this category's Dataset isn't uploaded at all (see
  // categoriesAvailable) — distinct from 0, a real total within the
  // window. Product decision #3 above.
  sales: z.number().nullable(),
  salesPrior: z.number().nullable(),
  collection: z.number().nullable(),
  collectionPrior: z.number().nullable(),
  returns: z.number().nullable(),
  returnsPrior: z.number().nullable(),
});
export type TeamPerformanceRepRow = z.infer<typeof teamPerformanceRepRowSchema>;

export const teamPerformanceResultSchema = z.object({
  reps: z.array(teamPerformanceRepRowSchema),
  // True once the viewer's role means the underlying reads were narrowed
  // to their own team (SUPERVISOR, via RIE's Hierarchy Row-Level Filter)
  // vs left unfiltered — surfaced so the frontend can caption the screen
  // correctly ("فريقك" vs "الفريق بالكامل") without re-deriving it.
  scopedToOwnTeam: z.boolean(),
  // Which of the three category Datasets were actually uploaded. false =
  // that category is omitted from every rep row (fields stay null), not
  // rendered as zero, and does not block the other categories from
  // showing. Product decision #3 above.
  categoriesAvailable: z.object({
    sales: z.boolean(),
    collection: z.boolean(),
    returns: z.boolean(),
  }),
});
export type TeamPerformanceResult = z.infer<typeof teamPerformanceResultSchema>;

// Rule-based "توجيه" (guidance) button — deliberately NOT a free-form AI
// call. Thresholds classify the rep's numbers into a category, then the
// same keyword-overlap retrieval used by the Assistant's scenario coaching
// (see scenario-retrieval.util.ts) finds the closest-matching entry in the
// 153-scenario Behavior Scenario Library and its ready phrase becomes the
// note. Zero external API calls, zero token cost, on-demand only. Unchanged
// by Migration #7 — still expects concrete numbers, so the frontend only
// offers this button for a rep/category combination that actually has data
// (not null).
export const teamPerformanceCoachSchema = z.object({
  repName: z.string().min(1).max(200),
  sales: z.number(),
  salesPrior: z.number().nullable(),
  collection: z.number(),
  collectionPrior: z.number().nullable(),
  returns: z.number(),
  returnsPrior: z.number().nullable(),
});
export type TeamPerformanceCoachInput = z.infer<typeof teamPerformanceCoachSchema>;

export const teamPerformanceCoachResultSchema = z.object({
  note: z.string(),
  tone: z.enum(["positive", "attention", "neutral"]),
});
export type TeamPerformanceCoachResult = z.infer<typeof teamPerformanceCoachResultSchema>;
