-- Extend the existing loading document/event/command ledgers; no parallel
-- loading workflow, role grants, tenant activation or stock/data backfill.
ALTER TABLE wms_operation_events ADD COLUMN recipient_version INTEGER,
  ADD COLUMN prepared_fingerprint TEXT;

CREATE FUNCTION wms_prepared_fingerprint(c TEXT,d TEXT) RETURNS TEXT LANGUAGE sql STABLE AS $$
 SELECT md5(jsonb_build_object(
 'lines',(SELECT jsonb_agg(jsonb_build_array(id,product_id,input_unit,conversion_factor,requested_base) ORDER BY id)
   FROM wms_load_lines WHERE company_id=c AND load_id=d),
 'picks',(SELECT jsonb_agg(jsonb_build_array(id,product_id,batch_id,picked_quantity) ORDER BY id)
   FROM wms_allocations WHERE company_id=c AND load_id=d))::text);
$$;

CREATE FUNCTION wms_confirm_prepared(c TEXT,w TEXT,d TEXT,v INTEGER,confirmed BOOLEAN,note TEXT,actor TEXT,k TEXT,new_id TEXT)
 RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE doc wms_load_requests;old wms_commands;result JSONB;event TEXT='evt-'||new_id;
 op TEXT=CASE WHEN confirmed THEN 'load.confirm' ELSE 'load.decline' END;
 payload JSONB=jsonb_build_object('id',d,'version',v,'note',note); fingerprint TEXT;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM company_operating_settings WHERE company_id=c AND operating_mode='FULL_ERP')
 OR NOT EXISTS(SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id WHERE u.company_id=c AND u.id=actor AND u.status='ACTIVE' AND r.code='SALES_REP')
 THEN RAISE EXCEPTION 'WMS_RECIPIENT_REQUIRED' USING ERRCODE='23514';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(c||':command:'||k,0));
 PERFORM 1 FROM warehouses WHERE company_id=c AND id=w AND is_active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WMS_WAREHOUSE_NOT_FOUND' USING ERRCODE='23514';END IF;
 SELECT * INTO doc FROM wms_load_requests WHERE company_id=c AND warehouse_id=w AND id=d AND recipient_id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WMS_DOCUMENT_NOT_FOUND' USING ERRCODE='23514';END IF;
 SELECT * INTO old FROM wms_commands WHERE company_id=c AND idempotency_key=k;
 IF FOUND THEN
  IF old.command=jsonb_build_object('warehouse',w,'operation',op,'body',payload,'actor',actor) THEN RETURN old.result;END IF;
  RAISE EXCEPTION 'WMS_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514';
 END IF;
 IF doc.status<>'APPROVED' THEN RAISE EXCEPTION 'WMS_INVALID_TRANSITION' USING ERRCODE='23514';END IF;
 IF doc.version<>v THEN RAISE EXCEPTION 'WMS_DOCUMENT_STALE' USING ERRCODE='23514';END IF;
 IF length(btrim(COALESCE(note,''))) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'WMS_RECIPIENT_NOTE_REQUIRED' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM wms_allocations WHERE company_id=c AND load_id=d AND picked_quantity>0)
 THEN RAISE EXCEPTION 'WMS_EMPTY_PICK' USING ERRCODE='23514';END IF;
 fingerprint=wms_prepared_fingerprint(c,d);
 INSERT INTO wms_operation_events(id,company_id,warehouse_id,load_id,operation,actor_id,from_status,to_status,note,recipient_version,prepared_fingerprint)
 VALUES(event,c,w,d,op,actor,'APPROVED',CASE WHEN confirmed THEN 'APPROVED' ELSE 'RESERVED' END,note,v+1,fingerprint);
 UPDATE wms_load_requests SET version=v+1,status=CASE WHEN confirmed THEN 'APPROVED' ELSE 'RESERVED' END,
   approved_by=CASE WHEN confirmed THEN approved_by ELSE NULL END,
   reviewed_by=CASE WHEN confirmed THEN reviewed_by ELSE NULL END,
   updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE company_id=c AND id=d;
 result=jsonb_build_object('id',d,'status',CASE WHEN confirmed THEN 'APPROVED' ELSE 'RESERVED' END,'version',v+1,'eventId',event,'recipientConfirmed',confirmed);
 INSERT INTO wms_commands(company_id,idempotency_key,command,result,event_id)
 VALUES(c,k,jsonb_build_object('warehouse',w,'operation',op,'body',payload,'actor',actor),result,event);
 RETURN result;
END $$;

CREATE FUNCTION wms_require_recipient_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status='APPROVED' AND NEW.status='IN_TRANSIT'
 AND EXISTS(SELECT 1 FROM company_operating_settings WHERE company_id=OLD.company_id AND operating_mode='FULL_ERP')
 AND NOT EXISTS(SELECT 1 FROM wms_operation_events e WHERE e.company_id=OLD.company_id AND e.warehouse_id=OLD.warehouse_id
   AND e.load_id=OLD.id AND e.operation='load.confirm' AND e.actor_id=OLD.recipient_id
   AND e.recipient_version=OLD.version AND e.prepared_fingerprint=wms_prepared_fingerprint(OLD.company_id,OLD.id))
 THEN RAISE EXCEPTION 'WMS_RECIPIENT_CONFIRMATION_REQUIRED' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER wms_recipient_confirmation_before_dispatch BEFORE UPDATE OF status ON wms_load_requests
 FOR EACH ROW EXECUTE FUNCTION wms_require_recipient_confirmation();

-- Keep the existing FEFO/reservation/picking engine. FULL_ERP may reserve the
-- available subset, but never an empty shipment; every shortage needs a reason.
DO $patch$
DECLARE definition TEXT;needle TEXT;replacement TEXT;
BEGIN
 definition=pg_get_functiondef('wms_loading_command(text,text,text,jsonb,text,text,text)'::regprocedure);
 needle=$old$IF got<line.requested_base THEN RAISE EXCEPTION 'WMS_INSUFFICIENT_STOCK' USING ERRCODE='23514'; END IF;$old$;
 replacement=$new$IF got<line.requested_base AND NOT EXISTS(SELECT 1 FROM company_operating_settings WHERE company_id=c AND operating_mode='FULL_ERP') THEN RAISE EXCEPTION 'WMS_INSUFFICIENT_STOCK' USING ERRCODE='23514'; END IF;$new$;
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'WMS_LOADING_FUNCTION_CHANGED';END IF;
 definition=replace(definition,needle,replacement);
 needle=$old$    ELSIF op='load.pick' THEN$old$;
 replacement=$new$      IF count_alloc=0 THEN RAISE EXCEPTION 'WMS_INSUFFICIENT_STOCK' USING ERRCODE='23514';END IF;
    ELSIF op='load.pick' THEN$new$;
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'WMS_LOADING_FUNCTION_CHANGED';END IF;
 definition=replace(definition,needle,replacement);
 needle=$old$IF total_picked<=0 THEN RAISE EXCEPTION 'WMS_EMPTY_PICK' USING ERRCODE='23514'; END IF;$old$;
 replacement=$new$IF total_picked<=0 THEN RAISE EXCEPTION 'WMS_EMPTY_PICK' USING ERRCODE='23514'; END IF;
      IF EXISTS(SELECT 1 FROM company_operating_settings WHERE company_id=c AND operating_mode='FULL_ERP')
      AND EXISTS(SELECT 1 FROM wms_load_lines l WHERE l.company_id=c AND l.load_id=d AND l.requested_base>COALESCE((SELECT sum(a.picked_quantity) FROM wms_allocations a WHERE a.company_id=c AND a.load_id=d AND a.product_id=l.product_id),0))
      AND length(btrim(COALESCE(body->>'discrepancyReason','')))<3 THEN RAISE EXCEPTION 'WMS_DISCREPANCY_REASON_REQUIRED' USING ERRCODE='23514';END IF;$new$;
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'WMS_LOADING_FUNCTION_CHANGED';END IF;
 EXECUTE replace(definition,needle,replacement);
END $patch$;
