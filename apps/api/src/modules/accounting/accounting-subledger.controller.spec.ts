import assert from "node:assert/strict";
import test from "node:test";
import { Reflector } from "@nestjs/core";
import { AccountingSubledgerController as Controller } from "./accounting-subledger.controller";
import { SFA_PERMISSIONS_KEY } from "../../common/decorators/requires-sfa.decorator";
import { COMPANY_SCREEN_KEY } from "../../common/decorators/company-screen.decorator";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
test("Phase 2 voucher endpoints require independent operation, AR/AP and treasury permissions",()=>{
 const r=new Reflector();assert.deepEqual(r.get(ROLES_KEY,Controller),["COMPANY_ADMIN","MANAGER"]);assert.equal(r.get(COMPANY_SCREEN_KEY,Controller),"accounting-core");assert.deepEqual(r.get(SFA_PERMISSIONS_KEY,Controller),["sfa.access","accounting.read"]);
 for(const [method,required] of [["receipt",["accounting.ar.read","accounting.receipts.post","accounting.treasury.read"]],["payment",["accounting.ap.read","accounting.payments.post","accounting.treasury.read"]],["opening",["accounting.opening.post"]],["reverse",["accounting.journal.reverse"]],["registerTreasury",["accounting.treasury.read","accounting.treasury.manage"]]] as const)assert.deepEqual(r.get(SFA_PERMISSIONS_KEY,Controller.prototype[method]),["sfa.access",...required]);
});
