import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { CompaniesModule } from "../companies/companies.module";
import { GovernanceModule } from "../governance/governance.module";
import { RieModule } from "../rie/rie.module";
import { EmployeesService } from "./employees.service";
import { EmployeeExportService } from "./employee-export.service";
import { EmployeesController } from "./employees.controller";

@Module({
  imports: [AuditLogModule, CompaniesModule, GovernanceModule, RieModule],
  providers: [EmployeesService, EmployeeExportService],
  controllers: [EmployeesController],
  exports: [EmployeesService],
})
export class EmployeesModule {}
