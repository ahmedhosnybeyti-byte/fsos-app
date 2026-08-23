import { Injectable } from "@nestjs/common";
import { Prisma } from "@field-sales-os/database";
import { PrismaService } from "../../common/prisma";
import { CanonicalHierarchyResolverService } from "./canonical-hierarchy-resolver.service";
import type { EntityRecord, EntityQueryResult } from "./entity-provider.interface";
import type { RieDateScope, RieQueryAggregation, RieQueryField, RieScalableEntityRead, RieScalableQuery, RieScalableQueryResult, RieValueScope } from "./scalable-query.types";

const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 5_000;
const SAFE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * Read-only PostgreSQL query layer for canonical high-cardinality data.
 * Query predicates, joins, grouping and aggregation all execute in SQL;
 * this service never materializes an entity before applying a scope.
 */
@Injectable()
export class RieScalableQueryService {
  constructor(private readonly prisma: PrismaService, private readonly hierarchyResolver: CanonicalHierarchyResolverService) {}

  async query(input: RieScalableQuery): Promise<RieScalableQueryResult> {
    if (!input.companyId?.trim()) throw new Error("RIE scalable query requires companyId.");
    if (!input.entityName?.trim()) throw new Error("RIE scalable query requires entityName.");
    if (!input.projection.length && !input.aggregates?.length) throw new Error("RIE scalable query requires projection or aggregates.");
    const aliases = new Set<string>(["base"]);
    const joins = input.joins ?? [];
    for (const join of joins) {
      assertIdentifier(join.alias, "join alias");
      if (aliases.has(join.alias)) throw new Error(`RIE scalable query has duplicate alias "${join.alias}".`);
      assertField(join.on.left, aliases);
      assertIdentifier(join.on.rightField, "join field");
      aliases.add(join.alias);
    }
    for (const field of [...input.projection, ...(input.groupBy ?? [])]) assertField(field, aliases);
    if (input.hierarchyRoute) assertField(input.hierarchyRoute, aliases);
    for (const aggregate of input.aggregates ?? []) {
      assertIdentifier(aggregate.as, "aggregate alias");
      if (aggregate.field) assertField({ field: aggregate.field, source: aggregate.source }, aliases);
      if (aggregate.op !== "count" && !aggregate.field) throw new Error(`${aggregate.op} aggregate requires a field.`);
    }
    const projection = input.projection.map((field) => {
      const alias = field.as ?? field.field;
      assertIdentifier(alias, "projection alias");
      return Prisma.sql`${textField(field)} AS ${quoted(alias)}`;
    });
    if (input.aggregates?.length && input.projection.length && !input.groupBy?.length) {
      throw new Error("RIE scalable query with projections and aggregates requires groupBy.");
    }
    if (input.groupBy?.length) {
      const grouped = new Set(input.groupBy.map((field) => `${field.source ?? "base"}.${field.field}`));
      for (const field of input.projection) {
        if (!grouped.has(`${field.source ?? "base"}.${field.field}`)) {
          throw new Error(`Projected field "${field.field}" must be included in groupBy when aggregating.`);
        }
      }
    }
    const select = [...projection, ...(input.aggregates ?? []).map(aggregateSql)];
    const predicates = await this.scopePredicates(input, aliases);
    const page = normalizePagination(input.pagination);
    const joinSql = joins.map((join) => Prisma.sql`${join.type === "left" ? Prisma.raw("LEFT JOIN") : Prisma.raw("INNER JOIN")} "rie_canonical_entity_rows" ${Prisma.raw(join.alias)} ON ${Prisma.raw(join.alias)}."company_id" = base."company_id" AND ${Prisma.raw(join.alias)}."entity_name" = ${join.entityName} AND ${normalizedField(join.on.left)} = ${normalizedField({ field: join.on.rightField, source: join.alias })}`);
    const where = predicates.length ? Prisma.sql` AND ${Prisma.join(predicates, " AND ")}` : Prisma.empty;
    const grouping = input.groupBy?.length ? Prisma.sql` GROUP BY ${Prisma.join(input.groupBy.map(textField))}` : Prisma.empty;
    const ordering = input.groupBy?.length
      ? Prisma.sql` ORDER BY ${Prisma.join(input.groupBy.map(textField))}`
      : input.aggregates?.length ? Prisma.empty : Prisma.sql` ORDER BY base."entity_key"`;
    const rows = await this.prisma.$queryRaw<EntityRecord[]>(Prisma.sql`
      SELECT ${Prisma.join(select)}
      FROM "rie_canonical_entity_rows" base
      ${Prisma.join(joinSql, " ")}
      WHERE base."company_id" = ${input.companyId} AND base."entity_name" = ${input.entityName}${where}
      ${grouping}
      ${ordering}
      LIMIT ${page.limit + 1} OFFSET ${page.offset}
    `);
    const hasMore = rows.length > page.limit;
    return { records: hasMore ? rows.slice(0, page.limit) : rows, page: { ...page, hasMore } };
  }

  async readEntity(input: RieScalableEntityRead): Promise<EntityQueryResult> {
    const records: EntityRecord[] = [];
    let offset = 0;
    do {
      const page = await this.query({
        ...(input.applyHierarchy === false ? { companyId: input.companyId } : { companyId: input.companyId, requestingUser: input.requestingUser }),
        entityName: input.entityName,
        projection: input.projection,
        scope: input.scope,
        joins: input.joins,
        hierarchyRoute: input.hierarchyRoute,
        pagination: { limit: MAX_PAGE_SIZE, offset },
      });
      records.push(...page.records);
      offset += page.records.length;
      if (!page.page.hasMore) break;
    } while (true);
    return { entityName: input.entityName, available: true, records, fields: input.projection.map((field) => field.as ?? field.field), warnings: [] };
  }

  private async scopePredicates(input: RieScalableQuery, aliases: Set<string>): Promise<Prisma.Sql[]> {
    const predicates: Prisma.Sql[] = [];
    for (const date of asArray(input.scope?.date)) predicates.push(datePredicate(date, aliases));
    addValueScope(predicates, input.scope?.route, "RouteID", aliases);
    addValueScope(predicates, input.scope?.rep, "SalesRepID", aliases);
    addValueScope(predicates, input.scope?.customer, "CustomerCode", aliases);
    addValueScope(predicates, input.scope?.product, "ProductCode", aliases);
    if (input.requestingUser) {
      const allowed = await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser);
      if (allowed) predicates.push(allowed.size ? inPredicate(input.hierarchyRoute ?? { field: "RouteID" }, [...allowed], aliases) : Prisma.sql`FALSE`);
    }
    return predicates;
  }
}

function normalizePagination(input: RieScalableQuery["pagination"]): { limit: number; offset: number } {
  const limit = input?.limit ?? DEFAULT_PAGE_SIZE;
  const offset = input?.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) throw new Error(`RIE scalable query limit must be an integer between 1 and ${MAX_PAGE_SIZE}.`);
  if (!Number.isInteger(offset) || offset < 0) throw new Error("RIE scalable query offset must be a non-negative integer.");
  return { limit, offset };
}
function addValueScope(target: Prisma.Sql[], scope: RieValueScope | undefined, defaultField: string, aliases: Set<string>): void {
  if (scope) target.push(inPredicate({ field: scope.field ?? defaultField, source: scope.source }, scope.values, aliases));
}
function inPredicate(field: RieQueryField, values: readonly string[], aliases: Set<string>): Prisma.Sql {
  assertField(field, aliases);
  return values.length ? Prisma.sql`${normalizedField(field)} IN (${Prisma.join(values.map((value) => value.trim().toLowerCase()))})` : Prisma.sql`FALSE`;
}
function datePredicate(scope: RieDateScope, aliases: Set<string>): Prisma.Sql {
  assertField(scope, aliases);
  const values = scope.values ?? [];
  if (values.length && (scope.from !== undefined || scope.to !== undefined)) throw new Error("RIE date scope accepts either values or from/to, not both.");
  const date = Prisma.sql`CASE WHEN ${textField(scope)} ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT(${textField(scope)}, 10) ELSE ${textField(scope)} END`;
  if (values.length) return Prisma.sql`${date} IN (${Prisma.join(values.map(normalizeDate))})`;
  const predicates: Prisma.Sql[] = [];
  if (scope.from !== undefined) predicates.push(Prisma.sql`${date} >= ${normalizeDate(scope.from)}`);
  if (scope.to !== undefined) predicates.push(Prisma.sql`${date} <= ${normalizeDate(scope.to)}`);
  if (!predicates.length) throw new Error("RIE date scope requires values, from, or to.");
  return Prisma.sql`(${Prisma.join(predicates, " AND ")})`;
}
function aggregateSql(aggregate: RieQueryAggregation): Prisma.Sql {
  const alias = quoted(aggregate.as);
  if (aggregate.op === "count" && !aggregate.field) return Prisma.sql`COUNT(*) AS ${alias}`;
  const field = textField({ field: aggregate.field!, source: aggregate.source });
  if (aggregate.op === "count") return Prisma.sql`COUNT(NULLIF(BTRIM(COALESCE(${field}, '')), '')) AS ${alias}`;
  const numeric = Prisma.sql`CASE WHEN BTRIM(COALESCE(${field}, '')) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN BTRIM(COALESCE(${field}, ''))::double precision ELSE NULL END`;
  return Prisma.sql`${Prisma.raw({ sum: "SUM", avg: "AVG", min: "MIN", max: "MAX" }[aggregate.op])}(${numeric}) AS ${alias}`;
}
function textField(field: RieQueryField): Prisma.Sql { return Prisma.sql`${Prisma.raw(field.source ?? "base")}."data" ->> ${field.field}`; }
function normalizedField(field: RieQueryField): Prisma.Sql { return Prisma.sql`LOWER(BTRIM(COALESCE(${textField(field)}, '')))`; }
function quoted(identifier: string): Prisma.Sql { return Prisma.raw(`"${identifier}"`); }
function assertField(field: RieQueryField, aliases: Set<string>): void {
  assertIdentifier(field.field, "field");
  if (field.source && !aliases.has(field.source)) throw new Error(`RIE scalable query references unknown alias "${field.source}".`);
}
function assertIdentifier(value: string, label: string): void { if (!SAFE_IDENTIFIER.test(value)) throw new Error(`RIE scalable query ${label} must be an alphanumeric identifier.`); }
function asArray<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value as readonly T[] : [value as T];
}
function normalizeDate(value: string | number): string {
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`RIE date scope has an invalid date: ${value}`);
  return date.toISOString().slice(0, 10);
}
