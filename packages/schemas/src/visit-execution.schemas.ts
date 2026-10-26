import { z } from "zod";

export const visitEntrySources = ["VISIT_COPILOT", "NEW_CUSTOMER", "DISCOVERY", "OPPORTUNITY_RADAR"] as const;
export const visitGoals = ["SALES", "COLLECTION", "RETURN", "FOLLOW_UP", "MARKET_DOCUMENTATION"] as const;
export const visitOutcomes = ["ACHIEVED", "NOT_ACHIEVED", "FOLLOW_UP"] as const;
export const visitFailureReasons = ["CUSTOMER_ABSENT", "CLOSED", "PRICE_REJECTED", "NOT_INTERESTED", "SUFFICIENT_STOCK", "DECISION_MAKER_ABSENT", "OTHER"] as const;
export const visitPhotoKinds = ["SHELF", "COOLER", "PLANOGRAM"] as const;
export const startVisitExecutionSchema = z.object({
  customerCode: z.string().trim().min(1).max(120),
  requestKey: z.string().uuid(),
  entrySource: z.enum(visitEntrySources),
  sourceReference: z.string().trim().min(1).max(200).optional(),
}).strict();
export const saveVisitExecutionSchema = z.object({
  commandKey: z.string().uuid(),
  version: z.number().int().nonnegative(),
  goal: z.enum(visitGoals),
  notes: z.string().trim().max(4000),
  outcome: z.enum(visitOutcomes).nullable(),
  failureReason: z.enum(visitFailureReasons).nullable(),
  reasonDetail: z.string().trim().max(500),
  finish: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.finish && !value.outcome) context.addIssue({ code: "custom", path: ["outcome"], message: "Outcome required" });
  if (value.outcome === "NOT_ACHIEVED" && !value.failureReason) context.addIssue({ code: "custom", path: ["failureReason"], message: "Reason required" });
  if (value.outcome === "NOT_ACHIEVED" && value.failureReason === "OTHER" && !value.reasonDetail) context.addIssue({ code: "custom", path: ["reasonDetail"], message: "Explanation required" });
  if (value.outcome !== "NOT_ACHIEVED" && (value.failureReason || value.reasonDetail)) context.addIssue({ code: "custom", path: ["failureReason"], message: "Reason only applies to an unmet goal" });
});
export type StartVisitExecution = z.infer<typeof startVisitExecutionSchema>;
export type SaveVisitExecution = z.infer<typeof saveVisitExecutionSchema>;
export interface VisitExecution {
  id: string; customerCode: string; customerName: string; repName: string;
  entrySource: typeof visitEntrySources[number]; sourceReference: string | null;
  status: "OPEN" | "COMPLETED"; version: number;
  goal: typeof visitGoals[number]; notes: string;
  outcome: typeof visitOutcomes[number] | null;
  failureReason: typeof visitFailureReasons[number] | null; reasonDetail: string;
  startedAt: string; completedAt: string | null;
}
export interface VisitExecutionPhoto { id: string; kind: typeof visitPhotoKinds[number]; createdAt: string; }
