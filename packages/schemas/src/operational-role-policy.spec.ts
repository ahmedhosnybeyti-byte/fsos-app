import test from "node:test";
import assert from "node:assert/strict";
import {hasOperationalPermissions,permitsOperationalRole} from "./operational-role-policy";
test("company administrator gets only the three read views; forged methods, paths and write grants never expand them",()=>{
 const permissions=["sfa.access","erp.admin.read"];
 for(const [path,required] of [
  ["/api/v1/sfa/wms/warehouses/w/summary",["wms.read"]],
  ["/api/v1/sfa/wms/warehouses/w/batches",["wms.read"]],
  ["/api/v1/sfa/procurement/warehouses/w/requests?kind=all",["procurement.read","wms.read"]],
  ["/api/v1/sfa/accounting/treasury",["accounting.read","accounting.treasury.read"]],
 ] as const){assert.equal(permitsOperationalRole("COMPANY_ADMIN",required,{method:"GET",path}),true);assert.equal(hasOperationalPermissions("COMPANY_ADMIN",permissions,required),true);for(const method of ["POST","PATCH","DELETE","PUT"])assert.equal(permitsOperationalRole("COMPANY_ADMIN",required,{method,path}),false);}
 for(const path of ["/sfa/accounting/accounts","/sfa/accounting/journals","/sfa/accounting/parties","/sfa/wms/warehouses/w/access","/sfa/wms/warehouses/w/receipts","/sfa/procurement/warehouses/w/suppliers"])
  assert.equal(permitsOperationalRole("COMPANY_ADMIN",["accounting.read"],{method:"GET",path}),false);
 for(const permission of ["wms.products.manage","procurement.order.create","accounting.journal.post","accounting.receipts.post","accounting.treasury.manage"]){assert.equal(hasOperationalPermissions("COMPANY_ADMIN",permissions,[permission]),false);assert.equal(permitsOperationalRole("COMPANY_ADMIN",[permission],{method:"GET",path:"/sfa/accounting/treasury"}),false);}
});
