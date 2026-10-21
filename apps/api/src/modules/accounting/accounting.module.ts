import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { AccountingService } from "./accounting.service";
import { AccountingController } from "./accounting.controller";
import { AccountingSubledgerService } from "./accounting-subledger.service";
import { AccountingSubledgerController } from "./accounting-subledger.controller";
@Module({imports:[AuditLogModule],controllers:[AccountingController,AccountingSubledgerController],providers:[AccountingService,AccountingSubledgerService]})
export class AccountingModule {}
