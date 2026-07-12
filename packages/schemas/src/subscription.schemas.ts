import { z } from "zod";
import { subscriptionStatusSchema, subscriptionPaymentStatusSchema } from "./enums";

// Admin-only: change a company's plan/status directly (e.g. manual upgrade,
// suspension for abuse). Independent of the automatic expiry sweep.
// planCode is a free string, not the closed PLAN_CODES enum — SUPER_ADMIN can
// create custom plans (see createPlanSchema.code below) and must be able to
// assign them here too.
export const updateSubscriptionSchema = z.object({
  planCode: z.string().min(2).max(40).optional(),
  status: subscriptionStatusSchema.optional(),
  paymentStatus: subscriptionPaymentStatusSchema.optional(),
  currentPeriodEnd: z.coerce.date().optional(),
});
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;

export const createPlanSchema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(80),
  priceCents: z.number().int().min(0),
  currency: z.string().length(3).default("USD"),
  billingIntervalCode: z.enum(["MONTHLY", "YEARLY", "ONE_TIME"]).default("MONTHLY"),
  maxUsers: z.number().int().min(1).nullable().optional(),
  features: z.record(z.string(), z.unknown()).default({}),
  isActive: z.boolean().default(true),
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
