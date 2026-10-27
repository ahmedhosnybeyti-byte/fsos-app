import {wmsUser} from "./wms-test-fixture";
export const procurementMigration="packages/database/prisma/migrations/20261021220000_procurement_phase01/migration.sql";
// wmsFixture owns the settings table and synthetic company rows.
export const procurementSeed=`UPDATE company_operating_settings SET operating_mode='FULL_ERP' WHERE company_id IN ('a','b');
 CREATE TABLE accounting_parties(id TEXT PRIMARY KEY,company_id TEXT,kind TEXT,code TEXT,name TEXT,UNIQUE(company_id,id));
 INSERT INTO accounting_parties VALUES('supplier','a','SUPPLIER','SUP','Existing supplier'),('foreign','b','SUPPLIER','SUP','Foreign supplier');
 INSERT INTO wms_products(id,company_id,code,name,pieces_per_carton,track_batches) VALUES('p','a','SKU','Existing product',12,true);
 INSERT INTO wms_batches(id,company_id,product_id,code) VALUES('lot','a','p','LOT');
 INSERT INTO wms_positions(company_id,warehouse_id,batch_id,physical) VALUES('a','wa','lot',2352);
 INSERT INTO wms_warehouse_access(company_id,warehouse_id,user_id) VALUES('a','wa','actor-a'),('a','wa','clerk-a');`;
export const procurementUser=(id="actor-a")=>({...wmsUser("a",id,"MANAGER"),permissions:[...wmsUser().permissions,"procurement.read","procurement.request.create","procurement.request.approve","procurement.order.create","wms.receiving.create","wms.receiving.review","wms.receiving.approve"]});
