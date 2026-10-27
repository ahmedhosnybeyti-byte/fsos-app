import assert from 'node:assert/strict';
import test from 'node:test';
import type {WmsLoad} from '@field-sales-os/schemas';
import {wholePacks,defaultLoadingDraft,loadingPickAllocations,reservedByProduct} from './loading-pick-quantities';
const load={lines:[{id:'line',productId:'p',productName:'Same name',requestedBase:'25.000000',piecesPerCarton:12},{id:'line2',productId:'p2',productName:'Same name',requestedBase:'24',piecesPerCarton:24}],allocations:[{id:'early',productId:'p',reservedQuantity:'10.000000'},{id:'late',productId:'p',reservedQuantity:'15.000000'},{id:'other',productId:'p2',reservedQuantity:'24'}]} as unknown as WmsLoad;
test('cartons plus packs preserve exact editable quantities and reject fractional or invalid inputs',()=>{
 assert.equal(wholePacks({cartons:'1',pieces:'8'},12),20n);
 assert.equal(wholePacks({cartons:'0',pieces:'0'},12),0n);
 for(const draft of [{cartons:'1.5',pieces:'0'},{cartons:'0',pieces:'0.5'},{cartons:'-1',pieces:'0'},{cartons:'',pieces:'0'},{cartons:'0',pieces:'12'}])assert.throws(()=>wholePacks(draft,12));
});
test('keeper draft initializes from whole pieces; a shortage uses only actual reservations',()=>{
 assert.deepEqual(defaultLoadingDraft(load.lines[0]!),{cartons:'2',pieces:'1'});
 const partial={...load,allocations:[{...load.allocations[0]!,reservedQuantity:'8'}]};
 assert.deepEqual(defaultLoadingDraft(load.lines[0]!,reservedByProduct(partial)),{cartons:'0',pieces:'8'});
 assert.deepEqual(defaultLoadingDraft(load.lines[1]!,reservedByProduct(partial)),{cartons:'0',pieces:'0'});
});
test('edited product quantity distributes once across existing FEFO lots without confusing same-name products',()=>{
 assert.deepEqual(loadingPickAllocations(load,{p:{cartons:'1',pieces:'8'},p2:{cartons:'0',pieces:'0'}}),[{id:'early',quantity:'10'},{id:'late',quantity:'10'},{id:'other',quantity:'0'}]);
 assert.throws(()=>loadingPickAllocations(load,{p:{cartons:'2',pieces:'2'}}),/WMS_OVER_PICK/);
 assert.deepEqual(loadingPickAllocations(load,{}),[{id:'early',quantity:'10'},{id:'late',quantity:'15'},{id:'other',quantity:'24'}]);
});
test('non-piece units keep exact decimal base quantities and their existing stock boundary',()=>{
 const weighted={...load,lines:[{...load.lines[0]!,baseUnit:'KG'}],allocations:[{...load.allocations[0]!,baseUnit:'KG',reservedQuantity:'10.25'}]};
 assert.deepEqual(loadingPickAllocations(weighted,{}),[{id:'early',quantity:'10.25'}]);
 assert.deepEqual(loadingPickAllocations(weighted,{},{early:'8.125'}),[{id:'early',quantity:'8.125'}]);
 assert.throws(()=>loadingPickAllocations(weighted,{},{early:'11'}),/WMS_OVER_PICK/);
});
