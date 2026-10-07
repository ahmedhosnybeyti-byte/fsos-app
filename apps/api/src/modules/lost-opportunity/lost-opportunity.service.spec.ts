import { strict as assert } from "node:assert";
import test from "node:test";
import { LostOpportunityService } from "./lost-opportunity.service";

const input = {
  companyId: "company",
  requestingUser: { roleCode: "COMPANY_ADMIN", email: "admin@example.com" },
  selectedDate: "2026-07-31",
  customerCodes: ["C1"],
  customerNames: new Map([["C1", "Customer"]]),
};

test("uses the final PostgreSQL result so a company-wide intermediate page cannot hide opportunities", async () => {
  let query: Record<string, unknown> | undefined;
  const service = new LostOpportunityService({
    hasCanonicalEntitySources: async () => true,
    queryVisitCopilotLostOpportunities: async (value: Record<string, unknown>) => {
      query = value;
      return {
        positiveBaselineCount: 1,
        rows: [{ customerCode: "c1", productCode: "p1", productName: "Product 1", category: "Drinks", baselineNetQuantity: 9, recentNetQuantity: 0, suggestedQuantity: 3 }],
      };
    },
  } as never);

  const result = await service.detect(input);
  assert.equal(result.status, "available");
  assert.equal(result.opportunities[0]?.customerName, "Customer");
  assert.equal(result.opportunities[0]?.suggestedQuantity, 3);
  assert.deepEqual(query?.customerCodes, ["C1"]);
  assert.equal(query?.baselineFrom, "2026-04-03");
  assert.equal(query?.recentFrom, "2026-07-02");
});

test("keeps the existing no-baseline and recent-purchase outcomes", async () => {
  const service = new LostOpportunityService({
    hasCanonicalEntitySources: async () => true,
    queryVisitCopilotLostOpportunities: async () => ({ positiveBaselineCount: 1, rows: [] }),
  } as never);
  assert.equal((await service.detect(input)).status, "no-lost-opportunities");

  const withoutBaseline = new LostOpportunityService({
    hasCanonicalEntitySources: async () => true,
    queryVisitCopilotLostOpportunities: async () => ({ positiveBaselineCount: 0, rows: [] }),
  } as never);
  assert.equal((await withoutBaseline.detect(input)).status, "no-baseline-sales");
});
