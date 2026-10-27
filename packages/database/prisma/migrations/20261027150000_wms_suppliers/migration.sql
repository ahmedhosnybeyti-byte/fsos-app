-- Operational supplier identities only. No accounts, balances or stock posting.
CREATE TABLE wms_suppliers (
 id TEXT PRIMARY KEY,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
 code TEXT NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
 name TEXT NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),
 idempotency_key TEXT NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 UNIQUE(company_id,id), UNIQUE(company_id,code), UNIQUE(company_id,idempotency_key)
);
CREATE INDEX wms_suppliers_company_name ON wms_suppliers(company_id,name,id);
CREATE TABLE wms_receipt_supplier_metadata (
 company_id TEXT NOT NULL,
 receipt_id TEXT NOT NULL,
 supplier_id TEXT,
 document_date DATE NOT NULL,
 PRIMARY KEY(company_id,receipt_id),
 FOREIGN KEY(company_id,receipt_id) REFERENCES wms_receipts(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,supplier_id) REFERENCES wms_suppliers(company_id,id) ON DELETE RESTRICT
);
