import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { CompanyPolicyService } from "./company-policy.service";
import { CompanyPolicyController } from "./company-policy.controller";
import { ComplianceService } from "./compliance.service";
import { ComplianceController } from "./compliance.controller";
import { ObservabilityService } from "./observability.service";
import { ObservabilityController } from "./observability.controller";
import { PlatformEventsService } from "./platform-events.service";

// Phase 9 — Security, Governance & Audit. A leaf module: depends only on
// AuditLogModule (already a dependency of virtually every Company
// Management module), so any other module can safely import
// GovernanceModule to get PlatformEventsService without risking a cycle.
@Module({
  imports: [AuditLogModule],
  providers: [CompanyPolicyService, ComplianceService, ObservabilityService, PlatformEventsService],
  controllers: [CompanyPolicyController, ComplianceController, ObservabilityController],
  exports: [CompanyPolicyService, ComplianceService, ObservabilityService, PlatformEventsService],
})
export class GovernanceModule {}
