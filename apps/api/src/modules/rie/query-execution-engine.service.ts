import { Injectable, Logger } from "@nestjs/common";
import { GraphBuilderService } from "./graph-builder.service";
import { NavigationEngineService } from "./navigation-engine.service";
import type { ExecutionPlan, ExecutionPlanStep, ExecutionResult, ExecutionStepResult } from "./query-execution.types";
import type { EntityRecord } from "./entity-provider.interface";
import type { NavigationResult, NavigationWarning } from "./navigation.types";
import { EmptyPlanError, InvalidStepSequenceError, StepExecutionFailedError } from "./query-execution-engine.errors";
import { UnknownRelationshipError } from "./navigation-engine.errors";

/**
 * RIE Query Execution Engine — third operational component of the
 * Relationship Intelligence Engine.
 *
 * Sole responsibility: carry out an already-built Execution Plan (see
 * query-execution.types.ts, mirroring FSOS RIE Query Planner Specification
 * v1.0 section 8) by driving Navigation Engine one step at a time and
 * threading each step's resulting records into the next step's anchor. It
 * never decides which relationship a step should use — that decision is
 * already recorded in the plan by whatever built it (Query Planner, or a
 * caller constructing a plan directly). It never applies business rules —
 * that is Business Rules Engine's job, downstream of this engine's output.
 *
 * Depends only on GraphBuilderService (to validate the plan's step
 * sequence against real relationship source/target entities before
 * executing anything) and NavigationEngineService (to actually traverse
 * each step).
 */
@Injectable()
export class QueryExecutionEngineService {
  private readonly logger = new Logger(QueryExecutionEngineService.name);

  constructor(
    private readonly graphBuilder: GraphBuilderService,
    private readonly navigationEngine: NavigationEngineService,
  ) {}

  async execute(plan: ExecutionPlan): Promise<ExecutionResult> {
    if (plan.steps.length === 0) throw new EmptyPlanError(plan.planId);

    this.validateStepSequence(plan);

    const stepResults: ExecutionStepResult[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    let currentRecords: readonly EntityRecord[] = [];
    let currentAnchorRecord = plan.startingAnchor?.record;
    let currentAnchorValue = plan.startingAnchor?.value;
    let finalEntity = plan.startingEntity;
    let success = true;

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i]!;
      try {
        const anchors: (EntityRecord | undefined)[] = currentRecords.length > 0 ? [...currentRecords] : [currentAnchorRecord];

        const hopResults: NavigationResult[] = [];
        for (const anchor of anchors) {
          const navResult = await this.navigationEngine.navigate({
            relationshipId: step.relationshipId,
            direction: step.direction,
            context: plan.appliedContext,
            sourceRecord: anchor,
            anchorValue: anchor === undefined ? currentAnchorValue : undefined,
            filters: step.filters,
            navigationType: step.navigationType,
          });
          hopResults.push(navResult);
        }

        const merged = mergeNavigationResults(hopResults);
        stepResults.push({ step, navigationResult: merged });
        warnings.push(...merged.warnings.map((w) => `[step ${i}: ${step.relationshipId}] ${w.code}: ${w.message}`));

        currentRecords = merged.records;
        currentAnchorRecord = undefined;
        currentAnchorValue = undefined;
        finalEntity = merged.resolvedEntity;
        if (!merged.available) success = false;
      } catch (err) {
        const cause = err instanceof Error ? err.message : String(err);
        errors.push(new StepExecutionFailedError(plan.planId, i, step.relationshipId, cause).message);
        success = false;
        break;
      }
    }

    const shapedRecords = this.shapeResult(plan, currentRecords, warnings);

    return {
      plan,
      success,
      finalEntity,
      records: shapedRecords,
      stepResults,
      warnings,
      errors,
    };
  }

  /**
   * Verifies every step's expected source entity matches either the plan's
   * startingEntity (step 0) or the previous step's resolved entity (step
   * i>0), and that every relationshipId actually exists in the Validated
   * Relationship Graph. Runs entirely before any navigation happens — a
   * malformed plan fails fast rather than partially executing.
   */
  private validateStepSequence(plan: ExecutionPlan): void {
    let expectedSource = plan.startingEntity;
    plan.steps.forEach((step: ExecutionPlanStep, index: number) => {
      const edge = this.graphBuilder.getRelationship(step.relationshipId);
      if (!edge) throw new UnknownRelationshipError(step.relationshipId);
      const rel = edge.relationship;

      const stepExpectedSource = step.direction === "forward" ? rel.sourceEntity : rel.targetEntity;
      const stepResolvedEntity = step.direction === "forward" ? rel.targetEntity : rel.sourceEntity;

      if (stepExpectedSource !== expectedSource) {
        throw new InvalidStepSequenceError(
          plan.planId,
          index,
          `expects source entity "${stepExpectedSource}" but the plan is at "${expectedSource}" after the previous step.`,
        );
      }

      expectedSource = stepResolvedEntity;
    });
  }

  /**
   * Structural shaping only — enforces the plan's declared
   * expectedResultType shape (single record, sorted timeline, etc). Never
   * computes derived/business values (sums, reconciliation, health scores)
   * — that is Business Rules Engine's responsibility, applied on top of
   * this engine's output.
   */
  private shapeResult(plan: ExecutionPlan, records: readonly EntityRecord[], warnings: string[]): readonly EntityRecord[] {
    switch (plan.expectedResultType) {
      case "SingleRecord": {
        if (records.length > 1) {
          warnings.push(`Plan "${plan.planId}" declared expectedResultType "SingleRecord" but ${records.length} records matched — returning the first.`);
        }
        return records.length > 0 ? [records[0]!] : [];
      }
      case "Timeline": {
        if (!plan.timelineDateField) {
          warnings.push(`Plan "${plan.planId}" declared expectedResultType "Timeline" but no timelineDateField was provided — returning unsorted.`);
          return records;
        }
        return sortByDateField(records, plan.timelineDateField);
      }
      case "RecordSet":
      case "Aggregate":
      case "ComparisonSet":
      default:
        // "Aggregate"/"ComparisonSet" are handed back as the raw contributing
        // record set — Query Execution Engine does not compute the aggregate
        // or comparison itself (Business Rules Engine's job).
        return records;
    }
  }
}

function mergeNavigationResults(results: readonly NavigationResult[]): NavigationResult {
  const first = results[0];
  if (!first) {
    // Defensive only — execute() always calls navigate() at least once per
    // step (even with a single `undefined` anchor), so `results` is never
    // actually empty in practice.
    throw new Error("mergeNavigationResults called with an empty results array.");
  }
  const records = results.flatMap((r) => r.records);
  const warnings: NavigationWarning[] = results.flatMap((r) => r.warnings);
  return {
    relationship: first.relationship,
    direction: first.direction,
    resolvedEntity: first.resolvedEntity,
    records,
    available: results.every((r) => r.available),
    warnings,
  };
}

function sortByDateField(records: readonly EntityRecord[], field: string): readonly EntityRecord[] {
  const normalized = field.toLowerCase().replace(/[^a-z0-9]/g, "");
  const resolveField = (r: EntityRecord): unknown => {
    const key = Object.keys(r).find((k) => k.toLowerCase().replace(/[^a-z0-9]/g, "") === normalized);
    return key ? r[key] : undefined;
  };
  return [...records].sort((a, b) => {
    const da = Date.parse(String(resolveField(a) ?? ""));
    const db = Date.parse(String(resolveField(b) ?? ""));
    if (Number.isNaN(da) && Number.isNaN(db)) return 0;
    if (Number.isNaN(da)) return 1;
    if (Number.isNaN(db)) return -1;
    return da - db;
  });
}
