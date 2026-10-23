import {Body,Controller,Get,Param,Post,Query} from "@nestjs/common";
import {Auth} from "../../common/decorators/auth.decorator";
import {RequiresSfa} from "../../common/decorators/requires-sfa.decorator";
import {CompanyScreen} from "../../common/decorators/company-screen.decorator";
import {CurrentUser} from "../../common/decorators/current-user.decorator";
import type {AuthenticatedUser} from "../../common/types/authenticated-user";
import {ProcurementService} from "./procurement.service";
@Controller("sfa/procurement/warehouses/:warehouse")
@Auth("COMPANY_ADMIN","MANAGER","SUPERVISOR","SALES_REP","PROCUREMENT")
@RequiresSfa("procurement.read","wms.read")
@CompanyScreen("procurement")
export class ProcurementController {
 constructor(private readonly service:ProcurementService){}
 @Get("summary") summary(@CurrentUser()u:AuthenticatedUser,@Param("warehouse")w:string){return this.service.summary(u,w);}
 @Get("requests") list(@CurrentUser()u:AuthenticatedUser,@Param("warehouse")w:string,@Query()q:unknown){return this.service.list(u,w,q);}
 @Get("requests/:id") detail(@CurrentUser()u:AuthenticatedUser,@Param("warehouse")w:string,@Param("id")id:string){return this.service.detail(u,w,id);}
 @Get("suppliers") suppliers(@CurrentUser()u:AuthenticatedUser,@Param("warehouse")w:string,@Query()q:unknown){return this.service.suppliers(u,w,q);}
 @Post("commands") command(@CurrentUser()u:AuthenticatedUser,@Param("warehouse")w:string,@Body()b:unknown){return this.service.command(u,w,b);}
}
