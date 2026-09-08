import { strict as assert } from "node:assert";
import test from "node:test";
import { assertDemoSeedAllowed, getInitialProductionSuperAdmin } from "./seed-security";

test("production blocks the demo seed", () => {
  assert.throws(() => assertDemoSeedAllowed({ NODE_ENV: "production" }), /Demo seed is disabled/);
  assert.doesNotThrow(() => assertDemoSeedAllowed({ NODE_ENV: "development" }));
});

test("initial production super admin requires explicit external credentials", () => {
  assert.throws(() => getInitialProductionSuperAdmin({ NODE_ENV: "production" }, false), /INITIAL_SUPER_ADMIN_EMAIL/);
  assert.deepEqual(
    getInitialProductionSuperAdmin({ NODE_ENV: "production", INITIAL_SUPER_ADMIN_EMAIL: "admin@example.test", INITIAL_SUPER_ADMIN_PASSWORD: "provided-secure-secret" }, false),
    { email: "admin@example.test", password: "provided-secure-secret" },
  );
  assert.equal(getInitialProductionSuperAdmin({ NODE_ENV: "production" }, true), null);
  assert.equal(getInitialProductionSuperAdmin({ NODE_ENV: "development" }, false), null);
});
