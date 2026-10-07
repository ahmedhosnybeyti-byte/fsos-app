import { strict as assert } from "node:assert";
import test from "node:test";
import { VisitCopilotService } from "./visit-copilot.service";

test("keeps hierarchy groups when final lost-opportunity keys are normalized", async () => {
  const rieFacade = {
    queryCanonicalRecords: async (query: { entityName: string }) => {
      if (query.entityName === "Customers") return { records: [{ CustomerCode: "C-1", RouteID: "R-1", RegionName: "Riyadh" }], page: { hasMore: false } };
      if (query.entityName === "Routes") return { records: [{ RouteID: "R-1", ManagerID: "M-1", SupervisorID: "S-1", SalesRepID: "REP-1" }], page: { hasMore: false } };
      return { records: [{ EmployeeID: "M-1", EmployeeName: "Manager" }, { EmployeeID: "S-1", EmployeeName: "Supervisor" }, { EmployeeID: "REP-1", EmployeeName: "Sales Rep" }], page: { hasMore: false } };
    },
  };
  const service = new VisitCopilotService(rieFacade as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  const hierarchy = await (service as any).daily360OpportunityHierarchy({ companyId: "company", roleCode: "COMPANY_ADMIN", email: "admin@example.com" }, ["c-1"]);

  assert.deepEqual(hierarchy.get("c-1"), { region: "Riyadh", manager: "Manager", supervisor: "Supervisor", salesRep: "Sales Rep" });
});
