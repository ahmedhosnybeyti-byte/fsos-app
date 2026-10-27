import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequiresSfa } from "../../common/decorators/requires-sfa.decorator";
import { CompanyScreen } from "../../common/decorators/company-screen.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { SupplierMasterService } from "./supplier-master.service";

@Controller("sfa/wms/warehouses/:warehouse/suppliers")
@Auth("COMPANY_ADMIN", "MANAGER", "SUPERVISOR", "SALES_REP", "WAREHOUSE_KEEPER", "WAREHOUSE_MANAGER", "PROCUREMENT")
@RequiresSfa("wms.read")
@CompanyScreen("warehouse-core")
export class SupplierMasterController {
  constructor(private readonly service: SupplierMasterService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Param("warehouse") warehouse: string, @Query() input: unknown) {
    return this.service.list(user, warehouse, input);
  }
  @Post() @RequiresSfa("wms.receiving.create")
  create(@CurrentUser() user: AuthenticatedUser, @Param("warehouse") warehouse: string, @Body() input: unknown) {
    return this.service.create(user, warehouse, input);
  }
}
