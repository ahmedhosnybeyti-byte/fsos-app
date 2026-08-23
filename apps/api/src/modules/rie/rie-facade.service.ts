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
import { ENTITY_PROVIDER, type EntityProvider, type EntityQueryOptions, type EntityQueryResult } from "./entity-provider.interface";

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
