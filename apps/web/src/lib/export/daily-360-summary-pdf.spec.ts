import { strict as assert } from "node:assert";
import test from "node:test";
import type { VisitCopilot360LostOpportunity } from "@/lib/types";
import {
  assertDaily360PdfCanvas,
  getDaily360PdfCaptureDimensions,
  getDaily360PdfPageSlices,
  groupDaily360PdfOpportunities,
} from "./daily-360-summary-pdf";

function opportunity(overrides: Partial<VisitCopilot360LostOpportunity>): VisitCopilot360LostOpportunity {
  return {
    customerCode: "C-1",
    customerName: "عميل واحد",
    productCode: "P-1",
    productName: "صنف واحد",
    category: "ألبان",
    declineValue: 2,
    valueBefore: 2,
    valueAfter: 0,
    baselineNetQuantity: 2,
    recentNetQuantity: 0,
    suggestedQuantity: 1,
    lastVisitDate: null,
    stoppedProducts: [],
    diagnosis: "تشخيص",
    visitDecision: "قرار",
    ...overrides,
  };
}

test("rejects zero-sized Daily 360 PDF capture targets", () => {
  assert.throws(() => getDaily360PdfCaptureDimensions({ scrollWidth: 0, scrollHeight: 0, getBoundingClientRect: () => ({ width: 0, height: 0 }) } as never));
});

test("accepts a visible capture target and rejects an empty canvas image", () => {
  assert.deepEqual(getDaily360PdfCaptureDimensions({ scrollWidth: 320, scrollHeight: 1200, getBoundingClientRect: () => ({ width: 300, height: 500 }) } as never), { width: 320, height: 1200 });
  assert.throws(() => assertDaily360PdfCanvas({ width: 320, height: 1200, toDataURL: () => "data:image/png;base64,AA==" }));
});

test("splits long Daily 360 reports into bounded PDF pages", () => {
  assert.deepEqual(getDaily360PdfPageSlices(2_500, 1_000), [
    { y: 0, height: 1_000 },
    { y: 1_000, height: 1_000 },
    { y: 2_000, height: 500 },
  ]);
});

test("builds PDF groups from filtered opportunities without accordion state or duplicates", () => {
  const groups = groupDaily360PdfOpportunities([
    opportunity({ productCode: "P-1", productName: "حليب", category: "ألبان" }),
    opportunity({ productCode: "P-1", productName: "نسخة مكررة" }),
    opportunity({ productCode: "P-2", productName: "شيبس", category: null }),
    opportunity({ customerCode: "C-2", customerName: "عميل ثان", productCode: "P-3", productName: "عصير" }),
  ], "غير مصنف");

  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.opportunities.length, 2);
  assert.equal(groups[0]?.opportunities.find((item) => item.productCode === "P-2")?.category, null);
  assert.equal(groups[1]?.customerName, "عميل ثان");
});
