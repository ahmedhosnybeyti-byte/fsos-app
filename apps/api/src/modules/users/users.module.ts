import { Module } from "@nestjs/common";
import { RolesModule } from "../roles/roles.module";
import { CompaniesModule } from "../companies/companies.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";

@Module({
  imports: [RolesModule, CompaniesModule, AuditLogModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
