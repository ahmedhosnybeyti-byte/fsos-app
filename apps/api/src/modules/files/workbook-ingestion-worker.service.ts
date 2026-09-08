import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { PrismaService } from "../../common/prisma";
import { FilesService } from "./files.service";

const POLL_INTERVAL_MS = 1_000;
const STALE_RUNNING_AFTER_MS = 15 * 60_000;

/** Durable workbook queue consumer. Safe to run in every API replica. */
@Injectable()
export class WorkbookIngestionWorkerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WorkbookIngestionWorkerService.name);
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
  ) {}

  async onApplicationBootstrap() {
    const recovered = await this.filesService.recoverStaleWorkbookRuns(new Date(Date.now() - STALE_RUNNING_AFTER_MS));
    if (recovered > 0) this.logger.warn(`Requeued ${recovered} stale workbook ingestion run(s)`);
  }

  @Interval(POLL_INTERVAL_MS)
  async processNextQueuedRun() {
    if (this.processing) return;
    this.processing = true;
    try {
      const run = await this.prisma.workbookIngestionRun.findFirst({
        where: { status: "QUEUED" },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (run) await this.filesService.processQueuedWorkbookRun(run.id);
    } finally {
      this.processing = false;
    }
  }
}
