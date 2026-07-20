import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { GovernanceModule } from "../governance/governance.module";
import { DataSourceTypesService } from "./data-source-types.service";
import { DataSourceTypesController } from "./data-source-types.controller";
import { DataSourcesService } from "./data-sources.service";
import { DataSourcesController } from "./data-sources.controller";

@Module({
  imports: [AuditLogModule, GovernanceModule],
  providers: [DataSourceTypesService, DataSourcesService],
  controllers: [DataSourceTypesController, DataSourcesController],
  exports: [DataSourcesService, DataSourceTypesService],
})
export class DataSourcesModule {}
