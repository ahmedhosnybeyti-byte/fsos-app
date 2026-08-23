import type { EntityQueryContext, EntityRecord } from "./entity-provider.interface";

export interface RieQueryField { field: string; source?: string; }
export interface RieQueryProjection extends RieQueryField { as?: string; }
export interface RieQueryJoin {
  entityName: string;
  alias: string;
  type?: "inner" | "left";
  on: { left: RieQueryField; rightField: string };
}
export type RieAggregationOperator = "sum" | "count" | "avg" | "min" | "max";
export interface RieQueryAggregation { op: RieAggregationOperator; field?: string; source?: string; as: string; }
export interface RieDateScope extends RieQueryField { from?: string | number; to?: string | number; values?: readonly (string | number)[]; }
export interface RieValueScope extends Partial<RieQueryField> { values: readonly string[]; }
export interface RieScalableQueryScope {
  date?: RieDateScope | readonly RieDateScope[];
  route?: RieValueScope;
  rep?: RieValueScope;
  customer?: RieValueScope;
  product?: RieValueScope;
}
export interface RieQueryPagination { limit?: number; offset?: number; }

/** Read-only contract for PostgreSQL-backed high-cardinality canonical data. */
export interface RieScalableQuery extends EntityQueryContext {
  entityName: string;
  projection: readonly RieQueryProjection[];
  joins?: readonly RieQueryJoin[];
  groupBy?: readonly RieQueryField[];
  aggregates?: readonly RieQueryAggregation[];
  scope?: RieScalableQueryScope;
  pagination?: RieQueryPagination;
}
export interface RieScalableQueryResult {
  records: readonly EntityRecord[];
  page: { limit: number; offset: number; hasMore: boolean };
}
