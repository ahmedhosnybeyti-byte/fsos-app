import { Module } from "@nestjs/common";
import { UsageAnalyticsService } from "./usage-analytics.service";
import { UsageAnalyticsController } from "./usage-analytics.controller";

@Module({
  providers: [UsageAnalyticsService],
  controllers: [UsageAnalyticsController],
  exports: [UsageAnalyticsService],
})
export class UsageAnalyticsModule {}
