import assert from "node:assert/strict";
import test from "node:test";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import { createPlatformCompanySchema } from "@field-sales-os/schemas";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";

test("platform creation atomically stores selected mode, independent plan, hidden operations and unchanged role grants",async()=>{
  assert.deepEqual(new Reflector().get(ROLES_KEY,CompaniesController.prototype.createPlatformCompany),["SUPER_ADMIN"]);
  for(const operatingMode of ["ANALYSIS_ONLY","SFA","FULL_ERP"] as const){
    const writes: {kind:string;data:any}[]=[];
    const tx={company:{create:async({data}:any)=>{writes.push({kind:"company",data});return {id:"new-company",...data};}},
      companyOperatingSettings:{create:async({data}:any)=>{writes.push({kind:"mode",data});}},
      companyProfile:{create:async()=>{}},role:{findUnique:async()=>({id:"unchanged-role"})},
      user:{create:async({data}:any)=>{writes.push({kind:"user",data});return {id:"new-admin",email:data.email};}}};
    let committed=false,failAudit=false;
    const service=new CompaniesService({$transaction:async(work:any)=>{const n=writes.length;try{const value=await work(tx);committed=true;return value;}catch(e){writes.splice(n);throw e;}}} as never,
      {record:async(_entry:any,client:any)=>{assert.equal(client,tx);if(failAudit)throw Error("audit unavailable");}} as never,
      {ensureDefaultRegion:async()=>({id:"region"}),create:async()=>({id:"branch"})} as never,{} as never,{} as never,
      {createInitialSubscription:async(companyId:string,client:any,planCode:string)=>{assert.equal(client,tx);writes.push({kind:"plan",data:{companyId,planCode}});return {id:"sub",plan:{code:planCode},status:"ACTIVE"};}} as never);
    const input=createPlatformCompanySchema.parse({name:"Synthetic Company",slug:"synthetic-company",initialPlanCode:"independent-commercial-plan",adminFullName:"Synthetic Admin",adminEmail:"admin@example.invalid",operatingMode});
    await service.createPlatformCompany(input,"platform-admin");assert.equal(committed,true);
    assert.deepEqual(writes.find(w=>w.kind==="mode")?.data,{companyId:"new-company",operatingMode});
    assert.deepEqual(writes.find(w=>w.kind==="company")?.data.featureAccess,{user_activity:"HIDDEN"});
    assert.equal(writes.find(w=>w.kind==="user")?.data.roleId,"unchanged-role");
    assert.equal(writes.find(w=>w.kind==="plan")?.data.planCode,"independent-commercial-plan");
    const before=writes.length;failAudit=true;committed=false;
    await assert.rejects(service.createPlatformCompany(input,"platform-admin"),/audit unavailable/);
    assert.equal(writes.length,before);assert.equal(committed,false);
  }
});
