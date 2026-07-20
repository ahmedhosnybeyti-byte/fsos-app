export type QueryExecutionErrorCode = "EMPTY_PLAN" | "INVALID_STEP_SEQUENCE" | "STEP_EXECUTION_FAILED";

export class QueryExecutionError extends Error {
  constructor(
    public readonly code: QueryExecutionErrorCode,
    public readonly planId: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class EmptyPlanError extends QueryExecutionError {
  constructor(planId: string) {
    super("EMPTY_PLAN", planId, `Execution Plan "${planId}" has no steps.`);
  }
}

export class InvalidStepSequenceError extends QueryExecutionError {
  constructor(planId: string, stepIndex: number, reason: string) {
    super("INVALID_STEP_SEQUENCE", planId, `Execution Plan "${planId}" step ${stepIndex} is invalid: ${reason}`);
  }
}

export class StepExecutionFailedError extends QueryExecutionError {
  constructor(planId: string, stepIndex: number, relationshipId: string, cause: string) {
    super("STEP_EXECUTION_FAILED", planId, `Execution Plan "${planId}" step ${stepIndex} (${relationshipId}) failed: ${cause}`);
  }
}
