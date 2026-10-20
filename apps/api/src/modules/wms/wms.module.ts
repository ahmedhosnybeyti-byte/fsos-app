import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { WmsController } from "./wms.controller";
import { WmsService } from "./wms.service";
@Module({imports:[AuditLogModule],controllers:[WmsController],providers:[WmsService]})
export class WmsModule {}
