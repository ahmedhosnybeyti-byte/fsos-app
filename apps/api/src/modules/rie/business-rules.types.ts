import type { ExecutionResult } from "./query-execution.types";
import type { EntityRecord } from "./entity-provider.interface";

// RIE Business Rules Engine — contracts.
//
// IMPORTANT SCOPE NOTE: the Relationship Registry Specification v1.0
// explicitly forbids embedding business rules inside the Registry itself —
// each relationship only lists WHICH named rules consume it
// (`businessRuleConsumers`, e.g. "Van Reconciliation Rule", "Collection
// Risk", "Lost Sales"). No FSOS document approved so far (Constitution
// vNext, Registry Spec, Query Planner Spec) defines those rules' actual
// formulas — that requires a dedicated, separately-approved Business Rules
// Specification. Business Rules Engine therefore ships with only the
// GENERIC, structurally-sourced rules described directly in the four
// approved documents (Snapshot Integrity, Temporal Effective-Date
// Resolution, Deprecated Relationship Guard) plus an open, named extension
// point (`registerRule`) where domain-specific rules (Van Reconciliation,
// Collection Risk, ...) can be added later without changing this engine's
// architecture. Fabricating those formulas now would violate the FSOS
// Operating Manual's instruction to never replace real business logic with
// invented AI reasoning.

export interface BusinessRuleAnnotation {
  ruleName: string;
  severity: "info" | "warning" | "violation";
  message: string;
  /** Relationship ID this annotation is about, when applicable. */
  relationshipId?: string;
}

export interface BusinessRuleContext {
  /** When applying Temporal Effective-Date Resolution, the date records must be effective as-of. Omit to skip date filtering. */
  asOfDate?: Date;
}

export type BusinessRuleFn = (result: ExecutionResult, context: BusinessRuleContext) => BusinessRuleAnnotation[];

export interface BusinessRulesResult {
  executionResult: ExecutionResult;
  /** Possibly narrowed/filtered records (e.g. after Temporal Effective-Date Resolution) — the shape callers should actually use. */
  records: readonly EntityRecord[];
  annotations: readonly BusinessRuleAnnotation[];
}
