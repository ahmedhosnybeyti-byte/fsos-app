import assert from "node:assert/strict";
import test from "node:test";
import { toBaseQuantity, fromRecordedQuantity, decimalSum, receiptQuantityError } from "./supplier-quantities";

test("supplier quantities use each item's true carton factor, independently of pack counts", () => {
  assert.equal(toBaseQuantity({ cartons: "2", pieces: "5" }, 12), "29");
  assert.equal(toBaseQuantity({ cartons: "2", pieces: "5" }, 6), "17");
  assert.equal(toBaseQuantity({ cartons: "0", pieces: "0" }, 12), "0");
  assert.deepEqual(fromRecordedQuantity("29", "BASE", 12), { cartons: "2", pieces: "5" });
  assert.deepEqual(fromRecordedQuantity("17", "BASE", 6), { cartons: "2", pieces: "5" });
});

test("supplier quantities preserve exact recorded fractions only when they resolve to whole pieces", () => {
  assert.deepEqual(fromRecordedQuantity("1.5", "CARTON", 12), { cartons: "1", pieces: "6" });
  assert.deepEqual(fromRecordedQuantity("1.5", "CARTON", 6), { cartons: "1", pieces: "3" });
  assert.equal(fromRecordedQuantity("0.000001", "CARTON", 12), null);
  assert.equal(fromRecordedQuantity("1.5", "BASE", 12), null);
  assert.equal(toBaseQuantity({ cartons: "1.5", pieces: "0" }, 12), null);
  assert.equal(toBaseQuantity({ cartons: "0", pieces: "1.5" }, 12), null);
});

test("supplier quantity editing rejects unsafe factors and invalid or excessive quantities", () => {
  for (const factor of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(toBaseQuantity({ cartons: "1", pieces: "0" }, factor), null);
  }
  for (const cartons of ["-1", "1e3", "NaN", "1000000000000"]) {
    assert.equal(toBaseQuantity({ cartons, pieces: "0" }, 12), null);
  }
  assert.equal(toBaseQuantity({ cartons: "83333333333", pieces: "3" }, 12), "999999999999");
  assert.equal(toBaseQuantity({ cartons: "83333333333", pieces: "4" }, 12), null);
});

test("receipt summary adds decimal base quantities without floating point drift", () => {
  assert.equal(decimalSum(["0.1", "0.2", "29"]), "29.3");
  assert.equal(decimalSum(["0.000001", "0.999999"]), "1");
  assert.equal(decimalSum(["-1", "2"]), null);
  assert.equal(decimalSum(["1e2"]), null);
});

test("receipt quality details reject excess and require reasons while allowing partial deliveries and decimal non-piece units", () => {
  assert.equal(receiptQuantityError("29", "26", "2", "1", "Held and rejected after inspection"), false);
  assert.equal(receiptQuantityError("29", "25", "2", "1", "One undelivered"), false);
  assert.equal(receiptQuantityError("29", "27", "2", "1", "Excess physical quantity"), true);
  assert.equal(receiptQuantityError("29", "26", "2", "1", ""), true);
  assert.equal(receiptQuantityError("0", "0", "0", "0", ""), true);
  assert.equal(receiptQuantityError("1.25", "1.1", "0.1", "0.05", "Measured litres"), false);
});
