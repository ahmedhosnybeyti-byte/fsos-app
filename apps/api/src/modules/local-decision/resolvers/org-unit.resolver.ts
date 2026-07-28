// Entity Resolution — Branch / Region resolvers.
//
// Backed by the real OrgUnitsService (Prisma-backed org_units table), not
// RIE/Excel — Branches and Regions are Canonical Entities per
// canonical-entities.data.ts but have no uploaded dataset behind them today
// (ExcelDatasetEntityProvider reports them NO_DATA_SOURCE_MAPPED); the
// genuine, working data path for them is CompaniesModule's OrgUnitsService.
// This resolver's builder takes the company's units (already fetched once
// per request via orgUnitsService.list(companyId, {type})) — the exact same
// pattern Customer/Employees resolvers use with their own pre-fetched rows
// — so explicit-mention (step 1) and history-mention (step 2) both work for
// real, not just self-context (step 3).
//
// Self-context honesty: AuthenticatedUser.orgUnitId is only populated when
// a COMPANY_ADMIN has explicitly assigned a user to an org unit via the
// Team screen (confirmed: never set automatically at signup/user
// creation). For most users today this will be null, and
// resolveSelfOrUniqueScope correctly returns null in that case — falling
// through to step 4 (ask for clarification), never guessing. There is also
// no existing role-based scoping for OrgUnit reads (unlike Customers/
// Invoices/Visits, which get real RouteID-based hierarchy filtering) — so
// "unique entity by permission scope" is NOT implemented here; inventing
// that scoping was explicitly out of bounds for this pass.

import { extractCandidateCodes } from "../regex-engine";
import type { EntityResolver, ResolvedEntity } from "../entity-resolution";

export interface OrgUnitResolverAuth {
  orgUnitId: string | null;
}

export interface OrgUnitLike {
  id: string;
  code: string;
  name: string;
  type: string;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function toResolvedOrgUnit(entityType: string, unit: OrgUnitLike): ResolvedEntity {
  return { entityType, id: unit.id, label: unit.name };
}

function findMentionedUnit(message: string, units: readonly OrgUnitLike[]): OrgUnitLike | null {
  const { candidateCodes } = extractCandidateCodes(message);
  for (const code of candidateCodes) {
    const hit = units.find((u) => normalize(u.code) === normalize(code));
    if (hit) return hit;
  }

  const messageLower = normalize(message);
  if (messageLower.length < 4) return null;
  let best: OrgUnitLike | null = null;
  for (const u of units) {
    const name = u.name.trim();
    if (name.length < 4) continue;
    if (messageLower.includes(normalize(name)) && (!best || name.length > best.name.length)) {
      best = u;
    }
  }
  return best;
}

// entityType is the Entity Resolution label shown to callers/logs
// ("Branch"/"Region"); `units` must already be filtered to that one OrgUnit
// type (e.g. via orgUnitsService.list(companyId, {type: "BRANCH"})) — this
// function does not filter by type itself.
function buildOrgUnitResolver(units: readonly OrgUnitLike[], entityType: string, clarificationMessage: string): EntityResolver<OrgUnitResolverAuth> {
  return {
    entityType,
    findMention: async (message: string): Promise<ResolvedEntity | null> => {
      const hit = findMentionedUnit(message, units);
      return hit ? toResolvedOrgUnit(entityType, hit) : null;
    },
    resolveSelfOrUniqueScope: async (auth: OrgUnitResolverAuth): Promise<ResolvedEntity | null> => {
      if (!auth.orgUnitId) return null;
      const unit = units.find((u) => u.id === auth.orgUnitId);
      // Not found here means the user's org unit isn't of this type (e.g.
      // it's a Region while resolving Branch, or vice versa) — resolves to
      // "no self-context for this entity type", not an error.
      return unit ? toResolvedOrgUnit(entityType, unit) : null;
    },
    clarificationMessage,
  };
}

export function buildBranchResolver(branches: readonly OrgUnitLike[]): EntityResolver<OrgUnitResolverAuth> {
  return buildOrgUnitResolver(branches, "Branch", "محتاج أعرف تقصد أي فرع بالظبط — اذكر اسمه.");
}

export function buildRegionResolver(regions: readonly OrgUnitLike[]): EntityResolver<OrgUnitResolverAuth> {
  return buildOrgUnitResolver(regions, "Region", "محتاج أعرف تقصد أي منطقة بالظبط — اذكر اسمها.");
}
