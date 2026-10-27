import { Module } from "@nestjs/common";
import { RieModule } from "../rie/rie.module";
import { FilesModule } from "../files/files.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { VisitCopilotModule } from "../visit-copilot/visit-copilot.module";
import { VisitExecutionController } from "./visit-execution.controller";
import { VisitExecutionService } from "./visit-execution.service";
import { SalesDraftsModule } from "../sales-drafts/sales-drafts.module";

@Module({ imports: [RieModule, FilesModule, AuditLogModule, VisitCopilotModule, SalesDraftsModule], controllers: [VisitExecutionController], providers: [VisitExecutionService] })
export class VisitExecutionModule {}
