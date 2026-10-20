import assert from "node:assert/strict";
import test from "node:test";
import { wmsBatchSchema,wmsCreateProductSchema,wmsOpeningSchema,wmsPageSchema } from "./wms.schemas";
test("WMS product packaging, tracking and decimal commands are validated without numeric coercion",()=>{
  assert.equal(wmsCreateProductSchema.parse({code:"water-1",name:"Water",piecesPerCarton:24}).code,"WATER-1");
  for(const extra of [{piecesPerCarton:0},{piecesPerCarton:1.5},{baseUnit:"KG",piecesPerCarton:12},{trackExpiry:true}])
    assert.equal(wmsCreateProductSchema.safeParse({code:"A",name:"A",...extra}).success,false);
  const command={productId:"p",quantity:"1.000001",unit:"BASE",reference:"COUNT-1",reason:"Count verified",idempotencyKey:"11111111-1111-4111-8111-111111111111"};
  assert.equal(wmsOpeningSchema.parse(command).quantity,"1.000001");
  for(const quantity of [1,0,-1,"0","-1","NaN","1e6","0.0000001","1000000000000"])
    assert.equal(wmsOpeningSchema.safeParse({...command,quantity}).success,false);
  assert.equal(wmsOpeningSchema.safeParse({...command,companyId:"other"}).success,false);
  for(const page of [0,1001,1.5])assert.equal(wmsPageSchema.safeParse({page}).success,false);
});
test("WMS dates are actual date-only values with no inferred production date",()=>{
  assert.equal(wmsBatchSchema.parse({productId:"p",code:"L1",expiryDate:"2028-02-29"}).productionDate,null);
  for(const extra of [{expiryDate:"2027-02-29"},{productionDate:"2026-05-01",expiryDate:"2026-05-01"},{productionDate:"2026-05-02",expiryDate:"2026-05-01"}])
    assert.equal(wmsBatchSchema.safeParse({productId:"p",code:"L1",...extra}).success,false);
});
