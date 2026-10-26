import test from "node:test";
import assert from "node:assert/strict";
import { hasOperationalPermissions, permitsOperationalRole, warehouseKeeperPermissions, warehouseManagerPermissions } from "./operational-role-policy";
import { WMS_OPERATION_PERMISSIONS } from "./wms-operations.schemas";

test("keeper profile is exactly the approved nine permissions and preserves existing operational mappings", () => {
  assert.deepEqual([...warehouseKeeperPermissions].sort(), ["sfa.access", "wms.read", "wms.receiving.create", "wms.supplier-return.create", "wms.rep-return.create", "wms.reservation.manage", "wms.picking.manage", "wms.dispatch.execute", "wms.count.create"].sort());
  for (const op of ["receipt.create", "receipt.edit", "receipt.submit", "supplier.create", "supplier.submit", "rep-return.create", "rep-return.submit", "load.reserve", "load.cancel", "load.pick", "load.dispatch"] as const) {
    const permission = WMS_OPERATION_PERMISSIONS[op];
    assert.equal(hasOperationalPermissions("WAREHOUSE_KEEPER", warehouseKeeperPermissions, [permission]), true, op);
    assert.equal(permitsOperationalRole("WAREHOUSE_KEEPER", [permission]), true, op);
    assert.equal(hasOperationalPermissions("WAREHOUSE_KEEPER", [], [permission]), false, op);
  }
});

test("keeper cannot use injected creation, approval, administrative or finance grants", () => {
  for (const p of ["wms.request.create", "wms.count.approve", "wms.receiving.review", "wms.receiving.approve", "wms.picking.review", "wms.dispatch.approve", "wms.rep-return.review", "wms.rep-return.post", "wms.supplier-return.review", "wms.supplier-return.post", "wms.opening.post", "wms.products.manage", "wms.warehouses.manage", "wms.access.manage", "wms.quarantine.release", "wms.quarantine.writeoff", "accounting.journal.post", "procurement.read", "platform.admin"]) {
    assert.equal(hasOperationalPermissions("WAREHOUSE_KEEPER", [...warehouseKeeperPermissions, p], [p]), false, p);
    assert.equal(permitsOperationalRole("WAREHOUSE_KEEPER", [p]), false, p);
  }
  for (const op of ["load.create", "proposal.create"] as const) assert.equal(hasOperationalPermissions("WAREHOUSE_KEEPER", warehouseKeeperPermissions, [WMS_OPERATION_PERMISSIONS[op]]), false);
});

test("generic manager and company admin policy is not expanded", () => {
  assert.equal(hasOperationalPermissions("MANAGER", [], ["wms.read"]), false);
  assert.equal(hasOperationalPermissions("MANAGER", ["wms.read"], ["wms.read"]), true);
  assert.equal(permitsOperationalRole("MANAGER", ["wms.read"]), true);
  assert.equal(permitsOperationalRole("COMPANY_ADMIN", ["wms.opening.post"], { method: "POST", path: "/sfa/wms/warehouses/w/opening" }), false);
  assert.equal(permitsOperationalRole("COMPANY_ADMIN", ["accounting.journal.post"], { method: "POST", path: "/sfa/accounting/journals" }), false);
  assert.equal(permitsOperationalRole("COMPANY_ADMIN", ["wms.read"], { method: "GET", path: "/sfa/wms/warehouses/w/summary" }), true);
  assert.equal(hasOperationalPermissions("WAREHOUSE_MANAGER", warehouseManagerPermissions, ["wms.count.approve"]), true);
});
