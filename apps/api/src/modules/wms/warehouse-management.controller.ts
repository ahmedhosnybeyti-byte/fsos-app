import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequiresSfa } from "../../common/decorators/requires-sfa.decorator";
import { CompanyScreen } from "../../common/decorators/company-screen.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { WarehouseManagementService } from "./warehouse-management.service";

// Separate from COMPANY_ADMIN's existing setup contract and permissions.
@Controller("sfa/wms/registry/warehouses")
@Auth("WAREHOUSE_MANAGER")
@RequiresSfa("wms.read", "wms.warehouses.manage")
@CompanyScreen("warehouse-core")
export class WarehouseManagementController {
  constructor(private readonly service: WarehouseManagementService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) { return this.service.list(user, query); }
  @Get(":id") get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.service.get(user, id); }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) { return this.service.create(user, body); }
  @Patch(":id") update(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: unknown) { return this.service.update(user, id, body); }
}
