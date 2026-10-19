import { strict as assert } from "node:assert";
import test from "node:test";
import { companyScreenRegistry, getCompanyFeatureAccessState, getCompanyScreenForRoute, normalizeCompanyFeatureAccess } from "./company-feature-access.schemas";

test("company screen access defaults missing settings and keys to enabled", () => {
  assert.equal(getCompanyFeatureAccessState(undefined, "smart-loading"), "ENABLED");
  assert.equal(getCompanyFeatureAccessState({ "smart-loading": "LOCKED" }, "analysis-studio"), "ENABLED");
});

test("company screen access keeps recognized enabled, locked, and hidden values only", () => {
  assert.deepEqual(normalizeCompanyFeatureAccess({ "smart-loading": "LOCKED", "analysis-studio": "HIDDEN", unknown: "ENABLED", files: "INVALID" }), {
    "smart-loading": "LOCKED",
    "analysis-studio": "HIDDEN",
  });
});

test("company screen routes resolve the most specific registered screen", () => {
  assert.equal(getCompanyScreenForRoute("/dashboard/smart-loading")?.featureKey, "smart-loading");
  assert.equal(getCompanyScreenForRoute("/dashboard/smart-loading/session-1")?.featureKey, "smart-loading");
  assert.equal(getCompanyScreenForRoute("/account")?.featureKey, "account");
});

test("User Activity is an enabled-by-default company screen", () => {
  assert.equal(getCompanyScreenForRoute("/admin/user-activity")?.featureKey, "user_activity");
  assert.equal(getCompanyFeatureAccessState({}, "user_activity"), "ENABLED");
});

test("SFA Setup requires explicit screen activation without changing legacy defaults", () => {
  for (const value of [undefined, null, {}, { files: "ENABLED" } as const]) {
    assert.equal(getCompanyFeatureAccessState(value, "sfa-setup"), "HIDDEN");
    for (const screen of companyScreenRegistry.filter((item) => item.featureKey !== "sfa-setup")) {
      assert.equal(getCompanyFeatureAccessState(value, screen.featureKey), "ENABLED");
    }
  }
  assert.equal(getCompanyFeatureAccessState({ "sfa-setup": "ENABLED" }, "sfa-setup"), "ENABLED");
  assert.equal(getCompanyFeatureAccessState({ "sfa-setup": "LOCKED" }, "sfa-setup"), "LOCKED");
  assert.equal(getCompanyScreenForRoute("/sfa/setup")?.featureKey, "sfa-setup");
  assert.deepEqual(normalizeCompanyFeatureAccess({ "sfa-setup": "HIDDEN" }), { "sfa-setup": "HIDDEN" });
});
