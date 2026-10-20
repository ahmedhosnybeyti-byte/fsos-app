import assert from "node:assert/strict";
import test from "node:test";
import { Reflector } from "@nestjs/core";
import { ForbiddenException } from "@nestjs/common";
import { WmsController } from "./wms.controller";
import { SfaAccessGuard } from "../../common/guards/sfa-access.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CompanyScreenAccessGuard } from "../../common/guards/company-screen-access.guard";
import { wmsPermissions,wmsUser } from "./wms-test-fixture";

const operations={warehouses:[],summary:[],products:[],batches:[],movements:[],createProduct:["wms.products.manage"],updateProduct:["wms.products.manage"],createBatch:["wms.products.manage"],opening:["wms.opening.post"],reverse:["wms.opening.post"],accessUsers:["wms.access.manage"],access:["wms.access.manage"]};
test("every WMS API fails closed for missing mode, company screen, operation permission or tenant",async()=>{
  const reflector=new Reflector();
  for(const [method,extra] of Object.entries(operations)){
    const context=(user:any)=>({getClass:()=>WmsController,getHandler:()=>WmsController.prototype[method as keyof WmsController],switchToHttp:()=>({getRequest:()=>({user,body:{companyId:"forged",warehouse:"other"}})})} as never);
    for(const mode of [undefined,"ANALYSIS_ONLY","SFA"]){
      const guard=new SfaAccessGuard(reflector,{companyOperatingSettings:{findUnique:async()=>mode?{operatingMode:mode}:null}} as never);
      if(mode==="SFA")assert.equal(await guard.canActivate(context(wmsUser())),true);
      else await assert.rejects(guard.canActivate(context(wmsUser())),ForbiddenException);
    }
    const guard=new SfaAccessGuard(reflector,{companyOperatingSettings:{findUnique:async()=>({operatingMode:"SFA"})}} as never);
    for(const missing of ["sfa.access","wms.read",...extra])await assert.rejects(guard.canActivate(context({...wmsUser(),permissions:wmsPermissions.filter(p=>p!==missing)})),ForbiddenException);
    await assert.rejects(guard.canActivate(context({...wmsUser(),companyId:null,roleCode:"SUPER_ADMIN"})),ForbiddenException);
    for(const state of [undefined,"HIDDEN","LOCKED","ENABLED"]){
      const screen=new CompanyScreenAccessGuard(reflector,{company:{findUnique:async()=>({featureAccess:state?{"warehouse-core":state}:{}})}} as never);
      if(state==="ENABLED")assert.equal(await screen.canActivate(context(wmsUser())),true);
      else await assert.rejects(screen.canActivate(context(wmsUser())),ForbiddenException);
    }
    const role=new RolesGuard(reflector,{record:async()=>{}} as never);
    if(method.startsWith("access"))await assert.rejects(role.canActivate(context(wmsUser("a","clerk-a","SALES_REP"))),ForbiddenException);
    else assert.equal(await role.canActivate(context(wmsUser("a","clerk-a","SALES_REP"))),true);
  }
});
test("WMS controller forwards authenticated actor and actual warehouse path, never body company scope",()=>{
  let args:unknown[]=[];
  const controller=new WmsController({postOpening:(...values:unknown[])=>{args=values;}} as never);
  const user=wmsUser();const body={companyId:"forged",productId:"p"};controller.opening(user,"wa",body);
  assert.deepEqual(args,[user,"wa",body]);
});
