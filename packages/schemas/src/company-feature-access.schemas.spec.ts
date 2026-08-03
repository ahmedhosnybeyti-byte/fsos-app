import { strict as assert } from "node:assert";
import test from "node:test";
import { getCompanyFeatureAccessState, getCompanyScreenForRoute, normalizeCompanyFeatureAccess } from "./company-feature-access.schemas";

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
  assert.equal(getCompanyScreenForRoute("/account"), undefined);
});
