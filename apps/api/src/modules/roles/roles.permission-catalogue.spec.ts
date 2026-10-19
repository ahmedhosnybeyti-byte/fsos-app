import assert from "node:assert/strict";
import test from "node:test";
import { Reflector } from "@nestjs/core";
import { RolesService } from "./roles.service";
import { RolesController } from "./roles.controller";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";

test("Super Admin can discover an ungranted SFA capability without granting it to any role", async () => {
  let query: unknown;
  const service = new RolesService({ permission: { findMany: async (input: unknown) => {
    query = input; return [{ code: "sfa.access", description: "Access SFA" }];
  } } } as never, {} as never, {} as never);
  const controller = new RolesController(service);
  assert.deepEqual(await controller.permissionCatalogue(), [{ code: "sfa.access", description: "Access SFA" }]);
  assert.deepEqual(query, { select: { code: true, description: true }, orderBy: { code: "asc" }, take: 200 });
  assert.deepEqual(new Reflector().get(ROLES_KEY, RolesController.prototype.permissionCatalogue), ["SUPER_ADMIN"]);
});
