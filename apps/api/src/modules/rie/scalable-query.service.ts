import { Injectable } from "@nestjs/common";
import { Prisma } from "@field-sales-os/database";
import { PrismaService } from "../../common/prisma";
import { CanonicalHierarchyResolverService } from "./canonical-hierarchy-resolver.service";
import type { EntityRecord, EntityQueryResult } from "./entity-provider.interface";
import type { RieDateScope, RieLatestPerScope, RieManagementLoadingRiskQuery, RieManagementLoadingRiskRow, RieManagementStockAlignmentQuery, RieManagementStockAlignmentRow, RieManagementVehicleProductsQuery, RieManagementVehicleProductRow, RieQueryAggregation, RieQueryField, RieQueryJoin, RieRouteFallbackScope, RieRouteProductStalenessQuery, RieRouteProductStalenessRow, RieScalableEntityRead, RieScalableQuery, RieScalableQueryResult, RieStalePurchaseRow, RieStalePurchasesQuery, RieValueScope } from "./scalable-query.types";

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
    const page = normalizePagination(input.pagination, input.internalAggregate === true);
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
    const rows = await this.prisma.$queryRaw<EntityRecord[]>(Prisma.sql`
      WITH ${Prisma.join(ctes, ", ")}
      SELECT ${Prisma.join(select)}
      FROM ${baseReference}
      ${joinClause}
      WHERE TRUE${where}
      ${grouping}
      ${ordering}
      LIMIT ${page.limit + 1} OFFSET ${page.offset}
    `);
    const hasMore = rows.length > page.limit;
    return { records: hasMore ? rows.slice(0, page.limit) : rows, page: { ...page, hasMore } };
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
    const itemsCte = activeEntityRowsCte(input.companyId, "Invoice Items", "item", [], [], []);
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
    const rows = await this.prisma.$queryRaw<RieRouteProductStalenessRow[]>(Prisma.sql`
      WITH ${inventoryCte}, ${invoiceCte}, ${itemsCte},
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
    return this.prisma.$queryRaw<RieManagementVehicleProductRow[]>(Prisma.sql`
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
    `);
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
    const routesCte = activeEntityRowsCte(input.companyId, "Routes", "route", [routeScope({ field: "RouteID", source: "route_source" })], [], []);
    const repCte = activeEntityRowsCte(input.companyId, "Employees", "rep", [], [], []), supervisorCte = activeEntityRowsCte(input.companyId, "Employees", "supervisor", [], [], []), managerCte = activeEntityRowsCte(input.companyId, "Employees", "manager", [], [], []), productCte = activeEntityRowsCte(input.companyId, "Products", "product", [], [], []);
    const invRoute = normalizedField({ field: "RouteID", source: "inventory" }), invProduct = normalizedField({ field: "ProductCode", source: "inventory" }), invQuantity = numericField(textField({ field: "Quantity", source: "inventory" }));
    const itemProduct = normalizedField({ field: "ProductCode", source: "item" }), itemQuantity = numericField(textField({ field: "Quantity", source: "item" })), itemInvoice = normalizedField({ field: "InvoiceNo", source: "item" }), invoiceNo = normalizedField({ field: "InvoiceNo", source: "invoice" });
    const saleRoute = Prisma.sql`LOWER(BTRIM(COALESCE(NULLIF(BTRIM(COALESCE(${textField({ field: "RouteID", source: "item" })}, '')), ''), ${textField({ field: "RouteID", source: "invoice" })}, '')))`;
    const routeId = normalizedField({ field: "RouteID", source: "route" }), routeRep = normalizedField({ field: "SalesRepID", source: "route" }), repId = normalizedField({ field: "EmployeeID", source: "rep" }), supervisorId = normalizedField({ field: "EmployeeID", source: "supervisor" }), managerId = normalizedField({ field: "EmployeeID", source: "manager" });
    const person = input.personLevel === "manager" ? { id: managerId, name: textField({ field: "EmployeeName", source: "manager" }) } : input.personLevel === "supervisor" ? { id: supervisorId, name: textField({ field: "EmployeeName", source: "supervisor" }) } : { id: repId, name: textField({ field: "EmployeeName", source: "rep" }) };
    const productCode = normalizedField({ field: "ProductCode", source: "product" }), productName = textField({ field: "ProductName", source: "product" });
    const rows = await this.prisma.$queryRaw<RieManagementLoadingRiskRow[]>(Prisma.sql`
      WITH ${inventoryCte}, ${invoiceCte}, ${itemsCte}, ${routesCte}, ${repCte}, ${supervisorCte}, ${managerCte}, ${productCte},
      latest_inventory AS MATERIALIZED (SELECT ${invRoute} route_id, MAX(NULLIF(BTRIM(COALESCE(${textField({ field: "ReportDate", source: "inventory" })}, '')), '')) report_date FROM inventory_active inventory GROUP BY ${invRoute}),
      stock AS MATERIALIZED (SELECT ${invRoute} route_id, ${invProduct} product_code, SUM(${invQuantity})::double precision current_stock FROM inventory_active inventory INNER JOIN latest_inventory latest ON latest.route_id=${invRoute} AND NULLIF(BTRIM(COALESCE(${textField({ field: "ReportDate", source: "inventory" })}, '')), '')=latest.report_date WHERE ${invProduct}<>'' GROUP BY ${invRoute}, ${invProduct}),
      demand AS MATERIALIZED (SELECT ${saleRoute} route_id, ${itemProduct} product_code, (SUM(${itemQuantity})/12.0)::double precision expected_demand FROM item_active item INNER JOIN invoice_active invoice ON ${itemInvoice}=${invoiceNo} WHERE ${itemProduct}<>'' AND ${saleRoute}<>'' GROUP BY ${saleRoute}, ${itemProduct}),
      people AS MATERIALIZED (SELECT ${routeId} route_id, ${person.id} employee_id, COALESCE(NULLIF(BTRIM(COALESCE(${person.name}, '')), ''), ${person.id}) employee_name FROM route_active route INNER JOIN rep_active rep ON ${routeRep}=${repId} INNER JOIN supervisor_active supervisor ON ${normalizedField({ field: "DirectManagerID", source: "rep" })}=${supervisorId} INNER JOIN manager_active manager ON ${normalizedField({ field: "DirectManagerID", source: "supervisor" })}=${managerId} WHERE ${person.id}<>''),
      risk AS MATERIALIZED (SELECT people.employee_id, people.employee_name, people.route_id, demand.product_code, demand.expected_demand, COALESCE(stock.current_stock,0)::double precision current_stock FROM people INNER JOIN demand ON demand.route_id=people.route_id LEFT JOIN stock ON stock.route_id=demand.route_id AND stock.product_code=demand.product_code WHERE demand.expected_demand>COALESCE(stock.current_stock,0)),
      product_names AS MATERIALIZED (SELECT DISTINCT ON (${productCode}) ${productCode} product_code, NULLIF(BTRIM(COALESCE(${productName}, '')), '') product_name FROM product_active product WHERE ${productCode}<>'' ORDER BY ${productCode}, product."entity_key" DESC),
      route_result AS MATERIALIZED (SELECT risk.employee_id, risk.employee_name, risk.route_id, COUNT(*)::integer affected_product_count, JSONB_AGG(JSONB_BUILD_OBJECT('productCode',risk.product_code,'productName',COALESCE(names.product_name,risk.product_code),'expectedDemand',risk.expected_demand,'currentVehicleStock',risk.current_stock,'quantityGap',risk.expected_demand-risk.current_stock) ORDER BY risk.expected_demand-risk.current_stock DESC,risk.product_code) products FROM risk LEFT JOIN product_names names ON names.product_code=risk.product_code GROUP BY risk.employee_id,risk.employee_name,risk.route_id),
      person_result AS MATERIALIZED (SELECT employee_id,employee_name,COUNT(*)::integer affected_route_count,SUM(affected_product_count)::integer affected_product_count,JSONB_AGG(JSONB_BUILD_OBJECT('routeId',route_id,'products',products) ORDER BY route_id) routes FROM route_result GROUP BY employee_id,employee_name)
      SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT('employeeId',employee_id,'employeeName',employee_name,'affectedRouteCount',affected_route_count,'affectedProductCount',affected_product_count,'routes',routes) ORDER BY employee_name,employee_id),'[]'::jsonb) people FROM person_result
    `);
    return rows[0] ?? { people: [] };
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
    const rows = await this.prisma.$queryRaw<RieManagementStockAlignmentRow[]>(Prisma.sql`
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
    const rows = await this.prisma.$queryRaw<RieStalePurchaseRow[]>(Prisma.sql`
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

function normalizePagination(input: RieScalableQuery["pagination"], internalAggregate: boolean): { limit: number; offset: number } {
  const limit = input?.limit ?? DEFAULT_PAGE_SIZE;
  const offset = input?.offset ?? 0;
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
