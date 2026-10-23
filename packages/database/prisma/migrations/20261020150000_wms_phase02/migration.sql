-- Additive operational documents only. No company activation, role grants,
-- external integrations or analytical/canonical writes.
ALTER TABLE wms_positions ADD COLUMN in_transit NUMERIC(24,6) NOT NULL DEFAULT 0 CHECK(in_transit>=0);

CREATE TABLE wms_customer_policies (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  customer_code TEXT NOT NULL, min_shelf_life_days INTEGER NOT NULL CHECK(min_shelf_life_days BETWEEN 0 AND 3650),
  version INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  PRIMARY KEY(company_id,customer_code)
);
CREATE TABLE wms_receipts (
  id TEXT PRIMARY KEY,company_id TEXT NOT NULL,warehouse_id TEXT NOT NULL,
  reference TEXT NOT NULL,supplier_name TEXT NOT NULL,supplier_reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SUBMITTED','REVIEWED','POSTED','CANCELLED','REVERSED')),
  version INTEGER NOT NULL DEFAULT 1,created_by TEXT NOT NULL,reviewed_by TEXT,posted_by TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  UNIQUE(company_id,id),UNIQUE(company_id,warehouse_id,reference),
  FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,created_by) REFERENCES users(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,reviewed_by) REFERENCES users(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,posted_by) REFERENCES users(company_id,id) ON DELETE RESTRICT,
  CHECK(length(reference) BETWEEN 1 AND 80 AND length(supplier_name) BETWEEN 1 AND 160 AND length(supplier_reference) BETWEEN 1 AND 80)
);
CREATE INDEX wms_receipts_scope_created ON wms_receipts(company_id,warehouse_id,created_at DESC,id DESC);
CREATE TABLE wms_receipt_lines (
  id TEXT PRIMARY KEY,company_id TEXT NOT NULL,receipt_id TEXT NOT NULL,product_id TEXT NOT NULL,batch_id TEXT,
  lot_key TEXT NOT NULL,batch_code TEXT,production_date DATE,expiry_date DATE,
  input_unit TEXT NOT NULL CHECK(input_unit IN ('BASE','CARTON')),conversion_factor INTEGER NOT NULL CHECK(conversion_factor>0),
  expected_quantity NUMERIC(24,6) NOT NULL,accepted_quantity NUMERIC(24,6) NOT NULL,quarantined_quantity NUMERIC(24,6) NOT NULL,rejected_quantity NUMERIC(24,6) NOT NULL,
  accepted_base NUMERIC(24,6) NOT NULL,quarantined_base NUMERIC(24,6) NOT NULL,rejected_base NUMERIC(24,6) NOT NULL,
  rejection_reason TEXT NOT NULL DEFAULT '',
  UNIQUE(company_id,id),UNIQUE(company_id,receipt_id,product_id,lot_key),
  FOREIGN KEY(company_id,receipt_id) REFERENCES wms_receipts(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,product_id) REFERENCES wms_products(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,product_id,batch_id) REFERENCES wms_batches(company_id,product_id,id) ON DELETE RESTRICT,
  CHECK(expected_quantity>0 AND accepted_quantity>=0 AND quarantined_quantity>=0 AND rejected_quantity>=0),
  CHECK(accepted_quantity+quarantined_quantity+rejected_quantity>0 AND accepted_quantity+quarantined_quantity+rejected_quantity<=expected_quantity),
  CHECK(accepted_base=accepted_quantity*conversion_factor AND quarantined_base=quarantined_quantity*conversion_factor AND rejected_base=rejected_quantity*conversion_factor),
  CHECK((quarantined_quantity+rejected_quantity=0) OR length(rejection_reason) BETWEEN 3 AND 300),
  CHECK(production_date IS NULL OR expiry_date IS NULL OR expiry_date>production_date)
);
CREATE INDEX wms_receipt_lines_parent ON wms_receipt_lines(company_id,receipt_id,id);
CREATE TABLE wms_load_requests (
  id TEXT PRIMARY KEY,company_id TEXT NOT NULL,warehouse_id TEXT NOT NULL,reference TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('MANUAL','SMART_LOADING')),recipient_id TEXT NOT NULL,
  customer_code TEXT,target_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','RESERVED','PICKED','REVIEWED','APPROVED','IN_TRANSIT','ACCEPTED','RETURN_REQUESTED','RETURNED','CANCELLED')),
  version INTEGER NOT NULL DEFAULT 1,created_by TEXT NOT NULL,reviewed_by TEXT,approved_by TEXT,
  discrepancy_reason TEXT,created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  UNIQUE(company_id,id),UNIQUE(company_id,warehouse_id,reference),
  FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,recipient_id) REFERENCES users(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,created_by) REFERENCES users(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,reviewed_by) REFERENCES users(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,approved_by) REFERENCES users(company_id,id) ON DELETE RESTRICT,
  CHECK(length(reference) BETWEEN 1 AND 80)
);
CREATE INDEX wms_load_scope_created ON wms_load_requests(company_id,warehouse_id,created_at DESC,id DESC);
CREATE INDEX wms_load_recipient_status ON wms_load_requests(company_id,recipient_id,status,id);
CREATE TABLE wms_load_lines (
  id TEXT PRIMARY KEY,company_id TEXT NOT NULL,load_id TEXT NOT NULL,product_id TEXT NOT NULL,
  input_quantity NUMERIC(24,6) NOT NULL CHECK(input_quantity>0),input_unit TEXT NOT NULL CHECK(input_unit IN ('BASE','CARTON')),
  conversion_factor INTEGER NOT NULL CHECK(conversion_factor>0),requested_base NUMERIC(24,6) NOT NULL CHECK(requested_base>0),
  UNIQUE(company_id,id),UNIQUE(company_id,load_id,product_id),
  FOREIGN KEY(company_id,load_id) REFERENCES wms_load_requests(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,product_id) REFERENCES wms_products(company_id,id) ON DELETE RESTRICT,
  CHECK(requested_base=input_quantity*conversion_factor)
);
CREATE TABLE wms_allocations (
  id TEXT PRIMARY KEY,company_id TEXT NOT NULL,load_id TEXT NOT NULL,product_id TEXT NOT NULL,batch_id TEXT NOT NULL,
  allocated_quantity NUMERIC(24,6) NOT NULL CHECK(allocated_quantity>0),reserved_quantity NUMERIC(24,6) NOT NULL CHECK(reserved_quantity>=0),
  picked_quantity NUMERIC(24,6) NOT NULL DEFAULT 0 CHECK(picked_quantity>=0),dispatched_quantity NUMERIC(24,6) NOT NULL DEFAULT 0 CHECK(dispatched_quantity>=0),
  reason TEXT NOT NULL,policy_min_days INTEGER NOT NULL,
  UNIQUE(company_id,id),UNIQUE(company_id,load_id,batch_id),
  FOREIGN KEY(company_id,load_id,product_id) REFERENCES wms_load_lines(company_id,load_id,product_id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,product_id,batch_id) REFERENCES wms_batches(company_id,product_id,id) ON DELETE RESTRICT,
  CHECK(reserved_quantity<=allocated_quantity AND picked_quantity<=allocated_quantity AND dispatched_quantity<=picked_quantity)
);
CREATE INDEX wms_allocations_parent ON wms_allocations(company_id,load_id,id);
CREATE TABLE wms_custody_positions (
  company_id TEXT NOT NULL,recipient_id TEXT NOT NULL,warehouse_id TEXT NOT NULL,batch_id TEXT NOT NULL,
  quantity NUMERIC(24,6) NOT NULL CHECK(quantity>=0),updated_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  PRIMARY KEY(company_id,recipient_id,warehouse_id,batch_id),
  FOREIGN KEY(company_id,recipient_id) REFERENCES users(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,batch_id) REFERENCES wms_batches(company_id,id) ON DELETE RESTRICT
);
CREATE TABLE wms_operation_events (
  id TEXT PRIMARY KEY,company_id TEXT NOT NULL,warehouse_id TEXT NOT NULL,receipt_id TEXT,load_id TEXT,
  operation TEXT NOT NULL,actor_id TEXT NOT NULL,from_status TEXT,to_status TEXT NOT NULL,note TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  UNIQUE(company_id,id),
  FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,receipt_id) REFERENCES wms_receipts(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,load_id) REFERENCES wms_load_requests(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,actor_id) REFERENCES users(company_id,id) ON DELETE RESTRICT,
  CHECK((receipt_id IS NOT NULL)::int+(load_id IS NOT NULL)::int=1)
);
CREATE INDEX wms_events_receipt ON wms_operation_events(company_id,receipt_id,created_at DESC,id DESC);
CREATE INDEX wms_events_load ON wms_operation_events(company_id,load_id,created_at DESC,id DESC);
CREATE TABLE wms_commands (
  company_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, command JSONB NOT NULL,result JSONB NOT NULL,event_id TEXT NOT NULL,
  PRIMARY KEY(company_id,idempotency_key),
  FOREIGN KEY(company_id,event_id) REFERENCES wms_operation_events(company_id,id) ON DELETE RESTRICT
);
CREATE TRIGGER wms_events_immutable BEFORE UPDATE OR DELETE ON wms_operation_events FOR EACH ROW EXECUTE FUNCTION wms_immutable_movement();
CREATE TRIGGER wms_commands_immutable BEFORE UPDATE OR DELETE ON wms_commands FOR EACH ROW EXECUTE FUNCTION wms_immutable_movement();
ALTER TABLE wms_movements ADD COLUMN reserved_delta NUMERIC(24,6) NOT NULL DEFAULT 0,
  ADD COLUMN in_transit_delta NUMERIC(24,6) NOT NULL DEFAULT 0,ADD COLUMN event_id TEXT,
  ADD FOREIGN KEY(company_id,event_id) REFERENCES wms_operation_events(company_id,id) ON DELETE RESTRICT;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT conname FROM pg_constraint WHERE conrelid='wms_movements'::regclass AND contype='c'
    AND (pg_get_constraintdef(oid) LIKE '%kind%' OR conname='wms_movements_quantity_check') LOOP
    EXECUTE format('ALTER TABLE wms_movements DROP CONSTRAINT %I',r.conname);
  END LOOP;
END $$;
ALTER TABLE wms_movements ADD CHECK(kind IN ('OPENING','REVERSAL','RECEIPT','RECEIPT_REVERSAL','RESERVE','RELEASE','DISPATCH','ACCEPT','TRANSIT_RETURN')),
  ADD CHECK((kind IN ('OPENING','RECEIPT','TRANSIT_RETURN') AND quantity>0 AND reversal_of IS NULL)
    OR (kind='REVERSAL' AND quantity<0 AND reversal_of IS NOT NULL)
    OR (kind IN ('RECEIPT_REVERSAL','DISPATCH') AND quantity<0 AND reversal_of IS NULL)
    OR (kind IN ('RESERVE','RELEASE','ACCEPT') AND quantity=0 AND reversal_of IS NULL)),
  ADD CHECK((kind='RESERVE' AND reserved_delta>0) OR (kind='RELEASE' AND reserved_delta<0)
    OR kind NOT IN ('RESERVE','RELEASE'));
CREATE INDEX wms_movements_event ON wms_movements(company_id,event_id);

-- Preserve the view's existing columns and append transit for compatibility.
CREATE OR REPLACE VIEW wms_inventory_state AS
SELECT s.company_id,s.warehouse_id,s.batch_id,b.product_id,p.base_unit,s.physical,s.reserved,s.quarantined,
  CASE WHEN b.expiry_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date OR b.is_quarantined OR NOT p.is_active
    THEN 0::numeric ELSE s.physical-s.reserved-s.quarantined END AS available,
  CASE WHEN b.expiry_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date THEN s.physical ELSE 0::numeric END AS expired,
  b.expiry_date-(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AS days_remaining,
  CASE WHEN b.production_date IS NOT NULL AND b.expiry_date IS NOT NULL THEN LEAST(100::numeric,GREATEST(0::numeric,
    ROUND(100.0*((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date-b.production_date)/(b.expiry_date-b.production_date),2))) ELSE NULL END AS life_consumed_pct,
  s.in_transit
FROM wms_positions s JOIN wms_batches b ON b.company_id=s.company_id AND b.id=s.batch_id
JOIN wms_products p ON p.company_id=b.company_id AND p.id=b.product_id;

CREATE FUNCTION wms_quantity(c TEXT,p TEXT,q NUMERIC,u TEXT) RETURNS NUMERIC LANGUAGE plpgsql AS $$
DECLARE prod wms_products; n NUMERIC;
BEGIN
  SELECT * INTO prod FROM wms_products WHERE company_id=c AND id=p AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'WMS_PRODUCT_NOT_FOUND' USING ERRCODE='23514'; END IF;
  IF q IS NULL OR q<0 OR q>=1000000000000 OR q<>trunc(q,6) OR u IS NULL OR u NOT IN ('BASE','CARTON')
    OR (u='CARTON' AND prod.base_unit<>'PIECE') THEN RAISE EXCEPTION 'WMS_INVALID_QUANTITY' USING ERRCODE='23514'; END IF;
  n=q*CASE WHEN u='CARTON' THEN prod.pieces_per_carton ELSE 1 END;
  IF prod.base_unit='PIECE' AND n<>trunc(n) THEN RAISE EXCEPTION 'WMS_FRACTIONAL_PIECE' USING ERRCODE='23514'; END IF;
  RETURN n;
END $$;
CREATE FUNCTION wms_min_days(c TEXT,customer TEXT) RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT min_shelf_life_days FROM wms_customer_policies WHERE company_id=c AND customer_code=customer),0);
$$;
CREATE FUNCTION wms_fefo(c TEXT,w TEXT,p TEXT,q NUMERIC,delivery DATE,min_days INTEGER)
RETURNS TABLE(batch_id TEXT,quantity NUMERIC,available NUMERIC,expiry_date DATE,reason TEXT) LANGUAGE sql STABLE AS $$
  WITH eligible AS (
    SELECT s.batch_id,s.available,b.expiry_date,
      sum(s.available) OVER(ORDER BY b.expiry_date ASC NULLS LAST,b.id ROWS UNBOUNDED PRECEDING)-s.available AS preceding
    FROM wms_inventory_state s JOIN wms_batches b ON b.company_id=c AND b.id=s.batch_id
    WHERE s.company_id=c AND s.warehouse_id=w AND s.product_id=p AND s.available>0
      AND ((b.expiry_date IS NULL AND min_days=0) OR (b.expiry_date>GREATEST(delivery,(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)
        AND b.expiry_date>=GREATEST(delivery,(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)+min_days))
  ) SELECT batch_id,LEAST(available,q-preceding),available,expiry_date,
    CASE WHEN expiry_date IS NULL THEN 'UNDATED_AFTER_ELIGIBLE_DATED_LOTS' ELSE 'EARLIEST_ELIGIBLE_EXPIRY' END
    FROM eligible WHERE preceding<q ORDER BY expiry_date ASC NULLS LAST,batch_id LIMIT 101;
$$;
CREATE FUNCTION wms_check_allocation(c TEXT,w TEXT,b TEXT,q NUMERIC,delivery DATE,min_days INTEGER,require_reserved BOOLEAN)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE stock record;
BEGIN
  SELECT s.physical,s.reserved,s.quarantined,p.is_active,batch.is_quarantined,batch.expiry_date INTO stock
    FROM wms_positions s JOIN wms_batches batch ON batch.company_id=c AND batch.id=s.batch_id
    JOIN wms_products p ON p.company_id=c AND p.id=batch.product_id
    WHERE s.company_id=c AND s.warehouse_id=w AND s.batch_id=b FOR UPDATE OF s;
  IF NOT FOUND OR NOT stock.is_active OR stock.is_quarantined OR q<=0
    OR stock.physical-stock.quarantined<q OR (require_reserved AND stock.reserved<q)
    OR (stock.expiry_date IS NULL AND min_days>0)
    OR stock.expiry_date<=GREATEST(delivery,(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)
    OR stock.expiry_date<GREATEST(delivery,(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)+min_days
  THEN RAISE EXCEPTION 'WMS_QUALITY_OR_STOCK_BLOCKED' USING ERRCODE='23514'; END IF;
END $$;

-- Small stock-effect helper: workflow events exist before lines are appended.
CREATE FUNCTION wms_append(c TEXT,w TEXT,b TEXT,kind TEXT,q NUMERIC,held NUMERIC,res NUMERIC,transit NUMERIC,
  input_qty NUMERIC,u TEXT,factor INTEGER,event TEXT,actor TEXT,note TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO wms_movements(id,company_id,warehouse_id,batch_id,kind,quantity,quarantine_delta,reserved_delta,in_transit_delta,
    input_quantity,input_unit,conversion_factor,reference,reason,idempotency_key,command,event_id,actor_id)
  VALUES(event||':'||b,c,w,b,kind,q,held,res,transit,input_qty,u,factor,event,note,event||':'||b,
    jsonb_build_object('eventId',event),event,actor);
  UPDATE wms_positions SET physical=physical+q,quarantined=quarantined+held,reserved=reserved+res,in_transit=in_transit+transit,
    updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE company_id=c AND warehouse_id=w AND batch_id=b;
  IF NOT FOUND THEN RAISE EXCEPTION 'WMS_POSITION_NOT_FOUND' USING ERRCODE='23514'; END IF;
END $$;

CREATE FUNCTION wms_receipt_lines_set(c TEXT,d TEXT,lines JSONB) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE item JSONB; p TEXT; factor INTEGER; n INTEGER=0; accepted NUMERIC; held NUMERIC; rejected NUMERIC; expected NUMERIC; u TEXT;
BEGIN
  IF jsonb_typeof(lines)<>'array' OR jsonb_array_length(lines) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'WMS_DOCUMENT_LIMIT' USING ERRCODE='23514'; END IF;
  PERFORM id FROM wms_products WHERE company_id=c AND id IN(SELECT value->>'productId' FROM jsonb_array_elements(lines)) ORDER BY id FOR UPDATE;
  DELETE FROM wms_receipt_lines WHERE company_id=c AND receipt_id=d;
  FOR item IN SELECT value FROM jsonb_array_elements(lines) LOOP
    n=n+1;p=item->>'productId';u=item->>'unit';
    SELECT CASE WHEN u='CARTON' THEN pieces_per_carton ELSE 1 END INTO factor FROM wms_products WHERE company_id=c AND id=p AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'WMS_PRODUCT_NOT_FOUND' USING ERRCODE='23514'; END IF;
    expected=wms_quantity(c,p,(item->>'expectedQuantity')::numeric,u);
    accepted=wms_quantity(c,p,(item->>'acceptedQuantity')::numeric,u);
    held=wms_quantity(c,p,(item->>'quarantinedQuantity')::numeric,u);
    rejected=wms_quantity(c,p,(item->>'rejectedQuantity')::numeric,u);
    INSERT INTO wms_receipt_lines(id,company_id,receipt_id,product_id,batch_id,lot_key,batch_code,production_date,expiry_date,
      input_unit,conversion_factor,expected_quantity,accepted_quantity,quarantined_quantity,rejected_quantity,accepted_base,quarantined_base,rejected_base,rejection_reason)
    VALUES(d||':'||n,c,d,p,item->>'batchId',COALESCE(item->>'batchId',item->>'batchCode','__UNTRACKED__'),item->>'batchCode',
      (item->>'productionDate')::date,(item->>'expiryDate')::date,u,factor,(item->>'expectedQuantity')::numeric,
      (item->>'acceptedQuantity')::numeric,(item->>'quarantinedQuantity')::numeric,(item->>'rejectedQuantity')::numeric,
      accepted,held,rejected,COALESCE(item->>'rejectionReason',''));
  END LOOP;
END $$;

CREATE FUNCTION wms_receiving_command(c TEXT,w TEXT,op TEXT,body JSONB,actor TEXT,new_id TEXT,event TEXT) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE doc wms_receipts; line wms_receipt_lines; prod wms_products; lot wms_batches; d TEXT; target TEXT; previous TEXT; b TEXT;
  note TEXT=COALESCE(body->>'note','Receiving document'); qty NUMERIC;
BEGIN
  IF op='receipt.create' THEN
    d=new_id;INSERT INTO wms_receipts(id,company_id,warehouse_id,reference,supplier_name,supplier_reference,created_by)
      VALUES(d,c,w,body->>'reference',body->>'supplierName',body->>'supplierReference',actor);
    target='DRAFT';previous=NULL;
    PERFORM wms_receipt_lines_set(c,d,body->'lines');
  ELSE
    d=body->>'id';SELECT * INTO doc FROM wms_receipts WHERE company_id=c AND warehouse_id=w AND id=d FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'WMS_DOCUMENT_NOT_FOUND' USING ERRCODE='23514'; END IF;
    IF doc.version<>(body->>'version')::integer THEN RAISE EXCEPTION 'WMS_DOCUMENT_STALE' USING ERRCODE='23514'; END IF;
    previous=doc.status;
    IF op='receipt.edit' AND doc.status='DRAFT' THEN
      UPDATE wms_receipts SET reference=body->>'reference',supplier_name=body->>'supplierName',supplier_reference=body->>'supplierReference' WHERE company_id=c AND id=d;
      PERFORM wms_receipt_lines_set(c,d,body->'lines');target='DRAFT';
    ELSIF op='receipt.submit' AND doc.status='DRAFT' THEN target='SUBMITTED';
    ELSIF op='receipt.review' AND doc.status='SUBMITTED' THEN target='REVIEWED';
    ELSIF op='receipt.return-draft' AND doc.status IN('SUBMITTED','REVIEWED') THEN target='DRAFT';
    ELSIF op='receipt.approve' AND doc.status='REVIEWED' THEN target='POSTED';
    ELSIF op='receipt.cancel' AND doc.status IN('DRAFT','SUBMITTED','REVIEWED') THEN target='CANCELLED';
    ELSIF op='receipt.reverse' AND doc.status='POSTED' THEN target='REVERSED';
    ELSE RAISE EXCEPTION 'WMS_INVALID_TRANSITION' USING ERRCODE='23514'; END IF;
  END IF;
  INSERT INTO wms_operation_events(id,company_id,warehouse_id,receipt_id,operation,actor_id,from_status,to_status,note)
    VALUES(event,c,w,d,op,actor,previous,target,note);
  IF op IN('receipt.approve','receipt.reverse') THEN
    PERFORM p.id FROM wms_products p WHERE p.company_id=c AND p.id IN(SELECT product_id FROM wms_receipt_lines WHERE company_id=c AND receipt_id=d) ORDER BY p.id FOR UPDATE;
    FOR line IN SELECT * FROM wms_receipt_lines WHERE company_id=c AND receipt_id=d ORDER BY product_id,id LOOP
      qty=line.accepted_base+line.quarantined_base;
      IF op='receipt.approve' THEN
        SELECT * INTO prod FROM wms_products WHERE company_id=c AND id=line.product_id AND is_active;
        IF NOT FOUND THEN RAISE EXCEPTION 'WMS_PRODUCT_NOT_FOUND' USING ERRCODE='23514'; END IF;
        IF line.conversion_factor<>(CASE WHEN line.input_unit='CARTON' THEN prod.pieces_per_carton ELSE 1 END) THEN
          RAISE EXCEPTION 'WMS_MASTER_CHANGED' USING ERRCODE='23514'; END IF;
        lot=NULL;
        IF prod.track_batches THEN
          IF line.batch_id IS NOT NULL THEN
            SELECT * INTO lot FROM wms_batches WHERE company_id=c AND product_id=prod.id AND id=line.batch_id;
            IF NOT FOUND THEN RAISE EXCEPTION 'WMS_BATCH_REQUIRED' USING ERRCODE='23514'; END IF;
          ELSE
            IF line.batch_code IS NULL OR length(line.batch_code)=0 OR left(line.batch_code,2)='__' THEN RAISE EXCEPTION 'WMS_BATCH_REQUIRED' USING ERRCODE='23514'; END IF;
            SELECT * INTO lot FROM wms_batches WHERE company_id=c AND product_id=prod.id AND code=line.batch_code;
            IF NOT FOUND THEN
              b='lot-'||line.id;
              INSERT INTO wms_batches(id,company_id,product_id,code,production_date,expiry_date)
                VALUES(b,c,prod.id,line.batch_code,line.production_date,line.expiry_date) RETURNING * INTO lot;
            ELSIF (lot.production_date,lot.expiry_date) IS DISTINCT FROM (line.production_date,line.expiry_date) THEN
              RAISE EXCEPTION 'WMS_BATCH_METADATA_CONFLICT' USING ERRCODE='23514';
            END IF;
          END IF;
          IF (prod.track_expiry AND lot.expiry_date IS NULL) THEN RAISE EXCEPTION 'WMS_EXPIRY_REQUIRED' USING ERRCODE='23514'; END IF;
          IF lot.production_date>(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'WMS_FUTURE_PRODUCTION' USING ERRCODE='23514'; END IF;
          IF lot.is_quarantined AND line.accepted_base>0 THEN RAISE EXCEPTION 'WMS_BATCH_QUARANTINED' USING ERRCODE='23514'; END IF;
          b=lot.id;
        ELSE
          IF line.batch_id IS NOT NULL OR line.batch_code IS NOT NULL OR line.production_date IS NOT NULL OR line.expiry_date IS NOT NULL THEN
            RAISE EXCEPTION 'WMS_BATCH_NOT_ALLOWED' USING ERRCODE='23514'; END IF;
          b='untracked-'||prod.id;
          INSERT INTO wms_batches(id,company_id,product_id,code) VALUES(b,c,prod.id,'__UNTRACKED__') ON CONFLICT DO NOTHING;
        END IF;
        UPDATE wms_receipt_lines SET batch_id=b WHERE company_id=c AND id=line.id;
        IF qty>0 THEN
          INSERT INTO wms_positions(company_id,warehouse_id,batch_id) VALUES(c,w,b) ON CONFLICT DO NOTHING;
          PERFORM 1 FROM wms_positions WHERE company_id=c AND warehouse_id=w AND batch_id=b FOR UPDATE;
          PERFORM wms_append(c,w,b,'RECEIPT',qty,line.quarantined_base,0,0,line.accepted_quantity+line.quarantined_quantity,line.input_unit,line.conversion_factor,event,actor,note);
        END IF;
      ELSIF qty>0 THEN
        b=line.batch_id;
        PERFORM 1 FROM wms_positions WHERE company_id=c AND warehouse_id=w AND batch_id=b FOR UPDATE;
        IF NOT EXISTS(SELECT 1 FROM wms_positions WHERE company_id=c AND warehouse_id=w AND batch_id=b
          AND quarantined>=line.quarantined_base AND physical-reserved-quarantined>=line.accepted_base) THEN
          RAISE EXCEPTION 'WMS_REVERSAL_STOCK_CHANGED' USING ERRCODE='23514'; END IF;
        PERFORM wms_append(c,w,b,'RECEIPT_REVERSAL',-qty,-line.quarantined_base,0,0,-(line.accepted_quantity+line.quarantined_quantity),line.input_unit,line.conversion_factor,event,actor,note);
      END IF;
    END LOOP;
  END IF;
  IF op<>'receipt.create' THEN
    UPDATE wms_receipts SET status=target,version=version+1,updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
      reviewed_by=CASE WHEN target='REVIEWED' THEN actor WHEN target='DRAFT' THEN NULL ELSE reviewed_by END,
      posted_by=CASE WHEN target='POSTED' THEN actor ELSE posted_by END WHERE company_id=c AND id=d;
  END IF;
  RETURN jsonb_build_object('id',d,'status',target,'eventId',event);
END $$;

CREATE FUNCTION wms_custody_quality(c TEXT,b TEXT,delivery DATE,min_days INTEGER) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM wms_batches batch JOIN wms_products p ON p.company_id=c AND p.id=batch.product_id
    WHERE batch.company_id=c AND batch.id=b AND p.is_active AND NOT batch.is_quarantined
    AND ((batch.expiry_date IS NULL AND min_days=0) OR (batch.expiry_date>GREATEST(delivery,(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)
      AND batch.expiry_date>=GREATEST(delivery,(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)+min_days)));
$$;

CREATE FUNCTION wms_loading_command(c TEXT,w TEXT,op TEXT,body JSONB,actor TEXT,new_id TEXT,event TEXT) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE doc wms_load_requests; line wms_load_lines; allocation wms_allocations; choice record; item JSONB;
  d TEXT; target TEXT; previous TEXT; note TEXT=COALESCE(body->>'note','Warehouse loading'); p TEXT; factor INTEGER;
  q NUMERIC; got NUMERIC; actual NUMERIC; difference NUMERIC; count_alloc INTEGER=0; n INTEGER=0; min_days INTEGER; total_picked NUMERIC=0;
BEGIN
  IF op='load.create' THEN
    d=new_id;
    IF NOT EXISTS(SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id WHERE u.company_id=c AND u.id=body->>'recipientId' AND u.status='ACTIVE' AND r.code='SALES_REP') THEN
      RAISE EXCEPTION 'WMS_RECIPIENT_NOT_FOUND' USING ERRCODE='23514'; END IF;
    IF jsonb_typeof(body->'lines')<>'array' OR jsonb_array_length(body->'lines') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'WMS_DOCUMENT_LIMIT' USING ERRCODE='23514'; END IF;
    INSERT INTO wms_load_requests(id,company_id,warehouse_id,reference,source,recipient_id,customer_code,target_date,created_by)
      VALUES(d,c,w,body->>'reference',body->>'source',body->>'recipientId',body->>'customerCode',(body->>'targetDate')::date,actor);
    PERFORM id FROM wms_products WHERE company_id=c AND (id IN(SELECT value->>'productId' FROM jsonb_array_elements(body->'lines'))
      OR code IN(SELECT upper(value->>'productCode') FROM jsonb_array_elements(body->'lines'))) ORDER BY id FOR UPDATE;
    FOR item IN SELECT value FROM jsonb_array_elements(body->'lines') LOOP
      n=n+1;p=NULL;
      SELECT id,CASE WHEN item->>'unit'='CARTON' THEN pieces_per_carton ELSE 1 END INTO p,factor FROM wms_products
        WHERE company_id=c AND is_active AND ((item->>'productId' IS NOT NULL AND id=item->>'productId')
          OR (item->>'productId' IS NULL AND code=upper(item->>'productCode')));
      IF p IS NULL THEN RAISE EXCEPTION 'WMS_PRODUCT_MAPPING_REQUIRED' USING ERRCODE='23514'; END IF;
      q=wms_quantity(c,p,(item->>'quantity')::numeric,item->>'unit');
      IF q<=0 THEN RAISE EXCEPTION 'WMS_INVALID_QUANTITY' USING ERRCODE='23514'; END IF;
      INSERT INTO wms_load_lines(id,company_id,load_id,product_id,input_quantity,input_unit,conversion_factor,requested_base)
        VALUES(d||':'||n,c,d,p,(item->>'quantity')::numeric,item->>'unit',factor,q);
    END LOOP;
    previous=NULL;target='REQUESTED';
  ELSE
    d=body->>'id';SELECT * INTO doc FROM wms_load_requests WHERE company_id=c AND warehouse_id=w AND id=d FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'WMS_DOCUMENT_NOT_FOUND' USING ERRCODE='23514'; END IF;
    IF doc.version<>(body->>'version')::integer THEN RAISE EXCEPTION 'WMS_DOCUMENT_STALE' USING ERRCODE='23514'; END IF;
    previous=doc.status;
    IF op='load.reserve' AND doc.status='REQUESTED' THEN target='RESERVED';
    ELSIF op='load.pick' AND doc.status='RESERVED' THEN target='PICKED';
    ELSIF op='load.review' AND doc.status='PICKED' THEN target='REVIEWED';
    ELSIF op='load.approve' AND doc.status='REVIEWED' THEN target='APPROVED';
    ELSIF op='load.dispatch' AND doc.status='APPROVED' THEN target='IN_TRANSIT';
    ELSIF op='load.accept' AND doc.status='IN_TRANSIT' AND doc.recipient_id=actor THEN target='ACCEPTED';
    ELSIF op='load.reject' AND doc.status='IN_TRANSIT' AND doc.recipient_id=actor THEN target='RETURN_REQUESTED';
    ELSIF op='load.receive-return' AND doc.status='RETURN_REQUESTED' THEN target='RETURNED';
    ELSIF op='load.cancel' AND doc.status IN('REQUESTED','RESERVED','PICKED','REVIEWED','APPROVED') THEN target='CANCELLED';
    ELSE RAISE EXCEPTION 'WMS_INVALID_TRANSITION' USING ERRCODE='23514'; END IF;
  END IF;
  INSERT INTO wms_operation_events(id,company_id,warehouse_id,load_id,operation,actor_id,from_status,to_status,note)
    VALUES(event,c,w,d,op,actor,previous,target,note);
  IF op<>'load.create' THEN
    -- Serialize customer-policy creation/change as well as existing-row edits.
    IF doc.customer_code IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(c||':policy:'||doc.customer_code,0)); END IF;
    -- Same order as receiving/Phase 01 posting. No cross-document lock inversion.
    PERFORM p.id FROM wms_products p WHERE p.company_id=c AND p.id IN(SELECT product_id FROM wms_load_lines WHERE company_id=c AND load_id=d) ORDER BY p.id FOR UPDATE;
    PERFORM 1 FROM wms_customer_policies WHERE company_id=c AND customer_code=doc.customer_code FOR SHARE;
    min_days=wms_min_days(c,doc.customer_code);
    IF op='load.reserve' THEN
      FOR line IN SELECT * FROM wms_load_lines WHERE company_id=c AND load_id=d ORDER BY product_id LOOP
        got=0;
        FOR choice IN SELECT * FROM wms_fefo(c,w,line.product_id,line.requested_base,doc.target_date,min_days) LOOP
          count_alloc=count_alloc+1;IF count_alloc>100 THEN RAISE EXCEPTION 'WMS_ALLOCATION_LIMIT' USING ERRCODE='23514'; END IF;
          PERFORM wms_check_allocation(c,w,choice.batch_id,choice.quantity,doc.target_date,min_days,false);
          IF NOT EXISTS(SELECT 1 FROM wms_positions WHERE company_id=c AND warehouse_id=w AND batch_id=choice.batch_id AND physical-reserved-quarantined>=choice.quantity) THEN
            RAISE EXCEPTION 'WMS_INSUFFICIENT_STOCK' USING ERRCODE='23514'; END IF;
          INSERT INTO wms_allocations(id,company_id,load_id,product_id,batch_id,allocated_quantity,reserved_quantity,reason,policy_min_days)
            VALUES(d||':'||choice.batch_id,c,d,line.product_id,choice.batch_id,choice.quantity,choice.quantity,choice.reason,min_days);
          PERFORM wms_append(c,w,choice.batch_id,'RESERVE',0,0,choice.quantity,0,choice.quantity,'BASE',1,event,actor,note);
          got=got+choice.quantity;
        END LOOP;
        IF got<line.requested_base THEN RAISE EXCEPTION 'WMS_INSUFFICIENT_STOCK' USING ERRCODE='23514'; END IF;
      END LOOP;
    ELSIF op='load.pick' THEN
      IF jsonb_typeof(body->'allocations')<>'array' OR jsonb_array_length(body->'allocations')<>(SELECT count(*) FROM wms_allocations WHERE company_id=c AND load_id=d)
        OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(body->'allocations'))<>jsonb_array_length(body->'allocations') THEN
        RAISE EXCEPTION 'WMS_PICK_ALL_ALLOCATIONS' USING ERRCODE='23514'; END IF;
      FOR allocation IN SELECT * FROM wms_allocations WHERE company_id=c AND load_id=d ORDER BY product_id,batch_id FOR UPDATE LOOP
        SELECT (value->>'quantity')::numeric INTO actual FROM jsonb_array_elements(body->'allocations') WHERE value->>'id'=allocation.id;
        IF actual IS NULL OR actual<0 OR actual>allocation.reserved_quantity THEN RAISE EXCEPTION 'WMS_OVER_PICK' USING ERRCODE='23514'; END IF;
        actual=wms_quantity(c,allocation.product_id,actual,'BASE');
        IF actual>0 THEN PERFORM wms_check_allocation(c,w,allocation.batch_id,actual,doc.target_date,min_days,true); END IF;
        difference=allocation.reserved_quantity-actual;total_picked=total_picked+actual;
        IF difference>0 THEN
          IF length(COALESCE(body->>'discrepancyReason',''))<3 THEN RAISE EXCEPTION 'WMS_DISCREPANCY_REASON_REQUIRED' USING ERRCODE='23514'; END IF;
          PERFORM wms_append(c,w,allocation.batch_id,'RELEASE',0,0,-difference,0,difference,'BASE',1,event,actor,note);
        END IF;
        UPDATE wms_allocations SET reserved_quantity=actual,picked_quantity=actual WHERE company_id=c AND id=allocation.id;
      END LOOP;
      IF total_picked<=0 THEN RAISE EXCEPTION 'WMS_EMPTY_PICK' USING ERRCODE='23514'; END IF;
    ELSIF op IN('load.review','load.approve','load.dispatch') THEN
      FOR allocation IN SELECT * FROM wms_allocations WHERE company_id=c AND load_id=d AND picked_quantity>0 ORDER BY product_id,batch_id FOR UPDATE LOOP
        PERFORM wms_check_allocation(c,w,allocation.batch_id,allocation.picked_quantity,doc.target_date,min_days,true);
        IF op='load.dispatch' THEN
          PERFORM wms_append(c,w,allocation.batch_id,'DISPATCH',-allocation.picked_quantity,0,-allocation.picked_quantity,allocation.picked_quantity,
            allocation.picked_quantity,'BASE',1,event,actor,note);
          UPDATE wms_allocations SET reserved_quantity=0,dispatched_quantity=picked_quantity WHERE company_id=c AND id=allocation.id;
        END IF;
      END LOOP;
      IF NOT FOUND THEN RAISE EXCEPTION 'WMS_EMPTY_PICK' USING ERRCODE='23514'; END IF;
    ELSIF op='load.cancel' THEN
      FOR allocation IN SELECT * FROM wms_allocations WHERE company_id=c AND load_id=d AND reserved_quantity>0 ORDER BY product_id,batch_id FOR UPDATE LOOP
        PERFORM wms_append(c,w,allocation.batch_id,'RELEASE',0,0,-allocation.reserved_quantity,0,allocation.reserved_quantity,'BASE',1,event,actor,note);
        UPDATE wms_allocations SET reserved_quantity=0 WHERE company_id=c AND id=allocation.id;
      END LOOP;
    ELSIF op IN('load.accept','load.receive-return') THEN
      FOR allocation IN SELECT * FROM wms_allocations WHERE company_id=c AND load_id=d AND dispatched_quantity>0 ORDER BY product_id,batch_id FOR UPDATE LOOP
        q=allocation.dispatched_quantity;
        PERFORM 1 FROM wms_positions WHERE company_id=c AND warehouse_id=w AND batch_id=allocation.batch_id AND in_transit>=q FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'WMS_TRANSIT_STOCK_CHANGED' USING ERRCODE='23514'; END IF;
        IF op='load.accept' THEN
          IF NOT wms_custody_quality(c,allocation.batch_id,doc.target_date,min_days) THEN RAISE EXCEPTION 'WMS_QUALITY_OR_STOCK_BLOCKED' USING ERRCODE='23514'; END IF;
          INSERT INTO wms_custody_positions(company_id,recipient_id,warehouse_id,batch_id,quantity) VALUES(c,actor,w,allocation.batch_id,q)
            ON CONFLICT(company_id,recipient_id,warehouse_id,batch_id) DO UPDATE SET quantity=wms_custody_positions.quantity+EXCLUDED.quantity,updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
          PERFORM wms_append(c,w,allocation.batch_id,'ACCEPT',0,0,0,-q,q,'BASE',1,event,actor,note);
        ELSE
          PERFORM wms_append(c,w,allocation.batch_id,'TRANSIT_RETURN',q,q,0,-q,q,'BASE',1,event,actor,note);
        END IF;
      END LOOP;
    END IF;
    UPDATE wms_load_requests SET status=target,version=version+1,updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
      reviewed_by=CASE WHEN target='REVIEWED' THEN actor ELSE reviewed_by END,
      approved_by=CASE WHEN target='APPROVED' THEN actor ELSE approved_by END,
      discrepancy_reason=CASE WHEN op='load.pick' THEN body->>'discrepancyReason' ELSE discrepancy_reason END WHERE company_id=c AND id=d;
  END IF;
  RETURN jsonb_build_object('id',d,'status',target,'eventId',event);
END $$;

CREATE FUNCTION wms_execute(c TEXT,w TEXT,op TEXT,body JSONB,actor TEXT,k TEXT,new_id TEXT) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE cmd JSONB=jsonb_build_object('warehouse',w,'operation',op,'input',body); old wms_commands; result JSONB; event TEXT='evt-'||new_id;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(c||':command:'||k,0));
  SELECT * INTO old FROM wms_commands WHERE company_id=c AND idempotency_key=k;
  IF FOUND THEN
    IF old.command<>cmd THEN RAISE EXCEPTION 'WMS_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
    RETURN old.result;
  END IF;
  PERFORM 1 FROM warehouses WHERE company_id=c AND id=w AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WMS_WAREHOUSE_NOT_FOUND' USING ERRCODE='23514'; END IF;
  IF left(op,8)='receipt.' THEN result=wms_receiving_command(c,w,op,body,actor,new_id,event);
  ELSIF left(op,5)='load.' THEN result=wms_loading_command(c,w,op,body,actor,new_id,event);
  ELSE RAISE EXCEPTION 'WMS_UNKNOWN_OPERATION' USING ERRCODE='23514'; END IF;
  INSERT INTO wms_commands(company_id,idempotency_key,command,result,event_id) VALUES(c,k,cmd,result,event);
  RETURN result;
END $$;

INSERT INTO permissions(id,code,description) VALUES
 ('perm-wms-receive','wms.receiving.create','Draft and submit receiving documents'),
 ('perm-wms-receive-review','wms.receiving.review','Review receiving documents'),
 ('perm-wms-receive-approve','wms.receiving.approve','Approve or reverse receiving stock'),
 ('perm-wms-request','wms.request.create','Create warehouse loading requests'),
 ('perm-wms-reserve','wms.reservation.manage','Reserve and release warehouse stock'),
 ('perm-wms-pick','wms.picking.manage','Confirm actual picked allocations'),
 ('perm-wms-pick-review','wms.picking.review','Review completed picking'),
 ('perm-wms-dispatch','wms.dispatch.approve','Approve dispatch and confirm physical return'),
 ('perm-wms-dispatch-execute','wms.dispatch.execute','Dispatch approved picked stock'),
 ('perm-wms-custody','wms.custody.accept','Accept or reject own incoming custody'),
 ('perm-wms-policy','wms.policy.manage','Manage customer minimum shelf life')
ON CONFLICT(code) DO NOTHING;
