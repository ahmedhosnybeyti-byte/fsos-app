import assert from "node:assert/strict";
import test from "node:test";
import { VisitExecutionService } from "./visit-execution.service";
import { RieRequestPlannerService } from "../rie/rie-request-planner.service";
import { RieExecutionCoordinatorService } from "../rie/rie-execution-coordinator.service";

test("visit context owns one bounded RIE plan across briefing metadata, hierarchy and supplemental reads", async () => {
  const coordinator = new RieExecutionCoordinatorService();
  const planner = new RieRequestPlannerService(coordinator);
  let briefingExecutions = 6;
  let active = 0;
  let peak = 0;
  const pg = () => coordinator.execute("fixture.sql", async () => {
    peak = Math.max(peak, ++active);
    await Promise.resolve(); active--;
    return { records: [] };
  });
  const user = { userId: "rep", companyId: "company", email: "rep@example.invalid", roleCode: "SALES_REP", permissions: ["sfa.access", "visits.execute"] };
  const prisma = { $queryRaw: async (sql: { text: string }) => sql.text.includes("SELECT id,notes") ? [] : [{ id: "visit", customerCode: "C1" }] };
  const rie = { runPlannedRequest: planner.runPlan.bind(planner), queryCanonicalRecords: () => planner.execute("supplement", pg) };
  const copilot = { briefing: () => planner.runPlan({ name: "visit_copilot.briefing", maxOperations: 24 }, async () => {
    for (let i = 0; i < briefingExecutions; i++) await pg();
    return { period: { from: "2026-07-22", to: "2026-10-22" }, sales: {}, returns: {}, dataAvailability: {}, topProducts: [], missingProducts: [] };
  }) };
  const service = new VisitExecutionService(prisma as never, rie as never, copilot as never, {} as never, {} as never);
  const context = await coordinator.runRequest("context", () => service.context(user as never, "visit"));
  assert.equal(context.lastInvoice, null); assert.equal(context.lastPayment, null);
  assert.equal(peak, 1, "request PostgreSQL serialization remains in force");
  // The inner briefing must not create a new budget or reset the outer one.
  briefingExecutions = 21;
  await assert.rejects(coordinator.runRequest("over-budget", () => service.context(user as never, "visit")), /24-PostgreSQL-execution budget/);
});
