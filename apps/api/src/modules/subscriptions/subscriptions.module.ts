import { Module } from "@nestjs/common";
import { PlansModule } from "../plans/plans.module";
import { PlatformSettingsModule } from "../platform-settings/platform-settings.module";
import { SubscriptionsService } from "./subscriptions.service";
import { SubscriptionsController } from "./subscriptions.controller";

@Module({
  imports: [PlansModule, PlatformSettingsModule],
  providers: [SubscriptionsService],
  controllers: [SubscriptionsController],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
