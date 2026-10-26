import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequiresSfa } from "../../common/decorators/requires-sfa.decorator";
import { CompanyScreen } from "../../common/decorators/company-screen.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { WmsService } from "./wms.service";
import { WmsCoverageService } from "./wms-coverage.service";

@Controller("sfa/wms")
@Auth("COMPANY_ADMIN","MANAGER","SUPERVISOR","SALES_REP","WAREHOUSE_KEEPER","PROCUREMENT")
@RequiresSfa("wms.read")
@CompanyScreen("warehouse-core")
export class WmsController {
  constructor(private readonly service: WmsService, private readonly intelligence: WmsCoverageService) {}
  @Get("warehouses/:warehouse/coverage") coverage(@CurrentUser() u: AuthenticatedUser,@Param("warehouse") w: string,@Query() q: unknown) { return this.intelligence.coverage(u,w,q); }
  @Get("warehouses") warehouses(@CurrentUser() u: AuthenticatedUser,@Query() q: unknown) { return this.service.warehouses(u,q); }
  @Get("warehouses/:warehouse/summary") summary(@CurrentUser() u: AuthenticatedUser,@Param("warehouse") w: string,@Query() q: unknown) { return this.service.summary(u,w,q); }
  @Get("warehouses/:warehouse/products") products(@CurrentUser() u: AuthenticatedUser,@Param("warehouse") w: string,@Query() q: unknown) { return this.service.products(u,w,q); }
  @Get("warehouses/:warehouse/batches") batches(@CurrentUser() u: AuthenticatedUser,@Param("warehouse") w: string,@Query() q: unknown) { return this.service.batches(u,w,q); }
  @Get("warehouses/:warehouse/movements") movements(@CurrentUser() u: AuthenticatedUser,@Param("warehouse") w: string,@Query() q: unknown) { return this.service.movements(u,w,q); }
  @Post("warehouses/:warehouse/products") @RequiresSfa("wms.products.manage")
  createProduct(@CurrentUser() u: AuthenticatedUser,@Param("warehouse") w: string,@Body() b: unknown) { return this.service.saveProduct(u,w,b); }
  @Patch("warehouses/:warehouse/products/:id") @RequiresSfa("wms.products.manage")
  updateProduct(@CurrentUser() u: AuthenticatedUser,@Param("warehouse") w: string,@Param("id") id: string,@Body() b: unknown) { return this.service.saveProduct(u,w,b,id); }
  @Post("warehouses/:warehouse/batches") @RequiresSfa("wms.products.manage")
  createBatch(@CurrentUser() u: AuthenticatedUser,@Param("warehouse") w: string,@Body() b: unknown) { return this.service.createBatch(u,w,b); }
  @Post("warehouses/:warehouse/openings") @RequiresSfa("wms.opening.post")
  opening(@CurrentUser() u: AuthenticatedUser,@Param("warehouse") w: string,@Body() b: unknown) { return this.service.postOpening(u,w,b); }
  @Post("warehouses/:warehouse/movements/:id/reverse") @RequiresSfa("wms.opening.post")
  reverse(@CurrentUser() u: AuthenticatedUser,@Param("warehouse") w: string,@Param("id") id: string,@Body() b: unknown) { return this.service.reverseOpening(u,w,id,b); }
  @Get("warehouses/:warehouse/access") @Auth("COMPANY_ADMIN") @RequiresSfa("wms.access.manage")
  accessUsers(@CurrentUser() u: AuthenticatedUser,@Param("warehouse") w: string,@Query() q: unknown) { return this.service.accessUsers(u,w,q); }
  @Post("warehouses/:warehouse/access") @Auth("COMPANY_ADMIN") @RequiresSfa("wms.access.manage")
  access(@CurrentUser() u: AuthenticatedUser,@Param("warehouse") w: string,@Body() b: unknown) { return this.service.setAccess(u,w,b); }
}
