import { strict as assert } from "node:assert";
import test from "node:test";
import { canViewSfaPreview } from "./sfa-preview-access";

const profile = { role: { code: "SUPER_ADMIN" }, status: "ACTIVE", mustChangePassword: false };
function api(body: unknown, status = 200): typeof fetch {
  return async (url, options) => {
    assert.equal(url, "https://api.example/api/v1/auth/me");
    assert.equal(options?.cache, "no-store");
    assert.equal(options?.redirect, "error");
    assert.equal((options?.headers as Record<string, string>).Cookie, "access=test");
    return Response.json(body, { status });
  };
}
test("preview requires a server-validated active Super Admin session", async () => {
  assert.equal(await canViewSfaPreview("https://api.example/api/v1/", "access=test", api(profile)), true);
  for (const body of [
    { ...profile, role: { code: "COMPANY_ADMIN" } },
    { ...profile, role: { code: "SALES_REP" } },
    { ...profile, status: "DISABLED" },
    { ...profile, mustChangePassword: true },
    {}, null,
  ]) assert.equal(await canViewSfaPreview("https://api.example/api/v1", "access=test", api(body)), false);
});
test("missing, invalid and unavailable sessions fail closed", async () => {
  const noRequest: typeof fetch = async () => { throw Error("unavailable"); };
  assert.equal(await canViewSfaPreview("https://api.example/api/v1", "", noRequest), false);
  assert.equal(await canViewSfaPreview("https://api.example/api/v1", "access=test", api({}, 401)), false);
  assert.equal(await canViewSfaPreview("https://api.example/api/v1", "access=test", noRequest), false);
});
