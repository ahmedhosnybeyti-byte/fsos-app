import { Injectable } from "@nestjs/common";
import { Prisma } from "@field-sales-os/database";
import type { Fsos360Query } from "@field-sales-os/schemas";
import type { Fsos360Filters, Fsos360FilterOptionsQuery } from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma";
import { CanonicalHierarchyResolverService } from "./canonical-hierarchy-resolver.service";
import { activeEntityRowsCte } from "./scalable-query.service";
import { IMPORT_TEMPLATES } from '../import-validation/import-templates.data';
import type { EntityQueryContext } from "./entity-provider.interface";
import type { Fsos360ResolvedContext } from "../decision-analytics-studio/fsos-360-context.service";

export interface Fsos360PeriodAggregate {
  sales: number; orders: number; salesRows: number; collections: number; returns: number;
  visits: number; productive: number; visited: number; inScopeCustomers: number;
}
export interface Fsos360FactAggregate {
  missingHistory: boolean;
  periods: Fsos360PeriodAggregate[];
  timeline: { period: number; position: number; value: number }[];
  visualizationTimeline: { period: number; position: number; value: number }[];
  categories: { key: string; label: string; current: number; previous: number; change: number }[];
  treemap: { key: string; label: string; value: number; isOther: boolean }[];
  geo: { points: { customerCode: string; customerName: string; routeId: string | null; latitude: number; longitude: number; value: number }[]; totalRows: number; mappedRows: number; unmappedRows: number };
}

// These conversions deliberately belong to FSOS 360, not generic RIE:
// this screen accepts comma-formatted amounts and millisecond numeric dates.
const cell = (alias: string, field: string) => Prisma.raw(`${alias}.data -> '${field}'`);
const str = (alias: string, field: string) => Prisma.raw(`BTRIM(COALESCE(${alias}.data ->> '${field}', ''))`);
function numeric(value: Prisma.Sql): Prisma.Sql {
  const text = Prisma.sql`REPLACE(BTRIM(${value} #>> '{}'), ',', '')`;
  return Prisma.sql`CASE WHEN jsonb_typeof(${value}) IN ('number', 'string') AND ${text} ~ '^[+-]?([0-9]+(\\.[0-9]*)?|\\.[0-9]+)([eE][+-]?[0-9]+)?$' AND pg_input_is_valid(${text}, 'double precision') THEN ${text}::double precision ELSE NULL END`;
}
function time(value: Prisma.Sql): Prisma.Sql {
  // ECMAScript date-only ISO strings are UTC, even when the session/Node TZ is not UTC.
  const text = Prisma.sql`CASE WHEN (${value} #>> '{}') ~ '^[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$' THEN (${value} #>> '{}') || ' UTC' ELSE ${value} #>> '{}' END`;
  return Prisma.sql`CASE WHEN jsonb_typeof(${value}) = 'number' THEN (${value} #>> '{}')::double precision WHEN jsonb_typeof(${value}) = 'string' AND BTRIM(${value} #>> '{}') <> '' AND pg_input_is_valid(${text}, 'timestamp with time zone') THEN TRUNC(EXTRACT(EPOCH FROM (${text})::timestamptz) * 1000)::double precision ELSE NULL END`;
}
const values = (expr: Prisma.Sql, list?: readonly string[]) => list?.length ? Prisma.sql`${expr} IN (${Prisma.join(list)})` : Prisma.sql`TRUE`;

/** FSOS 360-only contract: facts stay in SQL; response is KPI/chart grain. */
@Injectable()
export class RieFsos360QueryService {
  constructor(private readonly prisma: PrismaService, private readonly hierarchy: CanonicalHierarchyResolverService) {}

  private async customerCtes(ctx: EntityQueryContext) {
    const allowed = ctx.requestingUser ? await this.hierarchy.resolveAllowedRouteIds(ctx.companyId, ctx.requestingUser) : null;
    return Prisma.sql`${activeEntityRowsCte(ctx.companyId, 'Customers', 'customer', allowed ? [allowed.size ? Prisma.sql`LOWER(${str('customer_source', 'RouteID')}) IN (${Prisma.join([...allowed])})` : Prisma.sql`FALSE`] : [], [], [])},
      customer_ordered AS (SELECT c.*, ROW_NUMBER() OVER (ORDER BY precedence, created_at, id) seq FROM customer_active c),
      customers AS MATERIALIZED (
        SELECT DISTINCT ON (${str('c', 'CustomerCode')}) ${str('c', 'CustomerCode')} code,
          MIN(c.seq) OVER (PARTITION BY ${str('c', 'CustomerCode')}) first_row,
          COALESCE(c.data ->> 'CustomerName', ${str('c', 'CustomerCode')}) name,
          ${str('c', 'City')} city, ${str('c', 'BranchID')} "branchId", ${str('c', 'RouteID')} "routeId"
        FROM customer_ordered c WHERE ${str('c', 'CustomerCode')} <> ''
        ORDER BY ${str('c', 'CustomerCode')}, c.precedence DESC, c.created_at DESC, c.id DESC
      )`;
  }

  /** Distinct geography combinations and requested selections only; no customer master collection. */
  async customerContext(ctx: EntityQueryContext, selectedCodes: readonly string[] = []) {
    const ctes = await this.customerCtes(ctx);
    const rows = await this.prisma.$queryRaw<Array<{ total: number; geographies: { city: string; branchId: string; routeId: string }[]; selected: { code: string; name: string; city: string; branchId: string; routeId: string }[] }>>(Prisma.sql`
      WITH ${ctes}, geographies AS (SELECT city, "branchId", "routeId", MIN(first_row) first_row FROM customers GROUP BY 1, 2, 3)
      SELECT (SELECT COUNT(*)::int FROM customers) total,
        COALESCE((SELECT jsonb_agg(to_jsonb(g) - 'first_row' ORDER BY first_row) FROM geographies g), '[]') geographies,
        COALESCE((SELECT jsonb_agg(c) FROM customers c WHERE ${selectedCodes.length ? Prisma.sql`code IN (${Prisma.join(selectedCodes)})` : Prisma.sql`FALSE`}), '[]') selected
    `);
    return rows[0]!;
  }

  async customerOptions(ctx: EntityQueryContext, filters: Fsos360Filters, branches: Map<string, { regionId: string }>, input: Pick<Fsos360FilterOptionsQuery, 'query' | 'page' | 'pageSize'>, candidateCodes?: string[]) {
    const ctes = await this.customerCtes(ctx);
    const region = Prisma.sql`COALESCE(${JSON.stringify(Object.fromEntries([...branches].map(([id, b]) => [id, b.regionId])))}::jsonb ->> c."branchId", '')`;
    const rows = await this.prisma.$queryRaw<Array<{ options: { value: string; label: string; meta: { city: string; routeId: string } }[]; total: number }>>(Prisma.sql`
      WITH ${ctes}, options AS MATERIALIZED (
        SELECT c.code value, c.name label, c.first_row, jsonb_build_object('city', c.city, 'routeId', c."routeId") meta
        FROM customers c WHERE ${values(region, filters.regionIds)} AND ${values(Prisma.sql`c.city`, filters.cityValues)}
          AND ${values(Prisma.sql`c."branchId"`, filters.branchIds)} AND ${values(Prisma.sql`c."routeId"`, filters.routeIds)}
          AND ${values(Prisma.sql`c.code`, filters.customerCodes)}
          ${candidateCodes ? candidateCodes.length ? Prisma.sql`AND c.code IN (${Prisma.join(candidateCodes)})` : Prisma.sql`AND FALSE` : Prisma.empty}
          AND STRPOS(LOWER(c.code || ' ' || c.name || ' ' || c.city || ' ' || c."routeId"), ${input.query.trim().toLocaleLowerCase()}) > 0
      ), page AS (SELECT value, label, meta FROM options ORDER BY label COLLATE "und-x-icu", first_row OFFSET ${(input.page - 1) * input.pageSize} LIMIT ${input.pageSize})
      SELECT COALESCE((SELECT jsonb_agg(p) FROM page p), '[]') options, (SELECT COUNT(*)::int FROM options) total
    `);
    return rows[0]!;
  }

  async aggregate(ctx: EntityQueryContext, context: Fsos360ResolvedContext, input: Fsos360Query): Promise<Fsos360FactAggregate> {
    const allowed = ctx.requestingUser ? await this.hierarchy.resolveAllowedRouteIds(ctx.companyId, ctx.requestingUser) : null;
    const active = (entity: string, alias: string) => activeEntityRowsCte(ctx.companyId, entity, alias, allowed && IMPORT_TEMPLATES.find(t => t.entity === entity)?.fields.some(f => f.name === 'RouteID') ? [allowed.size ? Prisma.sql`LOWER(${str(`${alias}_source`, 'RouteID')}) IN (${Prisma.join([...allowed])})` : Prisma.sql`FALSE`] : [], [], []);
    const f = context.filters;
    const periods = [input.currentPeriod, input.comparisonPeriod].map((p, period) => {
      const from = Date.parse(p.from), to = Date.parse(p.to), days = Math.ceil((to - from) / 86400000) + 1;
      const visualizationFrom = Date.parse(new Date(from).toISOString().slice(0, 10));
      const visualizationTo = Date.parse(new Date(to).toISOString().slice(0, 10));
      const visualizationDays = Math.ceil((visualizationTo - visualizationFrom) / 86400000) + 1;
      return { period, from, to, unit: days <= 62 ? 'day' : days <= 180 ? 'week' : 'month', visualizationFrom, visualizationUnit: visualizationDays <= 62 ? 'day' : visualizationDays <= 180 ? 'week' : 'month' };
    });
    const json = (v: unknown) => Prisma.sql`${JSON.stringify(v)}::jsonb`;
    // Small hierarchy metadata is supplied by the existing context resolver.
    const assignments = context.routeAssignments.map(a => ({ ...a, supervisor: context.employees.get(a.employeeId)?.managerId ?? '', manager: context.employees.get(context.employees.get(a.employeeId)?.managerId ?? '')?.managerId ?? '' }));
    const historyRequired = Boolean(f.salesRepIds?.length || f.managerIds?.length || f.supervisorIds?.length || context.activeAnalysisLevel === 'sales-rep');
    const history = (selected: boolean) => Prisma.sql`EXISTS (SELECT 1 FROM assignments a WHERE a."routeId" = o.route AND a.role = 'SalesRep' AND a."startAt" <= o.time AND (a."endAt" IS NULL OR o.time <= a."endAt") ${selected ? Prisma.sql`AND ${values(Prisma.sql`a."employeeId"`, f.salesRepIds)} AND ${values(Prisma.sql`a.supervisor`, f.supervisorIds)} AND ${values(Prisma.sql`a.manager`, f.managerIds)}` : Prisma.empty})`;
    const scope = Prisma.sql`${values(Prisma.sql`c.region`, f.regionIds)} AND ${values(Prisma.sql`c.city`, f.cityValues)} AND ${values(Prisma.sql`c.branch`, f.branchIds)} AND ${values(Prisma.sql`COALESCE(NULLIF(o.route, ''), c.route)`, f.routeIds)} AND ${values(Prisma.sql`c.code`, f.customerCodes)}`;
    const product = Prisma.sql`${values(Prisma.sql`p.brand`, f.brandValues)} AND ${values(Prisma.sql`p.category`, f.categoryValues)} AND ${values(Prisma.sql`p.code`, f.productCodes)}`;
    const needsHistory = ['manager', 'supervisor', 'sales-rep'].includes(context.activeAnalysisLevel) || Boolean(f.managerIds?.length || f.supervisorIds?.length || f.salesRepIds?.length);
    const selectedType = input.visualization?.preferredType && input.visualization.preferredType !== 'auto' ? input.visualization.preferredType : ({ route: 'route-map', category: 'bar', brand: 'treemap', product: 'treemap', customer: 'customer-density' } as Record<string, string>)[context.activeAnalysisLevel] ?? 'line';
    const geoKind = selectedType === 'coverage-map' || selectedType === 'route-map' ? 'Visits' : input.visualization?.metric === 'collections' ? 'Collections' : input.visualization?.metric === 'returns' ? 'Returns' : 'sales';
    const customerScope = Prisma.sql`${values(Prisma.sql`c.region`, f.regionIds)} AND ${values(Prisma.sql`c.city`, f.cityValues)} AND ${values(Prisma.sql`c.branch`, f.branchIds)} AND ${values(Prisma.sql`c.route`, f.routeIds)} AND ${values(Prisma.sql`c.code`, f.customerCodes)}`;
    const customerRep = context.activeAnalysisLevel === 'sales-rep' || f.salesRepIds?.length
      ? Prisma.sql`EXISTS (SELECT 1 FROM assignments a WHERE a."routeId" = c.route AND a.role = 'SalesRep' AND a."startAt" <= w."from" AND (a."endAt" IS NULL OR w."from" <= a."endAt") AND ${values(Prisma.sql`a."employeeId"`, f.salesRepIds)})` : Prisma.sql`TRUE`;
    const rows = await this.prisma.$queryRaw<{ result: Fsos360FactAggregate }[]>(Prisma.sql`
      WITH ${active('Customers', 'customer')}, ${active('Products', 'product')}, ${active('Invoices', 'invoice')},
      ${active('Invoice Items', 'item')}, ${active('Collections', 'collection')}, ${active('Returns', 'returned')}, ${active('Visits', 'visit')},
      customer_ordered AS (SELECT c.*, ROW_NUMBER() OVER (ORDER BY precedence, created_at, id) seq FROM customer_active c),
      customers AS MATERIALIZED (
        SELECT DISTINCT ON (${str('c', 'CustomerCode')}) ${str('c', 'CustomerCode')} code,
          MIN(c.seq) OVER (PARTITION BY ${str('c', 'CustomerCode')}) first_row,
          COALESCE(c.data ->> 'CustomerName', ${str('c', 'CustomerCode')}) name,
          ${str('c', 'City')} city, ${str('c', 'BranchID')} branch, ${str('c', 'RouteID')} route,
          ${numeric(cell('c', 'Latitude'))} lat, ${numeric(cell('c', 'Longitude'))} lon,
          COALESCE(${json(Object.fromEntries([...context.branches].map(([id, b]) => [id, b.regionId])))} ->> ${str('c', 'BranchID')}, '') region
        FROM customer_ordered c WHERE ${context.datasets.Customers.available} AND ${str('c', 'CustomerCode')} <> ''
        ORDER BY ${str('c', 'CustomerCode')}, c.precedence DESC, c.created_at DESC, c.id DESC
      ), customers_scoped AS MATERIALIZED (
        SELECT c.* FROM customers c WHERE ${values(Prisma.sql`c.region`, f.regionIds)} AND ${values(Prisma.sql`c.city`, f.cityValues)}
          AND ${values(Prisma.sql`c.branch`, f.branchIds)} AND ${values(Prisma.sql`c.code`, f.customerCodes)}
      ), products AS MATERIALIZED (
        SELECT DISTINCT ON (${str('p', 'ProductCode')}) ${str('p', 'ProductCode')} code,
          COALESCE(p.data ->> 'ProductName', ${str('p', 'ProductCode')}) name, ${str('p', 'Brand')} brand, ${str('p', 'Category')} category
        FROM product_active p WHERE ${context.datasets.Products.available} AND ${str('p', 'ProductCode')} <> ''
        ORDER BY ${str('p', 'ProductCode')}, p.precedence DESC, p.created_at DESC, p.id DESC
      ), invoices AS MATERIALIZED (
        SELECT DISTINCT ON (${str('i', 'InvoiceNo')}) ${str('i', 'InvoiceNo')} no, ${str('i', 'CustomerCode')} customer,
          ${str('i', 'RouteID')} route, ${time(cell('i', 'InvoiceDate'))} time
        FROM invoice_active i WHERE ${str('i', 'InvoiceNo')} <> ''
        ORDER BY ${str('i', 'InvoiceNo')}, i.precedence DESC, i.created_at DESC, i.id DESC
      ), periods AS (SELECT * FROM jsonb_to_recordset(${json(periods)}) AS w(period int, "from" float8, "to" float8, unit text, "visualizationFrom" float8, "visualizationUnit" text)),
      invoices_scoped AS MATERIALIZED (
        SELECT i.* FROM invoices i JOIN customers_scoped c ON c.code = i.customer
        WHERE EXISTS (SELECT 1 FROM periods w WHERE i.time BETWEEN w."from" AND w."to")
          AND ${values(Prisma.sql`COALESCE(NULLIF(i.route, ''), c.route)`, f.routeIds)}
      ),
      assignments AS (SELECT * FROM jsonb_to_recordset(${json(assignments)}) AS a("routeId" text, "employeeId" text, role text, "startAt" float8, "endAt" float8, supervisor text, manager text)),
      operations AS NOT MATERIALIZED (
        SELECT 'sales' kind, i.no invoice, i.customer, ${str('l', 'ProductCode')} product, i.route, i.time,
          COALESCE(${numeric(cell('l', 'LineTotal'))}, 0) amount, false productive, l.precedence, l.created_at, l.id
        FROM invoices_scoped i INNER JOIN item_active l ON ${str('l', 'InvoiceNo')} = i.no
        WHERE ${context.datasets.Invoices.available && context.datasets['Invoice Items'].available}
        UNION ALL
        SELECT 'Collections', '', ${str('r', 'CustomerCode')}, '', ${str('r', 'RouteID')}, ${time(cell('r', 'CollectionDate'))}, COALESCE(${numeric(cell('r', 'Amount'))}, 0), false, r.precedence, r.created_at, r.id FROM collection_active r WHERE ${context.datasets.Collections.available}
        UNION ALL
        SELECT 'Returns', '', ${str('r', 'CustomerCode')}, '', ${str('r', 'RouteID')}, ${time(cell('r', 'ReturnDate'))}, COALESCE(${numeric(cell('r', 'TotalAmount'))}, 0), false, r.precedence, r.created_at, r.id FROM returned_active r WHERE ${context.datasets.Returns.available}
        UNION ALL
        SELECT 'Visits', '', ${str('r', 'CustomerCode')}, '', ${str('r', 'RouteID')}, ${time(cell('r', 'VisitDate'))}, 0, ${str('r', 'VisitStatus')} = 'Productive', r.precedence, r.created_at, r.id FROM visit_active r WHERE ${context.datasets.Visits.available}
      ), scoped AS MATERIALIZED (
        SELECT o.*, ROW_NUMBER() OVER (ORDER BY w.period, o.precedence, o.created_at, o.id) seq, w.period, w.unit, w."from", w."visualizationFrom", w."visualizationUnit", ${history(false)} covered, ${historyRequired ? history(true) : Prisma.sql`TRUE`} rep_match,
          ${product} product_match, COALESCE(NULLIF(p.category, ''), 'unclassified') category,
          COALESCE(NULLIF(p.category, ''), 'Unclassified') category_label,
          ${input.visualization?.groupBy === 'brand' ? Prisma.sql`COALESCE(NULLIF(p.brand, ''), 'unclassified')` : Prisma.sql`COALESCE(NULLIF(o.product, ''), 'unclassified')`} tree_key,
          ${input.visualization?.groupBy === 'brand' ? Prisma.sql`COALESCE(NULLIF(p.brand, ''), 'Unclassified')` : Prisma.sql`COALESCE(NULLIF(p.name, ''), NULLIF(o.product, ''), 'Unclassified')`} tree_label
        FROM customers_scoped c INNER JOIN operations o ON o.customer = c.code
        INNER JOIN periods w ON o.time BETWEEN w."from" AND w."to"
        LEFT JOIN products p ON p.code = o.product WHERE ${scope}
      ), usable AS MATERIALIZED (SELECT * FROM scoped WHERE rep_match AND (kind <> 'sales' OR product_match)),
      totals AS (
        SELECT w.period,
          COALESCE(SUM(o.amount ORDER BY o.precedence, o.created_at, o.id) FILTER (WHERE kind = 'sales'), 0) sales,
          COUNT(DISTINCT invoice) FILTER (WHERE kind = 'sales') orders,
          COUNT(*) FILTER (WHERE kind = 'sales') "salesRows",
          COALESCE(SUM(o.amount ORDER BY o.precedence, o.created_at, o.id) FILTER (WHERE kind = 'Collections'), 0) collections,
          COALESCE(SUM(o.amount ORDER BY o.precedence, o.created_at, o.id) FILTER (WHERE kind = 'Returns'), 0) returns,
          COUNT(*) FILTER (WHERE kind = 'Visits') visits, COUNT(*) FILTER (WHERE kind = 'Visits' AND productive) productive,
          COUNT(DISTINCT customer) FILTER (WHERE kind = 'Visits') visited,
          (SELECT COUNT(*) FROM customers c WHERE ${customerScope} AND ${customerRep}) "inScopeCustomers"
        FROM periods w LEFT JOIN usable o ON o.period = w.period GROUP BY w.period, w."from"
      ), timeline AS (
        SELECT period, b.visualization, CASE WHEN b.unit = 'month' THEN (EXTRACT(YEAR FROM to_timestamp(time/1000) AT TIME ZONE 'UTC') - EXTRACT(YEAR FROM to_timestamp(b.start/1000) AT TIME ZONE 'UTC')) * 12 + EXTRACT(MONTH FROM to_timestamp(time/1000) AT TIME ZONE 'UTC') - EXTRACT(MONTH FROM to_timestamp(b.start/1000) AT TIME ZONE 'UTC') ELSE FLOOR((time - b.start) / CASE WHEN b.unit = 'week' THEN 604800000 ELSE 86400000 END) END position,
          SUM(amount ORDER BY precedence, created_at, id) value FROM usable
        CROSS JOIN LATERAL (VALUES (false, "from", unit), (true, "visualizationFrom", "visualizationUnit")) b(visualization, start, unit)
        WHERE kind = 'sales' GROUP BY 1, 2, 3
      ), categories AS (
        SELECT category key, (ARRAY_AGG(category_label ORDER BY seq))[1] label,
          COALESCE(SUM(amount ORDER BY precedence, created_at, id) FILTER (WHERE period = 0), 0) current,
          COALESCE(SUM(amount ORDER BY precedence, created_at, id) FILTER (WHERE period = 1), 0) previous,
          MIN(seq) first_row
        FROM usable WHERE kind = 'sales' GROUP BY category
      ), category_top AS (SELECT key, label, current, previous, current - previous change FROM categories ORDER BY ABS(current) DESC, first_row LIMIT 40),
      tree AS (SELECT tree_key key, (ARRAY_AGG(tree_label ORDER BY seq))[1] label, SUM(amount ORDER BY precedence, created_at, id) value,
        MIN(seq) first_row FROM usable WHERE kind = 'sales' AND period = 0 GROUP BY tree_key),
      tree_rank AS (SELECT *, ROW_NUMBER() OVER (ORDER BY value DESC, first_row) rank, COUNT(*) OVER () total FROM tree),
      tree_top AS (
        SELECT key, label, value, false "isOther", rank FROM tree_rank WHERE rank <= CASE WHEN total > 20 THEN 19 ELSE 20 END
        UNION ALL SELECT '__other__', '__other__', SUM(value ORDER BY rank), true, 20 FROM tree_rank WHERE total > 20 AND rank >= 20 HAVING COUNT(*) > 0
      ), geo_rows AS (${selectedType === 'customer-density' ? Prisma.sql`
        SELECT c.code customer, 1::float8 amount, c.route, c.first_row precedence, '2000-01-01'::timestamptz created_at, c.code id, c.first_row seq
        FROM customers c CROSS JOIN periods w WHERE w.period = 0 AND ${customerScope} AND ${customerRep}
        ${f.productCodes?.length || f.brandValues?.length || f.categoryValues?.length ? Prisma.sql`AND EXISTS (SELECT 1 FROM usable u WHERE u.kind = 'sales' AND u.period = 0 AND u.customer = c.code)` : Prisma.empty}
      ` : Prisma.sql`SELECT customer, amount, route, precedence, created_at, id, seq FROM usable WHERE period = 0 AND kind = ${geoKind}`}),
      geo_totals AS (SELECT customer, ${geoKind === 'Visits' ? Prisma.sql`COUNT(*)::float8` : Prisma.sql`SUM(amount ORDER BY precedence, created_at, id)`} value,
        (ARRAY_AGG(NULLIF(route, '') ORDER BY precedence, created_at, id) FILTER (WHERE route <> ''))[1] route,
        MIN(seq) first_row FROM geo_rows GROUP BY customer),
      geo_valid AS (SELECT g.customer "customerCode", c.name "customerName", COALESCE(g.route, NULLIF(c.route, '')) "routeId", c.lat latitude, c.lon longitude, g.value, g.first_row,
        COALESCE(c.lat BETWEEN -90 AND 90 AND c.lon BETWEEN -180 AND 180, false) valid FROM geo_totals g JOIN customers c ON c.code = g.customer),
      geo_top AS (SELECT "customerCode", "customerName", "routeId", latitude, longitude, value FROM geo_valid WHERE valid ORDER BY value DESC, first_row LIMIT 750)
      SELECT jsonb_build_object(
        'missingHistory', ${needsHistory} AND EXISTS (SELECT 1 FROM scoped WHERE NOT covered),
        'periods', (SELECT jsonb_agg(to_jsonb(t) - 'period' ORDER BY period) FROM totals t),
        'timeline', COALESCE((SELECT jsonb_agg(to_jsonb(t) - 'visualization' ORDER BY period, position) FROM timeline t WHERE NOT visualization), '[]'),
        'visualizationTimeline', COALESCE((SELECT jsonb_agg(to_jsonb(t) - 'visualization' ORDER BY period, position) FROM timeline t WHERE visualization), '[]'),
        'categories', COALESCE((SELECT jsonb_agg(t) FROM category_top t), '[]'),
        'treemap', COALESCE((SELECT jsonb_agg(to_jsonb(t) - 'rank' ORDER BY rank) FROM tree_top t), '[]'),
        'geo', jsonb_build_object('points', COALESCE((SELECT jsonb_agg(t) FROM geo_top t), '[]'), 'totalRows', (SELECT COUNT(*) FROM geo_rows), 'mappedRows', (SELECT COUNT(*) FROM geo_top), 'unmappedRows', (SELECT COUNT(*) FROM geo_valid WHERE NOT valid))
      ) result
    `);
    return rows[0]!.result;
  }
}
