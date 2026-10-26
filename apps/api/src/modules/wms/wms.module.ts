import { WarehouseBootstrapService } from "./warehouse-bootstrap.service";
import { WarehouseBootstrapController } from "./warehouse-bootstrap.controller";
import { WarehouseManagementService } from "./warehouse-management.service";
import { WarehouseManagementController } from "./warehouse-management.controller";
import { WmsCoverageService } from "./wms-coverage.service";
import { RieModule } from "../rie/rie.module";
import {ProcurementController} from "./procurement.controller";
import {ProcurementService} from "./procurement.service";
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
import { SmartLoadingRequestsController } from "./smart-loading-requests.controller";
@Module({imports:[AuditLogModule,RieModule],controllers:[ProcurementController,WmsController,WmsOperationsController,WmsCoreController,WmsCountController,WmsQuarantineController,SmartLoadingRequestsController,WarehouseManagementController,WarehouseBootstrapController],providers:[WmsCoverageService,ProcurementService,WmsService,WmsOperationsService,WmsCoreService,WmsCountService,WmsQuarantineService,WarehouseManagementService,WarehouseBootstrapService]})
export class WmsModule {}
