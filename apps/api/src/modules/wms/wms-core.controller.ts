import {Controller,Get,Param,Query} from "@nestjs/common";
import {Auth} from "../../common/decorators/auth.decorator";
import {RequiresSfa} from "../../common/decorators/requires-sfa.decorator";
import {CompanyScreen} from "../../common/decorators/company-screen.decorator";
import {CurrentUser} from "../../common/decorators/current-user.decorator";
import type {AuthenticatedUser} from "../../common/types/authenticated-user";
import {WmsCoreService} from "./wms-core.service";
@Controller("sfa/wms/warehouses/:warehouse")
@Auth("COMPANY_ADMIN","MANAGER","SUPERVISOR","SALES_REP")
@RequiresSfa("wms.read")
@CompanyScreen("warehouse-core")
export class WmsCoreController{
 constructor(private readonly core:WmsCoreService){}
 @Get("return-sources/:kind") sources(@CurrentUser()u:AuthenticatedUser,@Param("warehouse")w:string,@Param("kind")kind:string,@Query()q:unknown){return this.core.sources(u,w,kind,q);}
 @Get("return-sources/:kind/:id") source(@CurrentUser()u:AuthenticatedUser,@Param("warehouse")w:string,@Param("kind")kind:string,@Param("id")id:string){return this.core.source(u,w,kind,id);}
 @Get("returns/:kind") list(@CurrentUser()u:AuthenticatedUser,@Param("warehouse")w:string,@Param("kind")kind:string,@Query()q:unknown){return this.core.list(u,w,kind,q);}
 @Get("return-documents/:id") detail(@CurrentUser()u:AuthenticatedUser,@Param("warehouse")w:string,@Param("id")id:string){return this.core.detail(u,w,id);}
 @Get("custody") custody(@CurrentUser()u:AuthenticatedUser,@Param("warehouse")w:string,@Query()q:unknown){return this.core.custody(u,w,q);}
}
