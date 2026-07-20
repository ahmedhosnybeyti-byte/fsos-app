import { Module } from "@nestjs/common";
import { RieModule } from "../rie/rie.module";
import { SgiService } from "./sgi.service";
import { SgiController } from "./sgi.controller";

// Migration #8 (ADR-001 / RIE Migration Plan) — sales/collection reads now
// go through RieFacade. FilesModule is no longer a dependency; PrismaService
// (for Target/User/AiReport) is @Global() via PrismaModule, not imported
// here, same convention as team-performance.module.ts.
@Module({
  imports: [RieModule],
  providers: [SgiService],
  controllers: [SgiController],
  exports: [SgiService],
})
export class SgiModule {}
