import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { AccountingService } from "./accounting.service";
import { AccountingController } from "./accounting.controller";
@Module({imports:[AuditLogModule],controllers:[AccountingController],providers:[AccountingService]})
export class AccountingModule {}
