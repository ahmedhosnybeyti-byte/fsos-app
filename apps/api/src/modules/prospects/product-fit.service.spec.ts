import { strict as assert } from "node:assert";
import test from "node:test";
import { ProductFitService } from "./product-fit.service";
import { NEED_TAXONOMY } from "./need-taxonomy";

type ProductFitCacheAccess = {
  companyRecords: (companyId: string, ctx: { companyId: string; requestingUser: { roleCode: string; email: string } }) => Promise<(readonly Record<string, unknown>[])[]>;
  companyData: Map<string, { until: number; value: Promise<(readonly Record<string, unknown>[])[]> }>;
};

function cacheService() {
  const calls: Array<{ entityName: string; companyId: string; email: string | undefined; roleCode: string | undefined }> = [];
  const rie = {
    getEntityRecords: async (entityName: string, ctx: { companyId: string; requestingUser?: { roleCode?: string; email?: string } }) => {
      calls.push({ entityName, companyId: ctx.companyId, email: ctx.requestingUser?.email, roleCode: ctx.requestingUser?.roleCode });
      return { available: true, fields: [], records: [{ entityName, companyId: ctx.companyId, email: ctx.requestingUser?.email ?? "anonymous", roleCode: ctx.requestingUser?.roleCode ?? "unknown" }] };
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

test("hotel recommendations use restaurant/cafe evidence only when hotel sales are absent", () => {
  const service = new ProductFitService({} as never, {} as never, {} as never) as unknown as {
    peerSales: (customers: readonly Record<string, unknown>[], invoices: readonly Record<string, unknown>[], items: readonly Record<string, unknown>[], businessType: string, channel: string) => { scope: string; sales: Map<string, { customers: Set<string>; value: number }> };
  };
  const customers = [
    { CustomerCode: "hotel-1", CustomerType: "hotel", Channel: "HoReCa" },
    { CustomerCode: "restaurant-1", CustomerType: "restaurant", Channel: "HoReCa" },
  ];
  const fallback = service.peerSales(customers, [{ InvoiceNo: "r-1", CustomerCode: "restaurant-1" }], [{ InvoiceNo: "r-1", ProductCode: "water", LineTotal: 120 }], "hotel", "HoReCa");
  assert.equal(fallback.scope, "HORECA_FALLBACK");
  assert.equal(fallback.sales.get("water")?.value, 120);

  const hotelFirst = service.peerSales(customers, [{ InvoiceNo: "h-1", CustomerCode: "hotel-1" }, { InvoiceNo: "r-1", CustomerCode: "restaurant-1" }], [{ InvoiceNo: "h-1", ProductCode: "tissue", LineTotal: 200 }, { InvoiceNo: "r-1", ProductCode: "water", LineTotal: 120 }], "hotel", "HoReCa");
  assert.equal(hotelFirst.scope, "CUSTOMER_TYPE");
  assert.equal(hotelFirst.sales.get("tissue")?.value, 200);
  assert.equal(hotelFirst.sales.has("water"), false);
});

test("all requested HoReCa profiles return distinct evidence-ranked FMCG candidates", () => {
  const service = new ProductFitService({} as never, {} as never, {} as never) as unknown as {
    matchProducts: (products: readonly Record<string, unknown>[], needs: readonly unknown[], peer: { sales: Map<string, { customers: Set<string>; value: number }>; scope: "CUSTOMER_TYPE" }, tier: null) => { productCode: string }[];
  };
  const products = [
    { ProductCode: "water", ProductName: "Bottled Water", Category: "Beverage", ProductStatus: "active" },
    { ProductCode: "flour", ProductName: "Flour", Category: "Food ingredient", ProductStatus: "active" },
    { ProductCode: "detergent", ProductName: "Detergent", Category: "Cleaning", ProductStatus: "active" },
    { ProductCode: "cups", ProductName: "Plastic cups", Category: "Plastic packaging", ProductStatus: "active" },
  ];
  const peer = { scope: "CUSTOMER_TYPE" as const, sales: new Map(products.map((product, index) => [String(product.ProductCode), { customers: new Set(["peer-1"]), value: (index + 1) * 100 }])) };
  for (const businessType of ["hotel", "restaurant", "cafe", "patisserie", "kitchen"]) {
    const candidates = service.matchProducts(products, NEED_TAXONOMY.filter((need) => need.businessTypes.includes(businessType)), peer, null);
    assert.deepEqual(candidates.map((candidate) => candidate.productCode), ["cups", "detergent", "flour", "water"]);
  }
});

test("companyRecords never reuses a same-company cache entry across hierarchy-scoped users, in either fill order", async () => {
  for (const [first, second] of [[ctx("company-1", "manager@example.com", "MANAGER"), ctx("company-1", "rep@example.com", "SALES_REP")], [ctx("company-1", "rep@example.com", "SALES_REP"), ctx("company-1", "manager@example.com", "MANAGER")]] as const) {
    const { service, calls } = cacheService();
    const firstRows = await service.companyRecords(first.companyId, first);
    const secondRows = await service.companyRecords(second.companyId, second);
    assert.equal(firstRows[0]![0]?.email, first.requestingUser.email);
    assert.equal(secondRows[0]![0]?.email, second.requestingUser.email);
    assert.equal(calls.length, 8);
  }
});

test("companyRecords reuses the five-minute entry only for the same stable requester and role", async () => {
  const { service, calls } = cacheService();
  const identity = ctx("company-1", "rep@example.com", "SALES_REP");
  await service.companyRecords(identity.companyId, identity);
  await service.companyRecords(identity.companyId, identity);
  assert.equal(calls.length, 4);
  assert.equal(service.companyData.size, 1);
  const cached = [...service.companyData.values()][0]!;
  assert.ok(cached.until > Date.now());
  assert.ok(cached.until <= Date.now() + 5 * 60 * 1000);
});

test("companyRecords isolates companies and role changes, including admin, manager, and rep scopes", async () => {
  const { service, calls } = cacheService();
  await service.companyRecords("company-1", ctx("company-1", "shared@example.com", "COMPANY_ADMIN"));
  await service.companyRecords("company-1", ctx("company-1", "shared@example.com", "MANAGER"));
  await service.companyRecords("company-1", ctx("company-1", "shared@example.com", "SALES_REP"));
  await service.companyRecords("company-2", ctx("company-2", "shared@example.com", "COMPANY_ADMIN"));
  assert.equal(calls.length, 16);
  assert.equal(service.companyData.size, 4);
});

test("companyRecords bypasses scoped caching when requester identity is missing or ambiguous", async () => {
  const { service, calls } = cacheService();
  const missingEmail = { companyId: "company-1", requestingUser: { roleCode: "SALES_REP", email: "" } };
  const missingRole = { companyId: "company-1", requestingUser: { roleCode: "", email: "rep@example.com" } };
  await service.companyRecords("company-1", missingEmail);
  await service.companyRecords("company-1", missingEmail);
  await service.companyRecords("company-1", missingRole);
  await service.companyRecords("company-1", missingRole);
  assert.equal(calls.length, 16);
  assert.equal(service.companyData.size, 0);
});
