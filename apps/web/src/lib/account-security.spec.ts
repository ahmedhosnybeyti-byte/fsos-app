import { strict as assert } from "node:assert";
import test from "node:test";
import { changePasswordSchema } from "@field-sales-os/schemas";
import { finalizePasswordChange, getAccountGuardPath, getAccountPath, getPostPasswordChangePath } from "./account-security";

for (const role of ["SUPER_ADMIN", "COMPANY_ADMIN", "MANAGER", "SUPERVISOR", "SALES_REP"] as const) {
  test(`allows ${role} to use the common account route`, () => {
    assert.equal(getAccountPath(role), "/account");
  });
}

test("redirects an unauthenticated visitor to login", () => {
  assert.equal(getAccountGuardPath(false), "/login");
  assert.equal(getAccountGuardPath(true), null);
});

test("returns to login after a successful password change", () => {
  assert.equal(getPostPasswordChangePath(), "/login");
});
test("rejects a mismatched password confirmation before an API request can be made", () => {
  const result = changePasswordSchema.safeParse({
    currentPassword: "Current1!Pass",
    newPassword: "Different2!Pass",
    confirmNewPassword: "OtherPass3!",
  });
  assert.equal(result.success, false);
});
test("uses the same Account link for Super Admin and company users", () => {
  assert.equal(getAccountPath("SUPER_ADMIN"), "/account");
  assert.equal(getAccountPath("COMPANY_ADMIN"), "/account");
});
test("logs out, clears local session state, and redirects after a successful password change", async () => {
  const events: string[] = [];
  await finalizePasswordChange({
    logout: async () => {
      events.push("logout");
    },
    clearLocalSession: () => events.push("session-cleared"),
    clearQueryCache: () => events.push("cache-cleared"),
    redirect: (path) => events.push(`redirect:${path}`),
  });
  assert.deepEqual(events, ["logout", "session-cleared", "cache-cleared", "redirect:/login"]);
});