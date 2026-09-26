import { strict as assert } from "node:assert";
import test from "node:test";
import { ProductFitService } from "./product-fit.service";
import { NEED_TAXONOMY } from "./need-taxonomy";

type ProductFitCacheAccess = {
  companyRecords: (companyId: string, ctx: { companyId: string; requestingUser: { roleCode: string; email: string } }, businessType: string | null, channel: string | null) => Promise<{ peerScope: string; peerSales: unknown[]; products: Record<string, unknown>[] }>;
  companyData: Map<string, { until: number; values: Map<string, Promise<unknown>> }>;
};

function cacheService() {
  const calls: Array<{ entityName: string; companyId: string; email: string | undefined; roleCode: string | undefined }> = [];
  const rie = {
    queryProductFitData: async (query: { companyId: string; businessType: string | null; requestingUser?: { roleCode?: string; email?: string } }) => {
      calls.push({ entityName: `ProductFit:${query.businessType ?? ""}`, companyId: query.companyId, email: query.requestingUser?.email, roleCode: query.requestingUser?.roleCode });
      return { peerScope: "NONE", peerSales: [], products: [{ companyId: query.companyId, email: query.requestingUser?.email ?? "anonymous", roleCode: query.requestingUser?.roleCode ?? "unknown" }] };
    },
  };
  return { service: new ProductFitService(rie as never, {} as never, {} as never) as unknown as ProductFitCacheAccess, calls };
}

function ctx(companyId: string, email: string, roleCode: string) {
  return { companyId, requestingUser: { email, roleCode } };
}

const horecaNeedTags = (businessType: string) => NEED_TAXONOMY.filter((need) => need.businessTypes.includes(businessType)).map((need) => need.tag);

test("every requested HoReCa business has a broad FMCG operational profile", () => {
  for (const businessType of ["hotel", "restaurant", "cafe", "patisserie", "kitchen"]) {
    assert.deepEqual(horecaNeedTags(businessType), ["horeca-food-service", "horeca-beverages", "horeca-sweets", "horeca-cleaning", "horeca-hygiene", "horeca-disposables"]);
  }
});

test("all requested HoReCa profiles return distinct evidence-ranked FMCG candidates", () => {
  const service = new ProductFitService({} as never, {} as never, {} as never) as unknown as {
    matchProducts: (products: readonly Record<string, unknown>[], needs: readonly unknown[], peer: { sales: Map<string, { buyerCount: number; value: number }>; scope: "CUSTOMER_TYPE" }, tier: null) => { productCode: string }[];
  };
  const products = [
    { ProductCode: "water", ProductName: "Bottled Water", Category: "Beverage", ProductStatus: "active" },
    { ProductCode: "flour", ProductName: "Flour", Category: "Food ingredient", ProductStatus: "active" },
    { ProductCode: "detergent", ProductName: "Detergent", Category: "Cleaning", ProductStatus: "active" },
    { ProductCode: "cups", ProductName: "Plastic cups", Category: "Plastic packaging", ProductStatus: "active" },
  ];
  const peer = { scope: "CUSTOMER_TYPE" as const, sales: new Map(products.map((product, index) => [String(product.ProductCode), { buyerCount: 1, value: (index + 1) * 100 }])) };
  for (const businessType of ["hotel", "restaurant", "cafe", "patisserie", "kitchen"]) {
    const candidates = service.matchProducts(products, NEED_TAXONOMY.filter((need) => need.businessTypes.includes(businessType)), peer, null);
    assert.deepEqual(candidates.map((candidate) => candidate.productCode), ["cups", "detergent", "flour", "water"]);
  }
});

test("companyRecords never reuses a same-company cache entry across hierarchy-scoped users, in either fill order", async () => {
  for (const [first, second] of [[ctx("company-1", "manager@example.com", "MANAGER"), ctx("company-1", "rep@example.com", "SALES_REP")], [ctx("company-1", "rep@example.com", "SALES_REP"), ctx("company-1", "manager@example.com", "MANAGER")]] as const) {
    const { service, calls } = cacheService();
    const firstRows = await service.companyRecords(first.companyId, first, "hotel", "horeca");
    const secondRows = await service.companyRecords(second.companyId, second, "hotel", "horeca");
    assert.equal(firstRows.products[0]?.email, first.requestingUser.email);
    assert.equal(secondRows.products[0]?.email, second.requestingUser.email);
    assert.equal(calls.length, 2);
  }
});

test("companyRecords reuses the five-minute entry only for the same stable requester and role", async () => {
  const { service, calls } = cacheService();
  const identity = ctx("company-1", "rep@example.com", "SALES_REP");
  await service.companyRecords(identity.companyId, identity, "hotel", "horeca");
  await service.companyRecords(identity.companyId, identity, "hotel", "horeca");
  assert.equal(calls.length, 1);
  assert.equal(service.companyData.size, 1);
  const cached = [...service.companyData.values()][0]!;
  assert.ok(cached.until > Date.now());
  assert.ok(cached.until <= Date.now() + 5 * 60 * 1000);
  assert.equal(cached.values.size, 1);
});

test("companyRecords keeps prospect peer inputs separate inside the same permission cache entry", async () => {
  const { service, calls } = cacheService();
  const identity = ctx("company-1", "rep@example.com", "SALES_REP");
  await service.companyRecords(identity.companyId, identity, "hotel", "horeca");
  await service.companyRecords(identity.companyId, identity, "restaurant", "horeca");
  await service.companyRecords(identity.companyId, identity, "hotel", "horeca");
  assert.equal(calls.length, 2);
  assert.equal(service.companyData.size, 1);
  assert.equal([...service.companyData.values()][0]!.values.size, 2);
});

test("companyRecords isolates companies and role changes, including admin, manager, and rep scopes", async () => {
  const { service, calls } = cacheService();
  await service.companyRecords("company-1", ctx("company-1", "shared@example.com", "COMPANY_ADMIN"), "hotel", "horeca");
  await service.companyRecords("company-1", ctx("company-1", "shared@example.com", "MANAGER"), "hotel", "horeca");
  await service.companyRecords("company-1", ctx("company-1", "shared@example.com", "SALES_REP"), "hotel", "horeca");
  await service.companyRecords("company-2", ctx("company-2", "shared@example.com", "COMPANY_ADMIN"), "hotel", "horeca");
  assert.equal(calls.length, 4);
  assert.equal(service.companyData.size, 4);
});

test("companyRecords bypasses scoped caching when requester identity is missing or ambiguous", async () => {
  const { service, calls } = cacheService();
  const missingEmail = { companyId: "company-1", requestingUser: { roleCode: "SALES_REP", email: "" } };
  const missingRole = { companyId: "company-1", requestingUser: { roleCode: "", email: "rep@example.com" } };
  await service.companyRecords("company-1", missingEmail, "hotel", "horeca");
  await service.companyRecords("company-1", missingEmail, "hotel", "horeca");
  await service.companyRecords("company-1", missingRole, "hotel", "horeca");
  await service.companyRecords("company-1", missingRole, "hotel", "horeca");
  assert.equal(calls.length, 4);
  assert.equal(service.companyData.size, 0);
});
