import { Injectable } from "@nestjs/common";
import { productCategory } from "../../common/queries/product-category";
import { Prisma } from "@field-sales-os/database";
import type { WmsCoverageRow } from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma";
import { activeEntityRowsCte } from "./scalable-query.service";
import { RieExecutionCoordinatorService } from "./rie-execution-coordinator.service";
import { CanonicalHierarchyResolverService } from "./canonical-hierarchy-resolver.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";

// Invalid source values stay NULL; never coerce unknown UOM/quantity into zero demand.
const number = (v: Prisma.Sql) => Prisma.sql`CASE WHEN (${v}) ~ '^[0-9]+([.][0-9]+)?$' THEN (${v})::numeric END`;
const date = (v: Prisma.Sql) => Prisma.sql`CASE WHEN (${v}) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND pg_input_is_valid(${v},'date') THEN (${v})::date END`;

@Injectable()
export class RieWmsCoverageQueryService {
  constructor(private readonly prisma: PrismaService, private readonly hierarchy: CanonicalHierarchyResolverService,
    private readonly coordinator: RieExecutionCoordinatorService) {}

  async query(company: string, warehouse: string, user: AuthenticatedUser, to: string, page: number, search: string, procurement: boolean) {
    const allowed = await this.hierarchy.resolveAllowedRouteIds(company,user);
    return this.coordinator.executePrepared("wms.coverage.sql", () => {
      const route = (alias: string) => allowed === null ? Prisma.sql`TRUE` : allowed.size
        ? Prisma.sql`lower(btrim(${Prisma.raw(alias)}.data->>'RouteID')) IN (${Prisma.join([...allowed])})` : Prisma.sql`FALSE`;
      const invoice = activeEntityRowsCte(company,"Invoices","invoice",[
        route("invoice_source"), Prisma.sql`invoice_source.data->>'InvoiceStatus' IN ('Confirmed','Posted')`,
        Prisma.sql`invoice_source.data->>'InvoiceType' IN ('Sale','Van Sale','Pre-Sale')`,
        Prisma.sql`${date(Prisma.sql`invoice_source.data->>'InvoiceDate'`)} BETWEEN ${to}::date-29 AND ${to}::date`,
      ],[],[],false,[],Prisma.sql`invoice_source.data->>'InvoiceNo' AS invoice, invoice_source.data->>'RouteID' AS route,
        ${date(Prisma.sql`invoice_source.data->>'InvoiceDate'`)} AS day`);
      const items = activeEntityRowsCte(company,"Invoice Items","item",[route("item_source"),
        Prisma.sql`item_source.data->>'InvoiceNo' IN (SELECT invoice FROM invoice_active)`,
        Prisma.sql`item_source.data->>'ProductCode' IN (SELECT source_code FROM products)`],[],[],false,[],Prisma.sql`
        item_source.data->>'InvoiceNo' AS invoice,item_source.data->>'RouteID' AS route,item_source.data->>'ProductCode' AS code,
        item_source.data->>'InvoiceDate' AS source_day,
        lower(btrim(item_source.data->>'Unit')) AS unit,${number(Prisma.sql`item_source.data->>'Quantity'`)} AS quantity,
        ${number(Prisma.sql`COALESCE(NULLIF(item_source.data->>'FreeQuantity',''),'0')`)} AS free`);
      return Prisma.sql`WITH products AS MATERIALIZED (
        SELECT p.id,p.code,p.name,p.base_unit,p.pieces_per_carton,l.source_code,
          ${number(Prisma.sql`l.source_uom->>'CartonQty'`)} AS carton,
          ${number(Prisma.sql`l.source_uom->>'PackQty'`)} AS pack,
          ${number(Prisma.sql`l.source_uom->>'PieceQty'`)} AS piece
        FROM wms_products p LEFT JOIN erp_product_links l ON l.company_id=${company} AND l.product_id=p.id
        WHERE p.company_id=${company} AND p.is_active
          AND (position(lower(${search}) in lower(p.code))>0 OR position(lower(${search}) in lower(p.name))>0)
      ), ${invoice}, ${items}, converted AS (
        SELECT p.id,i.day,t.quantity,t.free,
          CASE WHEN t.source_day IS NOT NULL AND t.source_day<>to_char(i.day,'YYYY-MM-DD') THEN NULL
          WHEN p.base_unit='PIECE' AND p.carton=p.pieces_per_carton AND p.piece=1 THEN
            CASE t.unit WHEN 'piece' THEN p.piece WHEN 'pack' THEN NULLIF(p.pack,0) WHEN 'carton' THEN NULLIF(p.carton,0) END
          WHEN p.base_unit='CARTON' AND p.carton>0 AND p.piece=1 THEN
            CASE t.unit WHEN 'piece' THEN 1/p.carton WHEN 'pack' THEN NULLIF(p.pack,0)/p.carton WHEN 'carton' THEN 1::numeric END
          END AS factor
        FROM item_active t JOIN invoice_active i ON i.invoice=t.invoice AND i.route=t.route
        JOIN products p ON p.source_code=t.code
      ), demand AS (
        SELECT id,count(DISTINCT day) FILTER(WHERE quantity>0)::int AS days,min(day) AS first,max(day) AS last,
          bool_or(factor IS NULL OR quantity IS NULL OR quantity<=0 OR free IS NULL) AS invalid,
          sum((quantity+free)*factor)/30 AS daily
        FROM converted GROUP BY id
      ), stock AS (
        SELECT s.product_id,sum(s.available) AS available,sum(s.reserved) AS reserved,sum(s.quarantined) AS quarantined
        FROM wms_inventory_state s WHERE s.company_id=${company} AND s.warehouse_id=${warehouse}
          AND s.product_id IN (SELECT id FROM products) GROUP BY s.product_id
      ), evidence AS (
        SELECT p.id,p.code,p.name,p.base_unit,p.pieces_per_carton,COALESCE(s.available,0) AS available,COALESCE(s.reserved,0) AS reserved,
          COALESCE(s.quarantined,0) AS quarantined,COALESCE(d.days,0) AS days,d.first,d.last,COALESCE(d.invalid,false) AS invalid,
          CASE WHEN NOT d.invalid AND d.days>=3 AND d.first<=${to}::date-13 AND d.last>=${to}::date-6 AND d.daily>0 THEN d.daily END AS daily
        FROM products p LEFT JOIN stock s ON s.product_id=p.id LEFT JOIN demand d ON d.id=p.id
      ), scored AS (
        SELECT e.*,available/NULLIF(daily,0) AS cover,
          CASE WHEN daily IS NULL THEN 'UNKNOWN' WHEN available/daily<=7 THEN 'CRITICAL'
            WHEN available/daily<=30 THEN 'WATCH' ELSE 'SAFE' END AS risk
        FROM evidence e
      ), result_page AS (
        SELECT * FROM scored ORDER BY CASE risk WHEN 'CRITICAL' THEN 0 WHEN 'WATCH' THEN 1 WHEN 'UNKNOWN' THEN 2 ELSE 3 END,
          cover NULLS LAST,code,id LIMIT 21 OFFSET ${(page-1)*20}
      ) SELECT r.id,r.code,r.name,${productCategory(Prisma.sql`${company}`,Prisma.sql`r.code`)} AS category,r.base_unit AS "baseUnit",r.pieces_per_carton AS "piecesPerCarton",r.available::text,r.reserved::text,r.quarantined::text,
        round(r.daily,6)::text AS "dailyDemand",round(r.cover,2)::text AS "daysOfCover",r.days AS "demandDays",
        to_char(r.first,'YYYY-MM-DD') AS "firstSale",to_char(r.last,'YYYY-MM-DD') AS "lastSale",r.risk,
        CASE WHEN r.invalid THEN 'UOM' WHEN r.daily IS NULL THEN 'HISTORY' WHEN r.risk='CRITICAL' THEN 'LOW'
          WHEN r.risk='WATCH' THEN 'MONITOR' ELSE 'SUFFICIENT' END AS reason,NULL::int AS "leadTimeDays",
        ${procurement ? Prisma.sql`(SELECT d.reference FROM procurement_documents d JOIN procurement_progress p
          ON p.company_id=d.company_id AND p.request_id=d.id AND p.product_id=r.id AND p.remaining>0
          WHERE d.company_id=${company} AND d.warehouse_id=${warehouse} AND d.document_status IN ('OPEN','PARTIAL')
            AND EXISTS(SELECT 1 FROM company_operating_settings o WHERE o.company_id=${company} AND o.operating_mode='FULL_ERP')
          ORDER BY d.created_at,d.id LIMIT 1)` : Prisma.sql`NULL::text`} AS "purchaseReference"
        FROM result_page r ORDER BY CASE risk WHEN 'CRITICAL' THEN 0 WHEN 'WATCH' THEN 1 WHEN 'UNKNOWN' THEN 2 ELSE 3 END,
          cover NULLS LAST,code,id`;
    }, statement => this.prisma.$queryRaw<WmsCoverageRow[]>(statement));
  }
}
