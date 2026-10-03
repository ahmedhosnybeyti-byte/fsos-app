import { strict as assert } from "node:assert";
import test from "node:test";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import { FilesController } from "./files.controller";

test("only Company Admin may invoke source-file mutation endpoints", () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, FilesController.prototype.upload), ["COMPANY_ADMIN"]);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, FilesController.prototype.replace), ["COMPANY_ADMIN"]);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, FilesController.prototype.remove), ["COMPANY_ADMIN"]);
});

test("file reads and row search remain available to every authenticated role", () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, FilesController.prototype.list), []);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, FilesController.prototype.searchRows), []);
});
