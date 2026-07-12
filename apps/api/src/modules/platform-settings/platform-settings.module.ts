import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { PlatformSettingsService } from "./platform-settings.service";
import { PlatformSettingsController } from "./platform-settings.controller";

@Module({
  imports: [AuditLogModule],
  providers: [PlatformSettingsService],
  controllers: [PlatformSettingsController],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
