import assert from "node:assert/strict";
import test from "node:test";
import type { Prospect } from "@field-sales-os/database";
import type { DiscoveredPlace } from "../visit-copilot/discovery/discovery-provider.interface";
import { ProspectService } from "./prospect.service";

const place = (externalKey: string, name: string, lat: number, lon: number): DiscoveredPlace => ({
  externalKey,
  name,
  lat,
  lon,
  address: null,
  phone: null,
  businessType: "FACTORIES",
  sizeBand: null,
  activity: null,
});

const prospect = (overrides: Partial<Prospect>): Prospect => ({
  id: "prospect-1",
  companyId: "company-1",
  source: "GOOGLE",
  externalKey: "google-1",
  name: "Hygienic Paper Company",
  channel: null,
  marketSegment: "RETAIL_FMCG",
  businessType: "FACTORIES",
  sizeBand: null,
  lat: 21.4381327,
  lon: 39.2217021,
  city: null,
  address: null,
  phone: null,
  notes: null,
  status: "NEW",
  scoreVersion: null,
  scoreTotal: 50,
  scoreConfidence: null,
  businessTypeSizeScore: null,
  commercialDensityScore: null,
  activitySignalScore: null,
  visionScore: null,
  scoreComponents: null,
  scoreInputFingerprint: null,
  scoredAt: null,
  discoveredByUserId: "user-1",
  sourceFileId: null,
  createdAt: new Date("2026-10-16T00:00:00Z"),
  updatedAt: new Date("2026-10-16T00:00:00Z"),
  ...overrides,
});

const input = (places: DiscoveredPlace[], source = "GOOGLE") => ({
  companyId: "company-1",
  userId: "user-1",
  source,
  canonicalChannel: null,
  marketSegment: "RETAIL_FMCG" as const,
  places,
  customerPoints: [],
});

test("dedupes the same normalized name within 100m when external keys differ", async () => {
  const upserts: string[] = [];
  const prisma = {
    prospect: {
      findMany: async () => [],
      upsert: async ({ create }: { create: { externalKey: string; name: string; lat: number; lon: number } }) => {
        upserts.push(create.externalKey);
        return prospect({ externalKey: create.externalKey, name: create.name, lat: create.lat, lon: create.lon });
      },
    },
  };
  const scoring = { rescore: async (_companyId: string, _id: string) => prospect({ externalKey: upserts.at(-1) }) };
  const service = new ProspectService(prisma as never, scoring as never);

  const result = await service.materializeScan(input([
    place("google-1", "Hygienic Paper Company", 21.4381327, 39.2217021),
    place("google-2", "  HYGIENIC   PAPER COMPANY ", 21.4379027, 39.2220938),
  ]));

  assert.deepEqual(upserts, ["google-1"]);
  assert.equal(result.found, 2);
  assert.equal(result.newCount, 1);
  assert.equal(result.prospects.length, 1);
});

test("dedupes an incoming OSM result against a nearby Google prospect with the same normalized name", async () => {
  const existing = prospect({ source: "GOOGLE", externalKey: "google-existing" });
  let findManyCall = 0;
  let upsertCalled = false;
  const prisma = {
    prospect: {
      findMany: async () => (++findManyCall === 1 ? [] : [existing]),
      upsert: async () => { upsertCalled = true; return existing; },
    },
  };
  const scoring = { rescore: async () => existing };
  const service = new ProspectService(prisma as never, scoring as never);

  const result = await service.materializeScan(input([
    place("osm-node-7", " hygienic  paper company ", 21.4379027, 39.2220938),
  ], "OSM"));

  assert.equal(upsertCalled, false);
  assert.equal(result.newCount, 0);
  assert.deepEqual(result.prospects.map((row) => [row.source, row.externalKey]), [["GOOGLE", "google-existing"]]);
});

test("does not merge nearby prospects whose normalized names differ", async () => {
  const existing = prospect({ name: "Hygienic Paper Company - Warehouse", externalKey: "google-other" });
  let findManyCall = 0;
  let upsertCalled = false;
  const prisma = {
    prospect: {
      findMany: async () => (++findManyCall === 1 ? [] : [existing]),
      upsert: async ({ create }: { create: { externalKey: string; name: string; lat: number; lon: number } }) => {
        upsertCalled = true;
        return prospect({ source: "OSM", externalKey: create.externalKey, name: create.name, lat: create.lat, lon: create.lon });
      },
    },
  };
  const scoring = { rescore: async () => prospect({ source: "OSM", externalKey: "osm-node-8" }) };
  const service = new ProspectService(prisma as never, scoring as never);

  const result = await service.materializeScan(input([
    place("osm-node-8", "Hygienic Paper Company", 21.4379027, 39.2220938),
  ], "OSM"));

  assert.equal(upsertCalled, true);
  assert.equal(result.newCount, 1);
  assert.equal(result.prospects.length, 1);
});
