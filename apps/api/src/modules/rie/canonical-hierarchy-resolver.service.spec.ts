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

test("keeps manager and supervisor Visits scopes inside their canonical reporting hierarchy", async () => {
  const service = new CanonicalHierarchyResolverService({} as never);
  const rows = {
    Employees: {
      headers: ["EmployeeID", "Email", "DirectManagerID"],
      rows: [
        { EmployeeID: "MGR", Email: "manager@example.com", DirectManagerID: "" },
        { EmployeeID: "SUP", Email: "supervisor@example.com", DirectManagerID: "MGR" },
        { EmployeeID: "REP-1", Email: "rep1@example.com", DirectManagerID: "SUP" },
        { EmployeeID: "REP-2", Email: "rep2@example.com", DirectManagerID: "SUP" },
        { EmployeeID: "OTHER", Email: "other@example.com", DirectManagerID: "" },
      ],
    },
    Routes: {
      headers: ["RouteID", "SalesRepID", "SupervisorID", "ManagerID"],
      rows: [
        { RouteID: "MANAGER-DIRECT", SalesRepID: "", SupervisorID: "", ManagerID: "MGR" },
        { RouteID: "TEAM-1", SalesRepID: "REP-1", SupervisorID: "SUP", ManagerID: "MGR" },
        { RouteID: "TEAM-2", SalesRepID: "REP-2", SupervisorID: "SUP", ManagerID: "MGR" },
        { RouteID: "OUTSIDE", SalesRepID: "OTHER", SupervisorID: "", ManagerID: "" },
      ],
    },
  };
  (service as unknown as { fetchRawEntityRows: (entity: keyof typeof rows, companyId: string) => Promise<(typeof rows)[keyof typeof rows]> }).fetchRawEntityRows = async (entity) => rows[entity];

  assert.deepEqual(await service.resolveAllowedRouteIds("company-1", { roleCode: "MANAGER", email: "manager@example.com" }), new Set(["manager-direct", "team-1", "team-2"]));
  assert.deepEqual(await service.resolveAllowedRouteIds("company-1", { roleCode: "SUPERVISOR", email: "supervisor@example.com" }), new Set(["team-1", "team-2"]));
  assert.equal(await service.resolveAllowedRouteIds("company-1", { roleCode: "COMPANY_ADMIN", email: "admin@example.com" }), null);
});
