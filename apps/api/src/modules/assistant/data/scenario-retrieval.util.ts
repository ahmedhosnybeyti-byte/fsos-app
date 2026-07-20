// Shared retrieval over the 153-scenario Behavior Scenario Library —
// extracted out of assistant.service.ts (where it originally lived,
// serving only the chat tool-use loop's scenario-coaching context) so
// team-performance.service.ts's rule-based "توجيه" (guidance) button can
// reuse the exact same keyword-overlap matching instead of re-implementing
// it. assistant.service.ts now imports from here too — behavior there is
// unchanged, this is a pure extraction.
import { BEHAVIOR_SCENARIOS, type BehaviorScenario } from "./scenarios";

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2),
  );
}

// Zero-infrastructure retrieval: plain token-overlap scoring, no
// embeddings/vector DB/DB table. Good enough at this corpus size (153
// short Arabic entries).
export function retrieveScenarios(query: string, limit = 5): BehaviorScenario[] {
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) return [];
  return BEHAVIOR_SCENARIOS.map((s) => {
    const sTokens = tokenize(`${s.situation} ${s.skill} ${s.mistake} ${s.correctBehavior}`);
    let overlap = 0;
    for (const t of queryTokens) if (sTokens.has(t)) overlap++;
    return { s, score: overlap };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s);
}

export function formatScenarios(scenarios: BehaviorScenario[]): string {
  if (scenarios.length === 0) return "";
  const lines = scenarios.map(
    (s) =>
      `- الموقف: ${s.situation}\n  المهارة المستهدفة: ${s.skill}\n  الخطأ الشائع: ${s.mistake}\n  حسن التصرف: ${s.correctBehavior}\n  جملة مقترحة: "${s.readyPhrase}"`,
  );
  return `\n\n## مواقف ذات صلة من مكتبة حسن التصرف (استخدمها كمرجع أسلوب، لا كنص يُقرأ حرفيًا)\n${lines.join("\n")}`;
}
