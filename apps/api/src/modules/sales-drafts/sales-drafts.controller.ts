import { Body,Controller,Get,Param,Patch,Post,Query } from "@nestjs/common";
import { SALES_DRAFT_PERMISSION } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequiresSfa } from "../../common/decorators/requires-sfa.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { SalesDraftsService } from "./sales-drafts.service";

@Controller("sfa/visits/:visitId/sales-drafts")
@Auth("SALES_REP")
@RequiresSfa("visits.execute",SALES_DRAFT_PERMISSION)
export class SalesDraftsController {
  constructor(private readonly service:SalesDraftsService){}
  @Get() list(@CurrentUser() u:AuthenticatedUser,@Param("visitId") v:string,@Query() q:unknown){return this.service.list(u,v,q);}
  @Post() create(@CurrentUser() u:AuthenticatedUser,@Param("visitId") v:string,@Body() b:unknown){return this.service.create(u,v,b);}
  @Get("warehouses") warehouses(@CurrentUser() u:AuthenticatedUser,@Param("visitId") v:string,@Query() q:unknown){return this.service.warehouses(u,v,q);}
  @Get("warehouses/:warehouseId/products") products(@CurrentUser() u:AuthenticatedUser,@Param("visitId") v:string,@Param("warehouseId") w:string,@Query() q:unknown){return this.service.products(u,v,w,q);}
  @Get(":id") read(@CurrentUser() u:AuthenticatedUser,@Param("visitId") v:string,@Param("id") id:string){return this.service.read(u,v,id);}
  @Patch(":id") save(@CurrentUser() u:AuthenticatedUser,@Param("visitId") v:string,@Param("id") id:string,@Body() b:unknown){return this.service.save(u,v,id,b);}
  @Post(":id/cancel") cancel(@CurrentUser() u:AuthenticatedUser,@Param("visitId") v:string,@Param("id") id:string,@Body() b:unknown){return this.service.cancel(u,v,id,b);}
  @Get(":id/check") check(@CurrentUser() u:AuthenticatedUser,@Param("visitId") v:string,@Param("id") id:string){return this.service.check(u,v,id);}
}
