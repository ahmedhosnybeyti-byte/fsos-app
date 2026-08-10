import { Injectable } from "@nestjs/common";
import type { Prospect } from "@field-sales-os/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { DiscoveredPlace } from "../visit-copilot/discovery/discovery-provider.interface";
import type { ProspectMarketSegment } from "./prospect-taxonomy";
import { ProspectScoringService } from "./prospect-scoring.service";

const CUSTOMER_RADIUS_KM = 0.1;
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
    const fresh = [...byExternalKey.values()].filter((place) => !input.customerPoints.some((customer) => haversineKm(customer, place) <= CUSTOMER_RADIUS_KM));
    const keys = fresh.map((place) => place.externalKey);
    const existing = keys.length === 0 ? [] : await this.prisma.prospect.findMany({ where: { companyId: input.companyId, source: input.source, externalKey: { in: keys } }, select: { externalKey: true } });
    const existingKeys = new Set(existing.map((row) => row.externalKey));
    const densityScores = localDensityScores(fresh);
    const prospects: Prospect[] = [];
    for (const place of fresh) {
      const facts = { name: place.name, lat: place.lat, lon: place.lon, address: place.address, phone: place.phone, businessType: place.businessType, sizeBand: place.sizeBand };
      const saved = await this.prisma.prospect.upsert({ where: { companyId_source_externalKey: { companyId: input.companyId, source: input.source, externalKey: place.externalKey } }, create: { companyId: input.companyId, source: input.source, externalKey: place.externalKey, channel: input.canonicalChannel, marketSegment: input.marketSegment, discoveredByUserId: input.userId, ...facts }, update: facts });
      prospects.push((await this.scoring.rescore(input.companyId, saved.id, { densityScore: densityScores.get(place.externalKey) ?? null, activity: place.activity ?? undefined })) ?? saved);
    }
    const minimum = input.minimumScore ?? 0;
    return { found: input.places.length, newCount: keys.filter((key) => !existingKeys.has(key)).length, prospects: prospects.filter((prospect) => (prospect.scoreTotal ?? 0) >= minimum) };
  }

}

function localDensityScores(places: readonly DiscoveredPlace[]): Map<string, number | null> {
  if (places.length < 3) return new Map(places.map((place) => [place.externalKey, null]));
  const counts = places.map((place) => ({ key: place.externalKey, count: places.filter((other) => other.externalKey !== place.externalKey && haversineKm(place, other) <= 0.5).length }));
  const sorted = counts.map((row) => row.count).sort((a, b) => a - b);
  const p90 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1)] ?? 0;
  return new Map(counts.map((row) => [row.key, p90 === 0 ? 0 : Math.min(100, round(row.count / p90 * 100))]));
}
