import assert from "node:assert/strict";
import test from "node:test";
import { halalas,journalTotals } from "./accounting-money";
test("Accounting form sums decimal money exactly; invalid precision and dual/zero sides block submission",()=>{
 assert.deepEqual(journalTotals([{debit:"0.1",credit:"0"},{debit:"0.2",credit:"0"},{debit:"0",credit:"0.3"}]),{debit:"0.30",credit:"0.30",balanced:true});
 for(const v of ["0.001","-1","1e2","NaN","100000000000000"])assert.equal(halalas(v),null);
 assert.equal(journalTotals([{debit:"1",credit:"1"},{debit:"0",credit:"0"}]).balanced,false);
 assert.equal(journalTotals([{debit:"0.31",credit:"0"},{debit:"0",credit:"0.30"}]).balanced,false);
 assert.equal(halalas("99999999999999.99"),9999999999999999n);
});
