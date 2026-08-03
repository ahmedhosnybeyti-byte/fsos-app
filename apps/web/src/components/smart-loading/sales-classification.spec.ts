import { strict as assert } from "node:assert";
import test from "node:test";
import { classifySalesRecency, summarizeSalesRecency } from "./sales-classification";

const now = new Date("2026-08-03T12:00:00.000Z");

test("classifies a recent sale and the exact four-day boundary as recent", () => {
  assert.equal(classifySalesRecency("2026-07-31", now), "recent");
  assert.equal(classifySalesRecency("2026-07-30T12:00:00.000Z", now), "recent");
});

test("classifies a sale older than four days as stale", () => {
  assert.equal(classifySalesRecency("2026-07-29T12:00:00.000Z", now), "stale");
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
