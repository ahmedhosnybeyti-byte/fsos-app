import { strict as assert } from "node:assert";
import test from "node:test";
import { SmartLoadingManagementCacheService } from "./smart-loading-management-cache.service";

const input = { companyId: "company-a", targetDate: "2026-09-20", salesFrom: "2025-09-20", salesTo: "2026-09-19", personLevel: "manager", routeIds: ["route-b", "route-a"] } as const;

test("management loading-risk snapshot reuses the prepared response for the same permission scope", async () => {
  const snapshots = new Map<string, unknown>();
  const prisma = {
    smartLoadingManagementLoadingRiskSnapshot: {
      findUnique: async ({ where }: { where: { companyId_targetDate_salesFrom_salesTo_personLevel_scopeKey: Record<string, string> } }) => {
        const key = JSON.stringify(where.companyId_targetDate_salesFrom_salesTo_personLevel_scopeKey);
        return snapshots.has(key) ? { result: snapshots.get(key) } : null;
      },
      upsert: async ({ where, create }: { where: { companyId_targetDate_salesFrom_salesTo_personLevel_scopeKey: Record<string, string> }; create: { result: unknown } }) => {
        snapshots.set(JSON.stringify(where.companyId_targetDate_salesFrom_salesTo_personLevel_scopeKey), create.result);
      },
    },
  };
  const service = new SmartLoadingManagementCacheService(prisma as never);
  let calculations = 0;

  const first = await service.getOrCompute(input, async () => ({ people: [{ employeeId: "m-1" }], affectedPersonCount: ++calculations }));
  const second = await service.getOrCompute({ ...input, routeIds: ["route-a", "route-b"] }, async () => ({ people: [], affectedPersonCount: ++calculations }));

  assert.equal(first.hit, false);
  assert.equal(second.hit, true);
  assert.equal(calculations, 1);
  assert.deepEqual(second.value, first.value);
});

test("Van Inventory invalidation targets overlapping route snapshots plus company-wide snapshots", async () => {
  let deleted: unknown;
  const service = new SmartLoadingManagementCacheService({} as never);
  await service.invalidateForCanonicalChange({ smartLoadingManagementLoadingRiskSnapshot: { deleteMany: async (query: unknown) => { deleted = query; } } } as never, "company-a", "Van Inventory", ["route-a"], true);
  assert.deepEqual(deleted, { where: { companyId: "company-a", OR: [{ scopeIsCompanyWide: true }, { routeIds: { hasSome: ["route-a"] } }] } });
});

test("cache storage failure falls back to the unchanged calculation", async () => {
  const service = new SmartLoadingManagementCacheService({ smartLoadingManagementLoadingRiskSnapshot: { findUnique: async () => { throw new Error("relation missing during deploy"); } } } as never);
  const result = await service.getOrCompute(input, async () => ({ affectedPersonCount: 3 }));
  assert.equal(result.hit, false);
  assert.deepEqual(result.value, { affectedPersonCount: 3 });
});
