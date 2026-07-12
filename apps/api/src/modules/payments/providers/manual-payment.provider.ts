import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma";
import type { PaymentProvider, RecordPaymentParams } from "../payment-provider.interface";

// MVP provider: a SUPER_ADMIN records a payment they received out-of-band
// (bank transfer, cash, etc.) and marks the subscription paid. A Stripe/
// Paymob adapter later implements the same interface, typically triggered
// from a webhook instead of an admin form.
@Injectable()
export class ManualPaymentProvider implements PaymentProvider {
  readonly providerType = "MANUAL" as const;

  constructor(private readonly prisma: PrismaService) {}

  async recordPayment(params: RecordPaymentParams) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          companyId: params.companyId,
          subscriptionId: params.subscriptionId,
          provider: "MANUAL",
          amountCents: params.amountCents,
          currency: params.currency,
          status: "SUCCEEDED",
          paidAt: params.paidAt ?? new Date(),
          rawPayload: params.note ? { note: params.note } : undefined,
        },
      });

      await tx.subscription.update({
        where: { id: params.subscriptionId },
        data: { paymentStatus: "PAID" },
      });

      return payment;
    });
  }
}
