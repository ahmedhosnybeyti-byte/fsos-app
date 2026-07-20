import { Injectable, Logger } from "@nestjs/common";
import { CANONICAL_ENTITIES, isCanonicalEntity, type CanonicalEntityDefinition } from "./canonical-entities.data";
import { RELATIONSHIP_REGISTRY } from "./relationship-registry.data";
import { RELATIONSHIP_TYPES, RELATIONSHIP_DOMAINS, NAVIGATION_TYPES, type RelationshipDefinition } from "./relationship-registry.types";
import type { GraphNode, GraphEdge, GraphIndexes, GraphValidationIssue, GraphValidationResult, RelationshipGraph } from "./graph.types";
import {
  BrokenEdgeError,
  CircularDefinitionError,
  DuplicateRelationshipError,
  InvalidMetadataError,
  InvalidRelationshipError,
  UnknownEntityError,
} from "./graph-builder.errors";

const REGISTRY_VERSION = "1.0.0";

/**
 * RIE Graph Builder — the first operational component of the Relationship
 * Intelligence Engine.
 *
 * Sole responsibility: load every relationship defined in the Relationship
 * Registry (relationship-registry.data.ts), validate it, and assemble a
 * Directed Graph (Nodes + Edges + Indexes) that Navigation Engine can later
 * consume. Graph Builder does not execute queries, does not perform
 * navigation, does not apply business rules, and does not create, modify,
 * or delete any relationship — it only reads the Registry and the Canonical
 * Database's entity list (canonical-entities.data.ts) and builds a graph
 * from them.
 *
 * Per FSOS RIE Constitution vNext / Relationship Registry Specification
 * v1.0 / RIE Query Planner Specification v1.0 — no architectural decision
 * from those documents is altered here; this is their first executable
 * expression.
 */
@Injectable()
export class GraphBuilderService {
  private readonly logger = new Logger(GraphBuilderService.name);
  private cachedGraph: RelationshipGraph | null = null;

  // ------------------------------------------------------------------
  // 1. Graph Construction / 6. Graph Cache
  // ------------------------------------------------------------------

  /**
   * Builds (or returns the cached) Relationship Graph. The graph is
   * immutable once built — Graph Builder holds a single in-memory instance
   * and reuses it across calls until `forceRebuild` is passed, since the
   * Registry is static compiled data, not a runtime-mutable store.
   */
  buildGraph(options?: { forceRebuild?: boolean }): RelationshipGraph {
    if (this.cachedGraph && !options?.forceRebuild) {
      return this.cachedGraph;
    }

    const relationships = RELATIONSHIP_REGISTRY;

    // Validation runs first. Any "error"-severity issue aborts construction
    // — Graph Builder never hands out a graph built from data it knows to
    // be structurally broken (see Output section of the RIE Query Planner
    // Specification: the only acceptable output is a Validated Relationship
    // Graph).
    const validation = this.validate(relationships);
    const firstError = validation.issues.find((i) => i.severity === "error");
    if (firstError) {
      this.throwForIssue(firstError);
    }

    const nodes = this.buildNodes(relationships);
    const edges = relationships.map((relationship): GraphEdge => ({ relationship }));
    const indexes = this.buildIndexes(edges);

    const graph: RelationshipGraph = {
      nodes,
      edges,
      indexes,
      validation,
      builtAt: new Date(),
      registryVersion: REGISTRY_VERSION,
    };

    this.cachedGraph = graph;
    this.logger.log(`Relationship Graph built: ${nodes.size} nodes, ${edges.length} edges (registry v${REGISTRY_VERSION}).`);
    return graph;
  }

  /** Drops the cached graph; the next buildGraph() call rebuilds from the Registry. */
  invalidateCache(): void {
    this.cachedGraph = null;
  }

  // ------------------------------------------------------------------
  // 2. Node Model
  // ------------------------------------------------------------------

  private buildNodes(relationships: readonly RelationshipDefinition[]): ReadonlyMap<string, GraphNode> {
    const domainsByEntity = new Map<string, Set<(typeof RELATIONSHIP_DOMAINS)[number]>>();
    for (const rel of relationships) {
      for (const entityName of [rel.sourceEntity, rel.targetEntity]) {
        const set = domainsByEntity.get(entityName) ?? new Set();
        set.add(rel.domain);
        domainsByEntity.set(entityName, set);
      }
    }

    const nodes = new Map<string, GraphNode>();
    for (const entity of CANONICAL_ENTITIES) {
      nodes.set(entity.entityName, {
        entityName: entity.entityName,
        entityType: entity.entityType,
        domains: Array.from(domainsByEntity.get(entity.entityName) ?? []),
        metadata: { primaryKey: entity.primaryKey, notes: entity.notes },
      });
    }
    return nodes;
  }

  // ------------------------------------------------------------------
  // 5. Graph Indexes
  // ------------------------------------------------------------------

  private buildIndexes(edges: readonly GraphEdge[]): GraphIndexes {
    const byEntity = new Map<string, GraphEdge[]>();
    const byDomain = new Map<string, GraphEdge[]>();
    const byRelationshipType = new Map<string, GraphEdge[]>();
    const byNavigationType = new Map<string, GraphEdge[]>();
    const byRelationshipId = new Map<string, GraphEdge>();

    for (const edge of edges) {
      const rel = edge.relationship;

      byRelationshipId.set(rel.relationshipId, edge);

      for (const entityName of [rel.sourceEntity, rel.targetEntity]) {
        const list = byEntity.get(entityName) ?? [];
        list.push(edge);
        byEntity.set(entityName, list);
      }

      const domainList = byDomain.get(rel.domain) ?? [];
      domainList.push(edge);
      byDomain.set(rel.domain, domainList);

      const typeList = byRelationshipType.get(rel.relationshipType) ?? [];
      typeList.push(edge);
      byRelationshipType.set(rel.relationshipType, typeList);

      for (const navType of rel.navigation.allowedNavigationTypes) {
        const navList = byNavigationType.get(navType) ?? [];
        navList.push(edge);
        byNavigationType.set(navType, navList);
      }
    }

    return {
      byEntity,
      byDomain: byDomain as unknown as GraphIndexes["byDomain"],
      byRelationshipType: byRelationshipType as unknown as GraphIndexes["byRelationshipType"],
      byNavigationType: byNavigationType as unknown as GraphIndexes["byNavigationType"],
      byRelationshipId,
    };
  }

  // ------------------------------------------------------------------
  // 4. Graph Validation / 8. Error Handling / 9. Validation Rules
  // ------------------------------------------------------------------

  /**
   * Runs every structural validation rule over the raw Registry data,
   * before any Node/Edge/Index is constructed. Returns a full report
   * rather than throwing on the first problem, so a caller can inspect
   * every issue at once — buildGraph() itself still aborts on the first
   * "error"-severity issue (see buildGraph()).
   */
  validate(relationships: readonly RelationshipDefinition[] = RELATIONSHIP_REGISTRY): GraphValidationResult {
    const issues: GraphValidationIssue[] = [];
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const idsInRegistry = new Set(relationships.map((r) => r.relationshipId));

    for (const rel of relationships) {
      // G1 — Duplicate Relationship (id)
      if (seenIds.has(rel.relationshipId)) {
        issues.push({
          code: "DUPLICATE_RELATIONSHIP",
          severity: "error",
          relationshipId: rel.relationshipId,
          message: `Duplicate relationshipId "${rel.relationshipId}".`,
        });
      }
      seenIds.add(rel.relationshipId);

      // G2 — Duplicate Relationship (name)
      if (seenNames.has(rel.name)) {
        issues.push({
          code: "DUPLICATE_RELATIONSHIP",
          severity: "error",
          relationshipId: rel.relationshipId,
          message: `Duplicate relationship name "${rel.name}" (relationshipId ${rel.relationshipId}).`,
        });
      }
      seenNames.add(rel.name);

      // G3 — Unknown Entity (source)
      if (!isCanonicalEntity(rel.sourceEntity)) {
        issues.push({
          code: "UNKNOWN_ENTITY",
          severity: "error",
          relationshipId: rel.relationshipId,
          entityName: rel.sourceEntity,
          message: `sourceEntity "${rel.sourceEntity}" on ${rel.relationshipId} is not a Canonical Database entity.`,
        });
      }

      // G4 — Unknown Entity (target)
      if (!isCanonicalEntity(rel.targetEntity)) {
        issues.push({
          code: "UNKNOWN_ENTITY",
          severity: "error",
          relationshipId: rel.relationshipId,
          entityName: rel.targetEntity,
          message: `targetEntity "${rel.targetEntity}" on ${rel.relationshipId} is not a Canonical Database entity.`,
        });
      }

      // G5 — Invalid Relationship: relationshipType must be one of the six registered types.
      if (!(RELATIONSHIP_TYPES as readonly string[]).includes(rel.relationshipType)) {
        issues.push({
          code: "INVALID_RELATIONSHIP",
          severity: "error",
          relationshipId: rel.relationshipId,
          message: `Unrecognized relationshipType "${rel.relationshipType}" on ${rel.relationshipId}.`,
        });
      }

      // G6 — Invalid Relationship: domain must be one of the eight registered domains.
      if (!(RELATIONSHIP_DOMAINS as readonly string[]).includes(rel.domain)) {
        issues.push({
          code: "INVALID_RELATIONSHIP",
          severity: "error",
          relationshipId: rel.relationshipId,
          message: `Unrecognized domain "${rel.domain}" on ${rel.relationshipId}.`,
        });
      }

      // G7 — Invalid Relationship: allowedNavigationTypes must be non-empty and only contain known values.
      if (rel.navigation.allowedNavigationTypes.length === 0) {
        issues.push({
          code: "INVALID_RELATIONSHIP",
          severity: "error",
          relationshipId: rel.relationshipId,
          message: `${rel.relationshipId} declares no allowedNavigationTypes.`,
        });
      }
      for (const navType of rel.navigation.allowedNavigationTypes) {
        if (!(NAVIGATION_TYPES as readonly string[]).includes(navType)) {
          issues.push({
            code: "INVALID_RELATIONSHIP",
            severity: "error",
            relationshipId: rel.relationshipId,
            message: `${rel.relationshipId} declares unrecognized navigationType "${navType}".`,
          });
        }
      }

      // G8 — Invalid Relationship: non-Multi-Hop relationships must declare a foreignKey.
      if (rel.relationshipType !== "Multi-Hop" && !rel.navigation.foreignKey) {
        issues.push({
          code: "INVALID_RELATIONSHIP",
          severity: "error",
          relationshipId: rel.relationshipId,
          message: `${rel.relationshipId} (${rel.relationshipType}) has no navigation.foreignKey.`,
        });
      }

      // G9 — Invalid Relationship: Multi-Hop relationships must declare exactly one of path / aggregationSources.
      if (rel.relationshipType === "Multi-Hop") {
        const hasPath = !!rel.navigation.path && rel.navigation.path.length > 0;
        const hasAgg = !!rel.navigation.aggregationSources && rel.navigation.aggregationSources.length > 0;
        if (hasPath === hasAgg) {
          issues.push({
            code: "INVALID_RELATIONSHIP",
            severity: "error",
            relationshipId: rel.relationshipId,
            message: `Multi-Hop relationship ${rel.relationshipId} must declare exactly one of navigation.path or navigation.aggregationSources.`,
          });
        }
      }

      // G10 — Broken Edge: every hop in a path must reference an existing relationshipId, and the path must not revisit the same id (Circular Definition).
      if (rel.navigation.path) {
        const seenInPath = new Set<string>();
        for (const hop of rel.navigation.path) {
          if (!idsInRegistry.has(hop.relationshipId)) {
            issues.push({
              code: "BROKEN_EDGE",
              severity: "error",
              relationshipId: rel.relationshipId,
              message: `${rel.relationshipId}'s path references unknown relationshipId "${hop.relationshipId}".`,
            });
          }
          if (seenInPath.has(hop.relationshipId)) {
            issues.push({
              code: "CIRCULAR_DEFINITION",
              severity: "error",
              relationshipId: rel.relationshipId,
              message: `${rel.relationshipId}'s path revisits relationshipId "${hop.relationshipId}" — circular path definition.`,
            });
          }
          seenInPath.add(hop.relationshipId);
        }
      }

      // G11 — Broken Edge: aggregationSources must reference existing relationshipIds.
      if (rel.navigation.aggregationSources) {
        for (const sourceId of rel.navigation.aggregationSources) {
          if (!idsInRegistry.has(sourceId)) {
            issues.push({
              code: "BROKEN_EDGE",
              severity: "error",
              relationshipId: rel.relationshipId,
              message: `${rel.relationshipId}'s aggregationSources references unknown relationshipId "${sourceId}".`,
            });
          }
        }
      }

      // G12 — Invalid Metadata: Snapshot relationships must document why.
      if (rel.relationshipType === "Snapshot" && (!rel.snapshotBehavior.isSnapshot || !rel.snapshotBehavior.description)) {
        issues.push({
          code: "INVALID_METADATA",
          severity: "error",
          relationshipId: rel.relationshipId,
          message: `${rel.relationshipId} is typed Snapshot but snapshotBehavior is incomplete (isSnapshot/description).`,
        });
      }

      // G13 — Invalid Metadata: Temporal relationships must be marked time-aware.
      if (rel.relationshipType === "Temporal" && !rel.timeAwareness.isTimeAware) {
        issues.push({
          code: "INVALID_METADATA",
          severity: "error",
          relationshipId: rel.relationshipId,
          message: `${rel.relationshipId} is typed Temporal but timeAwareness.isTimeAware is false.`,
        });
      }

      // G14 (warning) — No Orphan Relationships: every relationship should have at least one engine consumer.
      if (rel.engineConsumers.length === 0) {
        issues.push({
          code: "NO_ENGINE_CONSUMER",
          severity: "warning",
          relationshipId: rel.relationshipId,
          message: `${rel.relationshipId} has no declared engineConsumers.`,
        });
      }

      // G15 (warning) — Deprecated relationship without a replacement pointer.
      if (rel.status === "Deprecated" && !rel.deprecatedBy) {
        issues.push({
          code: "DEPRECATED_WITHOUT_REPLACEMENT",
          severity: "warning",
          relationshipId: rel.relationshipId,
          message: `${rel.relationshipId} is Deprecated but has no deprecatedBy replacement.`,
        });
      }
    }

    return { valid: !issues.some((i) => i.severity === "error"), issues };
  }

  private throwForIssue(issue: GraphValidationIssue): never {
    const relId = issue.relationshipId ?? "unknown";
    switch (issue.code) {
      case "DUPLICATE_RELATIONSHIP":
        throw new DuplicateRelationshipError(relId, issue.message);
      case "UNKNOWN_ENTITY":
        throw new UnknownEntityError(issue.entityName ?? "unknown", relId, issue.message);
      case "BROKEN_EDGE":
        throw new BrokenEdgeError(relId, issue.message);
      case "CIRCULAR_DEFINITION":
        throw new CircularDefinitionError(relId, issue.message);
      case "INVALID_METADATA":
        throw new InvalidMetadataError(relId, issue.message);
      case "INVALID_RELATIONSHIP":
      default:
        throw new InvalidRelationshipError(relId, issue.message);
    }
  }

  // ------------------------------------------------------------------
  // 7. Public API (read-only — no navigation/query execution)
  // ------------------------------------------------------------------

  getEntity(entityName: string): GraphNode | undefined {
    return this.buildGraph().nodes.get(entityName);
  }

  getRelationship(relationshipId: string): GraphEdge | undefined {
    return this.buildGraph().indexes.byRelationshipId.get(relationshipId);
  }

  /**
   * All edges touching `entityName` (as source or target). This lists
   * candidate relationships only — it does not decide which one a query
   * should use, and it does not traverse anything. That decision belongs to
   * Query Planner (see FSOS RIE Query Planner Specification v1.0, section
   * 4 — Relationship Selection).
   */
  getNeighbors(entityName: string): readonly GraphEdge[] {
    return this.buildGraph().indexes.byEntity.get(entityName) ?? [];
  }

  getRelationshipsByType(type: RelationshipDefinition["relationshipType"]): readonly GraphEdge[] {
    return this.buildGraph().indexes.byRelationshipType.get(type) ?? [];
  }

  getRelationshipsByDomain(domain: RelationshipDefinition["domain"]): readonly GraphEdge[] {
    return this.buildGraph().indexes.byDomain.get(domain) ?? [];
  }

  getRelationshipsByNavigationType(navigationType: RelationshipDefinition["navigation"]["allowedNavigationTypes"][number]): readonly GraphEdge[] {
    return this.buildGraph().indexes.byNavigationType.get(navigationType) ?? [];
  }
}
