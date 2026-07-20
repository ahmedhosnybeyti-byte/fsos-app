import type { SgiContext, SgiContextSource, SgiSituation } from "./types";

// The reusable SGIContext handoff mechanism (final Phase 1 architectural
// piece — see packages/schemas/src/sgi-context.schemas.ts for the type's
// full rationale). Any screen that has a SgiSituation can build a context
// with toSgiContext() and hand it to any other screen via a generic
// ?context=... deep link — today only Sales Growth -> Assistant exists,
// but the mechanism itself (build -> encode -> navigate -> decode -> open
// already-grounded) is deliberately generic, not specific to those two
// screens, so Customer 360 / Daily Mission / Visit Planning / Voice can
// reuse it unchanged later (as either producer or consumer).

// Builds a context object from an already-computed SgiSituation — pure
// reshaping of fields SgiService produced, no new decisions made here.
// Phase 1 only ever has one recommendation sentence per situation (no
// multi-step Playbooks yet — see docs/SGI_ROADMAP.md), so executionPlan is
// a single-element array; a future multi-step plan from SgiService would
// slot in here without changing this function's shape.
export function toSgiContext(situation: SgiSituation, source: SgiContextSource, timestamp: string): SgiContext {
  return {
    contextVersion: 1,
    source,
    recommendationId: situation.id,
    situationType: situation.type,
    severity: situation.severity,
    entityType: situation.entityType,
    entityId: situation.entityKey,
    entityName: situation.entityLabel,
    title: situation.title,
    reasoning: situation.detail,
    executionPlan: [situation.recommendation],
    metricValue: situation.metricValue,
    metricValuePrior: situation.metricValuePrior,
    periodMonth: situation.periodMonth,
    timestamp,
  };
}

export function encodeSgiContext(context: SgiContext): string {
  return encodeURIComponent(JSON.stringify(context));
}

// Structural (duck-typed) validation, not a full schema — the frontend
// doesn't ship zod to the client bundle for this. Malformed/tampered
// query params (or an old link from a future format) return null rather
// than throwing, so the receiving screen can fall back to a normal empty
// state instead of crashing.
export function decodeSgiContext(raw: string | null | undefined): SgiContext | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as SgiContext).contextVersion === 1 &&
      typeof (parsed as SgiContext).recommendationId === "string" &&
      typeof (parsed as SgiContext).title === "string" &&
      Array.isArray((parsed as SgiContext).executionPlan)
    ) {
      return parsed as SgiContext;
    }
    return null;
  } catch {
    return null;
  }
}

// The generic deep link every module should use to open the Assistant
// already grounded in a specific SGI decision. Kept as one function so the
// URL shape only has to change in one place if it ever does.
export function buildAssistantDeepLink(context: SgiContext): string {
  return `/dashboard/assistant?context=${encodeSgiContext(context)}`;
}

// The Assistant's opening message when it's launched from a context deep
// link — phrased once here so every producer (today: Sales Growth) gets
// the same framing for free, and the Assistant itself never has to guess
// how to phrase "continue this discussion."
export function sgiContextToMessage(context: SgiContext): string {
  const steps = context.executionPlan.map((step, i) => (context.executionPlan.length > 1 ? `${i + 1}. ${step}` : step)).join("\n");
  return `عايز أناقش الموقف ده:\n\n"${context.title}"\n${context.reasoning}\nالخطوة المقترحة:\n${steps}\n\nاشرحلي أكتر وساعدني أقرر الخطوة الجاية.`;
}
