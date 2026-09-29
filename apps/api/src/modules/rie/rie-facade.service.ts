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
import { ENTITY_PROVIDER, type EntityFieldFilter, type EntityProvider, type EntityQueryContext, type EntityQueryOptions, type EntityQueryResult, type EntityRecord } from "./entity-provider.interface";
import { Prisma } from "@field-sales-os/database";
import { PrismaService } from "../../common/prisma";
import { FilesService } from "../files/files.service";
import { CanonicalHierarchyResolverService } from "./canonical-hierarchy-resolver.service";
import { ENTITY_DATASET_TYPE_MAP } from "./excel-entity-provider.mapping";
import { RieScalableQueryService } from "./scalable-query.service";
import { RieFsos360QueryService } from "./fsos-360-query.service";
import type { Fsos360Query } from "@field-sales-os/schemas";
import type { Fsos360ResolvedContext } from "../decision-analytics-studio/fsos-360-context.service";
import type { RieAssistantCustomerMentionQuery, RieAssistantDatasetQuery, RieAssistantDatasetResult, RieGeoEngineMapQuery, RieGeoEngineMapResult, RieGeoEngineTableQuery, RieGeoEngineTableResult, RieLocalDecisionCollectionsQuery, RieLocalDecisionCollectionsScope, RieLocalDecisionCollectionsSummary, RieManagementActiveVehicleRouteRow, RieManagementActiveVehicleRoutesQuery, RieManagementLoadingRiskQuery, RieManagementLoadingRiskRow, RieManagementLostOpportunitiesQuery, RieManagementLostOpportunitiesResult, RieManagementSmartLoadingBundle, RieManagementSmartLoadingBundleQuery, RieManagementStockAlignmentQuery, RieManagementStockAlignmentRow, RieManagementVehicleProductsQuery, RieManagementVehicleProductRow, RieProductFitData, RieProductFitQuery, RieRouteProductStalenessQuery, RieRouteProductStalenessRow, RieScalableEntityRead, RieScalableQuery, RieScalableQueryResult, RieSmartLoadingNetQuantityQuery, RieSmartLoadingNetQuantityRow, RieStalePurchaseRow, RieStalePurchasesQuery, RieVisitCopilotBriefingEntity, RieVisitCopilotCustomerBriefingFacts, RieVisitCopilotCustomerBriefingQuery } from "./scalable-query.types";
import { fingerprintRieQueryShape, observeRieLogicalOperation, observeRiePostgres, recordActiveVersionResolution, scopeMetadata } from "../../common/observability/rie-observability";
import { RieRequestPlannerService, type RieRequestPlanOptions } from "./rie-request-planner.service";
import { RieExecutionCoordinatorService } from "./rie-execution-coordinator.service";

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

export interface RieLocalDecisionTotalSalesResult {
  available: boolean;
  total: number;
}

export interface RieLocalDecisionCollectionsResult extends RieLocalDecisionCollectionsSummary {
  available: boolean;
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
    private readonly fsos360Query?: RieFsos360QueryService,
    private readonly requestPlanner?: RieRequestPlannerService,
    private readonly executionCoordinator: RieExecutionCoordinatorService = new RieExecutionCoordinatorService(),
  ) {}

  /**
   * Opt-in request planning for a migrated feature. Legacy consumers retain
   * their existing path until they are deliberately moved behind this method.
   */
  runPlannedRequest<T>(options: RieRequestPlanOptions, execute: () => Promise<T>): Promise<T> {
    return this.requestPlanner ? this.requestPlanner.runPlan(options, execute) : execute();
  }

  private plannedOperation<T>(operation: string, execute: () => Promise<T>): Promise<T> {
    return this.requestPlanner ? this.requestPlanner.execute(operation, execute) : execute();
  }

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
    return observeRieLogicalOperation("navigate", undefined, () => this.navigationEngine.navigate(request));
  }

  // ------------------------------------------------------------------
  // Full query execution (Query Execution Engine + Business Rules Engine
  // composed) — the primary entry point for consuming Engines that already
  // have (or can build) an Execution Plan, e.g. from a future Query
  // Planner implementation or a hand-built plan for a known screen.
  // ------------------------------------------------------------------

  async executeQuery(plan: ExecutionPlan, options: RieQueryOptions = {}): Promise<RieQueryResult> {
    return observeRieLogicalOperation("executeQuery", undefined, async () => {
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
    });
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
    return observeRieLogicalOperation("getEntityRecords", scopeMetadata(options), () => this.entityProvider.getRecords(entityName, options));
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
    return observeRieLogicalOperation("getScopedEntityRecords", scopeMetadata(query), () => this.entityProvider.getRecords(query.entityName, {
      companyId: query.companyId,
      requestingUser: query.requestingUser,
      filters: query.filters,
      limit: query.limit,
    }));
  }

  /** Bounded PostgreSQL query surface for high-cardinality canonical data. */
  queryCanonicalRecords(query: RieScalableQuery): Promise<RieScalableQueryResult> {
    return observeRieLogicalOperation("queryCanonicalRecords", scopeMetadata(query), () => this.plannedOperation("queryCanonicalRecords", () => this.scalableQuery.query(query)));
  }

  /** Compact PostgreSQL-first surface for Assistant's safe query_dataset subset. */
  queryAssistantDataset(query: RieAssistantDatasetQuery): Promise<RieAssistantDatasetResult> {
    return observeRieLogicalOperation("queryAssistantDataset", scopeMetadata(query), () => this.plannedOperation("queryAssistantDataset", () => this.scalableQuery.queryAssistantDataset(query)));
  }

  queryAssistantCustomerMentionCandidates(query: RieAssistantCustomerMentionQuery): Promise<EntityRecord[]> {
    return observeRieLogicalOperation("queryAssistantCustomerMentionCandidates", scopeMetadata(query), () => this.plannedOperation("queryAssistantCustomerMentionCandidates", () => this.scalableQuery.queryAssistantCustomerMentionCandidates(query)));
  }

  queryGeoEngineMap(query: Omit<RieGeoEngineMapQuery, "invoicesAvailable">): Promise<RieGeoEngineMapResult> {
    return observeRieLogicalOperation("queryGeoEngineMap", scopeMetadata(query), () => this.plannedOperation("queryGeoEngineMap", async () => {
      const invoicesAvailable = await this.hasInvoiceSalesSourcesUnobserved(query);
      return this.scalableQuery.queryGeoEngineMap({ ...query, invoicesAvailable });
    }));
  }

  queryGeoEngineTable(query: Omit<RieGeoEngineTableQuery, "invoicesAvailable">): Promise<RieGeoEngineTableResult> {
    return observeRieLogicalOperation("queryGeoEngineTable", scopeMetadata(query), () => this.plannedOperation("queryGeoEngineTable", async () => {
      const invoicesAvailable = await this.hasInvoiceSalesSourcesUnobserved(query);
      return this.scalableQuery.queryGeoEngineTable({ ...query, invoicesAvailable });
    }));
  }

  queryVisitCopilotCustomerBriefingFacts(query: RieVisitCopilotCustomerBriefingQuery): Promise<RieVisitCopilotCustomerBriefingFacts> {
    return observeRieLogicalOperation("queryVisitCopilotCustomerBriefingFacts", scopeMetadata(query), () => this.plannedOperation("queryVisitCopilotCustomerBriefingFacts", async () => {
      const entities: readonly RieVisitCopilotBriefingEntity[] = ["Customers", "Invoices", "Invoice Items", "Returns", "Collections", "Products", "Van Inventory"];
      const availability = await this.canonicalEntityAvailability(query.companyId, entities);
      return this.scalableQuery.queryVisitCopilotCustomerBriefingFacts(query, availability);
    }));
  }

  /** Request-scoped active-version metadata for callers issuing related RIE queries. */
  getActiveVersionCounts(companyId: string, entityNames: readonly string[]): Promise<Map<string, number>> {
    return observeRieLogicalOperation("getActiveVersionCounts", { companyId }, () => this.plannedOperation("getActiveVersionCounts", () => this.scalableQuery.getActiveVersionCounts(companyId, entityNames)));
  }

  /**
   * Local Decision's compact Total Sales contract.  Availability is checked
   * without materializing facts; PostgreSQL then applies both sides of the
   * legacy hierarchy scope, the inclusive invoice-date range, the canonical
   * Invoice Items -> Invoices relationship, and SUM(LineTotal).
   */
  async queryLocalDecisionTotalSales(
    context: EntityQueryContext,
    range: { start: string; end: string },
  ): Promise<RieLocalDecisionTotalSalesResult> {
    if (!await this.hasCanonicalEntitySources(context, ["Invoices", "Invoice Items"])) {
      return { available: false, total: 0 };
    }

    const total = await this.scalableQuery.queryLocalDecisionTotalSales({ ...context, ...range });
    return { available: true, total };
  }

  async queryLocalDecisionCollections(
    context: EntityQueryContext,
    scope: RieLocalDecisionCollectionsScope,
  ): Promise<RieLocalDecisionCollectionsResult> {
    if (!await this.hasCanonicalEntitySources(context, ["Collections"])) {
      return { available: false, total: 0, pendingTotal: 0, bouncedTotal: 0, collectedTotal: 0, customerCount: 0, oldestDueDate: null };
    }
    const summary = await this.scalableQuery.queryLocalDecisionCollections({ ...context, ...scope } as RieLocalDecisionCollectionsQuery);
    return { available: true, ...summary };
  }

  queryRouteProductStaleness(query: RieRouteProductStalenessQuery): Promise<RieRouteProductStalenessRow[]> {
    return observeRieLogicalOperation("queryRouteProductStaleness", scopeMetadata(query), () => this.plannedOperation("queryRouteProductStaleness", () => this.scalableQuery.queryRouteProductStaleness(query)));
  }

  async queryProductFitData(query: RieProductFitQuery): Promise<RieProductFitData> {
    return observeRieLogicalOperation("queryProductFitData", scopeMetadata(query), () => this.plannedOperation("queryProductFitData", async () => {
      const entityNames: readonly RieVisitCopilotBriefingEntity[] = ["Customers", "Invoices", "Invoice Items", "Products"];
      let availability: Record<RieVisitCopilotBriefingEntity, boolean>;
      try {
        availability = await this.canonicalEntityAvailability(query.companyId, entityNames);
      } catch {
        // Matches the legacy provider: failure to enumerate active sources is
        // treated as unavailable data, not as partially trusted company data.
        return { peerScope: "NONE", peerSales: [], products: [] };
      }
      return this.scalableQuery.queryProductFitData({
        ...query,
        sourceAvailability: {
          customers: availability.Customers,
          invoices: availability.Invoices,
          invoiceItems: availability["Invoice Items"],
          products: availability.Products,
        },
      });
    }));
  }

  queryManagementStockAlignment(query: RieManagementStockAlignmentQuery): Promise<RieManagementStockAlignmentRow> {
    return observeRieLogicalOperation("queryManagementStockAlignment", scopeMetadata(query), () => this.plannedOperation("queryManagementStockAlignment", () => this.scalableQuery.queryManagementStockAlignment(query)));
  }

  querySmartLoadingNetQuantities(query: RieSmartLoadingNetQuantityQuery): Promise<RieSmartLoadingNetQuantityRow[]> {
    return observeRieLogicalOperation("querySmartLoadingNetQuantities", scopeMetadata(query), () => this.plannedOperation("querySmartLoadingNetQuantities", () => this.scalableQuery.querySmartLoadingNetQuantities(query)));
  }

  queryManagementVehicleProducts(query: RieManagementVehicleProductsQuery): Promise<RieManagementVehicleProductRow[]> {
    return observeRieLogicalOperation("queryManagementVehicleProducts", scopeMetadata(query), () => this.plannedOperation("queryManagementVehicleProducts", () => this.scalableQuery.queryManagementVehicleProducts(query)));
  }

  queryManagementSmartLoadingBundle(query: RieManagementSmartLoadingBundleQuery): Promise<RieManagementSmartLoadingBundle> {
    return observeRieLogicalOperation("queryManagementSmartLoadingBundle", scopeMetadata(query), () => this.plannedOperation("queryManagementSmartLoadingBundle", () => this.scalableQuery.queryManagementSmartLoadingBundle(query)));
  }

  queryManagementActiveVehicleRoutes(query: RieManagementActiveVehicleRoutesQuery): Promise<RieManagementActiveVehicleRouteRow[]> {
    return observeRieLogicalOperation("queryManagementActiveVehicleRoutes", scopeMetadata(query), () => this.plannedOperation("queryManagementActiveVehicleRoutes", () => this.scalableQuery.queryManagementActiveVehicleRoutes(query)));
  }

  queryFsos360Facts(ctx: EntityQueryContext, context: Fsos360ResolvedContext, input: Fsos360Query) {
    if (!this.fsos360Query) throw new Error('FSOS 360 query service is not configured.');
    return observeRieLogicalOperation("queryFsos360Facts", scopeMetadata(ctx), () => this.plannedOperation("queryFsos360Facts", () => this.fsos360Query!.aggregate(ctx, context, input)));
  }

  queryFsos360CustomerContext(...args: Parameters<RieFsos360QueryService['customerContext']>) {
    if (!this.fsos360Query) throw new Error('FSOS 360 query service is not configured.');
    return observeRieLogicalOperation("queryFsos360CustomerContext", scopeMetadata(args[0]), () => this.plannedOperation("queryFsos360CustomerContext", () => this.fsos360Query!.customerContext(...args)));
  }

  queryFsos360CustomerOptions(...args: Parameters<RieFsos360QueryService['customerOptions']>) {
    if (!this.fsos360Query) throw new Error('FSOS 360 query service is not configured.');
    return observeRieLogicalOperation("queryFsos360CustomerOptions", scopeMetadata(args[0]), () => this.plannedOperation("queryFsos360CustomerOptions", () => this.fsos360Query!.customerOptions(...args)));
  }

  queryManagementLoadingRisk(query: RieManagementLoadingRiskQuery): Promise<RieManagementLoadingRiskRow> {
    return observeRieLogicalOperation("queryManagementLoadingRisk", scopeMetadata(query), () => this.plannedOperation("queryManagementLoadingRisk", () => this.scalableQuery.queryManagementLoadingRisk(query)));
  }

  queryManagementLostOpportunities(query: RieManagementLostOpportunitiesQuery): Promise<RieManagementLostOpportunitiesResult> {
    return observeRieLogicalOperation("queryManagementLostOpportunities", scopeMetadata(query), () => this.plannedOperation("queryManagementLostOpportunities", () => this.scalableQuery.queryManagementLostOpportunities(query)));
  }

  queryStalePurchases(query: RieStalePurchasesQuery): Promise<RieStalePurchaseRow[]> {
    return observeRieLogicalOperation("queryStalePurchases", scopeMetadata(query), () => this.plannedOperation("queryStalePurchases", () => this.scalableQuery.queryStalePurchases(query)));
  }

  readCanonicalEntity(query: RieScalableEntityRead): Promise<EntityQueryResult> {
    return observeRieLogicalOperation("readCanonicalEntity", scopeMetadata(query), () => this.plannedOperation("readCanonicalEntity", () => this.scalableQuery.readEntity(query)));
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
    return observeRieLogicalOperation("getInvoiceSalesRows", scopeMetadata(context), () => this.plannedOperation("getInvoiceSalesRows", () => this.getInvoiceSalesRowsUnobserved(context, options)));
  }

  private async getInvoiceSalesRowsUnobserved(
    context: EntityQueryContext,
    options: { fromTime?: number; toTime?: number; aggregate?: boolean },
  ): Promise<RieInvoiceSalesRow[]> {
    const companyId = context.companyId;
    const allowedRoutes = context.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(companyId, context.requestingUser)
      : null;
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
    const statement = Prisma.sql`
      WITH invoices AS MATERIALIZED (
        SELECT inv."data"
        FROM "rie_canonical_entity_rows" inv
        WHERE inv."company_id" = ${companyId} AND inv."entity_name" = 'Invoices'
          AND BTRIM(COALESCE(inv."data" ->> 'InvoiceNo', '')) <> ''
          AND BTRIM(COALESCE(inv."data" ->> 'CustomerCode', '')) <> ''
          ${routeFilter("inv")}
          ${dates.length ? Prisma.sql`AND ${Prisma.join(dates, ' AND ')}` : Prisma.empty}
      ), items AS MATERIALIZED (
        SELECT item."data"
        FROM "rie_canonical_entity_rows" item
        WHERE item."company_id" = ${companyId} AND item."entity_name" = 'Invoice Items'
          ${routeFilter("item")}
      )
      SELECT BTRIM(inv."data" ->> 'InvoiceNo') AS "invoiceNo", ${lineNo} AS "lineNo",
             (inv."data" ->> 'InvoiceDate')::timestamptz AS "time", BTRIM(inv."data" ->> 'CustomerCode') AS "customerCode", BTRIM(item."data" ->> 'ProductCode') AS "productCode",
             SUM(COALESCE(NULLIF(REPLACE(BTRIM(item."data" ->> 'LineTotal'), ',', ''), '')::double precision, 0)) AS "amount"
      FROM invoices inv JOIN items item ON BTRIM(item."data" ->> 'InvoiceNo') = BTRIM(inv."data" ->> 'InvoiceNo')
      WHERE TRUE
      GROUP BY ${groupBy}
    `;
    const rows = await this.executionCoordinator.execute("getInvoiceSalesRows.sql", () => observeRiePostgres("getInvoiceSalesRows.sql", fingerprintRieQueryShape({ kind: "specialized", operation: "getInvoiceSalesRows", aggregate: Boolean(options.aggregate), hasFrom: options.fromTime !== undefined, hasTo: options.toTime !== undefined }), "semaphore", () => this.prisma.$queryRaw<Array<{ invoiceNo: string; lineNo: number; time: Date | null; customerCode: string; productCode: string; amount: number }>>(statement)));
    return rows.map((row) => ({ ...row, lineNo: Number(row.lineNo), time: row.time ? row.time.getTime() : null, amount: Number(row.amount) }));
  }

  async hasInvoiceSalesSources(context: EntityQueryContext): Promise<boolean> {
    return observeRieLogicalOperation("hasInvoiceSalesSources", scopeMetadata(context), () => this.hasInvoiceSalesSourcesUnobserved(context));
  }

  private async hasInvoiceSalesSourcesUnobserved(context: EntityQueryContext): Promise<boolean> {
    const files = await this.postgres("hasInvoiceSalesSources.files", () => this.filesService.listConfirmedActiveForCompany(context.companyId));
    const invoiceFiles = files.filter((file) => file.datasetType === ENTITY_DATASET_TYPE_MAP.Invoices!.datasetType);
    const itemFiles = files.filter((file) => file.datasetType === ENTITY_DATASET_TYPE_MAP["Invoice Items"]!.datasetType);
    if (invoiceFiles.length === 0 || itemFiles.length === 0) return false;
    const versions = await this.postgres("hasInvoiceSalesSources.versions", () => this.prisma.rieDatasetVersion.findMany({ where: { companyId: context.companyId, entityName: { in: ["Invoices", "Invoice Items"] }, isActive: true, sourceFileId: { in: [...invoiceFiles, ...itemFiles].map((file) => file.id) } }, select: { entityName: true, sourceFileId: true } }));
    recordActiveVersionResolution(2, versions.length);
    const active = new Set(versions.map((version) => `${version.entityName}:${version.sourceFileId}`));
    return invoiceFiles.every((file) => active.has(`Invoices:${file.id}`)) && itemFiles.every((file) => active.has(`Invoice Items:${file.id}`));
  }

  /** Metadata-only availability check; never materializes canonical rows. */
  async hasCanonicalEntitySources(context: EntityQueryContext, entityNames: readonly string[]): Promise<boolean> {
    return observeRieLogicalOperation("hasCanonicalEntitySources", scopeMetadata(context), () => this.hasCanonicalEntitySourcesUnobserved(context, entityNames));
  }

  private async hasCanonicalEntitySourcesUnobserved(context: EntityQueryContext, entityNames: readonly string[]): Promise<boolean> {
    const files = await this.postgres("hasCanonicalEntitySources.files", () => this.filesService.listConfirmedActiveForCompany(context.companyId));
    const expected = entityNames.flatMap((entityName) => {
      const mapping = ENTITY_DATASET_TYPE_MAP[entityName];
      return mapping?.datasetType ? [{ entityName, datasetType: mapping.datasetType }] : [];
    });
    if (expected.length !== entityNames.length) return false;
    const fileIds = files.filter((file) => expected.some((item) => item.datasetType === file.datasetType)).map((file) => file.id);
    if (!fileIds.length) return false;
    const versions = await this.postgres("hasCanonicalEntitySources.versions", () => this.prisma.rieDatasetVersion.findMany({ where: { companyId: context.companyId, entityName: { in: [...entityNames] }, isActive: true, sourceFileId: { in: fileIds } }, select: { entityName: true, sourceFileId: true } }));
    recordActiveVersionResolution(entityNames.length, versions.length);
    const active = new Set(versions.map((version) => `${version.entityName}:${version.sourceFileId}`));
    return expected.every(({ entityName, datasetType }) => {
      const entityFiles = files.filter((file) => file.datasetType === datasetType);
      return entityFiles.length > 0 && entityFiles.every((file) => active.has(`${entityName}:${file.id}`));
    });
  }

  /** Resolve several optional briefing sources with one files read and one version read. */
  private async canonicalEntityAvailability(
    companyId: string,
    entityNames: readonly RieVisitCopilotBriefingEntity[],
  ): Promise<Record<RieVisitCopilotBriefingEntity, boolean>> {
    const files = await this.postgres("visitCopilotBriefing.files", () => this.filesService.listConfirmedActiveForCompany(companyId));
    const expected = entityNames.map((entityName) => ({ entityName, datasetType: ENTITY_DATASET_TYPE_MAP[entityName]!.datasetType }));
    const relevantFiles = files.filter((file) => expected.some((item) => item.datasetType === file.datasetType));
    const versions = relevantFiles.length
      ? await this.postgres("visitCopilotBriefing.versions", () => this.prisma.rieDatasetVersion.findMany({
          where: { companyId, entityName: { in: [...entityNames] }, isActive: true, sourceFileId: { in: relevantFiles.map((file) => file.id) } },
          select: { entityName: true, sourceFileId: true },
        }))
      : [];
    recordActiveVersionResolution(entityNames.length, versions.length);
    const active = new Set(versions.map((version) => `${version.entityName}:${version.sourceFileId}`));
    return Object.fromEntries(expected.map(({ entityName, datasetType }) => {
      const entityFiles = relevantFiles.filter((file) => file.datasetType === datasetType);
      return [entityName, entityFiles.length > 0 && entityFiles.every((file) => active.has(`${entityName}:${file.id}`))];
    })) as Record<RieVisitCopilotBriefingEntity, boolean>;
  }

  private postgres<T>(operation: string, execute: () => Promise<T>): Promise<T> {
    return this.executionCoordinator.execute(operation, execute);
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
