import { strict as assert } from "node:assert";
import test from "node:test";
import { ProductFitService } from "./product-fit.service";
import { NEED_TAXONOMY } from "./need-taxonomy";

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
