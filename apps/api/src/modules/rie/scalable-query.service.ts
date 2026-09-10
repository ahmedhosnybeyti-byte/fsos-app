import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@field-sales-os/database";
import { PrismaService } from "../../common/prisma";
import { CanonicalHierarchyResolverService } from "./canonical-hierarchy-resolver.service";
import { IMPORT_TEMPLATES } from "../import-validation/import-templates.data";
import type { EntityRecord, EntityQueryResult } from "./entity-provider.interface";
import type { RieDateScope, RieGeoCustomerSelectionQuery, RieGeoCustomerSelectionRow, RieGeoProductQuery, RieGeoProductRow, RieLatestPerScope, RieManagementLoadingRiskQuery, RieManagementLoadingRiskRow, RieManagementLostOpportunitiesQuery, RieManagementLostOpportunitiesResult, RieManagementLostOpportunityRow, RieManagementStockAlignmentQuery, RieManagementStockAlignmentRow, RieManagementVehicleProductsQuery, RieManagementVehicleProductRow, RieQueryAggregation, RieQueryField, RieQueryJoin, RieRouteFallbackScope, RieRouteProductStalenessQuery, RieRouteProductStalenessRow, RieScalableEntityRead, RieScalableQuery, RieScalableQueryResult, RieStalePurchaseRow, RieStalePurchasesQuery, RieValueScope } from "./scalable-query.types";

const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 5_000;
const MAX_INTERNAL_AGGREGATE_PAGE_SIZE = 25_000;
const SAFE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*$/;
const EXPENSIVE_RIE_QUERY_CONCURRENCY = 12;
const EXPENSIVE_RIE_QUERY_QUEUE_TIMEOUT_MS = 30_000;

type RieQueryPermit = Readonly<{ activeCount: number; queueWaitMs: number; release: () => void }>;
type RieQueryAcquireOptions = Readonly<{ signal?: AbortSignal; timeoutMs?: number }>;
type RieQueryWaiter = Readonly<{
  resolve: (permit: RieQueryPermit) => void;
  reject: (reason: Error) => void;
  cancel: () => void;
}>;

class RieQueryQueueTimeoutError extends Error {
  constructor() {
    super("Timed out waiting for an RIE query execution slot.");
    this.name = "RieQueryQueueTimeoutError";
  }
}

class RieQueryQueueCancelledError extends Error {
  constructor() {
    super("RIE query execution was cancelled while waiting for a slot.");
    this.name = "RieQueryQueueCancelledError";
  }
}

/** One in-process gate shared by every RIE service instance. */
class ProcessWideRieQuerySemaphore {
  private activeCount = 0;
  private readonly waiters: RieQueryWaiter[] = [];

  constructor(private readonly limit: number) {}

  acquire({ signal, timeoutMs = EXPENSIVE_RIE_QUERY_QUEUE_TIMEOUT_MS }: RieQueryAcquireOptions = {}): Promise<RieQueryPermit> {
    if (signal?.aborted) return Promise.reject(new RieQueryQueueCancelledError());
    const queuedAt = Date.now();
    if (this.activeCount < this.limit) {
      this.activeCount += 1;
      return Promise.resolve(this.permit(0));
    }
    return new Promise<RieQueryPermit>((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const remove = () => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        if (timeout) clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
      };
      const fail = (reason: Error) => {
        if (settled) return;
        settled = true;
        remove();
        reject(reason);
      };
      const onAbort = () => fail(new RieQueryQueueCancelledError());
      const waiter: RieQueryWaiter = {
        resolve: (permit) => {
          if (settled) return;
          settled = true;
          remove();
          resolve({ activeCount: permit.activeCount, release: permit.release, queueWaitMs: Date.now() - queuedAt });
        },
        reject: fail,
        cancel: () => fail(new RieQueryQueueCancelledError()),
      };
      this.waiters.push(waiter);
      if (timeoutMs > 0) timeout = setTimeout(() => fail(new RieQueryQueueTimeoutError()), timeoutMs);
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) waiter.cancel();
    });
  }

  private permit(queueWaitMs: number): RieQueryPermit {
    let released = false;
    return {
      activeCount: this.activeCount,
      queueWaitMs,
      release: () => {
        if (released) return;
        released = true;
        const next = this.waiters.shift();
        if (next) next.resolve(this.permit(0));
        else this.activeCount -= 1;
      },
    };
  }
}

/**
 * Read-only PostgreSQL query layer for canonical high-cardinality data.
 * Query predicates, joins, grouping and aggregation all execute in SQL;
 * this service never materializes an entity before applying a scope.
 */
@Injectable()
export class RieScalableQueryService {
  private static readonly expensiveQuerySemaphore = new ProcessWideRieQuerySemaphore(EXPENSIVE_RIE_QUERY_CONCURRENCY);
  private readonly logger = new Logger(RieScalableQueryService.name);

  constructor(private readonly prisma: PrismaService, private readonly hierarchyResolver: CanonicalHierarchyResolverService) {}

  private async runExpensiveQuery<T>(operation: string, execute: () => Promise<T>, options?: RieQueryAcquireOptions): Promise<T> {
    const permit = await RieScalableQueryService.expensiveQuerySemaphore.acquire(options);
    try {
      this.logger.log(JSON.stringify({ event: "rie_expensive_query_acquired", operation, queueWaitMs: permit.queueWaitMs, activeCount: permit.activeCount }));
      return await execute();
    } finally {
      permit.release();
    }
  }

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
    for (const order of input.orderBy ?? []) {
      if (!order.field && !order.aggregate) throw new Error("RIE scalable query order requires a field or aggregate alias.");
      if (order.field && order.aggregate) throw new Error("RIE scalable query order accepts either a field or aggregate alias.");
      if (order.field) assertField(order.field, aliases);
      if (order.aggregate && !input.aggregates?.some((aggregate) => aggregate.as === order.aggregate)) throw new Error(`RIE scalable query order references unknown aggregate "${order.aggregate}".`);
      if (order.direction && order.direction !== "asc" && order.direction !== "desc") throw new Error("RIE scalable query order direction must be asc or desc.");
    }
    if (input.hierarchyRoute) assertField(input.hierarchyRoute, aliases);
    if (input.latestPer) {
      assertField(input.latestPer.partitionBy, aliases);
      assertField(input.latestPer.orderBy, aliases);
      if ((input.latestPer.partitionBy.source ?? "base") !== "base" || (input.latestPer.orderBy.source ?? "base") !== "base") {
        throw new Error("RIE scalable latestPer fields must belong to the base entity.");
      }
    }
    for (const aggregate of input.aggregates ?? []) {
      assertIdentifier(aggregate.as, "aggregate alias");
      if (aggregate.field) assertField({ field: aggregate.field, source: aggregate.source }, aliases);
      if (aggregate.multiplier) assertField(aggregate.multiplier, aliases);
      if (aggregate.multiplierFallback) assertField(aggregate.multiplierFallback, aliases);
      if (aggregate.filterPositiveField) assertField(aggregate.filterPositiveField, aliases);
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
    const page = normalizePagination(input.pagination, input.internalAggregate === true, input.unboundedFinalResult === true);
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
    // A scope can sit behind more than one relationship hop.  For example,
    // Invoice Items -> Invoices -> Customers.City needs the customer CTE
    // before the invoice CTE, so City bounds invoices before either can reach
    // the high-cardinality Invoice Items CTE.
    const orderedScopedAliases = orderScopedAliases(joins, scopedJoinAliases);
    const orderedActiveRows = [...orderedScopedAliases.map((alias) => activeRows.find((row) => row.alias === alias)!), activeRows.find(({ alias }) => alias === "base")!, ...activeRows.filter(({ alias }) => alias !== "base" && !scopedJoinAliases.has(alias))];
    const canCollapseScopedJoins = joins.length > 0
      && joins.every((join) => join.type !== "left" && scopedJoinAliases.has(join.alias) && (join.on.left.source ?? "base") === "base")
      && ![...input.projection, ...(input.groupBy ?? []), ...(input.aggregates ?? []).flatMap((aggregate) => [
        ...(aggregate.field ? [{ field: aggregate.field, source: aggregate.source }] : []),
        ...(aggregate.multiplier ? [aggregate.multiplier] : []),
        ...(aggregate.multiplierFallback ? [aggregate.multiplierFallback] : []),
        ...(aggregate.filterPositiveField ? [aggregate.filterPositiveField] : []),
      ])]
        .some((field) => field.source && scopedJoinAliases.has(field.source));
    const driveBaseFromScopedJoins = input.driveBaseFromScopedJoins === true;
    if (driveBaseFromScopedJoins && (!joins.length || !joins.every((join) => join.type !== "left" && scopedJoinAliases.has(join.alias) && (join.on.left.source ?? "base") === "base"))) {
      throw new Error("RIE base-driving scoped joins require direct scoped inner joins from the base entity.");
    }
    // A fact query can require fields from its joined entity in the final
    // SELECT (so it cannot collapse that join), yet still must only admit fact
    // rows whose keys exist in the already-scoped joined CTE.  Put that join
    // inside base_active first; retain the final join and its predicates for
    // exact result and route-fallback parity.
    const baseDrivenByScopedJoins = canCollapseScopedJoins || driveBaseFromScopedJoins;
    const baseSemiJoins = baseDrivenByScopedJoins ? [] : scopedSemiJoinsFor("base", joins, scopedJoinAliases, input.preferHashedScopedSemiJoin);
    const baseSourceJoins = baseDrivenByScopedJoins ? joins.map(scopedJoin) : [];
    const activeVersionCounts = await this.activeVersionCounts(input.companyId, [...new Set(activeRows.map(({ entityName }) => entityName))]);
    const ctes = orderedActiveRows.map(({ entityName, alias }) => activeEntityRowsCte(input.companyId, entityName, alias, ctePredicates.get(alias) ?? [], alias === "base" ? baseSemiJoins : scopedSemiJoinsFor(alias, joins, scopedJoinAliases), alias === "base" ? baseSourceJoins : [], activeVersionCounts.get(entityName) === 1));
    if (input.latestPer) ctes.push(latestPerCte(input.latestPer));
    const baseReference = input.latestPer ? Prisma.sql`base_latest base` : activeEntityRowsReference("base");
    const joinSql = (canCollapseScopedJoins ? [] : joins).map((join) => {
      return Prisma.sql`${join.type === "left" ? Prisma.raw("LEFT JOIN") : Prisma.raw("INNER JOIN")} ${activeEntityRowsReference(join.alias)} ON ${normalizedField(join.on.left)} = ${normalizedField({ field: join.on.rightField, source: join.alias })}`;
    });
    const joinClause = joinSql.length ? Prisma.join(joinSql, " ") : Prisma.empty;
    const where = !canCollapseScopedJoins && predicates.length ? Prisma.sql` AND ${Prisma.join(predicates, " AND ")}` : Prisma.empty;
    const grouping = input.groupBy?.length ? Prisma.sql` GROUP BY ${Prisma.join(input.groupBy.map(textField))}` : Prisma.empty;
    const ordering = input.orderBy?.length
      ? Prisma.sql` ORDER BY ${Prisma.join(input.orderBy.map((order) => Prisma.sql`${order.aggregate ? quoted(order.aggregate) : textField(order.field!)} ${Prisma.raw((order.direction ?? "asc").toUpperCase())}`))}`
      : input.groupBy?.length ? Prisma.sql` ORDER BY ${Prisma.join(input.groupBy.map(textField))}`
      : input.aggregates?.length ? Prisma.empty : Prisma.sql` ORDER BY base."entity_key"`;
    const pagination = input.unboundedFinalResult
      ? Prisma.sql`LIMIT ALL OFFSET ${page.offset}`
      : Prisma.sql`LIMIT ${page.limit + 1} OFFSET ${page.offset}`;
    const rows = await this.runExpensiveQuery("query", () => this.prisma.$queryRaw<EntityRecord[]>(Prisma.sql`
      WITH ${Prisma.join(ctes, ", ")}
      SELECT ${Prisma.join(select)}
      FROM ${baseReference}
      ${joinClause}
      WHERE TRUE${where}
      ${grouping}
      ${ordering}
      ${pagination}
    `));
    const hasMore = input.unboundedFinalResult ? false : rows.length > page.limit;
    return { records: hasMore ? rows.slice(0, page.limit) : rows, page: { ...page, hasMore } };
  }

  /**
   * Geo Intelligence's only customer read. Coordinates are validated and the
   * nearest/manual set is selected in PostgreSQL; Node receives at most the
   * requested neighbors plus manual selections.
   */
  async queryGeoCustomerSelection(input: RieGeoCustomerSelectionQuery): Promise<RieGeoCustomerSelectionRow[]> {
    const allowedRoutes = input.requestingUser ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser) : null;
    const route = !allowedRoutes ? [] : allowedRoutes.size === 0
      ? [Prisma.sql`FALSE`]
      : [Prisma.sql`${normalizedField({ field: "RouteID", source: "customer_source" })} IN (${Prisma.join([...allowedRoutes])})`];
    const customers = activeEntityRowsCte(input.companyId, "Customers", "customer", route, [], []);
    const code = textField({ field: "CustomerCode", source: "customer" });
    const name = textField({ field: "CustomerName", source: "customer" });
    const lat = numericField(textField({ field: "Latitude", source: "customer" }));
    const lon = numericField(textField({ field: "Longitude", source: "customer" }));
    const distance = (latitude: Prisma.Sql, longitude: Prisma.Sql) => Prisma.sql`6371.0088 * 2 * ASIN(SQRT(POWER(SIN(RADIANS(${latitude} - ${input.location.lat}) / 2), 2) + COS(RADIANS(${input.location.lat})) * COS(RADIANS(${latitude})) * POWER(SIN(RADIANS(${longitude} - ${input.location.lon}) / 2), 2)))`;
    const valid = Prisma.sql`
      SELECT DISTINCT ON (BTRIM(COALESCE(${code}, '')))
        BTRIM(COALESCE(${code}, '')) AS id, BTRIM(COALESCE(${name}, ${code}, '')) AS name,
        ${lat} AS lat, ${lon} AS lon
      FROM customer_active customer
      WHERE BTRIM(COALESCE(${code}, '')) <> '' AND ${lat} BETWEEN -90 AND 90 AND ${lon} BETWEEN -180 AND 180 AND NOT (${lat} = 0 AND ${lon} = 0)
      ORDER BY BTRIM(COALESCE(${code}, '')), customer."entity_key" DESC`;
    const invalid = Prisma.sql`SELECT COUNT(DISTINCT BTRIM(COALESCE(${code}, '')))::int AS count FROM customer_active customer WHERE BTRIM(COALESCE(${code}, '')) <> '' AND NOT (${lat} BETWEEN -90 AND 90 AND ${lon} BETWEEN -180 AND 180 AND NOT (${lat} = 0 AND ${lon} = 0))`;
    const manualIds = [...new Set((input.manualCustomerIds ?? []).map((id) => id.trim()).filter(Boolean))];
    const rows = input.targetCustomerId
      ? await this.runExpensiveQuery("queryGeoCustomerSelection", () => this.prisma.$queryRaw<RieGeoCustomerSelectionRow[]>(Prisma.sql`
          WITH ${customers}, valid AS MATERIALIZED (${valid}), invalid AS MATERIALIZED (${invalid}),
          target AS MATERIALIZED (SELECT * FROM valid WHERE id = ${input.targetCustomerId}),
          neighbors AS MATERIALIZED (SELECT valid.*, 6371.0088 * 2 * ASIN(SQRT(POWER(SIN(RADIANS(valid.lat - target.lat) / 2), 2) + COS(RADIANS(target.lat)) * COS(RADIANS(valid.lat)) * POWER(SIN(RADIANS(valid.lon - target.lon) / 2), 2))) AS distance FROM valid, target WHERE valid.id <> target.id ORDER BY distance, valid.id LIMIT ${input.nearestCount})
          SELECT target.id, target.name, target.lat, target.lon, 0::double precision AS "distanceKm", 'target'::text AS source, (SELECT count FROM invalid) AS "excludedBadCoordinates" FROM target
          UNION ALL
          SELECT neighbors.id, neighbors.name, neighbors.lat, neighbors.lon, neighbors.distance AS "distanceKm", 'auto'::text AS source, (SELECT count FROM invalid) AS "excludedBadCoordinates" FROM neighbors
        `))
      : await this.runExpensiveQuery("queryGeoCustomerSelection", () => this.prisma.$queryRaw<RieGeoCustomerSelectionRow[]>(Prisma.sql`
          WITH ${customers}, valid AS MATERIALIZED (${valid}), invalid AS MATERIALIZED (${invalid}),
          auto AS MATERIALIZED (SELECT valid.*, ${distance(Prisma.raw("valid.lat"), Prisma.raw("valid.lon"))} AS distance FROM valid ORDER BY distance, valid.id LIMIT ${input.nearestCount}),
          manual AS MATERIALIZED (SELECT valid.*, ${distance(Prisma.raw("valid.lat"), Prisma.raw("valid.lon"))} AS distance FROM valid WHERE valid.id IN (${Prisma.join(manualIds.length ? manualIds : ["__none__"])})),
          resolved AS MATERIALIZED (SELECT DISTINCT ON (id) * FROM (SELECT *, 'auto'::text AS source FROM auto UNION ALL SELECT *, 'manual'::text AS source FROM manual) candidates ORDER BY id, CASE source WHEN 'auto' THEN 0 ELSE 1 END)
          SELECT id, name, lat, lon, distance AS "distanceKm", source, (SELECT count FROM invalid) AS "excludedBadCoordinates" FROM resolved
        `));
    return rows.map((row) => ({ ...row, lat: Number(row.lat), lon: Number(row.lon), distanceKm: Number(row.distanceKm), excludedBadCoordinates: Number(row.excludedBadCoordinates) }));
  }

  /** Fact join, product metadata, aggregation, target exclusions, ordering and limit stay in PostgreSQL. */
  async queryGeoProducts(input: RieGeoProductQuery): Promise<RieGeoProductRow[]> {
    if (!input.customerIds.length) return [];
    const allowedRoutes = input.requestingUser ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser) : null;
    const routePredicate = (source: string) => !allowedRoutes ? [] : allowedRoutes.size === 0
      ? [Prisma.sql`FALSE`]
      : [Prisma.sql`${normalizedField({ field: "RouteID", source })} IN (${Prisma.join([...allowedRoutes])})`];
    const invoices = activeEntityRowsCte(input.companyId, "Invoices", "invoice", routePredicate("invoice_source"), [], []);
    const items = activeEntityRowsCte(input.companyId, "Invoice Items", "item", routePredicate("item_source"), [], []);
    const products = activeEntityRowsCte(input.companyId, "Products", "product", [], [], []);
    const invoiceNo = normalizedField({ field: "InvoiceNo", source: "invoice" });
    const itemInvoiceNo = normalizedField({ field: "InvoiceNo", source: "item" });
    const customer = textField({ field: "CustomerCode", source: "invoice" });
    const productCode = textField({ field: "ProductCode", source: "item" });
    const productKey = normalizedField({ field: "ProductCode", source: "item" });
    const productMetaKey = normalizedField({ field: "ProductCode", source: "product" });
    const qty = numericField(textField({ field: "Quantity", source: "item" }));
    const value = numericField(textField({ field: "LineTotal", source: "item" }));
    const rows = await this.runExpensiveQuery("queryGeoProducts", () => this.prisma.$queryRaw<RieGeoProductRow[]>(Prisma.sql`
      WITH ${invoices}, ${items}, ${products},
      product_meta AS MATERIALIZED (SELECT DISTINCT ON (${productMetaKey}) ${productMetaKey} AS sku, BTRIM(COALESCE(${textField({ field: "ProductName", source: "product" })}, ${textField({ field: "ProductCode", source: "product" })}, '')) AS name, NULLIF(BTRIM(COALESCE(${textField({ field: "Category", source: "product" })}, '')), '') AS category FROM product_active product ORDER BY ${productMetaKey}, product."entity_key" DESC),
      joined AS MATERIALIZED (SELECT BTRIM(COALESCE(${customer}, '')) AS customer_id, BTRIM(COALESCE(${productCode}, '')) AS sku, ${qty} AS qty, ${value} AS value FROM item_active item INNER JOIN invoice_active invoice ON ${itemInvoiceNo} = ${invoiceNo} WHERE BTRIM(COALESCE(${customer}, '')) <> ''),
      target_skus AS MATERIALIZED (SELECT DISTINCT sku FROM joined WHERE customer_id = ${input.excludeCustomerId ?? "__none__"} AND sku <> ''),
      totals AS MATERIALIZED (SELECT COUNT(*)::int AS rows FROM joined),
      target_count AS MATERIALIZED (SELECT COUNT(*)::int AS count FROM target_skus)
      SELECT j.sku, COALESCE(meta.name, j.sku) AS name, meta.category AS category,
        COALESCE(SUM(j.qty), 0)::double precision AS "totalQty", COALESCE(SUM(j.value), 0)::double precision AS "totalValue", COUNT(DISTINCT j.customer_id)::int AS "customerCount",
        totals.rows AS "totalRowsConsidered", ${input.excludeCustomerId ? Prisma.sql`target_count.count` : Prisma.sql`NULL::int`} AS "targetProductCount"
      FROM joined j LEFT JOIN product_meta meta ON LOWER(BTRIM(j.sku)) = meta.sku CROSS JOIN totals CROSS JOIN target_count
      WHERE j.customer_id IN (${Prisma.join(input.customerIds)}) AND j.sku <> '' ${input.excludeCustomerId ? Prisma.sql`AND NOT EXISTS (SELECT 1 FROM target_skus WHERE target_skus.sku = j.sku)` : Prisma.empty}
      GROUP BY j.sku, meta.name, meta.category, totals.rows, target_count.count
      ORDER BY "totalValue" DESC
      LIMIT ${input.topProductsLimit}
    `));
    return rows.map((row) => ({ ...row, totalQty: Number(row.totalQty), totalValue: Number(row.totalValue), customerCount: Number(row.customerCount), totalRowsConsidered: Number(row.totalRowsConsidered), targetProductCount: row.targetProductCount === null ? null : Number(row.targetProductCount) }));
  }

  private async activeVersionCounts(companyId: string, entityNames: readonly string[]): Promise<Map<string, number>> {
    const rows = await this.runExpensiveQuery("activeVersionCounts", () => this.prisma.$queryRaw<Array<{ entityName: string; versionCount: bigint | number }>>(Prisma.sql`
      SELECT version."entity_name" AS "entityName", COUNT(*) AS "versionCount"
      FROM "rie_dataset_versions" version
      INNER JOIN "files" source_file ON source_file.id = version."source_file_id"
      WHERE version."company_id" = ${companyId} AND version."entity_name" IN (${Prisma.join(entityNames)})
        AND version."is_active" = TRUE AND source_file."company_id" = ${companyId}
        AND source_file."is_active" = TRUE AND source_file.status = 'READY'
        AND source_file."dataset_type_confirmed" = TRUE
      GROUP BY version."entity_name"
    `));
    return new Map(rows.map(({ entityName, versionCount }) => [entityName, Number(versionCount)]));
  }

  /**
   * Calculates Smart Loading staleness at Route × Product entirely in
   * PostgreSQL, then returns the existing Product-grain screen contract.
   * This deliberately never exposes the high-cardinality intermediate set.
   */
  async queryRouteProductStaleness(input: RieRouteProductStalenessQuery): Promise<RieRouteProductStalenessRow[]> {
    if (!input.companyId?.trim()) throw new Error("RIE route-product staleness requires companyId.");
    const targetDate = normalizeDate(input.targetDate);
    const allowedRoutes = input.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser)
      : null;
    const allowedRouteIds = allowedRoutes
      ? new Set([...allowedRoutes].map((routeId) => routeId.trim().toLowerCase()).filter(Boolean))
      : null;
    const requestedRoutes = input.routeIds === undefined || input.routeIds === null
      ? null
      : new Set(input.routeIds.map((routeId) => routeId.trim().toLowerCase()).filter(Boolean));
    const effectiveRoutes = allowedRouteIds
      ? [...allowedRouteIds].filter((routeId) => requestedRoutes === null || requestedRoutes.has(routeId))
      : requestedRoutes === null ? null : [...requestedRoutes];
    const routeScope = (field: RieQueryField): Prisma.Sql => effectiveRoutes === null
      ? Prisma.empty
      : effectiveRoutes.length
        ? Prisma.sql` AND ${normalizedField(field)} IN (${Prisma.join(effectiveRoutes)})`
        : Prisma.sql` AND FALSE`;
    const inventoryRoute = { field: "RouteID", source: "inventory_source" };
    const inventoryDate = textField({ field: "ReportDate", source: "inventory_source" });
    const invoiceRoute = { field: "RouteID", source: "invoice_source" };
    const invoiceDate = textField({ field: "InvoiceDate", source: "invoice_source" });
    const inventoryCte = activeEntityRowsCte(input.companyId, "Van Inventory", "inventory", [
      Prisma.sql`${dateText(inventoryDate)} <= ${targetDate}${routeScope(inventoryRoute)}`,
    ], [], []);
    const invoiceCte = activeEntityRowsCte(input.companyId, "Invoices", "invoice", [
      Prisma.sql`${dateText(invoiceDate)} <= ${targetDate}${routeScope(invoiceRoute)}`,
    ], [], []);
    const scopedInvoiceNo = normalizedField({ field: "InvoiceNo", source: "invoice" });
    const scopedInvoiceNumbersCte = Prisma.sql`scoped_invoice_numbers AS MATERIALIZED (
      SELECT DISTINCT ${scopedInvoiceNo} AS invoice_no
      FROM invoice_active invoice
      WHERE ${scopedInvoiceNo} <> ''
    )`;
    // InvoiceNo is part of the Invoice Items business key. Restricting rows
    // to the already-scoped invoice keys before newest-version resolution is
    // therefore parity-safe and lets PostgreSQL use the InvoiceNo index.
    const itemsCte = activeEntityRowsCte(input.companyId, "Invoice Items", "item", [], [], [], false, [
      Prisma.sql`INNER JOIN scoped_invoice_numbers scoped_invoice ON ${normalizedField({ field: "InvoiceNo", source: "item_source" })} = scoped_invoice.invoice_no`,
    ]);
    const inventoryRouteText = normalizedField({ field: "RouteID", source: "inventory" });
    const itemRouteText = normalizedField({ field: "RouteID", source: "item" });
    const invoiceRouteText = normalizedField({ field: "RouteID", source: "invoice" });
    const effectiveSaleRoute = Prisma.sql`LOWER(BTRIM(COALESCE(NULLIF(BTRIM(COALESCE(${textField({ field: "RouteID", source: "item" })}, '')), ''), ${textField({ field: "RouteID", source: "invoice" })}, '')))`;
    const inventoryProduct = normalizedField({ field: "ProductCode", source: "inventory" });
    const itemProduct = normalizedField({ field: "ProductCode", source: "item" });
    const inventoryQuantity = numericField(textField({ field: "Quantity", source: "inventory" }));
    const invoiceNo = normalizedField({ field: "InvoiceNo", source: "item" });
    const invoiceJoinNo = normalizedField({ field: "InvoiceNo", source: "invoice" });
    const saleDate = dateText(textField({ field: "InvoiceDate", source: "invoice" }));
    const rows = await this.runExpensiveQuery("queryRouteProductStaleness", () => this.prisma.$queryRaw<RieRouteProductStalenessRow[]>(Prisma.sql`
      WITH ${inventoryCte}, ${invoiceCte}, ${scopedInvoiceNumbersCte}, ${itemsCte},
      inventory_latest AS MATERIALIZED (
        SELECT ${inventoryRouteText} AS route_id, MAX(NULLIF(BTRIM(COALESCE(${textField({ field: "ReportDate", source: "inventory" })}, '')), '')) AS report_date
        FROM inventory_active inventory
        GROUP BY ${inventoryRouteText}
      ),
      inventory_by_route_product AS MATERIALIZED (
        SELECT ${inventoryRouteText} AS route_id, ${inventoryProduct} AS product_code, SUM(${inventoryQuantity})::double precision AS quantity
        FROM inventory_active inventory
        INNER JOIN inventory_latest latest ON latest.route_id = ${inventoryRouteText}
          AND NULLIF(BTRIM(COALESCE(${textField({ field: "ReportDate", source: "inventory" })}, '')), '') = latest.report_date
        GROUP BY ${inventoryRouteText}, ${inventoryProduct}
      ),
      sales_by_route_product AS MATERIALIZED (
        SELECT ${effectiveSaleRoute} AS route_id, ${itemProduct} AS product_code, MAX(${saleDate}) AS last_sale_date
        FROM item_active item
        INNER JOIN invoice_active invoice ON ${invoiceNo} = ${invoiceJoinNo}
        INNER JOIN (SELECT DISTINCT route_id FROM inventory_by_route_product) stocked_routes ON stocked_routes.route_id = ${effectiveSaleRoute}
        WHERE ${itemProduct} <> ''
        GROUP BY ${effectiveSaleRoute}, ${itemProduct}
      ),
      route_stale AS MATERIALIZED (
        SELECT inventory.route_id, inventory.product_code, inventory.quantity, sales.last_sale_date,
          (inventory.quantity > 0 AND sales.last_sale_date IS NOT NULL AND (${targetDate}::date - sales.last_sale_date::date) > ${input.staleDaysThreshold}) AS is_stale
        FROM inventory_by_route_product inventory
        LEFT JOIN sales_by_route_product sales ON sales.route_id = inventory.route_id AND sales.product_code = inventory.product_code
      )
      SELECT product_code AS "productCode", SUM(quantity)::double precision AS quantity,
        MAX(last_sale_date) AS "lastSaleDate", BOOL_OR(is_stale) AS "isStale",
        SUM(COUNT(*) FILTER (WHERE is_stale)) OVER ()::double precision AS "staleRouteProductCount",
        COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
          'routeId', route_id,
          'currentVehicleStock', quantity,
          'lastSaleDate', last_sale_date
        ) ORDER BY route_id) FILTER (WHERE is_stale), '[]'::jsonb) AS "staleRouteProducts"
      FROM route_stale
      GROUP BY product_code
      ORDER BY product_code
    `));
    return rows;
  }

  /**
   * Builds the management vehicle-monitor table from current Van Inventory.
   * Route × Product is computed in PostgreSQL; only a small Product rollup
   * crosses the RIE boundary. Inventory is intentionally the driving set.
   */
  async queryManagementVehicleProducts(input: RieManagementVehicleProductsQuery): Promise<RieManagementVehicleProductRow[]> {
    if (!input.companyId?.trim()) throw new Error("RIE management vehicle products requires companyId.");
    const targetDate = normalizeDate(input.targetDate);
    const salesFrom = normalizeDate(input.salesFrom);
    const salesTo = normalizeDate(input.salesTo);
    const allowedRoutes = input.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser)
      : null;
    const allowedRouteIds = allowedRoutes
      ? new Set([...allowedRoutes].map((routeId) => routeId.trim().toLowerCase()).filter(Boolean))
      : null;
    const requestedRoutes = input.routeIds === undefined || input.routeIds === null
      ? null
      : new Set(input.routeIds.map((routeId) => routeId.trim().toLowerCase()).filter(Boolean));
    const effectiveRoutes = allowedRouteIds
      ? [...allowedRouteIds].filter((routeId) => requestedRoutes === null || requestedRoutes.has(routeId))
      : requestedRoutes === null ? null : [...requestedRoutes];
    const customerCodes = [...new Set(input.customerCodes.map((code) => code.trim().toLowerCase()).filter(Boolean))];
    const routeScope = (field: RieQueryField): Prisma.Sql => effectiveRoutes === null
      ? Prisma.empty
      : effectiveRoutes.length
        ? Prisma.sql` AND ${normalizedField(field)} IN (${Prisma.join(effectiveRoutes)})`
        : Prisma.sql` AND FALSE`;
    const inventoryCte = activeEntityRowsCte(input.companyId, "Van Inventory", "inventory", [
      Prisma.sql`${dateText(textField({ field: "ReportDate", source: "inventory_source" }))} <= ${targetDate}${routeScope({ field: "RouteID", source: "inventory_source" })}`,
    ], [], []);
    const invoiceCte = activeEntityRowsCte(input.companyId, "Invoices", "invoice", [
      Prisma.sql`${dateText(textField({ field: "InvoiceDate", source: "invoice_source" }))} >= ${salesFrom} AND ${dateText(textField({ field: "InvoiceDate", source: "invoice_source" }))} <= ${salesTo}${routeScope({ field: "RouteID", source: "invoice_source" })}${customerCodes.length ? Prisma.sql` AND ${normalizedField({ field: "CustomerCode", source: "invoice_source" })} IN (${Prisma.join(customerCodes)})` : Prisma.sql` AND FALSE`}`,
    ], [], []);
    const itemsCte = activeEntityRowsCte(input.companyId, "Invoice Items", "item", [], [], []);
    const inventoryRoute = normalizedField({ field: "RouteID", source: "inventory" });
    const inventoryProduct = normalizedField({ field: "ProductCode", source: "inventory" });
    const inventoryQuantity = numericField(textField({ field: "Quantity", source: "inventory" }));
    const itemProduct = normalizedField({ field: "ProductCode", source: "item" });
    const itemQuantity = numericField(textField({ field: "Quantity", source: "item" }));
    const invoiceNo = normalizedField({ field: "InvoiceNo", source: "item" });
    const invoiceJoinNo = normalizedField({ field: "InvoiceNo", source: "invoice" });
    const effectiveSaleRoute = Prisma.sql`LOWER(BTRIM(COALESCE(NULLIF(BTRIM(COALESCE(${textField({ field: "RouteID", source: "item" })}, '')), ''), ${textField({ field: "RouteID", source: "invoice" })}, '')))`;
    return this.runExpensiveQuery("queryManagementVehicleProducts", () => this.prisma.$queryRaw<RieManagementVehicleProductRow[]>(Prisma.sql`
      WITH ${inventoryCte}, ${invoiceCte}, ${itemsCte},
      inventory_latest AS MATERIALIZED (
        SELECT ${inventoryRoute} AS route_id, MAX(NULLIF(BTRIM(COALESCE(${textField({ field: "ReportDate", source: "inventory" })}, '')), '')) AS report_date
        FROM inventory_active inventory
        GROUP BY ${inventoryRoute}
      ),
      stock_by_route_product AS MATERIALIZED (
        SELECT ${inventoryRoute} AS route_id, ${inventoryProduct} AS product_code, SUM(${inventoryQuantity})::double precision AS current_stock
        FROM inventory_active inventory
        INNER JOIN inventory_latest latest ON latest.route_id = ${inventoryRoute}
          AND NULLIF(BTRIM(COALESCE(${textField({ field: "ReportDate", source: "inventory" })}, '')), '') = latest.report_date
        WHERE ${inventoryProduct} <> ''
        GROUP BY ${inventoryRoute}, ${inventoryProduct}
      ),
      sales_by_route_product AS MATERIALIZED (
        SELECT ${effectiveSaleRoute} AS route_id, ${itemProduct} AS product_code, SUM(${itemQuantity})::double precision / 12.0 AS weekly_average_sales
        FROM item_active item
        INNER JOIN invoice_active invoice ON ${invoiceNo} = ${invoiceJoinNo}
        WHERE ${itemProduct} <> '' AND ${effectiveSaleRoute} <> ''
        GROUP BY ${effectiveSaleRoute}, ${itemProduct}
      ),
      vehicle_product AS MATERIALIZED (
        SELECT COALESCE(stock.route_id, sales.route_id) AS route_id,
          COALESCE(stock.product_code, sales.product_code) AS product_code,
          COALESCE(stock.current_stock, 0)::double precision AS current_stock,
          COALESCE(sales.weekly_average_sales, 0)::double precision AS weekly_average_sales
        FROM stock_by_route_product stock
        FULL OUTER JOIN sales_by_route_product sales ON sales.route_id = stock.route_id AND sales.product_code = stock.product_code
      )
      SELECT product_code AS "productCode", SUM(current_stock)::double precision AS "currentVehicleStock",
        SUM(weekly_average_sales)::double precision AS "weeklyAverageSales",
        CASE
          WHEN COALESCE(SUM(weekly_average_sales), 0) = 0 THEN 100::double precision
          ELSE LEAST(100::double precision, (SUM(LEAST(current_stock, weekly_average_sales)) / SUM(weekly_average_sales)) * 100)
        END AS "alignmentPercent"
      FROM vehicle_product
      GROUP BY product_code
      ORDER BY product_code
    `));
  }

  /** Current Vehicle Stock is the approved actual-loaded quantity for Loading Risk. */
  async queryManagementLoadingRisk(input: RieManagementLoadingRiskQuery): Promise<RieManagementLoadingRiskRow> {
    if (!input.companyId?.trim()) throw new Error("RIE management loading risk requires companyId.");
    const targetDate = normalizeDate(input.targetDate), salesFrom = normalizeDate(input.salesFrom), salesTo = normalizeDate(input.salesTo);
    const allowed = input.requestingUser ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser) : null;
    const routes = allowed ? [...allowed].map((value) => value.trim().toLowerCase()).filter(Boolean) : null;
    const routeScope = (field: RieQueryField) => routes === null ? Prisma.empty : routes.length ? Prisma.sql` AND ${normalizedField(field)} IN (${Prisma.join(routes)})` : Prisma.sql` AND FALSE`;
    const inventoryCte = activeEntityRowsCte(input.companyId, "Van Inventory", "inventory", [Prisma.sql`${dateText(textField({ field: "ReportDate", source: "inventory_source" }))} <= ${targetDate}${routeScope({ field: "RouteID", source: "inventory_source" })}`], [], []);
    const invoiceCte = activeEntityRowsCte(input.companyId, "Invoices", "invoice", [Prisma.sql`${dateText(textField({ field: "InvoiceDate", source: "invoice_source" }))} >= ${salesFrom} AND ${dateText(textField({ field: "InvoiceDate", source: "invoice_source" }))} <= ${salesTo}${routeScope({ field: "RouteID", source: "invoice_source" })}`], [], []);
    const itemsCte = activeEntityRowsCte(input.companyId, "Invoice Items", "item", [], [], []);
    // Company Admin has no restricted route set. Do not pass an empty SQL
    // fragment as a predicate, otherwise the active Route CTE compiles to a
    // dangling `AND` and PostgreSQL rejects the query.
    // activeEntityRowsCte joins its predicates with `AND`, whereas routeScope
    // is intentionally an inline suffix for the inventory/invoice predicates
    // above (and therefore already starts with `AND`). Build the Routes CTE
    // predicate independently so a scoped user never generates `AND AND`.
    const routePredicates = routes === null
      ? []
      : routes.length
        ? [Prisma.sql`${normalizedField({ field: "RouteID", source: "route_source" })} IN (${Prisma.join(routes)})`]
        : [Prisma.sql`FALSE`];
    const routesCte = activeEntityRowsCte(input.companyId, "Routes", "route", routePredicates, [], []);
    const repCte = activeEntityRowsCte(input.companyId, "Employees", "rep", [], [], []), supervisorCte = activeEntityRowsCte(input.companyId, "Employees", "supervisor", [], [], []), managerCte = activeEntityRowsCte(input.companyId, "Employees", "manager", [], [], []), productCte = activeEntityRowsCte(input.companyId, "Products", "product", [], [], []);
    const invRoute = normalizedField({ field: "RouteID", source: "inventory" }), invProduct = normalizedField({ field: "ProductCode", source: "inventory" }), invQuantity = numericField(textField({ field: "Quantity", source: "inventory" }));
    const itemProduct = normalizedField({ field: "ProductCode", source: "item" }), itemQuantity = numericField(textField({ field: "Quantity", source: "item" })), itemInvoice = normalizedField({ field: "InvoiceNo", source: "item" }), invoiceNo = normalizedField({ field: "InvoiceNo", source: "invoice" });
    const saleRoute = Prisma.sql`LOWER(BTRIM(COALESCE(NULLIF(BTRIM(COALESCE(${textField({ field: "RouteID", source: "item" })}, '')), ''), ${textField({ field: "RouteID", source: "invoice" })}, '')))`;
    const routeId = normalizedField({ field: "RouteID", source: "route" }), routeRep = normalizedField({ field: "SalesRepID", source: "route" }), routeSupervisor = normalizedField({ field: "SupervisorID", source: "route" }), routeManager = normalizedField({ field: "ManagerID", source: "route" }), repId = normalizedField({ field: "EmployeeID", source: "rep" }), supervisorId = normalizedField({ field: "EmployeeID", source: "supervisor" }), managerId = normalizedField({ field: "EmployeeID", source: "manager" });
    const person = input.personLevel === "manager" ? { id: managerId, name: textField({ field: "EmployeeName", source: "manager" }) } : input.personLevel === "supervisor" ? { id: supervisorId, name: textField({ field: "EmployeeName", source: "supervisor" }) } : { id: repId, name: textField({ field: "EmployeeName", source: "rep" }) };
    const productCode = normalizedField({ field: "ProductCode", source: "product" }), productName = textField({ field: "ProductName", source: "product" });
    const rows = await this.runExpensiveQuery("queryManagementLoadingRisk", () => this.prisma.$queryRaw<RieManagementLoadingRiskRow[]>(Prisma.sql`
      WITH ${inventoryCte}, ${invoiceCte}, ${itemsCte}, ${routesCte}, ${repCte}, ${supervisorCte}, ${managerCte}, ${productCte},
      latest_inventory AS MATERIALIZED (SELECT ${invRoute} route_id, MAX(NULLIF(BTRIM(COALESCE(${textField({ field: "ReportDate", source: "inventory" })}, '')), '')) report_date FROM inventory_active inventory GROUP BY ${invRoute}),
      stock AS MATERIALIZED (SELECT ${invRoute} route_id, ${invProduct} product_code, SUM(${invQuantity})::double precision current_stock FROM inventory_active inventory INNER JOIN latest_inventory latest ON latest.route_id=${invRoute} AND NULLIF(BTRIM(COALESCE(${textField({ field: "ReportDate", source: "inventory" })}, '')), '')=latest.report_date WHERE ${invProduct}<>'' GROUP BY ${invRoute}, ${invProduct}),
      demand AS MATERIALIZED (SELECT ${saleRoute} route_id, ${itemProduct} product_code, (SUM(${itemQuantity})/12.0)::double precision expected_demand FROM item_active item INNER JOIN invoice_active invoice ON ${itemInvoice}=${invoiceNo} WHERE ${itemProduct}<>'' AND ${saleRoute}<>'' GROUP BY ${saleRoute}, ${itemProduct}),
      people AS MATERIALIZED (
        SELECT DISTINCT ${routeId} route_id, ${person.id} employee_id,
          COALESCE(NULLIF(BTRIM(COALESCE(${person.name}, '')), ''), ${person.id}) employee_name
        FROM route_active route
        INNER JOIN rep_active rep ON ${routeRep}=${repId}
        LEFT JOIN supervisor_active supervisor ON COALESCE(NULLIF(${routeSupervisor}, ''), ${normalizedField({ field: "DirectManagerID", source: "rep" })})=${supervisorId}
        LEFT JOIN manager_active manager ON COALESCE(NULLIF(${routeManager}, ''), ${normalizedField({ field: "DirectManagerID", source: "supervisor" })})=${managerId}
        WHERE ${person.id}<>''
      ),
      scope_debug AS MATERIALIZED (
        SELECT COUNT(DISTINCT employee_id)::integer direct_reports_count FROM people
      ),
      route_scope_debug AS MATERIALIZED (
        SELECT COUNT(DISTINCT ${routeId})::integer route_count FROM route_active route
      ),
      risk AS MATERIALIZED (SELECT people.employee_id, people.employee_name, people.route_id, demand.product_code, demand.expected_demand, COALESCE(stock.current_stock,0)::double precision current_stock FROM people INNER JOIN demand ON demand.route_id=people.route_id LEFT JOIN stock ON stock.route_id=demand.route_id AND stock.product_code=demand.product_code WHERE demand.expected_demand>COALESCE(stock.current_stock,0)),
      risk_debug AS MATERIALIZED (
        SELECT COUNT(*)::integer loading_risk_rows_before_aggregation FROM risk
      ),
      product_names AS MATERIALIZED (SELECT DISTINCT ON (${productCode}) ${productCode} product_code, NULLIF(BTRIM(COALESCE(${productName}, '')), '') product_name FROM product_active product WHERE ${productCode}<>'' ORDER BY ${productCode}, product."entity_key" DESC),
      route_result AS MATERIALIZED (SELECT risk.employee_id, risk.employee_name, risk.route_id, COUNT(*)::integer affected_product_count, JSONB_AGG(JSONB_BUILD_OBJECT('productCode',risk.product_code,'productName',COALESCE(names.product_name,risk.product_code),'expectedDemand',risk.expected_demand,'currentVehicleStock',risk.current_stock,'quantityGap',risk.expected_demand-risk.current_stock) ORDER BY risk.expected_demand-risk.current_stock DESC,risk.product_code) products FROM risk LEFT JOIN product_names names ON names.product_code=risk.product_code GROUP BY risk.employee_id,risk.employee_name,risk.route_id),
      person_result AS MATERIALIZED (SELECT employee_id,employee_name,COUNT(*)::integer affected_route_count,SUM(affected_product_count)::integer affected_product_count,JSONB_AGG(JSONB_BUILD_OBJECT('routeId',route_id,'products',products) ORDER BY route_id) routes FROM route_result GROUP BY employee_id,employee_name),
      person_json AS MATERIALIZED (
        SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT('employeeId',employee_id,'employeeName',employee_name,'affectedRouteCount',affected_route_count,'affectedProductCount',affected_product_count,'routes',routes) ORDER BY employee_name,employee_id),'[]'::jsonb) people
        FROM person_result
      )
      SELECT person_json.people,
        JSONB_BUILD_OBJECT('directReportsCount',scope_debug.direct_reports_count,'routeCount',route_scope_debug.route_count,'loadingRiskRowsBeforeAggregation',risk_debug.loading_risk_rows_before_aggregation) debug
      FROM person_json CROSS JOIN scope_debug CROSS JOIN route_scope_debug CROSS JOIN risk_debug
    `));
    return rows[0] ?? { people: [] };
  }

  /**
   * Management result for Smart Loading Lost Opportunities. This keeps the
   * established Sales Rep definition in PostgreSQL at Customer × Product ×
   * Route grain, then adds the existing management person roll-up without
   * reading or joining raw facts in Node.
   */
  async queryManagementLostOpportunities(input: RieManagementLostOpportunitiesQuery): Promise<RieManagementLostOpportunitiesResult> {
    if (!input.companyId?.trim()) throw new Error("RIE management lost opportunities requires companyId.");
    const targetDate = normalizeDate(input.targetDate);
    const baselineFrom = normalizeDate(input.baselineFrom);
    const baselineTo = normalizeDate(input.baselineTo);
    const recentFrom = normalizeDate(input.recentFrom);
    const recentTo = normalizeDate(input.recentTo);
    const page = normalizePagination(input.pagination, false);
    const allowed = input.requestingUser ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser) : null;
    const routes = allowed ? [...allowed].map((value) => value.trim().toLowerCase()).filter(Boolean) : null;
    const requestedRoutes = input.routeIds === undefined || input.routeIds === null
      ? null
      : new Set(input.routeIds.map((value) => value.trim().toLowerCase()).filter(Boolean));
    const effectiveRoutes = routes === null
      ? requestedRoutes === null ? null : [...requestedRoutes]
      : requestedRoutes === null ? routes : routes.filter((routeId) => requestedRoutes.has(routeId));
    const visitDays = [...new Set(input.visitDays.map((value) => value.trim().toLowerCase()).filter(Boolean))];
    const routeScope = (field: RieQueryField) => effectiveRoutes === null ? Prisma.empty : effectiveRoutes.length ? Prisma.sql` AND ${normalizedField(field)} IN (${Prisma.join(effectiveRoutes)})` : Prisma.sql` AND FALSE`;
    const routePredicates = effectiveRoutes === null
      ? []
      : effectiveRoutes.length
        ? [Prisma.sql`${normalizedField({ field: "RouteID", source: "route_source" })} IN (${Prisma.join(effectiveRoutes)})`]
        : [Prisma.sql`FALSE`];
    const customerPredicates = visitDays.length
      ? [Prisma.sql`${normalizedField({ field: "VisitDay", source: "customer_source" })} IN (${Prisma.join(visitDays)})${routeScope({ field: "RouteID", source: "customer_source" })}`]
      : [Prisma.sql`FALSE`];
    const customerCte = activeEntityRowsCte(input.companyId, "Customers", "customer", customerPredicates, [], []);
    const invoiceCte = activeEntityRowsCte(input.companyId, "Invoices", "invoice", [Prisma.sql`${dateText(textField({ field: "InvoiceDate", source: "invoice_source" }))} >= ${baselineFrom} AND ${dateText(textField({ field: "InvoiceDate", source: "invoice_source" }))} <= ${recentTo}${routeScope({ field: "RouteID", source: "invoice_source" })}`], [], []);
    const itemCte = activeEntityRowsCte(input.companyId, "Invoice Items", "item", [], [], []);
    const returnsCte = activeEntityRowsCte(input.companyId, "Returns", "returned", [Prisma.sql`${dateText(textField({ field: "ReturnDate", source: "returned_source" }))} >= ${baselineFrom} AND ${dateText(textField({ field: "ReturnDate", source: "returned_source" }))} <= ${recentTo}${routeScope({ field: "RouteID", source: "returned_source" })}`], [], []);
    const returnItemsCte = activeEntityRowsCte(input.companyId, "Return Items", "return_item", [], [], []);
    const inventoryCte = activeEntityRowsCte(input.companyId, "Van Inventory", "inventory", [Prisma.sql`${dateText(textField({ field: "ReportDate", source: "inventory_source" }))} <= ${targetDate}${routeScope({ field: "RouteID", source: "inventory_source" })}`], [], []);
    const routesCte = activeEntityRowsCte(input.companyId, "Routes", "route", routePredicates, [], []);
    const repCte = activeEntityRowsCte(input.companyId, "Employees", "rep", [], [], []);
    const supervisorCte = activeEntityRowsCte(input.companyId, "Employees", "supervisor", [], [], []);
    const managerCte = activeEntityRowsCte(input.companyId, "Employees", "manager", [], [], []);
    const productCte = activeEntityRowsCte(input.companyId, "Products", "product", [], [], []);
    const customerCode = normalizedField({ field: "CustomerCode", source: "customer" });
    const customerRoute = normalizedField({ field: "RouteID", source: "customer" });
    const invoiceCustomer = normalizedField({ field: "CustomerCode", source: "invoice" });
    const invoiceRoute = normalizedField({ field: "RouteID", source: "invoice" });
    const invoiceNo = normalizedField({ field: "InvoiceNo", source: "invoice" });
    const invoiceDate = dateText(textField({ field: "InvoiceDate", source: "invoice" }));
    const invoiceStatus = normalizedField({ field: "InvoiceStatus", source: "invoice" });
    const itemInvoiceNo = normalizedField({ field: "InvoiceNo", source: "item" });
    const itemProduct = normalizedField({ field: "ProductCode", source: "item" });
    const itemQuantity = numericField(textField({ field: "Quantity", source: "item" }));
    const returnCustomer = normalizedField({ field: "CustomerCode", source: "returned" });
    const returnRoute = normalizedField({ field: "RouteID", source: "returned" });
    const returnNo = normalizedField({ field: "ReturnNo", source: "returned" });
    const returnDate = dateText(textField({ field: "ReturnDate", source: "returned" }));
    const returnStatus = normalizedField({ field: "Status", source: "returned" });
    const returnItemNo = normalizedField({ field: "ReturnNo", source: "return_item" });
    const returnItemProduct = normalizedField({ field: "ProductCode", source: "return_item" });
    const returnItemQuantity = numericField(textField({ field: "Quantity", source: "return_item" }));
    const inventoryRoute = normalizedField({ field: "RouteID", source: "inventory" });
    const inventoryProduct = normalizedField({ field: "ProductCode", source: "inventory" });
    const inventoryQuantity = numericField(textField({ field: "Quantity", source: "inventory" }));
    const routeId = normalizedField({ field: "RouteID", source: "route" });
    const routeRep = normalizedField({ field: "SalesRepID", source: "route" });
    const routeSupervisor = normalizedField({ field: "SupervisorID", source: "route" });
    const routeManager = normalizedField({ field: "ManagerID", source: "route" });
    const repId = normalizedField({ field: "EmployeeID", source: "rep" });
    const supervisorId = normalizedField({ field: "EmployeeID", source: "supervisor" });
    const managerId = normalizedField({ field: "EmployeeID", source: "manager" });
    const person = input.personLevel === "manager"
      ? { id: managerId, name: textField({ field: "EmployeeName", source: "manager" }) }
      : input.personLevel === "supervisor"
        ? { id: supervisorId, name: textField({ field: "EmployeeName", source: "supervisor" }) }
        : { id: repId, name: textField({ field: "EmployeeName", source: "rep" }) };
    const productCode = normalizedField({ field: "ProductCode", source: "product" });
    const rawRows = await this.runExpensiveQuery("queryManagementLostOpportunities", () => this.prisma.$queryRaw<Array<{
      affectedPersonCount: number;
      affectedRouteCount: number;
      lostOpportunityCount: number;
      hasMore: boolean;
      rows: RieManagementLostOpportunityRow[];
      topPeople: RieManagementLostOpportunitiesResult["topPeople"];
    }>>(Prisma.sql`
      WITH ${customerCte}, ${invoiceCte}, ${itemCte}, ${returnsCte}, ${returnItemsCte}, ${inventoryCte}, ${routesCte}, ${repCte}, ${supervisorCte}, ${managerCte}, ${productCte},
      scheduled_customers AS MATERIALIZED (
        SELECT DISTINCT ON (${customerCode}) ${customerCode} customer_code, ${customerRoute} route_id,
          COALESCE(NULLIF(BTRIM(COALESCE(${textField({ field: "CustomerName", source: "customer" })}, '')), ''), ${customerCode}) customer_name
        FROM customer_active customer
        WHERE ${customerCode}<>'' AND ${customerRoute}<>''
        ORDER BY ${customerCode}, customer."entity_key" DESC
      ),
      sales AS MATERIALIZED (
        SELECT ${invoiceRoute} route_id, ${invoiceCustomer} customer_code, ${itemProduct} product_code,
          SUM(CASE WHEN ${invoiceDate} BETWEEN ${baselineFrom} AND ${baselineTo} THEN ${itemQuantity} ELSE 0 END)::double precision baseline_sales,
          SUM(CASE WHEN ${invoiceDate} BETWEEN ${recentFrom} AND ${recentTo} THEN ${itemQuantity} ELSE 0 END)::double precision recent_sales
        FROM item_active item
        INNER JOIN invoice_active invoice ON ${itemInvoiceNo}=${invoiceNo}
        WHERE ${invoiceRoute}<>'' AND ${invoiceCustomer}<>'' AND ${itemProduct}<>'' AND ${invoiceStatus} IN ('confirmed', 'posted')
        GROUP BY ${invoiceRoute}, ${invoiceCustomer}, ${itemProduct}
      ),
      returned AS MATERIALIZED (
        SELECT ${returnRoute} route_id, ${returnCustomer} customer_code, ${returnItemProduct} product_code,
          SUM(CASE WHEN ${returnDate} BETWEEN ${baselineFrom} AND ${baselineTo} THEN ${returnItemQuantity} ELSE 0 END)::double precision baseline_returns,
          SUM(CASE WHEN ${returnDate} BETWEEN ${recentFrom} AND ${recentTo} THEN ${returnItemQuantity} ELSE 0 END)::double precision recent_returns
        FROM return_item_active return_item
        INNER JOIN returned_active returned ON ${returnItemNo}=${returnNo}
        WHERE ${returnRoute}<>'' AND ${returnCustomer}<>'' AND ${returnItemProduct}<>'' AND ${returnStatus} IN ('confirmed', 'approved')
        GROUP BY ${returnRoute}, ${returnCustomer}, ${returnItemProduct}
      ),
      net AS MATERIALIZED (
        SELECT COALESCE(sales.route_id, returned.route_id) route_id, COALESCE(sales.customer_code, returned.customer_code) customer_code,
          COALESCE(sales.product_code, returned.product_code) product_code,
          (COALESCE(sales.baseline_sales, 0) - COALESCE(returned.baseline_returns, 0))::double precision baseline_net_quantity,
          (COALESCE(sales.recent_sales, 0) - COALESCE(returned.recent_returns, 0))::double precision recent_net_quantity
        FROM sales FULL OUTER JOIN returned ON sales.route_id=returned.route_id AND sales.customer_code=returned.customer_code AND sales.product_code=returned.product_code
      ),
      latest_inventory AS MATERIALIZED (
        SELECT ${inventoryRoute} route_id, MAX(NULLIF(BTRIM(COALESCE(${textField({ field: "ReportDate", source: "inventory" })}, '')), '')) report_date
        FROM inventory_active inventory GROUP BY ${inventoryRoute}
      ),
      stock AS MATERIALIZED (
        SELECT ${inventoryRoute} route_id, ${inventoryProduct} product_code, SUM(${inventoryQuantity})::double precision current_stock
        FROM inventory_active inventory
        INNER JOIN latest_inventory latest ON latest.route_id=${inventoryRoute} AND NULLIF(BTRIM(COALESCE(${textField({ field: "ReportDate", source: "inventory" })}, '')), '')=latest.report_date
        WHERE ${inventoryProduct}<>'' GROUP BY ${inventoryRoute}, ${inventoryProduct}
      ),
      people AS MATERIALIZED (
        SELECT DISTINCT ${routeId} route_id, ${person.id} employee_id,
          COALESCE(NULLIF(BTRIM(COALESCE(${person.name}, '')), ''), ${person.id}) employee_name
        FROM route_active route
        INNER JOIN rep_active rep ON ${routeRep}=${repId}
        LEFT JOIN supervisor_active supervisor ON COALESCE(NULLIF(${routeSupervisor}, ''), ${normalizedField({ field: "DirectManagerID", source: "rep" })})=${supervisorId}
        LEFT JOIN manager_active manager ON COALESCE(NULLIF(${routeManager}, ''), ${normalizedField({ field: "DirectManagerID", source: "supervisor" })})=${managerId}
        WHERE ${person.id}<>''
      ),
      product_names AS MATERIALIZED (
        SELECT DISTINCT ON (${productCode}) ${productCode} product_code,
          COALESCE(NULLIF(BTRIM(COALESCE(${textField({ field: "ProductName", source: "product" })}, '')), ''), ${productCode}) product_name,
          NULLIF(BTRIM(COALESCE(${textField({ field: "Category", source: "product" })}, '')), '') category
        FROM product_active product WHERE ${productCode}<>'' ORDER BY ${productCode}, product."entity_key" DESC
      ),
      opportunities AS MATERIALIZED (
        SELECT people.employee_id "responsibleEmployeeId", people.employee_name "responsibleEmployeeName", scheduled_customers.route_id "routeId",
          scheduled_customers.customer_code "customerCode", scheduled_customers.customer_name "customerName", net.product_code "productCode",
          COALESCE(product_names.product_name, net.product_code) "productName", product_names.category "category",
          net.baseline_net_quantity "baselineNetQuantity", net.recent_net_quantity "recentNetQuantity",
          ROUND(net.baseline_net_quantity / 3.0)::double precision "suggestedQuantity"
        FROM net
        INNER JOIN scheduled_customers ON scheduled_customers.route_id=net.route_id AND scheduled_customers.customer_code=net.customer_code
        INNER JOIN people ON people.route_id=scheduled_customers.route_id
        LEFT JOIN product_names ON product_names.product_code=net.product_code
        WHERE net.baseline_net_quantity > 0 AND net.recent_net_quantity = 0
          AND ROUND(net.baseline_net_quantity / 3.0) > 0
      ),
      route_product_opportunities AS MATERIALIZED (
        SELECT "responsibleEmployeeId", "responsibleEmployeeName", "routeId", "productCode", MAX("productName") "productName", MAX("category") "category",
          SUM("suggestedQuantity")::double precision "opportunityQuantity"
        FROM opportunities
        GROUP BY "responsibleEmployeeId", "responsibleEmployeeName", "routeId", "productCode"
      ),
      risks AS MATERIALIZED (
        SELECT opportunity."responsibleEmployeeId", opportunity."responsibleEmployeeName", opportunity."routeId", opportunity."productCode", opportunity."productName", opportunity."category",
          opportunity."opportunityQuantity", COALESCE(stock.current_stock, 0)::double precision "currentVanStock",
          (opportunity."opportunityQuantity" - COALESCE(stock.current_stock, 0))::double precision gap
        FROM route_product_opportunities opportunity
        LEFT JOIN stock ON stock.route_id=opportunity."routeId" AND stock.product_code=opportunity."productCode"
        WHERE opportunity."opportunityQuantity" > COALESCE(stock.current_stock, 0)
      ),
      summary AS MATERIALIZED (
        SELECT COUNT(*)::integer "lostOpportunityCount", COUNT(DISTINCT "routeId")::integer "affectedRouteCount", COUNT(DISTINCT "responsibleEmployeeId")::integer "affectedPersonCount"
        FROM risks
      ),
      top_people AS MATERIALIZED (
        SELECT "responsibleEmployeeId", "responsibleEmployeeName", COUNT(*)::integer "lostOpportunityCount",
          SUM(gap)::double precision gap
        FROM risks
        GROUP BY "responsibleEmployeeId", "responsibleEmployeeName"
        ORDER BY gap DESC, "lostOpportunityCount" DESC, "responsibleEmployeeName", "responsibleEmployeeId"
        LIMIT 4
      ),
      page_window AS MATERIALIZED (
        SELECT *, ROW_NUMBER() OVER (ORDER BY gap DESC, "opportunityQuantity" DESC, "responsibleEmployeeName", "responsibleEmployeeId", "routeId", "productName", "productCode") row_number
        FROM risks
        ORDER BY gap DESC, "opportunityQuantity" DESC, "responsibleEmployeeName", "responsibleEmployeeId", "routeId", "productName", "productCode"
        LIMIT ${page.limit + 1} OFFSET ${page.offset}
      ),
      page_result AS MATERIALIZED (
        SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
          'responsibleEmployeeId', "responsibleEmployeeId", 'responsibleEmployeeName', "responsibleEmployeeName", 'routeId', "routeId",
          'productCode', "productCode", 'productName', "productName", 'category', "category",
          'opportunityQuantity', "opportunityQuantity", 'currentVanStock', "currentVanStock", 'gap', gap
        ) ORDER BY row_number) FILTER (WHERE row_number <= ${page.limit}), '[]'::jsonb) rows,
        COALESCE(BOOL_OR(row_number > ${page.limit}), FALSE) "hasMore"
        FROM page_window
      ),
      top_people_result AS MATERIALIZED (
        SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
          'responsibleEmployeeId', "responsibleEmployeeId", 'responsibleEmployeeName', "responsibleEmployeeName",
          'lostOpportunityCount', "lostOpportunityCount", 'gap', gap
        ) ORDER BY gap DESC, "lostOpportunityCount" DESC, "responsibleEmployeeName", "responsibleEmployeeId"), '[]'::jsonb) "topPeople"
        FROM top_people
      )
      SELECT summary."affectedPersonCount", summary."affectedRouteCount", summary."lostOpportunityCount", page_result."hasMore", page_result.rows, top_people_result."topPeople"
      FROM summary CROSS JOIN page_result CROSS JOIN top_people_result
    `));
    const result = rawRows[0];
    return {
      affectedPersonCount: Number(result?.affectedPersonCount ?? 0),
      affectedRouteCount: Number(result?.affectedRouteCount ?? 0),
      lostOpportunityCount: Number(result?.lostOpportunityCount ?? 0),
      topPeople: Array.isArray(result?.topPeople) ? result.topPeople : [],
      page: { ...page, hasMore: Boolean(result?.hasMore) },
      rows: Array.isArray(result?.rows) ? result.rows : [],
    };
  }

  /**
   * Calculates management stock alignment as Route × Product first, so a
   * surplus on one route cannot cover a shortage on another route.
   */
  async queryManagementStockAlignment(input: RieManagementStockAlignmentQuery): Promise<RieManagementStockAlignmentRow> {
    if (!input.companyId?.trim()) throw new Error("RIE management stock alignment requires companyId.");
    const targetDate = normalizeDate(input.targetDate);
    const salesFrom = normalizeDate(input.salesFrom);
    const salesTo = normalizeDate(input.salesTo);
    const allowedRoutes = input.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser)
      : null;
    const allowedRouteIds = allowedRoutes
      ? new Set([...allowedRoutes].map((routeId) => routeId.trim().toLowerCase()).filter(Boolean))
      : null;
    const requestedRoutes = input.routeIds === undefined || input.routeIds === null
      ? null
      : new Set(input.routeIds.map((routeId) => routeId.trim().toLowerCase()).filter(Boolean));
    const effectiveRoutes = allowedRouteIds
      ? [...allowedRouteIds].filter((routeId) => requestedRoutes === null || requestedRoutes.has(routeId))
      : requestedRoutes === null ? null : [...requestedRoutes];
    const routeScope = (field: RieQueryField): Prisma.Sql => effectiveRoutes === null
      ? Prisma.empty
      : effectiveRoutes.length
        ? Prisma.sql` AND ${normalizedField(field)} IN (${Prisma.join(effectiveRoutes)})`
        : Prisma.sql` AND FALSE`;
    const customerCodes = [...new Set(input.customerCodes.map((code) => code.trim().toLowerCase()).filter(Boolean))];
    const inventoryCte = activeEntityRowsCte(input.companyId, "Van Inventory", "inventory", [
      Prisma.sql`${dateText(textField({ field: "ReportDate", source: "inventory_source" }))} <= ${targetDate}${routeScope({ field: "RouteID", source: "inventory_source" })}`,
    ], [], []);
    const invoiceCte = activeEntityRowsCte(input.companyId, "Invoices", "invoice", [
      Prisma.sql`${dateText(textField({ field: "InvoiceDate", source: "invoice_source" }))} >= ${salesFrom} AND ${dateText(textField({ field: "InvoiceDate", source: "invoice_source" }))} <= ${salesTo}${routeScope({ field: "RouteID", source: "invoice_source" })}${customerCodes.length ? Prisma.sql` AND ${normalizedField({ field: "CustomerCode", source: "invoice_source" })} IN (${Prisma.join(customerCodes)})` : Prisma.sql` AND FALSE`}`,
    ], [], []);
    const itemsCte = activeEntityRowsCte(input.companyId, "Invoice Items", "item", [], [], []);
    const productsCte = activeEntityRowsCte(input.companyId, "Products", "product", [], [], []);
    const inventoryRoute = normalizedField({ field: "RouteID", source: "inventory" });
    const inventoryProduct = normalizedField({ field: "ProductCode", source: "inventory" });
    const inventoryQuantity = numericField(textField({ field: "Quantity", source: "inventory" }));
    const itemProduct = normalizedField({ field: "ProductCode", source: "item" });
    const itemQuantity = numericField(textField({ field: "Quantity", source: "item" }));
    const invoiceNo = normalizedField({ field: "InvoiceNo", source: "item" });
    const invoiceJoinNo = normalizedField({ field: "InvoiceNo", source: "invoice" });
    const effectiveSaleRoute = Prisma.sql`LOWER(BTRIM(COALESCE(NULLIF(BTRIM(COALESCE(${textField({ field: "RouteID", source: "item" })}, '')), ''), ${textField({ field: "RouteID", source: "invoice" })}, '')))`;
    const productCategory = Prisma.sql`NULLIF(BTRIM(COALESCE(${textField({ field: "Category", source: "product" })}, '')), '')`;
    const rows = await this.runExpensiveQuery("queryManagementStockAlignment", () => this.prisma.$queryRaw<RieManagementStockAlignmentRow[]>(Prisma.sql`
      WITH ${inventoryCte}, ${invoiceCte}, ${itemsCte}, ${productsCte},
      inventory_latest AS MATERIALIZED (
        SELECT ${inventoryRoute} AS route_id, MAX(NULLIF(BTRIM(COALESCE(${textField({ field: "ReportDate", source: "inventory" })}, '')), '')) AS report_date
        FROM inventory_active inventory
        GROUP BY ${inventoryRoute}
      ),
      stock_by_route_product AS MATERIALIZED (
        SELECT ${inventoryRoute} AS route_id, ${inventoryProduct} AS product_code, SUM(${inventoryQuantity})::double precision AS current_stock
        FROM inventory_active inventory
        INNER JOIN inventory_latest latest ON latest.route_id = ${inventoryRoute}
          AND NULLIF(BTRIM(COALESCE(${textField({ field: "ReportDate", source: "inventory" })}, '')), '') = latest.report_date
        GROUP BY ${inventoryRoute}, ${inventoryProduct}
      ),
      expected_by_route_product AS MATERIALIZED (
        SELECT ${effectiveSaleRoute} AS route_id, ${itemProduct} AS product_code, SUM(${itemQuantity})::double precision / 12.0 AS expected_sales
        FROM item_active item
        INNER JOIN invoice_active invoice ON ${invoiceNo} = ${invoiceJoinNo}
        WHERE ${itemProduct} <> '' AND ${effectiveSaleRoute} <> ''
        GROUP BY ${effectiveSaleRoute}, ${itemProduct}
      ),
      route_product_alignment AS MATERIALIZED (
        SELECT COALESCE(stock.route_id, expected.route_id) AS route_id,
          COALESCE(stock.product_code, expected.product_code) AS product_code,
          COALESCE(stock.current_stock, 0)::double precision AS current_stock,
          COALESCE(expected.expected_sales, 0)::double precision AS expected_sales
        FROM stock_by_route_product stock
        FULL OUTER JOIN expected_by_route_product expected ON expected.route_id = stock.route_id AND expected.product_code = stock.product_code
      ),
      product_categories AS MATERIALIZED (
        SELECT DISTINCT ON (${normalizedField({ field: "ProductCode", source: "product" })})
          ${normalizedField({ field: "ProductCode", source: "product" })} AS product_code,
          ${productCategory} AS category
        FROM product_active product
        WHERE ${normalizedField({ field: "ProductCode", source: "product" })} <> ''
        ORDER BY ${normalizedField({ field: "ProductCode", source: "product" })}, product."entity_key" DESC
      ),
      category_alignment AS MATERIALIZED (
        SELECT categories.category,
          CASE
            WHEN COALESCE(SUM(alignment.expected_sales), 0) = 0 THEN 100::double precision
            ELSE LEAST(100::double precision, (SUM(LEAST(alignment.current_stock, alignment.expected_sales)) / SUM(alignment.expected_sales)) * 100)
          END AS alignment_percent
        FROM route_product_alignment alignment
        LEFT JOIN product_categories categories ON categories.product_code = alignment.product_code
        GROUP BY categories.category
      )
      SELECT CASE
        WHEN COALESCE(SUM(expected_sales), 0) = 0 THEN 100::double precision
        ELSE LEAST(100::double precision, (SUM(LEAST(current_stock, expected_sales)) / SUM(expected_sales)) * 100)
      END AS "alignmentPercent",
      COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
        'category', category,
        'alignmentPercent', alignment_percent
      ) ORDER BY category NULLS LAST) FROM category_alignment), '[]'::jsonb) AS "categoryAlignments"
      FROM route_product_alignment
    `));
    return rows[0] ?? { alignmentPercent: 100, categoryAlignments: [] };
  }

  /**
   * Builds stale-customer evidence at Product grain. The screen still gets the
   * exact customer-level ranking inputs, but the Product × Customer relation
   * is aggregated and packed by PostgreSQL before it crosses the RIE boundary.
   */
  async queryStalePurchases(input: RieStalePurchasesQuery): Promise<RieStalePurchaseRow[]> {
    if (!input.companyId?.trim()) throw new Error("RIE stale purchases requires companyId.");
    if (!input.routeIds.length || !input.productCodes.length) return [];
    const targetDate = normalizeDate(input.targetDate);
    const allowedRoutes = input.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser)
      : null;
    const requestedRoutes = [...new Set(input.routeIds.map((routeId) => routeId.trim().toLowerCase()).filter(Boolean))];
    const effectiveRoutes = allowedRoutes === null
      ? requestedRoutes
      : requestedRoutes.filter((routeId) => allowedRoutes.has(routeId));
    if (!effectiveRoutes.length) return [];
    const productCodes = [...new Set(input.productCodes.map((code) => code.trim().toLowerCase()).filter(Boolean))];
    if (!productCodes.length) return [];
    const invoiceCte = activeEntityRowsCte(input.companyId, "Invoices", "invoice", [
      Prisma.sql`${dateText(textField({ field: "InvoiceDate", source: "invoice_source" }))} <= ${targetDate}`,
      Prisma.sql`${normalizedField({ field: "RouteID", source: "invoice_source" })} IN (${Prisma.join(effectiveRoutes)})`,
    ], [], []);
    const itemCte = activeEntityRowsCte(input.companyId, "Invoice Items", "item", [], [], []);
    const customerCte = activeEntityRowsCte(input.companyId, "Customers", "customer", [], [], []);
    const itemInvoiceNo = normalizedField({ field: "InvoiceNo", source: "item" });
    const invoiceNo = normalizedField({ field: "InvoiceNo", source: "invoice" });
    const itemProductText = textField({ field: "ProductCode", source: "item" });
    const itemProduct = normalizedField({ field: "ProductCode", source: "item" });
    const customerCode = textField({ field: "CustomerCode", source: "invoice" });
    const itemRoute = textField({ field: "RouteID", source: "item" });
    const invoiceRoute = textField({ field: "RouteID", source: "invoice" });
    const effectiveSaleRoute = Prisma.sql`LOWER(BTRIM(COALESCE(NULLIF(BTRIM(COALESCE(${itemRoute}, '')), ''), ${invoiceRoute}, '')))`;
    const quantity = numericField(textField({ field: "Quantity", source: "item" }));
    const invoiceDate = dateText(textField({ field: "InvoiceDate", source: "invoice" }));
    const rows = await this.runExpensiveQuery("queryStalePurchases", () => this.prisma.$queryRaw<RieStalePurchaseRow[]>(Prisma.sql`
      WITH ${invoiceCte}, ${itemCte}, ${customerCte},
      purchase_by_product_customer AS MATERIALIZED (
        SELECT ${itemProductText} AS product_code, ${customerCode} AS customer_code,
          SUM(${quantity}) FILTER (WHERE ${quantity} > 0)::double precision AS total_quantity,
          COUNT(DISTINCT NULLIF(BTRIM(COALESCE(${textField({ field: "InvoiceNo", source: "item" })}, '')), '')) FILTER (WHERE ${quantity} > 0)::double precision AS purchase_frequency,
          MAX(${invoiceDate}) FILTER (WHERE ${quantity} > 0) AS last_purchase_date
        FROM item_active item
        INNER JOIN invoice_active invoice ON ${itemInvoiceNo} = ${invoiceNo}
        WHERE ${itemProduct} IN (${Prisma.join(productCodes)})
          AND ${effectiveSaleRoute} IN (${Prisma.join(effectiveRoutes)})
        GROUP BY ${itemProductText}, ${customerCode}
      ),
      customer_names AS MATERIALIZED (
        SELECT DISTINCT ON (BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "customer" })}, '')))
          BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "customer" })}, '')) AS customer_code,
          BTRIM(COALESCE(${textField({ field: "CustomerName", source: "customer" })}, ${textField({ field: "CustomerCode", source: "customer" })}, '')) AS customer_name
        FROM customer_active customer
        ORDER BY BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "customer" })}, '')), customer."entity_key" DESC
      )
      SELECT purchases.product_code AS "productCode",
        JSONB_AGG(JSONB_BUILD_OBJECT(
          'customerCode', purchases.customer_code,
          'customerName', COALESCE(names.customer_name, BTRIM(COALESCE(purchases.customer_code, ''))),
          'totalQuantity', purchases.total_quantity,
          'purchaseFrequency', purchases.purchase_frequency,
          'lastPurchaseDate', purchases.last_purchase_date
        ) ORDER BY purchases.customer_code) AS customers
      FROM purchase_by_product_customer purchases
      LEFT JOIN customer_names names ON names.customer_code = BTRIM(COALESCE(purchases.customer_code, ''))
      GROUP BY purchases.product_code
      ORDER BY purchases.product_code
    `));
    return rows;
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
    // This predicate intentionally stays at the joined-query level: its
    // primary/fallback fields live on different entity aliases. The regular
    // route scope still bounds the joined header CTE before it reaches a
    // high-cardinality fact join; this adds exact line-route parity.
    if (!cteAlias && input.scope?.routeFallback) predicates.push(routeFallbackPredicate(input.scope.routeFallback, aliases));
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

export function activeEntityRowsCte(companyId: string, entityName: string, alias: string, predicates: readonly Prisma.Sql[], semiJoins: readonly Prisma.Sql[], sourceJoins: readonly Prisma.Sql[], singleActiveVersion = false, preMergeSourceJoins: readonly Prisma.Sql[] = []): Prisma.Sql {
  const cte = `${alias}_active`;
  const rowAlias = `${alias}_source`;
  const versionAlias = `${alias}_version`;
  if (singleActiveVersion) {
    // With one eligible version there can be no cross-upload collision, so
    // avoid the newest-wins window and preserve the direct scoped SQL shape.
    return Prisma.sql`${Prisma.raw(cte)} AS MATERIALIZED (
      SELECT ${Prisma.raw(rowAlias)}.*
      FROM "rie_dataset_versions" ${Prisma.raw(versionAlias)}
      INNER JOIN "files" source_file ON source_file.id = ${Prisma.raw(versionAlias)}."source_file_id"
      INNER JOIN "rie_entity_rows" ${Prisma.raw(rowAlias)} ON ${Prisma.raw(rowAlias)}."dataset_version_id" = ${Prisma.raw(versionAlias)}.id
      ${preMergeSourceJoins.length ? Prisma.join(preMergeSourceJoins, " ") : Prisma.empty}
      ${sourceJoins.length ? Prisma.join(sourceJoins, " ") : Prisma.empty}
      WHERE ${Prisma.raw(versionAlias)}."company_id" = ${companyId} AND ${Prisma.raw(versionAlias)}."entity_name" = ${entityName} AND ${Prisma.raw(versionAlias)}."is_active" = TRUE
        AND source_file."company_id" = ${companyId} AND source_file."is_active" = TRUE
        AND source_file.status = 'READY' AND source_file."dataset_type_confirmed" = TRUE
        AND ${Prisma.raw(rowAlias)}."company_id" = ${companyId} AND ${Prisma.raw(rowAlias)}."entity_name" = ${entityName}
        ${predicates.length ? Prisma.sql`AND ${Prisma.join(predicates, " AND ")}` : Prisma.empty}
        ${semiJoins.length ? Prisma.sql`AND ${Prisma.join(semiJoins, " AND ")}` : Prisma.empty}
    )`;
  }
  const primaryKey = IMPORT_TEMPLATES.find((template) => template.entity === entityName)?.primaryKey;
  if (!primaryKey?.length) throw new Error(`RIE scalable query requires a canonical primary key for "${entityName}".`);
  for (const field of primaryKey) assertIdentifier(field, "primary key");
  const partitionByKey = Prisma.join(primaryKey.map((field) => normalizedField({ source: rowAlias, field })), ", ");
  const candidateAlias = `${alias}_candidate`;
  // The newest-wins window needs only its business key and row identity.
  // In particular, keep `data` out of this sort/window stage: it is the
  // potentially large JSONB payload that made concurrent multi-version
  // merges spill their materialized working set to PostgreSQL temp files.
  const narrowKeys = primaryKey.map((field, index) => Prisma.sql`${normalizedField({ source: rowAlias, field })} AS ${quoted(`key_${index}`)}`);
  const keyIsBlank = Prisma.join(primaryKey.map((_, index) => Prisma.sql`${Prisma.raw(candidateAlias)}.${quoted(`key_${index}`)} = ''`), " OR ");

  // Match the entity provider's newest-upload-wins merge by the template's
  // business key, not entity_key (invoice-line storage keys may have an
  // occurrence suffix). Keep unmatched history and existing within-file
  // multiplicity/blank-key semantics. The window is deliberately evaluated
  // before screen/hierarchy/date scopes: filtering first could resurrect an
  // old Pending record after it became Closed.  MIN(precedence), rather than
  // ROW_NUMBER(), retains all same-key rows within the newest upload.
  // This is a set-based aggregate over the active rows; do not replace it
  // with a correlated newest-row lookup, which produces a per-row SubPlan.
  return Prisma.sql`${Prisma.raw(`${alias}_versions`)} AS MATERIALIZED (
    SELECT ${Prisma.raw(versionAlias)}.id,
      ROW_NUMBER() OVER (ORDER BY source_file."created_at" DESC, source_file.id DESC) AS precedence
    FROM "rie_dataset_versions" ${Prisma.raw(versionAlias)}
    INNER JOIN "files" source_file ON source_file.id = ${Prisma.raw(versionAlias)}."source_file_id"
    WHERE ${Prisma.raw(versionAlias)}."company_id" = ${companyId} AND ${Prisma.raw(versionAlias)}."entity_name" = ${entityName} AND ${Prisma.raw(versionAlias)}."is_active" = TRUE
      AND source_file."company_id" = ${companyId} AND source_file."is_active" = TRUE
      AND source_file.status = 'READY' AND source_file."dataset_type_confirmed" = TRUE
  ), ${Prisma.raw(`${alias}_candidates`)} AS NOT MATERIALIZED (
    SELECT ${Prisma.raw(rowAlias)}.id AS "row_id", ${Prisma.raw(rowAlias)}."dataset_version_id", ${Prisma.raw(rowAlias)}."entity_key", candidate_version.precedence,
      ${Prisma.join(narrowKeys)},
      MIN(candidate_version.precedence) OVER (
        PARTITION BY ${partitionByKey}
      ) AS newest_precedence
    FROM ${Prisma.raw(`${alias}_versions`)} candidate_version
    INNER JOIN "rie_entity_rows" ${Prisma.raw(rowAlias)} ON ${Prisma.raw(rowAlias)}."dataset_version_id" = candidate_version.id
    ${preMergeSourceJoins.length ? Prisma.join(preMergeSourceJoins, " ") : Prisma.empty}
    WHERE ${Prisma.raw(rowAlias)}."company_id" = ${companyId} AND ${Prisma.raw(rowAlias)}."entity_name" = ${entityName}
  ), ${Prisma.raw(cte)} AS MATERIALIZED (
    SELECT ${Prisma.raw(rowAlias)}.*
    FROM ${Prisma.raw(`${alias}_candidates`)} ${Prisma.raw(candidateAlias)}
    INNER JOIN "rie_entity_rows" ${Prisma.raw(rowAlias)} ON ${Prisma.raw(rowAlias)}.id = ${Prisma.raw(candidateAlias)}."row_id"
    ${sourceJoins.length ? Prisma.join(sourceJoins, " ") : Prisma.empty}
    WHERE TRUE
      AND (${keyIsBlank} OR ${Prisma.raw(candidateAlias)}.precedence = ${Prisma.raw(candidateAlias)}.newest_precedence)
      ${predicates.length ? Prisma.sql`AND ${Prisma.join(predicates, " AND ")}` : Prisma.empty}
      ${semiJoins.length ? Prisma.sql`AND ${Prisma.join(semiJoins, " AND ")}` : Prisma.empty}
  )`;
}

function latestPerCte(scope: RieLatestPerScope): Prisma.Sql {
  const ordering = textField({ ...scope.orderBy, source: "base" });
  return Prisma.sql`base_latest AS MATERIALIZED (
    SELECT base.*
    FROM base_active base
    INNER JOIN (
      SELECT ${normalizedField({ ...scope.partitionBy, source: "base" })} AS partition_key,
        MAX(NULLIF(BTRIM(COALESCE(${ordering}, '')), '')) AS latest_value
      FROM base_active base
      GROUP BY ${normalizedField({ ...scope.partitionBy, source: "base" })}
    ) latest ON ${normalizedField({ ...scope.partitionBy, source: "base" })} = latest.partition_key
      AND NULLIF(BTRIM(COALESCE(${ordering}, '')), '') = latest.latest_value
  )`;
}

function activeEntityRowsReference(alias: string): Prisma.Sql { return Prisma.sql`${Prisma.raw(`${alias}_active`)} ${Prisma.raw(alias)}`; }
function scopedJoinExists(join: RieQueryJoin): Prisma.Sql {
  return scopedJoinExistsFrom("base", join);
}
function scopedJoinExistsFrom(sourceAlias: string, join: RieQueryJoin): Prisma.Sql {
  const baseSource = { field: join.on.left.field, source: `${sourceAlias}_source` };
  const scopedSource = { field: join.on.rightField, source: `${join.alias}_scope` };
  return Prisma.sql`EXISTS (SELECT 1 FROM ${Prisma.raw(`${join.alias}_active`)} ${Prisma.raw(`${join.alias}_scope`)} WHERE ${normalizedField(baseSource)} = ${normalizedField(scopedSource)})`;
}
function scopedSemiJoinsFor(sourceAlias: string, joins: readonly RieQueryJoin[], scopedJoinAliases: ReadonlySet<string>, preferHashed = false): Prisma.Sql[] {
  return joins
    .filter((join) => scopedJoinAliases.has(join.alias) && (join.on.left.source ?? "base") === sourceAlias)
    .map((join) => preferHashed ? scopedJoinMembershipFrom(sourceAlias, join) : scopedJoinExistsFrom(sourceAlias, join));
}
function scopedJoinMembershipFrom(sourceAlias: string, join: RieQueryJoin): Prisma.Sql {
  // normalizedField always COALESCEs to text, so IN has the same truth table
  // as EXISTS here.  Unlike a correlated EXISTS over a MATERIALIZED CTE,
  // PostgreSQL can build one hashed invoice-key set and probe it for each fact.
  const baseSource = { field: join.on.left.field, source: `${sourceAlias}_source` };
  const scopedSource = { field: join.on.rightField, source: `${join.alias}_scope` };
  return Prisma.sql`${normalizedField(baseSource)} IN (SELECT ${normalizedField(scopedSource)} FROM ${Prisma.raw(`${join.alias}_active`)} ${Prisma.raw(`${join.alias}_scope`)})`;
}
function orderScopedAliases(joins: readonly RieQueryJoin[], scopedJoinAliases: ReadonlySet<string>): string[] {
  const ordered: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (alias: string): void => {
    if (visited.has(alias)) return;
    if (visiting.has(alias)) throw new Error("RIE scalable query has cyclic scoped joins.");
    visiting.add(alias);
    for (const join of joins) {
      if (scopedJoinAliases.has(join.alias) && (join.on.left.source ?? "base") === alias) visit(join.alias);
    }
    visiting.delete(alias);
    visited.add(alias);
    ordered.push(alias);
  };
  for (const alias of scopedJoinAliases) visit(alias);
  return ordered;
}
function scopedJoin(join: RieQueryJoin): Prisma.Sql {
  const baseSource = { field: join.on.left.field, source: "base_source" };
  const scopedSource = { field: join.on.rightField, source: `${join.alias}_scope` };
  return Prisma.sql`INNER JOIN ${Prisma.raw(`${join.alias}_active`)} ${Prisma.raw(`${join.alias}_scope`)} ON ${normalizedField(baseSource)} = ${normalizedField(scopedSource)}`;
}

function normalizePagination(input: RieScalableQuery["pagination"], internalAggregate: boolean, unboundedFinalResult = false): { limit: number; offset: number } {
  const offset = input?.offset ?? 0;
  if (unboundedFinalResult) {
    if (input?.limit !== undefined) throw new Error("RIE unbounded final result does not accept a page limit.");
    if (!Number.isInteger(offset) || offset < 0) throw new Error("RIE scalable query offset must be a non-negative integer.");
    return { limit: 0, offset };
  }
  const limit = input?.limit ?? DEFAULT_PAGE_SIZE;
  const maxLimit = internalAggregate ? MAX_INTERNAL_AGGREGATE_PAGE_SIZE : MAX_PAGE_SIZE;
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) throw new Error(`RIE scalable query limit must be an integer between 1 and ${maxLimit}.`);
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
function routeFallbackPredicate(scope: RieRouteFallbackScope, aliases: Set<string>): Prisma.Sql {
  assertField(scope.primary, aliases);
  assertField(scope.fallback, aliases);
  if (!scope.values.length) return Prisma.sql`FALSE`;
  const primary = textField(scope.primary);
  const fallback = textField(scope.fallback);
  return Prisma.sql`LOWER(BTRIM(COALESCE(NULLIF(BTRIM(COALESCE(${primary}, '')), ''), ${fallback}, ''))) IN (${Prisma.join(scope.values.map((value) => value.trim().toLowerCase()))})`;
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
  if (aggregate.op === "count" && !aggregate.field) return Prisma.sql`COUNT(*)::double precision AS ${alias}`;
  const field = textField({ field: aggregate.field!, source: aggregate.source });
  const positiveFilter = aggregate.filterPositiveField
    ? Prisma.sql` FILTER (WHERE ${numericField(textField(aggregate.filterPositiveField))} > 0)`
    : Prisma.empty;
  if (aggregate.op === "count") return Prisma.sql`COUNT(NULLIF(BTRIM(COALESCE(${field}, '')), ''))::double precision AS ${alias}`;
  if (aggregate.op === "countDistinct") return Prisma.sql`(COUNT(DISTINCT NULLIF(BTRIM(COALESCE(${field}, '')), ''))${positiveFilter})::double precision AS ${alias}`;
  if (aggregate.op === "arrayAggDistinct") return Prisma.sql`ARRAY_AGG(DISTINCT NULLIF(BTRIM(COALESCE(${field}, '')), '')) FILTER (WHERE NULLIF(BTRIM(COALESCE(${field}, '')), '') IS NOT NULL) AS ${alias}`;
  if (aggregate.op === "minText" || aggregate.op === "maxText") return Prisma.sql`${Prisma.raw(aggregate.op === "minText" ? "MIN" : "MAX")}(NULLIF(BTRIM(COALESCE(${field}, '')), ''))${positiveFilter} AS ${alias}`;
  const numeric = numericField(field);
  if (aggregate.op === "sumProduct") {
    const multiplier = textField(aggregate.multiplier!);
    const numericMultiplier = Prisma.sql`CASE WHEN BTRIM(COALESCE(${multiplier}, '')) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN BTRIM(COALESCE(${multiplier}, ''))::double precision ELSE NULL END`;
    if (aggregate.multiplierFallback) {
      const fallback = textField(aggregate.multiplierFallback);
      const numericFallback = Prisma.sql`CASE WHEN BTRIM(COALESCE(${fallback}, '')) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN BTRIM(COALESCE(${fallback}, ''))::double precision ELSE NULL END`;
      return Prisma.sql`SUM(${numeric} * CASE WHEN ${multiplier} IS NULL THEN ${numericFallback} ELSE ${numericMultiplier} END)${positiveFilter} AS ${alias}`;
    }
    return Prisma.sql`SUM(${numeric} * ${numericMultiplier})${positiveFilter} AS ${alias}`;
  }
  return Prisma.sql`${Prisma.raw({ sum: "SUM", avg: "AVG", min: "MIN", max: "MAX" }[aggregate.op])}(${numeric})${positiveFilter} AS ${alias}`;
}
function numericField(field: Prisma.Sql): Prisma.Sql { return Prisma.sql`CASE WHEN BTRIM(COALESCE(${field}, '')) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN BTRIM(COALESCE(${field}, ''))::double precision ELSE NULL END`; }
/** Matches RIE date filtering while making the route-stale subtraction safe. */
function dateText(field: Prisma.Sql): Prisma.Sql { return Prisma.sql`CASE WHEN ${field} ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT(${field}, 10) ELSE NULL END`; }
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
