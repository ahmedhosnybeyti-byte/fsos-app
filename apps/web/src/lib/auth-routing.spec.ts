import { strict as assert } from "node:assert";
import test from "node:test";
import { getPostLoginPath } from "./auth-routing";

test("routes a platform super admin to the admin console", () => {
  assert.equal(getPostLoginPath("SUPER_ADMIN"), "/admin");
});

test("routes company and field roles to the dashboard", () => {
  assert.equal(getPostLoginPath("COMPANY_ADMIN"), "/dashboard");
  assert.equal(getPostLoginPath("SALES_REP"), "/dashboard");
});