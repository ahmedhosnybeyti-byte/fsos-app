import assert from "node:assert/strict";
import test from "node:test";
import {Reflector} from "@nestjs/core";
import {ForbiddenException} from "@nestjs/common";
import {SfaAccessGuard} from "../../common/guards/sfa-access.guard";
import {RolesGuard} from "../../common/guards/roles.guard";
import {SalesDraftsController} from "./sales-drafts.controller";
test("every sales draft route requires rep, explicit draft/visit/SFA grants and current operational mode",async()=>{
 const reflector=new Reflector(),roles=new RolesGuard(reflector,{record:async()=>undefined} as never);
 for(const method of ["list","create","warehouses","products","read","save","cancel","check"] as const){
  for(const mode of ["SFA","FULL_ERP","ANALYSIS_ONLY",null])for(const roleCode of ["SALES_REP","MANAGER","SUPER_ADMIN"])for(const missing of [null,"sfa.access","visits.execute","sales.drafts.manage"]){
   const permissions=["sfa.access","visits.execute","sales.drafts.manage"].filter(p=>p!==missing);
   const guard=new SfaAccessGuard(reflector,{companyOperatingSettings:{findUnique:async()=>mode?{operatingMode:mode}:null}} as never);
   const ctx={getClass:()=>SalesDraftsController,getHandler:()=>SalesDraftsController.prototype[method],switchToHttp:()=>({getRequest:()=>({user:{companyId:roleCode==="SUPER_ADMIN"?null:"a",roleCode,permissions}})})} as never;
   const call=async()=>{await roles.canActivate(ctx);return guard.canActivate(ctx)};
   if(roleCode==="SALES_REP"&&!missing&&(mode==="SFA"||mode==="FULL_ERP"))assert.equal(await call(),true);else await assert.rejects(call(),ForbiddenException);
  }
 }
});
