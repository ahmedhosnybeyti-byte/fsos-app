import { Module } from "@nestjs/common";
import { RolesModule } from "../roles/roles.module";
import { CompaniesModule } from "../companies/companies.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { RieModule } from "../rie/rie.module";
import { UserActivityModule } from "../user-activity/user-activity.module";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";

@Module({
  imports: [RolesModule, CompaniesModule, AuditLogModule, RieModule, UserActivityModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
