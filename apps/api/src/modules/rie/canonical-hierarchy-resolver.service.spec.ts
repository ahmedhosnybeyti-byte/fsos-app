import { strict as assert } from "node:assert";
import test from "node:test";
import { CanonicalHierarchyResolverService } from "./canonical-hierarchy-resolver.service";

test("resolves uploaded Employees -> Routes for multiple unassigned sales reps", async () => {
  const service = new CanonicalHierarchyResolverService({
    user: { findFirst: async () => ({ id: "user-id" }) },
    userRouteAssignment: { findFirst: async () => null },
  } as never);
  const rows = {
    Employees: { headers: ["EmployeeID", "Email"], rows: [{ EmployeeID: "EMP-10", Email: "rep10@example.com" }, { EmployeeID: "EMP-12", Email: "rep12@example.com" }] },
    Routes: { headers: ["RouteID", "SalesRepID"], rows: [{ RouteID: "RT-10", SalesRepID: "EMP-10" }, { RouteID: "RT-12", SalesRepID: "EMP-12" }] },
  };
  (service as unknown as { fetchRawEntityRows: (entity: keyof typeof rows, companyId: string) => Promise<(typeof rows)[keyof typeof rows]> }).fetchRawEntityRows = async (entity) => rows[entity];

  assert.deepEqual(await service.resolveAllowedRouteIds("company-1", { roleCode: "SALES_REP", email: "rep10@example.com" }), new Set(["rt-10"]));
  assert.deepEqual(await service.resolveAllowedRouteIds("company-1", { roleCode: "SALES_REP", email: "rep12@example.com" }), new Set(["rt-12"]));
});
