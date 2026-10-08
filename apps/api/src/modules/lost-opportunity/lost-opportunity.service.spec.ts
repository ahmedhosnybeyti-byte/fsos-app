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
        rows: [{ customerCode: "c1", productCode: "p1", productName: "Product 1", category: "Drinks", baselineNetQuantity: 9, recentNetQuantity: 0, suggestedQuantity: 3, expectedSales: 27 }],
      };
    },
  } as never);

  const result = await service.detect(input);
  assert.equal(result.status, "available");
  assert.equal(result.opportunities[0]?.customerName, "Customer");
  assert.equal(result.opportunities[0]?.suggestedQuantity, 3);
  assert.equal(result.opportunities[0]?.expectedSales, 27);
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

test("keeps Sales Rep on the established bounded query path", async () => {
  let specializedCalled = false;
  const service = new LostOpportunityService({
    hasCanonicalEntitySources: async () => true,
    queryVisitCopilotLostOpportunities: async () => { specializedCalled = true; return { positiveBaselineCount: 0, rows: [] }; },
    queryCanonicalRecords: async (query: { entityName: string; scope?: { date?: { from: string } } }) => query.entityName === "Products"
      ? { records: [{ productCode: "P1", productName: "Product 1", category: "Drinks" }], page: { hasMore: false } }
      : { records: query.entityName === "Visits" ? [{ customerCode: "C1", actualVisitCount: 3 }] : query.entityName === "Invoice Items" && query.scope?.date?.from === "2026-04-03" ? [{ customerCode: "C1", productCode: "P1", quantity: 9, salesValue: 45 }] : [], page: { hasMore: false } },
  } as never);
  const result = await service.detect({ ...input, useActualBaselineVisits: true, requestingUser: { roleCode: "SALES_REP", email: "rep@example.com" } });
  assert.equal(specializedCalled, false);
  assert.equal(result.status, "available");
  assert.equal(result.opportunities[0]?.customerCode, "C1");
  assert.equal(result.opportunities[0]?.suggestedQuantity, 3);
  assert.equal(result.opportunities[0]?.suggestedQuantityAvailable, true);
  assert.equal(result.opportunities[0]?.expectedSales, 15);
});

test("keeps a lost opportunity visible but leaves Suggested Qty uncomputed when baseline visits are zero", async () => {
  const service = new LostOpportunityService({
    hasCanonicalEntitySources: async () => true,
    queryCanonicalRecords: async (query: { entityName: string; scope?: { date?: { from: string } } }) => query.entityName === "Products"
      ? { records: [{ productCode: "P1", productName: "Product 1", category: "Drinks" }], page: { hasMore: false } }
      : { records: query.entityName === "Invoice Items" && query.scope?.date?.from === "2026-04-03" ? [{ customerCode: "C1", productCode: "P1", quantity: 120, salesValue: 600 }] : [], page: { hasMore: false } },
  } as never);
  const result = await service.detect({ ...input, useActualBaselineVisits: true, requestingUser: { roleCode: "SALES_REP", email: "rep@example.com" } });
  assert.equal(result.status, "available");
  assert.equal(result.opportunities.length, 1);
  assert.equal(result.opportunities[0]?.suggestedQuantity, 0);
  assert.equal(result.opportunities[0]?.suggestedQuantityAvailable, false);
  assert.equal(result.opportunities[0]?.expectedSales, 600);
});
