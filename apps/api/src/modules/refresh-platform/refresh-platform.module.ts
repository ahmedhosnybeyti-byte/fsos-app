import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { DataSourcePlatformModule } from "../data-source-platform/data-source-platform.module";
import { GovernanceModule } from "../governance/governance.module";
import { ImportEngineService } from "./import-engine.service";
import { RefreshOrchestratorService } from "./refresh-orchestrator.service";
import { RefreshHistoryService } from "./refresh-history.service";
import { RefreshPlatformController } from "./refresh-platform.controller";

// Phase 8 — Refresh Platform. Built entirely on top of the Phase 7 Data
// Source Platform module; imports it as a dependency rather than duplicating
// any of its logic. No existing engine module imports anything from here.
@Module({
  imports: [DataSourcePlatformModule, AuditLogModule, GovernanceModule],
  providers: [ImportEngineService, RefreshOrchestratorService, RefreshHistoryService],
  controllers: [RefreshPlatformController],
  exports: [RefreshOrchestratorService, RefreshHistoryService],
})
export class RefreshPlatformModule {}
