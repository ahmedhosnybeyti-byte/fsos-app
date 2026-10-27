import assert from "node:assert/strict";
import test from "node:test";
import {cartonQuantity,cartonToBase,quantityInRecordedUnit} from "./carton-quantity";
test("carton presentation converts exact decimal strings without changing stock or losing large integer precision",()=>{
 assert.equal(cartonQuantity("1200.000000",12),"100");
 assert.equal(cartonQuantity("2400",24),"100");
 assert.equal(cartonQuantity("6",12),"0.5");
 assert.equal(cartonQuantity("-6",12),"-0.5");
 assert.equal(cartonQuantity("90071992547409930",10),"9007199254740993");
 assert.equal(cartonQuantity("1",3),"≈ 0.333333");
 assert.equal(cartonQuantity("1200",undefined),"—");
 assert.equal(cartonQuantity("1200",0),"—");
});
test("carton commands resolve to exact whole pieces and never post approximate fractions",()=>{
 assert.equal(cartonToBase("1",12),"12");assert.equal(cartonToBase("1.25",12),"15");
 assert.equal(cartonToBase("0",12),"0");
 assert.throws(()=>cartonToBase("0.333333",12));
 assert.throws(()=>cartonToBase("≈ 0.333333",3));
 assert.throws(()=>cartonToBase("-1",12));
 assert.equal(quantityInRecordedUnit("2","CARTON",12),"2");
 assert.equal(quantityInRecordedUnit("2","BASE",12),"24");
 assert.equal(quantityInRecordedUnit("x","BASE",12),"");
});
