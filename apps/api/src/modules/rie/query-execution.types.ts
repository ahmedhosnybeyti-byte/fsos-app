import type { EntityFieldFilter, EntityQueryContext, EntityRecord } from "./entity-provider.interface";
import type { NavigationDirection, NavigationResult, NavigationWarning } from "./navigation.types";
import type { NavigationType } from "./relationship-registry.types";

// RIE Query Execution Engine — Execution Plan contracts.
//
// Mirrors "Execution Plan Model" (FSOS RIE Query Planner Specification
// v1.0, section 8): Starting Entity / Navigation Path / Selected
// Relationships / Applied Context / Filters / Expected Result Type. Query
// Planner (not yet implemented as code — see the roadmap discussion) is
// responsible for PRODUCING an ExecutionPlan from a natural-language or
// structured intent. Query Execution Engine's sole responsibility is to
// CARRY OUT an already-built plan, step by step, via Navigation Engine —
// it never decides which relationship to use, it only executes the
// decision already recorded in the plan.

export type ExpectedResultType = "SingleRecord" | "RecordSet" | "Timeline" | "Aggregate" | "ComparisonSet";

export interface ExecutionPlanStep {
  relationshipId: string;
  direction: NavigationDirection;
  navigationType?: NavigationType;
  /** Extra filters applied at this step, beyond the join filter Navigation Engine derives automatically from the previous step's records. */
  filters?: readonly EntityFieldFilter[];
}

export interface ExecutionPlanAnchor {
  record?: EntityRecord;
  value?: unknown;
}

export interface ExecutionPlan {
  /** Caller-supplied identifier for tracing/logging — not interpreted. */
  planId: string;
  startingEntity: string;
  startingAnchor?: ExecutionPlanAnchor;
  steps: readonly ExecutionPlanStep[];
  appliedContext: EntityQueryContext;
  expectedResultType: ExpectedResultType;
  /** Optional field name used only when expectedResultType === "Timeline", to sort the final record set. */
  timelineDateField?: string;
}

export interface ExecutionStepResult {
  step: ExecutionPlanStep;
  navigationResult: NavigationResult;
}

export interface ExecutionResult {
  plan: ExecutionPlan;
  success: boolean;
  finalEntity: string;
  records: readonly EntityRecord[];
  stepResults: readonly ExecutionStepResult[];
  warnings: readonly string[];
  errors: readonly string[];
}
