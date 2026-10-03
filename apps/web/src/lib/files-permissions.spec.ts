import { strict as assert } from "node:assert";
import test from "node:test";
import { canManageCompanySourceFiles, canUploadSourceFiles } from "./files-permissions";

for (const role of ["MANAGER", "SUPERVISOR", "SALES_REP"] as const) {
  test(`${role} cannot see source-file mutation controls`, () => {
    assert.equal(canUploadSourceFiles(role), false);
    assert.equal(canManageCompanySourceFiles(role), false);
  });
}

test("Company Admin can see upload, replace, and delete controls", () => {
  assert.equal(canUploadSourceFiles("COMPANY_ADMIN"), true);
  assert.equal(canManageCompanySourceFiles("COMPANY_ADMIN"), true);
});

test("Super Admin retains its existing upload flow", () => {
  assert.equal(canUploadSourceFiles("SUPER_ADMIN"), true);
  assert.equal(canManageCompanySourceFiles("SUPER_ADMIN"), false);
});
