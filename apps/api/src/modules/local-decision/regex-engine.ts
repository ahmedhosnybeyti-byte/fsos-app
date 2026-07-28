// FDA Local Decision Layer — Regex Engine.
//
// Extracts structured identifiers (a customer code) from free-text chat
// input WITHOUT any AI call. This is the cheapest possible step in the
// "Cheapest Path Wins" chain — a plain regex match, nothing more. If it
// finds nothing, callers fall through to the Dictionary Engine (name
// matching) and eventually the Rule Engine / AI, unchanged.
//
// Customer codes in this dataset are free-text (imported from client
// Excel — see RIE Canonical Entities), so there is no single universal
// pattern. This matches the two shapes that already appear elsewhere in
// the codebase's own inputs (visit-copilot.controller.ts's :customerCode
// param, the briefing screen's selectedCode): a short alphanumeric token,
// optionally with - or _ separators, 3-20 characters, always containing at
// least one digit (distinguishes a code like "C-1023" from a plain word).
//
// Platform-level module: this is a shared FDA engine, not owned by any one
// assistant. Any assistant (Visit Copilot, Smart Assistant, future ones)
// with access to business data may use it.

const CUSTOMER_CODE_PATTERN = /\b([A-Za-z]{0,4}[-_]?\d{2,}[A-Za-z0-9_-]*)\b/g;

export interface RegexExtractionResult {
  candidateCodes: string[];
}

// Pulls every token that looks like a customer code out of the message.
// Returns candidates in order of appearance — callers try each against the
// real Customers dataset (via the Dictionary Engine) until one resolves.
export function extractCandidateCodes(message: string): RegexExtractionResult {
  const matches = message.matchAll(CUSTOMER_CODE_PATTERN);
  const candidateCodes: string[] = [];
  for (const m of matches) {
    const token = m[1];
    if (token && !candidateCodes.includes(token)) candidateCodes.push(token);
  }
  return { candidateCodes };
}
