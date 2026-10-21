import assert from "node:assert/strict";
import test from "node:test";
import { Reflector } from "@nestjs/core";
import { AccountingController } from "./accounting.controller";
import { SFA_PERMISSIONS_KEY } from "../../common/decorators/requires-sfa.decorator";
import { COMPANY_SCREEN_KEY } from "../../common/decorators/company-screen.decorator";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import { getCompanyFeatureAccessState,getCompanyModuleEntitlements,getCompanyScreenForRoute } from "@field-sales-os/schemas";
test("Accounting routes fail closed behind company screen, explicit capability and separate financial permissions",()=>{
 const r=new Reflector(),controller=AccountingController;
 assert.deepEqual(r.get(ROLES_KEY,controller),["COMPANY_ADMIN","MANAGER"]);
 assert.equal(r.get(COMPANY_SCREEN_KEY,controller),"accounting-core");
 assert.deepEqual(r.get(SFA_PERMISSIONS_KEY,controller),["sfa.access","accounting.read"]);
 for(const [method,permissions] of [["createAccount",["accounting.accounts.manage"]],["post",["accounting.journal.post"]],["reverse",["accounting.journal.reverse"]],["correct",["accounting.journal.reverse","accounting.journal.post"]],["close",["accounting.period.close"]]] as const) {
  assert.deepEqual(r.get(SFA_PERMISSIONS_KEY,controller.prototype[method]),["sfa.access",...permissions]);
 }
 assert.equal(getCompanyFeatureAccessState(undefined,"accounting-core"),"HIDDEN");
 assert.equal(getCompanyScreenForRoute("/sfa/accounting")?.featureKey,"accounting-core");
 for(const mode of ["ANALYSIS_ONLY","SFA","FULL_ERP"] as const)assert.equal(getCompanyModuleEntitlements(mode).find(m=>m.key==="accounting")?.eligible,mode==="FULL_ERP");
});
