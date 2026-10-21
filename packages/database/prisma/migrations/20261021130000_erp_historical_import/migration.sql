-- Additive onboarding only: no tenant activation, grants, financial or stock posting.
CREATE TABLE erp_import_projects (
 id text PRIMARY KEY, company_id text NOT NULL UNIQUE REFERENCES companies(id),
 target_mode text NOT NULL CHECK(target_mode IN ('SFA','FULL_ERP')),
 source text NOT NULL CHECK(source IN ('EXCEL','EXISTING')),
 state text NOT NULL DEFAULT 'STAGING' CHECK(state IN ('STAGING','APPROVED','LOCKED')),
 synthetic_demo boolean NOT NULL DEFAULT false, demo_as_of date, cutover_date date NOT NULL,
 publication_as_of date, revision integer NOT NULL DEFAULT 0,
 source_fingerprint text, created_by text NOT NULL REFERENCES users(id), approved_by text REFERENCES users(id),
 approval_note text, created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz,
 CHECK(NOT synthetic_demo OR demo_as_of IS NOT NULL), UNIQUE(company_id,id)
);
CREATE TABLE erp_import_uploads (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES erp_import_projects(id),
 file_name text NOT NULL, sha256 text NOT NULL, uploaded_by text NOT NULL REFERENCES users(id),
 storage_key text NOT NULL, status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','STAGED','FAILED')),
 attempts integer NOT NULL DEFAULT 0, started_at timestamptz, finished_at timestamptz, failure text,
 row_count integer NOT NULL DEFAULT 0, identical_count integer NOT NULL DEFAULT 0,
 rejected_count integer NOT NULL DEFAULT 0, excluded boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(project_id,sha256), UNIQUE(project_id,id)
);
CREATE TABLE erp_import_rows (
 project_id text NOT NULL, entity text NOT NULL, business_key text NOT NULL,
 data jsonb NOT NULL, content_hash text NOT NULL, event_date date,
 upload_id text NOT NULL, source_row integer NOT NULL,
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','ACCEPTED')),
 issues jsonb NOT NULL DEFAULT '[]',
 PRIMARY KEY(project_id,entity,business_key),
 FOREIGN KEY(project_id,upload_id) REFERENCES erp_import_uploads(project_id,id)
);
CREATE INDEX erp_import_upload_queue ON erp_import_uploads(status,created_at);
CREATE INDEX erp_import_rows_validation ON erp_import_rows(project_id,state,entity);
CREATE INDEX erp_import_rows_date ON erp_import_rows(project_id,entity,event_date,business_key);
CREATE INDEX erp_import_rows_data ON erp_import_rows USING gin(data jsonb_path_ops);
CREATE TABLE erp_import_errors (
 id bigserial PRIMARY KEY, project_id text NOT NULL REFERENCES erp_import_projects(id),
 upload_id text NOT NULL, entity text NOT NULL, source_row integer NOT NULL, message text NOT NULL,
 FOREIGN KEY(project_id,upload_id) REFERENCES erp_import_uploads(project_id,id)
);
CREATE INDEX erp_import_errors_page ON erp_import_errors(project_id,id);
CREATE UNIQUE INDEX erp_import_error_source ON erp_import_errors(upload_id,entity,source_row,message);
CREATE TABLE erp_product_links (
 company_id text NOT NULL, project_id text NOT NULL, source_code text NOT NULL,
 product_id text NOT NULL, source_name text NOT NULL, source_uom jsonb NOT NULL,
 PRIMARY KEY(company_id,source_code), UNIQUE(company_id,product_id),
 FOREIGN KEY(company_id,project_id) REFERENCES erp_import_projects(company_id,id),
 FOREIGN KEY(company_id,product_id) REFERENCES wms_products(company_id,id)
);
-- No opening balance table is populated here. Stock, custody, AR/AP and GL
-- approval/cutover are distinct operational workflows, never inferred from history.
