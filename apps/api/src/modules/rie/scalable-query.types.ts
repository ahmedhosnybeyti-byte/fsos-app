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
export type RieAggregationOperator = "sum" | "count" | "countDistinct" | "sumProduct" | "avg" | "min" | "max";
/**
 * `sumProduct` keeps arithmetic at the database grain: it sums `field *
 * multiplier` after the query's scopes and joins have been applied.
 */
export interface RieQueryAggregation { op: RieAggregationOperator; field?: string; source?: string; multiplier?: RieQueryField; multiplierFallback?: RieQueryField; as: string; }
export interface RieDateScope extends RieQueryField { from?: string | number; to?: string | number; values?: readonly (string | number)[]; }
export interface RieValueScope extends Partial<RieQueryField> { values: readonly string[]; }
export interface RieScalableQueryScope {
  date?: RieDateScope | readonly RieDateScope[];
  route?: RieValueScope;
  rep?: RieValueScope;
  customer?: RieValueScope;
  product?: RieValueScope;
  /** Additive exact-match scopes for canonical fields not covered above. */
  fields?: readonly (RieValueScope & { field: string })[];
}
export interface RieQueryPagination { limit?: number; offset?: number; }
export interface RieQueryOrder { field?: RieQueryField; aggregate?: string; direction?: "asc" | "desc"; }

/** Read-only contract for PostgreSQL-backed high-cardinality canonical data. */
export interface RieScalableQuery extends EntityQueryContext {
  entityName: string;
  projection: readonly RieQueryProjection[];
  joins?: readonly RieQueryJoin[];
  /** RouteID location used for automatic hierarchy enforcement (base by default). */
  hierarchyRoute?: RieQueryField;
  groupBy?: readonly RieQueryField[];
  aggregates?: readonly RieQueryAggregation[];
  scope?: RieScalableQueryScope;
  pagination?: RieQueryPagination;
  orderBy?: readonly RieQueryOrder[];
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
