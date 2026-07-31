import { Injectable } from "@nestjs/common";
import { RieFacade } from "../rie/rie-facade.service";
import type { EntityQueryContext, EntityRecord } from "../rie/entity-provider.interface";

export type LostOpportunityStatus = "available" | "no-customers" | "no-baseline-sales" | "no-lost-opportunities" | "data-unavailable";
export type LostOpportunity = {
  customerCode: string;
  customerName: string;
  productCode: string;
  productName: string;
  baselineNetQuantity: number;
  recentNetQuantity: number;
  suggestedQuantity: number;
};
export type LostOpportunityDiagnostics = {
  totalInvoiceRecordsRead: number;
  invoiceRecordsWithCustomerCode: number;
  invoiceRecordsWithProductCode: number;
  invoiceRecordsWithParseableDate: number;
  invoiceRecordsWithStatus: number;
  confirmedInvoiceRecords: number;
  invoiceRecordsMatchingCustomerScope: number;
  invoiceRecordsBeforeBaselineStart: number;
  invoiceRecordsInsideBaseline: number;
  invoiceRecordsInsideRecent: number;
  recordsUsingInvoiceDateField: number;
  recordsUsingDateField: number;
  recordsUsingStatusField: number;
  recordsUsingInvoiceStatusField: number;
  recordsUsingCustomerCodeField: number;
  recordsUsingProductCodeField: number;
  baselineInvoiceLinesCount: number;
  recentInvoiceLinesCount: number;
  baselineCustomerProductPairs: number;
  pairsWithBaselineNetQuantityAboveZero: number;
  pairsRemovedBecauseRecentQuantityAboveZero: number;
  pairsRemovedBecauseReturnsMadeNetQuantityNonPositive: number;
  finalLostOpportunitiesCount: number;
};
export type LostOpportunityResult = { opportunities: LostOpportunity[]; status: LostOpportunityStatus; diagnostics: LostOpportunityDiagnostics };
export type LostOpportunityRequest = EntityQueryContext & { selectedDate: string; customerCodes: readonly string[]; customerNames?: ReadonlyMap<string, string> };

const DAY_MS = 86_400_000;
const key = (value: unknown) => String(value ?? "").trim();
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);
const numberValue = (value: unknown) => typeof value === "number" ? (Number.isFinite(value) ? value : 0) : typeof value === "string" && value.trim() ? Number(value.replace(/,/g, "")) || 0 : 0;
const dateValue = (value: unknown) => value instanceof Date ? value.getTime() : typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : Number.NaN;
const within = (date: string, from: string, to: string) => date >= from && date <= to;
const hasField = (record: EntityRecord, field: string) => Object.prototype.hasOwnProperty.call(record, field);

@Injectable()
export class LostOpportunityService {
  constructor(private readonly rieFacade: RieFacade) {}

  async detect(input: LostOpportunityRequest): Promise<LostOpportunityResult> {
    const selectedDate = new Date(`${input.selectedDate}T00:00:00.000Z`);
    const emptyDiagnostics: LostOpportunityDiagnostics = { totalInvoiceRecordsRead: 0, invoiceRecordsWithCustomerCode: 0, invoiceRecordsWithProductCode: 0, invoiceRecordsWithParseableDate: 0, invoiceRecordsWithStatus: 0, confirmedInvoiceRecords: 0, invoiceRecordsMatchingCustomerScope: 0, invoiceRecordsBeforeBaselineStart: 0, invoiceRecordsInsideBaseline: 0, invoiceRecordsInsideRecent: 0, recordsUsingInvoiceDateField: 0, recordsUsingDateField: 0, recordsUsingStatusField: 0, recordsUsingInvoiceStatusField: 0, recordsUsingCustomerCodeField: 0, recordsUsingProductCodeField: 0, baselineInvoiceLinesCount: 0, recentInvoiceLinesCount: 0, baselineCustomerProductPairs: 0, pairsWithBaselineNetQuantityAboveZero: 0, pairsRemovedBecauseRecentQuantityAboveZero: 0, pairsRemovedBecauseReturnsMadeNetQuantityNonPositive: 0, finalLostOpportunitiesCount: 0 };
    if (Number.isNaN(selectedDate.getTime())) return { opportunities: [], status: "data-unavailable", diagnostics: emptyDiagnostics };
    const customerCodes = new Set(input.customerCodes.map(key).filter(Boolean));
    if (customerCodes.size === 0) return { opportunities: [], status: "no-customers", diagnostics: emptyDiagnostics };
    try {
      const [products, invoices, invoiceItems, returns, returnItems] = await Promise.all([
        this.rieFacade.getEntityRecords("Products", input), this.rieFacade.getEntityRecords("Invoices", input), this.rieFacade.getEntityRecords("Invoice Items", input), this.rieFacade.getEntityRecords("Returns", input), this.rieFacade.getEntityRecords("Return Items", input),
      ]);
      if (![products, invoices, invoiceItems, returns, returnItems].every((result) => result.available)) return { opportunities: [], status: "data-unavailable", diagnostics: emptyDiagnostics };
      const names = new Map<string, string>();
      for (const product of products.records) { const code = key(product.ProductCode); if (code) names.set(code, key(product.ProductName) || code); }
      const baselineFrom = isoDay(addDays(selectedDate, -119)); const baselineTo = isoDay(addDays(selectedDate, -30)); const recentFrom = isoDay(addDays(selectedDate, -29)); const recentTo = input.selectedDate;
      const invoiceDiagnostics = { ...emptyDiagnostics, totalInvoiceRecordsRead: invoices.records.length };
      const invoicesByNo = new Map<string, { customerCode: string; date: string }>();
      for (const invoice of invoices.records) {
        if (hasField(invoice, "InvoiceDate")) invoiceDiagnostics.recordsUsingInvoiceDateField++;
        if (hasField(invoice, "Date")) invoiceDiagnostics.recordsUsingDateField++;
        if (hasField(invoice, "Status")) invoiceDiagnostics.recordsUsingStatusField++;
        if (hasField(invoice, "InvoiceStatus")) invoiceDiagnostics.recordsUsingInvoiceStatusField++;
        if (hasField(invoice, "CustomerCode")) invoiceDiagnostics.recordsUsingCustomerCodeField++;
        if (hasField(invoice, "ProductCode")) invoiceDiagnostics.recordsUsingProductCodeField++;

        const invoiceNo = key(invoice.InvoiceNo);
        const customerCode = key(invoice.CustomerCode);
        const productCode = key(invoice.ProductCode);
        const status = key(invoice.InvoiceStatus);
        const ms = dateValue(invoice.InvoiceDate);
        if (customerCode) invoiceDiagnostics.invoiceRecordsWithCustomerCode++;
        if (productCode) invoiceDiagnostics.invoiceRecordsWithProductCode++;
        if (Number.isFinite(ms)) {
          invoiceDiagnostics.invoiceRecordsWithParseableDate++;
          const invoiceDate = isoDay(new Date(ms));
          if (invoiceDate < baselineFrom) invoiceDiagnostics.invoiceRecordsBeforeBaselineStart++;
          if (within(invoiceDate, baselineFrom, baselineTo)) invoiceDiagnostics.invoiceRecordsInsideBaseline++;
          if (within(invoiceDate, recentFrom, recentTo)) invoiceDiagnostics.invoiceRecordsInsideRecent++;
        }
        if (status) invoiceDiagnostics.invoiceRecordsWithStatus++;
        if (status.toLowerCase() === "confirmed") invoiceDiagnostics.confirmedInvoiceRecords++;
        if (customerCodes.has(customerCode)) invoiceDiagnostics.invoiceRecordsMatchingCustomerScope++;
        if (status.toLowerCase() === "confirmed" && invoiceNo && customerCodes.has(customerCode) && Number.isFinite(ms)) invoicesByNo.set(invoiceNo, { customerCode, date: isoDay(new Date(ms)) });
      }
      const returnsByNo = new Map<string, { customerCode: string; date: string }>();
      for (const returned of returns.records) { const returnNo = key(returned.ReturnNo); const customerCode = key(returned.CustomerCode); const ms = dateValue(returned.ReturnDate); if (key(returned.Status).toLowerCase() === "confirmed" && returnNo && customerCodes.has(customerCode) && Number.isFinite(ms)) returnsByNo.set(returnNo, { customerCode, date: isoDay(new Date(ms)) }); }
      const quantities = new Map<string, { customerCode: string; productCode: string; baseline: number; recent: number; baselineSales: number }>();
      let baselineInvoiceLinesCount = 0; let recentInvoiceLinesCount = 0;
      const add = (meta: { customerCode: string; date: string }, productCode: string, quantity: number, sale: boolean) => { const pairKey = `${meta.customerCode}\u0000${productCode}`; const pair = quantities.get(pairKey) ?? { customerCode: meta.customerCode, productCode, baseline: 0, recent: 0, baselineSales: 0 }; if (within(meta.date, baselineFrom, baselineTo)) { pair.baseline += quantity; if (sale) { pair.baselineSales += quantity; baselineInvoiceLinesCount++; } } if (within(meta.date, recentFrom, recentTo)) { pair.recent += quantity; if (sale) recentInvoiceLinesCount++; } quantities.set(pairKey, pair); };
      for (const item of invoiceItems.records) { const invoice = invoicesByNo.get(key(item.InvoiceNo)); const productCode = key(item.ProductCode); if (invoice && productCode) add(invoice, productCode, numberValue(item.Quantity), true); }
      for (const item of returnItems.records) { const returned = returnsByNo.get(key(item.ReturnNo)); const productCode = key(item.ProductCode); if (returned && productCode) add(returned, productCode, -numberValue(item.Quantity), false); }
      const pairs = [...quantities.values()]; const positive = pairs.filter((pair) => pair.baseline > 0); const opportunities = positive.filter((pair) => pair.recent === 0).map((pair) => ({ customerCode: pair.customerCode, customerName: input.customerNames?.get(pair.customerCode) ?? pair.customerCode, productCode: pair.productCode, productName: names.get(pair.productCode) ?? pair.productCode, baselineNetQuantity: pair.baseline, recentNetQuantity: pair.recent, suggestedQuantity: Math.round(pair.baseline / 3) })).sort((a, b) => a.customerName.localeCompare(b.customerName, "ar") || a.productName.localeCompare(b.productName, "ar"));
      const diagnostics: LostOpportunityDiagnostics = { ...invoiceDiagnostics, baselineInvoiceLinesCount, recentInvoiceLinesCount, baselineCustomerProductPairs: pairs.length, pairsWithBaselineNetQuantityAboveZero: positive.length, pairsRemovedBecauseRecentQuantityAboveZero: positive.filter((pair) => pair.recent > 0).length, pairsRemovedBecauseReturnsMadeNetQuantityNonPositive: pairs.filter((pair) => pair.baselineSales > 0 && pair.baseline <= 0).length, finalLostOpportunitiesCount: opportunities.length };
      return { opportunities, status: positive.length === 0 ? "no-baseline-sales" : opportunities.length === 0 ? "no-lost-opportunities" : "available", diagnostics };
    } catch { return { opportunities: [], status: "data-unavailable", diagnostics: emptyDiagnostics }; }
  }
}