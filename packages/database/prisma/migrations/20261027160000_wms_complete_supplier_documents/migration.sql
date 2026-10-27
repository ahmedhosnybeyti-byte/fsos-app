-- Complete supplier documents: no artificial line-count ceiling for receipt creation/edit or supplier returns.
-- Only the admission conditions below change. Existing quantity conversion, company/source scope,
-- product locks, stock posting, history, approval and retry behavior remain intact.
-- Representative returns retain their existing 20-line contract. Smart Loading functions are untouched.
-- Both JSON input loops enumerate one document once; no repeated JSON-array search is introduced.

CREATE OR REPLACE FUNCTION wms_receipt_lines_set(c TEXT,d TEXT,lines JSONB) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE item JSONB; p TEXT; factor INTEGER; n INTEGER=0; accepted NUMERIC; held NUMERIC; rejected NUMERIC; expected NUMERIC; u TEXT;
BEGIN
  IF jsonb_typeof(lines)<>'array' OR jsonb_array_length(lines)<1 THEN
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

CREATE OR REPLACE FUNCTION wms_return_command(c TEXT,w TEXT,op TEXT,body JSONB,actor TEXT,new_id TEXT,event TEXT) RETURNS JSONB LANGUAGE plpgsql AS $$
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
  IF jsonb_typeof(body->'lines')<>'array' OR jsonb_array_length(body->'lines')<1 OR (v_kind='REP' AND jsonb_array_length(body->'lines')>20) THEN RAISE EXCEPTION 'WMS_DOCUMENT_LIMIT' USING ERRCODE='23514'; END IF;
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
