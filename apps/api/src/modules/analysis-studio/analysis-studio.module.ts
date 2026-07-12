import { Module } from "@nestjs/common";
import { AnalysisEventService } from "./analysis-event.service";
import { AnalysisStudioController } from "./analysis-studio.controller";

@Module({
  providers: [AnalysisEventService],
  controllers: [AnalysisStudioController],
  exports: [AnalysisEventService],
})
export class AnalysisStudioModule {}
