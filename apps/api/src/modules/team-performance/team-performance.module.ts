import { Module } from "@nestjs/common";
import { RieModule } from "../rie/rie.module";
import { TeamPerformanceService } from "./team-performance.service";
import { TeamPerformanceController } from "./team-performance.controller";

// Migration #7 (ADR-001 / RIE Migration Plan) — query()/coach() now read
// via RieFacade. FilesModule and PrismaService are no longer dependencies
// of this module at all (Employees carries rep/supervisor names and emails
// directly, no platform User lookup needed).
@Module({
  imports: [RieModule],
  providers: [TeamPerformanceService],
  controllers: [TeamPerformanceController],
  exports: [TeamPerformanceService],
})
export class TeamPerformanceModule {}
