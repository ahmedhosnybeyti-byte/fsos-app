import { strict as assert } from "node:assert";
import test from "node:test";
import type { Prisma } from "@field-sales-os/database";
import { RieScalableQueryService } from "../rie/scalable-query.service";
import type { RieVisitCopilotBriefingEntity } from "../rie/scalable-query.types";

interface TestPostgres {
  exec(sql: string): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
}
type Row = Record<string, unknown>;

const day = (value: unknown): string | null => {
  if (typeof value === "number" && value > 20000 && value < 80000) return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000).toISOString().slice(0, 10);
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};
const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() ? Number(value.replace(/,/g, "")) || 0 : 0;
const key = (value: unknown) => String(value ?? "").trim();

function legacyFacts(input: { customers: Row[]; invoices: Row[]; items: Row[]; returns: Row[]; collections: Row[]; products: Row[]; van: Row[] }) {
  const code = "C-1", from = "2026-01-01", to = "2026-02-28", previous30From = "2025-12-31", previous30To = "2026-01-29", recent30From = "2026-01-30";
  const customer = input.customers.find((row) => key(row.CustomerCode) === code)!;
  const channel = key(customer.Channel);
  const peerCodes = new Set(input.customers.flatMap((row) => {
    const customerCode = key(row.CustomerCode);
    return customerCode && customerCode !== code && (!channel || key(row.Channel).toLowerCase() === channel.toLowerCase()) ? [customerCode] : [];
  }));
  const invoiceMeta = new Map<string, { customerCode: string; dateIso: string }>();
  const trendMeta = new Map<string, { customerCode: string; dateIso: string }>();
  const counts = new Map<string, number>();
  for (const invoice of input.invoices) {
    const invoiceNo = key(invoice.InvoiceNo), customerCode = key(invoice.CustomerCode), dateIso = day(invoice.InvoiceDate);
    if (!invoiceNo || !customerCode || !dateIso) continue;
    if (dateIso >= from && dateIso <= to) {
      invoiceMeta.set(invoiceNo, { customerCode, dateIso });
      counts.set(customerCode, (counts.get(customerCode) ?? 0) + 1);
    }
    if (customerCode === code && dateIso >= previous30From && dateIso <= to) trendMeta.set(invoiceNo, { customerCode, dateIso });
  }
  const customerSales = new Map<string, number>();
  const targetProducts = new Map<string, { quantity: number; value: number; lastPurchaseDate: string | null }>();
  const peerProducts = new Map<string, number>();
  let recent = 0, previous = 0;
  for (const item of input.items) {
    const invoiceNo = key(item.InvoiceNo), productCode = key(item.ProductCode), value = num(item.LineTotal);
    const trend = trendMeta.get(invoiceNo);
    if (trend) {
      if (trend.dateIso >= recent30From) recent += value;
      else if (trend.dateIso >= previous30From && trend.dateIso <= previous30To) previous += value;
    }
    const invoice = invoiceMeta.get(invoiceNo);
    if (!invoice) continue;
    customerSales.set(invoice.customerCode, (customerSales.get(invoice.customerCode) ?? 0) + value);
    if (invoice.customerCode === code && productCode) {
      const product = targetProducts.get(productCode) ?? { quantity: 0, value: 0, lastPurchaseDate: null };
      product.quantity += num(item.Quantity); product.value += value;
      if (!product.lastPurchaseDate || invoice.dateIso > product.lastPurchaseDate) product.lastPurchaseDate = invoice.dateIso;
      targetProducts.set(productCode, product);
    } else if (peerCodes.has(invoice.customerCode) && productCode) peerProducts.set(productCode, (peerProducts.get(productCode) ?? 0) + value);
  }
  const names = new Map<string, { name: string; category: string | null }>();
  for (const product of input.products) {
    const productCode = key(product.ProductCode);
    if (productCode) names.set(productCode, { name: String(product.ProductName ?? productCode), category: key(product.Category) || null });
  }
  let returnsTotal = 0, returnCount = 0;
  for (const returned of input.returns) {
    const dateIso = day(returned.ReturnDate);
    if (key(returned.CustomerCode).toLowerCase() === code.toLowerCase() && dateIso && dateIso >= from && dateIso <= to) { returnsTotal += num(returned.TotalAmount); returnCount++; }
  }
  let collected = 0, collectionCount = 0, pending = 0, bounced = 0, overdue = 0, oldestPendingDueDate: string | null = null;
  for (const collection of input.collections) {
    if (key(collection.CustomerCode).toLowerCase() !== code.toLowerCase()) continue;
    const status = key(collection.Status).toLowerCase(), amount = num(collection.Amount);
    if (status === "collected" || status === "cleared") {
      const dateIso = day(collection.CollectionDate);
      if (dateIso && dateIso >= from && dateIso <= to) { collected += amount; collectionCount++; }
    } else if (status === "pending") {
      pending += amount;
      const due = day(collection.DueDate);
      if (due) { if (!oldestPendingDueDate || due < oldestPendingDueDate) oldestPendingDueDate = due; if (due < "2026-03-01") overdue += amount; }
    } else if (status === "bounced") bounced += amount;
  }
  let latest: string | null = null;
  for (const row of input.van) { const dateIso = day(row.ReportDate); if (dateIso && (!latest || dateIso > latest)) latest = dateIso; }
  const vanCodes = new Set<string>();
  for (const row of input.van) if (day(row.ReportDate) === latest && key(row.ProductCode) && num(row.Quantity) > 0) vanCodes.add(key(row.ProductCode));
  const visible = new Set(input.customers.map((row) => key(row.CustomerCode)).filter(Boolean));
  return {
    customer: { customerCode: code, customerName: String(customer.CustomerName ?? code), channel }, visibleCustomerCount: visible.size,
    salesTotal: customerSales.get(code) ?? 0, invoiceCount: counts.get(code) ?? 0, recent30Sales: recent, previous30Sales: previous,
    customerSales: [...customerSales].filter(([customerCode]) => visible.has(customerCode)).map(([customerCode, sales]) => ({ customerCode, sales, invoiceCount: counts.get(customerCode) ?? 0 })),
    customerProducts: [...targetProducts].map(([productCode, product]) => ({ productCode, productName: names.get(productCode)?.name ?? productCode, category: names.get(productCode)?.category ?? null, ...product })),
    peerProducts: [...peerProducts].map(([productCode, value]) => ({ productCode, productName: names.get(productCode)?.name ?? productCode, value })),
    returns: { total: returnsTotal, count: returnCount },
    collections: { collected, count: collectionCount, pending, bounced, overdue, oldestPendingDueDate },
    vanInventoryRowCount: input.van.length, vanProductCodes: [...vanCodes],
  };
}

test("Visit Copilot Customer Briefing SQL has full legacy fact parity and returns compact facts only", {
  skip: process.env.RIE_TEST_PGLITE_MODULE ? false : "Set RIE_TEST_PGLITE_MODULE to run PostgreSQL parity tests",
}, async (t) => {
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!) as { PGlite: new () => TestPostgres };
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE TABLE rie_canonical_entity_rows (id text PRIMARY KEY, company_id text NOT NULL, source_file_id text, entity_name text NOT NULL, entity_key text NOT NULL, precedence integer NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()); CREATE INDEX ON rie_canonical_entity_rows(company_id, entity_name);`);
  let sequence = 0;
  const insert = async (company: string, entity: string, data: Row) => {
    sequence += 1;
    await db.query("INSERT INTO rie_canonical_entity_rows (id, company_id, entity_name, entity_key, precedence, data, created_at) VALUES ($1,$2,$3,$1,1,$4::jsonb,$5)", [`row-${sequence.toString().padStart(3, "0")}`, company, entity, JSON.stringify(data), `2026-01-01T00:${sequence.toString().padStart(2, "0")}:00Z`]);
  };
  await insert("briefing-company", "Customers", { CustomerCode: " C-1 ", CustomerName: "Target First", Channel: "Retail", RouteID: "R-1" });
  await insert("briefing-company", "Customers", { CustomerCode: "C-1", CustomerName: "Target Duplicate", Channel: "Other", RouteID: "R-1" });
  await insert("briefing-company", "Customers", { CustomerCode: "C-2", CustomerName: "Peer", Channel: "retail", RouteID: "R-1" });
  await insert("briefing-company", "Customers", { CustomerCode: "C-3", CustomerName: "Non Peer", Channel: "Wholesale", RouteID: "R-1" });
  await insert("briefing-company", "Customers", { CustomerCode: "C-X", CustomerName: "Outside", Channel: "Retail", RouteID: "R-2" });
  await insert("briefing-company", "Invoices", { InvoiceNo: "I-PREV", CustomerCode: "C-1", InvoiceDate: "2026-01-10", RouteID: "R-1" });
  await insert("briefing-company", "Invoices", { InvoiceNo: "I-RECENT", CustomerCode: "C-1", InvoiceDate: "2026-02-10T23:00:00+03:00", RouteID: "R-1" });
  await insert("briefing-company", "Invoices", { InvoiceNo: "I-PEER", CustomerCode: "C-2", InvoiceDate: "2026-02-05", RouteID: "R-1" });
  await insert("briefing-company", "Invoices", { InvoiceNo: "I-DUP", CustomerCode: "C-2", InvoiceDate: "2026-01-20", RouteID: "R-1" });
  await insert("briefing-company", "Invoices", { InvoiceNo: "I-DUP", CustomerCode: "C-1", InvoiceDate: "2026-02-15", RouteID: "R-1" });
  await insert("briefing-company", "Invoices", { InvoiceNo: "I-BLANK", CustomerCode: "", InvoiceDate: "2026-02-01", RouteID: "R-1" });
  await insert("briefing-company", "Invoices", { InvoiceNo: "I-X", CustomerCode: "C-X", InvoiceDate: "2026-02-01", RouteID: "R-2" });
  await insert("briefing-company", "Invoice Items", { InvoiceNo: "I-PREV", ProductCode: "P-1", Quantity: "2", LineTotal: "100", RouteID: "R-1" });
  await insert("briefing-company", "Invoice Items", { InvoiceNo: "I-RECENT", ProductCode: "P-1", Quantity: "1", LineTotal: "4e1", RouteID: "R-1" });
  await insert("briefing-company", "Invoice Items", { InvoiceNo: "I-PEER", ProductCode: "P-2", Quantity: "3", LineTotal: "70", RouteID: "R-1" });
  await insert("briefing-company", "Invoice Items", { InvoiceNo: "I-DUP", ProductCode: "P-2", Quantity: "1,000", LineTotal: "30", RouteID: "R-1" });
  await insert("briefing-company", "Invoice Items", { InvoiceNo: "I-X", ProductCode: "P-X", Quantity: 9, LineTotal: 999, RouteID: "R-2" });
  await insert("briefing-company", "Products", { ProductCode: "P-1", ProductName: "Old Name", Category: "Old" });
  await insert("briefing-company", "Products", { ProductCode: "P-1", ProductName: "Final Name", Category: " Core " });
  await insert("briefing-company", "Products", { ProductCode: "P-2", ProductName: "Peer Product", Category: null });
  await insert("briefing-company", "Returns", { CustomerCode: "c-1", ReturnDate: "2026-02-01", TotalAmount: "10", RouteID: "R-1" });
  await insert("briefing-company", "Returns", { CustomerCode: "C-1", ReturnDate: "2025-12-31", TotalAmount: 99, RouteID: "R-1" });
  await insert("briefing-company", "Returns", { CustomerCode: "C-X", ReturnDate: "2026-02-01", TotalAmount: 999, RouteID: "R-2" });
  await insert("briefing-company", "Collections", { CustomerCode: "C-1", Status: "Collected", CollectionDate: "2026-02-01", Amount: "20", RouteID: "R-1" });
  await insert("briefing-company", "Collections", { CustomerCode: "c-1", Status: " Cleared ", CollectionDate: "2026-01-15", Amount: "1,000", RouteID: "R-1" });
  await insert("briefing-company", "Collections", { CustomerCode: "C-1", Status: "Pending", DueDate: "2025-12-01", Amount: "50", RouteID: "R-1" });
  await insert("briefing-company", "Collections", { CustomerCode: "C-1", Status: "Pending", DueDate: "2026-04-01", Amount: "25", RouteID: "R-1" });
  await insert("briefing-company", "Collections", { CustomerCode: "C-1", Status: "Bounced", CollectionDate: "2020-01-01", Amount: "30", RouteID: "R-1" });
  await insert("briefing-company", "Van Inventory", { ReportDate: "2026-01-01", ProductCode: "P-1", Quantity: 10, RouteID: "R-1" });
  await insert("briefing-company", "Van Inventory", { ReportDate: "2026-02-20", ProductCode: "P-2", Quantity: 1, RouteID: "R-1" });
  await insert("briefing-company", "Van Inventory", { ReportDate: "2026-02-20", ProductCode: "P-3", Quantity: 0, RouteID: "R-1" });
  for (const entity of ["Customers", "Invoices", "Invoice Items", "Returns", "Collections", "Products", "Van Inventory"]) await insert("other-company", entity, { CustomerCode: "OTHER", InvoiceNo: "OTHER", ProductCode: "OTHER", RouteID: "R-1", InvoiceDate: "2026-02-01", ReturnDate: "2026-02-01", Status: "Pending", Amount: 999, Quantity: 999, LineTotal: 999, ReportDate: "2026-02-20" });

  const ordered = async (entity: string, routeScoped: boolean) => (await db.query(`SELECT data FROM rie_canonical_entity_rows WHERE company_id='briefing-company' AND entity_name=$1 AND ($2::boolean=false OR LOWER(BTRIM(COALESCE(data->>'RouteID','')))='r-1') ORDER BY precedence,created_at,id`, [entity, routeScoped])).rows.map((row) => row.data as Row);
  const legacy = legacyFacts({
    customers: await ordered("Customers", true), invoices: await ordered("Invoices", true), items: await ordered("Invoice Items", true),
    returns: await ordered("Returns", true), collections: await ordered("Collections", true), products: await ordered("Products", false), van: await ordered("Van Inventory", true),
  });
  let lastQuery: Prisma.Sql | undefined, queryCount = 0;
  const service = new RieScalableQueryService({ $queryRaw: async (sql: Prisma.Sql) => { lastQuery = sql; queryCount++; return (await db.query(sql.text, sql.values)).rows; } } as never, { resolveAllowedRouteIds: async () => new Set(["r-1"]) } as never);
  const entities: RieVisitCopilotBriefingEntity[] = ["Customers", "Invoices", "Invoice Items", "Returns", "Collections", "Products", "Van Inventory"];
  const availability = Object.fromEntries(entities.map((entity) => [entity, true])) as Record<RieVisitCopilotBriefingEntity, boolean>;
  const actual = await service.queryVisitCopilotCustomerBriefingFacts({ companyId: "briefing-company", requestingUser: { roleCode: "SALES_REP", email: "rep@example.test" }, customerCode: "C-1", from: "2026-01-01", to: "2026-02-28", previous30From: "2025-12-31", previous30To: "2026-01-29", recent30From: "2026-01-30", today: "2026-03-01", includeVanStock: true }, availability);
  assert.deepEqual({ ...actual, availability: undefined }, { ...legacy, availability: undefined });
  assert.equal(queryCount, 1);
  assert.doesNotMatch(lastQuery!.text, /rie_dataset_versions|rie_entity_rows|customer_source\.\*|invoice_source\.\*|item_source\.\*|return_source\.\*|collection_source\.\*|product_source\.\*|van_source\.\*/);
  assert.match(lastQuery!.text, /customer_sales AS MATERIALIZED|target_products AS MATERIALIZED|collection_totals AS MATERIALIZED|van_products AS MATERIALIZED/);
  assert.ok(actual.customerSales.length < 7 && actual.customerProducts.length < 5 && actual.peerProducts.length < 5);
});
