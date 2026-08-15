import { strict as assert } from "node:assert";
import test from "node:test";
import { ProductFitService } from "./product-fit.service";
import { NEED_TAXONOMY } from "./need-taxonomy";

const hotelNeedTags = NEED_TAXONOMY.filter((need) => need.businessTypes.includes("hotel")).map((need) => need.tag);

test("hotel has a broad HoReCa FMCG need profile", () => {
  assert.deepEqual(hotelNeedTags, [
    "hotel-housekeeping",
    "hotel-hygiene",
    "hotel-food-service",
    "hotel-beverages",
    "hotel-disposables",
  ]);
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
