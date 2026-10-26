import { strict as assert } from "node:assert";
import test from "node:test";
import { showVisitExecution } from "./visit-execution-access";
import type { User } from "./types";

const actor = (companyId: string) => ({ companyId, role: { code: "SALES_REP" }, permissions: ["sfa.access", "visits.execute"], featureAccess: {} }) as User;

test("Visit Execution entry is available to authorized reps of any FULL_ERP company", () => {
  for (const companyId of ["company-a", "company-b"]) assert.equal(showVisitExecution(actor(companyId), "FULL_ERP"), true);
});

test("Visit Execution entry preserves mode, role, permission and feature restrictions", () => {
  const user = actor("company-a");
  for (const mode of [undefined, "ANALYSIS_ONLY", "SFA"]) assert.equal(showVisitExecution(user, mode), false);
  for (const permissions of [[], ["sfa.access"], ["visits.execute"]]) assert.equal(showVisitExecution({ ...user, permissions }, "FULL_ERP"), false);
  for (const code of ["COMPANY_ADMIN", "MANAGER", "SUPERVISOR", "ACCOUNTANT"] as const) assert.equal(showVisitExecution({ ...user, role: { ...user.role, code } }, "FULL_ERP"), false);
  for (const state of ["HIDDEN", "LOCKED"] as const) assert.equal(showVisitExecution({ ...user, featureAccess: { "visit-copilot": state } }, "FULL_ERP"), false);
  assert.equal(showVisitExecution({ ...user, companyId: null }, "FULL_ERP"), false);
});
