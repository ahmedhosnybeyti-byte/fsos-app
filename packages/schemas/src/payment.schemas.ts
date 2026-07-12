import { z } from "zod";
import { paymentRecordStatusSchema } from "./enums";

// MVP: admin manually records a payment against a company/subscription
// (ManualPaymentProvider). A future Stripe/Paymob adapter posts to the same
// PaymentsService against the same underlying Payment model.
export const recordManualPaymentSchema = z.object({
  subscriptionId: z.string().min(1),
  amountCents: z.number().int().min(0),
  currency: z.string().length(3).default("USD"),
  status: paymentRecordStatusSchema.default("SUCCEEDED"),
  paidAt: z.coerce.date().optional(),
  note: z.string().max(500).optional(),
});
export type RecordManualPaymentInput = z.infer<typeof recordManualPaymentSchema>;
