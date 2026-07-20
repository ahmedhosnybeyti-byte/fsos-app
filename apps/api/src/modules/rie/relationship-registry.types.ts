// RIE Graph Builder — Relationship Registry types.
//
// Mirrors the JSON structure defined in "FSOS Relationship Registry
// Specification v1.0" (Relationship Registry JSON Structure section).
// `navigation` is expressed here in a structured, code-consumable form
// (foreignKey / allowedNavigationTypes / reverseAllowed / path /
// aggregationSources) instead of the free-text "Navigation Rules"
// paragraph used in the spec document, so Graph Builder and the future
// Query Planner implementation can validate against it programmatically.
// No relationship's meaning, cardinality, or classification was changed
// in this translation — only its representation.

export const RELATIONSHIP_TYPES = ["Structural", "Operational", "Reference", "Temporal", "Snapshot", "Multi-Hop"] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const NAVIGATION_TYPES = ["Direct", "Reverse", "Context", "Snapshot", "Temporal", "Multi-Hop"] as const;
export type NavigationType = (typeof NAVIGATION_TYPES)[number];

export const RELATIONSHIP_STRENGTHS = ["Strong", "Weak", "Derived"] as const;
export type RelationshipStrength = (typeof RELATIONSHIP_STRENGTHS)[number];

export const RELATIONSHIP_DOMAINS = ["ORG", "RT", "CU", "FI", "PR", "PL", "CAL", "DER"] as const;
export type RelationshipDomain = (typeof RELATIONSHIP_DOMAINS)[number];

export const RELATIONSHIP_STATUSES = ["Active", "Deprecated"] as const;
export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number];

/**
 * One hop inside a Multi-Hop relationship's documented path. `relationshipId`
 * must reference another relationship already present in the Registry — a
 * Multi-Hop relationship is never allowed to invent an ad-hoc join.
 */
export interface RelationshipPathHop {
  relationshipId: string;
  /** Whether this hop is traversed in its natively-registered direction, or reversed. */
  traversalDirection: "forward" | "reverse";
}

export interface RelationshipNavigation {
  /**
   * `sourceEntity.column -> targetEntity` foreign key, exactly as documented
   * in FSOS_Canonical_Database_v1.0.xlsx. Required for every relationship
   * type except Multi-Hop, where the relationship is derived from other
   * relationships instead of a single FK.
   */
  foreignKey: string | null;
  allowedNavigationTypes: readonly NavigationType[];
  reverseAllowed: boolean;
  /**
   * Only populated for Multi-Hop relationships that resolve via a single
   * ordered chain of hops (e.g. Employee -> RouteAssignment -> Route ->
   * Target). Mutually exclusive with `aggregationSources`.
   */
  path: readonly RelationshipPathHop[] | null;
  /**
   * Only populated for Multi-Hop relationships that are a fan-in
   * aggregation/comparison across several other relationships rather than a
   * single traversable chain (e.g. Van Load reconciliation). Mutually
   * exclusive with `path`.
   */
  aggregationSources: readonly string[] | null;
}

export interface RelationshipDefinition {
  relationshipId: string;
  name: string;
  sourceEntity: string;
  targetEntity: string;
  relationshipType: RelationshipType;
  cardinality: string;
  direction: string;
  strength: RelationshipStrength;
  lifecycle: string;
  timeAwareness: {
    isTimeAware: boolean;
    description: string;
  };
  snapshotBehavior: {
    isSnapshot: boolean;
    description: string | null;
  };
  navigation: RelationshipNavigation;
  queryExamples: readonly string[];
  businessRuleConsumers: readonly string[];
  engineConsumers: readonly string[];
  status: RelationshipStatus;
  /** Present only when status = "Deprecated"; points at the replacement relationshipId. */
  deprecatedBy: string | null;
  version: string;
  domain: RelationshipDomain;
  sourceOfTruth: "FSOS_Canonical_Database_v1.0.xlsx";
}
