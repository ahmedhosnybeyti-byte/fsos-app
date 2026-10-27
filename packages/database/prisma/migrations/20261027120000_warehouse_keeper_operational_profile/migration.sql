-- Approved nine-capability execution profile. No users/assignments or stock
-- changes; no other role grants are touched. Correct existing grants are kept.
-- The server caps excess legacy keeper grants, including request creation.
BEGIN;
INSERT INTO roles(id,code,name,description,"isSystem",created_at,updated_at)
VALUES('role_warehouse_keeper_v1','WAREHOUSE_KEEPER','Warehouse Keeper','أمين المستودع — assigned warehouse execution without approvals or request creation',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT(code) DO NOTHING;

INSERT INTO permissions(id,code,description)
SELECT 'perm_wk_'||md5(code),code,'Warehouse execution capability: '||code FROM (VALUES
 ('sfa.access'),('wms.read'),('wms.receiving.create'),('wms.supplier-return.create'),
 ('wms.rep-return.create'),('wms.reservation.manage'),('wms.picking.manage'),
 ('wms.dispatch.execute'),('wms.count.create')
) AS capabilities(code) ON CONFLICT(code) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.code='WAREHOUSE_KEEPER' AND p.code IN (
 'sfa.access','wms.read','wms.receiving.create','wms.supplier-return.create',
 'wms.rep-return.create','wms.reservation.manage','wms.picking.manage',
 'wms.dispatch.execute','wms.count.create'
) ON CONFLICT(role_id,permission_id) DO NOTHING;
COMMIT;
