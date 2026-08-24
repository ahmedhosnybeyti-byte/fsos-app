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
  /** Retain only positive base rows before joining and aggregation. */
  rowFilterPositiveField?: RieQueryField;
  /** Applied after company, active-version and hierarchy scopes, before aggregation. */
  latestPer?: RieLatestPerScope;
  scope?: RieScalableQueryScope;
  pagination?: RieQueryPagination;
  orderBy?: readonly RieQueryOrder[];
  /**
   * Compiles scoped joins as an uncorrelated membership test.  This preserves
   * the normalised-equality semantics while allowing PostgreSQL to hash the
   * scoped key set once instead of rescanning a materialized CTE per fact row.
   */
  preferHashedScopedSemiJoin?: boolean;
}
export interface RieScalableQueryResult {
  records: readonly EntityRecord[];
  page: { limit: number; offset: number; hasMore: boolean };
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
