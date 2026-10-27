import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Auth } from "../../common/decorators/auth.decorator";
import { RequiresSfa } from "../../common/decorators/requires-sfa.decorator";
import { CompanyScreen } from "../../common/decorators/company-screen.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { WmsService } from "./wms.service";
import { WmsOperationsService } from "./wms-operations.service";

// A narrow submission gateway for every FULL_ERP company. Warehouse assignment
// is checked per user; the general warehouse API keeps its existing permissions.
@Controller("smart-loading/warehouse-requests")
@Auth("SALES_REP")
@RequiresSfa()
@CompanyScreen("smart-loading")
export class SmartLoadingRequestsController {
  constructor(private readonly access:WmsService,private readonly operations:WmsOperationsService){}
  @Get("warehouses") warehouses(@CurrentUser() user:AuthenticatedUser,@Query() query:unknown){
    return this.access.loadingRequestWarehouses(user,query);
  }
  @Post("warehouses/:warehouse") send(@CurrentUser() user:AuthenticatedUser,@Param("warehouse") warehouse:string,@Body() body:unknown){
    return this.operations.smartLoadingRequest(user,warehouse,body);
  }
  @Get("mine") mine(@CurrentUser() user:AuthenticatedUser,@Query() query:unknown){return this.operations.recipientLoads(user,query);}
  @Get("warehouses/:warehouse/loads/:id") detail(@CurrentUser() user:AuthenticatedUser,@Param("warehouse") warehouse:string,@Param("id") id:string){return this.operations.recipientLoad(user,warehouse,id);}
  @Post("warehouses/:warehouse/loads/:id/decision") decision(@CurrentUser() user:AuthenticatedUser,@Param("warehouse") warehouse:string,@Param("id") id:string,@Body() body:unknown){return this.operations.recipientDecision(user,warehouse,id,body);}
}
