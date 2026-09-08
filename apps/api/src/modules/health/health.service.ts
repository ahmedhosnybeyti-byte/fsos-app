import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma";
import { DrainingService } from "../../common/runtime/draining.service";

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly draining: DrainingService,
  ) {}

  async isReady(): Promise<boolean> {
    if (this.draining.isDraining()) return false;
    try {
      // Readiness must prove the operational database is reachable, not only
      // that this Node process is alive. No application data is read.
      await this.prisma.$queryRawUnsafe("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }
}
