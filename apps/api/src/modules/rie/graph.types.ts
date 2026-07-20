import type { CanonicalEntityDefinition } from "./canonical-entities.data";
import type { RelationshipDefinition, RelationshipDomain, RelationshipType, NavigationType } from "./relationship-registry.types";

// RIE Graph Builder — output graph model.
//
// This is the ONLY output Graph Builder produces (see Query Planner spec's
// "Planner Output" — Navigation Engine and Query Planner consume this
// object; Graph Builder does not perform navigation or query execution
// itself).

/**
 * A Node represents one Canonical Business Entity. Graph Builder creates
 * exactly one Node per entry in CANONICAL_ENTITIES — no more, no fewer.
 */
export interface GraphNode {
  entityName: string;
  entityType: CanonicalEntityDefinition["entityType"];
  /** Domains (from the Relationship Registry) this entity participates in, derived — not authored directly. */
  domains: readonly RelationshipDomain[];
  metadata: {
    primaryKey: string;
    notes: string | null;
  };
}

/**
 * An Edge represents one Relationship Registry entry, verbatim. Every field
 * from RelationshipDefinition is retained — Graph Builder does not drop,
 * summarize, or reinterpret any Registry property.
 */
export interface GraphEdge {
  relationship: RelationshipDefinition;
}

export interface GraphIndexes {
  /** entityName -> edges where this entity is source OR target. */
  byEntity: ReadonlyMap<string, readonly GraphEdge[]>;
  byDomain: ReadonlyMap<RelationshipDomain, readonly GraphEdge[]>;
  byRelationshipType: ReadonlyMap<RelationshipType, readonly GraphEdge[]>;
  byNavigationType: ReadonlyMap<NavigationType, readonly GraphEdge[]>;
  byRelationshipId: ReadonlyMap<string, GraphEdge>;
}

export interface GraphValidationIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  relationshipId?: string;
  entityName?: string;
}

export interface GraphValidationResult {
  valid: boolean;
  issues: readonly GraphValidationIssue[];
}

/**
 * The final, validated Relationship Graph — the sole handoff object from
 * Graph Builder to Navigation Engine (out of scope for this module).
 */
export interface RelationshipGraph {
  nodes: ReadonlyMap<string, GraphNode>;
  edges: readonly GraphEdge[];
  indexes: GraphIndexes;
  validation: GraphValidationResult;
  builtAt: Date;
  registryVersion: string;
}
