BEGIN;
-- Wave 1 only. No tenant activation, role grants, canonical or financial writes.
ALTER TABLE wms_positions ADD COLUMN quality_blocked BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE wms_returns (
 id TEXT PRIMARY KEY,company_id TEXT NOT NULL,warehouse_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('SUPPLIER','REP')),reference TEXT NOT NULL CHECK(length(reference) BETWEEN 1 AND 80),
 receipt_id TEXT,load_id TEXT,status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','SUBMITTED','REVIEWED','DISPATCHED','COMPLETED','POSTED','CANCELLED')),
 version INTEGER NOT NULL DEFAULT 1,reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 300),handover_reference TEXT,
 created_by TEXT NOT NULL,created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),updated_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 UNIQUE(company_id,id),UNIQUE(company_id,warehouse_id,reference),
 FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,receipt_id) REFERENCES wms_receipts(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,load_id) REFERENCES wms_load_requests(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,created_by) REFERENCES users(company_id,id) ON DELETE RESTRICT,
 CHECK((kind='SUPPLIER' AND receipt_id IS NOT NULL AND load_id IS NULL) OR(kind='REP' AND load_id IS NOT NULL AND receipt_id IS NULL))
);
CREATE INDEX wms_returns_scope ON wms_returns(company_id,warehouse_id,kind,created_at DESC,id DESC);
CREATE INDEX wms_returns_receipt ON wms_returns(company_id,receipt_id,status);
CREATE INDEX wms_returns_load ON wms_returns(company_id,load_id,status);
CREATE TABLE wms_return_lines (
 id TEXT PRIMARY KEY,company_id TEXT NOT NULL,return_id TEXT NOT NULL,receipt_line_id TEXT,allocation_id TEXT,
 product_id TEXT NOT NULL,batch_id TEXT NOT NULL,input_unit TEXT NOT NULL CHECK(input_unit IN('BASE','CARTON')),
 conversion_factor INTEGER NOT NULL CHECK(conversion_factor>0),declared_quantity NUMERIC(24,6) NOT NULL CHECK(declared_quantity>0),
 actual_quantity NUMERIC(24,6) NOT NULL CHECK(actual_quantity>0 AND actual_quantity<=declared_quantity),
 quantity_base NUMERIC(24,6) NOT NULL CHECK(quantity_base>0),quality TEXT NOT NULL CHECK(quality IN('GOOD','DAMAGED','EXPIRED','QUARANTINED')),
 from_quarantine BOOLEAN NOT NULL DEFAULT false,discrepancy_reason TEXT NOT NULL DEFAULT '',destination TEXT CHECK(destination IN('SUPPLIER','AVAILABLE','QUARANTINED')),
 UNIQUE(company_id,id),UNIQUE(company_id,return_id,receipt_line_id),UNIQUE(company_id,return_id,allocation_id),
 FOREIGN KEY(company_id,return_id) REFERENCES wms_returns(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,receipt_line_id) REFERENCES wms_receipt_lines(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,allocation_id) REFERENCES wms_allocations(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,product_id,batch_id) REFERENCES wms_batches(company_id,product_id,id) ON DELETE RESTRICT,
 CHECK((receipt_line_id IS NOT NULL)::int+(allocation_id IS NOT NULL)::int=1),
 CHECK(quantity_base=actual_quantity*conversion_factor),CHECK(actual_quantity=declared_quantity OR length(discrepancy_reason) BETWEEN 3 AND 300)
);
CREATE INDEX wms_return_lines_parent ON wms_return_lines(company_id,return_id,id);
CREATE INDEX wms_return_lines_receipt ON wms_return_lines(company_id,receipt_line_id);
CREATE INDEX wms_return_lines_allocation ON wms_return_lines(company_id,allocation_id);
CREATE TABLE wms_loading_proposals (
 id TEXT PRIMARY KEY,company_id TEXT NOT NULL,warehouse_id TEXT NOT NULL,author_id TEXT NOT NULL,target_date DATE NOT NULL,
 fingerprint TEXT NOT NULL,confirmed_payload JSONB NOT NULL,created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 UNIQUE(company_id,id),UNIQUE(company_id,fingerprint),
 FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,author_id) REFERENCES users(company_id,id) ON DELETE RESTRICT
);
CREATE TRIGGER wms_proposal_immutable BEFORE UPDATE OR DELETE ON wms_loading_proposals FOR EACH ROW EXECUTE FUNCTION wms_immutable_movement();
CREATE TABLE wms_proposal_lines (
 company_id TEXT NOT NULL,proposal_id TEXT NOT NULL,product_id TEXT NOT NULL,product_code TEXT NOT NULL,
 input_quantity NUMERIC(24,6) NOT NULL CHECK(input_quantity>0),input_unit TEXT NOT NULL CHECK(input_unit IN('BASE','CARTON')),
 conversion_factor INTEGER NOT NULL CHECK(conversion_factor>0),quantity_base NUMERIC(24,6) NOT NULL CHECK(quantity_base>0),
 PRIMARY KEY(company_id,proposal_id,product_id),
 FOREIGN KEY(company_id,proposal_id) REFERENCES wms_loading_proposals(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,product_id) REFERENCES wms_products(company_id,id) ON DELETE RESTRICT,
 CHECK(quantity_base=input_quantity*conversion_factor)
);
CREATE TRIGGER wms_proposal_line_immutable BEFORE UPDATE OR DELETE ON wms_proposal_lines FOR EACH ROW EXECUTE FUNCTION wms_immutable_movement();
ALTER TABLE wms_load_requests ADD COLUMN proposal_id TEXT,
 ADD FOREIGN KEY(company_id,proposal_id) REFERENCES wms_loading_proposals(company_id,id) ON DELETE RESTRICT,
 ADD UNIQUE(company_id,proposal_id);
ALTER TABLE wms_operation_events ADD COLUMN return_id TEXT,ADD COLUMN proposal_id TEXT,ADD COLUMN quality_batch_id TEXT,
 ADD FOREIGN KEY(company_id,return_id) REFERENCES wms_returns(company_id,id) ON DELETE RESTRICT,
 ADD FOREIGN KEY(company_id,proposal_id) REFERENCES wms_loading_proposals(company_id,id) ON DELETE RESTRICT,
 ADD FOREIGN KEY(company_id,quality_batch_id) REFERENCES wms_batches(company_id,id) ON DELETE RESTRICT;
ALTER TABLE wms_operation_events DROP CONSTRAINT wms_operation_events_check;
ALTER TABLE wms_operation_events ADD CHECK((receipt_id IS NOT NULL)::int+(load_id IS NOT NULL)::int+(return_id IS NOT NULL)::int+(proposal_id IS NOT NULL)::int+(quality_batch_id IS NOT NULL)::int=1);
CREATE INDEX wms_events_return ON wms_operation_events(company_id,return_id,created_at DESC,id DESC);
CREATE INDEX wms_events_proposal ON wms_operation_events(company_id,proposal_id);
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT conname FROM pg_constraint WHERE conrelid='wms_movements'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%kind%' LOOP
  EXECUTE format('ALTER TABLE wms_movements DROP CONSTRAINT %I',r.conname);
 END LOOP;
END $$;
ALTER TABLE wms_movements ADD CHECK(kind IN('OPENING','REVERSAL','RECEIPT','RECEIPT_REVERSAL','RESERVE','RELEASE','DISPATCH','ACCEPT','TRANSIT_RETURN','SUPPLIER_RETURN','REP_RETURN','QUALITY_HOLD','QUALITY_RELEASE')),
 ADD CHECK((kind IN('OPENING','RECEIPT','TRANSIT_RETURN','REP_RETURN') AND quantity>0 AND reversal_of IS NULL)
 OR(kind='REVERSAL' AND quantity<0 AND reversal_of IS NOT NULL)
 OR(kind IN('RECEIPT_REVERSAL','DISPATCH','SUPPLIER_RETURN') AND quantity<0 AND reversal_of IS NULL)
 OR(kind IN('RESERVE','RELEASE','ACCEPT','QUALITY_HOLD','QUALITY_RELEASE') AND quantity=0 AND reversal_of IS NULL)),
 ADD CHECK((kind='RESERVE' AND reserved_delta>0) OR(kind='RELEASE' AND reserved_delta<0) OR kind NOT IN('RESERVE','RELEASE'));

CREATE OR REPLACE VIEW wms_inventory_state AS
SELECT s.company_id,s.warehouse_id,s.batch_id,b.product_id,p.base_unit,s.physical,s.reserved,s.quarantined,
 CASE WHEN b.expiry_date<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date OR b.is_quarantined OR NOT p.is_active OR s.quality_blocked
 THEN 0::numeric ELSE s.physical-s.reserved-s.quarantined END AS available,
 CASE WHEN b.expiry_date<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date THEN s.physical ELSE 0::numeric END AS expired,
 b.expiry_date-(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AS days_remaining,
 CASE WHEN b.production_date IS NOT NULL AND b.expiry_date IS NOT NULL THEN LEAST(100::numeric,GREATEST(0::numeric,
 ROUND(100.0*((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date-b.production_date)/(b.expiry_date-b.production_date),2))) ELSE NULL END AS life_consumed_pct,
 s.in_transit,s.quality_blocked
FROM wms_positions s JOIN wms_batches b ON b.company_id=s.company_id AND b.id=s.batch_id JOIN wms_products p ON p.company_id=b.company_id AND p.id=b.product_id;
CREATE OR REPLACE FUNCTION wms_check_allocation(c TEXT,w TEXT,b TEXT,q NUMERIC,delivery DATE,min_days INTEGER,require_reserved BOOLEAN)
RETURNS VOID LANGUAGE plpgsql AS $$ DECLARE stock record; BEGIN
 SELECT s.physical,s.reserved,s.quarantined,s.quality_blocked,p.is_active,batch.is_quarantined,batch.expiry_date INTO stock
 FROM wms_positions s JOIN wms_batches batch ON batch.company_id=c AND batch.id=s.batch_id JOIN wms_products p ON p.company_id=c AND p.id=batch.product_id
 WHERE s.company_id=c AND s.warehouse_id=w AND s.batch_id=b FOR UPDATE OF s;
 IF NOT FOUND OR stock.quality_blocked OR NOT stock.is_active OR stock.is_quarantined OR q<=0 OR stock.physical-stock.quarantined<q
 OR(require_reserved AND stock.reserved<q) OR(stock.expiry_date IS NULL AND min_days>0)
 OR stock.expiry_date<=GREATEST(delivery,(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)
 OR stock.expiry_date<GREATEST(delivery,(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)+min_days
 THEN RAISE EXCEPTION 'WMS_QUALITY_OR_STOCK_BLOCKED' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION wms_receipt_return_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status='REVERSED' AND EXISTS(SELECT 1 FROM wms_returns WHERE company_id=OLD.company_id AND receipt_id=OLD.id AND status IN('DISPATCHED','COMPLETED'))
 THEN RAISE EXCEPTION 'WMS_RECEIPT_HAS_RETURNS' USING ERRCODE='23514'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER wms_receipt_return_guard BEFORE UPDATE ON wms_receipts FOR EACH ROW EXECUTE FUNCTION wms_receipt_return_guard();

-- Returns remain possible for inactive products; conversion/tracking is frozen by existing Lot protection.
CREATE FUNCTION wms_return_quantity(c TEXT,p TEXT,q NUMERIC,u TEXT) RETURNS NUMERIC LANGUAGE plpgsql AS $$ DECLARE prod wms_products;n NUMERIC;BEGIN
 SELECT * INTO prod FROM wms_products WHERE company_id=c AND id=p;
 IF NOT FOUND OR q<=0 OR q>=1000000000000 OR scale(q)>6 OR u NOT IN('BASE','CARTON') OR(u='CARTON' AND prod.base_unit<>'PIECE')
 THEN RAISE EXCEPTION 'WMS_INVALID_QUANTITY' USING ERRCODE='23514'; END IF;
 n=q*CASE WHEN u='CARTON' THEN prod.pieces_per_carton ELSE 1 END;
 IF prod.base_unit='PIECE' AND n<>trunc(n) THEN RAISE EXCEPTION 'WMS_FRACTIONAL_PIECE' USING ERRCODE='23514'; END IF;RETURN n;
END $$;

CREATE FUNCTION wms_return_command(c TEXT,w TEXT,op TEXT,body JSONB,actor TEXT,new_id TEXT,event TEXT) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE d TEXT;doc wms_returns;item JSONB;src RECORD;line RECORD;lot RECORD;previous TEXT;target TEXT;v_kind TEXT;
 note TEXT=body->>'note';q NUMERIC;declared NUMERIC;used NUMERIC;factor INTEGER;n INTEGER=0;held NUMERIC;
BEGIN
 v_kind=CASE WHEN left(op,9)='supplier.' THEN 'SUPPLIER' ELSE 'REP' END;
 IF op IN('supplier.create','rep-return.create') THEN
  d=new_id;
  IF v_kind='SUPPLIER' THEN
   PERFORM 1 FROM wms_receipts WHERE company_id=c AND warehouse_id=w AND id=body->>'sourceId' AND status='POSTED';
  ELSE
   PERFORM 1 FROM wms_load_requests WHERE company_id=c AND warehouse_id=w AND id=body->>'sourceId' AND status='ACCEPTED';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'WMS_RETURN_SOURCE_NOT_FOUND' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(body->'lines')<>'array' OR jsonb_array_length(body->'lines') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'WMS_DOCUMENT_LIMIT' USING ERRCODE='23514'; END IF;
  INSERT INTO wms_returns(id,company_id,warehouse_id,kind,reference,receipt_id,load_id,reason,created_by)
   VALUES(d,c,w,v_kind,body->>'reference',CASE WHEN v_kind='SUPPLIER' THEN body->>'sourceId' END,CASE WHEN v_kind='REP' THEN body->>'sourceId' END,note,actor);
  FOR item IN SELECT value FROM jsonb_array_elements(body->'lines') LOOP
   n=n+1;
   IF v_kind='SUPPLIER' THEN SELECT product_id,batch_id INTO src FROM wms_receipt_lines WHERE company_id=c AND receipt_id=body->>'sourceId' AND id=item->>'sourceLineId' AND accepted_base+quarantined_base>0;
   ELSE SELECT product_id,batch_id INTO src FROM wms_allocations WHERE company_id=c AND load_id=body->>'sourceId' AND id=item->>'sourceLineId' AND dispatched_quantity>0;END IF;
   IF NOT FOUND THEN RAISE EXCEPTION 'WMS_RETURN_LINE_NOT_FOUND' USING ERRCODE='23514'; END IF;
   q=wms_return_quantity(c,src.product_id,(item->>'actualQuantity')::numeric,item->>'unit');
   declared=wms_return_quantity(c,src.product_id,(item->>'declaredQuantity')::numeric,item->>'unit');
   SELECT CASE WHEN item->>'unit'='CARTON' THEN pieces_per_carton ELSE 1 END INTO factor FROM wms_products WHERE company_id=c AND id=src.product_id;
   INSERT INTO wms_return_lines(id,company_id,return_id,receipt_line_id,allocation_id,product_id,batch_id,input_unit,conversion_factor,declared_quantity,actual_quantity,quantity_base,quality,from_quarantine,discrepancy_reason)
    VALUES(d||':'||n,c,d,CASE WHEN v_kind='SUPPLIER' THEN item->>'sourceLineId' END,CASE WHEN v_kind='REP' THEN item->>'sourceLineId' END,
    src.product_id,src.batch_id,item->>'unit',factor,(item->>'declaredQuantity')::numeric,(item->>'actualQuantity')::numeric,q,item->>'quality',
    CASE WHEN v_kind='SUPPLIER' THEN COALESCE((item->>'fromQuarantine')::boolean,false) ELSE false END,COALESCE(item->>'discrepancyReason',''));
  END LOOP;previous=NULL;target='DRAFT';
 ELSE
  d=body->>'id';SELECT * INTO doc FROM wms_returns WHERE company_id=c AND warehouse_id=w AND id=d AND wms_returns.kind=v_kind FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WMS_DOCUMENT_NOT_FOUND' USING ERRCODE='23514'; END IF;
  IF doc.version<>(body->>'version')::integer THEN RAISE EXCEPTION 'WMS_DOCUMENT_STALE' USING ERRCODE='23514'; END IF;previous=doc.status;
  IF op IN('supplier.submit','rep-return.submit') AND doc.status='DRAFT' THEN target='SUBMITTED';
  ELSIF op IN('supplier.review','rep-return.review') AND doc.status='SUBMITTED' THEN target='REVIEWED';
  ELSIF op IN('supplier.post','rep-return.post') AND doc.status='REVIEWED' THEN target=CASE WHEN v_kind='SUPPLIER' THEN 'DISPATCHED' ELSE 'POSTED' END;
  ELSIF op='supplier.confirm' AND doc.status='DISPATCHED' AND length(body->>'handoverReference') BETWEEN 1 AND 80 THEN target='COMPLETED';
  ELSIF op IN('supplier.cancel','rep-return.cancel') AND doc.status IN('DRAFT','SUBMITTED','REVIEWED') THEN target='CANCELLED';
  ELSE RAISE EXCEPTION 'WMS_INVALID_TRANSITION' USING ERRCODE='23514'; END IF;
 END IF;
 INSERT INTO wms_operation_events(id,company_id,warehouse_id,return_id,operation,actor_id,from_status,to_status,note) VALUES(event,c,w,d,op,actor,previous,target,note);
 IF op IN('supplier.post','rep-return.post') THEN
  IF v_kind='SUPPLIER' THEN PERFORM 1 FROM wms_receipts WHERE company_id=c AND warehouse_id=w AND id=doc.receipt_id AND status='POSTED' FOR UPDATE;
  ELSE PERFORM 1 FROM wms_load_requests WHERE company_id=c AND warehouse_id=w AND id=doc.load_id AND status='ACCEPTED' FOR UPDATE; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'WMS_RETURN_SOURCE_NOT_FOUND' USING ERRCODE='23514'; END IF;
  PERFORM p.id FROM wms_products p WHERE p.company_id=c AND p.id IN(SELECT product_id FROM wms_return_lines WHERE company_id=c AND return_id=d) ORDER BY p.id FOR UPDATE;
  FOR line IN SELECT * FROM wms_return_lines WHERE company_id=c AND return_id=d ORDER BY product_id,batch_id,id FOR UPDATE LOOP
   q=line.quantity_base;
   IF v_kind='SUPPLIER' THEN
    SELECT accepted_base+quarantined_base AS maximum INTO src FROM wms_receipt_lines WHERE company_id=c AND receipt_id=doc.receipt_id AND id=line.receipt_line_id;
    SELECT COALESCE(sum(l.quantity_base),0) INTO used FROM wms_return_lines l JOIN wms_returns r ON r.company_id=c AND r.id=l.return_id
     WHERE l.company_id=c AND l.receipt_line_id=line.receipt_line_id AND r.status IN('DISPATCHED','COMPLETED');
   ELSE
    SELECT dispatched_quantity AS maximum INTO src FROM wms_allocations WHERE company_id=c AND load_id=doc.load_id AND id=line.allocation_id;
    SELECT COALESCE(sum(l.quantity_base),0) INTO used FROM wms_return_lines l JOIN wms_returns r ON r.company_id=c AND r.id=l.return_id
     WHERE l.company_id=c AND l.allocation_id=line.allocation_id AND r.status='POSTED';
   END IF;
   IF src.maximum IS NULL OR q+used>src.maximum THEN RAISE EXCEPTION 'WMS_RETURN_EXCEEDS_SOURCE' USING ERRCODE='23514'; END IF;
   PERFORM 1 FROM wms_positions WHERE company_id=c AND warehouse_id=w AND batch_id=line.batch_id FOR UPDATE;
   SELECT b.*,p.is_active,p.track_expiry,s.quality_blocked INTO lot FROM wms_batches b JOIN wms_products p ON p.company_id=c AND p.id=b.product_id
    JOIN wms_positions s ON s.company_id=c AND s.warehouse_id=w AND s.batch_id=b.id WHERE b.company_id=c AND b.id=line.batch_id;
   IF v_kind='SUPPLIER' THEN
    IF NOT EXISTS(SELECT 1 FROM wms_positions WHERE company_id=c AND warehouse_id=w AND batch_id=line.batch_id AND
      CASE WHEN line.from_quarantine THEN quarantined>=q ELSE physical-reserved-quarantined>=q END)
    THEN RAISE EXCEPTION 'WMS_INSUFFICIENT_STOCK' USING ERRCODE='23514'; END IF;
    PERFORM wms_append(c,w,line.batch_id,'SUPPLIER_RETURN',-q,CASE WHEN line.from_quarantine THEN -q ELSE 0 END,0,0,-line.actual_quantity,line.input_unit,line.conversion_factor,event,actor,note);
    UPDATE wms_return_lines SET destination='SUPPLIER' WHERE company_id=c AND id=line.id;
   ELSE
    UPDATE wms_custody_positions SET quantity=quantity-q,updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE company_id=c AND warehouse_id=w AND recipient_id=(SELECT recipient_id FROM wms_load_requests WHERE company_id=c AND id=doc.load_id) AND batch_id=line.batch_id AND quantity>=q;
    IF NOT FOUND THEN RAISE EXCEPTION 'WMS_CUSTODY_INSUFFICIENT' USING ERRCODE='23514'; END IF;
    held=CASE WHEN line.quality<>'GOOD' OR NOT lot.is_active OR lot.is_quarantined OR lot.quality_blocked OR(lot.track_expiry AND lot.expiry_date IS NULL)
     OR lot.expiry_date<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date THEN q ELSE 0 END;
    PERFORM wms_append(c,w,line.batch_id,'REP_RETURN',q,held,0,0,line.actual_quantity,line.input_unit,line.conversion_factor,event,actor,note);
    UPDATE wms_return_lines SET destination=CASE WHEN held>0 THEN 'QUARANTINED' ELSE 'AVAILABLE' END WHERE company_id=c AND id=line.id;
   END IF;
  END LOOP;
 END IF;
 IF previous IS NOT NULL THEN UPDATE wms_returns SET status=target,version=version+1,handover_reference=COALESCE(body->>'handoverReference',handover_reference),updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE company_id=c AND id=d;END IF;
 RETURN jsonb_build_object('id',d,'status',target,'eventId',event);
END $$;

CREATE FUNCTION wms_core_execute(c TEXT,w TEXT,op TEXT,body JSONB,actor TEXT,k TEXT,new_id TEXT) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE old wms_commands;cmd JSONB=jsonb_build_object('warehouse',w,'operation',op,'body',body,'actor',actor);
 result JSONB;event TEXT='evt-'||new_id;v_fingerprint TEXT;canonical JSONB;proposal wms_loading_proposals;item JSONB;prod wms_products;
 existing TEXT;b TEXT;blocked BOOLEAN;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(c||':command:'||k,0));
 SELECT * INTO old FROM wms_commands WHERE company_id=c AND idempotency_key=k;
 -- Existing Phase02 commands retain their original command envelope and retry behavior.
 IF FOUND THEN
  IF old.command=cmd THEN RETURN old.result;END IF;
  IF op NOT LIKE 'supplier.%' AND op NOT LIKE 'rep-return.%' AND op NOT LIKE 'quality.%' AND op<>'proposal.create'
   THEN RETURN wms_execute(c,w,op,body,actor,k,new_id);END IF;
  RAISE EXCEPTION 'WMS_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514';
 END IF;
 PERFORM 1 FROM warehouses WHERE company_id=c AND id=w AND is_active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WMS_WAREHOUSE_NOT_FOUND' USING ERRCODE='23514'; END IF;
 IF op LIKE 'supplier.%' OR op LIKE 'rep-return.%' THEN result=wms_return_command(c,w,op,body,actor,new_id,event);
 ELSIF op LIKE 'quality.%' THEN
  b=body->>'batchId';PERFORM p.id FROM wms_products p JOIN wms_batches batch ON batch.company_id=c AND batch.product_id=p.id AND batch.id=b WHERE p.company_id=c FOR UPDATE OF p;
  SELECT quality_blocked INTO blocked FROM wms_positions WHERE company_id=c AND warehouse_id=w AND batch_id=b FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WMS_POSITION_NOT_FOUND' USING ERRCODE='23514'; END IF;
  IF op NOT IN('quality.hold','quality.unblock') OR blocked=(op='quality.hold') THEN RAISE EXCEPTION 'WMS_INVALID_TRANSITION' USING ERRCODE='23514'; END IF;
  INSERT INTO wms_operation_events(id,company_id,warehouse_id,quality_batch_id,operation,actor_id,from_status,to_status,note) VALUES(event,c,w,b,op,actor,CASE WHEN blocked THEN 'BLOCKED' ELSE 'CLEAR' END,CASE WHEN op='quality.hold' THEN 'BLOCKED' ELSE 'CLEAR' END,body->>'note');
  UPDATE wms_positions SET quality_blocked=(op='quality.hold') WHERE company_id=c AND warehouse_id=w AND batch_id=b;
  PERFORM wms_append(c,w,b,CASE WHEN op='quality.hold' THEN 'QUALITY_HOLD' ELSE 'QUALITY_RELEASE' END,0,0,0,0,0,'BASE',1,event,actor,body->>'note');
  result=jsonb_build_object('id',b,'status',CASE WHEN op='quality.hold' THEN 'BLOCKED' ELSE 'CLEAR' END,'eventId',event);
 ELSIF op='proposal.create' THEN
  IF jsonb_typeof(body->'lines')<>'array' OR jsonb_array_length(body->'lines') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'WMS_DOCUMENT_LIMIT' USING ERRCODE='23514'; END IF;
  SELECT jsonb_agg(jsonb_build_object('productCode',upper(value->>'productCode'),'quantity',trim_scale((value->>'quantity')::numeric)::text) ORDER BY upper(value->>'productCode')) INTO canonical FROM jsonb_array_elements(body->'lines');
  v_fingerprint=md5(jsonb_build_object('date',body->>'targetDate','lines',canonical)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(c||':proposal:'||v_fingerprint,0));
  SELECT * INTO proposal FROM wms_loading_proposals WHERE company_id=c AND wms_loading_proposals.fingerprint=v_fingerprint;
  IF FOUND THEN
   IF proposal.warehouse_id<>w OR proposal.confirmed_payload<>body THEN RAISE EXCEPTION 'WMS_PROPOSAL_CONFLICT' USING ERRCODE='23514'; END IF;
   SELECT jsonb_build_object('id',proposal.id,'status','PROPOSED','eventId',id) INTO result FROM wms_operation_events WHERE company_id=c AND proposal_id=proposal.id ORDER BY created_at LIMIT 1;
  ELSE
   INSERT INTO wms_loading_proposals(id,company_id,warehouse_id,author_id,target_date,fingerprint,confirmed_payload) VALUES(new_id,c,w,actor,(body->>'targetDate')::date,v_fingerprint,body);
   PERFORM p.id FROM wms_products p WHERE p.company_id=c AND p.code IN(SELECT upper(value->>'productCode') FROM jsonb_array_elements(body->'lines')) ORDER BY p.id FOR UPDATE;
   FOR item IN SELECT value FROM jsonb_array_elements(body->'lines') LOOP
    SELECT * INTO prod FROM wms_products WHERE company_id=c AND code=upper(item->>'productCode') AND is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'WMS_PRODUCT_MAPPING_REQUIRED' USING ERRCODE='23514'; END IF;
    INSERT INTO wms_proposal_lines(company_id,proposal_id,product_id,product_code,input_quantity,input_unit,conversion_factor,quantity_base)
     VALUES(c,new_id,prod.id,prod.code,(item->>'quantity')::numeric,item->>'unit',CASE WHEN item->>'unit'='CARTON' THEN prod.pieces_per_carton ELSE 1 END,wms_quantity(c,prod.id,(item->>'quantity')::numeric,item->>'unit'));
   END LOOP;
   INSERT INTO wms_operation_events(id,company_id,warehouse_id,proposal_id,operation,actor_id,to_status,note) VALUES(event,c,w,new_id,op,actor,'PROPOSED',body->>'note');
   result=jsonb_build_object('id',new_id,'status','PROPOSED','eventId',event);
  END IF;
 ELSE
  IF op='load.create' AND body->>'source'='SMART_LOADING' THEN
   SELECT * INTO proposal FROM wms_loading_proposals WHERE company_id=c AND warehouse_id=w AND id=body->>'proposalId' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'WMS_PROPOSAL_REQUIRED' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM wms_load_requests WHERE company_id=c AND proposal_id=proposal.id) THEN RAISE EXCEPTION 'WMS_PROPOSAL_ALREADY_CONVERTED' USING ERRCODE='23514'; END IF;
   IF proposal.target_date<>(body->>'targetDate')::date OR jsonb_array_length(body->'lines')<>(SELECT count(*) FROM wms_proposal_lines WHERE company_id=c AND proposal_id=proposal.id)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(body->'lines') l WHERE NOT EXISTS(SELECT 1 FROM wms_proposal_lines p WHERE p.company_id=c AND p.proposal_id=proposal.id AND p.product_code=upper(l->>'productCode') AND p.input_quantity=(l->>'quantity')::numeric AND p.input_unit=l->>'unit'))
   THEN RAISE EXCEPTION 'WMS_PROPOSAL_CONFLICT' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM wms_proposal_lines p JOIN wms_products m ON m.company_id=c AND m.id=p.product_id WHERE p.company_id=c AND p.proposal_id=proposal.id AND p.quantity_base<>wms_quantity(c,p.product_id,p.input_quantity,p.input_unit))
   THEN RAISE EXCEPTION 'WMS_PROPOSAL_CONFLICT' USING ERRCODE='23514'; END IF;
  ELSIF op='load.create' AND body->>'proposalId' IS NOT NULL THEN RAISE EXCEPTION 'WMS_PROPOSAL_CONFLICT' USING ERRCODE='23514'; END IF;
  IF op IN('receipt.approve','load.accept') THEN
   IF op='receipt.approve' THEN
    PERFORM 1 FROM wms_receipts WHERE company_id=c AND warehouse_id=w AND id=body->>'id' FOR UPDATE;
    PERFORM p.id FROM wms_products p WHERE p.company_id=c AND p.id IN(SELECT product_id FROM wms_receipt_lines WHERE company_id=c AND receipt_id=body->>'id') ORDER BY p.id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM wms_receipt_lines l JOIN wms_batches b ON b.company_id=c AND b.product_id=l.product_id AND(b.id=l.batch_id OR b.code=l.batch_code) JOIN wms_positions s ON s.company_id=c AND s.warehouse_id=w AND s.batch_id=b.id WHERE l.company_id=c AND l.receipt_id=body->>'id' AND l.accepted_base>0 AND s.quality_blocked)
    THEN RAISE EXCEPTION 'WMS_BATCH_QUARANTINED' USING ERRCODE='23514'; END IF;
    IF EXISTS(SELECT 1 FROM wms_receipt_lines l LEFT JOIN wms_batches b ON b.company_id=c AND b.id=l.batch_id WHERE l.company_id=c AND l.receipt_id=body->>'id' AND l.accepted_base>0 AND COALESCE(b.expiry_date,l.expiry_date)<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)
    THEN RAISE EXCEPTION 'WMS_EXPIRED_MUST_BE_QUARANTINED' USING ERRCODE='23514'; END IF;
   ELSE
    PERFORM 1 FROM wms_load_requests WHERE company_id=c AND warehouse_id=w AND id=body->>'id' FOR UPDATE;
    PERFORM p.id FROM wms_products p WHERE p.company_id=c AND p.id IN(SELECT product_id FROM wms_load_lines WHERE company_id=c AND load_id=body->>'id') ORDER BY p.id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM wms_allocations a JOIN wms_positions s ON s.company_id=c AND s.warehouse_id=w AND s.batch_id=a.batch_id WHERE a.company_id=c AND a.load_id=body->>'id' AND a.dispatched_quantity>0 AND s.quality_blocked)
    THEN RAISE EXCEPTION 'WMS_QUALITY_OR_STOCK_BLOCKED' USING ERRCODE='23514'; END IF;
   END IF;
  END IF;
  result=wms_execute(c,w,op,body,actor,k,new_id);
  IF op='load.create' AND proposal.id IS NOT NULL THEN UPDATE wms_load_requests SET proposal_id=proposal.id WHERE company_id=c AND id=result->>'id';END IF;
  RETURN result;
 END IF;
 INSERT INTO wms_commands(company_id,idempotency_key,command,result,event_id) VALUES(c,k,cmd,result,result->>'eventId');RETURN result;
END $$;

INSERT INTO permissions(id,code,description) VALUES
 ('perm-wms-supplier-return-create','wms.supplier-return.create','Create supplier return documents'),('perm-wms-supplier-return-review','wms.supplier-return.review','Review supplier returns'),('perm-wms-supplier-return-post','wms.supplier-return.post','Dispatch supplier returns and confirm handover'),
 ('perm-wms-rep-return-create','wms.rep-return.create','Record actual representative returns'),('perm-wms-rep-return-review','wms.rep-return.review','Review representative returns'),('perm-wms-rep-return-post','wms.rep-return.post','Post representative return receipts'),('perm-wms-quality','wms.quality.manage','Block/unblock warehouse stock with reason')
ON CONFLICT(code) DO NOTHING;

CREATE FUNCTION wms_return_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM wms_returns WHERE company_id=OLD.company_id AND id=OLD.return_id AND status IN('DISPATCHED','COMPLETED','POSTED')) THEN RAISE EXCEPTION 'WMS_LEDGER_IMMUTABLE' USING ERRCODE='23514';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE TRIGGER wms_return_history_guard BEFORE UPDATE OR DELETE ON wms_return_lines FOR EACH ROW EXECUTE FUNCTION wms_return_history_guard();
CREATE INDEX wms_custody_scope ON wms_custody_positions(company_id,warehouse_id,recipient_id,batch_id) WHERE quantity>0;
CREATE FUNCTION wms_return_document_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR NEW.company_id<>OLD.company_id OR NEW.warehouse_id<>OLD.warehouse_id OR NEW.kind<>OLD.kind OR NEW.reference<>OLD.reference
 OR NEW.receipt_id IS DISTINCT FROM OLD.receipt_id OR NEW.load_id IS DISTINCT FROM OLD.load_id OR NEW.reason<>OLD.reason OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR OLD.status IN('POSTED','COMPLETED','CANCELLED') OR(OLD.status='DISPATCHED' AND NEW.status<>'COMPLETED') THEN RAISE EXCEPTION 'WMS_LEDGER_IMMUTABLE' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER wms_return_document_guard BEFORE UPDATE OR DELETE ON wms_returns FOR EACH ROW EXECUTE FUNCTION wms_return_document_guard();

COMMIT;
