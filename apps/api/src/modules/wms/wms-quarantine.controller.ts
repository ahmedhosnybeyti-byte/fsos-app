import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Auth } from "../../common/decorators/auth.decorator";
import { RequiresSfa } from "../../common/decorators/requires-sfa.decorator";
import { CompanyScreen } from "../../common/decorators/company-screen.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { WmsQuarantineService } from "./wms-quarantine.service";
@Controller("sfa/wms/warehouses/:warehouse/quarantines")
@Auth("COMPANY_ADMIN","MANAGER","SUPERVISOR","SALES_REP")
@RequiresSfa("wms.read")
@CompanyScreen("warehouse-core")
export class WmsQuarantineController {
 constructor(private readonly service:WmsQuarantineService){}
 @Get("candidates") candidates(@CurrentUser()u:AuthenticatedUser,@Param("warehouse")w:string,@Query()q:unknown){return this.service.candidates(u,w,q);}
 @Get() list(@CurrentUser()u:AuthenticatedUser,@Param("warehouse")w:string,@Query()q:unknown){return this.service.list(u,w,q);}
 @Get(":id") detail(@CurrentUser()u:AuthenticatedUser,@Param("warehouse")w:string,@Param("id")id:string){return this.service.detail(u,w,id);}
 @Get(":id/events") events(@CurrentUser()u:AuthenticatedUser,@Param("warehouse")w:string,@Param("id")id:string,@Query()q:unknown){return this.service.events(u,w,id,q);}
 @Post() @RequiresSfa("wms.quarantine.hold") hold(@CurrentUser()u:AuthenticatedUser,@Param("warehouse")w:string,@Body()b:unknown){return this.service.command(u,w,"HOLD",b);}
 @Post(":id/release") @RequiresSfa("wms.quarantine.release") release(@CurrentUser()u:AuthenticatedUser,@Param("warehouse")w:string,@Param("id")id:string,@Body()b:unknown){return this.service.command(u,w,"RELEASE",b,id);}
 @Post(":id/write-off") @RequiresSfa("wms.quarantine.writeoff") writeOff(@CurrentUser()u:AuthenticatedUser,@Param("warehouse")w:string,@Param("id")id:string,@Body()b:unknown){return this.service.command(u,w,"WRITE_OFF",b,id);}
}
