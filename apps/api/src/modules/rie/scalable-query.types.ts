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
