import { Injectable } from "@nestjs/common";
import type { Prisma } from "@field-sales-os/database";
import type { RenderAnalysisEventInput } from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma";

const RECENT_EVENTS_LIMIT = 50;

// Reuses the AiReport table — it was built specifically as "a stub table so
// persisting GPT-generated analysis output later needs zero migration."
// This is that later: content holds { narrative, blocks }, exactly the
// render-event payload the GPT posts via POST /gpt/render.
const REPORT_TYPE = "analysis_studio_render";

@Injectable()
export class AnalysisEventService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: { companyId: string; userId: string; gptId?: string; event: RenderAnalysisEventInput }) {
    return this.prisma.aiReport.create({
      data: {
        companyId: params.companyId,
        userId: params.userId,
        reportType: REPORT_TYPE,
        content: params.event as unknown as Prisma.InputJsonValue,
      },
    });
  }

  // Analysis Studio polls this — events for the CURRENT user only, so one
  // company member's GPT conversation never bleeds into a teammate's view.
  listRecentForUser(companyId: string, userId: string) {
    return this.prisma.aiReport.findMany({
      where: { companyId, userId, reportType: REPORT_TYPE },
      orderBy: { createdAt: "desc" },
      take: RECENT_EVENTS_LIMIT,
    });
  }
}
