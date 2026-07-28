// Entity Resolution — Employee / Salesperson resolver.
//
// Backed by the real Employees Canonical Entity (RIE/Excel-backed, fields
// per IMPORT-EMPLOYEES-v1.0: EmployeeID, EmployeeName, Email, Role,
// DirectManagerID, BranchID, Status). Mention matching follows the same
// exact-code-then-name-substring pattern as the Customer resolver (see
// dictionary-engine.ts) — kept separate rather than generalized further
// since Employees' identifying fields (EmployeeID vs EmployeeName) differ
// from Customer's (CustomerCode vs CustomerName) only in naming, and this
// stays simple/explicit per the Engine Independence rule.
//
// Self-context is real here: Employees.Email is a genuine, required field
// (per the import template) matched against AuthenticatedUser.email — this
// is the same match CanonicalHierarchyResolverService already performs for
// row-level hierarchy scoping, reused here for entity resolution instead.

import type { EntityRecord } from "../../rie/entity-provider.interface";
import { extractCandidateCodes } from "../regex-engine";
import type { EntityResolver, ResolvedEntity } from "../entity-resolution";

export interface EmployeeResolverAuth {
  email: string;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function toResolvedEmployee(row: EntityRecord): ResolvedEntity {
  return { entityType: "Employee", id: String(row.EmployeeID), label: String(row.EmployeeName ?? row.EmployeeID) };
}

export function buildEmployeeResolver(employees: readonly EntityRecord[]): EntityResolver<EmployeeResolverAuth> {
  return {
    entityType: "Employee",
    findMention: async (message: string): Promise<ResolvedEntity | null> => {
      const { candidateCodes } = extractCandidateCodes(message);
      for (const code of candidateCodes) {
        const hit = employees.find((row) => normalize(String(row.EmployeeID ?? "")) === normalize(code));
        if (hit) return toResolvedEmployee(hit);
      }

      const messageLower = normalize(message);
      if (messageLower.length < 4) return null;
      let best: EntityRecord | null = null;
      let bestNameLength = 0;
      for (const row of employees) {
        const name = String(row.EmployeeName ?? "").trim();
        if (name.length < 4) continue;
        if (messageLower.includes(normalize(name)) && name.length > bestNameLength) {
          best = row;
          bestNameLength = name.length;
        }
      }
      return best ? toResolvedEmployee(best) : null;
    },
    resolveSelfOrUniqueScope: async (auth: EmployeeResolverAuth): Promise<ResolvedEntity | null> => {
      const hit = employees.find((row) => normalize(String(row.Email ?? "")) === normalize(auth.email));
      return hit ? toResolvedEmployee(hit) : null;
    },
    clarificationMessage: "محتاج أعرف تقصد أي مندوب/موظف بالظبط — اذكر اسمه أو كوده.",
  };
}
