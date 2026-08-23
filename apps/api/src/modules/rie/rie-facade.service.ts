import { Inject, Injectable, Logger } from "@nestjs/common";
import { GraphBuilderService } from "./graph-builder.service";
import { NavigationEngineService } from "./navigation-engine.service";
import { QueryExecutionEngineService } from "./query-execution-engine.service";
import { BusinessRulesEngineService } from "./business-rules-engine.service";
import type { RelationshipGraph, GraphNode, GraphEdge } from "./graph.types";
import type { NavigationRequest, NavigationResult } from "./navigation.types";
import type { ExecutionPlan } from "./query-execution.types";
import type { BusinessRuleFn } from "./business-rules.types";
import type { RelationshipDefinition } from "./relationship-registry.types";
import type { RieQueryOptions, RieQueryResult } from "./rie-facade.types";
import { ENTITY_PROVIDER, type EntityFieldFilter, type EntityProvider, type EntityQueryContext, type EntityQueryOptions, type EntityQueryResult } from "./entity-provider.interface";
import { Prisma } from "@field-sales-os/database";
import { PrismaService } from "../../common/prisma";
import { FilesService } from "../files/files.service";
import { CanonicalHierarchyResolverService } from "./canonical-hierarchy-resolver.service";
import { ENTITY_DATASET_TYPE_MAP } from "./excel-entity-provider.mapping";
import { RieScalableQueryService } from "./scalable-query.service";
import type { RieScalableEntityRead, RieScalableQuery, RieScalableQueryResult } from "./scalable-query.types";

/**
 * The smallest sales grain used by analytics: an invoice line, or the same
 * line collapsed by invoice/product when `aggregate` is requested.
 */
export interface RieInvoiceSalesRow {
  invoiceNo: string;
  lineNo: number;
  time: number | null;
  customerCode: string;
  productCode: string;
  amount: number;
}

/** Fact and large-dimension entities must enter RIE through a bounded scope. */
export type RieHighCardinalityEntity = "Invoices" | "Invoice Items" | "Visits" | "Collections" | "Returns" | "Customers" | "Van Inventory";

export interface RieScopedEntityQuery extends EntityQueryContext {
  entityName: RieHighCardinalityEntity;
  /** At least one server-side predicate, or a bounded limit, is required. */
  filters?: readonly EntityFieldFilter[];
  limit?: number;
}

/**
 * RIE Integration Layer (RieFacade) — fifth and final operational
 * component of the initial Relationship Intelligence Engine build.
 *
 * This is the ONE service every future FSOS Engine (Customer 360, Route
 * Intelligence, Demand Intelligence, SGI, Sales Team 360, Murshidak,
 * Executive Studio, ...) is meant to inject. It does not introduce any new
 * logic of its own — it composes Graph Builder, Navigation Engine, Query
 * Execution Engine, and Business Rules Engine behind one clean, stable
 * surface, so consuming Engines never need to know that four separate
 * internal components exist, and so RIE's internal wiring can change
 * later without breaking every consumer.
 *
 * Still no controller (RIE Golden Rule, Constitution Phase 10): this
 * facade is injected via NestJS DI by other backend modules, never called
 * directly over HTTP.
 */
@Injectable()
export class RieFacade {
  private readonly logger = new Logger(RieFacade.name);

  constructor(
    private readonly graphBuilder: GraphBuilderService,
    private readonly navigationEngine: NavigationEngineService,
    private readonly queryExecutionEngine: QueryExecutionEngineService,
    private readonly businessRulesEngine: BusinessRulesEngineService,
    @Inject(ENTITY_PROVIDER) private readonly entityProvider: EntityProvider,
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
    private readonly hierarchyResolver: CanonicalHierarchyResolverService,
    private readonly scalableQuery: RieScalableQueryService,
  ) {}

  // ------------------------------------------------------------------
  // Graph introspection (delegates to Graph Builder's own read-only API).
  // ------------------------------------------------------------------

  getGraph(): RelationshipGraph {
    return this.graphBuilder.buildGraph();
  }

  getEntity(entityName: string): GraphNode | undefined {
    return this.graphBuilder.getEntity(entityName);
  }

  getRelationship(relationshipId: string): GraphEdge | undefined {
    return this.graphBuilder.getRelationship(relationshipId);
  }

  getNeighbors(entityName: string): readonly GraphEdge[] {
    return this.graphBuilder.getNeighbors(entityName);
  }

  getRelationshipsByType(type: RelationshipDefinition["relationshipType"]): readonly GraphEdge[] {
    return this.graphBuilder.getRelationshipsByType(type);
  }

  getRelationshipsByDomain(domain: RelationshipDefinition["domain"]): readonly GraphEdge[] {
    return this.graphBuilder.getRelationshipsByDomain(domain);
  }

  getRelationshipsByNavigationType(
    navigationType: RelationshipDefinition["navigation"]["allowedNavigationTypes"][number],
  ): readonly GraphEdge[] {
    return this.graphBuilder.getRelationshipsByNavigationType(navigationType);
  }

  // ------------------------------------------------------------------
  // Single-relationship navigation (delegates to Navigation Engine — for
  // consumers that already know exactly which relationship they need).
  // ------------------------------------------------------------------

  navigate(request: NavigationRequest): Promise<NavigationResult> {
    return this.navigationEngine.navigate(request);
  }

  // ------------------------------------------------------------------
  // Full query execution (Query Execution Engine + Business Rules Engine
  // composed) — the primary entry point for consuming Engines that already
  // have (or can build) an Execution Plan, e.g. from a future Query
  // Planner implementation or a hand-built plan for a known screen.
  // ------------------------------------------------------------------

  async executeQuery(plan: ExecutionPlan, options: RieQueryOptions = {}): Promise<RieQueryResult> {
    const executionResult = await this.queryExecutionEngine.execute(plan);
    const businessRulesResult = this.businessRulesEngine.apply(executionResult, options.businessRuleContext ?? {});

    if (!executionResult.success) {
      this.logger.warn(`Execution Plan "${plan.planId}" completed with success=false (${executionResult.errors.length} error(s)).`);
    }

    return {
      success: executionResult.success,
      finalEntity: executionResult.finalEntity,
      records: businessRulesResult.records,
      annotations: businessRulesResult.annotations,
      warnings: executionResult.warnings,
      errors: executionResult.errors,
      executionResult,
    };
  }

  // ------------------------------------------------------------------
  // Raw entity read (delegates to the injected EntityProvider) — for
  // consumers that just need a full/filtered set of one Canonical Entity's
  // records and don't need Navigation/Query Execution's multi-hop or
  // planning machinery (e.g. a Migration-phase screen doing its own simple
  // in-memory join across 2-3 entities, like GeoIntelligenceService's
  // RIE-backed Customer Comparison). Still storage-agnostic: this passes
  // straight through to whatever ENTITY_PROVIDER is bound (Excel today,
  // Prisma later) — callers never know which.
  // ------------------------------------------------------------------

  getEntityRecords(entityName: string, options: EntityQueryOptions): Promise<EntityQueryResult> {
    return this.entityProvider.getRecords(entityName, options);
  }

  /**
   * Guarded read for high-cardinality entities. This is additive: legacy
   * getEntityRecords callers retain their current behavior until migrated.
   */
  getScopedEntityRecords(query: RieScopedEntityQuery): Promise<EntityQueryResult> {
    if (!query.companyId?.trim()) throw new Error("RIE scoped query requires companyId.");
    if ((!query.filters || query.filters.length === 0) && (!query.limit || query.limit < 1)) {
      throw new Error(`RIE scoped query for ${query.entityName} requires filters or a positive limit.`);
    }
    return this.entityProvider.getRecords(query.entityName, {
      companyId: query.companyId,
      requestingUser: query.requestingUser,
      filters: query.filters,
      limit: query.limit,
    });
  }

  /** Bounded PostgreSQL query surface for high-cardinality canonical data. */
  queryCanonicalRecords(query: RieScalableQuery): Promise<RieScalableQueryResult> {
    return this.scalableQuery.query(query);
  }

  readCanonicalEntity(query: RieScalableEntityRead): Promise<EntityQueryResult> {
    return this.scalableQuery.readEntity(query);
  }

  /**
   * Shared PostgreSQL sales read for analytical engines.  Keeping the
   * high-cardinality Invoices -> Invoice Items join and its aggregation here
   * prevents each consumer from materializing both canonical entities in
   * Node merely to join/filter them again.
   */
  async getInvoiceSalesRows(
    context: EntityQueryContext,
    options: { fromTime?: number; toTime?: number; aggregate?: boolean } = {},
  ): Promise<RieInvoiceSalesRow[]> {
    const companyId = context.companyId;
    const files = await this.filesService.listConfirmedActiveForCompany(companyId);
    const invoiceFiles = files.filter((file) => file.datasetType === ENTITY_DATASET_TYPE_MAP.Invoices!.datasetType);
    const itemFiles = files.filter((file) => file.datasetType === ENTITY_DATASET_TYPE_MAP["Invoice Items"]!.datasetType);
    if (invoiceFiles.length === 0 || itemFiles.length === 0) return [];
    const activeVersions = await this.prisma.rieDatasetVersion.findMany({
      where: { companyId, entityName: { in: ["Invoices", "Invoice Items"] }, isActive: true, sourceFileId: { in: [...invoiceFiles, ...itemFiles].map((file) => file.id) } },
      select: { entityName: true, sourceFileId: true },
    });
    const versionKey = new Set(activeVersions.map((version) => `${version.entityName}:${version.sourceFileId}`));
    if (invoiceFiles.some((file) => !versionKey.has(`Invoices:${file.id}`)) || itemFiles.some((file) => !versionKey.has(`Invoice Items:${file.id}`))) return [];

    const allowedRoutes = context.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(companyId, context.requestingUser)
      : null;
    const invoiceFileValues = invoiceFiles.map((file, precedence) => Prisma.sql`(${file.id}, ${precedence})`);
    const itemFileValues = itemFiles.map((file, precedence) => Prisma.sql`(${file.id}, ${precedence})`);
    const routeFilter = (alias: string) => !allowedRoutes
      ? Prisma.empty
      : allowedRoutes.size === 0
        ? Prisma.sql`AND FALSE`
        : Prisma.sql`AND LOWER(BTRIM(COALESCE(${Prisma.raw(alias)}."data" ->> 'RouteID', ''))) IN (${Prisma.join([...allowedRoutes])})`;
    const invoiceTime = Prisma.sql`CASE WHEN inv."data" ->> 'InvoiceDate' ~ '^\\d{4}-\\d{2}-\\d{2}' THEN EXTRACT(EPOCH FROM (inv."data" ->> 'InvoiceDate')::timestamptz) * 1000 ELSE NULL END`;
    const dates: Prisma.Sql[] = [];
    if (options.fromTime !== undefined) dates.push(Prisma.sql`${invoiceTime} >= ${options.fromTime}`);
    if (options.toTime !== undefined) dates.push(Prisma.sql`${invoiceTime} <= ${options.toTime}`);
    const lineNo = options.aggregate
      ? Prisma.sql`0`
      : Prisma.sql`COALESCE(NULLIF(BTRIM(item."data" ->> 'LineNo'), '')::double precision, 0)`;
    const groupBy = options.aggregate ? Prisma.sql`1, 3, 4, 5` : Prisma.sql`1, 2, 3, 4, 5`;
    const rows = await this.prisma.$queryRaw<Array<{ invoiceNo: string; lineNo: number; time: Date | null; customerCode: string; productCode: string; amount: number }>>(Prisma.sql`
      WITH selected_invoice_files("source_file_id", precedence) AS (VALUES ${Prisma.join(invoiceFileValues)}),
      invoice_rows AS (
        SELECT r."data", selected_invoice_files.precedence
        FROM "rie_entity_rows" r
        JOIN "rie_dataset_versions" v ON v.id = r."dataset_version_id"
        JOIN selected_invoice_files ON selected_invoice_files."source_file_id" = v."source_file_id"
        WHERE v."company_id" = ${companyId} AND v."entity_name" = 'Invoices' AND v."is_active" = TRUE
      ), invoices AS (
        SELECT "data" FROM (SELECT invoice_rows.*, MIN(precedence) OVER (PARTITION BY LOWER(BTRIM(COALESCE("data" ->> 'InvoiceNo', '')))) AS newest FROM invoice_rows) dedup
        WHERE BTRIM(COALESCE("data" ->> 'InvoiceNo', '')) = '' OR precedence = newest
      ), selected_item_files("source_file_id", precedence) AS (VALUES ${Prisma.join(itemFileValues)}),
      item_rows AS (
        SELECT r."data", selected_item_files.precedence
        FROM "rie_entity_rows" r
        JOIN "rie_dataset_versions" v ON v.id = r."dataset_version_id"
        JOIN selected_item_files ON selected_item_files."source_file_id" = v."source_file_id"
        WHERE v."company_id" = ${companyId} AND v."entity_name" = 'Invoice Items' AND v."is_active" = TRUE
      ), items AS (
        SELECT "data" FROM (SELECT item_rows.*, MIN(precedence) OVER (PARTITION BY LOWER(BTRIM(COALESCE("data" ->> 'InvoiceNo', ''))), LOWER(BTRIM(COALESCE("data" ->> 'LineNo', '')))) AS newest FROM item_rows) dedup
        WHERE BTRIM(COALESCE("data" ->> 'InvoiceNo', '')) = '' OR BTRIM(COALESCE("data" ->> 'LineNo', '')) = '' OR precedence = newest
      )
      SELECT BTRIM(inv."data" ->> 'InvoiceNo') AS "invoiceNo", ${lineNo} AS "lineNo",
             (inv."data" ->> 'InvoiceDate')::timestamptz AS "time", BTRIM(inv."data" ->> 'CustomerCode') AS "customerCode", BTRIM(item."data" ->> 'ProductCode') AS "productCode",
             SUM(COALESCE(NULLIF(REPLACE(BTRIM(item."data" ->> 'LineTotal'), ',', ''), '')::double precision, 0)) AS "amount"
      FROM invoices inv JOIN items item ON BTRIM(item."data" ->> 'InvoiceNo') = BTRIM(inv."data" ->> 'InvoiceNo')
      WHERE BTRIM(inv."data" ->> 'InvoiceNo') <> '' AND BTRIM(inv."data" ->> 'CustomerCode') <> ''
        ${routeFilter("inv")} ${routeFilter("item")}
        ${dates.length ? Prisma.sql`AND ${Prisma.join(dates, ' AND ')}` : Prisma.empty}
      GROUP BY ${groupBy}
    `);
    return rows.map((row) => ({ ...row, lineNo: Number(row.lineNo), time: row.time ? row.time.getTime() : null, amount: Number(row.amount) }));
  }

  async hasInvoiceSalesSources(context: EntityQueryContext): Promise<boolean> {
    const files = await this.filesService.listConfirmedActiveForCompany(context.companyId);
    const invoiceFiles = files.filter((file) => file.datasetType === ENTITY_DATASET_TYPE_MAP.Invoices!.datasetType);
    const itemFiles = files.filter((file) => file.datasetType === ENTITY_DATASET_TYPE_MAP["Invoice Items"]!.datasetType);
    if (invoiceFiles.length === 0 || itemFiles.length === 0) return false;
    const versions = await this.prisma.rieDatasetVersion.findMany({ where: { companyId: context.companyId, entityName: { in: ["Invoices", "Invoice Items"] }, isActive: true, sourceFileId: { in: [...invoiceFiles, ...itemFiles].map((file) => file.id) } }, select: { entityName: true, sourceFileId: true } });
    const active = new Set(versions.map((version) => `${version.entityName}:${version.sourceFileId}`));
    return invoiceFiles.every((file) => active.has(`Invoices:${file.id}`)) && itemFiles.every((file) => active.has(`Invoice Items:${file.id}`));
  }

  /** Metadata-only availability check; never materializes canonical rows. */
  async hasCanonicalEntitySources(context: EntityQueryContext, entityNames: readonly string[]): Promise<boolean> {
    const files = await this.filesService.listConfirmedActiveForCompany(context.companyId);
    const expected = entityNames.flatMap((entityName) => {
      const mapping = ENTITY_DATASET_TYPE_MAP[entityName];
      return mapping?.datasetType ? [{ entityName, datasetType: mapping.datasetType }] : [];
    });
    if (expected.length !== entityNames.length) return false;
    const fileIds = files.filter((file) => expected.some((item) => item.datasetType === file.datasetType)).map((file) => file.id);
    if (!fileIds.length) return false;
    const versions = await this.prisma.rieDatasetVersion.findMany({ where: { companyId: context.companyId, entityName: { in: [...entityNames] }, isActive: true, sourceFileId: { in: fileIds } }, select: { entityName: true, sourceFileId: true } });
    const active = new Set(versions.map((version) => `${version.entityName}:${version.sourceFileId}`));
    return expected.every(({ entityName, datasetType }) => {
      const entityFiles = files.filter((file) => file.datasetType === datasetType);
      return entityFiles.length > 0 && entityFiles.every((file) => active.has(`${entityName}:${file.id}`));
    });
  }

  // ------------------------------------------------------------------
  // Business rule extensibility passthrough.
  // ------------------------------------------------------------------

  registerBusinessRule(name: string, fn: BusinessRuleFn): void {
    this.businessRulesEngine.registerRule(name, fn);
  }

  listRegisteredBusinessRules(): readonly string[] {
    return this.businessRulesEngine.listRegisteredRules();
  }
}
