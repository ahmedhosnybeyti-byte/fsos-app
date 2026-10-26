-- Additive role/capability registration only. No users, warehouse assignments,
-- existing role grants, stock, financial data or inventory functions are changed.
INSERT INTO roles(id,code,name,description,"isSystem",created_at,updated_at)
VALUES('role_warehouse_manager_v1','WAREHOUSE_MANAGER','Warehouse Manager','مدير المستودع — scoped warehouse administration and approvals',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT(code) DO NOTHING;

INSERT INTO permissions(id,code,description)
SELECT 'perm_wm_'||md5(code),code,'Warehouse manager capability: '||code FROM (VALUES
 ('sfa.access'),('wms.read'),('wms.warehouses.manage'),('wms.access.manage'),
 ('wms.receiving.review'),('wms.receiving.approve'),('wms.picking.review'),('wms.dispatch.approve'),
 ('wms.supplier-return.review'),('wms.supplier-return.post'),('wms.rep-return.review'),('wms.rep-return.post'),
 ('wms.count.approve'),('wms.quarantine.release'),('wms.quarantine.writeoff')
) AS capabilities(code) ON CONFLICT(code) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.code='WAREHOUSE_MANAGER' AND p.code IN (
 'sfa.access','wms.read','wms.warehouses.manage','wms.access.manage',
 'wms.receiving.review','wms.receiving.approve','wms.picking.review','wms.dispatch.approve',
 'wms.supplier-return.review','wms.supplier-return.post','wms.rep-return.review','wms.rep-return.post',
 'wms.count.approve','wms.quarantine.release','wms.quarantine.writeoff'
) ON CONFLICT(role_id,permission_id) DO NOTHING;
