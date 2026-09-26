import { Injectable } from "@nestjs/common";
import { Prisma } from "@field-sales-os/database";
import { PrismaService } from "../../common/prisma";
import { CanonicalHierarchyResolverService } from "./canonical-hierarchy-resolver.service";
import { RieRequestPlannerService } from "./rie-request-planner.service";
import type { EntityQueryContext, EntityRecord, EntityQueryResult } from "./entity-provider.interface";
import type { RieDateScope, RieGeoCustomerDirectoryQuery, RieGeoCustomerDirectoryRow, RieGeoCustomerSalesRow, RieGeoCustomerSelectionQuery, RieGeoCustomerSelectionRow, RieGeoEngineFilters, RieGeoEngineMapQuery, RieGeoEngineMapResult, RieGeoEngineTableQuery, RieGeoEngineTableResult, RieGeoExpansionCustomersResult, RieGeoProductQuery, RieGeoProductRow, RieHeatmapCustomerPointRow, RieHeatmapCustomerPointsQuery, RieHeatmapEntityTotalsQuery, RieHeatmapSalesQuery, RieHeatmapValueRow, RieLatestPerScope, RieManagementActiveVehicleRouteRow, RieManagementActiveVehicleRoutesQuery, RieManagementLoadingRiskQuery, RieManagementLoadingRiskRow, RieManagementLostOpportunitiesQuery, RieManagementLostOpportunitiesResult, RieManagementLostOpportunityRow, RieManagementSmartLoadingBundle, RieManagementSmartLoadingBundleQuery, RieManagementStockAlignmentQuery, RieManagementStockAlignmentRow, RieManagementVehicleProductsQuery, RieManagementVehicleProductRow, RieProductFitData, RieProductFitPeerScope, RieProductFitQuery, RieQueryAggregation, RieQueryField, RieQueryJoin, RieRouteFallbackScope, RieRouteProductStalenessQuery, RieRouteProductStalenessRow, RieScalableEntityRead, RieScalableQuery, RieScalableQueryResult, RieStalePurchaseRow, RieStalePurchasesQuery, RieTerritoryCustomerFactsQuery, RieTerritoryCustomerFactsResult, RieTerritorySummaryFactRow, RieTerritorySummaryQuery, RieValueScope, RieVisitCopilotBriefingEntity, RieVisitCopilotCustomerBriefingFacts, RieVisitCopilotCustomerBriefingQuery, RieVisitEfficiencyQuery, RieVisitEfficiencyResult } from "./scalable-query.types";
import { fingerprintRieQueryShape, observeRiePostgres, recordActiveVersionResolution } from "../../common/observability/rie-observability";
import { RieExecutionCoordinatorService } from "./rie-execution-coordinator.service";

const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 5_000;
const MAX_INTERNAL_AGGREGATE_PAGE_SIZE = 25_000;
const SAFE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*$/;
/**
 * Read-only PostgreSQL query layer for canonical high-cardinality data.
 * Query predicates, joins, grouping and aggregation all execute in SQL;
 * this service never materializes an entity before applying a scope.
 */
@Injectable()
export class RieScalableQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchyResolver: CanonicalHierarchyResolverService,
    private readonly requestPlanner?: RieRequestPlannerService,
    private readonly executionCoordinator: RieExecutionCoordinatorService = new RieExecutionCoordinatorService(),
  ) {}

  private postgres<T>(operation: string, shape: unknown, prepare: () => Prisma.Sql): Promise<T> {
    return this.executionCoordinator.executePrepared(operation, prepare, (statement) =>
      observeRiePostgres(operation, fingerprintRieQueryShape(shape), "semaphore", () => this.prisma.$queryRaw<T>(statement)),
    );
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
      if (aggregate.filterValues) assertField(aggregate.filterValues, aliases);
      for (const filterDate of aggregate.filterDates ?? []) assertField(filterDate, aliases);
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
    if (input.totalCountAs) assertIdentifier(input.totalCountAs, "total-count alias");
    const select = [...projection, ...(input.aggregates ?? []).map(aggregateSql), ...(input.totalCountAs ? [Prisma.sql`COUNT(*) OVER () AS ${quoted(input.totalCountAs)}`] : [])];
    const predicates = await this.scopePredicates(input, aliases);
    const page = normalizePagination(input.pagination, input.internalAggregate === true, input.unboundedFinalResult === true);
    // Materialized CTEs keep each company/screen-scoped current-state relation
    // bounded before it reaches later fact joins (especially Invoice Items ->
    // Invoices).
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
        ...(aggregate.filterValues ? [aggregate.filterValues] : []),
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
    const ctes = orderedActiveRows.map(({ entityName, alias }) => activeEntityRowsCte(input.companyId, entityName, alias, ctePredicates.get(alias) ?? [], alias === "base" ? baseSemiJoins : scopedSemiJoinsFor(alias, joins, scopedJoinAliases), alias === "base" ? baseSourceJoins : []));
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
    const rows = await this.postgres<EntityRecord[]>("query.sql", scalableQueryFingerprintShape(input), () => Prisma.sql`
      WITH ${Prisma.join(ctes, ", ")}
      SELECT ${Prisma.join(select)}
      FROM ${baseReference}
      ${joinClause}
      WHERE TRUE${where}
      ${grouping}
      ${ordering}
      ${pagination}
    `);
    const hasMore = input.unboundedFinalResult ? false : rows.length > page.limit;
    return { records: hasMore ? rows.slice(0, page.limit) : rows, page: { ...page, hasMore } };
  }

  /** One-row PostgreSQL contract for Local Decision -> GetTotalSales. */
  async queryLocalDecisionTotalSales(
    input: EntityQueryContext & { start: string; end: string },
  ): Promise<number> {
    const allowedRoutes = input.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser)
      : null;
    const routePredicate = (source: string) => allowedRoutes === null
      ? []
      : [allowedRoutes.size
          ? Prisma.sql`${normalizedField({ field: "RouteID", source })} IN (${Prisma.join([...allowedRoutes])})`
          : Prisma.sql`FALSE`];
    const invoiceProjection = Prisma.sql`
      ${normalizedField({ field: "InvoiceNo", source: "invoice_source" })} AS invoice_no,
      ${textField({ field: "InvoiceDate", source: "invoice_source" })} AS invoice_date,
      invoice_source."created_at" AS created_at,
      invoice_source.id AS row_id
    `;
    const invoiceCte = activeEntityRowsCte(
      input.companyId,
      "Invoices",
      "invoice",
      routePredicate("invoice_source"),
      [],
      [],
      false,
      [],
      invoiceProjection,
    );
    const invoiceFirst = Prisma.sql`invoice_first AS MATERIALIZED (
      SELECT DISTINCT ON (invoice.invoice_no)
        invoice.invoice_no,
        invoice.invoice_date
      FROM invoice_active invoice
      WHERE invoice.invoice_no <> ''
      ORDER BY invoice.invoice_no, invoice.created_at ASC, invoice.row_id ASC
    )`;
    const invoiceScoped = Prisma.sql`invoice_scoped AS MATERIALIZED (
      SELECT invoice_first.invoice_no
      FROM invoice_first
      WHERE ${dateText(Prisma.raw("invoice_first.invoice_date"))} >= ${input.start}
        AND ${dateText(Prisma.raw("invoice_first.invoice_date"))} <= ${input.end}
    )`;
    const itemProjection = Prisma.sql`${localDecisionNumberField("item_source", "LineTotal")} AS line_total`;
    const itemCte = activeEntityRowsCte(
      input.companyId,
      "Invoice Items",
      "item",
      routePredicate("item_source"),
      [],
      [],
      false,
      [Prisma.sql`INNER JOIN invoice_scoped scoped_invoice ON ${normalizedField({ field: "InvoiceNo", source: "item_source" })} = scoped_invoice.invoice_no`],
      itemProjection,
    );
    const rows = await this.postgres<Array<{ total: number | null }>>(
      "queryLocalDecisionTotalSales.sql",
      { kind: "specialized", operation: "queryLocalDecisionTotalSales" },
      () => Prisma.sql`
      WITH ${invoiceCte}, ${invoiceFirst}, ${invoiceScoped}, ${itemCte}
      SELECT COALESCE(SUM(item.line_total), 0)::double precision AS total
      FROM item_active item
    `,
    );
    const total = Number(rows[0]?.total ?? 0);
    return Number.isFinite(total) ? total : 0;
  }

  /**
   * Geo Intelligence's only customer read. Coordinates are validated and the
   * nearest/manual set is selected in PostgreSQL; Node receives at most the
   * requested neighbors plus manual selections.
   */
  async queryGeoCustomerDirectory(input: RieGeoCustomerDirectoryQuery): Promise<RieGeoCustomerDirectoryRow[]> {
    return (await this.queryGeoCustomerDirectoryResult(input, "queryGeoCustomerDirectory")).customers;
  }

  async queryGeoExpansionCustomers(input: RieGeoCustomerDirectoryQuery): Promise<RieGeoExpansionCustomersResult> {
    return this.queryGeoCustomerDirectoryResult(input, "queryGeoExpansionCustomers");
  }

  private async queryGeoCustomerDirectoryResult(
    input: RieGeoCustomerDirectoryQuery,
    operation: "queryGeoCustomerDirectory" | "queryGeoExpansionCustomers",
  ): Promise<RieGeoExpansionCustomersResult> {
    if (!input.companyId?.trim()) throw new Error("RIE Geo customer directory requires companyId.");
    const allowedRoutes = input.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser)
      : null;
    const predicates = allowedRoutes === null
      ? []
      : allowedRoutes.size
        ? [Prisma.sql`${normalizedField({ field: "RouteID", source: "customer_source" })} IN (${Prisma.join([...allowedRoutes])})`]
        : [Prisma.sql`FALSE`];
    if (input.exactScope) {
      assertIdentifier(input.exactScope.field, "Geo scope field");
      predicates.push(input.exactScope.values.length
        ? Prisma.sql`COALESCE(${textField({ field: input.exactScope.field, source: "customer_source" })}, '') IN (${Prisma.join([...input.exactScope.values])})`
        : Prisma.sql`FALSE`);
    }
    const customerCode = textField({ field: "CustomerCode", source: "customer_source" });
    const customerName = textField({ field: "CustomerName", source: "customer_source" });
    const latitude = geoFiniteNumberField(textField({ field: "Latitude", source: "customer_source" }));
    const longitude = geoFiniteNumberField(textField({ field: "Longitude", source: "customer_source" }));
    const customerProjection = Prisma.sql`
      customer_source.id AS source_row_id,
      customer_source.precedence,
      customer_source."created_at",
      BTRIM(COALESCE(${customerCode}, '')) AS customer_id,
      COALESCE(${customerName}, BTRIM(COALESCE(${customerCode}, ''))) AS customer_name,
      ${latitude} AS latitude,
      ${longitude} AS longitude
    `;
    const customers = activeEntityRowsCte(input.companyId, "Customers", "customer", predicates, [], [], false, [], customerProjection);
    const search = input.search?.trim().toLowerCase();
    const rows = await this.postgres<Array<{ id: string | null; name: string | null; lat: number | null; lon: number | null; matchedScopeRows: number }>>(`${operation}.sql`, {
      kind: "specialized",
      operation,
      hasSearch: Boolean(search),
      hasExactScope: Boolean(input.exactScope),
    }, () => Prisma.sql`
      WITH ${customers}, valid AS MATERIALIZED (
        SELECT customer_id AS id, customer_name AS name, latitude AS lat, longitude AS lon,
          precedence AS source_precedence, "created_at" AS source_created_at, source_row_id,
          ROW_NUMBER() OVER (
            PARTITION BY customer_id
            ORDER BY precedence ASC, "created_at" ASC, source_row_id ASC
          ) AS row_number
        FROM customer_active
        WHERE customer_id <> ''
          AND latitude BETWEEN -90 AND 90
          AND longitude BETWEEN -180 AND 180
          AND NOT (latitude = 0 AND longitude = 0)
      ), selected AS MATERIALIZED (
        SELECT id, name, lat, lon, source_precedence, source_created_at, source_row_id
        FROM valid
        WHERE row_number = 1
          ${search ? Prisma.sql`AND (LOWER(name) LIKE ${`%${search}%`} OR LOWER(id) LIKE ${`%${search}%`})` : Prisma.empty}
      ), scope_summary AS MATERIALIZED (
        SELECT COUNT(*)::double precision AS matched_scope_rows
        FROM customer_active
      )
      SELECT selected.id, selected.name, selected.lat, selected.lon,
        scope_summary.matched_scope_rows AS "matchedScopeRows"
      FROM scope_summary
      LEFT JOIN selected ON TRUE
      ORDER BY selected.source_precedence ASC NULLS LAST,
        selected.source_created_at ASC NULLS LAST,
        selected.source_row_id ASC NULLS LAST
    `);
    return {
      customers: rows.flatMap((row) => row.id === null || row.name === null || row.lat === null || row.lon === null
        ? []
        : [{ id: row.id, name: row.name, lat: Number(row.lat), lon: Number(row.lon) }]),
      matchedScopeRows: Number(rows[0]?.matchedScopeRows ?? 0),
    };
  }

  /** Geo expansion's Invoice Items -> Invoices sum, reduced to one row per customer in PostgreSQL. */
  async queryGeoCustomerSales(input: EntityQueryContext): Promise<RieGeoCustomerSalesRow[]> {
    if (!input.companyId?.trim()) throw new Error("RIE Geo customer sales requires companyId.");
    const allowedRoutes = input.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser)
      : null;
    const scoped = (source: string): Prisma.Sql[] => allowedRoutes === null
      ? []
      : allowedRoutes.size
        ? [Prisma.sql`${normalizedField({ field: "RouteID", source })} IN (${Prisma.join([...allowedRoutes])})`]
        : [Prisma.sql`FALSE`];
    const invoiceProjection = Prisma.sql`
      invoice_source.id,
      invoice_source.precedence,
      invoice_source."created_at",
      BTRIM(COALESCE(${textField({ field: "InvoiceNo", source: "invoice_source" })}, '')) AS invoice_no,
      BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "invoice_source" })}, '')) AS customer_code
    `;
    const itemTotal = textField({ field: "LineTotal", source: "item_source" });
    const itemProjection = Prisma.sql`
      BTRIM(COALESCE(${textField({ field: "InvoiceNo", source: "item_source" })}, '')) AS invoice_no,
      CASE
        WHEN BTRIM(COALESCE(${itemTotal}, '')) ~ '^[+-]?(\\d+(\\.\\d*)?|\\.\\d+)([eE][+-]?\\d+)?$'
        THEN BTRIM(COALESCE(${itemTotal}, ''))::double precision
        ELSE 0::double precision
      END AS amount
    `;
    const invoices = activeEntityRowsCte(input.companyId, "Invoices", "invoice", scoped("invoice_source"), [], [], false, [], invoiceProjection);
    const items = activeEntityRowsCte(input.companyId, "Invoice Items", "item", scoped("item_source"), [], [], false, [], itemProjection);
    const rows = await this.postgres<RieGeoCustomerSalesRow[]>("queryGeoCustomerSales.sql", {
      kind: "specialized",
      operation: "queryGeoCustomerSales",
    }, () => Prisma.sql`
      WITH ${invoices}, ${items}, invoice_lookup AS MATERIALIZED (
        SELECT invoice_no, customer_code
        FROM (
          SELECT invoice_no, customer_code,
            ROW_NUMBER() OVER (
              PARTITION BY invoice_no
              ORDER BY precedence DESC, "created_at" DESC, id DESC
            ) AS row_number
          FROM invoice_active
          WHERE invoice_no <> '' AND customer_code <> ''
        ) ranked
        WHERE row_number = 1
      )
      SELECT invoice.customer_code AS "customerCode", SUM(item.amount)::double precision AS total
      FROM item_active item
      INNER JOIN invoice_lookup invoice ON item.invoice_no = invoice.invoice_no
      GROUP BY invoice.customer_code
    `);
    return rows.map((row) => ({ customerCode: row.customerCode, total: Number(row.total) }));
  }

  async queryHeatmapCustomerPoints(input: RieHeatmapCustomerPointsQuery): Promise<RieHeatmapCustomerPointRow[]> {
    if (!input.companyId?.trim()) throw new Error("RIE Heatmap customer points require companyId.");
    if (!Number.isInteger(input.limit) || input.limit < 1) throw new Error("RIE Heatmap customer limit must be positive.");
    const allowedRoutes = input.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser)
      : null;
    const predicates: Prisma.Sql[] = allowedRoutes === null
      ? []
      : allowedRoutes.size
        ? [Prisma.sql`${normalizedField({ field: "RouteID", source: "customer_source" })} IN (${Prisma.join([...allowedRoutes])})`]
        : [Prisma.sql`FALSE`];
    if (input.scopeField && input.scopeValues?.length) {
      assertIdentifier(input.scopeField, "Heatmap scope field");
      const scope = textField({ field: input.scopeField, source: "customer_source" });
      predicates.push(input.scopeField === "City"
        ? Prisma.sql`BTRIM(COALESCE(${scope}, '')) IN (${Prisma.join([...input.scopeValues])})`
        : Prisma.sql`COALESCE(${scope}, '') IN (${Prisma.join([...input.scopeValues])})`);
      if (input.scopeField === "City") predicates.push(Prisma.sql`BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "customer_source" })}, '')) <> ''`);
    }
    const customerCode = textField({ field: "CustomerCode", source: "customer_source" });
    const projection = Prisma.sql`
      customer_source.id AS source_row_id,
      customer_source.precedence AS source_precedence,
      customer_source."created_at" AS source_created_at,
      BTRIM(COALESCE(${customerCode}, '')) AS id,
      COALESCE(${textField({ field: "CustomerName", source: "customer_source" })}, BTRIM(COALESCE(${customerCode}, ''))) AS label,
      ${geoFiniteNumberField(textField({ field: "Latitude", source: "customer_source" }))} AS lat,
      ${geoFiniteNumberField(textField({ field: "Longitude", source: "customer_source" }))} AS lon
    `;
    const customers = activeEntityRowsCte(input.companyId, "Customers", "customer", predicates, [], [], false, [], projection);
    const rows = await this.postgres<RieHeatmapCustomerPointRow[]>("queryHeatmapCustomerPoints.sql", {
      kind: "specialized", operation: "queryHeatmapCustomerPoints", scopeField: input.scopeField ?? null,
    }, () => Prisma.sql`
      WITH ${customers}
      SELECT id, label, lat, lon, COUNT(*) OVER ()::double precision AS "totalRows"
      FROM customer_active
      ORDER BY source_precedence ASC, source_created_at ASC, source_row_id ASC
      LIMIT ${input.limit + 1}
    `);
    return rows.map((row) => ({ ...row, lat: row.lat === null ? null : Number(row.lat), lon: row.lon === null ? null : Number(row.lon), totalRows: Number(row.totalRows) }));
  }

  async queryHeatmapEntityTotals(input: RieHeatmapEntityTotalsQuery): Promise<RieHeatmapValueRow[]> {
    if (!input.companyId?.trim()) throw new Error("RIE Heatmap entity totals require companyId.");
    const allowedRoutes = input.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser)
      : null;
    const predicates: Prisma.Sql[] = allowedRoutes === null
      ? []
      : allowedRoutes.size
        ? [Prisma.sql`${normalizedField({ field: "RouteID", source: "metric_source" })} IN (${Prisma.join([...allowedRoutes])})`]
        : [Prisma.sql`FALSE`];
    const timestamp = heatmapEpochField(textField({ field: input.dateField, source: "metric_source" }));
    if (input.fromTime !== undefined) predicates.push(Prisma.sql`${timestamp} >= ${input.fromTime}`);
    if (input.toTime !== undefined) predicates.push(Prisma.sql`${timestamp} <= ${input.toTime}`);
    const customer = Prisma.sql`BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "metric_source" })}, ''))`;
    if (input.customerCodes) predicates.push(input.customerCodes.length
      ? Prisma.sql`${customer} IN (${Prisma.join([...input.customerCodes])})`
      : Prisma.sql`FALSE`);
    predicates.push(Prisma.sql`${customer} <> ''`);
    const projection = Prisma.sql`
      ${customer} AS customer_code,
      COALESCE(${geoFiniteNumberField(textField({ field: input.amountField, source: "metric_source" }))}, 0::double precision) AS amount
    `;
    const metric = activeEntityRowsCte(input.companyId, input.entityName, "metric", predicates, [], [], false, [], projection);
    const rows = await this.postgres<RieHeatmapValueRow[]>("queryHeatmapEntityTotals.sql", {
      kind: "specialized", operation: "queryHeatmapEntityTotals", entityName: input.entityName,
    }, () => Prisma.sql`
      WITH ${metric}
      SELECT customer_code AS "customerCode", SUM(amount)::double precision AS total
      FROM metric_active
      GROUP BY customer_code
    `);
    return rows.map((row) => ({ customerCode: row.customerCode, total: Number(row.total) }));
  }

  async queryHeatmapSales(input: RieHeatmapSalesQuery): Promise<RieHeatmapValueRow[]> {
    if (!input.companyId?.trim()) throw new Error("RIE Heatmap sales require companyId.");
    const allowedRoutes = input.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser)
      : null;
    const routePredicates = (source: "invoice_source" | "item_source"): Prisma.Sql[] => allowedRoutes === null
      ? []
      : allowedRoutes.size
        ? [Prisma.sql`${normalizedField({ field: "RouteID", source })} IN (${Prisma.join([...allowedRoutes])})`]
        : [Prisma.sql`FALSE`];
    const invoiceNo = Prisma.sql`BTRIM(COALESCE(${textField({ field: "InvoiceNo", source: "invoice_source" })}, ''))`;
    const customerCode = Prisma.sql`BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "invoice_source" })}, ''))`;
    const invoiceTime = heatmapEpochField(textField({ field: "InvoiceDate", source: "invoice_source" }));
    const invoicePredicates = routePredicates("invoice_source");
    invoicePredicates.push(Prisma.sql`${customerCode} <> ''`);
    if (input.mode === "sales" && input.customerCodes) invoicePredicates.push(input.customerCodes.length
      ? Prisma.sql`${customerCode} IN (${Prisma.join([...input.customerCodes])})`
      : Prisma.sql`FALSE`);
    if (input.mode === "sales") {
      if (input.fromTime !== undefined) invoicePredicates.push(Prisma.sql`${invoiceTime} >= ${input.fromTime}`);
      if (input.toTime !== undefined) invoicePredicates.push(Prisma.sql`${invoiceTime} <= ${input.toTime}`);
    }
    const invoiceProjection = Prisma.sql`
      invoice_source.id AS source_row_id,
      invoice_source.precedence AS source_precedence,
      invoice_source."created_at" AS source_created_at,
      ${invoiceNo} AS invoice_no,
      ${customerCode} AS customer_code,
      ${invoiceTime} AS invoice_time
    `;
    const itemProjection = Prisma.sql`
      BTRIM(COALESCE(${textField({ field: "InvoiceNo", source: "item_source" })}, '')) AS invoice_no,
      BTRIM(COALESCE(${textField({ field: "ProductCode", source: "item_source" })}, '')) AS product_code,
      COALESCE(${geoFiniteNumberField(textField({ field: "LineTotal", source: "item_source" }))}, 0::double precision) AS amount
    `;
    const invoices = activeEntityRowsCte(input.companyId, "Invoices", "invoice", invoicePredicates, [], [], false, [], invoiceProjection);
    const items = activeEntityRowsCte(input.companyId, "Invoice Items", "item", routePredicates("item_source"), [], [], false, [], itemProjection);
    const productCode = Prisma.sql`BTRIM(COALESCE(${textField({ field: "ProductCode", source: "product_source" })}, ''))`;
    const productProjection = Prisma.sql`
      product_source.id AS source_row_id,
      product_source.precedence AS source_precedence,
      product_source."created_at" AS source_created_at,
      ${productCode} AS product_code,
      COALESCE(${textField({ field: "Category", source: "product_source" })}, '') AS category
    `;
    const products = input.categoryValue
      ? activeEntityRowsCte(input.companyId, "Products", "product", [], [], [], false, [], productProjection)
      : null;
    const ctes: Prisma.Sql[] = [invoices, items];
    if (products) ctes.push(products);

    if (input.mode === "sales") {
      const rows = await this.postgres<RieHeatmapValueRow[]>("queryHeatmapSales.sql", {
        kind: "specialized", operation: "queryHeatmapSales", mode: input.mode, hasCategory: Boolean(input.categoryValue),
      }, () => Prisma.sql`
        WITH ${Prisma.join(ctes, ", ")}
        SELECT invoice.customer_code AS "customerCode", SUM(item.amount)::double precision AS total
        FROM invoice_active invoice
        INNER JOIN item_active item ON item.invoice_no = invoice.invoice_no
        ${input.categoryValue ? Prisma.sql`INNER JOIN product_active product ON product.product_code = item.product_code` : Prisma.empty}
        WHERE TRUE ${input.categoryValue ? Prisma.sql`AND product.category = ${input.categoryValue}` : Prisma.empty}
        GROUP BY invoice.customer_code
      `);
      return rows.map((row) => ({ customerCode: row.customerCode, total: Number(row.total) }));
    }

    const rows = await this.postgres<RieHeatmapValueRow[]>("queryHeatmapSales.sql", {
      kind: "specialized", operation: "queryHeatmapSales", mode: input.mode, hasCategory: Boolean(input.categoryValue),
    }, () => Prisma.sql`
      WITH ${Prisma.join(ctes, ", ")}, invoice_lookup AS MATERIALIZED (
        SELECT invoice_no, customer_code, invoice_time
        FROM (
          SELECT invoice_no, customer_code, invoice_time,
            ROW_NUMBER() OVER (PARTITION BY invoice_no ORDER BY source_precedence DESC, source_created_at DESC, source_row_id DESC) AS row_number
          FROM invoice_active
          WHERE invoice_no <> ''
        ) ranked
        WHERE row_number = 1
      )
      ${input.categoryValue ? Prisma.sql`, product_lookup AS MATERIALIZED (
        SELECT product_code, category
        FROM (
          SELECT product_code, category,
            ROW_NUMBER() OVER (PARTITION BY product_code ORDER BY source_precedence DESC, source_created_at DESC, source_row_id DESC) AS row_number
          FROM product_active
          WHERE product_code <> ''
        ) ranked
        WHERE row_number = 1
      )` : Prisma.empty}, joined AS MATERIALIZED (
        SELECT invoice.customer_code, invoice.invoice_time, item.product_code, item.amount
        FROM item_active item
        INNER JOIN invoice_lookup invoice ON invoice.invoice_no = item.invoice_no
        ${input.categoryValue ? Prisma.sql`INNER JOIN product_lookup product ON product.product_code = item.product_code` : Prisma.empty}
        WHERE (invoice.invoice_time BETWEEN ${input.priorFromTime!} AND ${input.priorToTime!}
          OR invoice.invoice_time BETWEEN ${input.fromTime!} AND ${input.toTime!})
          ${input.customerCodes ? input.customerCodes.length
            ? Prisma.sql`AND invoice.customer_code IN (${Prisma.join([...input.customerCodes])})`
            : Prisma.sql`AND FALSE` : Prisma.empty}
          ${input.categoryValue ? Prisma.sql`AND product.category = ${input.categoryValue}` : Prisma.empty}
      )
      ${input.mode === "lostSales" ? Prisma.sql`, by_customer_product AS MATERIALIZED (
        SELECT customer_code, product_code,
          SUM(amount) FILTER (WHERE invoice_time BETWEEN ${input.priorFromTime!} AND ${input.priorToTime!})::double precision AS prior_value,
          COUNT(*) FILTER (WHERE invoice_time BETWEEN ${input.fromTime!} AND ${input.toTime!}) AS recent_count
        FROM joined
        WHERE customer_code <> '' AND product_code <> ''
        GROUP BY customer_code, product_code
      )
      SELECT customer_code AS "customerCode", SUM(prior_value)::double precision AS total
      FROM by_customer_product
      WHERE prior_value IS NOT NULL AND recent_count = 0
      GROUP BY customer_code` : Prisma.sql`, by_customer AS MATERIALIZED (
        SELECT customer_code,
          SUM(amount) FILTER (WHERE invoice_time BETWEEN ${input.priorFromTime!} AND ${input.priorToTime!})::double precision AS prior_total,
          COALESCE(SUM(amount) FILTER (WHERE invoice_time BETWEEN ${input.fromTime!} AND ${input.toTime!}), 0)::double precision AS recent_total
        FROM joined
        WHERE customer_code <> ''
        GROUP BY customer_code
      )
      SELECT customer_code AS "customerCode", (prior_total - recent_total)::double precision AS total
      FROM by_customer
      WHERE prior_total IS NOT NULL AND prior_total - recent_total > 0`}
    `);
    return rows.map((row) => ({ customerCode: row.customerCode, total: Number(row.total) }));
  }

  async queryVisitEfficiency(input: RieVisitEfficiencyQuery): Promise<RieVisitEfficiencyResult> {
    if (!input.companyId?.trim()) throw new Error("RIE Visit Efficiency requires companyId.");
    const allowedRoutes = input.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser)
      : null;
    const hierarchy = (source: "visit_source" | "route_source" | "customer_source"): Prisma.Sql[] => allowedRoutes === null
      ? []
      : allowedRoutes.size
        ? [Prisma.sql`${normalizedField({ field: "RouteID", source })} IN (${Prisma.join([...allowedRoutes])})`]
        : [Prisma.sql`FALSE`];
    const customerCode = Prisma.sql`BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "customer_source" })}, ''))`;
    const customerProjection = Prisma.sql`
      customer_source.id AS source_row_id,
      customer_source.precedence AS source_precedence,
      customer_source."created_at" AS source_created_at,
      ${customerCode} AS customer_id,
      COALESCE(${textField({ field: "RouteID", source: "customer_source" })}, '') AS route_id,
      COALESCE(${textField({ field: "City", source: "customer_source" })}, '') AS city,
      COALESCE(${textField({ field: "CustomerClass", source: "customer_source" })}, '') AS customer_class,
      COALESCE(${textField({ field: "Channel", source: "customer_source" })}, '') AS channel,
      ${geoFiniteNumberField(textField({ field: "Latitude", source: "customer_source" }))} AS latitude,
      ${geoFiniteNumberField(textField({ field: "Longitude", source: "customer_source" }))} AS longitude
    `;
    const routeProjection = Prisma.sql`
      route_source.id AS source_row_id,
      route_source.precedence AS source_precedence,
      route_source."created_at" AS source_created_at,
      BTRIM(COALESCE(${textField({ field: "RouteID", source: "route_source" })}, '')) AS route_id,
      BTRIM(COALESCE(${textField({ field: "SalesRepID", source: "route_source" })}, '')) AS sales_rep_id
    `;
    const employeeProjection = Prisma.sql`
      employee_source.id AS source_row_id,
      employee_source.precedence AS source_precedence,
      employee_source."created_at" AS source_created_at,
      BTRIM(COALESCE(${textField({ field: "EmployeeID", source: "employee_source" })}, '')) AS employee_id,
      COALESCE(${textField({ field: "EmployeeName", source: "employee_source" })}, BTRIM(COALESCE(${textField({ field: "EmployeeID", source: "employee_source" })}, ''))) AS employee_name
    `;
    const visitDate = textField({ field: "VisitDate", source: "visit_source" });
    const visitTime = visitEfficiencyEpochField(visitDate);
    const checkInTime = heatmapEpochField(textField({ field: "CheckInTime", source: "visit_source" }));
    const visitPredicates = hierarchy("visit_source");
    if (input.requireValidDate) visitPredicates.push(Prisma.sql`${visitTime} IS NOT NULL`);
    if (input.fromTime !== undefined) visitPredicates.push(Prisma.sql`${visitTime} >= ${input.fromTime}`);
    if (input.toTime !== undefined) visitPredicates.push(Prisma.sql`${visitTime} <= ${input.toTime}`);
    const visitProjection = Prisma.sql`
      visit_source.id AS source_row_id,
      visit_source.precedence AS source_precedence,
      visit_source."created_at" AS source_created_at,
      BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "visit_source" })}, '')) AS customer_id,
      BTRIM(COALESCE(${textField({ field: "RouteID", source: "visit_source" })}, '')) AS route_id,
      CASE
        WHEN BTRIM(COALESCE(${visitDate}, '')) ~ '^\\d{4}-\\d{2}-\\d{2}$'
        THEN BTRIM(${visitDate})
        WHEN BTRIM(COALESCE(${visitDate}, '')) ~ '^\\d{4}-\\d{2}-\\d{2}'
        THEN TO_CHAR(BTRIM(${visitDate})::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD')
        ELSE BTRIM(COALESCE(${visitDate}, ''))
      END AS date_key,
      ${checkInTime} AS check_in_time,
      ${geoFiniteNumberField(textField({ field: "Latitude", source: "visit_source" }))} AS latitude,
      ${geoFiniteNumberField(textField({ field: "Longitude", source: "visit_source" }))} AS longitude
    `;
    const customers = activeEntityRowsCte(input.companyId, "Customers", "customer", hierarchy("customer_source"), [], [], false, [], customerProjection);
    const routes = activeEntityRowsCte(input.companyId, "Routes", "route", hierarchy("route_source"), [], [], false, [], routeProjection);
    const employees = activeEntityRowsCte(input.companyId, "Employees", "employee", [], [], [], false, [], employeeProjection);
    const visits = activeEntityRowsCte(input.companyId, "Visits", "visit", visitPredicates, [], [], false, [], visitProjection);
    const scopeColumn = input.scopeField ? {
      RouteID: "route_id", City: "city", CustomerClass: "customer_class", Channel: "channel",
    }[input.scopeField] : null;
    const scopePredicate = scopeColumn && input.scopeValues?.length
      ? Prisma.sql`AND ${Prisma.raw(scopeColumn)} IN (${Prisma.join([...input.scopeValues])})`
      : Prisma.empty;
    const rows = await this.postgres<RieVisitEfficiencyResult[]>("queryVisitEfficiency.sql", {
      kind: "specialized", operation: "queryVisitEfficiency", scopeField: input.scopeField ?? null,
    }, () => Prisma.sql`
      WITH ${customers}, ${routes}, ${employees}, ${visits},
      customer_lookup AS MATERIALIZED (
        SELECT customer_id, route_id, city, customer_class, channel, latitude, longitude
        FROM (
          SELECT customer_id, route_id, city, customer_class, channel, latitude, longitude,
            ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY source_precedence ASC, source_created_at ASC, source_row_id ASC) AS row_number
          FROM customer_active
          WHERE customer_id <> ''
        ) ranked
        WHERE row_number = 1
      ), scoped_customers AS MATERIALIZED (
        SELECT * FROM customer_lookup WHERE TRUE ${scopePredicate}
      ), route_lookup AS MATERIALIZED (
        SELECT route_id, sales_rep_id
        FROM (
          SELECT route_id, sales_rep_id,
            ROW_NUMBER() OVER (PARTITION BY route_id ORDER BY source_precedence DESC, source_created_at DESC, source_row_id DESC) AS row_number
          FROM route_active
          WHERE route_id <> '' AND sales_rep_id <> ''
        ) ranked
        WHERE row_number = 1
      ), employee_lookup AS MATERIALIZED (
        SELECT employee_id, employee_name
        FROM (
          SELECT employee_id, employee_name,
            ROW_NUMBER() OVER (PARTITION BY employee_id ORDER BY source_precedence DESC, source_created_at DESC, source_row_id DESC) AS row_number
          FROM employee_active
          WHERE employee_id <> ''
        ) ranked
        WHERE row_number = 1
      ), ordered_visits AS MATERIALIZED (
        SELECT visit.*,
          ROW_NUMBER() OVER (ORDER BY source_precedence ASC, source_created_at ASC, source_row_id ASC) - 1 AS source_order
        FROM visit_active visit
        ${scopeColumn && input.scopeValues?.length ? Prisma.sql`INNER JOIN scoped_customers scoped ON scoped.customer_id = visit.customer_id` : Prisma.empty}
      ), prepared AS MATERIALIZED (
        SELECT visit.customer_id, visit.date_key, visit.source_order,
          COALESCE(employee.employee_name, route.sales_rep_id, visit.route_id) AS rep,
          COALESCE(visit.check_in_time, visit.source_order::double precision) AS time_sort,
          visit.check_in_time IS NOT NULL AS has_check_in,
          CASE
            WHEN visit.latitude BETWEEN -90 AND 90 AND visit.longitude BETWEEN -180 AND 180 AND NOT (visit.latitude = 0 AND visit.longitude = 0) THEN visit.latitude
            WHEN customer.latitude BETWEEN -90 AND 90 AND customer.longitude BETWEEN -180 AND 180 AND NOT (customer.latitude = 0 AND customer.longitude = 0) THEN customer.latitude
            ELSE NULL
          END AS latitude,
          CASE
            WHEN visit.latitude BETWEEN -90 AND 90 AND visit.longitude BETWEEN -180 AND 180 AND NOT (visit.latitude = 0 AND visit.longitude = 0) THEN visit.longitude
            WHEN customer.latitude BETWEEN -90 AND 90 AND customer.longitude BETWEEN -180 AND 180 AND NOT (customer.latitude = 0 AND customer.longitude = 0) THEN customer.longitude
            ELSE NULL
          END AS longitude
        FROM ordered_visits visit
        LEFT JOIN route_lookup route ON route.route_id = visit.route_id
        LEFT JOIN employee_lookup employee ON employee.employee_id = route.sales_rep_id
        LEFT JOIN customer_lookup customer ON customer.customer_id = visit.customer_id
      ), eligible AS MATERIALIZED (
        SELECT *, rep || ' ' || date_key AS group_key
        FROM prepared
        WHERE rep <> '' AND date_key <> ''
      ), group_stats AS MATERIALIZED (
        SELECT group_key, COUNT(*)::double precision AS group_count,
          COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL)::double precision AS coordinate_count,
          MIN(source_order) AS group_order
        FROM eligible
        GROUP BY group_key
      ), sequenced AS MATERIALIZED (
        SELECT eligible.*,
          stats.group_order,
          ROW_NUMBER() OVER (PARTITION BY eligible.group_key ORDER BY eligible.time_sort ASC, eligible.source_order ASC) - 1 AS sequence,
          LAG(eligible.latitude) OVER (PARTITION BY eligible.group_key ORDER BY eligible.time_sort ASC, eligible.source_order ASC) AS previous_latitude,
          LAG(eligible.longitude) OVER (PARTITION BY eligible.group_key ORDER BY eligible.time_sort ASC, eligible.source_order ASC) AS previous_longitude
        FROM eligible
        INNER JOIN group_stats stats ON stats.group_key = eligible.group_key
        WHERE stats.coordinate_count >= 2 AND eligible.latitude IS NOT NULL AND eligible.longitude IS NOT NULL
      ), points AS MATERIALIZED (
        SELECT customer_id || '-' || sequence AS id, customer_id AS label, latitude AS lat, longitude AS lon,
          CASE WHEN sequence = 0 THEN 0::double precision ELSE
            2 * 6371::double precision * ASIN(SQRT(LEAST(1::double precision,
              POWER(SIN(RADIANS(latitude - previous_latitude) / 2), 2)
              + COS(RADIANS(previous_latitude)) * COS(RADIANS(latitude))
              * POWER(SIN(RADIANS(longitude - previous_longitude) / 2), 2)
            ))) END AS value,
          rep, date_key, group_key, group_order, sequence
        FROM sequenced
      ), rep_summary AS MATERIALIZED (
        SELECT rep,
          COUNT(DISTINCT group_key)::double precision AS visit_days,
          COUNT(*)::double precision AS total_visits,
          SUM(value)::double precision AS total_distance,
          MIN(group_order) AS rep_order
        FROM points
        GROUP BY rep
      )
      SELECT
        (SELECT COUNT(*)::double precision FROM points) AS "usedVisits",
        COALESCE((SELECT SUM(group_count - coordinate_count)::double precision FROM group_stats), 0) AS "excludedNoCoordinates",
        COALESCE((SELECT COUNT(*)::double precision FROM group_stats WHERE group_count = 1), 0) AS "excludedSingleVisitDays",
        COALESCE((SELECT BOOL_OR(has_check_in) FROM prepared), FALSE) AS "timeColumnUsed",
        (SELECT COUNT(*)::double precision FROM scoped_customers) AS "matchedScopeRows",
        COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
          'id', id, 'label', label, 'lat', lat, 'lon', lon, 'value', value, 'rep', rep, 'dateKey', date_key
        ) ORDER BY group_order, sequence) FROM points), '[]'::jsonb) AS points,
        COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
          'rep', rep, 'visitDays', visit_days, 'totalVisits', total_visits,
          'totalDistanceKm', total_distance,
          'avgDistanceKmPerVisit', CASE WHEN total_visits > 0 THEN total_distance / total_visits ELSE 0 END
        ) ORDER BY total_distance DESC, rep_order) FROM rep_summary), '[]'::jsonb) AS "repSummaries"
    `);
    const result = rows[0] ?? {
      usedVisits: 0, excludedNoCoordinates: 0, excludedSingleVisitDays: 0,
      timeColumnUsed: false, matchedScopeRows: 0, points: [], repSummaries: [],
    };
    return {
      ...result,
      usedVisits: Number(result.usedVisits),
      excludedNoCoordinates: Number(result.excludedNoCoordinates),
      excludedSingleVisitDays: Number(result.excludedSingleVisitDays),
      matchedScopeRows: Number(result.matchedScopeRows),
      points: result.points.map((point) => ({ ...point, lat: Number(point.lat), lon: Number(point.lon), value: Number(point.value) })),
      repSummaries: result.repSummaries.map((summary) => ({
        ...summary,
        visitDays: Number(summary.visitDays), totalVisits: Number(summary.totalVisits),
        totalDistanceKm: Number(summary.totalDistanceKm), avgDistanceKmPerVisit: Number(summary.avgDistanceKmPerVisit),
      })),
    };
  }

  async queryTerritorySummary(input: RieTerritorySummaryQuery): Promise<RieTerritorySummaryFactRow[]> {
    if (!input.companyId?.trim()) throw new Error("RIE Territory summary requires companyId.");
    const allowedRoutes = input.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser)
      : null;
    const hierarchy = (source: "customer_source" | "invoice_source" | "visit_source"): Prisma.Sql[] => allowedRoutes === null
      ? []
      : allowedRoutes.size
        ? [Prisma.sql`${normalizedField({ field: "RouteID", source })} IN (${Prisma.join([...allowedRoutes])})`]
        : [Prisma.sql`FALSE`];
    const customerProjection = Prisma.sql`
      customer_source.id AS source_row_id,
      customer_source.precedence AS source_precedence,
      customer_source."created_at" AS source_created_at,
      BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "customer_source" })}, '')) AS customer_code,
      BTRIM(COALESCE(${textField({ field: "City", source: "customer_source" })}, '')) AS city,
      ${territoryFiniteNumberField(textField({ field: "Latitude", source: "customer_source" }))} AS latitude,
      ${territoryFiniteNumberField(textField({ field: "Longitude", source: "customer_source" }))} AS longitude
    `;
    const customers = activeEntityRowsCte(input.companyId, "Customers", "customer", hierarchy("customer_source"), [], [], false, [], customerProjection);
    const invoiceDate = territoryEpochField(textField({ field: "InvoiceDate", source: "invoice_source" }));
    const invoicePredicates = [
      ...hierarchy("invoice_source"),
      input.invoicesAvailable ? Prisma.sql`TRUE` : Prisma.sql`FALSE`,
      Prisma.sql`BTRIM(COALESCE(${textField({ field: "InvoiceStatus", source: "invoice_source" })}, '')) = 'Confirmed'`,
      Prisma.sql`((${invoiceDate} >= ${input.currentFromTime} AND ${invoiceDate} <= ${input.currentToTime}) OR (${invoiceDate} >= ${input.priorFromTime} AND ${invoiceDate} <= ${input.priorToTime}))`,
      Prisma.sql`BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "invoice_source" })}, '')) IN (SELECT customer_code FROM customer_mapping)`,
    ];
    const invoiceProjection = Prisma.sql`
      invoice_source.id AS source_row_id,
      invoice_source.precedence AS source_precedence,
      invoice_source."created_at" AS source_created_at,
      BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "invoice_source" })}, '')) AS customer_code,
      ${invoiceDate} AS event_time,
      COALESCE(${territoryFiniteNumberField(textField({ field: "TotalAfterVAT", source: "invoice_source" }))}, 0::double precision) AS amount
    `;
    const invoices = activeEntityRowsCte(input.companyId, "Invoices", "invoice", invoicePredicates, [], [], false, [], invoiceProjection);
    const visitDate = territoryEpochField(textField({ field: "VisitDate", source: "visit_source" }));
    const visitPredicates = [
      ...hierarchy("visit_source"),
      input.visitsAvailable ? Prisma.sql`TRUE` : Prisma.sql`FALSE`,
      Prisma.sql`${visitDate} >= ${input.currentFromTime} AND ${visitDate} <= ${input.currentToTime}`,
      Prisma.sql`BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "visit_source" })}, '')) IN (SELECT customer_code FROM customer_mapping)`,
    ];
    const visitProjection = Prisma.sql`
      BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "visit_source" })}, '')) AS customer_code
    `;
    const visits = activeEntityRowsCte(input.companyId, "Visits", "visit", visitPredicates, [], [], false, [], visitProjection);
    const situationPredicate = input.situationCustomerCodes.length
      ? Prisma.sql`customer_code IN (${Prisma.join([...new Set(input.situationCustomerCodes)])})`
      : Prisma.sql`FALSE`;
    const rows = await this.postgres<Array<{
      territoryId: string; name: string; lat: number; lon: number; customerCount: number;
      salesCurrent: number; salesPrior: number; activeCurrentCount: number; visitedCustomerCount: number;
      situationCustomerCodes: string[];
    }>>("queryTerritorySummary.sql", {
      kind: "specialized", operation: "queryTerritorySummary",
      invoicesAvailable: input.invoicesAvailable, visitsAvailable: input.visitsAvailable,
      situationCustomerCount: input.situationCustomerCodes.length,
    }, () => Prisma.sql`
      WITH ${customers},
      customer_ordered AS MATERIALIZED (
        SELECT customer_active.*,
          ROW_NUMBER() OVER (ORDER BY source_precedence ASC, source_created_at ASC, source_row_id ASC) - 1 AS source_order
        FROM customer_active
      ), territory_customers AS MATERIALIZED (
        SELECT ${territorySlugField(Prisma.sql`city`)} AS territory_id,
          city, customer_code, latitude, longitude, source_order
        FROM customer_ordered
        WHERE city <> '' AND customer_code <> ''
      ), customer_mapping AS MATERIALIZED (
        SELECT customer_code, territory_id, source_order
        FROM (
          SELECT customer_code, territory_id, source_order,
            ROW_NUMBER() OVER (PARTITION BY customer_code ORDER BY source_order DESC) AS row_number
          FROM territory_customers
        ) ranked
        WHERE row_number = 1 AND territory_id <> ''
      ), territories AS MATERIALIZED (
        SELECT territory_id,
          (ARRAY_AGG(city ORDER BY source_order))[1] AS name,
          COUNT(DISTINCT customer_code)::double precision AS customer_count,
          CASE WHEN COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) > 0
            THEN SUM(latitude ORDER BY source_order) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL)
              / COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL)
            ELSE 0::double precision END AS latitude,
          CASE WHEN COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) > 0
            THEN SUM(longitude ORDER BY source_order) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL)
              / COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL)
            ELSE 0::double precision END AS longitude,
          MIN(source_order) AS territory_order
        FROM territory_customers
        GROUP BY territory_id
      ), situation_mapping AS MATERIALIZED (
        SELECT territory_id, ARRAY_AGG(customer_code ORDER BY source_order) AS situation_customer_codes
        FROM customer_mapping
        WHERE ${situationPredicate}
        GROUP BY territory_id
      ), ${invoices},
      invoice_ordered AS MATERIALIZED (
        SELECT invoice_active.*,
          ROW_NUMBER() OVER (ORDER BY source_precedence ASC, source_created_at ASC, source_row_id ASC) - 1 AS source_order
        FROM invoice_active
      ), invoice_totals AS MATERIALIZED (
        SELECT mapping.territory_id,
          COALESCE(SUM(invoice.amount ORDER BY invoice.source_order) FILTER (WHERE invoice.event_time >= ${input.currentFromTime} AND invoice.event_time <= ${input.currentToTime}), 0::double precision) AS sales_current,
          COALESCE(SUM(invoice.amount ORDER BY invoice.source_order) FILTER (WHERE invoice.event_time >= ${input.priorFromTime} AND invoice.event_time <= ${input.priorToTime}), 0::double precision) AS sales_prior,
          COUNT(DISTINCT invoice.customer_code) FILTER (WHERE invoice.event_time >= ${input.currentFromTime} AND invoice.event_time <= ${input.currentToTime})::double precision AS active_current_count
        FROM invoice_ordered invoice
        INNER JOIN customer_mapping mapping ON mapping.customer_code = invoice.customer_code
        GROUP BY mapping.territory_id
      ), ${visits},
      visit_totals AS MATERIALIZED (
        SELECT mapping.territory_id, COUNT(DISTINCT visit.customer_code)::double precision AS visited_customer_count
        FROM visit_active visit
        INNER JOIN customer_mapping mapping ON mapping.customer_code = visit.customer_code
        GROUP BY mapping.territory_id
      )
      SELECT territory.territory_id AS "territoryId", territory.name,
        territory.latitude AS lat, territory.longitude AS lon,
        territory.customer_count AS "customerCount",
        COALESCE(invoice.sales_current, 0::double precision) AS "salesCurrent",
        COALESCE(invoice.sales_prior, 0::double precision) AS "salesPrior",
        COALESCE(invoice.active_current_count, 0::double precision) AS "activeCurrentCount",
        COALESCE(visit.visited_customer_count, 0::double precision) AS "visitedCustomerCount",
        COALESCE(situation.situation_customer_codes, ARRAY[]::text[]) AS "situationCustomerCodes"
      FROM territories territory
      LEFT JOIN invoice_totals invoice ON invoice.territory_id = territory.territory_id
      LEFT JOIN visit_totals visit ON visit.territory_id = territory.territory_id
      LEFT JOIN situation_mapping situation ON situation.territory_id = territory.territory_id
      ORDER BY territory.territory_order
    `);
    return rows.map((row) => ({
      ...row,
      lat: Number(row.lat), lon: Number(row.lon), customerCount: Number(row.customerCount),
      salesCurrent: Number(row.salesCurrent), salesPrior: Number(row.salesPrior),
      activeCurrentCount: Number(row.activeCurrentCount), visitedCustomerCount: Number(row.visitedCustomerCount),
    }));
  }

  async queryTerritoryCustomerFacts(input: RieTerritoryCustomerFactsQuery): Promise<RieTerritoryCustomerFactsResult> {
    if (!input.companyId?.trim()) throw new Error("RIE Territory customer facts require companyId.");
    const allowedRoutes = input.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser)
      : null;
    const hierarchy = (source: "customer_source" | "invoice_source" | "visit_source" | "collection_source"): Prisma.Sql[] => allowedRoutes === null
      ? []
      : allowedRoutes.size
        ? [Prisma.sql`${normalizedField({ field: "RouteID", source })} IN (${Prisma.join([...allowedRoutes])})`]
        : [Prisma.sql`FALSE`];
    const customerPredicates = hierarchy("customer_source");
    if (input.city !== undefined) customerPredicates.push(Prisma.sql`BTRIM(COALESCE(${textField({ field: "City", source: "customer_source" })}, '')) = ${input.city}`);
    const customerProjection = Prisma.sql`
      customer_source.id AS source_row_id,
      customer_source.precedence AS source_precedence,
      customer_source."created_at" AS source_created_at,
      BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "customer_source" })}, '')) AS customer_code,
      COALESCE(${textField({ field: "CustomerName", source: "customer_source" })}, BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "customer_source" })}, ''))) AS customer_name,
      ${territoryFiniteNumberField(textField({ field: "Latitude", source: "customer_source" }))} AS latitude,
      ${territoryFiniteNumberField(textField({ field: "Longitude", source: "customer_source" }))} AS longitude
    `;
    const customers = activeEntityRowsCte(input.companyId, "Customers", "customer", customerPredicates, [], [], false, [], customerProjection);
    const invoiceDate = territoryEpochField(textField({ field: "InvoiceDate", source: "invoice_source" }));
    const invoiceProjection = Prisma.sql`
      invoice_source.id AS source_row_id,
      invoice_source.precedence AS source_precedence,
      invoice_source."created_at" AS source_created_at,
      BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "invoice_source" })}, '')) AS customer_code,
      ${invoiceDate} AS event_time,
      COALESCE(${territoryFiniteNumberField(textField({ field: "TotalAfterVAT", source: "invoice_source" }))}, 0::double precision) AS amount
    `;
    const invoices = activeEntityRowsCte(input.companyId, "Invoices", "invoice", [
      ...hierarchy("invoice_source"),
      input.invoicesAvailable ? Prisma.sql`TRUE` : Prisma.sql`FALSE`,
      Prisma.sql`BTRIM(COALESCE(${textField({ field: "InvoiceStatus", source: "invoice_source" })}, '')) = 'Confirmed'`,
      Prisma.sql`((${invoiceDate} >= ${input.currentFromTime} AND ${invoiceDate} <= ${input.currentToTime}) OR (${invoiceDate} >= ${input.priorFromTime} AND ${invoiceDate} <= ${input.priorToTime}))`,
      Prisma.sql`BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "invoice_source" })}, '')) IN (SELECT customer_code FROM customer_lookup)`,
    ], [], [], false, [], invoiceProjection);
    const visitDate = territoryEpochField(textField({ field: "VisitDate", source: "visit_source" }));
    const visits = activeEntityRowsCte(input.companyId, "Visits", "visit", [
      ...hierarchy("visit_source"),
      input.visitsAvailable ? Prisma.sql`TRUE` : Prisma.sql`FALSE`,
      Prisma.sql`${visitDate} >= ${input.currentFromTime} AND ${visitDate} <= ${input.currentToTime}`,
      Prisma.sql`BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "visit_source" })}, '')) IN (SELECT customer_code FROM customer_lookup)`,
    ], [], [], false, [], Prisma.sql`BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "visit_source" })}, '')) AS customer_code`);
    const collectionDate = territoryEpochField(textField({ field: "CollectionDate", source: "collection_source" }));
    const collectionProjection = Prisma.sql`
      collection_source.id AS source_row_id,
      collection_source.precedence AS source_precedence,
      collection_source."created_at" AS source_created_at,
      BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "collection_source" })}, '')) AS customer_code,
      COALESCE(${territoryFiniteNumberField(textField({ field: "Amount", source: "collection_source" }))}, 0::double precision) AS amount
    `;
    const collections = activeEntityRowsCte(input.companyId, "Collections", "collection", [
      ...hierarchy("collection_source"),
      input.collectionsAvailable ? Prisma.sql`TRUE` : Prisma.sql`FALSE`,
      Prisma.sql`${collectionDate} >= ${input.currentFromTime} AND ${collectionDate} <= ${input.currentToTime}`,
      Prisma.sql`BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "collection_source" })}, '')) IN (SELECT customer_code FROM customer_lookup)`,
    ], [], [], false, [], collectionProjection);
    const rows = await this.postgres<Array<{
      customerId: string | null; customerName: string | null; latitude: number | null; longitude: number | null;
      salesCurrent: number | null; salesPrior: number | null; collectionCurrent: number | null;
      visitedCurrent: boolean | null; totalCustomers: number;
    }>>("queryTerritoryCustomerFacts.sql", {
      kind: "specialized", operation: "queryTerritoryCustomerFacts", hasCity: input.city !== undefined,
      invoicesAvailable: input.invoicesAvailable, visitsAvailable: input.visitsAvailable,
      collectionsAvailable: input.collectionsAvailable,
    }, () => Prisma.sql`
      WITH ${customers},
      customer_ordered AS MATERIALIZED (
        SELECT customer_active.*,
          ROW_NUMBER() OVER (ORDER BY source_precedence ASC, source_created_at ASC, source_row_id ASC) - 1 AS source_order
        FROM customer_active
      ), customer_summary AS MATERIALIZED (
        SELECT COUNT(*)::double precision AS total_customers FROM customer_ordered
      ), customer_lookup AS MATERIALIZED (
        SELECT customer_code, customer_name, latitude, longitude, customer_order
        FROM (
          SELECT customer_code, customer_name, latitude, longitude,
            MIN(source_order) OVER (PARTITION BY customer_code) AS customer_order,
            ROW_NUMBER() OVER (PARTITION BY customer_code ORDER BY source_order DESC) AS row_number
          FROM customer_ordered
          WHERE customer_code <> ''
        ) ranked
        WHERE row_number = 1
      ), ${invoices},
      invoice_ordered AS MATERIALIZED (
        SELECT invoice_active.*,
          ROW_NUMBER() OVER (ORDER BY source_precedence ASC, source_created_at ASC, source_row_id ASC) - 1 AS source_order
        FROM invoice_active
      ), invoice_totals AS MATERIALIZED (
        SELECT customer_code,
          COALESCE(SUM(amount ORDER BY source_order) FILTER (WHERE event_time >= ${input.currentFromTime} AND event_time <= ${input.currentToTime}), 0::double precision) AS sales_current,
          COALESCE(SUM(amount ORDER BY source_order) FILTER (WHERE event_time >= ${input.priorFromTime} AND event_time <= ${input.priorToTime}), 0::double precision) AS sales_prior
        FROM invoice_ordered
        GROUP BY customer_code
      ), ${visits},
      visited_customers AS MATERIALIZED (
        SELECT DISTINCT customer_code FROM visit_active
      ), ${collections},
      collection_ordered AS MATERIALIZED (
        SELECT collection_active.*,
          ROW_NUMBER() OVER (ORDER BY source_precedence ASC, source_created_at ASC, source_row_id ASC) - 1 AS source_order
        FROM collection_active
      ), collection_totals AS MATERIALIZED (
        SELECT customer_code, SUM(amount ORDER BY source_order)::double precision AS collection_current
        FROM collection_ordered
        GROUP BY customer_code
      )
      SELECT customer.customer_code AS "customerId", customer.customer_name AS "customerName",
        customer.latitude, customer.longitude,
        COALESCE(invoice.sales_current, 0::double precision) AS "salesCurrent",
        COALESCE(invoice.sales_prior, 0::double precision) AS "salesPrior",
        COALESCE(collection.collection_current, 0::double precision) AS "collectionCurrent",
        (visited.customer_code IS NOT NULL) AS "visitedCurrent",
        summary.total_customers AS "totalCustomers"
      FROM customer_summary summary
      LEFT JOIN customer_lookup customer ON TRUE
      LEFT JOIN invoice_totals invoice ON invoice.customer_code = customer.customer_code
      LEFT JOIN collection_totals collection ON collection.customer_code = customer.customer_code
      LEFT JOIN visited_customers visited ON visited.customer_code = customer.customer_code
      ORDER BY customer.customer_order NULLS LAST
    `);
    const totalCustomers = Number(rows[0]?.totalCustomers ?? 0);
    return {
      totalCustomers,
      rows: rows.flatMap((row) => row.customerId === null || row.customerName === null
        ? []
        : [{
            customerId: row.customerId,
            customerName: row.customerName,
            latitude: row.latitude === null ? null : Number(row.latitude),
            longitude: row.longitude === null ? null : Number(row.longitude),
            salesCurrent: Number(row.salesCurrent ?? 0),
            salesPrior: Number(row.salesPrior ?? 0),
            collectionCurrent: Number(row.collectionCurrent ?? 0),
            visitedCurrent: Boolean(row.visitedCurrent),
          }]),
    };
  }

  /** Geo Engine dimensions with legacy last-duplicate-wins and hierarchy semantics. */
  private async geoEngineDimensions(input: RieGeoEngineFilters, includePeople: boolean, includeProducts: boolean): Promise<Prisma.Sql[]> {
    const allowedRoutes = input.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser)
      : null;
    const hierarchy = (source: string): Prisma.Sql[] => allowedRoutes === null
      ? []
      : allowedRoutes.size
        ? [Prisma.sql`${normalizedField({ field: "RouteID", source })} IN (${Prisma.join([...allowedRoutes])})`]
        : [Prisma.sql`FALSE`];
    const customers = activeEntityRowsCte(input.companyId, "Customers", "geo_customer", hierarchy("geo_customer_source"), [], [], false, [], Prisma.sql`
      geo_customer_source.id AS source_row_id,
      geo_customer_source."entity_key" AS entity_key,
      geo_customer_source.precedence AS source_precedence,
      geo_customer_source."created_at" AS source_created_at,
      BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "geo_customer_source" })}, '')) AS customer_code,
      ${textField({ field: "CustomerName", source: "geo_customer_source" })} AS customer_name,
      BTRIM(COALESCE(${textField({ field: "City", source: "geo_customer_source" })}, '')) AS city,
      BTRIM(COALESCE(${textField({ field: "Channel", source: "geo_customer_source" })}, '')) AS channel,
      BTRIM(COALESCE(${textField({ field: "BranchID", source: "geo_customer_source" })}, '')) AS branch_id,
      BTRIM(COALESCE(${textField({ field: "RouteID", source: "geo_customer_source" })}, '')) AS route_id,
      ${visitCopilotFiniteNumberField(textField({ field: "Latitude", source: "geo_customer_source" }))} AS latitude,
      ${visitCopilotFiniteNumberField(textField({ field: "Longitude", source: "geo_customer_source" }))} AS longitude
    `);
    const ctes: Prisma.Sql[] = [customers, Prisma.sql`
      geo_customer_ordered AS MATERIALIZED (
        SELECT customer.*, ROW_NUMBER() OVER (ORDER BY entity_key, source_precedence, source_created_at, source_row_id) AS source_order
        FROM geo_customer_active customer
      )
    `, Prisma.sql`
      geo_customer_ranked AS MATERIALIZED (
        SELECT customer.*,
          MIN(source_order) OVER (PARTITION BY customer_code) AS first_source_order,
          ROW_NUMBER() OVER (PARTITION BY customer_code ORDER BY source_order DESC) AS duplicate_rank
        FROM geo_customer_ordered customer
        WHERE customer_code <> ''
      )
    `, Prisma.sql`
      geo_customer_meta AS MATERIALIZED (
        SELECT customer_code, COALESCE(customer_name, customer_code) AS customer_name, city, channel, branch_id, route_id,
          latitude, longitude, first_source_order
        FROM geo_customer_ranked
        WHERE duplicate_rank = 1
      )
    `];

    if (includePeople) {
      const routes = activeEntityRowsCte(input.companyId, "Routes", "geo_route", hierarchy("geo_route_source"), [], [], false, [], Prisma.sql`
        geo_route_source.id AS source_row_id,
        geo_route_source."entity_key" AS entity_key,
        geo_route_source.precedence AS source_precedence,
        geo_route_source."created_at" AS source_created_at,
        BTRIM(COALESCE(${textField({ field: "RouteID", source: "geo_route_source" })}, '')) AS route_id,
        BTRIM(COALESCE(${textField({ field: "SalesRepID", source: "geo_route_source" })}, '')) AS sales_rep_id
      `);
      const employees = activeEntityRowsCte(input.companyId, "Employees", "geo_employee", [], [], [], false, [], Prisma.sql`
        geo_employee_source.id AS source_row_id,
        geo_employee_source."entity_key" AS entity_key,
        geo_employee_source.precedence AS source_precedence,
        geo_employee_source."created_at" AS source_created_at,
        BTRIM(COALESCE(${textField({ field: "EmployeeID", source: "geo_employee_source" })}, '')) AS employee_id,
        ${textField({ field: "EmployeeName", source: "geo_employee_source" })} AS employee_name,
        BTRIM(COALESCE(${textField({ field: "Email", source: "geo_employee_source" })}, '')) AS email,
        BTRIM(COALESCE(${textField({ field: "DirectManagerID", source: "geo_employee_source" })}, '')) AS manager_id
      `);
      ctes.push(routes, Prisma.sql`
        geo_route_meta AS MATERIALIZED (
          SELECT route_id, sales_rep_id FROM (
            SELECT route.*, ROW_NUMBER() OVER (PARTITION BY route_id ORDER BY entity_key DESC, source_precedence DESC, source_created_at DESC, source_row_id DESC) AS duplicate_rank
            FROM geo_route_active route WHERE route_id <> '' AND sales_rep_id <> ''
          ) ranked WHERE duplicate_rank = 1
        )
      `, employees, Prisma.sql`
        geo_employee_meta AS MATERIALIZED (
          SELECT employee_id, COALESCE(employee_name, employee_id) AS employee_name,
            COALESCE(NULLIF(email, ''), employee_id) AS email, manager_id
          FROM (
            SELECT employee.*, ROW_NUMBER() OVER (PARTITION BY employee_id ORDER BY entity_key DESC, source_precedence DESC, source_created_at DESC, source_row_id DESC) AS duplicate_rank
            FROM geo_employee_active employee WHERE employee_id <> ''
          ) ranked WHERE duplicate_rank = 1
        )
      `, Prisma.sql`
        geo_customer_resolved AS MATERIALIZED (
          SELECT customer.*,
            CASE WHEN customer.route_id = '' THEN NULL WHEN route.route_id IS NULL THEN customer.route_id WHEN rep.employee_id IS NULL THEN route.sales_rep_id ELSE rep.email END AS rep_email,
            CASE WHEN customer.route_id = '' THEN NULL WHEN route.route_id IS NULL THEN customer.route_id WHEN rep.employee_id IS NULL THEN route.sales_rep_id ELSE rep.employee_name END AS rep_name,
            CASE WHEN rep.employee_id IS NULL OR manager.employee_id IS NULL THEN NULL ELSE manager.email END AS supervisor_email,
            CASE WHEN rep.employee_id IS NULL OR manager.employee_id IS NULL THEN NULL ELSE manager.employee_name END AS supervisor_name
          FROM geo_customer_meta customer
          LEFT JOIN geo_route_meta route ON route.route_id = customer.route_id
          LEFT JOIN geo_employee_meta rep ON rep.employee_id = route.sales_rep_id
          LEFT JOIN geo_employee_meta manager ON manager.employee_id = rep.manager_id
        )
      `);
    } else {
      ctes.push(Prisma.sql`
        geo_customer_resolved AS MATERIALIZED (
          SELECT customer.*, NULL::text AS rep_email, NULL::text AS rep_name, NULL::text AS supervisor_email, NULL::text AS supervisor_name
          FROM geo_customer_meta customer
        )
      `);
    }

    const customerPredicates: Prisma.Sql[] = [];
    addGeoEngineValues(customerPredicates, Prisma.sql`customer.city`, input.cityValues);
    addGeoEngineValues(customerPredicates, Prisma.sql`customer.channel`, input.channelValues);
    addGeoEngineValues(customerPredicates, Prisma.sql`customer.branch_id`, input.branchIds);
    addGeoEngineValues(customerPredicates, Prisma.sql`customer.customer_code`, input.customerCodes);
    addGeoEngineValues(customerPredicates, Prisma.sql`customer.rep_email`, input.repEmails);
    addGeoEngineValues(customerPredicates, Prisma.sql`customer.supervisor_email`, input.supervisorEmails);
    ctes.push(Prisma.sql`
      geo_scoped_customers AS MATERIALIZED (
        SELECT customer.* FROM geo_customer_resolved customer
        ${customerPredicates.length ? Prisma.sql`WHERE ${Prisma.join(customerPredicates, " AND ")}` : Prisma.empty}
      )
    `);

    if (includeProducts) {
      const products = activeEntityRowsCte(input.companyId, "Products", "geo_product", [], [], [], false, [], Prisma.sql`
        geo_product_source.id AS source_row_id,
        geo_product_source."entity_key" AS entity_key,
        geo_product_source.precedence AS source_precedence,
        geo_product_source."created_at" AS source_created_at,
        BTRIM(COALESCE(${textField({ field: "ProductCode", source: "geo_product_source" })}, '')) AS product_code,
        ${textField({ field: "ProductName", source: "geo_product_source" })} AS product_name,
        BTRIM(COALESCE(${textField({ field: "Category", source: "geo_product_source" })}, '')) AS category,
        BTRIM(COALESCE(${textField({ field: "Brand", source: "geo_product_source" })}, '')) AS brand
      `);
      ctes.push(products, Prisma.sql`
        geo_product_meta AS MATERIALIZED (
          SELECT product_code, COALESCE(product_name, product_code) AS product_name, category, brand
          FROM (
            SELECT product.*, ROW_NUMBER() OVER (PARTITION BY product_code ORDER BY entity_key DESC, source_precedence DESC, source_created_at DESC, source_row_id DESC) AS duplicate_rank
            FROM geo_product_active product WHERE product_code <> ''
          ) ranked WHERE duplicate_rank = 1
        )
      `);
    }
    return ctes;
  }

  /** KPI-aware Geo Engine map facts; only the selected fact relation enters the plan. */
  async queryGeoEngineMap(input: RieGeoEngineMapQuery): Promise<RieGeoEngineMapResult> {
    if (!input.companyId?.trim()) throw new Error("RIE Geo Engine map requires companyId.");
    const salesKpi = input.kpi === "sales" || input.kpi === "orders" || input.kpi === "lostSales";
    const includePeople = Boolean(input.repEmails?.length || input.supervisorEmails?.length);
    const includeProducts = salesKpi && Boolean(input.categoryValues?.length || input.brandValues?.length);
    const ctes = await this.geoEngineDimensions(input, includePeople, includeProducts);
    const allowedRoutes = input.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser)
      : null;
    const hierarchy = (source: string): Prisma.Sql[] => allowedRoutes === null
      ? []
      : allowedRoutes.size
        ? [Prisma.sql`${normalizedField({ field: "RouteID", source })} IN (${Prisma.join([...allowedRoutes])})`]
        : [Prisma.sql`FALSE`];

    if (salesKpi) {
      const invoiceEpoch = geoEngineInvoiceEpochField({ field: "InvoiceDate", source: "geo_invoice_source" });
      const lower = input.kpi === "lostSales" ? Math.min(input.fromTime, input.priorFromTime) : input.fromTime;
      const upper = input.kpi === "lostSales" ? Math.max(input.toTime, input.priorToTime) : input.toTime;
      const invoices = activeEntityRowsCte(input.companyId, "Invoices", "geo_invoice", [
        input.invoicesAvailable ? Prisma.sql`TRUE` : Prisma.sql`FALSE`, ...hierarchy("geo_invoice_source"),
        Prisma.sql`${invoiceEpoch} >= ${lower} AND ${invoiceEpoch} <= ${upper}`,
        Prisma.sql`BTRIM(COALESCE(${textField({ field: "InvoiceNo", source: "geo_invoice_source" })}, '')) <> ''`,
        Prisma.sql`BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "geo_invoice_source" })}, '')) <> ''`,
      ], [], [], false, [], Prisma.sql`
        BTRIM(COALESCE(${textField({ field: "InvoiceNo", source: "geo_invoice_source" })}, '')) AS invoice_no,
        BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "geo_invoice_source" })}, '')) AS customer_code,
        ${invoiceEpoch} AS sales_time
      `);
      ctes.push(invoices, Prisma.sql`geo_relevant_invoice_numbers AS MATERIALIZED (SELECT DISTINCT invoice_no FROM geo_invoice_active)`);
      const items = activeEntityRowsCte(input.companyId, "Invoice Items", "geo_item", hierarchy("geo_item_source"), [
        Prisma.sql`BTRIM(COALESCE(${textField({ field: "InvoiceNo", source: "geo_item_source" })}, '')) IN (SELECT invoice_no FROM geo_relevant_invoice_numbers)`,
      ], [], false, [], Prisma.sql`
        BTRIM(COALESCE(${textField({ field: "InvoiceNo", source: "geo_item_source" })}, '')) AS invoice_no,
        BTRIM(COALESCE(${textField({ field: "ProductCode", source: "geo_item_source" })}, '')) AS product_code,
        COALESCE(NULLIF(REPLACE(BTRIM(${textField({ field: "LineTotal", source: "geo_item_source" })}), ',', ''), '')::double precision, 0::double precision) AS amount
      `);
      ctes.push(items, Prisma.sql`
        geo_sales_rows AS MATERIALIZED (
          SELECT invoice.invoice_no, invoice.sales_time, invoice.customer_code, item.product_code, SUM(item.amount)::double precision AS amount
          FROM geo_invoice_active invoice
          INNER JOIN geo_item_active item ON item.invoice_no = invoice.invoice_no
          GROUP BY invoice.invoice_no, invoice.sales_time, invoice.customer_code, item.product_code
        )
      `);
      const productPredicates: Prisma.Sql[] = [];
      addGeoEngineValues(productPredicates, Prisma.sql`sales.product_code`, input.productCodes);
      addGeoEngineValues(productPredicates, Prisma.sql`product.category`, input.categoryValues);
      addGeoEngineValues(productPredicates, Prisma.sql`product.brand`, input.brandValues);
      ctes.push(Prisma.sql`
        geo_filtered_sales AS MATERIALIZED (
          SELECT sales.* FROM geo_sales_rows sales
          ${includeProducts ? Prisma.sql`LEFT JOIN geo_product_meta product ON product.product_code = sales.product_code` : Prisma.empty}
          ${productPredicates.length ? Prisma.sql`WHERE ${Prisma.join(productPredicates, " AND ")}` : Prisma.empty}
        )
      `);
      if (input.kpi === "sales") {
        ctes.push(Prisma.sql`
          geo_metric_values AS MATERIALIZED (
            SELECT sales.customer_code, SUM(sales.amount)::double precision AS value
            FROM geo_filtered_sales sales INNER JOIN geo_scoped_customers customer ON customer.customer_code = sales.customer_code
            WHERE sales.sales_time >= ${input.fromTime} AND sales.sales_time <= ${input.toTime}
            GROUP BY sales.customer_code
          )
        `);
      } else if (input.kpi === "orders") {
        ctes.push(Prisma.sql`
          geo_metric_values AS MATERIALIZED (
            SELECT sales.customer_code, COUNT(DISTINCT sales.invoice_no)::double precision AS value
            FROM geo_filtered_sales sales INNER JOIN geo_scoped_customers customer ON customer.customer_code = sales.customer_code
            WHERE sales.sales_time >= ${input.fromTime} AND sales.sales_time <= ${input.toTime}
            GROUP BY sales.customer_code
          )
        `);
      } else {
        ctes.push(Prisma.sql`
          geo_prior_skus AS MATERIALIZED (
            SELECT sales.customer_code, sales.product_code, SUM(sales.amount)::double precision AS value
            FROM geo_filtered_sales sales INNER JOIN geo_scoped_customers customer ON customer.customer_code = sales.customer_code
            WHERE sales.sales_time >= ${input.priorFromTime} AND sales.sales_time <= ${input.priorToTime}
            GROUP BY sales.customer_code, sales.product_code
          )
        `, Prisma.sql`
          geo_recent_skus AS MATERIALIZED (
            SELECT DISTINCT sales.customer_code, sales.product_code
            FROM geo_filtered_sales sales INNER JOIN geo_scoped_customers customer ON customer.customer_code = sales.customer_code
            WHERE sales.sales_time >= ${input.fromTime} AND sales.sales_time <= ${input.toTime}
          )
        `, Prisma.sql`
          geo_metric_values AS MATERIALIZED (
            SELECT prior.customer_code, SUM(prior.value)::double precision AS value
            FROM geo_prior_skus prior
            LEFT JOIN geo_recent_skus recent ON recent.customer_code = prior.customer_code AND recent.product_code = prior.product_code
            WHERE recent.product_code IS NULL
            GROUP BY prior.customer_code
            HAVING SUM(prior.value) > 0
          )
        `);
      }
    } else if (input.kpi === "collections" || input.kpi === "returns" || input.kpi === "visits") {
      const config = input.kpi === "collections"
        ? { entity: "Collections", alias: "geo_fact", dateField: "CollectionDate", customerField: "CustomerCode", amountField: "Amount" }
        : input.kpi === "returns"
          ? { entity: "Returns", alias: "geo_fact", dateField: "ReturnDate", customerField: "CustomerCode", amountField: "TotalAmount" }
          : { entity: "Visits", alias: "geo_fact", dateField: "VisitDate", customerField: "CustomerCode", amountField: null };
      const factEpoch = geoEngineEpochField({ field: config.dateField, source: "geo_fact_source" });
      const fact = activeEntityRowsCte(input.companyId, config.entity, config.alias, [
        ...hierarchy("geo_fact_source"), Prisma.sql`${factEpoch} >= ${input.fromTime} AND ${factEpoch} <= ${input.toTime}`,
      ], [], [], false, [], Prisma.sql`
        BTRIM(COALESCE(${textField({ field: config.customerField, source: "geo_fact_source" })}, '')) AS customer_code,
        ${config.amountField ? Prisma.sql`COALESCE(${visitCopilotFiniteNumberField(textField({ field: config.amountField, source: "geo_fact_source" }))}, 0::double precision)` : Prisma.sql`1::double precision`} AS value
      `);
      ctes.push(fact, Prisma.sql`
        geo_metric_values AS MATERIALIZED (
          SELECT fact.customer_code, SUM(fact.value)::double precision AS value
          FROM geo_fact_active fact INNER JOIN geo_scoped_customers customer ON customer.customer_code = fact.customer_code
          GROUP BY fact.customer_code
        )
      `);
    } else {
      ctes.push(Prisma.sql`geo_metric_values AS MATERIALIZED (SELECT customer_code, 1::double precision AS value FROM geo_scoped_customers)`);
    }

    ctes.push(Prisma.sql`
      geo_customer_points AS MATERIALIZED (
        SELECT customer.customer_code AS id, customer.customer_name AS name, customer.latitude AS lat, customer.longitude AS lon,
          customer.city, COALESCE(metric.value, 0::double precision) AS value, customer.first_source_order
        FROM geo_scoped_customers customer
        LEFT JOIN geo_metric_values metric ON metric.customer_code = customer.customer_code
        WHERE customer.latitude BETWEEN -90 AND 90 AND customer.longitude BETWEEN -180 AND 180
          AND NOT (customer.latitude = 0 AND customer.longitude = 0)
      )
    `);
    const pointRows = input.groupBy === "city" ? Prisma.sql`
      SELECT ${territorySlugField(Prisma.sql`COALESCE(NULLIF(point.city, ''), point.name)`)} AS id,
        (ARRAY_AGG(COALESCE(NULLIF(point.city, ''), point.name) ORDER BY point.first_source_order))[1] AS name,
        AVG(point.lat)::double precision AS lat, AVG(point.lon)::double precision AS lon,
        (ARRAY_AGG(COALESCE(NULLIF(point.city, ''), point.name) ORDER BY point.first_source_order))[1] AS city,
        SUM(point.value)::double precision AS value, MIN(point.first_source_order) AS first_source_order
      FROM geo_customer_points point
      GROUP BY ${territorySlugField(Prisma.sql`COALESCE(NULLIF(point.city, ''), point.name)`)}
    ` : Prisma.sql`
      SELECT point.id, point.name, point.lat, point.lon, point.city, point.value, point.first_source_order
      FROM geo_customer_points point
    `;
    ctes.push(Prisma.sql`geo_point_rows AS MATERIALIZED (${pointRows})`);
    type RawResult = { points: RieGeoEngineMapResult["points"]; scopedCustomerCodes: string[]; totalRows: number; excludedBadCoordinates: number };
    const rows = await this.postgres<RawResult[]>("queryGeoEngineMap.sql", {
      kind: "specialized", operation: "queryGeoEngineMap", kpi: input.kpi, groupBy: input.groupBy,
    }, () => Prisma.sql`
      WITH ${Prisma.join(ctes, ", ")}
      SELECT COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT('id', point.id, 'name', point.name, 'lat', point.lat, 'lon', point.lon, 'city', point.city, 'value', point.value) ORDER BY point.first_source_order) FROM geo_point_rows point), '[]'::jsonb) AS points,
        COALESCE((SELECT JSONB_AGG(customer.customer_code ORDER BY customer.first_source_order) FROM geo_scoped_customers customer), '[]'::jsonb) AS "scopedCustomerCodes",
        (SELECT COUNT(*)::double precision FROM geo_scoped_customers) AS "totalRows",
        (SELECT COUNT(*)::double precision FROM geo_scoped_customers customer WHERE customer.latitude IS NULL OR customer.longitude IS NULL OR customer.latitude < -90 OR customer.latitude > 90 OR customer.longitude < -180 OR customer.longitude > 180 OR (customer.latitude = 0 AND customer.longitude = 0)) AS "excludedBadCoordinates"
    `);
    const row = rows[0];
    return {
      points: Array.isArray(row?.points) ? row.points.map((point) => ({ ...point, lat: Number(point.lat), lon: Number(point.lon), value: Number(point.value) })) : [],
      scopedCustomerCodes: Array.isArray(row?.scopedCustomerCodes) ? row.scopedCustomerCodes : [],
      totalRows: Number(row?.totalRows ?? 0),
      excludedBadCoordinates: Number(row?.excludedBadCoordinates ?? 0),
      invoicesAvailable: input.invoicesAvailable,
    };
  }

  /** Geo Engine detail rows are counted, ordered, and paged inside PostgreSQL. */
  async queryGeoEngineTable(input: RieGeoEngineTableQuery): Promise<RieGeoEngineTableResult> {
    if (!input.companyId?.trim()) throw new Error("RIE Geo Engine table requires companyId.");
    const ctes = await this.geoEngineDimensions(input, true, true);
    const allowedRoutes = input.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser)
      : null;
    const hierarchy = (source: string): Prisma.Sql[] => allowedRoutes === null
      ? []
      : allowedRoutes.size
        ? [Prisma.sql`${normalizedField({ field: "RouteID", source })} IN (${Prisma.join([...allowedRoutes])})`]
        : [Prisma.sql`FALSE`];
    const invoiceEpoch = geoEngineInvoiceEpochField({ field: "InvoiceDate", source: "geo_table_invoice_source" });
    const invoices = activeEntityRowsCte(input.companyId, "Invoices", "geo_table_invoice", [
      input.invoicesAvailable ? Prisma.sql`TRUE` : Prisma.sql`FALSE`, ...hierarchy("geo_table_invoice_source"),
      Prisma.sql`${invoiceEpoch} >= ${input.fromTime} AND ${invoiceEpoch} <= ${input.toTime}`,
      Prisma.sql`BTRIM(COALESCE(${textField({ field: "InvoiceNo", source: "geo_table_invoice_source" })}, '')) <> ''`,
      Prisma.sql`BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "geo_table_invoice_source" })}, '')) <> ''`,
    ], [], [], false, [], Prisma.sql`
      BTRIM(COALESCE(${textField({ field: "InvoiceNo", source: "geo_table_invoice_source" })}, '')) AS invoice_no,
      BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "geo_table_invoice_source" })}, '')) AS customer_code,
      ${invoiceEpoch} AS sales_time
    `);
    ctes.push(invoices, Prisma.sql`geo_table_invoice_numbers AS MATERIALIZED (SELECT DISTINCT invoice_no FROM geo_table_invoice_active)`);
    const items = activeEntityRowsCte(input.companyId, "Invoice Items", "geo_table_item", hierarchy("geo_table_item_source"), [
      Prisma.sql`BTRIM(COALESCE(${textField({ field: "InvoiceNo", source: "geo_table_item_source" })}, '')) IN (SELECT invoice_no FROM geo_table_invoice_numbers)`,
    ], [], false, [], Prisma.sql`
      geo_table_item_source.id AS source_row_id,
      geo_table_item_source."entity_key" AS entity_key,
      BTRIM(COALESCE(${textField({ field: "InvoiceNo", source: "geo_table_item_source" })}, '')) AS invoice_no,
      COALESCE(NULLIF(BTRIM(${textField({ field: "LineNo", source: "geo_table_item_source" })}), '')::double precision, 0::double precision) AS line_no,
      BTRIM(COALESCE(${textField({ field: "ProductCode", source: "geo_table_item_source" })}, '')) AS product_code,
      COALESCE(NULLIF(REPLACE(BTRIM(${textField({ field: "LineTotal", source: "geo_table_item_source" })}), ',', ''), '')::double precision, 0::double precision) AS amount
    `);
    ctes.push(items, Prisma.sql`
      geo_table_sales AS MATERIALIZED (
        SELECT invoice.invoice_no, item.line_no, invoice.sales_time, invoice.customer_code, item.product_code,
          SUM(item.amount)::double precision AS amount, MIN(item.entity_key) AS source_order
        FROM geo_table_invoice_active invoice
        INNER JOIN geo_table_item_active item ON item.invoice_no = invoice.invoice_no
        GROUP BY invoice.invoice_no, item.line_no, invoice.sales_time, invoice.customer_code, item.product_code
      )
    `);
    const productPredicates: Prisma.Sql[] = [];
    addGeoEngineValues(productPredicates, Prisma.sql`sales.product_code`, input.productCodes);
    addGeoEngineValues(productPredicates, Prisma.sql`product.category`, input.categoryValues);
    addGeoEngineValues(productPredicates, Prisma.sql`product.brand`, input.brandValues);
    ctes.push(Prisma.sql`
      geo_table_filtered AS MATERIALIZED (
        SELECT sales.invoice_no, sales.line_no, sales.sales_time, sales.customer_code,
          customer.customer_name, customer.city, customer.channel, sales.product_code,
          COALESCE(product.product_name, sales.product_code) AS product_name,
          COALESCE(product.category, '') AS category, COALESCE(product.brand, '') AS brand,
          COALESCE(customer.rep_name, '') AS rep_name, COALESCE(customer.supervisor_name, '') AS supervisor_name,
          sales.amount, sales.source_order
        FROM geo_table_sales sales
        INNER JOIN geo_scoped_customers customer ON customer.customer_code = sales.customer_code
        LEFT JOIN geo_product_meta product ON product.product_code = sales.product_code
        ${productPredicates.length ? Prisma.sql`WHERE ${Prisma.join(productPredicates, " AND ")}` : Prisma.empty}
      )
    `);
    const offset = (input.page - 1) * input.pageSize;
    type RawResult = { rows: RieGeoEngineTableResult["rows"]; totalRows: number };
    const rows = await this.postgres<RawResult[]>("queryGeoEngineTable.sql", {
      kind: "specialized", operation: "queryGeoEngineTable", pageSize: input.pageSize, hasProductScope: Boolean(input.productCodes?.length || input.categoryValues?.length || input.brandValues?.length),
    }, () => Prisma.sql`
      WITH ${Prisma.join(ctes, ", ")}
      SELECT COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
          'invoiceNo', page.invoice_no, 'lineNo', page.line_no,
          'date', TO_CHAR(TO_TIMESTAMP(page.sales_time / 1000::double precision) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'customerCode', page.customer_code, 'customerName', page.customer_name, 'city', page.city, 'channel', page.channel,
          'productCode', page.product_code, 'productName', page.product_name, 'category', page.category, 'brand', page.brand,
          'repName', page.rep_name, 'supervisorName', page.supervisor_name, 'amount', page.amount
        ) ORDER BY page.sales_time DESC)
        FROM (SELECT * FROM geo_table_filtered ORDER BY sales_time DESC LIMIT ${input.pageSize} OFFSET ${offset}) page), '[]'::jsonb) AS rows,
        (SELECT COUNT(*)::double precision FROM geo_table_filtered) AS "totalRows"
    `);
    const row = rows[0];
    return {
      rows: Array.isArray(row?.rows) ? row.rows.map((item) => ({ ...item, lineNo: Number(item.lineNo), amount: Number(item.amount) })) : [],
      totalRows: Number(row?.totalRows ?? 0),
    };
  }

  /** Compact Customer Briefing evidence without materializing canonical facts in Node. */
  async queryVisitCopilotCustomerBriefingFacts(
    input: RieVisitCopilotCustomerBriefingQuery,
    availability: Record<RieVisitCopilotBriefingEntity, boolean>,
  ): Promise<RieVisitCopilotCustomerBriefingFacts> {
    if (!input.companyId?.trim()) throw new Error("RIE Visit Copilot customer briefing requires companyId.");
    const customerCode = input.customerCode.trim();
    const allowedRoutes = input.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser)
      : null;
    const hierarchy = (source: string): Prisma.Sql[] => allowedRoutes === null
      ? []
      : allowedRoutes.size
        ? [Prisma.sql`${normalizedField({ field: "RouteID", source })} IN (${Prisma.join([...allowedRoutes])})`]
        : [Prisma.sql`FALSE`];
    const available = (entity: RieVisitCopilotBriefingEntity) => availability[entity] ? Prisma.sql`TRUE` : Prisma.sql`FALSE`;

    const customers = activeEntityRowsCte(input.companyId, "Customers", "customer", [available("Customers"), ...hierarchy("customer_source")], [], [], false, [], Prisma.sql`
      customer_source.id AS source_row_id,
      customer_source.precedence AS source_precedence,
      customer_source."created_at" AS source_created_at,
      BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "customer_source" })}, '')) AS customer_code,
      ${textField({ field: "CustomerName", source: "customer_source" })} AS customer_name,
      BTRIM(COALESCE(${textField({ field: "Channel", source: "customer_source" })}, '')) AS channel
    `);
    const invoiceDate = visitCopilotDateField({ field: "InvoiceDate", source: "invoice_source" });
    const invoices = activeEntityRowsCte(input.companyId, "Invoices", "invoice", [
      available("Invoices"), ...hierarchy("invoice_source"), Prisma.sql`${invoiceDate} IS NOT NULL`,
      Prisma.sql`((${invoiceDate} >= ${input.from} AND ${invoiceDate} <= ${input.to}) OR (${invoiceDate} >= ${input.previous30From} AND ${invoiceDate} <= ${input.to}))`,
    ], [], [], false, [], Prisma.sql`
      invoice_source.id AS source_row_id,
      invoice_source.precedence AS source_precedence,
      invoice_source."created_at" AS source_created_at,
      BTRIM(COALESCE(${textField({ field: "InvoiceNo", source: "invoice_source" })}, '')) AS invoice_no,
      BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "invoice_source" })}, '')) AS customer_code,
      ${invoiceDate} AS date_iso
    `);
    const itemProjection = Prisma.sql`
      item_source.id AS source_row_id,
      item_source.precedence AS source_precedence,
      item_source."created_at" AS source_created_at,
      BTRIM(COALESCE(${textField({ field: "InvoiceNo", source: "item_source" })}, '')) AS invoice_no,
      BTRIM(COALESCE(${textField({ field: "ProductCode", source: "item_source" })}, '')) AS product_code,
      COALESCE(${visitCopilotFiniteNumberField(textField({ field: "Quantity", source: "item_source" }))}, 0::double precision) AS quantity,
      COALESCE(${visitCopilotFiniteNumberField(textField({ field: "LineTotal", source: "item_source" }))}, 0::double precision) AS line_total
    `;
    const returnDate = visitCopilotDateField({ field: "ReturnDate", source: "return_source" });
    const returns = activeEntityRowsCte(input.companyId, "Returns", "return", [
      available("Returns"), ...hierarchy("return_source"),
      Prisma.sql`LOWER(BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "return_source" })}, ''))) = ${customerCode.toLowerCase()}`,
      Prisma.sql`${returnDate} >= ${input.from} AND ${returnDate} <= ${input.to}`,
    ], [], [], false, [], Prisma.sql`COALESCE(${visitCopilotFiniteNumberField(textField({ field: "TotalAmount", source: "return_source" }))}, 0::double precision) AS amount`);
    const collectionDate = visitCopilotDateField({ field: "CollectionDate", source: "collection_source" });
    const collectionDueDate = visitCopilotDateField({ field: "DueDate", source: "collection_source" });
    const collections = activeEntityRowsCte(input.companyId, "Collections", "collection", [
      available("Collections"), ...hierarchy("collection_source"),
      Prisma.sql`LOWER(BTRIM(COALESCE(${textField({ field: "CustomerCode", source: "collection_source" })}, ''))) = ${customerCode.toLowerCase()}`,
      Prisma.sql`LOWER(BTRIM(COALESCE(${textField({ field: "Status", source: "collection_source" })}, ''))) IN ('collected', 'cleared', 'pending', 'bounced')`,
    ], [], [], false, [], Prisma.sql`
      LOWER(BTRIM(COALESCE(${textField({ field: "Status", source: "collection_source" })}, ''))) AS status,
      COALESCE(${visitCopilotFiniteNumberField(textField({ field: "Amount", source: "collection_source" }))}, 0::double precision) AS amount,
      ${collectionDate} AS collection_date,
      ${collectionDueDate} AS due_date
    `);
    const vanDate = visitCopilotDateField({ field: "ReportDate", source: "van_source" });
    const vanInventory = activeEntityRowsCte(input.companyId, "Van Inventory", "van", [
      input.includeVanStock ? available("Van Inventory") : Prisma.sql`FALSE`, ...hierarchy("van_source"),
    ], [], [], false, [], Prisma.sql`
      van_source.id AS source_row_id,
      van_source.precedence AS source_precedence,
      van_source."created_at" AS source_created_at,
      ${vanDate} AS date_iso,
      BTRIM(COALESCE(${textField({ field: "ProductCode", source: "van_source" })}, '')) AS product_code,
      COALESCE(${visitCopilotFiniteNumberField(textField({ field: "Quantity", source: "van_source" }))}, 0::double precision) AS quantity
    `);

    type RawResult = {
      customer: RieVisitCopilotCustomerBriefingFacts["customer"];
      visibleCustomerCount: number; salesTotal: number; invoiceCount: number; recent30Sales: number; previous30Sales: number;
      customerSales: RieVisitCopilotCustomerBriefingFacts["customerSales"];
      customerProducts: RieVisitCopilotCustomerBriefingFacts["customerProducts"];
      peerProducts: RieVisitCopilotCustomerBriefingFacts["peerProducts"];
      returnsTotal: number; returnCount: number; collected: number; collectionCount: number; pending: number; bounced: number; overdue: number;
      oldestPendingDueDate: string | null; vanInventoryRowCount: number; vanProductCodes: string[];
    };
    const rows = await this.postgres<RawResult[]>("queryVisitCopilotCustomerBriefingFacts.sql", {
      kind: "specialized", operation: "queryVisitCopilotCustomerBriefingFacts", includeVanStock: input.includeVanStock,
    }, () => Prisma.sql`
      WITH ${customers},
      customer_ordered AS MATERIALIZED (
        SELECT customer_active.*, ROW_NUMBER() OVER (ORDER BY source_precedence, source_created_at, source_row_id) - 1 AS source_order
        FROM customer_active
      ), target_customer AS MATERIALIZED (
        SELECT customer_code, COALESCE(customer_name, customer_code) AS customer_name, channel
        FROM customer_ordered WHERE customer_code = ${customerCode} ORDER BY source_order LIMIT 1
      ), visible_customer_codes AS MATERIALIZED (
        SELECT customer_code, MIN(source_order) AS source_order FROM customer_ordered WHERE customer_code <> '' GROUP BY customer_code
      ), peer_codes AS MATERIALIZED (
        SELECT customer.customer_code FROM customer_ordered customer CROSS JOIN target_customer target
        WHERE customer.customer_code <> '' AND customer.customer_code <> target.customer_code
          AND (target.channel = '' OR LOWER(customer.channel) = LOWER(target.channel))
        GROUP BY customer.customer_code
      ), ${invoices},
      invoice_ordered AS MATERIALIZED (
        SELECT invoice_active.*, ROW_NUMBER() OVER (ORDER BY source_precedence, source_created_at, source_row_id) - 1 AS source_order
        FROM invoice_active
      ), period_invoice_counts AS MATERIALIZED (
        SELECT customer_code, COUNT(*)::double precision AS invoice_count FROM invoice_ordered
        WHERE date_iso >= ${input.from} AND date_iso <= ${input.to} GROUP BY customer_code
      ), period_invoice_winners AS MATERIALIZED (
        SELECT invoice_no, customer_code, date_iso FROM (
          SELECT invoice_no, customer_code, date_iso, source_order,
            ROW_NUMBER() OVER (PARTITION BY invoice_no ORDER BY source_order DESC) AS row_number
          FROM invoice_ordered
          WHERE invoice_no <> '' AND customer_code <> '' AND date_iso >= ${input.from} AND date_iso <= ${input.to}
        ) ranked WHERE row_number = 1
      ), trend_invoice_winners AS MATERIALIZED (
        SELECT invoice_no, customer_code, date_iso FROM (
          SELECT invoice_no, customer_code, date_iso, source_order,
            ROW_NUMBER() OVER (PARTITION BY invoice_no ORDER BY source_order DESC) AS row_number
          FROM invoice_ordered
          WHERE invoice_no <> '' AND customer_code = ${customerCode}
            AND date_iso >= ${input.previous30From} AND date_iso <= ${input.to}
        ) ranked WHERE row_number = 1
      ), relevant_invoice_numbers AS MATERIALIZED (
        SELECT invoice_no FROM period_invoice_winners UNION SELECT invoice_no FROM trend_invoice_winners
      ), ${activeEntityRowsCte(input.companyId, "Invoice Items", "item", [available("Invoice Items"), ...hierarchy("item_source")], [], [], false, [
        Prisma.sql`INNER JOIN relevant_invoice_numbers relevant_invoice ON BTRIM(COALESCE(${textField({ field: "InvoiceNo", source: "item_source" })}, '')) = relevant_invoice.invoice_no`,
      ], itemProjection)},
      item_ordered AS MATERIALIZED (
        SELECT item_active.*, ROW_NUMBER() OVER (ORDER BY source_precedence, source_created_at, source_row_id) - 1 AS source_order
        FROM item_active
      ), period_items AS MATERIALIZED (
        SELECT item.source_order, invoice.customer_code, invoice.date_iso, item.product_code, item.quantity, item.line_total
        FROM item_ordered item INNER JOIN period_invoice_winners invoice ON invoice.invoice_no = item.invoice_no
      ), customer_sales AS MATERIALIZED (
        SELECT item.customer_code, SUM(item.line_total ORDER BY item.source_order)::double precision AS sales, MIN(item.source_order) AS first_item_order
        FROM period_items item INNER JOIN visible_customer_codes visible ON visible.customer_code = item.customer_code
        GROUP BY item.customer_code
      ), target_products AS MATERIALIZED (
        SELECT item.product_code, SUM(item.quantity ORDER BY item.source_order)::double precision AS quantity,
          SUM(item.line_total ORDER BY item.source_order)::double precision AS value, MAX(item.date_iso) AS last_purchase_date,
          MIN(item.source_order) AS first_item_order
        FROM period_items item WHERE item.customer_code = ${customerCode} AND item.product_code <> '' GROUP BY item.product_code
      ), peer_products AS MATERIALIZED (
        SELECT item.product_code, SUM(item.line_total ORDER BY item.source_order)::double precision AS value, MIN(item.source_order) AS first_item_order
        FROM period_items item INNER JOIN peer_codes peer ON peer.customer_code = item.customer_code
        WHERE item.product_code <> '' GROUP BY item.product_code
      ), trend_totals AS MATERIALIZED (
        SELECT COALESCE(SUM(item.line_total ORDER BY item.source_order) FILTER (WHERE invoice.date_iso >= ${input.recent30From}), 0::double precision) AS recent_sales,
          COALESCE(SUM(item.line_total ORDER BY item.source_order) FILTER (WHERE invoice.date_iso >= ${input.previous30From} AND invoice.date_iso <= ${input.previous30To}), 0::double precision) AS previous_sales
        FROM item_ordered item INNER JOIN trend_invoice_winners invoice ON invoice.invoice_no = item.invoice_no
      ), relevant_product_keys AS MATERIALIZED (
        SELECT product_code FROM target_products UNION SELECT product_code FROM peer_products
      ), ${activeEntityRowsCte(input.companyId, "Products", "product", [available("Products")], [], [], false, [
        Prisma.sql`INNER JOIN relevant_product_keys relevant_product ON BTRIM(COALESCE(${textField({ field: "ProductCode", source: "product_source" })}, '')) = relevant_product.product_code`,
      ], Prisma.sql`
        product_source.id AS source_row_id, product_source.precedence AS source_precedence,
        product_source."created_at" AS source_created_at,
        BTRIM(COALESCE(${textField({ field: "ProductCode", source: "product_source" })}, '')) AS product_code,
        ${textField({ field: "ProductName", source: "product_source" })} AS product_name,
        NULLIF(BTRIM(COALESCE(${textField({ field: "Category", source: "product_source" })}, '')), '') AS category
      `)}, product_meta AS MATERIALIZED (
        SELECT product_code, COALESCE(product_name, product_code) AS product_name, category FROM (
          SELECT product_active.*, ROW_NUMBER() OVER (PARTITION BY product_code ORDER BY source_precedence DESC, source_created_at DESC, source_row_id DESC) AS row_number
          FROM product_active WHERE product_code <> ''
        ) ranked WHERE row_number = 1
      ), ${returns}, return_totals AS MATERIALIZED (
        SELECT COALESCE(SUM(amount), 0::double precision) AS total, COUNT(*)::double precision AS count FROM return_active
      ), ${collections}, collection_totals AS MATERIALIZED (
        SELECT COALESCE(SUM(amount) FILTER (WHERE status IN ('collected', 'cleared') AND collection_date >= ${input.from} AND collection_date <= ${input.to}), 0::double precision) AS collected,
          COUNT(*) FILTER (WHERE status IN ('collected', 'cleared') AND collection_date >= ${input.from} AND collection_date <= ${input.to})::double precision AS collection_count,
          COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0::double precision) AS pending,
          COALESCE(SUM(amount) FILTER (WHERE status = 'bounced'), 0::double precision) AS bounced,
          COALESCE(SUM(amount) FILTER (WHERE status = 'pending' AND due_date < ${input.today}), 0::double precision) AS overdue,
          MIN(due_date) FILTER (WHERE status = 'pending' AND due_date IS NOT NULL) AS oldest_pending_due_date
        FROM collection_active
      ), ${vanInventory}, latest_van_date AS MATERIALIZED (
        SELECT MAX(date_iso) AS date_iso FROM van_active
      ), van_products AS MATERIALIZED (
        SELECT product_code, MIN(source_order) AS first_order FROM (
          SELECT product_code, quantity, date_iso, ROW_NUMBER() OVER (ORDER BY source_precedence, source_created_at, source_row_id) AS source_order
          FROM van_active
        ) van CROSS JOIN latest_van_date latest
        WHERE van.product_code <> '' AND van.quantity > 0
          AND ((latest.date_iso IS NULL AND van.date_iso IS NULL) OR van.date_iso = latest.date_iso)
        GROUP BY product_code
      )
      SELECT (SELECT JSONB_BUILD_OBJECT('customerCode', customer_code, 'customerName', customer_name, 'channel', channel) FROM target_customer) AS customer,
        (SELECT COUNT(*)::double precision FROM visible_customer_codes) AS "visibleCustomerCount",
        COALESCE((SELECT sales FROM customer_sales WHERE customer_code = ${customerCode}), 0::double precision) AS "salesTotal",
        COALESCE((SELECT invoice_count FROM period_invoice_counts WHERE customer_code = ${customerCode}), 0::double precision) AS "invoiceCount",
        trend_totals.recent_sales AS "recent30Sales", trend_totals.previous_sales AS "previous30Sales",
        COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT('customerCode', sales.customer_code, 'sales', sales.sales, 'invoiceCount', COALESCE(counts.invoice_count, 0::double precision)) ORDER BY sales.first_item_order)
          FROM customer_sales sales LEFT JOIN period_invoice_counts counts ON counts.customer_code = sales.customer_code), '[]'::jsonb) AS "customerSales",
        COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT('productCode', product.product_code, 'productName', COALESCE(meta.product_name, product.product_code), 'category', meta.category, 'quantity', product.quantity, 'value', product.value, 'lastPurchaseDate', product.last_purchase_date) ORDER BY product.first_item_order)
          FROM target_products product LEFT JOIN product_meta meta ON meta.product_code = product.product_code), '[]'::jsonb) AS "customerProducts",
        COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT('productCode', product.product_code, 'productName', COALESCE(meta.product_name, product.product_code), 'value', product.value) ORDER BY product.first_item_order)
          FROM peer_products product LEFT JOIN product_meta meta ON meta.product_code = product.product_code), '[]'::jsonb) AS "peerProducts",
        return_totals.total AS "returnsTotal", return_totals.count AS "returnCount",
        collection_totals.collected, collection_totals.collection_count AS "collectionCount", collection_totals.pending,
        collection_totals.bounced, collection_totals.overdue, collection_totals.oldest_pending_due_date AS "oldestPendingDueDate",
        (SELECT COUNT(*)::double precision FROM van_active) AS "vanInventoryRowCount",
        COALESCE((SELECT JSONB_AGG(product_code ORDER BY first_order) FROM van_products), '[]'::jsonb) AS "vanProductCodes"
      FROM trend_totals CROSS JOIN return_totals CROSS JOIN collection_totals
    `);
    const row = rows[0];
    return {
      availability, customer: row?.customer ?? null, visibleCustomerCount: Number(row?.visibleCustomerCount ?? 0),
      salesTotal: Number(row?.salesTotal ?? 0), invoiceCount: Number(row?.invoiceCount ?? 0),
      recent30Sales: Number(row?.recent30Sales ?? 0), previous30Sales: Number(row?.previous30Sales ?? 0),
      customerSales: Array.isArray(row?.customerSales) ? row.customerSales : [],
      customerProducts: Array.isArray(row?.customerProducts) ? row.customerProducts : [],
      peerProducts: Array.isArray(row?.peerProducts) ? row.peerProducts : [],
      returns: { total: Number(row?.returnsTotal ?? 0), count: Number(row?.returnCount ?? 0) },
      collections: { collected: Number(row?.collected ?? 0), count: Number(row?.collectionCount ?? 0), pending: Number(row?.pending ?? 0), bounced: Number(row?.bounced ?? 0), overdue: Number(row?.overdue ?? 0), oldestPendingDueDate: row?.oldestPendingDueDate ?? null },
      vanInventoryRowCount: Number(row?.vanInventoryRowCount ?? 0),
      vanProductCodes: Array.isArray(row?.vanProductCodes) ? row.vanProductCodes : [],
    };
  }

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
      ? await this.postgres<RieGeoCustomerSelectionRow[]>("queryGeoCustomerSelection.sql", { kind: "specialized", operation: "queryGeoCustomerSelection", mode: "target" }, () => Prisma.sql`
          WITH ${customers}, valid AS MATERIALIZED (${valid}), invalid AS MATERIALIZED (${invalid}),
          target AS MATERIALIZED (SELECT * FROM valid WHERE id = ${input.targetCustomerId}),
          neighbors AS MATERIALIZED (SELECT valid.*, 6371.0088 * 2 * ASIN(SQRT(POWER(SIN(RADIANS(valid.lat - target.lat) / 2), 2) + COS(RADIANS(target.lat)) * COS(RADIANS(valid.lat)) * POWER(SIN(RADIANS(valid.lon - target.lon) / 2), 2))) AS distance FROM valid, target WHERE valid.id <> target.id ORDER BY distance, valid.id LIMIT ${input.nearestCount})
          SELECT target.id, target.name, target.lat, target.lon, 0::double precision AS "distanceKm", 'target'::text AS source, (SELECT count FROM invalid) AS "excludedBadCoordinates" FROM target
          UNION ALL
          SELECT neighbors.id, neighbors.name, neighbors.lat, neighbors.lon, neighbors.distance AS "distanceKm", 'auto'::text AS source, (SELECT count FROM invalid) AS "excludedBadCoordinates" FROM neighbors
        `)
      : await this.postgres<RieGeoCustomerSelectionRow[]>("queryGeoCustomerSelection.sql", { kind: "specialized", operation: "queryGeoCustomerSelection", mode: "location" }, () => Prisma.sql`
          WITH ${customers}, valid AS MATERIALIZED (${valid}), invalid AS MATERIALIZED (${invalid}),
          auto AS MATERIALIZED (SELECT valid.*, ${distance(Prisma.raw("valid.lat"), Prisma.raw("valid.lon"))} AS distance FROM valid ORDER BY distance, valid.id LIMIT ${input.nearestCount}),
          manual AS MATERIALIZED (SELECT valid.*, ${distance(Prisma.raw("valid.lat"), Prisma.raw("valid.lon"))} AS distance FROM valid WHERE valid.id IN (${Prisma.join(manualIds.length ? manualIds : ["__none__"])})),
          resolved AS MATERIALIZED (SELECT DISTINCT ON (id) * FROM (SELECT *, 'auto'::text AS source FROM auto UNION ALL SELECT *, 'manual'::text AS source FROM manual) candidates ORDER BY id, CASE source WHEN 'auto' THEN 0 ELSE 1 END)
          SELECT id, name, lat, lon, distance AS "distanceKm", source, (SELECT count FROM invalid) AS "excludedBadCoordinates" FROM resolved
        `);
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
    const rows = await this.postgres<RieGeoProductRow[]>("queryGeoProducts.sql", { kind: "specialized", operation: "queryGeoProducts" }, () => Prisma.sql`
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
    `);
    return rows.map((row) => ({ ...row, totalQty: Number(row.totalQty), totalValue: Number(row.totalValue), customerCount: Number(row.customerCount), totalRowsConsidered: Number(row.totalRowsConsidered), targetProductCount: row.targetProductCount === null ? null : Number(row.targetProductCount) }));
  }

  /**
   * Product Fit's compact company read. Peer selection, the invoice lookup,
   * line aggregation and distinct-buyer count stay in PostgreSQL. Products
   * cross the boundary only as the six scalar fields used by Node scoring.
   */
  async queryProductFitData(input: RieProductFitQuery): Promise<RieProductFitData> {
    if (!input.companyId?.trim()) throw new Error("RIE Product Fit query requires companyId.");
    const businessType = String(input.businessType ?? "").trim().toLowerCase();
    const channel = String(input.channel ?? "").trim().toLowerCase();
    const horecaTypes = [...new Set(input.horecaCustomerTypes.map((value) => value.trim().toLowerCase()).filter(Boolean))];
    const allowedRoutes = input.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(input.companyId, input.requestingUser)
      : null;
    const routePredicate = (source: string) => allowedRoutes === null
      ? []
      : [allowedRoutes.size
          ? Prisma.sql`${normalizedField({ field: "RouteID", source })} IN (${Prisma.join([...allowedRoutes])})`
          : Prisma.sql`FALSE`];

    const customerProjection = Prisma.sql`
      ${normalizedField({ field: "CustomerCode", source: "customer_source" })} AS customer_code,
      ${normalizedField({ field: "CustomerType", source: "customer_source" })} AS customer_type,
      ${normalizedField({ field: "Channel", source: "customer_source" })} AS channel
    `;
    const customerCte = activeEntityRowsCte(input.companyId, "Customers", "customer", input.sourceAvailability?.customers === false ? [Prisma.sql`FALSE`] : routePredicate("customer_source"), [], [], false, [], customerProjection);
    const typePeers = Prisma.sql`type_peers AS MATERIALIZED (
      SELECT DISTINCT customer.customer_code
      FROM customer_active customer
      WHERE ${businessType} <> '' AND customer.customer_type = ${businessType}
    )`;
    const channelPeers = Prisma.sql`channel_peers AS MATERIALIZED (
      SELECT DISTINCT customer.customer_code
      FROM customer_active customer
      WHERE ${channel} <> '' AND customer.channel = ${channel}
    )`;
    const scopeChoice = Prisma.sql`scope_choice AS MATERIALIZED (
      SELECT CASE
        WHEN EXISTS (SELECT 1 FROM type_peers) THEN 'CUSTOMER_TYPE'
        WHEN EXISTS (SELECT 1 FROM channel_peers) THEN 'CHANNEL'
        ELSE 'NONE'
      END::text AS peer_scope
    )`;
    const primaryPeers = Prisma.sql`primary_peers AS MATERIALIZED (
      SELECT type_peers.customer_code FROM type_peers, scope_choice WHERE scope_choice.peer_scope = 'CUSTOMER_TYPE'
      UNION ALL
      SELECT channel_peers.customer_code FROM channel_peers, scope_choice WHERE scope_choice.peer_scope = 'CHANNEL'
    )`;
    const horecaPeers = Prisma.sql`horeca_peers AS MATERIALIZED (
      SELECT DISTINCT customer.customer_code
      FROM customer_active customer
      WHERE ${horecaTypes.length > 0}
        AND customer.customer_type IN (${Prisma.join(horecaTypes.length ? horecaTypes : ["__none__"])})
    )`;
    const eligiblePeers = Prisma.sql`eligible_peers AS MATERIALIZED (
      SELECT candidates.customer_code,
        BOOL_OR(candidates.primary_peer) AS primary_peer,
        BOOL_OR(candidates.horeca_peer) AS horeca_peer
      FROM (
        SELECT primary_peers.customer_code, TRUE AS primary_peer, FALSE AS horeca_peer FROM primary_peers
        UNION ALL
        SELECT horeca_peers.customer_code, FALSE AS primary_peer, TRUE AS horeca_peer FROM horeca_peers
      ) candidates
      GROUP BY candidates.customer_code
    )`;

    // The legacy Node Map kept the last same-file duplicate InvoiceNo. Keep
    // that lookup behavior after canonical newest-upload-wins resolution.
    const invoiceProjection = Prisma.sql`
      ${normalizedField({ field: "InvoiceNo", source: "invoice_source" })} AS invoice_no,
      ${normalizedField({ field: "CustomerCode", source: "invoice_source" })} AS customer_code,
      invoice_source."created_at" AS created_at,
      invoice_source.id AS row_id
    `;
    const invoiceCte = activeEntityRowsCte(input.companyId, "Invoices", "invoice", input.sourceAvailability?.invoices === false ? [Prisma.sql`FALSE`] : routePredicate("invoice_source"), [], [], false, [], invoiceProjection);
    const invoiceLookup = Prisma.sql`invoice_lookup AS MATERIALIZED (
      SELECT DISTINCT ON (invoice.invoice_no)
        invoice.invoice_no, invoice.customer_code
      FROM invoice_active invoice
      ORDER BY invoice.invoice_no, invoice.created_at DESC, invoice.row_id DESC
    )`;
    const invoiceScoped = Prisma.sql`invoice_scoped AS MATERIALIZED (
      SELECT invoice.invoice_no, invoice.customer_code, peer.primary_peer, peer.horeca_peer
      FROM invoice_lookup invoice
      INNER JOIN eligible_peers peer ON peer.customer_code = invoice.customer_code
      WHERE invoice.customer_code <> ''
    )`;

    // Invoice Items are bounded by the already canonical, permission-scoped
    // peer invoices before their newest-wins merge. InvoiceNo is part of the
    // item primary key, so this cannot resurrect an older item version.
    const itemProjection = Prisma.sql`
      ${normalizedField({ field: "InvoiceNo", source: "item_source" })} AS invoice_no,
      ${normalizedField({ field: "ProductCode", source: "item_source" })} AS product_code,
      ${localDecisionNumberField("item_source", "LineTotal")} AS line_total
    `;
    const itemCte = activeEntityRowsCte(
      input.companyId,
      "Invoice Items",
      "item",
      input.sourceAvailability?.invoiceItems === false ? [Prisma.sql`FALSE`] : routePredicate("item_source"),
      [],
      [],
      false,
      [Prisma.sql`INNER JOIN invoice_scoped scoped_invoice ON ${normalizedField({ field: "InvoiceNo", source: "item_source" })} = scoped_invoice.invoice_no`],
      itemProjection,
    );
    const joinedSales = Prisma.sql`joined_sales AS MATERIALIZED (
      SELECT item.product_code, item.line_total, invoice.customer_code,
        invoice.primary_peer, invoice.horeca_peer
      FROM item_active item
      INNER JOIN invoice_scoped invoice ON invoice.invoice_no = item.invoice_no
      WHERE item.product_code <> ''
    )`;
    const primarySales = Prisma.sql`primary_sales AS MATERIALIZED (
      SELECT sales.product_code,
        COALESCE(SUM(sales.line_total), 0)::double precision AS order_value,
        COUNT(DISTINCT sales.customer_code)::integer AS buyer_count
      FROM joined_sales sales
      WHERE sales.primary_peer
      GROUP BY sales.product_code
    )`;
    const fallbackSales = Prisma.sql`fallback_sales AS MATERIALIZED (
      SELECT sales.product_code,
        COALESCE(SUM(sales.line_total), 0)::double precision AS order_value,
        COUNT(DISTINCT sales.customer_code)::integer AS buyer_count
      FROM joined_sales sales
      WHERE sales.horeca_peer
      GROUP BY sales.product_code
    )`;
    const selectedScope = Prisma.sql`selected_scope AS MATERIALIZED (
      SELECT CASE
        WHEN ${horecaTypes.length > 0}
          AND NOT EXISTS (SELECT 1 FROM primary_sales)
          AND EXISTS (SELECT 1 FROM fallback_sales)
          THEN 'HORECA_FALLBACK'
        ELSE scope_choice.peer_scope
      END::text AS peer_scope
      FROM scope_choice
    )`;
    const selectedSales = Prisma.sql`selected_sales AS MATERIALIZED (
      SELECT primary_sales.* FROM primary_sales, selected_scope WHERE selected_scope.peer_scope <> 'HORECA_FALLBACK'
      UNION ALL
      SELECT fallback_sales.* FROM fallback_sales, selected_scope WHERE selected_scope.peer_scope = 'HORECA_FALLBACK'
    )`;

    const productProjection = Prisma.sql`
      ${textField({ field: "ProductCode", source: "product_source" })} AS product_code,
      ${textField({ field: "ProductName", source: "product_source" })} AS product_name,
      ${textField({ field: "Category", source: "product_source" })} AS category,
      ${textField({ field: "Brand", source: "product_source" })} AS brand,
      ${textField({ field: "ProductStatus", source: "product_source" })} AS product_status,
      ${textField({ field: "Status", source: "product_source" })} AS status,
      product_source.precedence AS precedence,
      product_source."created_at" AS created_at,
      product_source.id AS row_id
    `;
    const productCte = activeEntityRowsCte(input.companyId, "Products", "product", input.sourceAvailability?.products === false ? [Prisma.sql`FALSE`] : [], [], [], false, [], productProjection);

    const rows = await this.postgres<Array<{
      peerScope: string;
      peerSales: unknown;
      products: unknown;
    }>>("queryProductFitData.sql", { kind: "specialized", operation: "queryProductFitData" }, () => Prisma.sql`
      WITH ${customerCte}, ${typePeers}, ${channelPeers}, ${scopeChoice}, ${primaryPeers}, ${horecaPeers}, ${eligiblePeers},
        ${invoiceCte}, ${invoiceLookup}, ${invoiceScoped}, ${itemCte}, ${joinedSales}, ${primarySales}, ${fallbackSales},
        ${selectedScope}, ${selectedSales}, ${productCte}
      SELECT selected_scope.peer_scope AS "peerScope",
        COALESCE((
          SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
            'productCode', selected_sales.product_code,
            'orderValue', selected_sales.order_value,
            'buyerCount', selected_sales.buyer_count
          ) ORDER BY selected_sales.product_code)
          FROM selected_sales
        ), '[]'::jsonb) AS "peerSales",
        COALESCE((
          SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
            'ProductCode', product.product_code,
            'ProductName', product.product_name,
            'Category', product.category,
            'Brand', product.brand,
            'ProductStatus', product.product_status,
            'Status', product.status
          ) ORDER BY product.precedence ASC, product.created_at ASC, product.row_id ASC)
          FROM product_active product
        ), '[]'::jsonb) AS products
      FROM selected_scope
    `);
    const row = rows[0];
    const peerScope: RieProductFitPeerScope = row?.peerScope === "CUSTOMER_TYPE" || row?.peerScope === "HORECA_FALLBACK" || row?.peerScope === "CHANNEL" ? row.peerScope : "NONE";
    const rawSales = Array.isArray(row?.peerSales) ? row.peerSales : [];
    const rawProducts = Array.isArray(row?.products) ? row.products : [];
    return {
      peerScope,
      peerSales: rawSales.flatMap((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const sale = value as { productCode?: unknown; orderValue?: unknown; buyerCount?: unknown };
        const productCode = String(sale.productCode ?? "");
        if (!productCode) return [];
        const orderValue = Number(sale.orderValue ?? 0);
        const buyerCount = Number(sale.buyerCount ?? 0);
        return [{ productCode, orderValue: Number.isFinite(orderValue) ? orderValue : 0, buyerCount: Number.isFinite(buyerCount) ? buyerCount : 0 }];
      }),
      products: rawProducts.flatMap((value) => value && typeof value === "object" && !Array.isArray(value) ? [value as RieProductFitData["products"][number]] : []),
    };
  }

  private async queryActiveVersionCountsUngated(companyId: string, entityNames: readonly string[]): Promise<Map<string, number>> {
    const rows = await this.postgres<Array<{ entityName: string; versionCount: bigint | number }>>("activeVersionCounts.sql", { kind: "metadata", operation: "activeVersionCounts", entityCount: entityNames.length }, () => Prisma.sql`
      SELECT version."entity_name" AS "entityName", COUNT(*) AS "versionCount"
      FROM "rie_dataset_versions" version
      INNER JOIN "files" source_file ON source_file.id = version."source_file_id"
      WHERE version."company_id" = ${companyId} AND version."entity_name" IN (${Prisma.join(entityNames)})
        AND version."is_active" = TRUE AND source_file."company_id" = ${companyId}
        AND source_file."is_active" = TRUE AND source_file.status = 'READY'
        AND source_file."dataset_type_confirmed" = TRUE
      GROUP BY version."entity_name"
    `);
    const result = new Map(rows.map(({ entityName, versionCount }) => [entityName, Number(versionCount)]));
    recordActiveVersionResolution(entityNames.length, [...result.values()].reduce((total, count) => total + count, 0));
    return result;
  }

  async getActiveVersionCounts(companyId: string, entityNames: readonly string[]): Promise<Map<string, number>> {
    return this.resolveActiveVersionCounts(companyId, entityNames, (missingEntityNames) =>
      this.queryActiveVersionCountsUngated(companyId, missingEntityNames),
    );
  }

  private resolveActiveVersionCounts(
    companyId: string,
    entityNames: readonly string[],
    resolve: (missingEntityNames: readonly string[]) => Promise<Map<string, number>>,
  ): Promise<Map<string, number>> {
    const plannedResolve = (missingEntityNames: readonly string[]) => this.requestPlanner
      ? this.requestPlanner.resolveActiveVersionCounts(companyId, missingEntityNames, resolve)
      : resolve(missingEntityNames);
    return this.executionCoordinator.resolveActiveVersionCounts(companyId, entityNames, plannedResolve);
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
    const inventoryProjection = Prisma.sql`${normalizedField({ field: "RouteID", source: "inventory_source" })} AS route_id, NULLIF(BTRIM(COALESCE(${inventoryDate}, '')), '') AS report_date, ${normalizedField({ field: "ProductCode", source: "inventory_source" })} AS product_code, ${numericField(textField({ field: "Quantity", source: "inventory_source" }))} AS quantity`;
    const invoiceProjection = Prisma.sql`${normalizedField({ field: "InvoiceNo", source: "invoice_source" })} AS invoice_no, ${normalizedField({ field: "RouteID", source: "invoice_source" })} AS route_id, ${dateText(invoiceDate)} AS invoice_date`;
    const itemProjection = Prisma.sql`${normalizedField({ field: "InvoiceNo", source: "item_source" })} AS invoice_no, ${normalizedField({ field: "RouteID", source: "item_source" })} AS route_id, ${normalizedField({ field: "ProductCode", source: "item_source" })} AS product_code`;
    const inventoryCte = activeEntityRowsCte(input.companyId, "Van Inventory", "inventory", [
      Prisma.sql`${dateText(inventoryDate)} <= ${targetDate}${routeScope(inventoryRoute)}`,
    ], [], [], false, [], inventoryProjection);
    const invoiceCte = activeEntityRowsCte(input.companyId, "Invoices", "invoice", [
      Prisma.sql`${dateText(invoiceDate)} <= ${targetDate}${routeScope(invoiceRoute)}`,
    ], [], [], false, [], invoiceProjection);
    const scopedInvoiceNo = Prisma.raw('invoice.invoice_no');
    const scopedInvoiceNumbersCte = Prisma.sql`scoped_invoice_numbers AS MATERIALIZED (
      SELECT DISTINCT ${scopedInvoiceNo} AS invoice_no
      FROM invoice_active invoice
      WHERE ${scopedInvoiceNo} <> ''
    )`;
    // Restrict current Invoice Items to already-scoped invoice keys before the
    // wider join so PostgreSQL can use the InvoiceNo index.
    const itemsCte = activeEntityRowsCte(input.companyId, "Invoice Items", "item", [], [], [], false, [
      Prisma.sql`INNER JOIN scoped_invoice_numbers scoped_invoice ON ${normalizedField({ field: "InvoiceNo", source: "item_source" })} = scoped_invoice.invoice_no`,
    ], itemProjection);
    const inventoryRouteText = Prisma.raw('inventory.route_id');
    const effectiveSaleRoute = Prisma.sql`COALESCE(NULLIF(item.route_id, ''), invoice.route_id, '')`;
    const inventoryProduct = Prisma.raw('inventory.product_code');
    const itemProduct = Prisma.raw('item.product_code');
    const inventoryQuantity = Prisma.raw('inventory.quantity');
    const invoiceNo = Prisma.raw('item.invoice_no');
    const invoiceJoinNo = Prisma.raw('invoice.invoice_no');
    const saleDate = Prisma.raw('invoice.invoice_date');
    const rows = await this.postgres<RieRouteProductStalenessRow[]>("queryRouteProductStaleness.sql", { kind: "specialized", operation: "queryRouteProductStaleness" }, () => Prisma.sql`
      WITH ${inventoryCte}, ${invoiceCte}, ${scopedInvoiceNumbersCte}, ${itemsCte},
      inventory_latest AS MATERIALIZED (
        SELECT ${inventoryRouteText} AS route_id, MAX(inventory.report_date) AS report_date
        FROM inventory_active inventory
        GROUP BY ${inventoryRouteText}
      ),
      inventory_by_route_product AS MATERIALIZED (
        SELECT ${inventoryRouteText} AS route_id, ${inventoryProduct} AS product_code, SUM(${inventoryQuantity})::double precision AS quantity
        FROM inventory_active inventory
        INNER JOIN inventory_latest latest ON latest.route_id = ${inventoryRouteText}
          AND inventory.report_date = latest.report_date
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
    `);
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
    const inventoryProjection = Prisma.sql`${normalizedField({ field: "RouteID", source: "inventory_source" })} AS route_id, NULLIF(BTRIM(COALESCE(${textField({ field: "ReportDate", source: "inventory_source" })}, '')), '') AS report_date, ${normalizedField({ field: "ProductCode", source: "inventory_source" })} AS product_code, ${numericField(textField({ field: "Quantity", source: "inventory_source" }))} AS quantity`;
    const invoiceProjection = Prisma.sql`${normalizedField({ field: "InvoiceNo", source: "invoice_source" })} AS invoice_no, ${normalizedField({ field: "RouteID", source: "invoice_source" })} AS route_id`;
    const itemProjection = Prisma.sql`${normalizedField({ field: "InvoiceNo", source: "item_source" })} AS invoice_no, ${normalizedField({ field: "RouteID", source: "item_source" })} AS route_id, ${normalizedField({ field: "ProductCode", source: "item_source" })} AS product_code, ${numericField(textField({ field: "Quantity", source: "item_source" }))} AS quantity`;
    const inventoryCte = activeEntityRowsCte(input.companyId, "Van Inventory", "inventory", [
      Prisma.sql`${dateText(textField({ field: "ReportDate", source: "inventory_source" }))} <= ${targetDate}${routeScope({ field: "RouteID", source: "inventory_source" })}`,
    ], [], [], false, [], inventoryProjection);
    const invoiceCte = activeEntityRowsCte(input.companyId, "Invoices", "invoice", [
      Prisma.sql`${dateText(textField({ field: "InvoiceDate", source: "invoice_source" }))} >= ${salesFrom} AND ${dateText(textField({ field: "InvoiceDate", source: "invoice_source" }))} <= ${salesTo}${routeScope({ field: "RouteID", source: "invoice_source" })}${customerCodes.length ? Prisma.sql` AND ${normalizedField({ field: "CustomerCode", source: "invoice_source" })} IN (${Prisma.join(customerCodes)})` : Prisma.sql` AND FALSE`}`,
    ], [], [], false, [], invoiceProjection);
    const scopedInvoiceNumbersCte = Prisma.sql`scoped_invoice_numbers AS MATERIALIZED (
      SELECT DISTINCT invoice.invoice_no FROM invoice_active invoice WHERE invoice.invoice_no <> ''
    )`;
    const itemsCte = activeEntityRowsCte(input.companyId, "Invoice Items", "item", [], [], [], false, [
      Prisma.sql`INNER JOIN scoped_invoice_numbers scoped_invoice ON ${normalizedField({ field: "InvoiceNo", source: "item_source" })} = scoped_invoice.invoice_no`,
    ], itemProjection);
    const inventoryRoute = Prisma.raw("inventory.route_id");
    const inventoryProduct = Prisma.raw("inventory.product_code");
    const inventoryQuantity = Prisma.raw("inventory.quantity");
    const itemProduct = Prisma.raw("item.product_code");
    const itemQuantity = Prisma.raw("item.quantity");
    const invoiceNo = Prisma.raw("item.invoice_no");
    const invoiceJoinNo = Prisma.raw("invoice.invoice_no");
    const effectiveSaleRoute = Prisma.sql`COALESCE(NULLIF(item.route_id, ''), invoice.route_id, '')`;
    return this.postgres<RieManagementVehicleProductRow[]>("queryManagementVehicleProducts.sql", { kind: "specialized", operation: "queryManagementVehicleProducts" }, () => Prisma.sql`
      WITH ${inventoryCte}, ${invoiceCte}, ${scopedInvoiceNumbersCte}, ${itemsCte},
      inventory_latest AS MATERIALIZED (
        SELECT ${inventoryRoute} AS route_id, MAX(inventory.report_date) AS report_date
        FROM inventory_active inventory
        GROUP BY ${inventoryRoute}
      ),
      stock_by_route_product AS MATERIALIZED (
        SELECT ${inventoryRoute} AS route_id, ${inventoryProduct} AS product_code, SUM(${inventoryQuantity})::double precision AS current_stock
        FROM inventory_active inventory
        INNER JOIN inventory_latest latest ON latest.route_id = ${inventoryRoute}
          AND inventory.report_date = latest.report_date
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
    `);
  }

  /** Management-only active vehicle route read coordinated under one permit. */
  async queryManagementActiveVehicleRoutes(input: RieManagementActiveVehicleRoutesQuery): Promise<RieManagementActiveVehicleRouteRow[]> {
    if (!input.companyId?.trim()) throw new Error("RIE management active vehicle routes requires companyId.");
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
    const routeScope = effectiveRoutes === null
      ? Prisma.empty
      : effectiveRoutes.length
        ? Prisma.sql` AND ${normalizedField({ field: "RouteID", source: "inventory_source" })} IN (${Prisma.join(effectiveRoutes)})`
        : Prisma.sql` AND FALSE`;

    const inventoryCte = activeEntityRowsCte(input.companyId, "Van Inventory", "inventory", [
      Prisma.sql`${dateText(textField({ field: "ReportDate", source: "inventory_source" }))} <= ${targetDate}${routeScope}`,
    ], [], [], false, [], Prisma.sql`
      ${normalizedField({ field: "RouteID", source: "inventory_source" })} AS route_id,
      NULLIF(BTRIM(COALESCE(${textField({ field: "ReportDate", source: "inventory_source" })}, '')), '') AS report_date
    `);
    return this.postgres<RieManagementActiveVehicleRouteRow[]>("queryManagementActiveVehicleRoutes.sql", { kind: "specialized", operation: "queryManagementActiveVehicleRoutes" }, () => Prisma.sql`
      WITH ${inventoryCte}
      SELECT inventory.route_id AS "routeId", MAX(inventory.report_date) AS "latestReportDate"
      FROM inventory_active inventory
      GROUP BY inventory.route_id
      ORDER BY inventory.route_id
    `);
  }

  /**
   * Coordinates the three heavy Smart Loading management calculations in one
   * PostgreSQL execution. Inventory and the fixed-window sales aggregate are
   * shared; staleness keeps its distinct through-targetDate sales horizon.
   */
  async queryManagementSmartLoadingBundle(input: RieManagementSmartLoadingBundleQuery): Promise<RieManagementSmartLoadingBundle> {
    if (!input.companyId?.trim()) throw new Error("RIE management Smart Loading bundle requires companyId.");
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

      const inventoryProjection = Prisma.sql`
        ${normalizedField({ field: "RouteID", source: "inventory_source" })} AS route_id,
        NULLIF(BTRIM(COALESCE(${textField({ field: "ReportDate", source: "inventory_source" })}, '')), '') AS report_date,
        ${normalizedField({ field: "ProductCode", source: "inventory_source" })} AS product_code,
        ${numericField(textField({ field: "Quantity", source: "inventory_source" }))} AS quantity
      `;
      const staleInvoiceProjection = Prisma.sql`
        ${normalizedField({ field: "InvoiceNo", source: "stale_invoice_source" })} AS invoice_no,
        ${normalizedField({ field: "RouteID", source: "stale_invoice_source" })} AS route_id,
        ${dateText(textField({ field: "InvoiceDate", source: "stale_invoice_source" }))} AS invoice_date
      `;
      const staleItemProjection = Prisma.sql`
        ${normalizedField({ field: "InvoiceNo", source: "stale_item_source" })} AS invoice_no,
        ${normalizedField({ field: "RouteID", source: "stale_item_source" })} AS route_id,
        ${normalizedField({ field: "ProductCode", source: "stale_item_source" })} AS product_code
      `;
      const windowInvoiceProjection = Prisma.sql`
        ${normalizedField({ field: "InvoiceNo", source: "window_invoice_source" })} AS invoice_no,
        ${normalizedField({ field: "RouteID", source: "window_invoice_source" })} AS route_id
      `;
      const windowItemProjection = Prisma.sql`
        ${normalizedField({ field: "InvoiceNo", source: "window_item_source" })} AS invoice_no,
        ${normalizedField({ field: "RouteID", source: "window_item_source" })} AS route_id,
        ${normalizedField({ field: "ProductCode", source: "window_item_source" })} AS product_code,
        ${numericField(textField({ field: "Quantity", source: "window_item_source" }))} AS quantity
      `;
      const productProjection = Prisma.sql`
        ${normalizedField({ field: "ProductCode", source: "product_source" })} AS product_code,
        NULLIF(BTRIM(COALESCE(${textField({ field: "Category", source: "product_source" })}, '')), '') AS category,
        product_source."entity_key" AS entity_key
      `;
      const inventoryCte = activeEntityRowsCte(input.companyId, "Van Inventory", "inventory", [
        Prisma.sql`${dateText(textField({ field: "ReportDate", source: "inventory_source" }))} <= ${targetDate}${routeScope({ field: "RouteID", source: "inventory_source" })}`,
      ], [], [], false, [], inventoryProjection);
      const staleInvoiceCte = activeEntityRowsCte(input.companyId, "Invoices", "stale_invoice", [
        Prisma.sql`${dateText(textField({ field: "InvoiceDate", source: "stale_invoice_source" }))} <= ${targetDate}${routeScope({ field: "RouteID", source: "stale_invoice_source" })}`,
      ], [], [], false, [], staleInvoiceProjection);
      const staleScopedInvoiceNumbersCte = Prisma.sql`stale_scoped_invoice_numbers AS MATERIALIZED (
        SELECT DISTINCT stale_invoice.invoice_no
        FROM stale_invoice_active stale_invoice
        WHERE stale_invoice.invoice_no <> ''
      )`;
      const staleItemsCte = activeEntityRowsCte(input.companyId, "Invoice Items", "stale_item", [], [], [], false, [
        Prisma.sql`INNER JOIN stale_scoped_invoice_numbers scoped_invoice ON ${normalizedField({ field: "InvoiceNo", source: "stale_item_source" })} = scoped_invoice.invoice_no`,
      ], staleItemProjection);
      const windowInvoiceCte = activeEntityRowsCte(input.companyId, "Invoices", "window_invoice", [
        Prisma.sql`${dateText(textField({ field: "InvoiceDate", source: "window_invoice_source" }))} >= ${salesFrom} AND ${dateText(textField({ field: "InvoiceDate", source: "window_invoice_source" }))} <= ${salesTo}${routeScope({ field: "RouteID", source: "window_invoice_source" })}${customerCodes.length ? Prisma.sql` AND ${normalizedField({ field: "CustomerCode", source: "window_invoice_source" })} IN (${Prisma.join(customerCodes)})` : Prisma.sql` AND FALSE`}`,
      ], [], [], false, [], windowInvoiceProjection);
      const windowScopedInvoiceNumbersCte = Prisma.sql`window_scoped_invoice_numbers AS MATERIALIZED (
        SELECT DISTINCT window_invoice.invoice_no
        FROM window_invoice_active window_invoice
        WHERE window_invoice.invoice_no <> ''
      )`;
      const windowItemsCte = activeEntityRowsCte(input.companyId, "Invoice Items", "window_item", [], [], [], false, [
        Prisma.sql`INNER JOIN window_scoped_invoice_numbers scoped_invoice ON ${normalizedField({ field: "InvoiceNo", source: "window_item_source" })} = scoped_invoice.invoice_no`,
      ], windowItemProjection);
      const productCte = activeEntityRowsCte(input.companyId, "Products", "product", [], [], [], false, [
        Prisma.sql`INNER JOIN relevant_product_keys relevant_product ON ${normalizedField({ field: "ProductCode", source: "product_source" })} = relevant_product.product_code`,
      ], productProjection);

    const rows = await this.postgres<Array<{
      routeProductStaleness: RieRouteProductStalenessRow[];
      stockAlignment: RieManagementStockAlignmentRow;
      vehicleProducts: RieManagementVehicleProductRow[];
    }>>("queryManagementSmartLoadingBundle.sql", { kind: "specialized", operation: "queryManagementSmartLoadingBundle" }, () => Prisma.sql`
        WITH ${inventoryCte}, ${staleInvoiceCte}, ${staleScopedInvoiceNumbersCte}, ${staleItemsCte},
        ${windowInvoiceCte}, ${windowScopedInvoiceNumbersCte}, ${windowItemsCte},
        inventory_latest AS MATERIALIZED (
          SELECT inventory.route_id, MAX(inventory.report_date) AS report_date
          FROM inventory_active inventory
          GROUP BY inventory.route_id
        ),
        stock_by_route_product AS MATERIALIZED (
          SELECT inventory.route_id, inventory.product_code,
            SUM(inventory.quantity)::double precision AS current_stock
          FROM inventory_active inventory
          INNER JOIN inventory_latest latest ON latest.route_id = inventory.route_id
            AND inventory.report_date = latest.report_date
          GROUP BY inventory.route_id, inventory.product_code
        ),
        stale_sales_by_route_product AS MATERIALIZED (
          SELECT COALESCE(NULLIF(stale_item.route_id, ''), stale_invoice.route_id, '') AS route_id,
            stale_item.product_code, MAX(stale_invoice.invoice_date) AS last_sale_date
          FROM stale_item_active stale_item
          INNER JOIN stale_invoice_active stale_invoice ON stale_item.invoice_no = stale_invoice.invoice_no
          INNER JOIN (SELECT DISTINCT route_id FROM stock_by_route_product) stocked_routes
            ON stocked_routes.route_id = COALESCE(NULLIF(stale_item.route_id, ''), stale_invoice.route_id, '')
          WHERE stale_item.product_code <> ''
          GROUP BY COALESCE(NULLIF(stale_item.route_id, ''), stale_invoice.route_id, ''), stale_item.product_code
        ),
        route_stale AS MATERIALIZED (
          SELECT stock.route_id, stock.product_code, stock.current_stock, sales.last_sale_date,
            (stock.current_stock > 0 AND sales.last_sale_date IS NOT NULL
              AND (${targetDate}::date - sales.last_sale_date::date) > ${input.staleDaysThreshold}) AS is_stale
          FROM stock_by_route_product stock
          LEFT JOIN stale_sales_by_route_product sales
            ON sales.route_id = stock.route_id AND sales.product_code = stock.product_code
        ),
        staleness_product AS MATERIALIZED (
          SELECT product_code, SUM(current_stock)::double precision AS quantity,
            MAX(last_sale_date) AS last_sale_date, BOOL_OR(is_stale) AS is_stale,
            SUM(COUNT(*) FILTER (WHERE is_stale)) OVER ()::double precision AS stale_route_product_count,
            COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
              'routeId', route_id,
              'currentVehicleStock', current_stock,
              'lastSaleDate', last_sale_date
            ) ORDER BY route_id) FILTER (WHERE is_stale), '[]'::jsonb) AS stale_route_products
          FROM route_stale
          GROUP BY product_code
        ),
        window_sales_by_route_product AS MATERIALIZED (
          SELECT COALESCE(NULLIF(window_item.route_id, ''), window_invoice.route_id, '') AS route_id,
            window_item.product_code,
            SUM(window_item.quantity)::double precision / 12.0 AS weekly_average_sales
          FROM window_item_active window_item
          INNER JOIN window_invoice_active window_invoice ON window_item.invoice_no = window_invoice.invoice_no
          WHERE window_item.product_code <> ''
            AND COALESCE(NULLIF(window_item.route_id, ''), window_invoice.route_id, '') <> ''
          GROUP BY COALESCE(NULLIF(window_item.route_id, ''), window_invoice.route_id, ''), window_item.product_code
        ),
        route_product_alignment AS MATERIALIZED (
          SELECT COALESCE(stock.route_id, sales.route_id) AS route_id,
            COALESCE(stock.product_code, sales.product_code) AS product_code,
            COALESCE(stock.current_stock, 0)::double precision AS current_stock,
            COALESCE(sales.weekly_average_sales, 0)::double precision AS expected_sales
          FROM stock_by_route_product stock
          FULL OUTER JOIN window_sales_by_route_product sales
            ON sales.route_id = stock.route_id AND sales.product_code = stock.product_code
        ),
        relevant_product_keys AS MATERIALIZED (
          SELECT DISTINCT product_code
          FROM route_product_alignment
          WHERE product_code <> ''
        ),
        ${productCte},
        product_categories AS MATERIALIZED (
          SELECT DISTINCT ON (product.product_code) product.product_code, product.category
          FROM product_active product
          WHERE product.product_code <> ''
          ORDER BY product.product_code, product.entity_key DESC
        ),
        category_alignment AS MATERIALIZED (
          SELECT categories.category,
            CASE
              WHEN COALESCE(SUM(alignment.expected_sales), 0) = 0 THEN 100::double precision
              ELSE LEAST(100::double precision,
                (SUM(LEAST(alignment.current_stock, alignment.expected_sales)) / SUM(alignment.expected_sales)) * 100)
            END AS alignment_percent
          FROM route_product_alignment alignment
          LEFT JOIN product_categories categories ON categories.product_code = alignment.product_code
          GROUP BY categories.category
        ),
        alignment_result AS MATERIALIZED (
          SELECT CASE
            WHEN COALESCE(SUM(expected_sales), 0) = 0 THEN 100::double precision
            ELSE LEAST(100::double precision,
              (SUM(LEAST(current_stock, expected_sales)) / SUM(expected_sales)) * 100)
          END AS alignment_percent,
          COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
            'category', category,
            'alignmentPercent', alignment_percent
          ) ORDER BY category NULLS LAST) FROM category_alignment), '[]'::jsonb) AS category_alignments
          FROM route_product_alignment
        ),
        vehicle_product AS MATERIALIZED (
          SELECT COALESCE(stock.route_id, sales.route_id) AS route_id,
            COALESCE(stock.product_code, sales.product_code) AS product_code,
            COALESCE(stock.current_stock, 0)::double precision AS current_stock,
            COALESCE(sales.weekly_average_sales, 0)::double precision AS weekly_average_sales
          FROM (
            SELECT route_id, product_code, current_stock
            FROM stock_by_route_product
            WHERE product_code <> ''
          ) stock
          FULL OUTER JOIN window_sales_by_route_product sales
            ON sales.route_id = stock.route_id AND sales.product_code = stock.product_code
        ),
        vehicle_product_rollup AS MATERIALIZED (
          SELECT product_code, SUM(current_stock)::double precision AS current_vehicle_stock,
            SUM(weekly_average_sales)::double precision AS weekly_average_sales,
            CASE
              WHEN COALESCE(SUM(weekly_average_sales), 0) = 0 THEN 100::double precision
              ELSE LEAST(100::double precision,
                (SUM(LEAST(current_stock, weekly_average_sales)) / SUM(weekly_average_sales)) * 100)
            END AS alignment_percent
          FROM vehicle_product
          GROUP BY product_code
        )
        SELECT
          COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
            'productCode', product_code,
            'quantity', quantity,
            'lastSaleDate', last_sale_date,
            'isStale', is_stale,
            'staleRouteProductCount', stale_route_product_count,
            'staleRouteProducts', stale_route_products
          ) ORDER BY product_code) FROM staleness_product), '[]'::jsonb) AS "routeProductStaleness",
          (SELECT JSONB_BUILD_OBJECT(
            'alignmentPercent', alignment_percent,
            'categoryAlignments', category_alignments
          ) FROM alignment_result) AS "stockAlignment",
          COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
            'productCode', product_code,
            'currentVehicleStock', current_vehicle_stock,
            'weeklyAverageSales', weekly_average_sales,
            'alignmentPercent', alignment_percent
          ) ORDER BY product_code) FROM vehicle_product_rollup), '[]'::jsonb) AS "vehicleProducts"
      `);
      const result = rows[0];
      return {
        routeProductStaleness: Array.isArray(result?.routeProductStaleness) ? result.routeProductStaleness : [],
        stockAlignment: result?.stockAlignment ?? { alignmentPercent: 100, categoryAlignments: [] },
        vehicleProducts: Array.isArray(result?.vehicleProducts) ? result.vehicleProducts : [],
      };
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
    const rows = await this.postgres<RieManagementLoadingRiskRow[]>("queryManagementLoadingRisk.sql", { kind: "specialized", operation: "queryManagementLoadingRisk" }, () => Prisma.sql`
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
    `);
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
    const invoiceProjection = Prisma.sql`
      ${normalizedField({ field: "RouteID", source: "invoice_source" })} AS route_id,
      ${normalizedField({ field: "CustomerCode", source: "invoice_source" })} AS customer_code,
      ${normalizedField({ field: "InvoiceNo", source: "invoice_source" })} AS invoice_no,
      ${dateText(textField({ field: "InvoiceDate", source: "invoice_source" }))} AS invoice_date,
      ${normalizedField({ field: "InvoiceStatus", source: "invoice_source" })} AS invoice_status
    `;
    const itemProjection = Prisma.sql`
      ${normalizedField({ field: "InvoiceNo", source: "item_source" })} AS invoice_no,
      ${normalizedField({ field: "ProductCode", source: "item_source" })} AS product_code,
      ${numericField(textField({ field: "Quantity", source: "item_source" }))} AS quantity
    `;
    const returnProjection = Prisma.sql`
      ${normalizedField({ field: "RouteID", source: "returned_source" })} AS route_id,
      ${normalizedField({ field: "CustomerCode", source: "returned_source" })} AS customer_code,
      ${normalizedField({ field: "ReturnNo", source: "returned_source" })} AS return_no,
      ${dateText(textField({ field: "ReturnDate", source: "returned_source" }))} AS return_date,
      ${normalizedField({ field: "Status", source: "returned_source" })} AS return_status
    `;
    const returnItemProjection = Prisma.sql`
      ${normalizedField({ field: "ReturnNo", source: "return_item_source" })} AS return_no,
      ${normalizedField({ field: "ProductCode", source: "return_item_source" })} AS product_code,
      ${numericField(textField({ field: "Quantity", source: "return_item_source" }))} AS quantity
    `;
    const invoiceCte = activeEntityRowsCte(input.companyId, "Invoices", "invoice", [Prisma.sql`${dateText(textField({ field: "InvoiceDate", source: "invoice_source" }))} >= ${baselineFrom} AND ${dateText(textField({ field: "InvoiceDate", source: "invoice_source" }))} <= ${recentTo}${routeScope({ field: "RouteID", source: "invoice_source" })}`], [], [], false, [], invoiceProjection);
    const scopedInvoiceNumbersCte = Prisma.sql`scoped_invoice_numbers AS MATERIALIZED (
      SELECT DISTINCT invoice.invoice_no
      FROM invoice_active invoice
      WHERE invoice.invoice_no <> ''
    )`;
    // Restrict current item rows to the already company/date/route-scoped
    // headers before the wider join, avoiding unrelated facts.
    const itemCte = activeEntityRowsCte(input.companyId, "Invoice Items", "item", [], [], [], false, [
      Prisma.sql`INNER JOIN scoped_invoice_numbers scoped_invoice ON ${normalizedField({ field: "InvoiceNo", source: "item_source" })} = scoped_invoice.invoice_no`,
    ], itemProjection);
    const returnsCte = activeEntityRowsCte(input.companyId, "Returns", "returned", [Prisma.sql`${dateText(textField({ field: "ReturnDate", source: "returned_source" }))} >= ${baselineFrom} AND ${dateText(textField({ field: "ReturnDate", source: "returned_source" }))} <= ${recentTo}${routeScope({ field: "RouteID", source: "returned_source" })}`], [], [], false, [], returnProjection);
    const scopedReturnNumbersCte = Prisma.sql`scoped_return_numbers AS MATERIALIZED (
      SELECT DISTINCT returned.return_no
      FROM returned_active returned
      WHERE returned.return_no <> ''
    )`;
    // Apply the same parity-safe early current-state narrowing to Return Items.
    const returnItemsCte = activeEntityRowsCte(input.companyId, "Return Items", "return_item", [], [], [], false, [
      Prisma.sql`INNER JOIN scoped_return_numbers scoped_return ON ${normalizedField({ field: "ReturnNo", source: "return_item_source" })} = scoped_return.return_no`,
    ], returnItemProjection);
    const inventoryCte = activeEntityRowsCte(input.companyId, "Van Inventory", "inventory", [Prisma.sql`${dateText(textField({ field: "ReportDate", source: "inventory_source" }))} <= ${targetDate}${routeScope({ field: "RouteID", source: "inventory_source" })}`], [], []);
    const routesCte = activeEntityRowsCte(input.companyId, "Routes", "route", routePredicates, [], []);
    const repCte = activeEntityRowsCte(input.companyId, "Employees", "rep", [], [], []);
    const supervisorCte = activeEntityRowsCte(input.companyId, "Employees", "supervisor", [], [], []);
    const managerCte = activeEntityRowsCte(input.companyId, "Employees", "manager", [], [], []);
    const productCte = activeEntityRowsCte(input.companyId, "Products", "product", [], [], []);
    const customerCode = normalizedField({ field: "CustomerCode", source: "customer" });
    const customerRoute = normalizedField({ field: "RouteID", source: "customer" });
    const invoiceCustomer = Prisma.raw("invoice.customer_code");
    const invoiceRoute = Prisma.raw("invoice.route_id");
    const invoiceNo = Prisma.raw("invoice.invoice_no");
    const invoiceDate = Prisma.raw("invoice.invoice_date");
    const invoiceStatus = Prisma.raw("invoice.invoice_status");
    const itemInvoiceNo = Prisma.raw("item.invoice_no");
    const itemProduct = Prisma.raw("item.product_code");
    const itemQuantity = Prisma.raw("item.quantity");
    const returnCustomer = Prisma.raw("returned.customer_code");
    const returnRoute = Prisma.raw("returned.route_id");
    const returnNo = Prisma.raw("returned.return_no");
    const returnDate = Prisma.raw("returned.return_date");
    const returnStatus = Prisma.raw("returned.return_status");
    const returnItemNo = Prisma.raw("return_item.return_no");
    const returnItemProduct = Prisma.raw("return_item.product_code");
    const returnItemQuantity = Prisma.raw("return_item.quantity");
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
    const rawRows = await this.postgres<Array<{
      affectedPersonCount: number;
      affectedRouteCount: number;
      lostOpportunityCount: number;
      hasMore: boolean;
      rows: RieManagementLostOpportunityRow[];
      topPeople: RieManagementLostOpportunitiesResult["topPeople"];
    }>>("queryManagementLostOpportunities.sql", { kind: "specialized", operation: "queryManagementLostOpportunities" }, () => Prisma.sql`
      WITH ${customerCte}, ${invoiceCte}, ${scopedInvoiceNumbersCte}, ${itemCte}, ${returnsCte}, ${scopedReturnNumbersCte}, ${returnItemsCte}, ${inventoryCte}, ${routesCte}, ${repCte}, ${supervisorCte}, ${managerCte}, ${productCte},
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
    `);
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
    // Keep only the fields needed downstream in materialized CTEs. Newest-wins
    // was resolved at ingestion; these predicates see canonical current rows.
    const inventoryProjection = Prisma.sql`
      ${normalizedField({ field: "RouteID", source: "inventory_source" })} AS route_id,
      NULLIF(BTRIM(COALESCE(${textField({ field: "ReportDate", source: "inventory_source" })}, '')), '') AS report_date,
      ${normalizedField({ field: "ProductCode", source: "inventory_source" })} AS product_code,
      ${numericField(textField({ field: "Quantity", source: "inventory_source" }))} AS quantity
    `;
    const invoiceProjection = Prisma.sql`
      ${normalizedField({ field: "InvoiceNo", source: "invoice_source" })} AS invoice_no,
      ${normalizedField({ field: "RouteID", source: "invoice_source" })} AS route_id
    `;
    const itemProjection = Prisma.sql`
      ${normalizedField({ field: "InvoiceNo", source: "item_source" })} AS invoice_no,
      ${normalizedField({ field: "RouteID", source: "item_source" })} AS route_id,
      ${normalizedField({ field: "ProductCode", source: "item_source" })} AS product_code,
      ${numericField(textField({ field: "Quantity", source: "item_source" }))} AS quantity
    `;
    const productProjection = Prisma.sql`
      ${normalizedField({ field: "ProductCode", source: "product_source" })} AS product_code,
      NULLIF(BTRIM(COALESCE(${textField({ field: "Category", source: "product_source" })}, '')), '') AS category,
      product_source."entity_key" AS entity_key
    `;
    const inventoryCte = activeEntityRowsCte(input.companyId, "Van Inventory", "inventory", [
      Prisma.sql`${dateText(textField({ field: "ReportDate", source: "inventory_source" }))} <= ${targetDate}${routeScope({ field: "RouteID", source: "inventory_source" })}`,
    ], [], [], false, [], inventoryProjection);
    const invoiceCte = activeEntityRowsCte(input.companyId, "Invoices", "invoice", [
      Prisma.sql`${dateText(textField({ field: "InvoiceDate", source: "invoice_source" }))} >= ${salesFrom} AND ${dateText(textField({ field: "InvoiceDate", source: "invoice_source" }))} <= ${salesTo}${routeScope({ field: "RouteID", source: "invoice_source" })}${customerCodes.length ? Prisma.sql` AND ${normalizedField({ field: "CustomerCode", source: "invoice_source" })} IN (${Prisma.join(customerCodes)})` : Prisma.sql` AND FALSE`}`,
    ], [], [], false, [], invoiceProjection);
    const scopedInvoiceNumbersCte = Prisma.sql`scoped_invoice_numbers AS MATERIALIZED (
      SELECT DISTINCT invoice.invoice_no
      FROM invoice_active invoice
      WHERE invoice.invoice_no <> ''
    )`;
    // Restrict current item rows to already company/route/date/customer-scoped
    // headers before the wider join to avoid unrelated JSON payloads.
    const itemsCte = activeEntityRowsCte(input.companyId, "Invoice Items", "item", [], [], [], false, [
      Prisma.sql`INNER JOIN scoped_invoice_numbers scoped_invoice ON ${normalizedField({ field: "InvoiceNo", source: "item_source" })} = scoped_invoice.invoice_no`,
    ], itemProjection);
    const inventoryRoute = Prisma.raw("inventory.route_id");
    const inventoryProduct = Prisma.raw("inventory.product_code");
    const inventoryQuantity = Prisma.raw("inventory.quantity");
    const itemProduct = Prisma.raw("item.product_code");
    const itemQuantity = Prisma.raw("item.quantity");
    const invoiceNo = Prisma.raw("item.invoice_no");
    const invoiceJoinNo = Prisma.raw("invoice.invoice_no");
    const effectiveSaleRoute = Prisma.sql`COALESCE(NULLIF(item.route_id, ''), invoice.route_id, '')`;
    const rows = await this.postgres<RieManagementStockAlignmentRow[]>("queryManagementStockAlignment.sql", { kind: "specialized", operation: "queryManagementStockAlignment" }, () => Prisma.sql`
      WITH ${inventoryCte}, ${invoiceCte}, ${scopedInvoiceNumbersCte}, ${itemsCte},
      inventory_latest AS MATERIALIZED (
        SELECT ${inventoryRoute} AS route_id, MAX(inventory.report_date) AS report_date
        FROM inventory_active inventory
        GROUP BY ${inventoryRoute}
      ),
      stock_by_route_product AS MATERIALIZED (
        SELECT ${inventoryRoute} AS route_id, ${inventoryProduct} AS product_code, SUM(${inventoryQuantity})::double precision AS current_stock
        FROM inventory_active inventory
        INNER JOIN inventory_latest latest ON latest.route_id = ${inventoryRoute}
          AND inventory.report_date = latest.report_date
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
      relevant_product_keys AS MATERIALIZED (
        SELECT DISTINCT product_code
        FROM route_product_alignment
        WHERE product_code <> ''
      ),
      ${activeEntityRowsCte(input.companyId, "Products", "product", [], [], [], false, [
        Prisma.sql`INNER JOIN relevant_product_keys relevant_product ON ${normalizedField({ field: "ProductCode", source: "product_source" })} = relevant_product.product_code`,
      ], productProjection)},
      product_categories AS MATERIALIZED (
        SELECT DISTINCT ON (product.product_code)
          product.product_code,
          product.category
        FROM product_active product
        WHERE product.product_code <> ''
        ORDER BY product.product_code, product.entity_key DESC
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
    `);
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
    const rows = await this.postgres<RieStalePurchaseRow[]>("queryStalePurchases.sql", { kind: "specialized", operation: "queryStalePurchases" }, () => Prisma.sql`
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
    `);
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
    const dateAnyPredicates = (input.scope?.dateAny ?? []).flatMap((date) => {
      assertField(date, aliases);
      const field = scoped(date);
      return field ? [datePredicate(field, cteAliases)] : [];
    });
    if (dateAnyPredicates.length) predicates.push(Prisma.sql`(${Prisma.join(dateAnyPredicates, " OR ")})`);
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

function scalableQueryFingerprintShape(input: RieScalableQuery): Record<string, unknown> {
  const limit = input.pagination?.limit ?? DEFAULT_PAGE_SIZE;
  const paginationBucket = limit <= 1 ? "one" : limit <= 100 ? "small" : limit <= 1_000 ? "medium" : limit <= MAX_PAGE_SIZE ? "large" : "internal";
  return {
    kind: "generic",
    entityName: input.entityName,
    projection: input.projection.map(({ field, source }) => ({ field, source: source ?? "base" })),
    joins: (input.joins ?? []).map((join) => ({ entityName: join.entityName, type: join.type ?? "inner", leftSource: join.on.left.source ?? "base", leftField: join.on.left.field, rightField: join.on.rightField })),
    groupBy: (input.groupBy ?? []).map(({ field, source }) => ({ field, source: source ?? "base" })),
    aggregates: (input.aggregates ?? []).map(({ op, field, source }) => ({ op, field: field ?? null, source: source ?? "base" })),
    scopeKinds: Object.keys(input.scope ?? {}).sort(),
    hierarchyRoute: input.hierarchyRoute ? { field: input.hierarchyRoute.field, source: input.hierarchyRoute.source ?? "base" } : null,
    latestPer: Boolean(input.latestPer),
    paginationBucket,
  };
}

export function activeEntityRowsCte(companyId: string, entityName: string, alias: string, predicates: readonly Prisma.Sql[], semiJoins: readonly Prisma.Sql[], sourceJoins: readonly Prisma.Sql[], _singleActiveVersion = false, preMergeSourceJoins: readonly Prisma.Sql[] = [], projection?: Prisma.Sql): Prisma.Sql {
  const cte = `${alias}_active`;
  const rowAlias = `${alias}_source`;
  // A caller may materialize a purpose-built scalar projection so unused
  // JSONB payloads never enter downstream joins/aggregations.
  const selected = projection ?? Prisma.sql`${Prisma.raw(rowAlias)}.id, ${Prisma.raw(rowAlias)}."entity_key", ${Prisma.raw(rowAlias)}.precedence, ${Prisma.raw(rowAlias)}."data", ${Prisma.raw(rowAlias)}."created_at"`;
  // newest-wins has already been resolved atomically during ingestion/file
  // lifecycle changes. Company and screen scopes therefore apply on the
  // current-only relation before its JSON payload can reach later work.
  return Prisma.sql`${Prisma.raw(cte)} AS MATERIALIZED (
    SELECT ${selected}
    FROM "rie_canonical_entity_rows" ${Prisma.raw(rowAlias)}
    ${preMergeSourceJoins.length ? Prisma.join(preMergeSourceJoins, " ") : Prisma.empty}
    ${sourceJoins.length ? Prisma.join(sourceJoins, " ") : Prisma.empty}
    WHERE ${Prisma.raw(rowAlias)}."company_id" = ${companyId}
      AND ${Prisma.raw(rowAlias)}."entity_name" = ${entityName}
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
  const rowFilters: Prisma.Sql[] = [];
  if (aggregate.filterPositiveField) rowFilters.push(Prisma.sql`${numericField(textField(aggregate.filterPositiveField))} > 0`);
  else if (aggregate.filterValues) rowFilters.push(Prisma.sql`${normalizedField(aggregate.filterValues)} IN (${Prisma.join(aggregate.filterValues.values.map((value) => value.trim().toLowerCase()))})`);
  if (aggregate.filterDates?.length) rowFilters.push(Prisma.sql`(${Prisma.join(aggregate.filterDates.map((scope) => datePredicate(scope, new Set([scope.source ?? "base"]))), " OR ")})`);
  const rowFilter = rowFilters.length ? Prisma.sql` FILTER (WHERE ${Prisma.join(rowFilters, " AND ")})` : Prisma.empty;
  if (aggregate.op === "count" && !aggregate.field) return Prisma.sql`COUNT(*)${rowFilter}::double precision AS ${alias}`;
  const field = textField({ field: aggregate.field!, source: aggregate.source });
  if (aggregate.op === "count") return Prisma.sql`COUNT(NULLIF(BTRIM(COALESCE(${field}, '')), ''))${rowFilter}::double precision AS ${alias}`;
  if (aggregate.op === "countDistinct") return Prisma.sql`(COUNT(DISTINCT NULLIF(BTRIM(COALESCE(${field}, '')), ''))${rowFilter})::double precision AS ${alias}`;
  if (aggregate.op === "arrayAggDistinct") return Prisma.sql`ARRAY_AGG(DISTINCT NULLIF(BTRIM(COALESCE(${field}, '')), '')) FILTER (WHERE NULLIF(BTRIM(COALESCE(${field}, '')), '') IS NOT NULL${rowFilters.length ? Prisma.sql` AND ${Prisma.join(rowFilters, " AND ")}` : Prisma.empty}) AS ${alias}`;
  if (aggregate.op === "minText" || aggregate.op === "maxText") return Prisma.sql`${Prisma.raw(aggregate.op === "minText" ? "MIN" : "MAX")}(NULLIF(BTRIM(COALESCE(${field}, '')), ''))${rowFilter} AS ${alias}`;
  const numeric = numericField(field);
  if (aggregate.op === "sumProduct") {
    const multiplier = textField(aggregate.multiplier!);
    const numericMultiplier = Prisma.sql`CASE WHEN BTRIM(COALESCE(${multiplier}, '')) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN BTRIM(COALESCE(${multiplier}, ''))::double precision ELSE NULL END`;
    if (aggregate.multiplierFallback) {
      const fallback = textField(aggregate.multiplierFallback);
      const numericFallback = Prisma.sql`CASE WHEN BTRIM(COALESCE(${fallback}, '')) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN BTRIM(COALESCE(${fallback}, ''))::double precision ELSE NULL END`;
      return Prisma.sql`SUM(${numeric} * CASE WHEN ${multiplier} IS NULL THEN ${numericFallback} ELSE ${numericMultiplier} END)${rowFilter} AS ${alias}`;
    }
    return Prisma.sql`SUM(${numeric} * ${numericMultiplier})${rowFilter} AS ${alias}`;
  }
  return Prisma.sql`${Prisma.raw({ sum: "SUM", avg: "AVG", min: "MIN", max: "MAX" }[aggregate.op])}(${numeric})${rowFilter} AS ${alias}`;
}
function numericField(field: Prisma.Sql): Prisma.Sql { return Prisma.sql`CASE WHEN BTRIM(COALESCE(${field}, '')) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN BTRIM(COALESCE(${field}, ''))::double precision ELSE NULL END`; }
/** Mirrors Number(value) + Number.isFinite for canonical JSON scalar values. */
function localDecisionNumberField(source: string, field: string): Prisma.Sql {
  const json = Prisma.sql`${Prisma.raw(source)}."data" -> ${Prisma.raw(`'${field}'`)}`;
  const text = Prisma.sql`${Prisma.raw(source)}."data" ->> ${Prisma.raw(`'${field}'`)}`;
  return Prisma.sql`CASE
    WHEN ${json} IS NULL OR jsonb_typeof(${json}) = 'null' THEN 0
    WHEN jsonb_typeof(${json}) = 'boolean' THEN CASE WHEN (${text})::boolean THEN 1 ELSE 0 END
    WHEN BTRIM(COALESCE(${text}, '')) = '' THEN 0
    WHEN BTRIM(COALESCE(${text}, '')) ~ '^[+-]?([0-9]+(\\.[0-9]*)?|\\.[0-9]+)([eE][+-]?[0-9]+)?$'
      THEN BTRIM(${text})::double precision
    ELSE NULL
  END`;
}
/** Geo's legacy coercion accepted signed decimals and exponent notation. */
function geoFiniteNumberField(field: Prisma.Sql): Prisma.Sql { return Prisma.sql`CASE WHEN BTRIM(COALESCE(${field}, '')) ~ '^[+-]?(\\d+(\\.\\d*)?|\\.\\d+)([eE][+-]?\\d+)?$' THEN BTRIM(COALESCE(${field}, ''))::double precision ELSE NULL END`; }
function heatmapEpochField(field: Prisma.Sql): Prisma.Sql { return Prisma.sql`CASE WHEN BTRIM(COALESCE(${field}, '')) ~ '^\\d{4}-\\d{2}-\\d{2}' THEN EXTRACT(EPOCH FROM BTRIM(${field})::timestamptz) * 1000 ELSE NULL END`; }
/** Node Date.parse treats a bare ISO calendar date as midnight UTC. */
function visitEfficiencyEpochField(field: Prisma.Sql): Prisma.Sql { return Prisma.sql`CASE WHEN BTRIM(COALESCE(${field}, '')) ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN EXTRACT(EPOCH FROM (BTRIM(${field})::date::timestamp AT TIME ZONE 'UTC')) * 1000 WHEN BTRIM(COALESCE(${field}, '')) ~ '^\\d{4}-\\d{2}-\\d{2}' THEN EXTRACT(EPOCH FROM BTRIM(${field})::timestamptz) * 1000 ELSE NULL END`; }
/** Territory's legacy Number coercion accepts comma-grouped and exponent values. */
function territoryFiniteNumberField(field: Prisma.Sql): Prisma.Sql { return Prisma.sql`CASE WHEN BTRIM(REPLACE(COALESCE(${field}, ''), ',', '')) ~ '^[+-]?(\\d+(\\.\\d*)?|\\.\\d+)([eE][+-]?\\d+)?$' THEN BTRIM(REPLACE(COALESCE(${field}, ''), ',', ''))::double precision ELSE NULL END`; }
/** Mirrors Visit Copilot's Number(value.replace(/,/g, "")) coercion. */
function visitCopilotFiniteNumberField(field: Prisma.Sql): Prisma.Sql { return territoryFiniteNumberField(field); }
function addGeoEngineValues(predicates: Prisma.Sql[], field: Prisma.Sql, values: readonly string[] | undefined): void {
  if (values?.length) predicates.push(Prisma.sql`${field} IN (${Prisma.join([...values])})`);
}
/** Exact epoch behavior of the existing Geo Engine canonical date reads. */
function geoEngineEpochField(field: RieQueryField): Prisma.Sql {
  const text = textField(field);
  const json = Prisma.sql`${Prisma.raw(field.source ?? "base")}."data" -> ${Prisma.raw(`'${field.field}'`)}`;
  return Prisma.sql`CASE
    WHEN jsonb_typeof(${json}) = 'number' THEN (${text})::double precision
    WHEN BTRIM(COALESCE(${text}, '')) ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN EXTRACT(EPOCH FROM (BTRIM(${text})::date::timestamp AT TIME ZONE 'UTC')) * 1000
    WHEN BTRIM(COALESCE(${text}, '')) ~ '^\\d{4}-\\d{2}-\\d{2}' THEN EXTRACT(EPOCH FROM BTRIM(${text})::timestamptz) * 1000
    ELSE NULL END`;
}
/** Geo Engine invoice dates preserve Node Date.parse semantics for bare ISO days. */
function geoEngineInvoiceEpochField(field: RieQueryField): Prisma.Sql {
  const text = textField(field);
  return Prisma.sql`CASE
    WHEN BTRIM(COALESCE(${text}, '')) ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN EXTRACT(EPOCH FROM (BTRIM(${text})::date::timestamp AT TIME ZONE 'UTC')) * 1000
    WHEN BTRIM(COALESCE(${text}, '')) ~ '^\\d{4}-\\d{2}-\\d{2}' THEN EXTRACT(EPOCH FROM BTRIM(${text})::timestamptz) * 1000
    ELSE NULL END`;
}
/** Canonical ISO timestamps and numeric Excel serial dates normalized to Node's UTC day. */
function visitCopilotDateField(field: RieQueryField): Prisma.Sql {
  const text = textField(field);
  const json = Prisma.sql`${Prisma.raw(field.source ?? "base")}."data" -> ${Prisma.raw(`'${field.field}'`)}`;
  return Prisma.sql`CASE
    WHEN jsonb_typeof(${json}) = 'number' AND BTRIM(COALESCE(${text}, '')) ~ '^[0-9]+(\\.[0-9]+)?$'
      AND BTRIM(${text})::double precision > 20000 AND BTRIM(${text})::double precision < 80000
      THEN TO_CHAR(TIMESTAMP '1899-12-30' + BTRIM(${text})::double precision * INTERVAL '1 day', 'YYYY-MM-DD')
    WHEN BTRIM(COALESCE(${text}, '')) ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN BTRIM(${text})
    WHEN BTRIM(COALESCE(${text}, '')) ~ '^\\d{4}-\\d{2}-\\d{2}[T ]' THEN TO_CHAR(BTRIM(${text})::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD')
    ELSE NULL END`;
}
/** Mirrors Node Date.parse for canonical ISO dates without inheriting the database session timezone. */
function territoryEpochField(field: Prisma.Sql): Prisma.Sql { return Prisma.sql`CASE WHEN BTRIM(COALESCE(${field}, '')) ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN EXTRACT(EPOCH FROM (BTRIM(${field})::date::timestamp AT TIME ZONE 'UTC')) * 1000 WHEN BTRIM(COALESCE(${field}, '')) ~ '^\\d{4}-\\d{2}-\\d{2}' THEN EXTRACT(EPOCH FROM BTRIM(${field})::timestamptz) * 1000 ELSE NULL END`; }
/** PostgreSQL form of Territory Intelligence's established JavaScript slugify. */
function territorySlugField(field: Prisma.Sql): Prisma.Sql { return Prisma.sql`REGEXP_REPLACE(REGEXP_REPLACE(LOWER(BTRIM(${field})), '\\s+', '-', 'g'), '[^a-z0-9؀-ۿ-]', '', 'g')`; }
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
