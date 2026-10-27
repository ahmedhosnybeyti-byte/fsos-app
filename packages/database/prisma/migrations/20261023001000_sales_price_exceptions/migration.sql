-- B2 Part 1: commercial proposals only. No effective prices or financial/stock writes.
CREATE TABLE sales_price_requests (
 id TEXT PRIMARY KEY,company_id TEXT NOT NULL,requester_id TEXT NOT NULL,draft_id TEXT NOT NULL,draft_version INTEGER NOT NULL CHECK(draft_version>=0),
 customer_code TEXT NOT NULL,customer_name TEXT NOT NULL,channel TEXT NOT NULL CHECK(length(btrim(channel)) BETWEEN 1 AND 120),route_id TEXT NOT NULL CHECK(length(route_id)>0),
 product_id TEXT NOT NULL,product_code TEXT NOT NULL,product_name TEXT NOT NULL,unit TEXT NOT NULL CHECK(unit IN('BASE','CARTON')),conversion_factor INTEGER NOT NULL CHECK(conversion_factor>0),
 kind TEXT NOT NULL CHECK(kind IN('SPECIAL_PRICE','DISCOUNT_PERCENT')),proposed_value NUMERIC(24,6) NOT NULL CHECK(proposed_value>0 AND proposed_value<1000000000000),currency TEXT,
 reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 1000),desired_from DATE NOT NULL,desired_to DATE CHECK(desired_to>=desired_from),
 status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN('SUBMITTED','REVIEWED','APPROVED','REJECTED')),version INTEGER NOT NULL DEFAULT 0 CHECK(version BETWEEN 0 AND 2),
 reviewed_by TEXT,decided_by TEXT,created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(company_id,id),
 FOREIGN KEY(company_id,draft_id) REFERENCES sales_drafts(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,product_id) REFERENCES wms_products(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,requester_id) REFERENCES users(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,reviewed_by) REFERENCES users(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,decided_by) REFERENCES users(company_id,id) ON DELETE RESTRICT,
 CHECK((kind='SPECIAL_PRICE' AND currency ~ '^[A-Z]{3}$' AND currency IS NOT NULL) OR (kind='DISCOUNT_PERCENT' AND proposed_value<=100 AND currency IS NULL)),
 CHECK(reviewed_by IS NULL OR reviewed_by<>requester_id),
 CHECK(decided_by IS NULL OR (decided_by<>requester_id AND decided_by<>reviewed_by)),
 CHECK((status='SUBMITTED' AND version=0 AND reviewed_by IS NULL AND decided_by IS NULL) OR
  (status='REVIEWED' AND version=1 AND reviewed_by IS NOT NULL AND decided_by IS NULL) OR
  (status='APPROVED' AND version=2 AND reviewed_by IS NOT NULL AND decided_by IS NOT NULL) OR
  (status='REJECTED' AND reviewed_by IS NOT NULL AND version=2 AND decided_by IS NOT NULL))
);
CREATE INDEX sales_price_requests_rep ON sales_price_requests(company_id,requester_id,created_at DESC,id DESC);
CREATE INDEX sales_price_requests_route ON sales_price_requests(company_id,route_id,created_at DESC,id DESC);
CREATE INDEX sales_price_requests_queue ON sales_price_requests(company_id,status,created_at DESC,id DESC);
CREATE UNIQUE INDEX sales_price_requests_one_open ON sales_price_requests(company_id,draft_id,product_id,kind) WHERE status IN('SUBMITTED','REVIEWED');
CREATE TABLE sales_price_events (
 company_id TEXT NOT NULL,request_id TEXT NOT NULL,version INTEGER NOT NULL CHECK(version BETWEEN 0 AND 2),actor_id TEXT NOT NULL,actor_name TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN('REQUEST','FORWARD','APPROVE','REJECT')),reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 1000),
 evidence_type TEXT NOT NULL CHECK(evidence_type IN('EMAIL','COMPANY_APPROVED_MESSAGE')),evidence_reference TEXT NOT NULL CHECK(length(btrim(evidence_reference)) BETWEEN 3 AND 1000),
 evidence_attested BOOLEAN NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(company_id,request_id,version),
 FOREIGN KEY(company_id,request_id) REFERENCES sales_price_requests(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,actor_id) REFERENCES users(company_id,id) ON DELETE RESTRICT,
 CHECK(version=0 OR evidence_attested)
);
CREATE TABLE sales_price_commands (
 company_id TEXT NOT NULL,actor_id TEXT NOT NULL,command_key TEXT NOT NULL,payload_hash TEXT NOT NULL,request_id TEXT NOT NULL,result JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(company_id,actor_id,command_key),
 FOREIGN KEY(company_id,request_id) REFERENCES sales_price_requests(company_id,id) ON DELETE RESTRICT
);
CREATE FUNCTION sales_price_actor(c TEXT,a TEXT,role_code TEXT,permission_code TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id JOIN company_operating_settings s ON s.company_id=u.company_id
  WHERE u.company_id=c AND u.id=a AND u.status='ACTIVE' AND r.code=role_code AND s.operating_mode IN('SFA','FULL_ERP')
   AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['sfa.access',permission_code]) req(code) WHERE NOT EXISTS(
    SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=r.id AND p.code=req.code)));
$$;
CREATE FUNCTION sales_price_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor TEXT:=current_setting('murshidak.price_actor',true);d sales_drafts;l sales_draft_lines;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PRICE_IMMUTABLE' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.requester_id IS DISTINCT FROM actor OR NOT sales_price_actor(NEW.company_id,actor,'SALES_REP','sales.price-exceptions.request') OR NEW.status<>'SUBMITTED' OR NEW.version<>0 THEN RAISE EXCEPTION 'PRICE_FORBIDDEN' USING ERRCODE='23514';END IF;
  SELECT * INTO d FROM sales_drafts WHERE company_id=NEW.company_id AND id=NEW.draft_id AND rep_id=actor FOR SHARE;
  SELECT * INTO l FROM sales_draft_lines WHERE company_id=NEW.company_id AND draft_id=NEW.draft_id AND product_id=NEW.product_id;
  IF d.id IS NULL OR l.product_id IS NULL OR d.status<>'DRAFT' OR d.version<>NEW.draft_version OR
   NEW.customer_code<>d.customer_code OR NEW.customer_name<>d.customer_name OR NEW.product_code<>l.product_code OR
   NEW.product_name<>l.product_name OR NEW.unit<>l.unit OR NEW.conversion_factor<>l.conversion_factor
   THEN RAISE EXCEPTION 'PRICE_DRAFT_CHANGED' USING ERRCODE='23514';END IF;
 ELSE
  IF NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['status','version','reviewed_by','decided_by','updated_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['status','version','reviewed_by','decided_by','updated_at']) THEN RAISE EXCEPTION 'PRICE_IMMUTABLE' USING ERRCODE='23514';END IF;
  IF OLD.status='SUBMITTED' AND NEW.status='REVIEWED' THEN
   IF NOT sales_price_actor(NEW.company_id,actor,'SUPERVISOR','sales.price-exceptions.review') OR NEW.reviewed_by IS DISTINCT FROM actor OR NEW.decided_by IS NOT NULL THEN RAISE EXCEPTION 'PRICE_FORBIDDEN' USING ERRCODE='23514';END IF;
  ELSIF OLD.status='REVIEWED' AND NEW.status IN('APPROVED','REJECTED') THEN
   IF NOT sales_price_actor(NEW.company_id,actor,'MANAGER','sales.price-exceptions.approve') OR NEW.decided_by IS DISTINCT FROM actor OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN RAISE EXCEPTION 'PRICE_FORBIDDEN' USING ERRCODE='23514';END IF;
  ELSE RAISE EXCEPTION 'PRICE_INVALID_TRANSITION' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sales_price_request_guard BEFORE INSERT OR UPDATE OR DELETE ON sales_price_requests FOR EACH ROW EXECUTE FUNCTION sales_price_request_guard();
CREATE FUNCTION sales_price_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r sales_price_requests;actor TEXT:=current_setting('murshidak.price_actor',true);
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'PRICE_HISTORY_IMMUTABLE' USING ERRCODE='23514';END IF;
 SELECT * INTO r FROM sales_price_requests WHERE company_id=NEW.company_id AND id=NEW.request_id;
 IF NEW.actor_id IS DISTINCT FROM actor OR NEW.version<>r.version OR
  NOT ((NEW.version=0 AND NEW.action='REQUEST' AND NEW.actor_id=r.requester_id) OR
   (NEW.version=1 AND NEW.actor_id=r.reviewed_by AND r.status='REVIEWED' AND NEW.action='FORWARD') OR
   (NEW.version=2 AND NEW.actor_id=r.decided_by AND ((r.status='APPROVED' AND NEW.action='APPROVE') OR (r.status='REJECTED' AND NEW.action='REJECT'))))
 THEN RAISE EXCEPTION 'PRICE_EVENT_INVALID' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sales_price_event_guard BEFORE INSERT OR UPDATE OR DELETE ON sales_price_events FOR EACH ROW EXECUTE FUNCTION sales_price_event_guard();
CREATE FUNCTION sales_price_event_required() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM sales_price_events WHERE company_id=NEW.company_id AND request_id=NEW.id AND version=NEW.version)
 THEN RAISE EXCEPTION 'PRICE_EVENT_REQUIRED' USING ERRCODE='23514';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER sales_price_event_required AFTER INSERT OR UPDATE ON sales_price_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sales_price_event_required();
CREATE FUNCTION sales_price_command_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'PRICE_HISTORY_IMMUTABLE' USING ERRCODE='23514';END $$;
CREATE TRIGGER sales_price_command_immutable BEFORE UPDATE OR DELETE ON sales_price_commands FOR EACH ROW EXECUTE FUNCTION sales_price_command_immutable();
INSERT INTO permissions(id,code,description) VALUES
 ('permission-sales-price-request','sales.price-exceptions.request','Request inert own-customer/product price exception'),
 ('permission-sales-price-review','sales.price-exceptions.review','Review scoped price exception; cannot approve or execute'),
 ('permission-sales-price-approve','sales.price-exceptions.approve','Commercial approval with official proof; cannot execute price'),
 ('permission-sales-price-accounting','sales.price-exceptions.accounting','View approved accounting queue; activation unavailable')
 ON CONFLICT(code) DO NOTHING;
