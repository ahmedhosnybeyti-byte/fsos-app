import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma";

// Phase 8 — Refresh History. Simple read surface over RefreshRun; the
// Orchestrator is the only writer.
@Injectable()
export class RefreshHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string, dataSourceId?: string) {
    return this.prisma.refreshRun.findMany({
      where: { companyId, ...(dataSourceId ? { dataSourceId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async getOne(companyId: string, id: string) {
    const run = await this.prisma.refreshRun.findFirst({ where: { id, companyId } });
    if (!run) throw new NotFoundException("Refresh run not found");
    return run;
  }
}
