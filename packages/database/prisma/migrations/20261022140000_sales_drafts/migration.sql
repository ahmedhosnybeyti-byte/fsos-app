-- Foundation 002-A: inert drafts only. No stock/financial/canonical writes or grants.
CREATE TABLE sales_drafts (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL, visit_id TEXT NOT NULL, rep_id TEXT NOT NULL,
 customer_code TEXT NOT NULL, customer_name TEXT NOT NULL, rep_name TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','CANCELLED')),
 version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0), warehouse_id TEXT,
 notes TEXT NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(company_id,id),
 FOREIGN KEY(company_id,rep_id,visit_id) REFERENCES visit_executions(company_id,rep_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX sales_drafts_one_active ON sales_drafts(company_id,visit_id) WHERE status='DRAFT';
CREATE INDEX sales_drafts_visit ON sales_drafts(company_id,rep_id,visit_id,created_at DESC,id);
CREATE TABLE sales_draft_lines (
 company_id TEXT NOT NULL,draft_id TEXT NOT NULL,line_no INTEGER NOT NULL CHECK(line_no BETWEEN 1 AND 20),
 product_id TEXT NOT NULL,product_code TEXT NOT NULL,product_name TEXT NOT NULL,base_unit TEXT NOT NULL,
 quantity NUMERIC(24,6) NOT NULL CHECK(quantity>0 AND quantity<1000000000000),
 unit TEXT NOT NULL CHECK(unit IN('BASE','CARTON')),conversion_factor INTEGER NOT NULL CHECK(conversion_factor>0),
 quantity_base NUMERIC(30,6) NOT NULL CHECK(quantity_base>0 AND quantity_base=quantity*conversion_factor),
 PRIMARY KEY(company_id,draft_id,line_no),UNIQUE(company_id,draft_id,product_id),
 FOREIGN KEY(company_id,draft_id) REFERENCES sales_drafts(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,product_id) REFERENCES wms_products(company_id,id) ON DELETE RESTRICT
);
CREATE TABLE sales_draft_commands (
 company_id TEXT NOT NULL,rep_id TEXT NOT NULL,command_key TEXT NOT NULL,
 payload_hash TEXT NOT NULL,draft_id TEXT NOT NULL,result JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(company_id,rep_id,command_key),
 FOREIGN KEY(company_id,draft_id) REFERENCES sales_drafts(company_id,id) ON DELETE RESTRICT
);
CREATE FUNCTION sales_draft_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v visit_executions;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'DRAFT_IMMUTABLE_IDENTITY';END IF;
 SELECT * INTO v FROM visit_executions WHERE company_id=NEW.company_id AND rep_id=NEW.rep_id AND id=NEW.visit_id FOR UPDATE;
 IF NOT FOUND OR v.status<>'OPEN' THEN RAISE EXCEPTION 'DRAFT_VISIT_CLOSED' USING ERRCODE='23514';END IF;
 IF NEW.customer_code<>v.customer_code OR NEW.customer_name<>v.customer_name OR NEW.rep_name<>v.rep_name
 THEN RAISE EXCEPTION 'DRAFT_IDENTITY_MISMATCH' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND (OLD.status<>'DRAFT' OR NEW.version<>OLD.version+1 OR
  (to_jsonb(NEW)-ARRAY['version','warehouse_id','notes','status','updated_at']) IS DISTINCT FROM
  (to_jsonb(OLD)-ARRAY['version','warehouse_id','notes','status','updated_at']))
 THEN RAISE EXCEPTION 'DRAFT_INVALID_TRANSITION' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sales_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON sales_drafts FOR EACH ROW EXECUTE FUNCTION sales_draft_guard();
CREATE FUNCTION sales_draft_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d sales_drafts;v visit_executions;p wms_products;
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'DRAFT_REPLACE_LINES' USING ERRCODE='23514';END IF;
 SELECT * INTO d FROM sales_drafts WHERE company_id=COALESCE(NEW.company_id,OLD.company_id) AND id=COALESCE(NEW.draft_id,OLD.draft_id);
 SELECT * INTO v FROM visit_executions WHERE company_id=d.company_id AND id=d.visit_id FOR UPDATE;
 IF d.status IS DISTINCT FROM 'DRAFT' OR v.status IS DISTINCT FROM 'OPEN' THEN RAISE EXCEPTION 'DRAFT_NOT_EDITABLE' USING ERRCODE='23514';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 IF d.warehouse_id IS NULL THEN RAISE EXCEPTION 'DRAFT_WAREHOUSE_REQUIRED' USING ERRCODE='23514';END IF;
 SELECT * INTO p FROM wms_products WHERE company_id=NEW.company_id AND id=NEW.product_id AND is_active FOR SHARE;
 IF NOT FOUND OR NEW.product_code<>p.code OR NEW.product_name<>p.name OR NEW.base_unit<>p.base_unit
  OR NEW.conversion_factor<>(CASE WHEN NEW.unit='CARTON' THEN p.pieces_per_carton ELSE 1 END)
  OR NEW.quantity_base<>wms_quantity(NEW.company_id,NEW.product_id,NEW.quantity,NEW.unit)
 THEN RAISE EXCEPTION 'DRAFT_PRODUCT_OR_UNIT_INVALID' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sales_draft_line_guard BEFORE INSERT OR UPDATE OR DELETE ON sales_draft_lines FOR EACH ROW EXECUTE FUNCTION sales_draft_line_guard();
CREATE FUNCTION sales_draft_command_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'DRAFT_COMMAND_IMMUTABLE' USING ERRCODE='23514';END $$;
CREATE TRIGGER sales_draft_command_immutable BEFORE UPDATE OR DELETE ON sales_draft_commands FOR EACH ROW EXECUTE FUNCTION sales_draft_command_immutable();
INSERT INTO permissions(id,code,description) VALUES('permission-sales-drafts','sales.drafts.manage','Manage own visit-linked inert sales drafts; no posting or accounting authority') ON CONFLICT(code) DO NOTHING;
