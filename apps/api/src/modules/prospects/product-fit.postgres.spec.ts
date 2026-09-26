import { strict as assert } from "node:assert";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Prisma } from "@field-sales-os/database";
import type { EntityRecord } from "../rie/entity-provider.interface";
import { ExcelDatasetEntityProvider } from "../rie/excel-entity-provider.service";
import { RieFacade } from "../rie/rie-facade.service";
import { RieScalableQueryService } from "../rie/scalable-query.service";
import type { RieProductFitData } from "../rie/scalable-query.types";
import { CatalogFitService } from "./catalog-fit.service";
import { NEED_TAXONOMY } from "./need-taxonomy";
import { ProductFitService } from "./product-fit.service";

interface TestPostgres {
  exec(sql: string): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
}

const HORECA_TYPES = new Set(["hotel", "restaurant", "cafe", "coffee_shop", "bakery", "patisserie", "kitchen", "catering_service"]);
const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();
const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0;

function legacyPeerSales(customers: readonly EntityRecord[], invoices: readonly EntityRecord[], items: readonly EntityRecord[], businessType: string | null, channel: string | null) {
  const typePeers = new Set(customers.filter((row) => norm(row.CustomerType) === norm(businessType) && norm(businessType) !== "").map((row) => norm(row.CustomerCode)));
  const channelPeers = new Set(customers.filter((row) => norm(row.Channel) === norm(channel) && norm(channel) !== "").map((row) => norm(row.CustomerCode)));
  const invoiceCustomers = new Map(invoices.map((row) => [norm(row.InvoiceNo), norm(row.CustomerCode)]));
  const salesFor = (peers: ReadonlySet<string>) => {
    const sales = new Map<string, { buyers: Set<string>; orderValue: number }>();
    for (const item of items) {
      const customer = invoiceCustomers.get(norm(item.InvoiceNo));
      const productCode = norm(item.ProductCode);
      if (!customer || !productCode || !peers.has(customer)) continue;
      const entry = sales.get(productCode) ?? { buyers: new Set<string>(), orderValue: 0 };
      entry.buyers.add(customer);
      entry.orderValue += numeric(item.LineTotal);
      sales.set(productCode, entry);
    }
    return sales;
  };
  let sales = salesFor(typePeers.size > 0 ? typePeers : channelPeers);
  let peerScope: RieProductFitData["peerScope"] = typePeers.size > 0 ? "CUSTOMER_TYPE" : channelPeers.size > 0 ? "CHANNEL" : "NONE";
  if (HORECA_TYPES.has(norm(businessType)) && sales.size === 0) {
    const horecaPeers = new Set(customers.filter((row) => HORECA_TYPES.has(norm(row.CustomerType))).map((row) => norm(row.CustomerCode)));
    const fallback = salesFor(horecaPeers);
    if (fallback.size > 0) {
      sales = fallback;
      peerScope = "HORECA_FALLBACK";
    }
  }
  return {
    peerScope,
    peerSales: [...sales.entries()].map(([productCode, value]) => ({ productCode, orderValue: value.orderValue, buyerCount: value.buyers.size })).sort((a, b) => a.productCode.localeCompare(b.productCode)),
  };
}

test("Product Fit PostgreSQL contract preserves legacy peer and final-candidate semantics", {
  skip: process.env.RIE_TEST_PGLITE_MODULE ? false : "Set RIE_TEST_PGLITE_MODULE to run PostgreSQL Product Fit parity tests",
}, async (t) => {
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!) as { PGlite: new () => TestPostgres };
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE files (
      id text PRIMARY KEY, company_id text NOT NULL, dataset_type text NOT NULL,
      created_at timestamptz NOT NULL, is_active boolean NOT NULL,
      status text NOT NULL, dataset_type_confirmed boolean NOT NULL
    );
    CREATE TABLE rie_dataset_versions (
      id text PRIMARY KEY, company_id text NOT NULL, entity_name text NOT NULL,
      source_file_id text NOT NULL REFERENCES files(id), is_active boolean NOT NULL
    );
    CREATE TABLE rie_entity_rows (
      id text PRIMARY KEY, company_id text NOT NULL, entity_name text NOT NULL,
      dataset_version_id text NOT NULL REFERENCES rie_dataset_versions(id),
      entity_key text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL
    );
    CREATE TABLE rie_canonical_entity_rows (
      id text PRIMARY KEY, company_id text NOT NULL, source_file_id text,
      entity_name text NOT NULL, entity_key text NOT NULL, data jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX rie_canonical_entity_rows_company_id_entity_name_entity_key_key
      ON rie_canonical_entity_rows(company_id, entity_name, entity_key);
    CREATE INDEX rie_canonical_entity_rows_company_id_entity_name_idx
      ON rie_canonical_entity_rows(company_id, entity_name);
    CREATE INDEX ON rie_dataset_versions(company_id, entity_name, is_active);
    CREATE INDEX ON rie_entity_rows(dataset_version_id, (LOWER(BTRIM(COALESCE(data ->> 'InvoiceNo', '')))));
  `);

  type FixtureFile = { id: string; companyId: string; datasetType: string; createdAt: string };
  type FixtureVersion = { id: string; companyId: string; entityName: string; sourceFileId: string };
  const files: FixtureFile[] = [];
  const versions: FixtureVersion[] = [];
  const addFile = async (file: FixtureFile, rows: Array<{ id: string; key: string; data: Record<string, unknown>; createdAt?: string }>) => {
    files.push(file);
    const version = { id: `version-${file.id}`, companyId: file.companyId, entityName: file.datasetType, sourceFileId: file.id };
    versions.push(version);
    await db.query("INSERT INTO files VALUES ($1, $2, $3, $4, true, 'READY', true)", [file.id, file.companyId, file.datasetType, file.createdAt]);
    await db.query("INSERT INTO rie_dataset_versions VALUES ($1, $2, $3, $4, true)", [version.id, version.companyId, version.entityName, version.sourceFileId]);
    for (const [index, row] of rows.entries()) {
      await db.query(
        "INSERT INTO rie_entity_rows VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)",
        [row.id, file.companyId, file.datasetType, version.id, row.key, JSON.stringify(row.data), row.createdAt ?? `2026-08-01T00:00:${String(index).padStart(2, "0")}Z`],
      );
    }
  };

  await addFile({ id: "c1-customers", companyId: "company-1", datasetType: "Customers", createdAt: "2026-08-02T00:00:00Z" }, [
    { id: "customer-h1", key: "H1", data: { CustomerCode: "H1", CustomerType: "hotel", Channel: "HoReCa", RouteID: "R-1" } },
    { id: "customer-h2", key: "H2", data: { CustomerCode: "H2", CustomerType: "hotel", Channel: "HoReCa", RouteID: "R-1" } },
    { id: "customer-r1", key: "R1", data: { CustomerCode: "R1", CustomerType: "restaurant", Channel: "HoReCa", RouteID: "R-1" } },
    { id: "customer-k1", key: "K1", data: { CustomerCode: "K1", CustomerType: "kitchen", Channel: "HoReCa", RouteID: "R-1" } },
    { id: "customer-cafe", key: "CAFE", data: { CustomerCode: "CAFE", CustomerType: "cafe", Channel: "HoReCa", RouteID: "R-1" } },
    { id: "customer-c1", key: "C1", data: { CustomerCode: "C1", CustomerType: "grocery", Channel: "Retail", RouteID: "R-1" } },
    { id: "customer-secret", key: "SECRET", data: { CustomerCode: "SECRET", CustomerType: "hotel", Channel: "HoReCa", RouteID: "R-2" } },
  ]);
  await addFile({ id: "c1-invoices-new", companyId: "company-1", datasetType: "Invoices", createdAt: "2026-08-02T00:00:00Z" }, [
    { id: "invoice-h1", key: "H1-A", data: { InvoiceNo: "H1-A", InvoiceDate: "2026-08-01", CustomerCode: "H1", RouteID: "R-1" } },
    { id: "invoice-h2", key: "H2-A", data: { InvoiceNo: "H2-A", InvoiceDate: "2020-01-01", CustomerCode: "H2", RouteID: "R-1" } },
    { id: "invoice-r", key: "R-A", data: { InvoiceNo: "R-A", CustomerCode: "R1", RouteID: "R-1" } },
    { id: "invoice-cafe", key: "CAFE-A", data: { InvoiceNo: "CAFE-A", CustomerCode: "CAFE", RouteID: "R-1" } },
    { id: "invoice-channel", key: "CHANNEL-A", data: { InvoiceNo: "CHANNEL-A", CustomerCode: "C1", RouteID: "R-1" } },
    { id: "invoice-dup-first", key: "DUP-1", data: { InvoiceNo: "DUP", CustomerCode: "H1", RouteID: "R-1" }, createdAt: "2026-08-01T00:01:00Z" },
    { id: "invoice-dup-last", key: "DUP-2", data: { InvoiceNo: "DUP", CustomerCode: "C1", RouteID: "R-1" }, createdAt: "2026-08-01T00:02:00Z" },
    { id: "invoice-secret", key: "SECRET-A", data: { InvoiceNo: "SECRET-A", CustomerCode: "SECRET", RouteID: "R-2" } },
    { id: "invoice-item-route", key: "ITEM-ROUTE", data: { InvoiceNo: "ITEM-ROUTE", CustomerCode: "H1", RouteID: "R-1" } },
    { id: "invoice-replaced-new", key: "REPLACED-NEW", data: { InvoiceNo: "REPLACED", CustomerCode: "C1", RouteID: "R-1" } },
  ]);
  await addFile({ id: "c1-invoices-old", companyId: "company-1", datasetType: "Invoices", createdAt: "2026-07-01T00:00:00Z" }, [
    { id: "invoice-replaced-old", key: "REPLACED-OLD", data: { InvoiceNo: "REPLACED", CustomerCode: "H1", RouteID: "R-1" } },
    { id: "invoice-history", key: "OLD-HISTORY", data: { InvoiceNo: "OLD-HISTORY", InvoiceDate: "2010-01-01", CustomerCode: "H1", RouteID: "R-1" } },
  ]);
  await addFile({ id: "c1-items-new", companyId: "company-1", datasetType: "Invoice Items", createdAt: "2026-08-02T00:00:00Z" }, [
    { id: "item-h1-1", key: "H1-A-1-new", data: { InvoiceNo: "H1-A", LineNo: 1, ProductCode: "P1", LineTotal: 100, RouteID: "R-1" } },
    { id: "item-h1-2", key: "H1-A-2", data: { InvoiceNo: "H1-A", LineNo: 2, ProductCode: "P1", LineTotal: 50, RouteID: "R-1" } },
    { id: "item-h2", key: "H2-A-1", data: { InvoiceNo: "H2-A", LineNo: 1, ProductCode: "P1", LineTotal: 25, RouteID: "R-1" } },
    { id: "item-dup-a", key: "H1-A-3-a", data: { InvoiceNo: "H1-A", LineNo: 3, ProductCode: "P2", LineTotal: 10, RouteID: "R-1" } },
    { id: "item-dup-b", key: "H1-A-3-b", data: { InvoiceNo: "H1-A", LineNo: 3, ProductCode: "P2", LineTotal: 20, RouteID: "R-1" } },
    { id: "item-r", key: "R-A-1", data: { InvoiceNo: "R-A", LineNo: 1, ProductCode: "P3", LineTotal: 300, RouteID: "R-1" } },
    { id: "item-cafe-invalid", key: "CAFE-A-1", data: { InvoiceNo: "CAFE-A", LineNo: 1, ProductCode: "P4", LineTotal: "invalid", RouteID: "R-1" } },
    { id: "item-cafe-blank", key: "CAFE-A-2", data: { InvoiceNo: "CAFE-A", LineNo: 2, ProductCode: "P4", LineTotal: " ", RouteID: "R-1" } },
    { id: "item-cafe-null", key: "CAFE-A-3", data: { InvoiceNo: "CAFE-A", LineNo: 3, ProductCode: "P4", LineTotal: null, RouteID: "R-1" } },
    { id: "item-channel", key: "CHANNEL-A-1", data: { InvoiceNo: "CHANNEL-A", LineNo: 1, ProductCode: "P5", LineTotal: 40, RouteID: "R-1" } },
    { id: "item-dup-invoice", key: "DUP-1", data: { InvoiceNo: "DUP", LineNo: 1, ProductCode: "P6", LineTotal: 999, RouteID: "R-1" } },
    { id: "item-secret", key: "SECRET-A-1", data: { InvoiceNo: "SECRET-A", LineNo: 1, ProductCode: "P7", LineTotal: 777, RouteID: "R-2" } },
    { id: "item-route-mismatch", key: "ITEM-ROUTE-1", data: { InvoiceNo: "ITEM-ROUTE", LineNo: 1, ProductCode: "P8", LineTotal: 888, RouteID: "R-2" } },
    { id: "item-replaced", key: "REPLACED-1", data: { InvoiceNo: "REPLACED", LineNo: 1, ProductCode: "P9", LineTotal: 90, RouteID: "R-1" } },
  ]);
  await addFile({ id: "c1-items-old", companyId: "company-1", datasetType: "Invoice Items", createdAt: "2026-07-01T00:00:00Z" }, [
    { id: "item-h1-old", key: "H1-A-1-old", data: { InvoiceNo: "H1-A", LineNo: 1, ProductCode: "P1", LineTotal: 5000, RouteID: "R-1" } },
    { id: "item-history", key: "OLD-HISTORY-1", data: { InvoiceNo: "OLD-HISTORY", LineNo: 1, ProductCode: "P10", LineTotal: 10, RouteID: "R-1" } },
  ]);
  await addFile({ id: "c1-products", companyId: "company-1", datasetType: "Products", createdAt: "2026-08-02T00:00:00Z" }, [
    ...Array.from({ length: 12 }, (_, index) => ({ id: `product-${index + 1}`, key: `P${index + 1}`, data: { ProductCode: `P${index + 1}`, ProductName: `${index === 0 ? "Premium " : ""}Beverage ${index + 1}`, Category: "Beverage", Brand: `Brand ${index + 1}`, ProductStatus: "Active", Status: "Active" } })),
    { id: "product-12-duplicate", key: "P12-DUP", data: { ProductCode: "P12", ProductName: "Beverage 12", Category: "Beverage", Brand: "Brand 12", ProductStatus: "Active", Status: "Active" } },
    { id: "product-13", key: "P13", data: { ProductCode: "P13", ProductName: "Inactive Beverage", Category: "Beverage", Brand: "Brand 13", ProductStatus: "Inactive", Status: "Active" } },
  ]);

  for (const [entity, rows] of [
    ["Customers", [{ CustomerCode: "C2-H", CustomerType: "hotel", Channel: "HoReCa", RouteID: "R-1" }]],
    ["Invoices", [{ InvoiceNo: "C2-I", CustomerCode: "C2-H", RouteID: "R-1" }]],
    ["Invoice Items", [{ InvoiceNo: "C2-I", LineNo: 1, ProductCode: "P1", LineTotal: 500, RouteID: "R-1" }]],
    ["Products", [{ ProductCode: "P1", ProductName: "Company 2 Beverage", Category: "Beverage", ProductStatus: "Active", Status: "Active" }]],
  ] as const) {
    await addFile({ id: `c2-${entity.replace(/\s/g, "-").toLowerCase()}`, companyId: "company-2", datasetType: entity, createdAt: "2026-08-02T00:00:00Z" }, rows.map((data, index) => ({ id: `c2-${entity}-${index}`, key: `${index}`, data })));
  }
  await addFile({ id: "c4-products", companyId: "company-4", datasetType: "Products", createdAt: "2026-08-02T00:00:00Z" }, [
    { id: "c4-product", key: "P1", data: { ProductCode: "P1", ProductName: "Available Product", Category: "Beverage", Status: "Active" } },
  ]);
  files.push({ id: "c4-customers-without-version", companyId: "company-4", datasetType: "Customers", createdAt: "2026-08-02T00:00:00Z" });
  await db.query("INSERT INTO files VALUES ($1, $2, $3, $4, true, 'READY', true)", ["c4-customers-without-version", "company-4", "Customers", "2026-08-02T00:00:00Z"]);

  // Product Fit executes only against the canonical current-state relation;
  // historical tables remain in this fixture solely as the parity oracle.
  const migration = readFileSync(resolve(process.cwd(), "packages/database/prisma/migrations/20260923020000_rie_canonical_current_state/migration.sql"), "utf8");
  await db.exec(migration);

  const listFiles = async (companyId: string) => files.filter((file) => file.companyId === companyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const hierarchy = {
    resolveAllowedRouteIds: async (_companyId: string, user?: { roleCode?: string; email?: string }) => {
      if (!user || user.roleCode === "COMPANY_ADMIN") return null;
      if (user.email === "rep2@example.com") return new Set(["r-2"]);
      if (user.email === "manager@example.com") return new Set(["r-1", "r-2"]);
      return new Set(["r-1"]);
    },
  };
  let productFitSql = "";
  const prisma = {
    rieDatasetVersion: {
      findMany: async ({ where }: { where: { companyId: string; entityName?: string | { in: string[] }; sourceFileId?: { in: string[] } } }) => {
        const entities = typeof where.entityName === "string" ? [where.entityName] : where.entityName?.in;
        return versions.filter((version) => version.companyId === where.companyId
          && (!entities || entities.includes(version.entityName))
          && (!where.sourceFileId || where.sourceFileId.in.includes(version.sourceFileId)));
      },
    },
    $queryRaw: async (query: Prisma.Sql) => {
      if (query.text.includes("selected_scope AS MATERIALIZED")) productFitSql = query.text;
      return (await db.query(query.text, query.values)).rows;
    },
  };
  const filesService = { listConfirmedActiveForCompany: listFiles };
  const provider = new ExcelDatasetEntityProvider(filesService as never, hierarchy as never, prisma as never);
  const scalable = new RieScalableQueryService(prisma as never, hierarchy as never);
  const facade = new RieFacade(null as never, null as never, null as never, null as never, provider, prisma as never, filesService as never, hierarchy as never, scalable);

  const context = { companyId: "company-1", requestingUser: { roleCode: "SALES_REP", email: "rep1@example.com" } };
  const [customers, invoices, items, products] = await Promise.all([
    provider.getRecords("Customers", context),
    provider.getRecords("Invoices", context),
    provider.getRecords("Invoice Items", context),
    provider.getRecords("Products", context),
  ]);
  const compare = async (businessType: string | null, channel: string | null, queryContext = context) => {
    const legacy = legacyPeerSales(customers.records, invoices.records, items.records, businessType, channel);
    const current = await facade.queryProductFitData({
      ...queryContext,
      businessType,
      channel,
      horecaCustomerTypes: HORECA_TYPES.has(norm(businessType)) ? [...HORECA_TYPES] : [],
    });
    assert.equal(current.peerScope, legacy.peerScope);
    assert.deepEqual([...current.peerSales].sort((a, b) => a.productCode.localeCompare(b.productCode)), legacy.peerSales);
    return current;
  };

  const hotel = await compare("hotel", "HoReCa");
  assert.deepEqual(hotel.peerSales, [
    { productCode: "p1", orderValue: 175, buyerCount: 2 },
    { productCode: "p10", orderValue: 10, buyerCount: 1 },
    { productCode: "p2", orderValue: 30, buyerCount: 1 },
  ]);
  assert.equal(hotel.products.length, products.records.length);
  assert.deepEqual(Object.keys(hotel.products[0]!).sort(), ["Brand", "Category", "ProductCode", "ProductName", "ProductStatus", "Status"].sort());
  assert.equal(hotel.products.some((product) => "data" in product), false);
  assert.match(productFitSql, /invoice_scoped AS MATERIALIZED/);
  assert.match(productFitSql, /INNER JOIN invoice_scoped scoped_invoice/);
  assert.match(productFitSql, /COUNT\(DISTINCT sales\.customer_code\)/);
  assert.doesNotMatch(productFitSql, /(?:customer|invoice|item|product)_source\.\*/);

  const channelFallback = await compare("unknown", "Retail");
  assert.equal(channelFallback.peerScope, "CHANNEL");
  assert.deepEqual(channelFallback.peerSales, [
    { productCode: "p5", orderValue: 40, buyerCount: 1 },
    { productCode: "p6", orderValue: 999, buyerCount: 1 },
    { productCode: "p9", orderValue: 90, buyerCount: 1 },
  ]);
  const horecaFallback = await compare("kitchen", "HoReCa");
  assert.equal(horecaFallback.peerScope, "HORECA_FALLBACK");
  const zeroSales = await compare("cafe", "HoReCa");
  assert.equal(zeroSales.peerScope, "CUSTOMER_TYPE");
  assert.deepEqual(zeroSales.peerSales, [{ productCode: "p4", orderValue: 0, buyerCount: 1 }]);
  const noPeers = await compare("unknown", "unknown");
  assert.deepEqual({ scope: noPeers.peerScope, sales: noPeers.peerSales }, { scope: "NONE", sales: [] });

  const rep2Context = { companyId: "company-1", requestingUser: { roleCode: "SALES_REP", email: "rep2@example.com" } };
  const rep2Data = await facade.queryProductFitData({ ...rep2Context, businessType: "hotel", channel: "HoReCa", horecaCustomerTypes: [...HORECA_TYPES] });
  assert.deepEqual(rep2Data.peerSales, [{ productCode: "p7", orderValue: 777, buyerCount: 1 }]);
  const company2 = await facade.queryProductFitData({ companyId: "company-2", requestingUser: context.requestingUser, businessType: "hotel", channel: "HoReCa", horecaCustomerTypes: [...HORECA_TYPES] });
  assert.deepEqual(company2.peerSales, [{ productCode: "p1", orderValue: 500, buyerCount: 1 }]);
  const noData = await facade.queryProductFitData({ companyId: "company-3", requestingUser: context.requestingUser, businessType: "hotel", channel: "HoReCa", horecaCustomerTypes: [...HORECA_TYPES] });
  assert.deepEqual(noData, { peerScope: "NONE", peerSales: [], products: [] });
  const incompleteSource = await facade.queryProductFitData({ companyId: "company-4", requestingUser: context.requestingUser, businessType: "hotel", channel: "HoReCa", horecaCustomerTypes: [...HORECA_TYPES] });
  assert.equal(incompleteSource.peerScope, "NONE");
  assert.deepEqual(incompleteSource.peerSales, []);
  assert.equal(incompleteSource.products.length, 1);

  const internal = new ProductFitService({} as never, {} as never, new CatalogFitService()) as unknown as {
    deriveNeeds: (businessType: string | null, insights: unknown) => unknown[];
    matchProducts: (products: readonly EntityRecord[], needs: readonly unknown[], peer: { scope: RieProductFitData["peerScope"]; sales: Map<string, { buyerCount: number; value: number }> }, tier: "PREMIUM" | "MID_MARKET" | "VALUE" | null) => unknown[];
  };
  const profile = { inputFingerprint: "fixture", businessClassification: { tier: "PREMIUM", tierConfidence: 100 }, menuServiceInsights: { needTags: [] } };
  const prospect = { businessType: "hotel", channel: "HoReCa" };
  const legacy = legacyPeerSales(customers.records, invoices.records, items.records, prospect.businessType, prospect.channel);
  const needs = internal.deriveNeeds(prospect.businessType, profile.menuServiceInsights);
  const legacyCandidates = internal.matchProducts(products.records, needs, {
    scope: legacy.peerScope,
    sales: new Map(legacy.peerSales.map((sale) => [sale.productCode, { buyerCount: sale.buyerCount, value: sale.orderValue }])),
  }, "PREMIUM").slice(0, 10);
  let stored: unknown;
  const service = new ProductFitService({ queryProductFitData: async () => hotel } as never, {
    profile: async () => profile,
    prospectFacts: async () => prospect,
    storeProductFit: async (_companyId: string, _prospectId: string, output: unknown) => { stored = output; },
  } as never, new CatalogFitService());
  const output = await service.build({ companyId: "company-1", roleCode: "SALES_REP", email: "rep1@example.com" } as never, "prospect-1");
  assert.deepEqual(output.candidates, legacyCandidates);
  assert.equal(output.candidates.length, 10);
  assert.equal(output.candidates.some((candidate) => candidate.productCode === "p13"), false);
  assert.deepEqual(stored, output);
  assert.deepEqual(Object.keys(output).sort(), ["candidates", "catalogFingerprint", "catalogFitConfidence", "catalogFitScore", "catalogFitVersion", "components", "computedAt", "confirmedNeedTags", "inputFingerprint", "reasons", "version"].sort());
  assert.deepEqual(output.confirmedNeedTags, NEED_TAXONOMY.filter((need) => need.businessTypes.includes("hotel")).map((need) => need.tag));
});
