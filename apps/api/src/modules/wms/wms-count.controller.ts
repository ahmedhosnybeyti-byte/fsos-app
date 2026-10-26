import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Auth } from "../../common/decorators/auth.decorator";
import { RequiresSfa } from "../../common/decorators/requires-sfa.decorator";
import { CompanyScreen } from "../../common/decorators/company-screen.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { WmsCountService } from "./wms-count.service";

@Controller("sfa/wms/warehouses/:warehouse/counts")
@Auth("COMPANY_ADMIN","MANAGER","SUPERVISOR","SALES_REP","WAREHOUSE_KEEPER","WAREHOUSE_MANAGER","PROCUREMENT")
@RequiresSfa("wms.read")
@CompanyScreen("warehouse-core")
export class WmsCountController {
  constructor(private readonly counts: WmsCountService) {}
  @Get("candidates") candidates(@CurrentUser() u: AuthenticatedUser, @Param("warehouse") w: string, @Query() q: unknown) { return this.counts.candidates(u, w, q); }
  @Get() list(@CurrentUser() u: AuthenticatedUser, @Param("warehouse") w: string, @Query() q: unknown) { return this.counts.list(u, w, q); }
  @Get(":id") detail(@CurrentUser() u: AuthenticatedUser, @Param("warehouse") w: string, @Param("id") id: string) { return this.counts.detail(u, w, id); }
  @Post() @RequiresSfa("wms.count.create") create(@CurrentUser() u: AuthenticatedUser, @Param("warehouse") w: string, @Body() b: unknown) { return this.counts.command(u, w, "CREATE", b); }
  @Post(":id/approve") @RequiresSfa("wms.count.approve") approve(@CurrentUser() u: AuthenticatedUser, @Param("warehouse") w: string, @Param("id") id: string, @Body() b: unknown) { return this.counts.command(u, w, "APPROVE", b, id); }
  @Post(":id/cancel") @RequiresSfa("wms.count.create") cancel(@CurrentUser() u: AuthenticatedUser, @Param("warehouse") w: string, @Param("id") id: string, @Body() b: unknown) { return this.counts.command(u, w, "CANCEL", b, id); }
}
