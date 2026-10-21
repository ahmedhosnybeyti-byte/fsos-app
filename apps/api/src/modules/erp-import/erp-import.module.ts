import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module";
import { RieModule } from "../rie/rie.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { ErpImportService } from "./erp-import.service";
import { ErpImportController } from "./erp-import.controller";
import { ErpImportWorker } from "./erp-import.worker";
@Module({imports:[FilesModule,RieModule,AuditLogModule],providers:[ErpImportService,ErpImportWorker],controllers:[ErpImportController]})
export class ErpImportModule {}
