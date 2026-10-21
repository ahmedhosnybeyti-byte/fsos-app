import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {procurementCommandSchema} from "./procurement.schemas";
import {getCompanyFeatureAccessState,getCompanyScreenForRoute} from "./company-feature-access.schemas";
test("Procurement defaults hidden and has a dedicated registered route",()=>{
 assert.equal(getCompanyFeatureAccessState({},"procurement"),"HIDDEN");assert.equal(getCompanyScreenForRoute("/sfa/procurement")?.featureKey,"procurement");
});
test("Procurement commands require scoped identities, explicit positive exact quantities and no client tenant flags",()=>{
 const b={operation:"CREATE",reason:"Synthetic request",idempotencyKey:randomUUID(),draft:{reference:"TEST",lines:[{productId:"p",quantity:"40",unit:"CARTON"}]}};
 assert.equal(procurementCommandSchema.safeParse(b).success,true);
 for(const quantity of ["0","-1","1e3","1.0000001"])assert.equal(procurementCommandSchema.safeParse({...b,draft:{...b.draft,lines:[{...b.draft.lines[0],quantity}]}}).success,false);
 assert.equal(procurementCommandSchema.safeParse({...b,companyId:"foreign"}).success,false);
 for(const operation of ["APPROVE","ORDER","RECEIVE"])assert.equal(procurementCommandSchema.safeParse({...b,operation}).success,false);
});
