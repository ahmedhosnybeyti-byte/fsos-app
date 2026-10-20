import assert from "node:assert/strict";
import test from "node:test";
import { companyOperatingModeSchema, getCompanyModuleEntitlements, supportsSfaOperations } from "./company-operating-settings.schemas";
import { createPlatformCompanySchema } from "./company.schemas";

test("three modes keep plan and permissions independent; legacy creates default to Analytics", () => {
  const input = { name: "Demo Company", slug: "demo-company", initialPlanCode: "trial", adminFullName: "Demo Admin", adminEmail: "admin@example.invalid" };
  assert.equal(createPlatformCompanySchema.parse(input).operatingMode, "ANALYSIS_ONLY");
  for (const operatingMode of companyOperatingModeSchema.options) {
    const parsed = createPlatformCompanySchema.parse({ ...input, operatingMode });
    assert.equal(parsed.operatingMode, operatingMode);
    assert.equal(parsed.initialPlanCode, "trial");
  }
  assert.equal(companyOperatingModeSchema.safeParse("ERP").success, false);
  assert.equal(supportsSfaOperations(undefined), false);
  assert.equal(supportsSfaOperations("ANALYSIS_ONLY"), false);
  assert.equal(supportsSfaOperations("SFA"), true);
  assert.equal(supportsSfaOperations("FULL_ERP"), true);
  for (const mode of companyOperatingModeSchema.options) {
    const modules = getCompanyModuleEntitlements(mode);
    assert.ok(modules.filter(m => m.delivery === "DEFERRED").every(m => !m.eligible));
    assert.equal(modules.find(m => m.key === "operations-setup")?.eligible, mode !== "ANALYSIS_ONLY");
    assert.equal(modules.find(m => m.key === "analytics")?.eligible, true);
  }
});
