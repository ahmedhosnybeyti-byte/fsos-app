import assert from "node:assert/strict";
import test from "node:test";
import { OrgUnitsService } from "./org-units.service";
import { PlatformEventsService } from "../governance/platform-events.service";

test("new-tenant organizational event audit uses the provisioning transaction and propagates audit failure", async () => {
  const tx={orgUnit:{create:async({data}:any)=>({id:"new-region",...data})}};
  let fail=false;const audits:unknown[]=[];
  const events=new PlatformEventsService({record:async(entry:any,client:unknown)=>{
    // The root connection cannot see the uncommitted company. Regression for
    // audit_logs_company_id_fkey during Super Admin Create Company.
    assert.equal(client,tx);if(fail)throw Error("audit unavailable");audits.push(entry);
  }} as never);
  const org=new OrgUnitsService({} as never,{getByCode:async()=>({typeCode:"REGION"}),validateNesting:async()=>{}} as never,events);
  await org.create("new-uncommitted-company",{type:"REGION",code:"MAIN",name:"Region"},tx as never);
  assert.equal(audits.length,1);
  fail=true;
  await assert.rejects(org.create("new-uncommitted-company",{type:"REGION",code:"MAIN",name:"Region"},tx as never),/audit unavailable/);
  assert.equal(audits.length,1);
});
