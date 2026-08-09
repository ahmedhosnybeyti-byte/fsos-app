import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { RolesService } from "./roles.service";
import { RolesController } from "./roles.controller";
import { UserActivityModule } from "../user-activity/user-activity.module";

@Module({
  imports: [AuditLogModule, UserActivityModule],
  providers: [RolesService],
  controllers: [RolesController],
  exports: [RolesService],
})
export class RolesModule {}
