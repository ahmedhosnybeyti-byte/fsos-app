import {WmsCoreService} from "./wms-core.service";
import {WmsCoreController} from "./wms-core.controller";
import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { WmsController } from "./wms.controller";
import { WmsService } from "./wms.service";
import { WmsOperationsController } from "./wms-operations.controller";
import { WmsOperationsService } from "./wms-operations.service";
@Module({imports:[AuditLogModule],controllers:[WmsController,WmsOperationsController,WmsCoreController],providers:[WmsService,WmsOperationsService,WmsCoreService]})
export class WmsModule {}
