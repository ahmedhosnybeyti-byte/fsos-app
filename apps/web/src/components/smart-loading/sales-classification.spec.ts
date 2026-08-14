import { strict as assert } from "node:assert";
import test from "node:test";
import { classifySalesRecency, isOperationalHighPriority, operationalPriorityProductCodes, summarizeSalesRecency } from "./sales-classification";

const now = new Date("2026-08-03T12:00:00.000Z");

test("classifies a recent sale and the exact four-day boundary as recent", () => {
  assert.equal(classifySalesRecency("2026-07-31", now), "recent");
  assert.equal(classifySalesRecency("2026-07-30T12:00:00.000Z", now), "recent");
});

test("classifies a sale older than four days as stale", () => {
  assert.equal(classifySalesRecency("2026-07-29T12:00:00.000Z", now), "stale");
});

test("uses the supplied stale-days threshold", () => {
  assert.equal(classifySalesRecency("2026-08-01T12:00:00.000Z", now, 4), "recent");
  assert.equal(classifySalesRecency("2026-08-01T12:00:00.000Z", now, 1), "stale");
});

test("classifies null and invalid dates as missing", () => {
  assert.equal(classifySalesRecency(null, now), "missing");
  assert.equal(classifySalesRecency("not-a-date", now), "missing");
});

test("summarizes each product into one recency bucket", () => {
  assert.deepEqual(
    summarizeSalesRecency([{ lastSaleDate: "2026-08-02" }, { lastSaleDate: "2026-07-29" }, { lastSaleDate: null }], now),
    { recent: 1, stale: 1, missing: 1 },
  );
});

test("treats confirmed orders with a positive suggestion as operational priority", () => {
  assert.equal(isOperationalHighPriority({ suggestedQuantity: 4, confirmedOrders: 2, selectedLostOpportunityQuantity: 0 }), true);
});

test("treats a selected lost opportunity with a positive quantity as operational priority", () => {
  assert.equal(isOperationalHighPriority({ suggestedQuantity: 4, confirmedOrders: 0, selectedLostOpportunityQuantity: 3 }), true);
});

test("does not prioritize a confirmed order when vehicle stock covers the loading quantity", () => {
  assert.equal(isOperationalHighPriority({ suggestedQuantity: 0, confirmedOrders: 2, selectedLostOpportunityQuantity: 0 }), false);
});

test("does not prioritize an ordinary loading need", () => {
  assert.equal(isOperationalHighPriority({ suggestedQuantity: 4, confirmedOrders: 0, selectedLostOpportunityQuantity: 0 }), false);
});

test("does not prioritize safety stock or a manual quantity by themselves", () => {
  assert.equal(isOperationalHighPriority({ suggestedQuantity: 4, confirmedOrders: 0, selectedLostOpportunityQuantity: 0 }), false);
});

test("keeps a stale product without an operational signal out of priority", () => {
  assert.equal(classifySalesRecency("2026-07-29", now), "stale");
  assert.equal(isOperationalHighPriority({ suggestedQuantity: 4, confirmedOrders: 0, selectedLostOpportunityQuantity: 0 }), false);
});

test("allows a stale product with confirmed demand to be both stale and operational priority", () => {
  assert.equal(classifySalesRecency("2026-07-29", now), "stale");
  assert.equal(isOperationalHighPriority({ suggestedQuantity: 4, confirmedOrders: 2, selectedLostOpportunityQuantity: 0 }), true);
});

test("does not prioritize an unselected opportunity", () => {
  assert.equal(isOperationalHighPriority({ suggestedQuantity: 4, confirmedOrders: 0, selectedLostOpportunityQuantity: 0 }), false);
});

test("counts unique product codes rather than duplicate operational signals", () => {
  const codes = operationalPriorityProductCodes([
    { productCode: "P1", suggestedQuantity: 4, confirmedOrders: 2, selectedLostOpportunityQuantity: 0 },
    { productCode: "P1", suggestedQuantity: 4, confirmedOrders: 0, selectedLostOpportunityQuantity: 3 },
    { productCode: "P2", suggestedQuantity: 4, confirmedOrders: 0, selectedLostOpportunityQuantity: 0 },
  ]);
  assert.deepEqual([...codes], ["P1"]);
});
