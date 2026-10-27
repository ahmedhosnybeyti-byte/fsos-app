import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { WMS_OPERATION_PERMISSIONS,wmsInputSchema,wmsCommandSchema,wmsLoadInputSchema,wmsReceiptInputSchema,wmsPickSchema,wmsPolicySchema } from "./wms-operations.schemas";
const load={reference:"R1",source:"SMART_LOADING",recipientId:"rep",targetDate:"2026-10-20",lines:[{productCode:"WATER",quantity:"12",unit:"BASE"}],idempotencyKey:randomUUID()};
test("Smart Loading admits exact positive quantities only and cannot forge tenant or master identity",()=>{
  assert.equal(wmsLoadInputSchema.safeParse(load).success,true);
  for(const quantity of ["0","0.000000","-1","NaN","Infinity","1e3","1.0000001","1000000000000",12])assert.equal(wmsLoadInputSchema.safeParse({...load,lines:[{...load.lines[0],quantity}]}).success,false);
  for(const changed of [{companyId:"other"},{warehouseId:"other"},{bypassQuality:true}])assert.equal(wmsLoadInputSchema.safeParse({...load,...changed}).success,false);
  assert.equal(wmsLoadInputSchema.safeParse({...load,lines:[{...load.lines[0],productId:"also-id"}]}).success,false);
  for(const count of [21,83,1000]){
    const lines=Array.from({length:count},(_,i)=>({...load.lines[0]!,productCode:`SKU-${i}`}));
    const parsed=wmsLoadInputSchema.parse({...load,lines});
    assert.deepEqual(parsed.lines,lines);
    assert.equal(wmsLoadInputSchema.safeParse({...load,lines:lines.map((line,i)=>i===20?{...line,quantity:"-1"}:line)}).success,false);
  }
  assert.equal(wmsLoadInputSchema.safeParse({...load,lines:[]}).success,false);
});
test("Receiving validates real dates, explicit units and lot identity before SQL",()=>{
  const receipt={reference:"R",supplierName:"Supplier",supplierReference:"S",idempotencyKey:randomUUID(),lines:[{productId:"p",batchCode:"L",productionDate:"2026-01-01",expiryDate:"2026-12-31",unit:"CARTON",expectedQuantity:"1",acceptedQuantity:"0.5",quarantinedQuantity:"0",rejectedQuantity:"0"}]};
  assert.equal(wmsReceiptInputSchema.safeParse(receipt).success,true);
  for(const changes of [{expiryDate:"2026-02-30"},{expiryDate:"2026-01-01"},{batchId:"b"},{unit:"BOX"},{acceptedQuantity:"-1"}])assert.equal(wmsReceiptInputSchema.safeParse({...receipt,lines:[{...receipt.lines[0],...changes}]}).success,false);
});
test("Every workflow command has a fixed capability and strict operation-specific contract",()=>{
  for(const [operation,permission]of Object.entries(WMS_OPERATION_PERMISSIONS)){
    assert.match(permission,/^wms\./);assert.ok(wmsInputSchema(operation as keyof typeof WMS_OPERATION_PERMISSIONS));
  }
  for(const operation of ["load.override-quality","receipt.delete","__proto__"])assert.equal(wmsCommandSchema.safeParse({operation,input:{}}).success,false);
  assert.equal(wmsCommandSchema.safeParse({operation:"load.reserve",input:{},companyId:"b"}).success,false);
});
test("Picking accepts allocations beyond old count limits while quantities and policy bounds stay strict",()=>{
  const pick={id:"load",version:1,note:"Reviewed",idempotencyKey:randomUUID(),allocations:[{id:"allocation",quantity:"0"}]};
  assert.equal(wmsPickSchema.safeParse(pick).success,true);
  assert.equal(wmsPickSchema.safeParse({...pick,version:0}).success,false);
  for(const count of [101,1000]){
    const allocations=Array.from({length:count},(_,i)=>({id:`allocation-${i}`,quantity:"0"}));
    assert.deepEqual(wmsPickSchema.parse({...pick,allocations}).allocations,allocations);
    for(const quantity of ["-1","1.0000001"])
      assert.equal(wmsPickSchema.safeParse({...pick,allocations:allocations.map((line,i)=>i===100?{...line,quantity}:line)}).success,false);
  }
  assert.equal(wmsPickSchema.safeParse({...pick,allocations:[]}).success,false);
  for(const minShelfLifeDays of [-1,0.5,3651])assert.equal(wmsPolicySchema.safeParse({customerCode:"C1",minShelfLifeDays,version:0}).success,false);
});
