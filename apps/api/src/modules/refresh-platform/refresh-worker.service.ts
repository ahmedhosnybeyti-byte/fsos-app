import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { PrismaService } from "../../common/prisma";
import { RefreshOrchestratorService } from "./refresh-orchestrator.service";

const POLL_INTERVAL_MS = 1_000;
const STALE_RUNNING_AFTER_MS = 5 * 60_000;

@Injectable()
export class RefreshWorkerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RefreshWorkerService.name);
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: RefreshOrchestratorService,
  ) {}

  async onApplicationBootstrap() {
    const recovered = await this.orchestrator.recoverStaleRunningRuns(new Date(Date.now() - STALE_RUNNING_AFTER_MS));
    if (recovered > 0) this.logger.warn(`Requeued ${recovered} stale refresh run(s) after startup recovery`);
  }

  @Interval(POLL_INTERVAL_MS)
  async processNextQueuedRun() {
    if (this.processing) return;
    this.processing = true;
    try {
      const next = await this.prisma.refreshRun.findFirst({
        where: { status: "QUEUED" },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (next) await this.orchestrator.processQueuedRun(next.id);
    } finally {
      this.processing = false;
    }
  }
}
