import { Injectable } from "@nestjs/common";
import { Prisma } from "@field-sales-os/database";
import { PrismaService } from "../../common/prisma";
import { CanonicalHierarchyResolverService } from "./canonical-hierarchy-resolver.service";
import type { EntityRecord, EntityQueryResult } from "./entity-provider.interface";
import type { RieDateScope, RieQueryAggregation, RieQueryField, RieQueryJoin, RieScalableEntityRead, RieScalableQuery, RieScalableQueryResult, RieValueScope } from "./scalable-query.types";

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
      if (aggregate.multiplier) assertField(aggregate.multiplier, aliases);
      if (aggregate.multiplierFallback) assertField(aggregate.multiplierFallback, aliases);
      if (aggregate.op !== "count" && !aggregate.field) throw new Error(`${aggregate.op} aggregate requires a field.`);
      if (aggregate.op === "sumProduct" && !aggregate.multiplier) throw new Error("sumProduct aggregate requires a multiplier field.");
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
    // A derived table may be flattened by PostgreSQL, which lets historical
    // versions re-enter a fact join.  Materialized CTEs form the required
    // execution barrier: only rows belonging to active versions can reach a
    // join (especially the Invoice Items -> Invoices fact join).
    const activeRows = [{ entityName: input.entityName, alias: "base" }, ...joins.map(({ entityName, alias }) => ({ entityName, alias }))];
    const ctePredicates = new Map(await Promise.all(activeRows.map(async ({ alias }) => [alias, await this.scopePredicates(input, aliases, alias)] as const)));
    // A scoped joined entity (for example, Invoices by date) must be produced
    // before the base fact CTE so it can bound that fact CTE with a semi-join.
    // The final join remains unchanged, preserving its multiplicity exactly.
    const scopedJoinAliases = new Set(joins.filter((join) => join.type !== "left" && ctePredicates.get(join.alias)?.length).map((join) => join.alias));
    const orderedActiveRows = [...activeRows.filter(({ alias }) => alias !== "base" && scopedJoinAliases.has(alias)), activeRows.find(({ alias }) => alias === "base")!, ...activeRows.filter(({ alias }) => alias !== "base" && !scopedJoinAliases.has(alias))];
    const canCollapseScopedJoins = joins.length > 0
      && joins.every((join) => join.type !== "left" && scopedJoinAliases.has(join.alias))
      && ![...input.projection, ...(input.groupBy ?? []), ...(input.aggregates ?? []).flatMap((aggregate) => [
        ...(aggregate.field ? [{ field: aggregate.field, source: aggregate.source }] : []),
        ...(aggregate.multiplier ? [aggregate.multiplier] : []),
        ...(aggregate.multiplierFallback ? [aggregate.multiplierFallback] : []),
      ])]
        .some((field) => field.source && scopedJoinAliases.has(field.source));
    const baseSemiJoins = canCollapseScopedJoins ? [] : joins
      .filter((join) => scopedJoinAliases.has(join.alias) && (join.on.left.source ?? "base") === "base")
      .map((join) => scopedJoinExists(join));
    const baseSourceJoins = canCollapseScopedJoins ? joins.map(scopedJoin) : [];
    const ctes = orderedActiveRows.map(({ entityName, alias }) => activeEntityRowsCte(input.companyId, entityName, alias, ctePredicates.get(alias) ?? [], alias === "base" ? baseSemiJoins : [], alias === "base" ? baseSourceJoins : []));
    const joinSql = (canCollapseScopedJoins ? [] : joins).map((join) => {
      return Prisma.sql`${join.type === "left" ? Prisma.raw("LEFT JOIN") : Prisma.raw("INNER JOIN")} ${activeEntityRowsReference(join.alias)} ON ${normalizedField(join.on.left)} = ${normalizedField({ field: join.on.rightField, source: join.alias })}`;
    });
    const joinClause = joinSql.length ? Prisma.join(joinSql, " ") : Prisma.empty;
    const where = !canCollapseScopedJoins && predicates.length ? Prisma.sql` AND ${Prisma.join(predicates, " AND ")}` : Prisma.empty;
    const grouping = input.groupBy?.length ? Prisma.sql` GROUP BY ${Prisma.join(input.groupBy.map(textField))}` : Prisma.empty;
    const ordering = input.groupBy?.length
      ? Prisma.sql` ORDER BY ${Prisma.join(input.groupBy.map(textField))}`
      : input.aggregates?.length ? Prisma.empty : Prisma.sql` ORDER BY base."entity_key"`;
    const rows = await this.prisma.$queryRaw<EntityRecord[]>(Prisma.sql`
      WITH ${Prisma.join(ctes, ", ")}
      SELECT ${Prisma.join(select)}
      FROM ${activeEntityRowsReference("base")}
      ${joinClause}
      WHERE TRUE${where}
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

  private async scopePredicates(input: RieScalableQuery, aliases: Set<string>, cteAlias?: string): Promise<Prisma.Sql[]> {
    const predicates: Prisma.Sql[] = [];
    const cteAliases = cteAlias ? new Set([...aliases].map((alias) => `${alias}_source`)) : aliases;
    const scoped = (field: RieQueryField): RieQueryField | null => {
      const source = field.source ?? "base";
      if (cteAlias && source !== cteAlias) return null;
      return cteAlias ? { ...field, source: `${source}_source` } : field;
    };
    for (const date of asArray(input.scope?.date)) {
      assertField(date, aliases);
      const field = scoped(date);
      if (field) predicates.push(datePredicate(field, cteAliases));
    }
    addScopedValueScope(predicates, input.scope?.route, "RouteID", aliases, cteAliases, scoped);
    addScopedValueScope(predicates, input.scope?.rep, "SalesRepID", aliases, cteAliases, scoped);
    addScopedValueScope(predicates, input.scope?.customer, "CustomerCode", aliases, cteAliases, scoped);
    addScopedValueScope(predicates, input.scope?.product, "ProductCode", aliases, cteAliases, scoped);
    for (const fieldScope of input.scope?.fields ?? []) {
      addScopedValueScope(predicates, fieldScope, fieldScope.field, aliases, cteAliases, scoped);
    }
    if (input.requestingUser) {
      const allowed = await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser);
      const hierarchyRoute = input.hierarchyRoute ?? { field: "RouteID" };
      assertField(hierarchyRoute, aliases);
      const field = scoped(hierarchyRoute);
      if (field && allowed) predicates.push(allowed.size ? inPredicate(field, [...allowed], cteAliases) : Prisma.sql`FALSE`);
    }
    return predicates;
  }
}

function activeEntityRowsCte(companyId: string, entityName: string, alias: string, predicates: readonly Prisma.Sql[], semiJoins: readonly Prisma.Sql[], sourceJoins: readonly Prisma.Sql[]): Prisma.Sql {
  const cte = `${alias}_active`;
  const rowAlias = `${alias}_source`;
  const versionAlias = `${alias}_version`;
  return Prisma.sql`${Prisma.raw(cte)} AS MATERIALIZED (
    SELECT ${Prisma.raw(rowAlias)}.*
    FROM "rie_dataset_versions" ${Prisma.raw(versionAlias)}
    INNER JOIN "rie_entity_rows" ${Prisma.raw(rowAlias)} ON ${Prisma.raw(rowAlias)}."dataset_version_id" = ${Prisma.raw(versionAlias)}.id
    ${sourceJoins.length ? Prisma.join(sourceJoins, " ") : Prisma.empty}
    WHERE ${Prisma.raw(versionAlias)}."company_id" = ${companyId} AND ${Prisma.raw(versionAlias)}."entity_name" = ${entityName} AND ${Prisma.raw(versionAlias)}."is_active" = TRUE
      AND ${Prisma.raw(rowAlias)}."company_id" = ${companyId} AND ${Prisma.raw(rowAlias)}."entity_name" = ${entityName}
      ${predicates.length ? Prisma.sql`AND ${Prisma.join(predicates, " AND ")}` : Prisma.empty}
      ${semiJoins.length ? Prisma.sql`AND ${Prisma.join(semiJoins, " AND ")}` : Prisma.empty}
  )`;
}

function activeEntityRowsReference(alias: string): Prisma.Sql { return Prisma.sql`${Prisma.raw(`${alias}_active`)} ${Prisma.raw(alias)}`; }
function scopedJoinExists(join: RieQueryJoin): Prisma.Sql {
  const baseSource = { field: join.on.left.field, source: "base_source" };
  const scopedSource = { field: join.on.rightField, source: `${join.alias}_scope` };
  return Prisma.sql`EXISTS (SELECT 1 FROM ${Prisma.raw(`${join.alias}_active`)} ${Prisma.raw(`${join.alias}_scope`)} WHERE ${normalizedField(baseSource)} = ${normalizedField(scopedSource)})`;
}
function scopedJoin(join: RieQueryJoin): Prisma.Sql {
  const baseSource = { field: join.on.left.field, source: "base_source" };
  const scopedSource = { field: join.on.rightField, source: `${join.alias}_scope` };
  return Prisma.sql`INNER JOIN ${Prisma.raw(`${join.alias}_active`)} ${Prisma.raw(`${join.alias}_scope`)} ON ${normalizedField(baseSource)} = ${normalizedField(scopedSource)}`;
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
function addScopedValueScope(target: Prisma.Sql[], scope: RieValueScope | undefined, defaultField: string, aliases: Set<string>, cteAliases: Set<string>, scoped: (field: RieQueryField) => RieQueryField | null): void {
  if (!scope) return;
  const source = scope.source ?? "base";
  const field = { field: scope.field ?? defaultField, ...(scope.source ? { source } : {}) };
  assertField(field, aliases);
  const mapped = scoped(field);
  if (mapped) target.push(inPredicate(mapped, scope.values, cteAliases));
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
  if (aggregate.op === "countDistinct") return Prisma.sql`COUNT(DISTINCT NULLIF(BTRIM(COALESCE(${field}, '')), '')) AS ${alias}`;
  const numeric = Prisma.sql`CASE WHEN BTRIM(COALESCE(${field}, '')) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN BTRIM(COALESCE(${field}, ''))::double precision ELSE NULL END`;
  if (aggregate.op === "sumProduct") {
    const multiplier = textField(aggregate.multiplier!);
    const numericMultiplier = Prisma.sql`CASE WHEN BTRIM(COALESCE(${multiplier}, '')) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN BTRIM(COALESCE(${multiplier}, ''))::double precision ELSE NULL END`;
    if (aggregate.multiplierFallback) {
      const fallback = textField(aggregate.multiplierFallback);
      const numericFallback = Prisma.sql`CASE WHEN BTRIM(COALESCE(${fallback}, '')) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN BTRIM(COALESCE(${fallback}, ''))::double precision ELSE NULL END`;
      return Prisma.sql`SUM(${numeric} * CASE WHEN ${multiplier} IS NULL THEN ${numericFallback} ELSE ${numericMultiplier} END) AS ${alias}`;
    }
    return Prisma.sql`SUM(${numeric} * ${numericMultiplier}) AS ${alias}`;
  }
  return Prisma.sql`${Prisma.raw({ sum: "SUM", avg: "AVG", min: "MIN", max: "MAX" }[aggregate.op])}(${numeric}) AS ${alias}`;
}
// Field names are validated identifiers.  Keep them as SQL literals rather
// than bind parameters so SELECT/GROUP BY expressions remain identical.
function textField(field: RieQueryField): Prisma.Sql { return Prisma.sql`${Prisma.raw(field.source ?? "base")}."data" ->> ${Prisma.raw(`'${field.field}'`)}`; }
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
