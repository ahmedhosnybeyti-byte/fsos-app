import { Injectable } from "@nestjs/common";
import type { Prisma } from "@field-sales-os/database";
import type { GptUsageEventType } from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma";

export interface RecordUsageEventParams {
  companyId: string;
  userId?: string;
  gptId?: string;
  eventType: GptUsageEventType;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class UsageAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async recordEvent(params: RecordUsageEventParams) {
    await this.prisma.gptUsageEvent.create({
      data: {
        companyId: params.companyId,
        userId: params.userId,
        gptId: params.gptId,
        eventType: params.eventType,
        metadata: params.metadata,
      },
    });
  }

  async getCompanyStats(companyId: string) {
    const [eventCounts, activeUsers, activeFiles] = await Promise.all([
      this.prisma.gptUsageEvent.groupBy({
        by: ["eventType"],
        where: { companyId },
        _count: { _all: true },
      }),
      this.prisma.user.count({ where: { companyId, status: "ACTIVE" } }),
      this.prisma.file.count({ where: { companyId, isActive: true } }),
    ]);

    return {
      eventCounts: Object.fromEntries(eventCounts.map((e) => [e.eventType, e._count._all])),
      activeUsers,
      activeFiles,
    };
  }

  async getPlatformStats() {
    const [companiesCount, usersCount, subscriptionsByStatus, totalEvents] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.user.count(),
      this.prisma.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.gptUsageEvent.count(),
    ]);

    return {
      companiesCount,
      usersCount,
      subscriptionsByStatus: Object.fromEntries(subscriptionsByStatus.map((s) => [s.status, s._count._all])),
      totalEvents,
    };
  }
}
