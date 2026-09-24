import { strict as assert } from "node:assert";
import test from "node:test";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { TerritoryIntelligenceService } from "./territory-intelligence.service";

const user: AuthenticatedUser = {
  userId: "u", companyId: "company-1", email: "rep@example.test", roleCode: "SALES_REP",
  permissions: [], mustChangePassword: false, orgUnitId: null,
};

const situation = (overrides: Record<string, unknown>) => ({
  id: "s", type: "LOST_SALES", severity: "high", entityType: "customer", entityKey: "C-1",
  entityLabel: "Customer", title: "Risk", detail: "Detail", recommendation: "Act", metricValue: 0,
  metricValuePrior: 100, periodMonth: "2026-09", ownerRepEmail: "rep@example.test", ...overrides,
});

const sgiData = {
  situations: [
    situation({ id: "lost", type: "LOST_SALES", entityKey: "C-1", metricValuePrior: 100 }),
    situation({ id: "growth", type: "GROWTH_OPPORTUNITY", severity: "medium", entityKey: "C-2", metricValue: 40, metricValuePrior: null, title: "Growth" }),
    situation({ id: "rep", type: "TARGET_BEHIND", entityType: "rep", entityKey: "rep@example.test" }),
  ],
};

test("Territory summary preserves formulas, SGI mapping, ordering, and response shape from compact facts", async () => {
  const availability: string[] = [];
  const summaryQueries: Record<string, unknown>[] = [];
  const facade = {
    hasCanonicalEntitySources: async (_ctx: unknown, entities: string[]) => { availability.push(entities[0]!); return true; },
  };
  const scalable = {
    queryTerritorySummary: async (input: Record<string, unknown>) => {
      summaryQueries.push(input);
      return [
        { territoryId: "north", name: "North", lat: 10, lon: 20, customerCount: 2, salesCurrent: 150, salesPrior: 100, activeCurrentCount: 1, visitedCustomerCount: 1, situationCustomerCodes: ["C-1", "C-2"] },
        { territoryId: "south", name: "South", lat: 30, lon: 40, customerCount: 1, salesCurrent: 0, salesPrior: 0, activeCurrentCount: 0, visitedCustomerCount: 0, situationCustomerCodes: [] },
      ];
    },
  };
  const service = new TerritoryIntelligenceService(facade as never, { getLatest: async () => sgiData } as never, scalable as never);
  const result = await service.getSummary(user);

  assert.deepEqual(availability, ["Customers", "Invoices", "Visits"]);
  assert.equal(summaryQueries.length, 1);
  assert.deepEqual(summaryQueries[0]?.situationCustomerCodes, ["C-1", "C-2"]);
  assert.equal(result.groupedBy, "City");
  assert.deepEqual(result.territories.map(({ id, healthScore, metrics, opportunityValueSar, expectedImpactSar, why }) => ({ id, healthScore, metrics, opportunityValueSar, expectedImpactSar, why })), [
    {
      id: "south", healthScore: 50,
      metrics: { salesGrowthPct: null, activeCustomerRatePct: 0, lostSalesCount: 0, visitCoveragePct: 0, collectionHealthPct: 100 },
      opportunityValueSar: 0, expectedImpactSar: 0, why: [],
    },
    {
      id: "north", healthScore: 70,
      metrics: { salesGrowthPct: 50, activeCustomerRatePct: 50, lostSalesCount: 1, visitCoveragePct: 50, collectionHealthPct: 100 },
      opportunityValueSar: 140, expectedImpactSar: 140,
      why: [
        { type: "LOST_SALES", severity: "high", label: "Risk", detail: "Detail" },
        { type: "GROWTH_OPPORTUNITY", severity: "medium", label: "Growth", detail: "Detail" },
      ],
    },
  ]);
});

test("Territory customer points preserve metrics, normalization, duplicate row count, and coordinate exclusion", async () => {
  const pointQueries: Record<string, unknown>[] = [];
  const facade = { hasCanonicalEntitySources: async () => true };
  const scalable = {
    queryTerritoryCustomerFacts: async (input: Record<string, unknown>) => {
      pointQueries.push(input);
      return {
        totalCustomers: 3,
        rows: [
          { customerId: "C-1", customerName: "One", latitude: 10, longitude: 20, salesCurrent: 100, salesPrior: 50, collectionCurrent: 25, visitedCurrent: true },
          { customerId: "C-2", customerName: "Two", latitude: null, longitude: 30, salesCurrent: 0, salesPrior: 0, collectionCurrent: 0, visitedCurrent: false },
        ],
      };
    },
  };
  const service = new TerritoryIntelligenceService(facade as never, { getLatest: async () => sgiData } as never, scalable as never);
  const result = await service.getCustomerPoints(user, "collectionHealthPct", " North ");

  assert.equal(pointQueries[0]?.city, "North");
  assert.deepEqual(result, {
    metric: "collectionHealthPct",
    city: "North",
    totalCustomers: 3,
    excludedBadCoordinates: 1,
    points: [{
      customerId: "C-1", customerName: "One", latitude: 10, longitude: 20,
      metric: "collectionHealthPct", rawValue: 25, normalizedValue: 1, status: "good",
    }],
  });
});

test("Territory preserves missing-Customers and empty-city errors without a full entity read", async () => {
  let customersAvailable = false;
  let totalCustomers = 0;
  const facade = {
    hasCanonicalEntitySources: async (_ctx: unknown, entities: string[]) => entities[0] !== "Customers" || customersAvailable,
  };
  const scalable = {
    queryTerritoryCustomerFacts: async () => ({ totalCustomers, rows: [] }),
  };
  const service = new TerritoryIntelligenceService(facade as never, { getLatest: async () => null } as never, scalable as never);

  await assert.rejects(() => service.getSummary(user), /بيانات "العملاء" غير متاحة/);
  customersAvailable = true;
  await assert.rejects(() => service.getCustomerPoints(user, "healthScore", "Missing"), /لا يوجد عملاء في المدينة "Missing"/);
  totalCustomers = 1;
  assert.deepEqual(await service.getCustomerPoints(user, "healthScore", "Missing"), {
    metric: "healthScore", city: "Missing", totalCustomers: 1, excludedBadCoordinates: 0, points: [],
  });
});
