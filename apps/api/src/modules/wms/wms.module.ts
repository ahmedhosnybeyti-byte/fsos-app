import {WmsCoreService} from "./wms-core.service";
import {WmsCoreController} from "./wms-core.controller";
import { WmsCountController } from "./wms-count.controller";
import { WmsCountService } from "./wms-count.service";
import { WmsQuarantineController } from "./wms-quarantine.controller";
import { WmsQuarantineService } from "./wms-quarantine.service";
import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { WmsController } from "./wms.controller";
import { WmsService } from "./wms.service";
import { WmsOperationsController } from "./wms-operations.controller";
import { WmsOperationsService } from "./wms-operations.service";
@Module({imports:[AuditLogModule],controllers:[WmsController,WmsOperationsController,WmsCoreController,WmsCountController,WmsQuarantineController],providers:[WmsService,WmsOperationsService,WmsCoreService,WmsCountService,WmsQuarantineService]})
export class WmsModule {}
