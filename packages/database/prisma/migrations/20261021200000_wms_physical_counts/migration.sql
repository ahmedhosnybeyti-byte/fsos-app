BEGIN;
-- Additive only. No grants, tenant activation, history/custody or financial writes.
-- Revision changes on EVERY position update, including an ABA stock change.
ALTER TABLE wms_positions ADD COLUMN revision BIGINT NOT NULL DEFAULT 1;
CREATE FUNCTION wms_position_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.revision=OLD.revision+1; RETURN NEW; END $$;
CREATE TRIGGER wms_position_revision BEFORE UPDATE ON wms_positions FOR EACH ROW EXECUTE FUNCTION wms_position_revision();

CREATE TABLE wms_counts (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL, warehouse_id TEXT NOT NULL,
 reference TEXT NOT NULL CHECK(length(reference) BETWEEN 1 AND 80), reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 300),
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','POSTED','CANCELLED')), version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL, approved_by TEXT, approved_at TIMESTAMP(3),
 created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 UNIQUE(company_id,id), UNIQUE(company_id,warehouse_id,reference),
 FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id),
 FOREIGN KEY(company_id,created_by) REFERENCES users(company_id,id),
 FOREIGN KEY(company_id,approved_by) REFERENCES users(company_id,id),
 CHECK((status='POSTED')=(approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX wms_counts_scope ON wms_counts(company_id,warehouse_id,created_at DESC,id DESC);
CREATE TABLE wms_count_lines (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL, count_id TEXT NOT NULL, batch_id TEXT NOT NULL,
 snapshot_revision BIGINT NOT NULL, system_base NUMERIC(24,6) NOT NULL CHECK(system_base>=0),
 counted_quantity NUMERIC(24,6) NOT NULL CHECK(counted_quantity>=0), counted_base NUMERIC(24,6) NOT NULL CHECK(counted_base>=0),
 input_unit TEXT NOT NULL CHECK(input_unit IN('BASE','CARTON')), conversion_factor INTEGER NOT NULL CHECK(conversion_factor>0),
 UNIQUE(company_id,id), UNIQUE(company_id,count_id,batch_id),
 FOREIGN KEY(company_id,count_id) REFERENCES wms_counts(company_id,id),
 FOREIGN KEY(company_id,batch_id) REFERENCES wms_batches(company_id,id),
 CHECK(counted_base=counted_quantity*conversion_factor)
);
CREATE TABLE wms_count_events (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL, count_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN('CREATE','APPROVE','CANCEL')), reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 300),
 created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 FOREIGN KEY(company_id,count_id) REFERENCES wms_counts(company_id,id),
 FOREIGN KEY(company_id,actor_id) REFERENCES users(company_id,id), UNIQUE(company_id,count_id,action)
);
CREATE TABLE wms_count_commands (
 company_id TEXT NOT NULL REFERENCES companies(id), idempotency_key TEXT NOT NULL, command JSONB NOT NULL, result JSONB NOT NULL,
 PRIMARY KEY(company_id,idempotency_key)
);
CREATE TRIGGER wms_count_lines_immutable BEFORE UPDATE OR DELETE ON wms_count_lines FOR EACH ROW EXECUTE FUNCTION wms_immutable_movement();
CREATE TRIGGER wms_count_events_immutable BEFORE UPDATE OR DELETE ON wms_count_events FOR EACH ROW EXECUTE FUNCTION wms_immutable_movement();
CREATE TRIGGER wms_count_commands_immutable BEFORE UPDATE OR DELETE ON wms_count_commands FOR EACH ROW EXECUTE FUNCTION wms_immutable_movement();
CREATE FUNCTION wms_count_protect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.status<>'DRAFT' OR NEW.status NOT IN('POSTED','CANCELLED')
 OR (NEW.id,NEW.company_id,NEW.warehouse_id,NEW.reference,NEW.reason,NEW.created_by,NEW.created_at)
 IS DISTINCT FROM (OLD.id,OLD.company_id,OLD.warehouse_id,OLD.reference,OLD.reason,OLD.created_by,OLD.created_at)
 OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'WMS_LEDGER_IMMUTABLE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER wms_count_protect BEFORE UPDATE OR DELETE ON wms_counts FOR EACH ROW EXECUTE FUNCTION wms_count_protect();
ALTER TABLE wms_movements ADD COLUMN count_line_id TEXT,
 ADD FOREIGN KEY(company_id,count_line_id) REFERENCES wms_count_lines(company_id,id),
 ADD UNIQUE(company_id,count_line_id);
-- Extend only the closed movement-kind constraints; preserve existing semantics.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT conname,pg_get_constraintdef(oid) def FROM pg_constraint
 WHERE conrelid='wms_movements'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%kind%' LOOP
  EXECUTE format('ALTER TABLE wms_movements DROP CONSTRAINT %I',r.conname);
  EXECUTE format('ALTER TABLE wms_movements ADD CONSTRAINT %I CHECK ((kind=''ADJUSTMENT'' AND quantity<>0 AND reversal_of IS NULL AND count_line_id IS NOT NULL AND reserved_delta=0 AND in_transit_delta=0) OR (kind<>''ADJUSTMENT'' AND %s))',r.conname,substring(r.def from 7));
 END LOOP;
END $$;

CREATE FUNCTION wms_count_execute(c TEXT,w TEXT,op TEXT,body JSONB,actor TEXT,k TEXT,new_id TEXT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE cmd JSONB; prior wms_count_commands; d wms_counts; l record; x JSONB; pos wms_positions;
 prod wms_products; delta NUMERIC; hold_delta NUMERIC; qty NUMERIC; factor INTEGER; event TEXT; result JSONB;
BEGIN
 cmd=jsonb_build_object('warehouse',w,'operation',op,'body',body,'actor',actor);
 PERFORM pg_advisory_xact_lock(hashtextextended(c||':count:'||k,0));
 SELECT * INTO prior FROM wms_count_commands WHERE company_id=c AND idempotency_key=k;
 IF FOUND THEN
  IF prior.command<>cmd THEN RAISE EXCEPTION 'WMS_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN prior.result;
 END IF;
 IF op='CREATE' THEN
  IF jsonb_typeof(body->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'lines') NOT BETWEEN 1 AND 20
  THEN RAISE EXCEPTION 'WMS_INVALID_INPUT' USING ERRCODE='23514'; END IF;
  INSERT INTO wms_counts(id,company_id,warehouse_id,reference,reason,created_by)
  VALUES(new_id,c,w,body->>'reference',body->>'reason',actor) RETURNING * INTO d;
  -- Same product -> position lock order as the existing WMS posting paths.
  PERFORM p.id FROM wms_products p WHERE p.company_id=c AND p.id IN
   (SELECT b.product_id FROM wms_batches b WHERE b.company_id=c AND b.id IN(SELECT value->>'batchId' FROM jsonb_array_elements(body->'lines')))
   ORDER BY p.id FOR UPDATE;
  FOR x IN SELECT value FROM jsonb_array_elements(body->'lines') ORDER BY value->>'batchId' LOOP
   SELECT * INTO pos FROM wms_positions WHERE company_id=c AND warehouse_id=w AND batch_id=x->>'batchId' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'WMS_POSITION_NOT_FOUND' USING ERRCODE='23514'; END IF;
   IF pos.revision<>(x->>'revision')::bigint THEN RAISE EXCEPTION 'WMS_COUNT_STALE' USING ERRCODE='23514'; END IF;
   SELECT p.* INTO prod FROM wms_products p JOIN wms_batches b ON b.company_id=c AND b.product_id=p.id
    WHERE p.company_id=c AND b.id=pos.batch_id;
   qty=wms_quantity(c,prod.id,(x->>'countedQuantity')::numeric,x->>'unit');
   factor=CASE WHEN x->>'unit'='CARTON' THEN prod.pieces_per_carton ELSE 1 END;
   INSERT INTO wms_count_lines(id,company_id,count_id,batch_id,snapshot_revision,system_base,counted_quantity,counted_base,input_unit,conversion_factor)
    VALUES(new_id||':'||pos.batch_id,c,d.id,pos.batch_id,pos.revision,pos.physical,(x->>'countedQuantity')::numeric,qty,x->>'unit',factor);
  END LOOP;
 ELSIF op IN('APPROVE','CANCEL') THEN
  SELECT * INTO d FROM wms_counts WHERE company_id=c AND warehouse_id=w AND id=body->>'id' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WMS_DOCUMENT_NOT_FOUND' USING ERRCODE='23514'; END IF;
  IF d.status<>'DRAFT' OR d.version<>(body->>'version')::integer THEN RAISE EXCEPTION 'WMS_DOCUMENT_STALE' USING ERRCODE='23514'; END IF;
  IF op='APPROVE' THEN
   PERFORM p.id FROM wms_products p WHERE p.company_id=c AND p.id IN
    (SELECT b.product_id FROM wms_count_lines cl JOIN wms_batches b ON b.company_id=c AND b.id=cl.batch_id WHERE cl.company_id=c AND cl.count_id=d.id)
    ORDER BY p.id FOR UPDATE;
   FOR l IN SELECT cl.*,b.is_quarantined,b.expiry_date FROM wms_count_lines cl JOIN wms_batches b ON b.company_id=c AND b.id=cl.batch_id
    WHERE cl.company_id=c AND cl.count_id=d.id ORDER BY cl.batch_id LOOP
    SELECT * INTO pos FROM wms_positions WHERE company_id=c AND warehouse_id=w AND batch_id=l.batch_id FOR UPDATE;
    IF pos.revision<>l.snapshot_revision THEN RAISE EXCEPTION 'WMS_COUNT_STALE' USING ERRCODE='23514'; END IF;
    delta=l.counted_base-l.system_base;
    -- Count the total physical lot. Never consume existing reservations/holds.
    IF l.counted_base<pos.reserved+pos.quarantined THEN RAISE EXCEPTION 'WMS_COUNT_COMMITTED_STOCK' USING ERRCODE='23514'; END IF;
    hold_delta=CASE WHEN delta>0 AND (pos.quality_blocked OR l.is_quarantined OR l.expiry_date<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date) THEN delta ELSE 0 END;
    IF delta<>0 THEN
     INSERT INTO wms_movements(id,company_id,warehouse_id,batch_id,kind,quantity,quarantine_delta,input_quantity,input_unit,conversion_factor,reference,reason,idempotency_key,command,actor_id,count_line_id)
      VALUES(l.id||':adjust',c,w,l.batch_id,'ADJUSTMENT',delta,hold_delta,delta/l.conversion_factor,l.input_unit,l.conversion_factor,d.reference,body->>'reason',l.id||':adjust',cmd,actor,l.id);
     UPDATE wms_positions SET physical=physical+delta,quarantined=quarantined+hold_delta,updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      WHERE company_id=c AND warehouse_id=w AND batch_id=l.batch_id;
    END IF;
   END LOOP;
  END IF;
  UPDATE wms_counts SET status=CASE WHEN op='APPROVE' THEN 'POSTED' ELSE 'CANCELLED' END,version=version+1,
   approved_by=CASE WHEN op='APPROVE' THEN actor END,approved_at=CASE WHEN op='APPROVE' THEN CURRENT_TIMESTAMP AT TIME ZONE 'UTC' END
   WHERE company_id=c AND id=d.id RETURNING * INTO d;
 ELSE RAISE EXCEPTION 'WMS_INVALID_INPUT' USING ERRCODE='23514'; END IF;
 event=new_id||':'||op;
 INSERT INTO wms_count_events(id,company_id,count_id,actor_id,action,reason) VALUES(event,c,d.id,actor,op,body->>'reason');
 result=jsonb_build_object('id',d.id,'status',d.status,'eventId',event);
 INSERT INTO wms_count_commands VALUES(c,k,cmd,result);
 RETURN result;
END $$;
INSERT INTO permissions(id,code,description) VALUES
 ('perm-wms-count-create','wms.count.create','Save/cancel physical counts without stock effects'),
 ('perm-wms-count-approve','wms.count.approve','Approve physical count differences and post quantity adjustments')
ON CONFLICT(code) DO NOTHING;
COMMIT;
