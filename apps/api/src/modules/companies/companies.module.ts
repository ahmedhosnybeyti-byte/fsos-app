import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { GovernanceModule } from "../governance/governance.module";
import { CompaniesService } from "./companies.service";
import { CompaniesController } from "./companies.controller";
import { BranchesController } from "./branches.controller";
import { OrgUnitTypesService } from "./org-unit-types.service";
import { OrgUnitTypesController } from "./org-unit-types.controller";
import { OrgUnitsService } from "./org-units.service";
import { OrgUnitsController } from "./org-units.controller";

@Module({
  imports: [AuditLogModule, GovernanceModule],
  providers: [CompaniesService, OrgUnitTypesService, OrgUnitsService],
  controllers: [CompaniesController, BranchesController, OrgUnitTypesController, OrgUnitsController],
  exports: [CompaniesService, OrgUnitsService, OrgUnitTypesService],
})
export class CompaniesModule {}
