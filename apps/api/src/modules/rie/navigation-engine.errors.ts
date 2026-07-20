// RIE Navigation Engine — error taxonomy. Mirrors the style established by
// graph-builder.errors.ts (named subclasses over one generic Error), kept
// separate because Navigation Engine's failure modes are about traversal,
// not graph structural integrity.

export type NavigationEngineErrorCode =
  | "UNKNOWN_RELATIONSHIP"
  | "REVERSE_NOT_ALLOWED"
  | "NAVIGATION_TYPE_NOT_ALLOWED"
  | "MULTI_HOP_MISCONFIGURED"
  | "CIRCULAR_TRAVERSAL";

export class NavigationEngineError extends Error {
  constructor(
    public readonly code: NavigationEngineErrorCode,
    public readonly relationshipId: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnknownRelationshipError extends NavigationEngineError {
  constructor(relationshipId: string) {
    super("UNKNOWN_RELATIONSHIP", relationshipId, `No relationship "${relationshipId}" exists in the Relationship Graph.`);
  }
}

export class ReverseNotAllowedError extends NavigationEngineError {
  constructor(relationshipId: string) {
    super("REVERSE_NOT_ALLOWED", relationshipId, `Relationship "${relationshipId}" does not allow reverse navigation (reverseAllowed: false).`);
  }
}

export class NavigationTypeNotAllowedError extends NavigationEngineError {
  constructor(relationshipId: string, requested: string, allowed: readonly string[]) {
    super(
      "NAVIGATION_TYPE_NOT_ALLOWED",
      relationshipId,
      `Relationship "${relationshipId}" does not allow navigationType "${requested}". Allowed: ${allowed.join(", ")}.`,
    );
  }
}

export class MultiHopMisconfiguredError extends NavigationEngineError {
  constructor(relationshipId: string, reason: string) {
    super("MULTI_HOP_MISCONFIGURED", relationshipId, `Multi-Hop relationship "${relationshipId}" is misconfigured: ${reason}`);
  }
}

export class CircularTraversalError extends NavigationEngineError {
  constructor(relationshipId: string) {
    super("CIRCULAR_TRAVERSAL", relationshipId, `Circular traversal detected while resolving Multi-Hop relationship "${relationshipId}".`);
  }
}
