import { Module } from "@nestjs/common";
import { RieModule } from "../rie/rie.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { SalesDraftsController } from "./sales-drafts.controller";
import { SalesDraftsService } from "./sales-drafts.service";
import { SalesPriceExceptionsController } from "./sales-price-exceptions.controller";
import { SalesPriceExceptionsService } from "./sales-price-exceptions.service";
@Module({imports:[RieModule,AuditLogModule],controllers:[SalesDraftsController,SalesPriceExceptionsController],providers:[SalesDraftsService,SalesPriceExceptionsService]})
export class SalesDraftsModule {}
