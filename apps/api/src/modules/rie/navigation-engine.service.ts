import { Inject, Injectable, Logger } from "@nestjs/common";
import { GraphBuilderService } from "./graph-builder.service";
import { ENTITY_PROVIDER, type EntityFieldFilter, type EntityProvider, type EntityRecord, type EntityQueryContext } from "./entity-provider.interface";
import type { NavigationDirection, NavigationRequest, NavigationResult, NavigationWarning } from "./navigation.types";
import type { RelationshipDefinition } from "./relationship-registry.types";
import { parseForeignKeySpec, type ForeignKeySpec } from "./foreign-key-parser";
import { CANONICAL_ENTITIES } from "./canonical-entities.data";
import {
  CircularTraversalError,
  MultiHopMisconfiguredError,
  NavigationTypeNotAllowedError,
  ReverseNotAllowedError,
  UnknownRelationshipError,
} from "./navigation-engine.errors";

const PRIMARY_KEY_BY_ENTITY: ReadonlyMap<string, string> = new Map(CANONICAL_ENTITIES.map((e) => [e.entityName, e.primaryKey]));

function primaryKeyOf(entityName: string): string | null {
  const pk = PRIMARY_KEY_BY_ENTITY.get(entityName);
  if (!pk || pk.includes("+")) return null; // composite PK — not a single filterable field
  return pk;
}

/**
 * RIE Navigation Engine — second operational component of the Relationship
 * Intelligence Engine.
 *
 * Sole responsibility: given one already-selected Registry relationship
 * (Graph Builder's output identifies it; Query Planner/Query Execution
 * Engine decide WHICH relationship applies) and a direction, fetch the
 * actually-related records through the injected EntityProvider. Navigation
 * Engine never picks which relationship to use, never executes a full
 * query plan, and never applies business rules — it only traverses.
 *
 * Depends only on:
 *   - GraphBuilderService (to resolve relationshipId -> RelationshipDefinition
 *     and validate it exists in the Validated Relationship Graph)
 *   - EntityProvider (via ENTITY_PROVIDER token — storage-agnostic; see
 *     entity-provider.interface.ts)
 */
@Injectable()
export class NavigationEngineService {
  private readonly logger = new Logger(NavigationEngineService.name);

  constructor(
    private readonly graphBuilder: GraphBuilderService,
    @Inject(ENTITY_PROVIDER) private readonly entityProvider: EntityProvider,
  ) {}

  async navigate(request: NavigationRequest): Promise<NavigationResult> {
    const edge = this.graphBuilder.getRelationship(request.relationshipId);
    if (!edge) throw new UnknownRelationshipError(request.relationshipId);
    const rel = edge.relationship;

    if (request.direction === "reverse" && !rel.navigation.reverseAllowed) {
      throw new ReverseNotAllowedError(rel.relationshipId);
    }

    const requestedNavType = request.navigationType ?? (request.direction === "forward" ? "Direct" : "Reverse");
    if (!rel.navigation.allowedNavigationTypes.includes(requestedNavType) && requestedNavType !== "Multi-Hop") {
      // "Direct"/"Reverse" are Navigation Engine's own default vocabulary for
      // request.direction; only enforce membership when the caller explicitly
      // asked for a specific navigationType (Context/Snapshot/Temporal/Multi-Hop).
      if (request.navigationType) {
        throw new NavigationTypeNotAllowedError(rel.relationshipId, requestedNavType, rel.navigation.allowedNavigationTypes);
      }
    }

    if (rel.relationshipType === "Multi-Hop") {
      return this.navigateMultiHop(rel, request, new Set());
    }

    return this.navigateSingleHop(rel, request.direction, request.sourceRecord, request.anchorValue, request.context, request.filters);
  }

  // ------------------------------------------------------------------
  // Single-hop navigation (Structural / Operational / Reference /
  // Temporal / Snapshot relationships — everything except Multi-Hop).
  // ------------------------------------------------------------------

  private async navigateSingleHop(
    rel: RelationshipDefinition,
    direction: NavigationDirection,
    sourceRecord: EntityRecord | undefined,
    anchorValue: unknown,
    context: EntityQueryContext,
    extraFilters: readonly EntityFieldFilter[] | undefined,
  ): Promise<NavigationResult> {
    const resolvedEntity = direction === "forward" ? rel.targetEntity : rel.sourceEntity;
    const warnings: NavigationWarning[] = [];
    const fkSpec = parseForeignKeySpec(rel.navigation.foreignKey);

    if (fkSpec.isComposite) {
      warnings.push({
        code: "COMPOSITE_KEY_UNRESOLVED",
        message: `Relationship "${rel.relationshipId}" uses a composite key (${fkSpec.raw}). Navigation Engine cannot build a single-value anchor filter for this yet — returning the unfiltered related set for company scope only.`,
      });
    } else if (fkSpec.isLogicalJoin) {
      warnings.push({
        code: "LOGICAL_JOIN_UNRESOLVED",
        message: `Relationship "${rel.relationshipId}" is a logical (non-stored-FK) join (${fkSpec.raw}). Row-level correlation is not implemented — returning the unfiltered related set for company scope only.`,
      });
    }

    const joinFilter =
      fkSpec.isComposite || fkSpec.isLogicalJoin ? null : this.computeJoinFilter(rel, direction, resolvedEntity, fkSpec, sourceRecord, anchorValue, warnings);

    const filters = joinFilter ? [joinFilter, ...(extraFilters ?? [])] : (extraFilters ?? []);

    const providerResult = await this.entityProvider.getRecords(resolvedEntity, { ...context, filters });

    return {
      relationship: rel,
      direction,
      resolvedEntity,
      records: providerResult.records,
      available: providerResult.available,
      warnings: [...warnings, ...providerResult.warnings.map((w): NavigationWarning => ({ code: "PROVIDER_WARNING", message: w }))],
    };
  }

  /**
   * Determines the EntityFieldFilter that anchors navigation to a specific
   * source row, or returns null (unfiltered — full related set within
   * company scope) when no anchor was supplied at all, which is a valid
   * request ("give me every Region", not "give me Company X's Regions").
   */
  private computeJoinFilter(
    rel: RelationshipDefinition,
    direction: NavigationDirection,
    resolvedEntity: string,
    fkSpec: ForeignKeySpec,
    sourceRecord: EntityRecord | undefined,
    anchorValue: unknown,
    warnings: NavigationWarning[],
  ): EntityFieldFilter | null {
    if (!fkSpec.column || !fkSpec.onEntity) {
      if (rel.navigation.foreignKey) {
        warnings.push({ code: "FK_UNPARSEABLE", message: `Could not parse navigation.foreignKey "${rel.navigation.foreignKey}" on "${rel.relationshipId}" — returning the unfiltered related set.` });
      }
      return null;
    }

    const isSelfRef = rel.sourceEntity === rel.targetEntity;
    // See class-level note: exhaustively correct for the current Registry's
    // single self-referencing relationship (REL-ORG-006, "N:1"), not a
    // general solver for hypothetical future self-refs with other cardinalities.
    const fkIsOnRelationshipSource = isSelfRef ? /N:1/.test(rel.cardinality) : fkSpec.onEntity === rel.sourceEntity;
    const fetchingRelationshipSourceSide = direction === "reverse";
    const fetchingTheFkOwningSide = fkIsOnRelationshipSource === fetchingRelationshipSourceSide;

    if (fetchingTheFkOwningSide) {
      // resolvedEntity's own rows carry the FK column; the anchor is the
      // OTHER side's primary key value.
      const otherEntity = fetchingRelationshipSourceSide ? rel.targetEntity : rel.sourceEntity;
      const anchor = anchorValue ?? this.readAnchorField(sourceRecord, primaryKeyOf(otherEntity));
      if (anchor === undefined) return null; // caller wants the unfiltered set
      return { field: fkSpec.column, op: "eq", value: anchor };
    }

    // resolvedEntity is the referenced ("one"/PK) side; the anchor is the FK
    // column's value, read off sourceRecord (which belongs to the FK-owning side).
    const anchor = anchorValue ?? this.readAnchorField(sourceRecord, fkSpec.column);
    if (anchor === undefined) return null;
    const pk = primaryKeyOf(resolvedEntity);
    if (!pk) {
      warnings.push({ code: "COMPOSITE_KEY_UNRESOLVED", message: `"${resolvedEntity}" has a composite primary key — cannot filter by it. Returning the unfiltered related set.` });
      return null;
    }
    return { field: pk, op: "eq", value: anchor };
  }

  private readAnchorField(record: EntityRecord | undefined, field: string | null): unknown {
    if (!record || !field) return undefined;
    // Header-normalized lookup, matching ExcelDatasetEntityProvider's own
    // leniency — sourceRecord field names come straight from a provider's
    // EntityQueryResult.fields, which are real uploaded headers, not
    // guaranteed to match the Registry's documented casing exactly.
    const normalized = field.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const key of Object.keys(record)) {
      if (key.toLowerCase().replace(/[^a-z0-9]/g, "") === normalized) return record[key];
    }
    return undefined;
  }

  // ------------------------------------------------------------------
  // Multi-Hop navigation (REL-DER-* — `path` chains or `aggregationSources`
  // fan-in). Never computes derived values itself (e.g. reconciliation
  // balances) — that is Business Rules Engine's job; Navigation Engine only
  // fetches the constituent record sets.
  // ------------------------------------------------------------------

  private async navigateMultiHop(rel: RelationshipDefinition, request: NavigationRequest, visiting: Set<string>): Promise<NavigationResult> {
    if (visiting.has(rel.relationshipId)) throw new CircularTraversalError(rel.relationshipId);
    visiting.add(rel.relationshipId);

    const hasPath = !!rel.navigation.path && rel.navigation.path.length > 0;
    const hasAgg = !!rel.navigation.aggregationSources && rel.navigation.aggregationSources.length > 0;
    if (hasPath === hasAgg) {
      throw new MultiHopMisconfiguredError(rel.relationshipId, "must declare exactly one of navigation.path or navigation.aggregationSources.");
    }

    if (hasPath) {
      const hops: NavigationResult[] = [];
      let currentRecords: readonly EntityRecord[] = request.sourceRecord ? [request.sourceRecord] : [];
      let currentAnchor = request.anchorValue;
      const warnings: NavigationWarning[] = [];

      for (const hop of rel.navigation.path!) {
        const hopEdge = this.graphBuilder.getRelationship(hop.relationshipId);
        if (!hopEdge) throw new UnknownRelationshipError(hop.relationshipId);

        // Fan out over every record carried from the previous hop; if there
        // were none yet (first hop, no anchor supplied), navigate once
        // unfiltered so the caller still gets the full reachable set.
        const anchors = currentRecords.length > 0 ? currentRecords : [undefined];
        const hopResults: NavigationResult[] = [];
        for (const anchorRecord of anchors) {
          const hopResult = await this.navigateSingleHop(
            hopEdge.relationship,
            hop.traversalDirection,
            anchorRecord,
            anchorRecord ? undefined : currentAnchor,
            request.context,
            undefined,
          );
          hopResults.push(hopResult);
        }

        const mergedRecords = hopResults.flatMap((r) => r.records);
        const mergedWarnings = hopResults.flatMap((r) => r.warnings);
        const combinedHopResult: NavigationResult = {
          relationship: hopEdge.relationship,
          direction: hop.traversalDirection,
          resolvedEntity: hopResults[0]?.resolvedEntity ?? "",
          records: mergedRecords,
          available: hopResults.every((r) => r.available),
          warnings: mergedWarnings,
        };
        hops.push(combinedHopResult);
        warnings.push(...mergedWarnings);

        currentRecords = mergedRecords;
        currentAnchor = undefined; // only used for the very first hop
      }

      visiting.delete(rel.relationshipId);
      return {
        relationship: rel,
        direction: request.direction,
        resolvedEntity: rel.targetEntity,
        records: currentRecords,
        available: hops.every((h) => h.available),
        warnings,
        hops,
      };
    }

    // aggregationSources fan-in — gather each contributing relationship's
    // records independently; caller (Business Rules Engine) reconciles them.
    const aggregationResults: { relationshipId: string; result: NavigationResult }[] = [];
    const warnings: NavigationWarning[] = [];
    for (const sourceId of rel.navigation.aggregationSources!) {
      const sourceEdge = this.graphBuilder.getRelationship(sourceId);
      if (!sourceEdge) throw new UnknownRelationshipError(sourceId);
      const result = await this.navigateSingleHop(sourceEdge.relationship, "forward", request.sourceRecord, request.anchorValue, request.context, request.filters);
      aggregationResults.push({ relationshipId: sourceId, result });
      warnings.push(...result.warnings);
    }

    visiting.delete(rel.relationshipId);
    return {
      relationship: rel,
      direction: request.direction,
      resolvedEntity: rel.targetEntity,
      records: aggregationResults.flatMap((a) => a.result.records),
      available: aggregationResults.every((a) => a.result.available),
      warnings,
      aggregationResults,
    };
  }
}
