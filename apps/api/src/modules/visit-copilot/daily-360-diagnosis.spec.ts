import { strict as assert } from "node:assert";
import test from "node:test";
import { buildDaily360Diagnosis } from "./daily-360-diagnosis";

test("daily 360 diagnosis rules produce data-specific actions across ten customer-SKU patterns", () => {
  const cases = [
    { sales90: 90, sales30: 0, suggestedQuantity: 30 },
    { sales90: 120, sales30: 0, suggestedQuantity: 40, returnQuantity: 12 },
    { sales90: 90, sales30: 20, suggestedQuantity: 30 },
    { sales90: 90, sales30: 30, suggestedQuantity: 30 },
    { sales90: 90, sales30: 31, suggestedQuantity: 30 },
    { sales90: 45, sales30: 15, suggestedQuantity: 15 },
    { sales90: 45, sales30: 0, suggestedQuantity: 15, lastPurchaseDate: "2026-07-01" },
    { sales90: 0, sales30: 0, suggestedQuantity: 0 },
    { sales90: 300, sales30: 100, suggestedQuantity: 100 },
    { sales90: 300, sales30: 80, suggestedQuantity: 100 },
  ];
  const results = cases.map((facts, index) => buildDaily360Diagnosis({ productName: `SKU-${index + 1}`, ...facts }));

  assert.match(results[0]!.diagnosis, /Lost Sales/);
  assert.match(results[1]!.visitAction, /المرتجع/);
  assert.match(results[2]!.diagnosis, /تراجع/);
  assert.match(results[3]!.diagnosis, /أداء إيجابي/);
  assert.equal(results[7]!.confidence, null);
  assert.match(results[7]!.diagnosis, /لا توجد بيانات كافية/);
  assert.ok(new Set(results.map((result) => result.diagnosis)).size >= 8);
  assert.ok(new Set(results.map((result) => result.visitAction)).size >= 5);
});
