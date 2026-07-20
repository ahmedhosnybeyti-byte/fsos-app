import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { CompaniesModule } from "../companies/companies.module";
import { GovernanceModule } from "../governance/governance.module";
import { EmployeesService } from "./employees.service";
import { EmployeesController } from "./employees.controller";

@Module({
  imports: [AuditLogModule, CompaniesModule, GovernanceModule],
  providers: [EmployeesService],
  controllers: [EmployeesController],
  exports: [EmployeesService],
})
export class EmployeesModule {}
