import { Injectable } from "@nestjs/common";
import type { Prospect } from "@field-sales-os/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { DiscoveredPlace } from "../visit-copilot/discovery/discovery-provider.interface";
import type { ProspectMarketSegment } from "./prospect-taxonomy";
import { ProspectScoringService } from "./prospect-scoring.service";

const CUSTOMER_RADIUS_KM = 0.1;
const PROSPECT_DEDUPE_RADIUS_KM = 0.1;
type LatLon = { lat: number; lon: number };
export type ProspectScanInput = { companyId: string; userId: string; source: string; canonicalChannel: string | null; marketSegment: ProspectMarketSegment; places: DiscoveredPlace[]; customerPoints: readonly LatLon[]; minimumScore?: number };

function haversineKm(a: LatLon, b: LatLon): number {
  const rad = (value: number) => (value * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat); const dLon = rad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
const round = (value: number) => Math.round(value * 100) / 100;

@Injectable()
export class ProspectService {
  constructor(private readonly prisma: PrismaService, private readonly scoring: ProspectScoringService) {}

  async materializeScan(input: ProspectScanInput): Promise<{ found: number; newCount: number; prospects: Prospect[] }> {
    const byExternalKey = new Map(input.places.map((place) => [place.externalKey, place]));
    const dedupedPlaces = dedupeNearbyPlacesByName([...byExternalKey.values()]);
    const fresh = dedupedPlaces.filter((place) => !input.customerPoints.some((customer) => haversineKm(customer, place) <= CUSTOMER_RADIUS_KM));
    const keys = fresh.map((place) => place.externalKey);
    const existing = keys.length === 0 ? [] : await this.prisma.prospect.findMany({ where: { companyId: input.companyId, source: input.source, externalKey: { in: keys } }, select: { externalKey: true } });
    const existingKeys = new Set(existing.map((row) => row.externalKey));
    const nearbyExisting = fresh.length === 0 ? [] : await this.prisma.prospect.findMany({
      where: {
        companyId: input.companyId,
        OR: fresh.map((place) => nearbyBounds(place, PROSPECT_DEDUPE_RADIUS_KM)),
      },
      orderBy: { createdAt: "asc" },
    });
    const densityScores = localDensityScores(fresh);
    const prospects: Prospect[] = [];
    const returnedProspectIds = new Set<string>();
    const semanticDuplicateKeys = new Set<string>();
    for (const place of fresh) {
      const duplicate = nearbyExisting.find((candidate) =>
        candidate.lat !== null
        && candidate.lon !== null
        && !(candidate.source === input.source && candidate.externalKey === place.externalKey)
        && normalizeProspectName(candidate.name) === normalizeProspectName(place.name)
        && haversineKm({ lat: candidate.lat, lon: candidate.lon }, place) <= PROSPECT_DEDUPE_RADIUS_KM,
      );
      if (duplicate) {
        semanticDuplicateKeys.add(place.externalKey);
        if (!returnedProspectIds.has(duplicate.id)) {
          const scored = await this.scoring.rescore(input.companyId, duplicate.id, { densityScore: densityScores.get(place.externalKey) ?? null, activity: place.activity ?? undefined });
          prospects.push(scored ?? duplicate);
          returnedProspectIds.add(duplicate.id);
        }
        continue;
      }
      const facts = { name: place.name, lat: place.lat, lon: place.lon, address: place.address, phone: place.phone, businessType: place.businessType, sizeBand: place.sizeBand };
      const saved = await this.prisma.prospect.upsert({ where: { companyId_source_externalKey: { companyId: input.companyId, source: input.source, externalKey: place.externalKey } }, create: { companyId: input.companyId, source: input.source, externalKey: place.externalKey, channel: input.canonicalChannel, marketSegment: input.marketSegment, discoveredByUserId: input.userId, ...facts }, update: facts });
      if (!returnedProspectIds.has(saved.id)) {
        prospects.push((await this.scoring.rescore(input.companyId, saved.id, { densityScore: densityScores.get(place.externalKey) ?? null, activity: place.activity ?? undefined })) ?? saved);
        returnedProspectIds.add(saved.id);
      }
    }
    const minimum = input.minimumScore ?? 0;
    return { found: input.places.length, newCount: keys.filter((key) => !existingKeys.has(key) && !semanticDuplicateKeys.has(key)).length, prospects: prospects.filter((prospect) => (prospect.scoreTotal ?? 0) >= minimum) };
  }

}

export function normalizeProspectName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function dedupeNearbyPlacesByName<T extends DiscoveredPlace>(places: readonly T[]): T[] {
  const kept: T[] = [];
  for (const place of places) {
    const normalizedName = normalizeProspectName(place.name);
    const duplicate = kept.some((candidate) =>
      normalizeProspectName(candidate.name) === normalizedName
      && haversineKm(candidate, place) <= PROSPECT_DEDUPE_RADIUS_KM,
    );
    if (!duplicate) kept.push(place);
  }
  return kept;
}

function nearbyBounds(point: LatLon, radiusKm: number) {
  // Keep the SQL prefilter slightly wider than the final Haversine check so
  // floating-point/earth-radius approximations cannot hide a true <=100m hit.
  const boundingRadiusKm = radiusKm * 1.01;
  const latDelta = boundingRadiusKm / 110.574;
  const longitudeKmPerDegree = 111.32 * Math.max(Math.abs(Math.cos(point.lat * Math.PI / 180)), 0.000001);
  const lonDelta = Math.min(180, boundingRadiusKm / longitudeKmPerDegree);
  return {
    lat: { gte: point.lat - latDelta, lte: point.lat + latDelta },
    lon: { gte: point.lon - lonDelta, lte: point.lon + lonDelta },
  };
}

function localDensityScores(places: readonly DiscoveredPlace[]): Map<string, number | null> {
  if (places.length < 3) return new Map(places.map((place) => [place.externalKey, null]));
  const counts = places.map((place) => ({ key: place.externalKey, count: places.filter((other) => other.externalKey !== place.externalKey && haversineKm(place, other) <= 0.5).length }));
  const sorted = counts.map((row) => row.count).sort((a, b) => a - b);
  const p90 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1)] ?? 0;
  return new Map(counts.map((row) => [row.key, p90 === 0 ? 0 : Math.min(100, round(row.count / p90 * 100))]));
}
