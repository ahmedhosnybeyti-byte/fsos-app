import assert from "node:assert/strict";
import test from "node:test";
import { Reflector } from "@nestjs/core";
import { ForbiddenException } from "@nestjs/common";
import { WmsController } from "./wms.controller";
import { WmsOperationsController } from "./wms-operations.controller";
import { SfaAccessGuard } from "../../common/guards/sfa-access.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CompanyScreenAccessGuard } from "../../common/guards/company-screen-access.guard";
import { wmsPermissions,wmsUser } from "./wms-test-fixture";

const operations={warehouses:[],summary:[],products:[],batches:[],movements:[],createProduct:["wms.products.manage"],updateProduct:["wms.products.manage"],createBatch:["wms.products.manage"],opening:["wms.opening.post"],reverse:["wms.opening.post"],accessUsers:["wms.access.manage"],access:["wms.access.manage"]};
test("every WMS API fails closed for missing mode, company screen, operation permission or tenant",async()=>{
  const reflector=new Reflector();
  for(const [method,extra] of Object.entries(operations)){
    const context=(user:any)=>({getClass:()=>WmsController,getHandler:()=>WmsController.prototype[method as keyof WmsController],switchToHttp:()=>({getRequest:()=>({user,body:{companyId:"forged",warehouse:"other"}})})} as never);
    for(const mode of [undefined,"ANALYSIS_ONLY","SFA","FULL_ERP"]){
      const guard=new SfaAccessGuard(reflector,{companyOperatingSettings:{findUnique:async()=>mode?{operatingMode:mode}:null}} as never);
      if(mode==="SFA"||mode==="FULL_ERP")assert.equal(await guard.canActivate(context(wmsUser())),true);
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

test("every receiving/loading endpoint retains mode, screen and tenant admission including direct command API",async()=>{
  const reflector=new Reflector();
  for(const method of ["command","receipts","receipt","loads","load","fefo","recipients","policies","policy"] as const){
    const context=(user:any)=>({getClass:()=>WmsOperationsController,getHandler:()=>WmsOperationsController.prototype[method],switchToHttp:()=>({getRequest:()=>({user})})} as never);
    const user={...wmsUser(),permissions:[...wmsPermissions,"wms.policy.manage"]};
    for(const mode of [undefined,"ANALYSIS_ONLY","SFA","FULL_ERP"]){const guard=new SfaAccessGuard(reflector,{companyOperatingSettings:{findUnique:async()=>mode?{operatingMode:mode}:null}} as never);
      if(mode==="SFA"||mode==="FULL_ERP")assert.equal(await guard.canActivate(context(user)),true);else await assert.rejects(guard.canActivate(context(user)),ForbiddenException);
    }
    for(const missing of ["sfa.access","wms.read",...(method==="policy"?["wms.policy.manage"]:[])]){
      const guard=new SfaAccessGuard(reflector,{companyOperatingSettings:{findUnique:async()=>({operatingMode:"SFA"})}} as never);
      await assert.rejects(guard.canActivate(context({...user,permissions:user.permissions.filter(p=>p!==missing)})),ForbiddenException);
    }
    const screen=new CompanyScreenAccessGuard(reflector,{company:{findUnique:async()=>({featureAccess:{"warehouse-core":"HIDDEN"}})}} as never);
    await assert.rejects(screen.canActivate(context(user)),ForbiddenException);
  }
});
test("WMS controller forwards authenticated actor and actual warehouse path, never body company scope",()=>{
  let args:unknown[]=[];
  const controller=new WmsController({postOpening:(...values:unknown[])=>{args=values;}} as never);
  const user=wmsUser();const body={companyId:"forged",productId:"p"};controller.opening(user,"wa",body);
  assert.deepEqual(args,[user,"wa",body]);
});
