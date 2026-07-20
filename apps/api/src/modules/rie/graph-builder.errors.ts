// RIE Graph Builder — error types.
//
// These are structural build/validation errors, distinct in kind from the
// NestJS HTTP exceptions (BadRequestException, NotFoundException, ...) used
// elsewhere in this codebase for request handling. Graph Builder is not a
// request handler — it constructs an in-memory data structure from the
// Relationship Registry at startup (or on-demand rebuild), so its failures
// are reported as plain Error subclasses that the caller (RieModule
// consumers, or the smoke-test script) can catch and inspect by `code`.

export type GraphBuilderErrorCode =
  | "DUPLICATE_RELATIONSHIP"
  | "UNKNOWN_ENTITY"
  | "BROKEN_EDGE"
  | "INVALID_RELATIONSHIP"
  | "INVALID_METADATA"
  | "CIRCULAR_DEFINITION";

export class GraphBuilderError extends Error {
  readonly code: GraphBuilderErrorCode;
  readonly relationshipId: string | undefined;
  readonly entityName: string | undefined;

  constructor(code: GraphBuilderErrorCode, message: string, details?: { relationshipId?: string; entityName?: string }) {
    super(message);
    this.name = "GraphBuilderError";
    this.code = code;
    this.relationshipId = details?.relationshipId;
    this.entityName = details?.entityName;
  }
}

/** Two Registry entries share the same relationshipId or the same name. */
export class DuplicateRelationshipError extends GraphBuilderError {
  constructor(relationshipId: string, message: string) {
    super("DUPLICATE_RELATIONSHIP", message, { relationshipId });
  }
}

/** A relationship's sourceEntity or targetEntity is not a Canonical Database entity. */
export class UnknownEntityError extends GraphBuilderError {
  constructor(entityName: string, relationshipId: string, message: string) {
    super("UNKNOWN_ENTITY", message, { relationshipId, entityName });
  }
}

/** A Multi-Hop relationship's path/aggregationSources references a relationshipId that does not exist in the Registry. */
export class BrokenEdgeError extends GraphBuilderError {
  constructor(relationshipId: string, message: string) {
    super("BROKEN_EDGE", message, { relationshipId });
  }
}

/** A relationship fails one of the structural Validation Rules (see graph-builder.service.ts `validate()`). */
export class InvalidRelationshipError extends GraphBuilderError {
  constructor(relationshipId: string, message: string) {
    super("INVALID_RELATIONSHIP", message, { relationshipId });
  }
}

/** A relationship's metadata is internally inconsistent (e.g. isSnapshot=true with no description). */
export class InvalidMetadataError extends GraphBuilderError {
  constructor(relationshipId: string, message: string) {
    super("INVALID_METADATA", message, { relationshipId });
  }
}

/** A Multi-Hop path revisits the same relationshipId, or a self-referencing relationship has no depth bound. */
export class CircularDefinitionError extends GraphBuilderError {
  constructor(relationshipId: string, message: string) {
    super("CIRCULAR_DEFINITION", message, { relationshipId });
  }
}
