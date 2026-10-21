// Test-only seed: existing balances, without replaying opening/four workflows.
export const countMigration = "packages/database/prisma/migrations/20261021200000_wms_physical_counts/migration.sql";
export const countSeed = `INSERT INTO wms_products(id,company_id,code,name,pieces_per_carton,track_batches) VALUES('p','a','COUNT','Count fixture',12,true);
 INSERT INTO wms_batches(id,company_id,product_id,code) VALUES('lot','a','p','LOT-COUNT'),('lot2','a','p','LOT-2');
 INSERT INTO wms_positions(company_id,warehouse_id,batch_id,physical) VALUES('a','wa','lot',2400),('a','wa','lot2',120);
 INSERT INTO wms_custody_positions(company_id,warehouse_id,batch_id,recipient_id,quantity) VALUES('a','wa','lot','clerk-a',360);`;
