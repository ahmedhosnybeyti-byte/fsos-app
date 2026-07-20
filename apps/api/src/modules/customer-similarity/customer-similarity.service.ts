import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  type CustomerSimilarityRieQueryInput,
  type CustomerSimilarityResult,
  type CustomerSimilarityScopeField,
  type CustomerSimilarityValuesResult,
} from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RieFacade } from "../rie/rie-facade.service";
import type { EntityQueryResult } from "../rie/entity-provider.interface";
import { kMeansVectors, zScoreNormalize } from "./similarity-cluster.util";

// Migration #2 (ADR-001 / RIE Migration Plan, 2026-07-17) — this service no
// longer reads uploaded files or manually-mapped columns. Customers/
// Invoices/Invoice Items/Collections/Returns/Products are all resolved via
// RieFacade against the Canonical Schema. The clustering algorithm itself
// (feature vector -> z-score normalize -> k-means, in similarity-cluster.util.ts)
// is completely unchanged — only how the feature vectors get built changed.

type EntityRow = Record<string, unknown>;

// Same small helpers as every other map module — duplicated deliberately
// (see heatmap.service.ts's original comment on why: keeps each dashboard
// feature module self-contained and safe to touch in parallel sessions).
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isSaneCoordinate(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !(lat === 0 && lon === 0);
}

interface CustomerFeatures {
  totalValue: number;
  orderCount: number;
  distinctSkus: Set<string>;
}

@Injectable()
export class CustomerSimilarityService {
  constructor(private readonly rieFacade: RieFacade) {}

  private rieContext(user: AuthenticatedUser) {
    return { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
  }

  private assertAvailable(result: EntityQueryResult, arabicLabel: string): void {
    if (!result.available) {
      throw new NotFoundException(`بيانات "${arabicLabel}" غير متاحة — تأكد من رفع ملف يطابق قالب الاستيراد الرسمي لهذا الـ Dataset.`);
    }
  }

  // The exact per-row aggregation loop the legacy service ran over one
  // arbitrary mapped file's rows (see the old customer-similarity.service.ts
  // in git history) — unchanged algorithm, now parameterized so it can run
  // over whichever Canonical Entity rows the chosen similarityBasis resolves
  // to (Invoice Items / Collections / Returns) instead of one hand-picked file.
  private aggregateFeatures(
    rows: readonly EntityRow[],
    customerIds: ReadonlySet<string>,
    customerIdField: string,
    amountField: string,
    skuField?: string,
  ): Map<string, CustomerFeatures> {
    const features = new Map<string, CustomerFeatures>();
    for (const row of rows) {
      const id = String(row[customerIdField] ?? "").trim();
      if (!id || !customerIds.has(id)) continue;
      const amount = toFiniteNumber(row[amountField]) ?? 0;
      let f = features.get(id);
      if (!f) {
        f = { totalValue: 0, orderCount: 0, distinctSkus: new Set() };
        features.set(id, f);
      }
      f.totalValue += amount;
      f.orderCount += 1;
      if (skuField) {
        const sku = String(row[skuField] ?? "").trim();
        if (sku) f.distinctSkus.add(sku);
      }
    }
    return features;
  }

  async query(user: AuthenticatedUser, input: CustomerSimilarityRieQueryInput): Promise<CustomerSimilarityResult> {
    const ctx = this.rieContext(user);
    const customersResult = await this.rieFacade.getEntityRecords("Customers", ctx);
    this.assertAvailable(customersResult, "Customers");

    let customerRecords = customersResult.records;
    if (input.scopeField && input.scopeValues && input.scopeValues.length > 0) {
      const scopeSet = new Set(input.scopeValues);
      customerRecords = customerRecords.filter((row) => scopeSet.has(String(row[input.scopeField!] ?? "")));
      if (customerRecords.length === 0) {
        throw new BadRequestException(`لا توجد بيانات مطابقة لـ ${input.scopeField} ضمن [${input.scopeValues.join(", ")}]`);
      }
    }

    // Customer master: id -> {lat, lon, label}. Coordinates are still
    // required here even though clustering is behavioral, not geographic —
    // the result map plots every customer at their real location.
    const customerIndex = new Map<string, { lat: number; lon: number; label: string }>();
    for (const row of customerRecords) {
      const id = String(row.CustomerCode ?? "").trim();
      if (!id || customerIndex.has(id)) continue;
      const lat = toFiniteNumber(row.Latitude);
      const lon = toFiniteNumber(row.Longitude);
      if (lat === null || lon === null || !isSaneCoordinate(lat, lon)) continue;
      customerIndex.set(id, { lat, lon, label: String(row.CustomerName ?? id) });
    }
    const customerIdSet = new Set(customerIndex.keys());

    let featuresByCustomer: Map<string, CustomerFeatures>;
    let hasSkuDimension: boolean;

    if (input.similarityBasis === "collection") {
      const collectionsResult = await this.rieFacade.getEntityRecords("Collections", ctx);
      this.assertAvailable(collectionsResult, "Collections");
      featuresByCustomer = this.aggregateFeatures(collectionsResult.records, customerIdSet, "CustomerCode", "Amount");
      hasSkuDimension = false; // a collection is a payment, not a line item — same as the legacy design
    } else if (input.similarityBasis === "returns") {
      const returnsResult = await this.rieFacade.getEntityRecords("Returns", ctx);
      this.assertAvailable(returnsResult, "Returns");
      featuresByCustomer = this.aggregateFeatures(returnsResult.records, customerIdSet, "CustomerCode", "TotalAmount");
      // Return Items (SKU-level return lines) has no RIE data-source mapping
      // yet (see excel-entity-provider.mapping.ts) — the legacy
      // returnsFileSkuColumn option has no RIE equivalent yet. A real,
      // disclosed gap, not a silent omission: "returns" basis loses its SKU
      // dimension under RIE until Return Items is mapped.
      hasSkuDimension = false;
    } else {
      const [invoicesResult, itemsResult, productsResult] = await Promise.all([
        this.rieFacade.getEntityRecords("Invoices", ctx),
        this.rieFacade.getEntityRecords("Invoice Items", ctx),
        input.salesCategoryValue ? this.rieFacade.getEntityRecords("Products", ctx) : Promise.resolve(null),
      ]);
      this.assertAvailable(invoicesResult, "Invoices");
      this.assertAvailable(itemsResult, "Invoice Items");

      // Invoice Items has no CustomerCode of its own — joined through
      // Invoices.CustomerCode by InvoiceNo, same as Customer Comparison
      // (Migration #1) and the same relationship Navigation Engine models
      // as REL-CU-002/REL-IN-003.
      const invoiceCustomer = new Map<string, string>();
      for (const inv of invoicesResult.records) {
        const no = String(inv.InvoiceNo ?? "").trim();
        const cust = String(inv.CustomerCode ?? "").trim();
        if (no && cust) invoiceCustomer.set(no, cust);
      }

      let productCategory: Map<string, string> | null = null;
      if (input.salesCategoryValue && productsResult) {
        this.assertAvailable(productsResult, "Products");
        productCategory = new Map();
        for (const p of productsResult.records) {
          const code = String(p.ProductCode ?? "").trim();
          if (code) productCategory.set(code, String(p.Category ?? ""));
        }
      }

      const joinedRows: EntityRow[] = [];
      for (const item of itemsResult.records) {
        const invoiceNo = String(item.InvoiceNo ?? "").trim();
        const customerCode = invoiceCustomer.get(invoiceNo);
        if (!customerCode) continue; // item's invoice not found — dropped, same as Migration #1's join
        const productCode = String(item.ProductCode ?? "").trim();
        if (productCategory && productCategory.get(productCode) !== input.salesCategoryValue) continue;
        joinedRows.push({ CustomerCode: customerCode, ProductCode: productCode, LineTotal: item.LineTotal ?? null });
      }
      if (input.salesCategoryValue && joinedRows.length === 0) {
        throw new BadRequestException(`مفيش صفوف مطابقة للفئة "${input.salesCategoryValue}"`);
      }

      // Under RIE, every Invoice Items row structurally carries ProductCode
      // (Import Templates Specification v1.0 §6.10) — unlike the legacy
      // flow, the SKU dimension for "sales" is no longer optional/dependent
      // on the admin having mapped a SKU column.
      featuresByCustomer = this.aggregateFeatures(joinedRows, customerIdSet, "CustomerCode", "LineTotal", "ProductCode");
      hasSkuDimension = true;
    }

    const customerIds = Array.from(featuresByCustomer.keys());
    const excludedNoSalesData = customerIndex.size - customerIds.length;

    if (customerIds.length < input.clusterCount) {
      throw new BadRequestException(
        `${customerIds.length} عميل بس عندهم بيانات كفاية على أساس التشابه المختار — أقل من عدد المجموعات المطلوب (${input.clusterCount}). قلل عدد المجموعات أو وسّع النطاق.`,
      );
    }

    const rawVectors = customerIds.map((id) => {
      const f = featuresByCustomer.get(id)!;
      return hasSkuDimension ? [f.totalValue, f.orderCount, f.distinctSkus.size] : [f.totalValue, f.orderCount];
    });
    const normalized = zScoreNormalize(rawVectors);
    const labels = kMeansVectors(normalized, input.clusterCount);

    const afterTotals: number[] = new Array(input.clusterCount).fill(0);
    const afterCounts: number[] = new Array(input.clusterCount).fill(0);
    const profileSums = Array.from({ length: input.clusterCount }, () => ({ totalValue: 0, orderCount: 0, distinctSkus: 0 }));

    const records: CustomerSimilarityResult["records"] = customerIds.map((id, i) => {
      const cluster = labels[i]!;
      const c = customerIndex.get(id)!;
      const f = featuresByCustomer.get(id)!;
      afterTotals[cluster] = (afterTotals[cluster] ?? 0) + f.totalValue;
      afterCounts[cluster] = (afterCounts[cluster] ?? 0) + 1;
      profileSums[cluster]!.totalValue += f.totalValue;
      profileSums[cluster]!.orderCount += f.orderCount;
      profileSums[cluster]!.distinctSkus += f.distinctSkus.size;
      return { id, label: c.label, lat: c.lat, lon: c.lon, sales: f.totalValue, before: cluster, after: cluster };
    });

    const clusterProfiles = profileSums.map((sum, i) => {
      const count = afterCounts[i] || 1;
      return {
        avgTotalValue: sum.totalValue / count,
        avgOrderCount: sum.orderCount / count,
        avgDistinctSkus: hasSkuDimension ? sum.distinctSkus / count : null,
      };
    });

    return {
      clusterCount: input.clusterCount,
      excludedNoSalesData,
      totalScopedRows: customerIndex.size,
      usedRows: records.length,
      similarityBasis: input.similarityBasis,
      afterTotals,
      afterCounts,
      clusterProfiles,
      records,
    };
  }

  // RIE-backed replacements for this screen's old GET
  // /route-planning/distinct-values usage (scope-column and category-value
  // dropdowns). Route Planning/Heat Map keep using distinct-values
  // untouched — this is a dedicated, narrower endpoint scoped to this
  // screen only.
  async scopeValues(user: AuthenticatedUser, scopeField: CustomerSimilarityScopeField): Promise<CustomerSimilarityValuesResult> {
    const customersResult = await this.rieFacade.getEntityRecords("Customers", this.rieContext(user));
    this.assertAvailable(customersResult, "Customers");
    const values = new Set<string>();
    for (const row of customersResult.records) {
      const v = String(row[scopeField] ?? "").trim();
      if (v) values.add(v);
    }
    return { values: Array.from(values).sort((a, b) => a.localeCompare(b)) };
  }

  async categoryValues(user: AuthenticatedUser): Promise<CustomerSimilarityValuesResult> {
    const productsResult = await this.rieFacade.getEntityRecords("Products", this.rieContext(user));
    this.assertAvailable(productsResult, "Products");
    const values = new Set<string>();
    for (const row of productsResult.records) {
      const v = String(row.Category ?? "").trim();
      if (v) values.add(v);
    }
    return { values: Array.from(values).sort((a, b) => a.localeCompare(b)) };
  }
}
