import { strict as assert } from "node:assert";
import test from "node:test";
import { buildCustomerVisitDiagnosis, buildDaily360Diagnosis } from "./daily-360-diagnosis";

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

test("customer-card diagnosis prioritizes measured drivers without inventing causes", () => {
  const base = { salesTotal: 1000, invoiceCount: 4, trendPct: -20, firstHalfSales: 600, secondHalfSales: 400, returnsTotal: 0, pendingCollection: 0, bouncedCollection: 0, overdueCollection: 0, lostSkus: [], topProduct: { productName: "SKU-A", value: 500 }, missingProduct: null };
  const cases = [
    { ...base, bouncedCollection: 100 },
    { ...base, overdueCollection: 80 },
    { ...base, lostSkus: [{ productName: "SKU-L", baselineNetQuantity: 30, suggestedQuantity: 10 }] },
    { ...base, returnsTotal: 20 },
    base,
    { ...base, trendPct: null },
    { ...base, trendPct: 10, missingProduct: { productName: "SKU-X", peerValue: 400 } },
    { ...base, salesTotal: 0, invoiceCount: 0, trendPct: null, firstHalfSales: 0, secondHalfSales: 0, topProduct: null },
    { ...base, lostSkus: [{ productName: "SKU-L1", baselineNetQuantity: 30, suggestedQuantity: 10 }, { productName: "SKU-L2", baselineNetQuantity: 20, suggestedQuantity: 7 }] },
    { ...base, returnsTotal: 10, lostSkus: [{ productName: "SKU-L", baselineNetQuantity: 30, suggestedQuantity: 10 }] },
  ].map(buildCustomerVisitDiagnosis);
  assert.match(cases[0]!.diagnosis, /تحصيلي/);
  assert.match(cases[2]!.diagnosis, /فقدان توزيع/);
  assert.match(cases[3]!.visitActions[0]!, /المرتجعة/);
  assert.match(cases[6]!.diagnosis, /بيع متقاطع/);
  assert.equal(cases[7]!.confidence, null);
  assert.ok(new Set(cases.map((item) => item.visitObjective)).size >= 7);
});
