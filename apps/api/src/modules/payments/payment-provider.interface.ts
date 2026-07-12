import type { Payment } from "@field-sales-os/database";

export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");

export interface RecordPaymentParams {
  companyId: string;
  subscriptionId: string;
  amountCents: number;
  currency: string;
  paidAt?: Date;
  note?: string;
}

// Every payment provider (manual admin entry today; Stripe/Paymob later)
// implements this and is swapped in behind the PAYMENT_PROVIDER DI token in
// PaymentsModule — call sites in PaymentsService never change.
export interface PaymentProvider {
  readonly providerType: "MANUAL" | "STRIPE" | "PAYMOB" | "OTHER";
  recordPayment(params: RecordPaymentParams): Promise<Payment>;
}
