import type { EntityQueryContext, EntityRecord } from "./entity-provider.interface";
import type { EntityQueryResult } from "./entity-provider.interface";

export interface RieQueryField { field: string; source?: string; }
export interface RieQueryProjection extends RieQueryField { as?: string; }
export interface RieQueryJoin {
  entityName: string;
  alias: string;
  type?: "inner" | "left";
  on: { left: RieQueryField; rightField: string };
}
export type RieAggregationOperator = "sum" | "count" | "countDistinct" | "arrayAggDistinct" | "sumProduct" | "avg" | "min" | "max" | "minText" | "maxText";
/**
 * `sumProduct` keeps arithmetic at the database grain: it sums `field *
 * multiplier` after the query's scopes and joins have been applied.
 */
export interface RieQueryAggregation { op: RieAggregationOperator; field?: string; source?: string; multiplier?: RieQueryField; multiplierFallback?: RieQueryField; /** Only include source rows whose numeric value is positive. */ filterPositiveField?: RieQueryField; as: string; }
export interface RieDateScope extends RieQueryField { from?: string | number; to?: string | number; values?: readonly (string | number)[]; }
export interface RieValueScope extends Partial<RieQueryField> { values: readonly string[]; }
/** Route stored on a fact line, falling back to its joined header when absent. */
export interface RieRouteFallbackScope { primary: RieQueryField; fallback: RieQueryField; values: readonly string[]; }
export interface RieScalableQueryScope {
  date?: RieDateScope | readonly RieDateScope[];
  route?: RieValueScope;
  routeFallback?: RieRouteFallbackScope;
  rep?: RieValueScope;
  customer?: RieValueScope;
  product?: RieValueScope;
  /** Additive exact-match scopes for canonical fields not covered above. */
  fields?: readonly (RieValueScope & { field: string })[];
}
export interface RieQueryPagination { limit?: number; offset?: number; }
export interface RieQueryOrder { field?: RieQueryField; aggregate?: string; direction?: "asc" | "desc"; }
/** Retain only rows at the latest text date/value within each partition. */
export interface RieLatestPerScope { partitionBy: RieQueryField; orderBy: RieQueryField; }

/** Read-only contract for PostgreSQL-backed high-cardinality canonical data. */
export interface RieScalableQuery extends EntityQueryContext {
  entityName: string;
  projection: readonly RieQueryProjection[];
  joins?: readonly RieQueryJoin[];
  /** RouteID location used for automatic hierarchy enforcement (base by default). */
  hierarchyRoute?: RieQueryField;
  groupBy?: readonly RieQueryField[];
  aggregates?: readonly RieQueryAggregation[];
  /** Applied after company, active-version and hierarchy scopes, before aggregation. */
  latestPer?: RieLatestPerScope;
  scope?: RieScalableQueryScope;
  pagination?: RieQueryPagination;
  /**
   * Reserved for internal, PostgreSQL-aggregated analytical refreshes whose
   * result is still bounded but can exceed the generic screen page limit.
   * Never enables raw entity reads or pagination accumulation.
   */
  internalAggregate?: boolean;
  orderBy?: readonly RieQueryOrder[];
  /**
   * Compiles scoped joins as an uncorrelated membership test.  This preserves
   * the normalised-equality semantics while allowing PostgreSQL to hash the
   * scoped key set once instead of rescanning a materialized CTE per fact row.
   */
  preferHashedScopedSemiJoin?: boolean;
  /**
   * Materialize eligible rows from scoped inner joins directly inside the base
   * CTE before the high-cardinality base fact can be read.  The final join is
   * retained when it supplies projected or aggregated fields.
   */
  driveBaseFromScopedJoins?: boolean;
}
export interface RieScalableQueryResult {
  records: readonly EntityRecord[];
  page: { limit: number; offset: number; hasMore: boolean };
}

/** Product-grain management stale rollup; Route × Product remains SQL-only. */
export interface RieRouteProductStalenessQuery extends EntityQueryContext {
  /** null/undefined means the caller's full hierarchy scope; [] means no routes. */
  routeIds?: readonly string[] | null;
  targetDate: string;
  staleDaysThreshold: number;
}
export interface RieRouteProductStalenessRow {
  productCode: string;
  quantity: number;
  lastSaleDate: string | null;
  isStale: boolean;
  /** Total stale Route × Product states in the management scope. */
  staleRouteProductCount: number;
  /** Stale Route × Product states packed by PostgreSQL for the management popup. */
  staleRouteProducts: RieStaleRouteProduct[];
}
export interface RieStaleRouteProduct {
  routeId: string;
  currentVehicleStock: number;
  lastSaleDate: string | null;
}

/** Management stock alignment is evaluated at Route × Product in PostgreSQL. */
export interface RieManagementStockAlignmentQuery extends EntityQueryContext {
  /** null/undefined means the caller's full hierarchy scope; [] means no routes. */
  routeIds?: readonly string[] | null;
  targetDate: string;
  salesFrom: string;
  salesTo: string;
  customerCodes: readonly string[];
}
export interface RieManagementStockAlignmentRow {
  alignmentPercent: number;
  categoryAlignments: RieManagementCategoryStockAlignment[];
}
export interface RieManagementCategoryStockAlignment {
  category: string | null;
  alignmentPercent: number;
}

/** Product-grain management monitor rows; Route × Product stays in PostgreSQL. */
export interface RieManagementVehicleProductsQuery extends EntityQueryContext {
  routeIds?: readonly string[] | null;
  targetDate: string;
  salesFrom: string;
  salesTo: string;
  customerCodes: readonly string[];
}
export interface RieManagementVehicleProductRow {
  productCode: string;
  currentVehicleStock: number;
  weeklyAverageSales: number;
  alignmentPercent: number;
}

/** One compact Person → Route → Product document; all fact aggregation is SQL-only. */
export interface RieManagementLoadingRiskQuery extends EntityQueryContext {
  targetDate: string;
  salesFrom: string;
  salesTo: string;
  personLevel: "manager" | "supervisor" | "sales_rep";
}
export interface RieManagementLoadingRiskRow {
  people: { employeeId: string; employeeName: string; affectedRouteCount: number; affectedProductCount: number; routes: { routeId: string; products: { productCode: string; productName: string; expectedDemand: number; currentVehicleStock: number; quantityGap: number }[] }[] }[];
  /** Internal, temporary scope diagnostics. This is logged by the service and is never exposed by the API contract. */
  debug?: { directReportsCount: number; routeCount: number; loadingRiskRowsBeforeAggregation: number };
}

/** Management view of the existing Smart Loading lost-opportunity definition. */
export interface RieManagementLostOpportunitiesQuery extends EntityQueryContext {
  targetDate: string;
  baselineFrom: string;
  baselineTo: string;
  recentFrom: string;
  recentTo: string;
  /** The existing Smart Loading aliases for the target date's VisitDay. */
  visitDays: readonly string[];
  personLevel: "manager" | "supervisor" | "sales_rep";
  /** Already authorization-checked hierarchy selection, resolved to Routes before facts. */
  routeIds?: readonly string[] | null;
  pagination?: RieQueryPagination;
}
export interface RieManagementLostOpportunityRow {
  responsibleEmployeeId: string;
  responsibleEmployeeName: string;
  routeId: string;
  productCode: string;
  productName: string;
  category: string | null;
  opportunityQuantity: number;
  currentVanStock: number;
  gap: number;
}
export interface RieManagementLostOpportunitiesResult {
  affectedPersonCount: number;
  affectedRouteCount: number;
  lostOpportunityCount: number;
  topPeople: { responsibleEmployeeId: string; responsibleEmployeeName: string; lostOpportunityCount: number; gap: number }[];
  page: { limit: number; offset: number; hasMore: boolean };
  rows: RieManagementLostOpportunityRow[];
}

/** Product-grain stale-purchase evidence; Product × Customer stays inside SQL. */
export interface RieStalePurchasesQuery extends EntityQueryContext {
  /** Routes holding active vehicle inventory for the current session. */
  routeIds: readonly string[];
  productCodes: readonly string[];
  targetDate: string;
}
export interface RieStalePurchaseCustomer {
  customerCode: string;
  customerName: string;
  totalQuantity: number;
  purchaseFrequency: number;
  lastPurchaseDate: string | null;
}
export interface RieStalePurchaseRow {
  productCode: string;
  customers: RieStalePurchaseCustomer[];
}

/** Compatibility result for callers that still need a bounded row collection. */
export interface RieScalableEntityRead extends EntityQueryContext {
  entityName: string;
  projection: readonly RieQueryProjection[];
  scope?: RieScalableQueryScope;
  joins?: readonly RieQueryJoin[];
  hierarchyRoute?: RieQueryField;
  applyHierarchy?: boolean;
}
export type RieScalableEntityResult = EntityQueryResult;
