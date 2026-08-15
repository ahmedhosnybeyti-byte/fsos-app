import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node 24's focused test runner loads this TypeScript source directly.
import { buildContextualDiagnosis, type DiagnosisContext } from "./contextual-diagnosis.ts";

const metric = (current: number, benchmark: number) => ({ current, benchmark, growthPct: ((current - benchmark) / benchmark) * 100, sparkline: [] });
const base = (entityId: string): Omit<DiagnosisContext, "selectedKpi" | "currentKpiValue" | "comparisonKpiValue"> => ({
  entityId, entityType: "rep", entityName: entityId, currentPeriod: "2026-08-01 → 2026-08-15", comparisonPeriod: "2026-07-01 → 2026-07-15",
  relatedKpis: { sales: metric(80, 100), collections: metric(70, 100), invoices: metric(75, 100), customers: metric(60, 100), skus: metric(90, 100), returns: metric(18, 10) },
});
const diagnose = (entityId: string, selectedKpi: DiagnosisContext["selectedKpi"], current: number, previous: number) => buildContextualDiagnosis({ ...base(entityId), selectedKpi, currentKpiValue: current, comparisonKpiValue: previous });

test("same rep: Sales, Invoices, Customers and Returns have distinct evidence, cause, decision and actions", () => {
  const sales = diagnose("rep-a", "sales", 80, 100);
  const invoices = diagnose("rep-a", "invoices", 75, 100);
  const customers = diagnose("rep-a", "customers", 60, 100);
  const returns = diagnose("rep-a", "returns", 18, 10);
  const reports = [sales, invoices, customers, returns];
  assert.equal(new Set(reports.map((x) => x.evidence[0])).size, 4);
  assert.equal(new Set(reports.map((x) => x.probableCause)).size, 4);
  assert.equal(new Set(reports.map((x) => x.decision)).size, 4);
  assert.equal(new Set(reports.map((x) => x.actions.join("|"))).size, 4);
});

test("same KPI varies by entity data rather than reusing a rep diagnosis", () => {
  const repA = diagnose("rep-a", "sales", 80, 100);
  const repB = buildContextualDiagnosis({ ...base("rep-b"), selectedKpi: "sales", currentKpiValue: 130, comparisonKpiValue: 100, relatedKpis: { sales: metric(130, 100), collections: metric(120, 100), invoices: metric(140, 100), customers: metric(125, 100), skus: metric(120, 100), returns: metric(8, 10) } });
  assert.notEqual(repA.evidence.join("|"), repB.evidence.join("|"));
  assert.notEqual(repA.decision, repB.decision);
});

test("all eight KPI paths produce KPI-specific diagnosis, including target context", () => {
  const standard = (["sales", "collections", "invoices", "customers", "skus", "returns"] as const).map((selectedKpi) => diagnose("rep-a", selectedKpi, base("rep-a").relatedKpis[selectedKpi].current!, base("rep-a").relatedKpis[selectedKpi].benchmark!));
  const target = { key: "SalesTarget", label: "Sales Target", monthlyTarget: 200, actualMtd: 80, targetMtd: 120, aheadBehind: -40, progressPct: 66.7, remainingMonthlyTarget: 120, requiredDailyVelocity: 10, runRateForecast: 160, primary: true, unit: "currency" as const };
  const collectionTarget = { ...target, key: "CollectionTarget", label: "Collection Target", actualMtd: 70, targetMtd: 110, aheadBehind: -40 };
  const targets = [buildContextualDiagnosis({ ...base("rep-a"), selectedKpi: "target:SalesTarget", currentKpiValue: target.actualMtd, comparisonKpiValue: target.targetMtd, targetData: target }), buildContextualDiagnosis({ ...base("rep-a"), selectedKpi: "target:CollectionTarget", currentKpiValue: collectionTarget.actualMtd, comparisonKpiValue: collectionTarget.targetMtd, targetData: collectionTarget })];
  assert.equal(standard.length + targets.length, 8);
  assert.equal(new Set([...standard, ...targets].map((x) => x.decision)).size, 8);
  assert.ok(targets.every((x) => x.evidence.at(0)?.includes("الهدف حتى اليوم")));
});
