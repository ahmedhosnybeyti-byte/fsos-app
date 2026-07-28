// FDA Local Decision Layer — Rule Engine (generic, platform-level).
//
// This is a fully generic matching/priority/execution/rendering engine. It
// knows nothing about Visit Copilot, Smart Assistant, or any specific
// business domain — that knowledge lives entirely in each assistant's own
// Rule Registry (e.g. visit-copilot.rules.ts), which this engine consumes
// as data.
//
// Per explicit architectural direction: keep ONE platform Rule Engine. What
// differs per assistant is only the registered rule set (the Registry), not
// the engine itself. This is what lets a new assistant be added as just a
// new Registry — no engine changes, no duplicated matching/priority logic.
//
// Callers never touch matchRule/regex/priority directly. The single entry
// point is LocalDecisionEngine.execute({ message, facts, registry }) — the
// engine owns the entire decision: which rule (if any) matches, in what
// order, and how the result is rendered to a string via the Template
// Builder. If nothing matches, execute() returns null and the caller falls
// through to AI unchanged, exactly as before.

import type { LocalAnswer, LocalSection } from "./template-builder";
import { renderLocalAnswer, renderLocalSections } from "./template-builder";

// A rule's answer can be a single LocalAnswer (one fact) or a full set of
// LocalSections (a multi-section reply like Customer 360). The engine
// renders either shape through the same Template Builder, so the two never
// look different to the end user.
export type RuleResult<TFacts> = { kind: "answer"; value: LocalAnswer } | { kind: "sections"; title: string; value: LocalSection[] };

export interface RuleDefinition<TFacts> {
  // Stable identifier for logging/debugging — not shown to the user.
  id: string;
  pattern: RegExp;
  // Lower number = higher priority. Ties keep registration order (stable
  // sort). Optional — rules default to their position in the registry
  // array, matching the previous "first match wins, in array order" rule.
  priority?: number;
  answer: (facts: TFacts) => RuleResult<TFacts> | null;
}

// A Rule Registry is nothing more than an ordered list of rule definitions
// for one assistant's Facts shape. Each assistant owns and exports its own.
export type RuleRegistry<TFacts> = RuleDefinition<TFacts>[];

export interface LocalDecisionInput<TFacts> {
  message: string;
  facts: TFacts;
  registry: RuleRegistry<TFacts>;
}

function sortByPriority<TFacts>(registry: RuleRegistry<TFacts>): RuleRegistry<TFacts> {
  return registry.map((rule, index) => ({ rule, index })).sort((a, b) => (a.rule.priority ?? a.index) - (b.rule.priority ?? b.index) || a.index - b.index).map(({ rule }) => rule);
}

// The single entry point every assistant's Service calls. The Service
// supplies only message + facts + registry — it never sees matching,
// priority, or regex details; all of that stays inside this function.
export const LocalDecisionEngine = {
  execute<TFacts>({ message, facts, registry }: LocalDecisionInput<TFacts>): string | null {
    const ordered = sortByPriority(registry);
    for (const rule of ordered) {
      if (!rule.pattern.test(message)) continue;
      const result = rule.answer(facts);
      if (result === null) continue;
      if (result.kind === "answer") return renderLocalAnswer(result.value);
      return renderLocalSections(result.title, result.value);
    }
    return null;
  },
};
