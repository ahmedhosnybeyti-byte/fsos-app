import { z } from "zod";
import { sgiSeveritySchema, sgiSituationTypeSchema } from "./sgi.schemas";

// SGIContext — the single, reusable "decision object" every SGI consumer
// hands off to every other SGI consumer. Requested explicitly as the final
// Phase 1 architectural piece: instead of each screen inventing its own way
// to pass "what we were just looking at" to the next screen, they all
// serialize the same shape and pass it through a generic deep link
// (?context=... — see apps/web/src/lib/sgi-context.ts's buildAssistantDeepLink).
// Today only the Sales Growth screen produces these (from a SgiSituation —
// see toSgiContext()) and only the Assistant consumes one, but the shape is
// deliberately generic so Customer 360, Daily Mission, Visit Planning, and
// a future Voice Assistant can both produce and consume it without a new
// contract each time.
//
// Every field here traces back to a real, already-computed SgiSituation
// field (see sgi.schemas.ts) — nothing is invented. Two notable
// adaptations from a generic "AI recommendation" shape:
//   - `severity` stands in for a numeric "confidence" — SgiService buckets
//     candidates into high/medium/low by rank (see assignSeverityByRank),
//     it does not compute a 0-1 confidence score, and inventing one here
//     would violate the "never invent numbers" rule every AI surface in
//     this app follows.
//   - `executionPlan` is an array for forward-compatibility with future
//     multi-step Playbooks (see docs/SGI_ROADMAP.md's later phases), but
//     Phase 1 only ever populates it with the single `recommendation`
//     sentence SgiService already generates — no multi-step planning logic
//     exists yet, so none is faked here.
//   - customer/product identity is carried via the generic `entityType` /
//     `entityId` / `entityName` (matching SgiSituation's own entityType,
//     which is "rep" | "customer" today) rather than separate
//     customerId/productId fields, since SGI has no SKU-level situations
//     in Phase 1 — adding a real product-level situation type later just
//     means a new entityType value, not a new context shape.
export const sgiContextSchema = z.object({
  contextVersion: z.literal(1),
  // Which module produced this context — lets the receiving screen tailor
  // its opening framing ("جاي من شاشة ..." / "جاي من ...") without needing
  // a separate parameter, and lets future analytics see where discussions
  // originate.
  source: z.enum(["sales-growth", "assistant", "customer-360", "daily-mission", "visit-planning", "voice"]),
  recommendationId: z.string(), // same id as the source SgiSituation
  situationType: sgiSituationTypeSchema,
  severity: sgiSeveritySchema,
  entityType: z.enum(["rep", "customer"]),
  entityId: z.string(),
  entityName: z.string(),
  title: z.string(),
  reasoning: z.string(), // SgiSituation.detail
  executionPlan: z.array(z.string()).min(1), // SgiSituation.recommendation today, real multi-step plans later
  metricValue: z.number(),
  metricValuePrior: z.number().nullable(),
  periodMonth: z.string(),
  timestamp: z.string(), // when the source situation was generated (SgiRecalculateResult.generatedAt)
});
export type SgiContext = z.infer<typeof sgiContextSchema>;
