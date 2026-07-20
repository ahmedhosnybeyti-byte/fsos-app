import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { RecordManualPaymentInput } from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma";
import { PAYMENT_PROVIDER, type PaymentProvider } from "./payment-provider.interface";

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  async recordManualPayment(companyId: string, dto: RecordManualPaymentInput) {
    const subscription = await this.prisma.subscription.findUnique({ where: { id: dto.subscriptionId } });
    if (!subscription || subscription.companyId !== companyId) {
      throw new NotFoundException("Subscription not found for this company");
    }
    return this.paymentProvider.recordPayment({
      companyId,
      subscriptionId: dto.subscriptionId,
      amountCents: dto.amountCents,
      currency: dto.currency,
      paidAt: dto.paidAt,
      note: dto.note,
    });
  }

  async listForCompany(companyId: string, pagination: { page: number; pageSize: number }) {
    const { page, pageSize } = pagination;
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where: { companyId },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.payment.count({ where: { companyId } }),
    ]);
    return { items, total, page, pageSize };
  }

  async listAll(
    pagination: { page: number; pageSize: number },
    filters?: { companyId?: string; from?: Date; to?: Date },
  ) {
    const { page, pageSize } = pagination;
    const where = {
      ...(filters?.companyId ? { companyId: filters.companyId } : {}),
      ...(filters?.from || filters?.to
        ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: { company: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}
