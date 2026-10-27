import { Body,Controller,Get,Param,Post,Query } from "@nestjs/common";
import { Auth } from "../../common/decorators/auth.decorator";
import { RequiresSfa } from "../../common/decorators/requires-sfa.decorator";
import { CompanyScreen } from "../../common/decorators/company-screen.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { WmsOperationsService } from "./wms-operations.service";

@Controller("sfa/wms/warehouses/:warehouse")
@Auth("COMPANY_ADMIN","MANAGER","SUPERVISOR","SALES_REP","WAREHOUSE_KEEPER","WAREHOUSE_MANAGER","PROCUREMENT")
@RequiresSfa("wms.read")
@CompanyScreen("warehouse-core")
export class WmsOperationsController {
  constructor(private readonly service:WmsOperationsService){}
  // Command-specific permission is selected from the fixed shared operation map
  // inside the service; never from an input permission string.
  @Post("commands") command(@CurrentUser() u:AuthenticatedUser,@Param("warehouse") w:string,@Body() b:unknown){return this.service.command(u,w,b);}
  @Get("receipts") receipts(@CurrentUser() u:AuthenticatedUser,@Param("warehouse") w:string,@Query() q:unknown){return this.service.list(u,w,"receipt",q);}
  @Get("receipts/:id") receipt(@CurrentUser() u:AuthenticatedUser,@Param("warehouse") w:string,@Param("id") id:string){return this.service.receipt(u,w,id);}
  @Get("loads") loads(@CurrentUser() u:AuthenticatedUser,@Param("warehouse") w:string,@Query() q:unknown){return this.service.list(u,w,"load",q);}
  @Get("loads/:id") load(@CurrentUser() u:AuthenticatedUser,@Param("warehouse") w:string,@Param("id") id:string){return this.service.load(u,w,id);}
  @Get("fefo") fefo(@CurrentUser() u:AuthenticatedUser,@Param("warehouse") w:string,@Query() q:unknown){return this.service.fefo(u,w,q);}
  @Get("recipients") recipients(@CurrentUser() u:AuthenticatedUser,@Param("warehouse") w:string,@Query() q:unknown){return this.service.recipients(u,w,q);}
  @Get("customer-policies") policies(@CurrentUser() u:AuthenticatedUser,@Param("warehouse") w:string,@Query() q:unknown){return this.service.policies(u,w,q);}
  @Post("customer-policies") @RequiresSfa("wms.policy.manage")
  policy(@CurrentUser() u:AuthenticatedUser,@Param("warehouse") w:string,@Body() b:unknown){return this.service.setPolicy(u,w,b);}
}
