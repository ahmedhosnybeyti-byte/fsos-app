import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  type CustomerSimilarityRieQueryInput,
  type CustomerSimilarityResult,
  type CustomerSimilarityScopeField,
  type CustomerSimilarityValuesResult,
} from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RieFacade } from "../rie/rie-facade.service";
import { kMeansVectors, zScoreNormalize } from "./similarity-cluster.util";

// Migration #2 (ADR-001 / RIE Migration Plan, 2026-07-17) — this service no
// longer reads uploaded files or manually-mapped columns. Customers/
// Invoices/Invoice Items/Collections/Returns/Products are all resolved via
// RieFacade against the Canonical Schema. The clustering algorithm itself
// (feature vector -> z-score normalize -> k-means, in similarity-cluster.util.ts)
// is completely unchanged — only how the feature vectors get built changed.

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
  distinctSkus: number;
}

@Injectable()
export class CustomerSimilarityService {
  constructor(private readonly rieFacade: RieFacade) {}

  private rieContext(user: AuthenticatedUser) {
    return { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
  }

  private async assertSources(ctx: ReturnType<CustomerSimilarityService["rieContext"]>, entityNames: readonly string[], arabicLabel: string): Promise<void> {
    if (!await this.rieFacade.hasCanonicalEntitySources(ctx, entityNames)) {
      throw new NotFoundException(`بيانات "${arabicLabel}" غير متاحة — تأكد من رفع ملف يطابق قالب الاستيراد الرسمي لهذا الـ Dataset.`);
    }
  }

  async query(user: AuthenticatedUser, input: CustomerSimilarityRieQueryInput): Promise<CustomerSimilarityResult> {
    const ctx = this.rieContext(user);
    await this.assertSources(ctx, ["Customers"], "Customers");
    const dimensionScope = input.scopeField && input.scopeValues?.length
      ? { fields: [{ field: input.scopeField, values: input.scopeValues }] }
      : undefined;
    const factCustomerScope = input.scopeField && input.scopeValues?.length
      ? { fields: [{ field: input.scopeField, source: "customer", values: input.scopeValues }] }
      : undefined;

    // This is a projected customer result, not a full entity read. Fact data
    // never leaves PostgreSQL: it is joined and grouped in the feature query
    // below.  The explicit cap matches the map/clustering safety limit.
    const customerResult = await this.rieFacade.queryCanonicalRecords({
      ...ctx,
      entityName: "Customers",
      projection: [
        { field: "CustomerCode" }, { field: "CustomerName" }, { field: "Latitude" }, { field: "Longitude" },
      ],
      scope: dimensionScope,
      unboundedFinalResult: true,
    });
    if (customerResult.records.length === 0 && input.scopeField && input.scopeValues?.length) {
      throw new BadRequestException(`لا توجد بيانات مطابقة لـ ${input.scopeField} ضمن [${input.scopeValues.join(", ")}]`);
    }

    // Customer master: id -> {lat, lon, label}. Coordinates are still
    // required here even though clustering is behavioral, not geographic —
    // the result map plots every customer at their real location.
    const customerIndex = new Map<string, { lat: number; lon: number; label: string }>();
    for (const row of customerResult.records) {
      const id = String(row.CustomerCode ?? "").trim();
      if (!id || customerIndex.has(id)) continue;
      const lat = toFiniteNumber(row.Latitude);
      const lon = toFiniteNumber(row.Longitude);
      if (lat === null || lon === null || !isSaneCoordinate(lat, lon)) continue;
      customerIndex.set(id, { lat, lon, label: String(row.CustomerName ?? id) });
    }
    let featureRows: readonly Record<string, unknown>[];
    let hasSkuDimension: boolean;

    if (input.similarityBasis === "collection") {
      await this.assertSources(ctx, ["Collections"], "Collections");
      const featureResult = await this.rieFacade.queryCanonicalRecords({
        ...ctx, entityName: "Collections",
        projection: [{ field: "CustomerCode", as: "customerCode" }],
        groupBy: [{ field: "CustomerCode" }],
        joins: input.scopeField && input.scopeValues?.length
          ? [{ entityName: "Customers", alias: "customer", on: { left: { field: "CustomerCode" }, rightField: "CustomerCode" } }]
          : [],
        hierarchyRoute: { field: "RouteID" }, scope: factCustomerScope,
        aggregates: [{ op: "sum", field: "Amount", as: "totalValue" }, { op: "count", as: "orderCount" }],
        unboundedFinalResult: true,
      });
      featureRows = featureResult.records;
      hasSkuDimension = false; // a collection is a payment, not a line item — same as the legacy design
    } else if (input.similarityBasis === "returns") {
      await this.assertSources(ctx, ["Returns"], "Returns");
      const featureResult = await this.rieFacade.queryCanonicalRecords({
        ...ctx, entityName: "Returns",
        projection: [{ field: "CustomerCode", as: "customerCode" }],
        groupBy: [{ field: "CustomerCode" }],
        joins: input.scopeField && input.scopeValues?.length
          ? [{ entityName: "Customers", alias: "customer", on: { left: { field: "CustomerCode" }, rightField: "CustomerCode" } }]
          : [],
        hierarchyRoute: { field: "RouteID" }, scope: factCustomerScope,
        aggregates: [{ op: "sum", field: "TotalAmount", as: "totalValue" }, { op: "count", as: "orderCount" }],
        unboundedFinalResult: true,
      });
      featureRows = featureResult.records;
      // Return Items (SKU-level return lines) has no RIE data-source mapping
      // yet (see excel-entity-provider.mapping.ts) — the legacy
      // returnsFileSkuColumn option has no RIE equivalent yet. A real,
      // disclosed gap, not a silent omission: "returns" basis loses its SKU
      // dimension under RIE until Return Items is mapped.
      hasSkuDimension = false;
    } else {
      await this.assertSources(ctx, input.salesCategoryValue ? ["Invoices", "Invoice Items", "Products"] : ["Invoices", "Invoice Items"], "Invoices / Invoice Items");
      const salesScope = {
        ...(factCustomerScope ?? {}),
        ...(input.salesCategoryValue ? { fields: [...(factCustomerScope?.fields ?? []), { field: "Category", source: "product", values: [input.salesCategoryValue] }] } : {}),
      };
      const featureResult = await this.rieFacade.queryCanonicalRecords({
        ...ctx, entityName: "Invoice Items",
        projection: [{ field: "CustomerCode", source: "invoice", as: "customerCode" }],
        groupBy: [{ field: "CustomerCode", source: "invoice" }],
        joins: [
          { entityName: "Invoices", alias: "invoice", on: { left: { field: "InvoiceNo" }, rightField: "InvoiceNo" } },
          ...(input.scopeField && input.scopeValues?.length
            ? [{ entityName: "Customers", alias: "customer", on: { left: { field: "CustomerCode", source: "invoice" }, rightField: "CustomerCode" } }]
            : []),
          ...(input.salesCategoryValue ? [{ entityName: "Products", alias: "product", on: { left: { field: "ProductCode" }, rightField: "ProductCode" } }] : []),
        ],
        hierarchyRoute: { field: "RouteID", source: "invoice" }, scope: salesScope,
        aggregates: [
          { op: "sum", field: "LineTotal", as: "totalValue" }, { op: "count", as: "orderCount" },
          { op: "countDistinct", field: "ProductCode", as: "distinctSkus" },
        ], unboundedFinalResult: true,
      });
      featureRows = featureResult.records;
      if (input.salesCategoryValue && featureRows.length === 0) {
        throw new BadRequestException(`مفيش صفوف مطابقة للفئة "${input.salesCategoryValue}"`);
      }
      hasSkuDimension = true;
    }

    // The RIE query returns one compact feature row per customer.  Joining it
    // to the already bounded customer dimension preserves the old behavior:
    // facts for a customer without valid map coordinates are excluded.
    const featuresByCustomer = new Map<string, CustomerFeatures>();
    for (const row of featureRows) {
      const id = String(row.customerCode ?? "").trim();
      if (!customerIndex.has(id)) continue;
      featuresByCustomer.set(id, {
        totalValue: toFiniteNumber(row.totalValue) ?? 0,
        orderCount: toFiniteNumber(row.orderCount) ?? 0,
        distinctSkus: hasSkuDimension ? toFiniteNumber(row.distinctSkus) ?? 0 : 0,
      });
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
      return hasSkuDimension ? [f.totalValue, f.orderCount, f.distinctSkus] : [f.totalValue, f.orderCount];
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
      profileSums[cluster]!.distinctSkus += f.distinctSkus;
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
    const ctx = this.rieContext(user);
    await this.assertSources(ctx, ["Customers"], "Customers");
    const customersResult = await this.rieFacade.queryCanonicalRecords({
      ...ctx,
      entityName: "Customers",
      projection: [{ field: scopeField }],
      groupBy: [{ field: scopeField }],
      pagination: { limit: 300 },
    });
    const values = new Set<string>();
    for (const row of customersResult.records) {
      const v = String(row[scopeField] ?? "").trim();
      if (v) values.add(v);
    }
    return { values: Array.from(values).sort((a, b) => a.localeCompare(b)) };
  }

  async categoryValues(user: AuthenticatedUser): Promise<CustomerSimilarityValuesResult> {
    const ctx = this.rieContext(user);
    await this.assertSources(ctx, ["Products"], "Products");
    const productsResult = await this.rieFacade.queryCanonicalRecords({
      ...ctx,
      entityName: "Products",
      projection: [{ field: "Category" }],
      groupBy: [{ field: "Category" }],
      pagination: { limit: 300 },
    });
    const values = new Set<string>();
    for (const row of productsResult.records) {
      const v = String(row.Category ?? "").trim();
      if (v) values.add(v);
    }
    return { values: Array.from(values).sort((a, b) => a.localeCompare(b)) };
  }
}
