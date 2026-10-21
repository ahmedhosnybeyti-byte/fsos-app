BEGIN;
-- Owned sub-balance within the EXISTING quarantined total, never an extra deduction.
ALTER TABLE wms_positions ADD COLUMN quality_held NUMERIC(24,6) NOT NULL DEFAULT 0
 CHECK(quality_held>=0 AND quality_held<=quarantined);
CREATE FUNCTION wms_quality_hold_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.quarantined<NEW.quality_held THEN RAISE EXCEPTION 'WMS_HELD_OWNERSHIP' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER wms_quality_hold_guard BEFORE UPDATE ON wms_positions FOR EACH ROW EXECUTE FUNCTION wms_quality_hold_guard();
CREATE TABLE wms_quarantines (
 id TEXT PRIMARY KEY,company_id TEXT NOT NULL,warehouse_id TEXT NOT NULL,batch_id TEXT NOT NULL,
 reference TEXT NOT NULL CHECK(length(reference) BETWEEN 1 AND 80),reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 300),
 input_unit TEXT NOT NULL CHECK(input_unit IN('BASE','CARTON')),conversion_factor INTEGER NOT NULL CHECK(conversion_factor>0),
 held_base NUMERIC(24,6) NOT NULL CHECK(held_base>0),released_base NUMERIC(24,6) NOT NULL DEFAULT 0 CHECK(released_base>=0),
 written_off_base NUMERIC(24,6) NOT NULL DEFAULT 0 CHECK(written_off_base>=0),
 status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','PARTIAL','CLOSED')),version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL,created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 UNIQUE(company_id,id),UNIQUE(company_id,warehouse_id,reference),
 FOREIGN KEY(company_id,warehouse_id,batch_id) REFERENCES wms_positions(company_id,warehouse_id,batch_id),
 FOREIGN KEY(company_id,created_by) REFERENCES users(company_id,id),
 CHECK(released_base+written_off_base<=held_base),
 CHECK((status='OPEN' AND released_base+written_off_base=0) OR(status='PARTIAL' AND released_base+written_off_base>0 AND released_base+written_off_base<held_base)
 OR(status='CLOSED' AND released_base+written_off_base=held_base))
);
CREATE INDEX wms_quarantines_scope ON wms_quarantines(company_id,warehouse_id,created_at DESC,id DESC);
CREATE TABLE wms_quarantine_events (
 id TEXT PRIMARY KEY,company_id TEXT NOT NULL,quarantine_id TEXT NOT NULL,operation TEXT NOT NULL CHECK(operation IN('HOLD','RELEASE','WRITE_OFF')),
 quantity_base NUMERIC(24,6) NOT NULL CHECK(quantity_base>0),reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 300),
 actor_id TEXT NOT NULL,created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 UNIQUE(company_id,id),FOREIGN KEY(company_id,quarantine_id) REFERENCES wms_quarantines(company_id,id),
 FOREIGN KEY(company_id,actor_id) REFERENCES users(company_id,id)
);
CREATE INDEX wms_quarantine_events_parent ON wms_quarantine_events(company_id,quarantine_id,created_at DESC,id DESC);
CREATE TABLE wms_quarantine_commands (
 company_id TEXT NOT NULL REFERENCES companies(id),idempotency_key TEXT NOT NULL,command JSONB NOT NULL,result JSONB NOT NULL,
 PRIMARY KEY(company_id,idempotency_key)
);
CREATE TRIGGER wms_quarantine_events_immutable BEFORE UPDATE OR DELETE ON wms_quarantine_events FOR EACH ROW EXECUTE FUNCTION wms_immutable_movement();
CREATE TRIGGER wms_quarantine_commands_immutable BEFORE UPDATE OR DELETE ON wms_quarantine_commands FOR EACH ROW EXECUTE FUNCTION wms_immutable_movement();
CREATE FUNCTION wms_quarantine_protect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.status='CLOSED' OR NEW.version<>OLD.version+1
 OR (NEW.id,NEW.company_id,NEW.warehouse_id,NEW.batch_id,NEW.reference,NEW.reason,NEW.input_unit,NEW.conversion_factor,NEW.held_base,NEW.created_by,NEW.created_at)
 IS DISTINCT FROM (OLD.id,OLD.company_id,OLD.warehouse_id,OLD.batch_id,OLD.reference,OLD.reason,OLD.input_unit,OLD.conversion_factor,OLD.held_base,OLD.created_by,OLD.created_at)
 OR NEW.released_base<OLD.released_base OR NEW.written_off_base<OLD.written_off_base
 OR NEW.released_base+NEW.written_off_base<=OLD.released_base+OLD.written_off_base
 THEN RAISE EXCEPTION 'WMS_LEDGER_IMMUTABLE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER wms_quarantine_protect BEFORE UPDATE OR DELETE ON wms_quarantines FOR EACH ROW EXECUTE FUNCTION wms_quarantine_protect();
ALTER TABLE wms_movements ADD COLUMN quarantine_event_id TEXT,
 ADD FOREIGN KEY(company_id,quarantine_event_id) REFERENCES wms_quarantine_events(company_id,id),ADD UNIQUE(company_id,quarantine_event_id);
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT conname,pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid='wms_movements'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%kind%' LOOP
  EXECUTE format('ALTER TABLE wms_movements DROP CONSTRAINT %I',r.conname);
  EXECUTE format('ALTER TABLE wms_movements ADD CONSTRAINT %I CHECK ((kind IN(''QUARANTINE_HOLD'',''QUARANTINE_RELEASE'',''WRITE_OFF'') AND quarantine_event_id IS NOT NULL AND reversal_of IS NULL AND reserved_delta=0 AND in_transit_delta=0 AND ((kind=''QUARANTINE_HOLD'' AND quantity=0 AND quarantine_delta>0) OR(kind=''QUARANTINE_RELEASE'' AND quantity=0 AND quarantine_delta<0) OR(kind=''WRITE_OFF'' AND quantity<0 AND quarantine_delta=quantity))) OR(kind NOT IN(''QUARANTINE_HOLD'',''QUARANTINE_RELEASE'',''WRITE_OFF'') AND %s))',r.conname,substring(r.def from 7));
 END LOOP;
END $$;
CREATE FUNCTION wms_quarantine_execute(c TEXT,w TEXT,op TEXT,body JSONB,actor TEXT,k TEXT,new_id TEXT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE cmd JSONB; prior wms_quarantine_commands; d wms_quarantines; pos wms_positions; prod wms_products; lot wms_batches;
 product TEXT; batch TEXT; qty NUMERIC; input_qty NUMERIC; factor INTEGER; effect NUMERIC; held_delta NUMERIC; event TEXT; result JSONB;
BEGIN
 cmd=jsonb_build_object('warehouse',w,'operation',op,'body',body,'actor',actor);
 PERFORM pg_advisory_xact_lock(hashtextextended(c||':quarantine:'||k,0));
 SELECT * INTO prior FROM wms_quarantine_commands WHERE company_id=c AND idempotency_key=k;
 IF FOUND THEN
  IF prior.command<>cmd THEN RAISE EXCEPTION 'WMS_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN prior.result;
 END IF;
 IF op='HOLD' THEN batch=body->>'batchId';
 ELSIF op IN('RELEASE','WRITE_OFF') THEN
  SELECT * INTO d FROM wms_quarantines WHERE company_id=c AND warehouse_id=w AND id=body->>'id' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WMS_DOCUMENT_NOT_FOUND' USING ERRCODE='23514'; END IF;
  IF d.status='CLOSED' OR d.version<>(body->>'version')::int THEN RAISE EXCEPTION 'WMS_DOCUMENT_STALE' USING ERRCODE='23514'; END IF;
  batch=d.batch_id;
 ELSE RAISE EXCEPTION 'WMS_INVALID_INPUT' USING ERRCODE='23514'; END IF;
 SELECT product_id INTO product FROM wms_batches WHERE company_id=c AND id=batch;
 IF NOT FOUND THEN RAISE EXCEPTION 'WMS_POSITION_NOT_FOUND' USING ERRCODE='23514'; END IF;
 SELECT * INTO prod FROM wms_products WHERE company_id=c AND id=product FOR UPDATE;
 SELECT * INTO lot FROM wms_batches WHERE company_id=c AND id=batch FOR SHARE;
 SELECT * INTO pos FROM wms_positions WHERE company_id=c AND warehouse_id=w AND batch_id=batch FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WMS_POSITION_NOT_FOUND' USING ERRCODE='23514'; END IF;
 input_qty=(body->>'quantity')::numeric;
 IF input_qty IS NULL OR input_qty<=0 OR input_qty>=1000000000000 OR input_qty<>trunc(input_qty,6)
 THEN RAISE EXCEPTION 'WMS_INVALID_QUANTITY' USING ERRCODE='23514'; END IF;
 IF op='HOLD' THEN
  IF body->>'unit' IS NULL OR body->>'unit' NOT IN('BASE','CARTON') OR(body->>'unit'='CARTON' AND prod.base_unit<>'PIECE') THEN RAISE EXCEPTION 'WMS_INVALID_QUANTITY' USING ERRCODE='23514'; END IF;
  factor=CASE WHEN body->>'unit'='CARTON' THEN prod.pieces_per_carton ELSE 1 END;
 ELSE factor=d.conversion_factor; END IF;
 qty=input_qty*factor;
 IF prod.base_unit='PIECE' AND qty<>trunc(qty) THEN RAISE EXCEPTION 'WMS_FRACTIONAL_PIECE' USING ERRCODE='23514'; END IF;
 IF op='HOLD' THEN
  IF qty>pos.physical-pos.reserved-pos.quarantined THEN RAISE EXCEPTION 'WMS_INSUFFICIENT_STOCK' USING ERRCODE='23514'; END IF;
  INSERT INTO wms_quarantines(id,company_id,warehouse_id,batch_id,reference,reason,input_unit,conversion_factor,held_base,created_by)
   VALUES(new_id,c,w,batch,body->>'reference',body->>'reason',body->>'unit',factor,qty,actor) RETURNING * INTO d;
  effect=0;held_delta=qty;
 ELSE
  IF qty>d.held_base-d.released_base-d.written_off_base OR qty>pos.quality_held OR qty>pos.quarantined
   THEN RAISE EXCEPTION 'WMS_QUARANTINE_EXCEEDS_REMAINING' USING ERRCODE='23514'; END IF;
  IF op='RELEASE' AND (NOT prod.is_active OR lot.is_quarantined OR pos.quality_blocked OR lot.expiry_date<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)
   THEN RAISE EXCEPTION 'WMS_QUARANTINE_RELEASE_BLOCKED' USING ERRCODE='23514'; END IF;
  UPDATE wms_quarantines SET released_base=released_base+CASE WHEN op='RELEASE' THEN qty ELSE 0 END,
   written_off_base=written_off_base+CASE WHEN op='WRITE_OFF' THEN qty ELSE 0 END,
   status=CASE WHEN released_base+written_off_base+qty=held_base THEN 'CLOSED' ELSE 'PARTIAL' END,version=version+1
   WHERE company_id=c AND id=d.id RETURNING * INTO d;
  effect=CASE WHEN op='WRITE_OFF' THEN -qty ELSE 0 END;held_delta=-qty;
 END IF;
 event=new_id||':'||op;
 INSERT INTO wms_quarantine_events(id,company_id,quarantine_id,operation,quantity_base,reason,actor_id) VALUES(event,c,d.id,op,qty,body->>'reason',actor);
 INSERT INTO wms_movements(id,company_id,warehouse_id,batch_id,kind,quantity,quarantine_delta,input_quantity,input_unit,conversion_factor,reference,reason,idempotency_key,command,actor_id,quarantine_event_id)
 VALUES(event,c,w,batch,CASE op WHEN 'HOLD' THEN 'QUARANTINE_HOLD' WHEN 'RELEASE' THEN 'QUARANTINE_RELEASE' ELSE 'WRITE_OFF' END,
  effect,held_delta,CASE WHEN op='HOLD' THEN input_qty ELSE -input_qty END,d.input_unit,factor,d.reference,body->>'reason',event,cmd,actor,event);
 UPDATE wms_positions SET physical=physical+effect,quarantined=quarantined+held_delta,quality_held=quality_held+held_delta,
  updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE company_id=c AND warehouse_id=w AND batch_id=batch;
 result=jsonb_build_object('id',d.id,'status',d.status,'eventId',event);
 INSERT INTO wms_quarantine_commands VALUES(c,k,cmd,result);
 RETURN result;
END $$;
INSERT INTO permissions(id,code,description) VALUES
 ('perm-wms-quarantine-hold','wms.quarantine.hold','Quarantine existing unreserved warehouse stock'),
 ('perm-wms-quarantine-release','wms.quarantine.release','Approve release of sound quarantined quantity'),
 ('perm-wms-quarantine-writeoff','wms.quarantine.writeoff','Approve permanent physical write-off of quarantined quantity')
ON CONFLICT(code) DO NOTHING;
COMMIT;
