import { Injectable, Logger } from "@nestjs/common";
import type { ExecutionResult } from "./query-execution.types";
import type { BusinessRuleAnnotation, BusinessRuleContext, BusinessRuleFn, BusinessRulesResult } from "./business-rules.types";
import type { EntityRecord } from "./entity-provider.interface";

/**
 * RIE Business Rules Engine — fourth operational component of the
 * Relationship Intelligence Engine.
 *
 * Applies rules ON TOP OF an already-executed Query Execution Engine
 * result. It never re-navigates, never re-executes a plan, and never
 * decides which relationship to use — Business Rules Engine's job is
 * strictly interpretation and annotation of data Query Execution Engine
 * already produced. See business-rules.types.ts for why this engine ships
 * with only generic, document-sourced rules today rather than the full
 * catalog of named domain rules (Van Reconciliation, Collection Risk, ...)
 * referenced by the Relationship Registry's `businessRuleConsumers` field.
 */
@Injectable()
export class BusinessRulesEngineService {
  private readonly logger = new Logger(BusinessRulesEngineService.name);
  private readonly rules = new Map<string, BusinessRuleFn>();

  constructor() {
    this.registerRule("Snapshot Integrity", snapshotIntegrityRule);
    this.registerRule("Deprecated Relationship Guard", deprecatedRelationshipGuardRule);
    // Temporal Effective-Date Resolution is applied separately in apply()
    // because — unlike the two annotation-only rules above — it actually
    // narrows `records`, not just annotates them.
  }

  /** Registers (or replaces) a named rule. Domain-specific rules can be added here later without touching this engine's core logic. */
  registerRule(name: string, fn: BusinessRuleFn): void {
    this.rules.set(name, fn);
  }

  listRegisteredRules(): readonly string[] {
    return Array.from(this.rules.keys());
  }

  apply(result: ExecutionResult, context: BusinessRuleContext = {}): BusinessRulesResult {
    const annotations: BusinessRuleAnnotation[] = [];

    for (const [name, fn] of this.rules) {
      try {
        annotations.push(...fn(result, context));
      } catch (err) {
        this.logger.error(`Business rule "${name}" threw while evaluating plan "${result.plan.planId}": ${(err as Error).message}`);
        annotations.push({ ruleName: name, severity: "warning", message: `Rule "${name}" failed to evaluate: ${(err as Error).message}` });
      }
    }

    let records = result.records;
    if (context.asOfDate) {
      const { filtered, annotation } = temporalEffectiveDateResolution(result, context.asOfDate);
      records = filtered;
      if (annotation) annotations.push(annotation);
    }

    return { executionResult: result, records, annotations };
  }
}

// ------------------------------------------------------------------
// Built-in rule: Snapshot Integrity.
//
// Source: RIE Constitution vNext + Canonical Database notes on Invoices/
// Invoice Items/Van Inventory/Returns/Collections — Snapshot-typed
// relationships (e.g. Invoices.RouteID) intentionally freeze state at
// transaction time and must never be silently re-derived via a live
// Temporal relationship (Route Assignments). This rule does not attempt to
// auto-detect a substitution across steps (too fragile to be trustworthy);
// it instead makes every Snapshot-typed hop's semantics explicit on the
// output, so a caller can never mistake it for live/current data.
// ------------------------------------------------------------------
function snapshotIntegrityRule(result: ExecutionResult): BusinessRuleAnnotation[] {
  const annotations: BusinessRuleAnnotation[] = [];
  for (const step of result.stepResults) {
    const rel = step.navigationResult.relationship;
    if (rel.snapshotBehavior.isSnapshot) {
      annotations.push({
        ruleName: "Snapshot Integrity",
        severity: "info",
        relationshipId: rel.relationshipId,
        message: `"${rel.relationshipId}" (${rel.name}) is a Snapshot relationship: ${rel.snapshotBehavior.description ?? "reflects state at transaction time."} Do not merge this data with a live Temporal lookup for the same attribute.`,
      });
    }
  }
  return annotations;
}

// ------------------------------------------------------------------
// Built-in rule: Deprecated Relationship Guard.
//
// Source: Relationship Registry Specification v1.0 Versioning Strategy
// (status: Active | Deprecated, deprecatedBy). Graph Builder already warns
// at graph-build time (G15); this rule re-surfaces it at the point of
// actual consumption, which is what a caller/business-user actually sees.
// ------------------------------------------------------------------
function deprecatedRelationshipGuardRule(result: ExecutionResult): BusinessRuleAnnotation[] {
  const annotations: BusinessRuleAnnotation[] = [];
  for (const step of result.stepResults) {
    const rel = step.navigationResult.relationship;
    if (rel.status === "Deprecated") {
      annotations.push({
        ruleName: "Deprecated Relationship Guard",
        severity: "violation",
        relationshipId: rel.relationshipId,
        message: rel.deprecatedBy
          ? `"${rel.relationshipId}" (${rel.name}) is Deprecated — use "${rel.deprecatedBy}" instead.`
          : `"${rel.relationshipId}" (${rel.name}) is Deprecated with no declared replacement.`,
      });
    }
  }
  return annotations;
}

// ------------------------------------------------------------------
// Temporal Effective-Date Resolution.
//
// Source: RIE Query Planner Specification v1.0, Context Resolution (Date-
// Effective, Historical Assignment) — "What was the price of Product X on
// 2026-05-01?", "Who was responsible for Route X on 2026-03-01?". Narrows
// the final record set to rows whose StartDate/EndDate window contains
// the requested date. Best-effort header matching (StartDate/EndDate, or
// common variants) — records without a recognizable date-range pair are
// left in place with a warning rather than silently dropped.
// ------------------------------------------------------------------
function temporalEffectiveDateResolution(result: ExecutionResult, asOfDate: Date): { filtered: readonly EntityRecord[]; annotation: BusinessRuleAnnotation | null } {
  const lastStep = result.stepResults[result.stepResults.length - 1];
  if (!lastStep || !lastStep.navigationResult.relationship.timeAwareness.isTimeAware) {
    return { filtered: result.records, annotation: null };
  }

  const startKeyCandidates = ["startdate", "effectivestartdate", "validfrom"];
  const endKeyCandidates = ["enddate", "effectiveenddate", "validto"];

  const findKey = (record: EntityRecord, candidates: string[]): string | null => {
    for (const key of Object.keys(record)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (candidates.includes(normalized)) return key;
    }
    return null;
  };

  let unresolved = 0;
  const filtered = result.records.filter((record) => {
    const startKey = findKey(record, startKeyCandidates);
    const endKey = findKey(record, endKeyCandidates);
    if (!startKey) {
      unresolved++;
      return true; // no recognizable window — do not silently drop
    }
    const start = Date.parse(String(record[startKey]));
    const end = endKey && record[endKey] != null && record[endKey] !== "" ? Date.parse(String(record[endKey])) : Infinity;
    if (Number.isNaN(start)) {
      unresolved++;
      return true;
    }
    const asOf = asOfDate.getTime();
    return asOf >= start && asOf <= (Number.isNaN(end) ? Infinity : end);
  });

  const annotation: BusinessRuleAnnotation = {
    ruleName: "Temporal Effective-Date Resolution",
    severity: unresolved > 0 ? "warning" : "info",
    message:
      unresolved > 0
        ? `Filtered to records effective as of ${asOfDate.toISOString().slice(0, 10)}; ${unresolved} record(s) had no recognizable StartDate/EndDate and were kept unfiltered.`
        : `Filtered to records effective as of ${asOfDate.toISOString().slice(0, 10)} (${filtered.length} of ${result.records.length} records matched).`,
  };

  return { filtered, annotation };
}
