import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { DrainingService } from "../../common/runtime/draining.service";

@Module({
  controllers: [HealthController],
  providers: [HealthService, DrainingService],
  exports: [DrainingService],
})
export class HealthModule {}
