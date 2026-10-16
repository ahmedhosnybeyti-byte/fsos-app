import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  candidateContact,
  candidateDescription,
  candidateExternalKey,
  candidateFingerprint,
  candidateWhyRelevant,
  deterministicCompanyOpportunityId,
  deterministicOpportunityId,
  isImportableWaterEvent,
  opportunityConfidence,
  opportunityLocationKind,
  parseIsoDateOnly,
  reviewedCandidateMatch,
  summarizeWaterEventManifest,
  validateWaterEventManifest,
  waterEventPriority,
  type WaterEventCandidate,
  type WaterEventManifest,
} from "./water-event-first";

type Args = { apply: boolean; companyId: string | null; manifestPath: string };

function parseArgs(argv: string[]): Args {
  const valueAfter = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] ?? null : null;
  };
  return {
    apply: argv.includes("--apply"),
    companyId: valueAfter("--company-id"),
    manifestPath: resolve(valueAfter("--manifest") ?? "prisma/data/water-event-first-20261016.json"),
  };
}

function revisionId(candidate: WaterEventCandidate, changeType: string): string {
  return `water-event-revision-${createHash("sha256").update(`${candidate.candidate_id}:${changeType}:${candidateFingerprint(candidate)}`).digest("hex").slice(0, 24)}`;
}

function metadata(candidate: WaterEventCandidate): Prisma.InputJsonObject {
  return {
    candidateId: candidate.candidate_id,
    candidateKeyHint: candidate.candidate_key_hint,
    sourceFileSheetRow: candidate.source_file_sheet_row,
    reviewGate: candidate.review_gate,
    evidenceLabel: candidate.evidence_label_from_source,
    venueLocationSourceUrl: candidate.venue_location_source_url,
    originalResearchDate: candidate.research_date,
    sourceFingerprint: candidateFingerprint(candidate),
  } as Prisma.InputJsonObject;
}

function jsonObject(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function marketData(candidate: WaterEventCandidate, verified: boolean) {
  const contact = candidateContact(candidate);
  const start = parseIsoDateOnly(candidate.start_date_raw);
  if (!start) throw new Error(`${candidate.candidate_id}: invalid start date`);
  return {
    externalKey: candidateExternalKey(candidate),
    vertical: "WATER",
    opportunityType: "EVENT" as const,
    title: candidate.title,
    organization: candidate.venue_name ?? "منظم الفعالية",
    eventCategory: candidate.event_category,
    description: candidateDescription(candidate),
    whyRelevant: candidateWhyRelevant(candidate),
    country: "المملكة العربية السعودية",
    region: "منطقة مكة المكرمة",
    city: candidate.city,
    location: candidate.venue_name,
    venueName: candidate.venue_name,
    venueAddress: candidate.venue_address,
    locationKind: opportunityLocationKind(candidate),
    mapUrl: candidate.maps_search_url,
    mapLinkKind: candidate.maps_link_kind,
    publishedAt: parseIsoDateOnly(candidate.research_date),
    opportunityDate: start,
    eventEndAt: parseIsoDateOnly(candidate.end_date_raw),
    dateLabel: candidate.end_date_raw ? `${candidate.start_date_raw} – ${candidate.end_date_raw}` : candidate.start_date_raw,
    status: "OPEN" as const,
    confidence: opportunityConfidence(candidate),
    priorityRank: waterEventPriority(candidate),
    reviewStatus: verified ? "VERIFIED" as const : "NEEDS_VERIFICATION" as const,
    reviewNote: candidate.review_note,
    waterDemandStatus: candidate.water_order_status,
    contactRole: candidate.buyer_or_contact_role,
    nextAction: candidate.sales_approach,
    phone: contact.phone,
    whatsapp: contact.whatsapp,
    email: contact.email,
    contactUrl: candidate.venue_location_source_url,
    sourceUrl: candidate.event_source_url,
    secondarySourceUrl: candidate.verification_url,
    sourceName: "Event-First Water Research 2026-10-16",
    sourceMetadata: metadata(candidate),
    lastVerifiedAt: parseIsoDateOnly(candidate.research_date)!,
  };
}

type BaselineClient = Pick<Prisma.TransactionClient, "companyOpportunity" | "opportunityRadarPreference" | "prospectVisitIntent">;

async function baseline(prisma: BaselineClient, companyId: string, opportunityIds?: string[]) {
  const marketScope = opportunityIds ? { marketOpportunityId: { in: opportunityIds } } : {};
  const [companyRows, preferences, visits] = await Promise.all([
    prisma.companyOpportunity.findMany({
      where: { companyId, ...marketScope },
      select: { id: true, marketOpportunityId: true, status: true, assignedToUserId: true, assignedByUserId: true, assignedAt: true, contactedAt: true, notes: true, outcome: true, orderValue: true, orderQuantity: true },
      orderBy: { id: "asc" },
    }),
    prisma.opportunityRadarPreference.count({ where: { companyOpportunity: { companyId, ...marketScope } } }),
    prisma.prospectVisitIntent.count({ where: opportunityIds
      ? { companyId, companyOpportunity: marketScope }
      : { companyId, companyOpportunityId: { not: null } } }),
  ]);
  return { companyRows, preferences, visits };
}

function sourceFingerprint(value: Prisma.JsonValue | null): string | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const fingerprint = (value as Record<string, Prisma.JsonValue>).sourceFingerprint;
  return typeof fingerprint === "string" ? fingerprint : null;
}

async function dryRunLegacy(prisma: PrismaClient, companyId: string, manifest: WaterEventManifest) {
  const ids = manifest.candidates.flatMap((candidate) => candidate.existing_market_opportunity_id ? [candidate.existing_market_opportunity_id] : []);
  const rows = await prisma.$queryRaw<Array<{ id: string; title: string; city: string | null; opportunity_date: Date | null; source_url: string; company_link_count: bigint }>>(Prisma.sql`
    SELECT mo.id, mo.title, mo.city, mo.opportunity_date, mo.source_url, COUNT(co.id)::bigint AS company_link_count
    FROM market_opportunities mo
    LEFT JOIN company_opportunities co ON co.market_opportunity_id = mo.id AND co.company_id = ${companyId}
    WHERE mo.id IN (${Prisma.join(ids)})
    GROUP BY mo.id, mo.title, mo.city, mo.opportunity_date, mo.source_url
  `);
  const found = new Set(rows.map((row) => row.id));
  const missing = ids.filter((id) => !found.has(id));
  const candidateByExistingId = new Map(manifest.candidates.flatMap((candidate) => candidate.existing_market_opportunity_id ? [[candidate.existing_market_opportunity_id, candidate] as const] : []));
  const identityMismatches = rows.filter((row) => {
    const candidate = candidateByExistingId.get(row.id);
    return !candidate || !reviewedCandidateMatch(candidate, { id: row.id, title: row.title, city: row.city, opportunityDate: row.opportunity_date, sourceUrl: row.source_url });
  }).map((row) => row.id);
  const preservation = await prisma.$queryRaw<Array<{ company_opportunities: bigint; assigned: bigint; preferences: bigint; visit_intents: bigint }>>(Prisma.sql`
    SELECT
      COUNT(DISTINCT co.id)::bigint AS company_opportunities,
      COUNT(DISTINCT co.id) FILTER (WHERE co.assigned_to_user_id IS NOT NULL)::bigint AS assigned,
      COUNT(DISTINCT pref.id)::bigint AS preferences,
      COUNT(DISTINCT intent.id)::bigint AS visit_intents
    FROM company_opportunities co
    LEFT JOIN opportunity_radar_preferences pref ON pref.company_opportunity_id = co.id
    LEFT JOIN prospect_visit_intents intent ON intent.company_opportunity_id = co.id
    WHERE co.company_id = ${companyId}
  `);
  return { migrationApplied: false, matchedExisting: rows.length, missingExistingIds: missing, identityMismatches, preservationBaseline: preservation[0], planned: summarizeWaterEventManifest(manifest) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.companyId) throw new Error("--company-id is required (the importer never infers a tenant)");
  const manifest = JSON.parse(await readFile(args.manifestPath, "utf8")) as WaterEventManifest;
  validateWaterEventManifest(manifest);
  const prisma = new PrismaClient();
  try {
    const migrationApplied = await prisma.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'market_opportunities' AND column_name = 'review_status'
      ) AS exists
    `).then((rows) => rows[0]?.exists === true);
    if (!migrationApplied) {
      if (args.apply) throw new Error("Event-First migration is not applied; refusing to write");
      console.log(JSON.stringify(await dryRunLegacy(prisma, args.companyId, manifest), (_, value) => typeof value === "bigint" ? Number(value) : value, 2));
      return;
    }

    const existingIds = manifest.candidates.flatMap((candidate) => candidate.existing_market_opportunity_id ? [candidate.existing_market_opportunity_id] : []);
    const before = await baseline(prisma, args.companyId);
    const identityRows = await prisma.marketOpportunity.findMany({
      where: { id: { in: existingIds } },
      select: { id: true, externalKey: true, title: true, city: true, opportunityDate: true, sourceUrl: true },
    });
    const candidateByExistingId = new Map(manifest.candidates.flatMap((candidate) => candidate.existing_market_opportunity_id ? [[candidate.existing_market_opportunity_id, candidate] as const] : []));
    const identityMismatches = identityRows.filter((row) => {
      const candidate = candidateByExistingId.get(row.id);
      return !candidate || !reviewedCandidateMatch(candidate, row);
    });
    if (identityMismatches.length) throw new Error(`Existing record identity mismatch: ${identityMismatches.map((row) => row.id).join(", ")}`);
    const expectedExisting = new Set(existingIds);
    for (const row of before.companyRows) expectedExisting.delete(row.marketOpportunityId);
    if (expectedExisting.size) throw new Error(`Existing company links were not found: ${[...expectedExisting].join(", ")}`);
    if (!args.apply) {
      console.log(JSON.stringify({ migrationApplied: true, mode: "DRY_RUN", planned: summarizeWaterEventManifest(manifest), preservedBaseline: before }, null, 2));
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('water-event-first-20261016'))`;
      await tx.opportunityRadarPolicy.upsert({
        where: { companyId: args.companyId! },
        create: { companyId: args.companyId!, mode: "EVENT_FIRST_WATER" },
        update: { mode: "EVENT_FIRST_WATER" },
      });
      let inserted = 0;
      let duplicates = 0;
      let updatedToHold = 0;
      let identicalIgnored = 0;
      for (const candidate of manifest.candidates) {
        if (isImportableWaterEvent(candidate.outcome)) {
          const verified = candidate.outcome === "ADD_VERIFIED";
          const data = marketData(candidate, verified);
          const existing = await tx.marketOpportunity.findUnique({ where: { externalKey: candidateExternalKey(candidate) }, select: { id: true, sourceMetadata: true } });
          const unchanged = existing && sourceFingerprint(existing.sourceMetadata) === candidateFingerprint(candidate);
          const market = existing
            ? unchanged ? existing : await tx.marketOpportunity.update({ where: { id: existing.id }, data, select: { id: true } })
            : await tx.marketOpportunity.create({ data: { id: deterministicOpportunityId(candidate), ...data }, select: { id: true } });
          const companyId = deterministicCompanyOpportunityId(candidate, args.companyId!);
          const companyLink = await tx.companyOpportunity.findUnique({ where: { companyId_marketOpportunityId: { companyId: args.companyId!, marketOpportunityId: market.id } }, select: { id: true } });
          if (!companyLink) await tx.companyOpportunity.create({ data: { id: companyId, companyId: args.companyId!, marketOpportunityId: market.id, status: "NEW" } });
          const changeType = verified ? (existing ? "VERIFIED_REFRESH" : "VERIFIED_IMPORT") : (existing ? "CANDIDATE_REFRESH" : "CANDIDATE_IMPORT");
          if (!unchanged) await tx.marketOpportunityRevision.create({ data: { id: revisionId(candidate, changeType), marketOpportunityId: market.id, changeType, sourceUrl: candidate.event_source_url, verificationUrl: candidate.verification_url, verifiedAt: data.lastVerifiedAt, snapshot: jsonObject(data) } });
          if (!existing) inserted += 1;
          else if (unchanged) identicalIgnored += 1;
        } else if (candidate.outcome === "DUPLICATE_VERIFIED") {
          const id = candidate.existing_market_opportunity_id!;
          const data = marketData(candidate, true);
          const existing = await tx.marketOpportunity.findUniqueOrThrow({ where: { id }, select: { sourceMetadata: true } });
          if (sourceFingerprint(existing.sourceMetadata) === candidateFingerprint(candidate)) identicalIgnored += 1;
          else {
            await tx.marketOpportunity.update({ where: { id }, data: { externalKey: data.externalKey, eventCategory: data.eventCategory, venueName: data.venueName, venueAddress: data.venueAddress, locationKind: data.locationKind, mapUrl: data.mapUrl, mapLinkKind: data.mapLinkKind, eventEndAt: data.eventEndAt, dateLabel: data.dateLabel, priorityRank: data.priorityRank, reviewStatus: "VERIFIED", reviewNote: data.reviewNote, waterDemandStatus: data.waterDemandStatus, contactRole: data.contactRole, nextAction: data.nextAction, sourceMetadata: data.sourceMetadata, secondarySourceUrl: data.secondarySourceUrl, lastVerifiedAt: data.lastVerifiedAt } });
            await tx.marketOpportunityRevision.create({ data: { id: revisionId(candidate, "DEDUP_METADATA_MERGE"), marketOpportunityId: id, changeType: "DEDUP_METADATA_MERGE", sourceUrl: candidate.event_source_url, verificationUrl: candidate.verification_url, verifiedAt: data.lastVerifiedAt, snapshot: jsonObject(data) } });
            duplicates += 1;
          }
        } else if (candidate.outcome === "UPDATE_EXISTING_HOLD") {
          const id = candidate.existing_market_opportunity_id!;
          const existing = await tx.marketOpportunity.findUniqueOrThrow({ where: { id }, select: { status: true, reviewStatus: true, sourceMetadata: true } });
          if (existing.status === "CLOSED" && existing.reviewStatus === "HOLD_POSTPONED" && sourceFingerprint(existing.sourceMetadata) === candidateFingerprint(candidate)) identicalIgnored += 1;
          else {
            await tx.marketOpportunity.update({ where: { id }, data: { status: "CLOSED", reviewStatus: "HOLD_POSTPONED", reviewNote: candidate.review_note, secondarySourceUrl: candidate.verification_url, sourceMetadata: metadata(candidate), lastVerifiedAt: parseIsoDateOnly(candidate.research_date)! } });
            await tx.marketOpportunityRevision.create({ data: { id: revisionId(candidate, "POSTPONED_HOLD"), marketOpportunityId: id, changeType: "POSTPONED_HOLD", sourceUrl: candidate.event_source_url, verificationUrl: candidate.verification_url, verifiedAt: parseIsoDateOnly(candidate.research_date)!, snapshot: jsonObject(candidate), changedFields: { status: "CLOSED", reviewStatus: "HOLD_POSTPONED" } } });
            updatedToHold += 1;
          }
        }
      }
      const beforeMarketIds = before.companyRows.map((row) => row.marketOpportunityId);
      const after = await baseline(tx, args.companyId!, beforeMarketIds);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        const beforeById = new Map(before.companyRows.map((row) => [row.id, JSON.stringify(row)]));
        const changedRowIds = after.companyRows.filter((row) => beforeById.get(row.id) !== JSON.stringify(row)).map((row) => row.id);
        throw new Error(`Preservation invariant failed: ${JSON.stringify({ beforeRows: before.companyRows.length, afterRows: after.companyRows.length, beforePreferences: before.preferences, afterPreferences: after.preferences, beforeVisits: before.visits, afterVisits: after.visits, changedRowIds })}`);
      }
      return { inserted, duplicates, updatedToHold, identicalIgnored };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 180_000 });
    console.log(JSON.stringify({ mode: "APPLY", result, planned: summarizeWaterEventManifest(manifest), preservationVerified: true }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
