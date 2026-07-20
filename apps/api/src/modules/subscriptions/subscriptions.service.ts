import { Injectable, NotFoundException } from "@nestjs/common";
import type { UpdateSubscriptionInput } from "@field-sales-os/schemas";
import { PrismaService, type PrismaTx } from "../../common/prisma";
import { PlansService } from "../plans/plans.service";
import { PlatformSettingsService } from "../platform-settings/platform-settings.service";

const subscriptionInclude = { plan: true } as const;

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plansService: PlansService,
    private readonly platformSettingsService: PlatformSettingsService,
  ) {}

  // Every new company gets a subscription — what kind is entirely
  // platform-configured (PlatformSettings), never hardcoded here:
  //   - trial enabled + auto-start on  -> TRIAL, dated per the configured
  //     duration, on the configured default plan
  //   - trial disabled OR auto-start off -> subscription exists but gated
  //     (SUSPENDED) until a SUPER_ADMIN activates it or a future payment
  //     flow does. Reuses the existing status rather than inventing one.
  // Composable inside AuthService's registration transaction via `tx`.
  async createInitialSubscription(companyId: string, tx: PrismaTx = this.prisma) {
    const settings = await this.platformSettingsService.get();
    const plan = await this.plansService.findByCodeOrThrow(settings.defaultPlanCode);
    const willAutoStartTrial = settings.trialEnabled && settings.autoStartTrialOnRegistration;

    if (willAutoStartTrial) {
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + settings.trialDurationDays);

      return tx.subscription.create({
        data: { companyId, planId: plan.id, status: "TRIAL", paymentStatus: "UNPAID", trialEndsAt },
        include: subscriptionInclude,
      });
    }

    return tx.subscription.create({
      data: { companyId, planId: plan.id, status: "SUSPENDED", paymentStatus: "UNPAID" },
      include: subscriptionInclude,
    });
  }

  findCurrentForCompany(companyId: string, tx: PrismaTx = this.prisma) {
    return tx.subscription.findFirst({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      include: subscriptionInclude,
    });
  }

  // Single source of truth for "is this company allowed to use the product
  // right now" — shared by SubscriptionActiveGuard (session routes) and
  // GptService (Action routes) so the two enforcement points can never drift.
  async isCompanyActive(companyId: string, tx: PrismaTx = this.prisma): Promise<boolean> {
    const subscription = await this.findCurrentForCompany(companyId, tx);
    return !!subscription && (subscription.status === "TRIAL" || subscription.status === "ACTIVE");
  }

  async listAll(pagination: { page: number; pageSize: number }) {
    const { page, pageSize } = pagination;
    const [items, total] = await Promise.all([
      this.prisma.subscription.findMany({
        include: { ...subscriptionInclude, company: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.subscription.count(),
    ]);
    return { items, total, page, pageSize };
  }

  async updateForCompany(companyId: string, dto: UpdateSubscriptionInput) {
    const current = await this.findCurrentForCompany(companyId);
    if (!current) throw new NotFoundException("Company has no subscription");

    const planId = dto.planCode ? (await this.plansService.findByCodeOrThrow(dto.planCode)).id : undefined;

    return this.prisma.subscription.update({
      where: { id: current.id },
      data: {
        planId,
        status: dto.status,
        paymentStatus: dto.paymentStatus,
        currentPeriodEnd: dto.currentPeriodEnd,
        trialEndsAt: dto.trialEndsAt,
        canceledAt: dto.status === "SUSPENDED" || dto.status === "EXPIRED" ? new Date() : undefined,
      },
      include: subscriptionInclude,
    });
  }

  // Hourly sweep — see ScheduledTasksModule. Flips TRIAL/ACTIVE subscriptions
  // past their end date to EXPIRED and returns the affected company IDs so
  // the caller can revoke sessions/launch tokens for them in the same beat.
  async expireDueSubscriptions(tx: PrismaTx = this.prisma): Promise<string[]> {
    const now = new Date();
    const due = await tx.subscription.findMany({
      where: {
        status: { in: ["TRIAL", "ACTIVE"] },
        OR: [
          { status: "TRIAL", trialEndsAt: { lt: now } },
          { status: "ACTIVE", currentPeriodEnd: { lt: now } },
        ],
      },
      select: { id: true, companyId: true },
    });

    if (due.length === 0) return [];

    await tx.subscription.updateMany({
      where: { id: { in: due.map((d) => d.id) } },
      data: { status: "EXPIRED" },
    });

    return due.map((d) => d.companyId);
  }
}
