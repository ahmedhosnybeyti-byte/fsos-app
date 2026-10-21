-- Operational procurement only. Reuse accounting supplier identities and WMS ledger.
CREATE TABLE procurement_requests (
 id TEXT PRIMARY KEY,company_id TEXT NOT NULL,warehouse_id TEXT NOT NULL,reference TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','PENDING','APPROVED','REJECTED')),
 version INTEGER NOT NULL DEFAULT 1,creator_id TEXT NOT NULL,reason TEXT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 UNIQUE(company_id,id),UNIQUE(company_id,warehouse_id,reference),
 FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id),
 FOREIGN KEY(company_id,creator_id) REFERENCES users(company_id,id)
);
CREATE INDEX procurement_request_scope ON procurement_requests(company_id,warehouse_id,created_at DESC,id);
CREATE TABLE procurement_lines (
 company_id TEXT NOT NULL,request_id TEXT NOT NULL,product_id TEXT NOT NULL,
 quantity NUMERIC NOT NULL CHECK(quantity>0 AND quantity=round(quantity,6)),
 unit TEXT NOT NULL CHECK(unit IN('BASE','CARTON')),factor INTEGER NOT NULL CHECK(factor>0),price NUMERIC CHECK(price>=0 AND price=round(price,6)),
 PRIMARY KEY(company_id,request_id,product_id),
 FOREIGN KEY(company_id,request_id) REFERENCES procurement_requests(company_id,id),
 FOREIGN KEY(company_id,product_id) REFERENCES wms_products(company_id,id)
);
CREATE TABLE procurement_orders (
 id TEXT PRIMARY KEY,company_id TEXT NOT NULL,request_id TEXT NOT NULL,supplier_id TEXT NOT NULL,
 cancelled BOOLEAN NOT NULL DEFAULT false,version INTEGER NOT NULL DEFAULT 1,
 UNIQUE(company_id,id),UNIQUE(company_id,request_id),
 FOREIGN KEY(company_id,request_id) REFERENCES procurement_requests(company_id,id),
 FOREIGN KEY(company_id,supplier_id) REFERENCES accounting_parties(company_id,id)
);
CREATE TABLE procurement_receipts (
 company_id TEXT NOT NULL,order_id TEXT NOT NULL,receipt_id TEXT NOT NULL,
 PRIMARY KEY(company_id,receipt_id),
 FOREIGN KEY(company_id,order_id) REFERENCES procurement_orders(company_id,id),
 FOREIGN KEY(company_id,receipt_id) REFERENCES wms_receipts(company_id,id)
);
CREATE INDEX procurement_receipts_order ON procurement_receipts(company_id,order_id);
CREATE TABLE procurement_commands (
 company_id TEXT NOT NULL,idempotency_key TEXT NOT NULL,payload JSONB NOT NULL,result JSONB NOT NULL,
 PRIMARY KEY(company_id,idempotency_key)
);
CREATE TABLE procurement_events (
 id TEXT PRIMARY KEY,company_id TEXT NOT NULL,request_id TEXT NOT NULL,actor_id TEXT NOT NULL,operation TEXT NOT NULL,reason TEXT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 FOREIGN KEY(company_id,request_id) REFERENCES procurement_requests(company_id,id),
 FOREIGN KEY(company_id,actor_id) REFERENCES users(company_id,id)
);
CREATE INDEX procurement_events_request ON procurement_events(company_id,request_id,created_at DESC);
CREATE TRIGGER procurement_commands_immutable BEFORE UPDATE OR DELETE ON procurement_commands FOR EACH ROW EXECUTE FUNCTION wms_immutable_movement();
CREATE TRIGGER procurement_events_immutable BEFORE UPDATE OR DELETE ON procurement_events FOR EACH ROW EXECUTE FUNCTION wms_immutable_movement();
CREATE TRIGGER procurement_receipts_immutable BEFORE UPDATE OR DELETE ON procurement_receipts FOR EACH ROW EXECUTE FUNCTION wms_immutable_movement();

CREATE VIEW procurement_progress AS
 SELECT l.company_id,l.request_id,l.product_id,l.quantity,l.unit,l.factor,l.price,
 COALESCE(r.received,0)/l.factor AS received,l.quantity-COALESCE(r.received,0)/l.factor AS remaining
 FROM procurement_lines l LEFT JOIN LATERAL (
 SELECT sum(rl.accepted_base+rl.quarantined_base) AS received
 FROM procurement_orders o JOIN procurement_receipts pr ON pr.company_id=o.company_id AND pr.order_id=o.id
 JOIN wms_receipts d ON d.company_id=pr.company_id AND d.id=pr.receipt_id AND d.status='POSTED'
 JOIN wms_receipt_lines rl ON rl.company_id=d.company_id AND rl.receipt_id=d.id AND rl.product_id=l.product_id
 WHERE o.company_id=l.company_id AND o.request_id=l.request_id
 ) r ON true;
CREATE VIEW procurement_documents AS
 SELECT r.*,o.id AS order_id,o.supplier_id,s.name AS supplier_name,COALESCE(o.version,r.version) AS document_version,
 CASE WHEN o.cancelled THEN 'CANCELLED' WHEN o.id IS NULL THEN r.status
 WHEN NOT EXISTS(SELECT 1 FROM procurement_progress p WHERE p.company_id=r.company_id AND p.request_id=r.id AND p.remaining>0) THEN 'COMPLETED'
 WHEN EXISTS(SELECT 1 FROM procurement_progress p WHERE p.company_id=r.company_id AND p.request_id=r.id AND p.received>0) THEN 'PARTIAL' ELSE 'OPEN' END AS document_status
 FROM procurement_requests r LEFT JOIN procurement_orders o ON o.company_id=r.company_id AND o.request_id=r.id
 LEFT JOIN accounting_parties s ON s.company_id=o.company_id AND s.id=o.supplier_id;

-- Runs for every WMS entry point, including direct edits, retries and reversals.
-- Serialize linked postings on their order; read only POSTED receipts as supplied.
CREATE FUNCTION procurement_guard_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o procurement_orders; req procurement_requests;
BEGIN
 SELECT po.* INTO o FROM procurement_receipts pr JOIN procurement_orders po ON po.company_id=pr.company_id AND po.id=pr.order_id
 WHERE pr.company_id=NEW.company_id AND pr.receipt_id=NEW.id FOR UPDATE OF po;
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT * INTO req FROM procurement_requests WHERE company_id=o.company_id AND id=o.request_id;
 IF NEW.warehouse_id<>req.warehouse_id THEN RAISE EXCEPTION 'WMS_PROCUREMENT_SCOPE'; END IF;
 IF NEW.status='POSTED' AND OLD.status<>'POSTED' THEN
  IF o.cancelled THEN RAISE EXCEPTION 'WMS_PROCUREMENT_CANCELLED'; END IF;
  IF EXISTS(SELECT 1 FROM wms_receipt_lines l WHERE l.company_id=NEW.company_id AND l.receipt_id=NEW.id
   AND NOT EXISTS(SELECT 1 FROM procurement_lines pl WHERE pl.company_id=o.company_id AND pl.request_id=o.request_id AND pl.product_id=l.product_id))
   THEN RAISE EXCEPTION 'WMS_PROCUREMENT_PRODUCT'; END IF;
  IF EXISTS(SELECT 1 FROM procurement_progress p WHERE p.company_id=o.company_id AND p.request_id=o.request_id
   AND p.received*p.factor+COALESCE((SELECT sum(l.accepted_base+l.quarantined_base) FROM wms_receipt_lines l
    WHERE l.company_id=NEW.company_id AND l.receipt_id=NEW.id AND l.product_id=p.product_id),0)>p.quantity*p.factor)
   THEN RAISE EXCEPTION 'WMS_PROCUREMENT_EXCEEDS_REMAINING'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER procurement_receipt_guard BEFORE UPDATE ON wms_receipts FOR EACH ROW EXECUTE FUNCTION procurement_guard_receipt();

CREATE FUNCTION procurement_execute(c TEXT,w TEXT,actor TEXT,body JSONB,new_id TEXT) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE prior procurement_commands;r procurement_requests;o procurement_orders;prod wms_products;item JSONB;result JSONB;
 op TEXT=body->>'operation';target TEXT=body->>'id';k TEXT=body->>'idempotencyKey';envelope JSONB=jsonb_build_object('warehouse',w,'actor',actor,'body',body);event TEXT='pc-'||new_id;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(c||':procurement:'||k,0));
 SELECT * INTO prior FROM procurement_commands WHERE company_id=c AND idempotency_key=k;
 IF FOUND THEN
  IF prior.payload<>envelope THEN RAISE EXCEPTION 'WMS_PROCUREMENT_IDEMPOTENCY_CONFLICT'; END IF;
  RETURN prior.result;
 END IF;
 IF op='CREATE' THEN
  INSERT INTO procurement_requests(id,company_id,warehouse_id,reference,creator_id,reason)
   VALUES(new_id,c,w,body->'draft'->>'reference',actor,body->>'reason') RETURNING * INTO r;
 ELSE
  SELECT * INTO r FROM procurement_requests WHERE company_id=c AND warehouse_id=w AND id=target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WMS_PROCUREMENT_NOT_FOUND'; END IF;
  SELECT * INTO o FROM procurement_orders WHERE company_id=c AND request_id=r.id FOR UPDATE;
  IF COALESCE(o.version,r.version)<>(body->>'version')::int THEN RAISE EXCEPTION 'WMS_DOCUMENT_STALE'; END IF;
 END IF;
 IF op IN('CREATE','EDIT') THEN
  IF r.status<>'DRAFT' OR r.creator_id<>actor THEN RAISE EXCEPTION 'WMS_INVALID_TRANSITION'; END IF;
  IF jsonb_array_length(body->'draft'->'lines') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'WMS_DOCUMENT_LIMIT'; END IF;
  UPDATE procurement_requests SET reference=body->'draft'->>'reference',reason=body->>'reason' WHERE company_id=c AND id=r.id;
  DELETE FROM procurement_lines WHERE company_id=c AND request_id=r.id;
  FOR item IN SELECT value FROM jsonb_array_elements(body->'draft'->'lines') LOOP
   SELECT * INTO prod FROM wms_products WHERE company_id=c AND id=item->>'productId' AND is_active FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'WMS_PRODUCT_NOT_FOUND'; END IF;
   PERFORM wms_quantity(c,prod.id,(item->>'quantity')::numeric,item->>'unit');
   INSERT INTO procurement_lines(company_id,request_id,product_id,quantity,unit,factor)
    VALUES(c,r.id,prod.id,(item->>'quantity')::numeric,item->>'unit',CASE WHEN item->>'unit'='CARTON' THEN prod.pieces_per_carton ELSE 1 END);
  END LOOP;
 ELSIF op='SUBMIT' THEN
  IF r.status<>'DRAFT' OR r.creator_id<>actor THEN RAISE EXCEPTION 'WMS_INVALID_TRANSITION'; END IF;
  UPDATE procurement_requests SET status='PENDING' WHERE company_id=c AND id=r.id;
 ELSIF op IN('APPROVE','REJECT') THEN
  IF r.status<>'PENDING' OR r.creator_id=actor THEN RAISE EXCEPTION 'WMS_PROCUREMENT_SEPARATE_APPROVER'; END IF;
  UPDATE procurement_requests SET status=CASE WHEN op='APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END WHERE company_id=c AND id=r.id;
 ELSIF op='ORDER' THEN
  IF r.status<>'APPROVED' OR o.id IS NOT NULL THEN RAISE EXCEPTION 'WMS_PROCUREMENT_ALREADY_CONVERTED'; END IF;
  PERFORM 1 FROM accounting_parties WHERE company_id=c AND id=body->>'supplierId' AND kind='SUPPLIER' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WMS_PROCUREMENT_SUPPLIER'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(body->'prices','[]')) x WHERE NOT EXISTS(
   SELECT 1 FROM procurement_lines WHERE company_id=c AND request_id=r.id AND product_id=x->>'productId')) THEN RAISE EXCEPTION 'WMS_PROCUREMENT_PRODUCT'; END IF;
  UPDATE procurement_lines l SET price=(x.value->>'price')::numeric FROM jsonb_array_elements(COALESCE(body->'prices','[]')) x WHERE l.company_id=c AND l.request_id=r.id AND l.product_id=x.value->>'productId';
  INSERT INTO procurement_orders(id,company_id,request_id,supplier_id) VALUES(new_id,c,r.id,body->>'supplierId');
 ELSIF op='CANCEL' THEN
  IF o.id IS NULL OR o.cancelled OR EXISTS(SELECT 1 FROM procurement_progress WHERE company_id=c AND request_id=r.id AND received>0)
   OR EXISTS(SELECT 1 FROM procurement_receipts pr JOIN wms_receipts d ON d.company_id=c AND d.id=pr.receipt_id WHERE pr.company_id=c AND pr.order_id=o.id AND d.status NOT IN('CANCELLED','REVERSED'))
   THEN RAISE EXCEPTION 'WMS_INVALID_TRANSITION'; END IF;
  UPDATE procurement_orders SET cancelled=true,version=version+1 WHERE company_id=c AND id=o.id;
 ELSIF op='RECEIVE' THEN
  IF o.id IS NULL OR o.cancelled THEN RAISE EXCEPTION 'WMS_INVALID_TRANSITION'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(body->'receipt'->'lines') l WHERE NOT EXISTS(SELECT 1 FROM procurement_progress p WHERE p.company_id=c AND p.request_id=r.id AND p.product_id=l->>'productId'
   AND wms_quantity(c,p.product_id,(l->>'expectedQuantity')::numeric,l->>'unit')<=p.remaining*p.factor)) THEN RAISE EXCEPTION 'WMS_PROCUREMENT_EXCEEDS_REMAINING'; END IF;
  result=wms_core_execute(c,w,'receipt.create',(body->'receipt')||jsonb_build_object('supplierName',(SELECT name FROM accounting_parties WHERE company_id=c AND id=o.supplier_id),'supplierReference',o.id,'note',body->>'reason'),actor,k,new_id);
  INSERT INTO procurement_receipts VALUES(c,o.id,result->>'id');
 ELSE RAISE EXCEPTION 'WMS_INVALID_TRANSITION';
 END IF;
 IF op IN('EDIT','SUBMIT','APPROVE','REJECT') THEN UPDATE procurement_requests SET version=version+1 WHERE company_id=c AND id=r.id; END IF;
 INSERT INTO procurement_events(id,company_id,request_id,actor_id,operation,reason) VALUES(event,c,r.id,actor,op,body->>'reason');
 result=COALESCE(result,jsonb_build_object('id',r.id))||jsonb_build_object('requestId',r.id,'eventId',event);
 INSERT INTO procurement_commands VALUES(c,k,envelope,result);
 RETURN result;
END $$;
INSERT INTO permissions(id,code,description) VALUES
 ('perm-procurement-read','procurement.read','Read authorized Full ERP procurement'),
 ('perm-procurement-create','procurement.request.create','Create and submit purchase requests'),
 ('perm-procurement-approve','procurement.request.approve','Approve other users purchase requests'),
 ('perm-procurement-order','procurement.order.create','Convert approved requests once and cancel unreceived orders')
 ON CONFLICT(code) DO NOTHING;
