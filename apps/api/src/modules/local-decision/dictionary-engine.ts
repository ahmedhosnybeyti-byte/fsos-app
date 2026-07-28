// FDA Local Decision Layer — Dictionary Engine.
//
// Resolves a customer mentioned in free-text chat (by code OR by name)
// against the REAL company data already loaded via RieFacade — never a
// fuzzy guess, never invented. This is what lets "context switching" (the
// user typing "افتح العميل 1023" or "وماذا عن شركة الأمل؟" mid-chat) happen
// without an AI call: Regex Engine finds code-shaped tokens, this engine
// checks them (and a plain substring match on CustomerName) against the
// customer rows the caller already fetched for the current request —
// exactly the same rows Permission Check (hierarchy scoping) already
// narrowed, so a match here is automatically inside the requesting rep's
// visible scope. No new RIE call, no new permission logic.
//
// Platform-level module: this is a shared FDA engine, not owned by any one
// assistant. Any assistant (Visit Copilot, Smart Assistant, future ones)
// with access to business data may use it.

import type { EntityRecord } from "../rie/entity-provider.interface";
import { extractCandidateCodes } from "./regex-engine";

export interface ResolvedCustomer {
  customerCode: string;
  customerName: string;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

// Tries an exact code match first (cheapest, least ambiguous), then a
// substring match on CustomerName. Returns null if the message doesn't
// clearly name a different customer than the one already in scope.
export function resolveMentionedCustomer(message: string, customers: readonly EntityRecord[]): ResolvedCustomer | null {
  const { candidateCodes } = extractCandidateCodes(message);
  for (const code of candidateCodes) {
    const hit = customers.find((row) => normalize(String(row.CustomerCode ?? "")) === normalize(code));
    if (hit) return { customerCode: String(hit.CustomerCode), customerName: String(hit.CustomerName ?? hit.CustomerCode) };
  }

  // Name matching only kicks in for a reasonably specific phrase (avoids a
  // short common word accidentally matching a customer name substring).
  const messageLower = normalize(message);
  if (messageLower.length < 4) return null;
  let best: ResolvedCustomer | null = null;
  for (const row of customers) {
    const name = String(row.CustomerName ?? "").trim();
    if (name.length < 4) continue;
    if (messageLower.includes(normalize(name))) {
      // Prefer the longest name match (most specific) if more than one
      // customer name happens to be a substring of the message.
      if (!best || name.length > best.customerName.length) {
        best = { customerCode: String(row.CustomerCode), customerName: name };
      }
    }
  }
  return best;
}
