// Structured "Behavior Scenario Library" — parsed once from three source
// documents the user uploaded (Mindset_v1.md, Core_Selling_v1.md,
// Visit_Engineering_v1.md), which together make up 51 scenarios x 3 =
// 153 field-coaching situations, each following the same template used
// across all three: a situation, a targeted skill, a 3-option multiple
// choice, the common mistake, the correct behavior, and a ready-to-use
// phrase. This mirrors the "Behavior Scenario Library" referenced in the
// Master DNA v3.0 document (Part 19 — VIRE).
//
// Kept as a static in-repo dataset (no DB table, no embeddings/vector
// search) — see assistant.service.ts's retrieveScenarios() for the
// keyword-overlap retrieval that picks the few relevant scenarios for a
// given user message, instead of ever sending all 153 in one prompt.
import scenariosJson from "./scenarios.json";

export interface BehaviorScenario {
  id: string;
  category: "mindset" | "core_selling" | "visit_engineering";
  episode: number;
  episodeTitle: string;
  situationIndex: number;
  situation: string;
  skill: string;
  options: string;
  mistake: string;
  correctBehavior: string;
  readyPhrase: string;
}

export const BEHAVIOR_SCENARIOS: BehaviorScenario[] = scenariosJson as BehaviorScenario[];
