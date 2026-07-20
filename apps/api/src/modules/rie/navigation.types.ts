import type { RelationshipDefinition, NavigationType } from "./relationship-registry.types";
import type { EntityFieldFilter, EntityQueryContext, EntityRecord } from "./entity-provider.interface";

// RIE Navigation Engine — request/result contracts.
//
// Navigation Engine's sole responsibility: given a relationship (identified
// by its Registry relationshipId) and a direction, fetch the actually
// related records via the configured EntityProvider. It does not execute
// queries (that is Query Execution Engine), does not apply business rules
// (Business Rules Engine), and does not decide WHICH relationship to use for
// a given intent (Query Planner). It only navigates one already-selected
// relationship at a time — or a documented Multi-Hop chain of them.

export type NavigationDirection = "forward" | "reverse";

export interface NavigationRequest {
  relationshipId: string;
  direction: NavigationDirection;
  context: EntityQueryContext;
  /**
   * The anchor record from the *starting* side of `direction` (source row if
   * forward, target row if reverse). Navigation Engine reads whatever join
   * field it needs from this record itself — callers never need to know the
   * relationship's internal FK column name.
   */
  sourceRecord?: EntityRecord;
  /** Alternative to sourceRecord when the caller already has the raw join scalar (e.g. a CompanyID) rather than a full record. */
  anchorValue?: unknown;
  /** Extra filters applied on top of the relationship's own join filter. */
  filters?: readonly EntityFieldFilter[];
  /** Requested navigation type — validated against the relationship's allowedNavigationTypes. Defaults to "Direct"/"Reverse" matching `direction`. */
  navigationType?: NavigationType;
}

export interface NavigationWarning {
  code: string;
  message: string;
}

export interface NavigationResult {
  relationship: RelationshipDefinition;
  direction: NavigationDirection;
  /** The Canonical Entity actually fetched (source or target depending on direction). */
  resolvedEntity: string;
  records: readonly EntityRecord[];
  available: boolean;
  warnings: readonly NavigationWarning[];
  /** Present only for Multi-Hop relationships resolved via `path` — the per-hop results, in traversal order. */
  hops?: readonly NavigationResult[];
  /** Present only for Multi-Hop relationships resolved via `aggregationSources` — one result per contributing relationship. */
  aggregationResults?: readonly { relationshipId: string; result: NavigationResult }[];
}
