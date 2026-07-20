import type { ExecutionResult } from "./query-execution.types";
import type { BusinessRuleAnnotation, BusinessRuleContext } from "./business-rules.types";
import type { EntityRecord } from "./entity-provider.interface";

// RIE Integration Layer — the single result shape every future FSOS Engine
// (Customer 360, Route Intelligence, Demand Intelligence, SGI, Sales Team
// 360, Murshidak, Executive Studio, ...) consumes when it calls RieFacade.
// Combines Query Execution Engine's execution trace with Business Rules
// Engine's annotations into one object, so a consuming Engine never needs
// to know that two internal components were involved.

export interface RieQueryResult {
  success: boolean;
  finalEntity: string;
  records: readonly EntityRecord[];
  annotations: readonly BusinessRuleAnnotation[];
  warnings: readonly string[];
  errors: readonly string[];
  /** Full execution trace, kept for debugging/observability — most consumers only need `records`/`annotations`. */
  executionResult: ExecutionResult;
}

export interface RieQueryOptions {
  businessRuleContext?: BusinessRuleContext;
}
