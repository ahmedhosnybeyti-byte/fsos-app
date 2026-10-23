import {Body,Controller,Get,Param,Post,Query} from "@nestjs/common";
import {PRICE_EXCEPTION_PERMISSIONS as P} from "@field-sales-os/schemas";
import {Auth} from "../../common/decorators/auth.decorator";
import {CurrentUser} from "../../common/decorators/current-user.decorator";
import {RequiresSfa} from "../../common/decorators/requires-sfa.decorator";
import type {AuthenticatedUser} from "../../common/types/authenticated-user";
import {SalesPriceExceptionsService} from "./sales-price-exceptions.service";

@Controller("sfa/sales-price-exceptions")
@Auth("SALES_REP","SUPERVISOR","MANAGER","COMPANY_ADMIN")
@RequiresSfa()
export class SalesPriceExceptionsController{
 constructor(private readonly service:SalesPriceExceptionsService){}
 @Get() list(@CurrentUser() u:AuthenticatedUser,@Query() q:unknown){return this.service.list(u,q);}
 @Get(":id") read(@CurrentUser() u:AuthenticatedUser,@Param("id") id:string){return this.service.read(u,id);}
 @Post() @Auth("SALES_REP") @RequiresSfa(P.request,"visits.execute","sales.drafts.manage")
 create(@CurrentUser() u:AuthenticatedUser,@Body() b:unknown){return this.service.create(u,b);}
 @Post(":id/review") @Auth("SUPERVISOR") @RequiresSfa(P.review)
 review(@CurrentUser() u:AuthenticatedUser,@Param("id") id:string,@Body() b:unknown){return this.service.decide(u,id,b);}
 @Post(":id/decision") @Auth("MANAGER") @RequiresSfa(P.approve)
 decide(@CurrentUser() u:AuthenticatedUser,@Param("id") id:string,@Body() b:unknown){return this.service.decide(u,id,b);}
 // Deliberately no activation, price-edit, credit, upload or posting route.
}
