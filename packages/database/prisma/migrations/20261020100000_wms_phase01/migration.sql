-- Additive operational foundation. No tenant activation, seeds, role grants or
-- analytical/canonical writes. Functions are SECURITY INVOKER (never a bypass).
CREATE UNIQUE INDEX warehouses_company_id_id_key ON warehouses(company_id,id);
CREATE UNIQUE INDEX users_company_id_id_key ON users(company_id,id);

CREATE TABLE wms_products (
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  code TEXT NOT NULL, barcode TEXT, name TEXT NOT NULL,
  base_unit TEXT NOT NULL DEFAULT 'PIECE' CHECK (base_unit IN ('PIECE','KG','LITRE')),
  pieces_per_carton INTEGER NOT NULL DEFAULT 1 CHECK (pieces_per_carton BETWEEN 1 AND 1000000),
  track_batches BOOLEAN NOT NULL DEFAULT false, track_expiry BOOLEAN NOT NULL DEFAULT false,
  sensitive_handling BOOLEAN NOT NULL DEFAULT false, handling_notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true, version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  UNIQUE(company_id,id), UNIQUE(company_id,code), UNIQUE(company_id,barcode),
  CHECK (NOT track_expiry OR track_batches),
  CHECK (base_unit='PIECE' OR pieces_per_carton=1),
  CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$'),
  CHECK (length(name) BETWEEN 1 AND 160), CHECK (barcode IS NULL OR length(barcode) BETWEEN 1 AND 80)
);
CREATE INDEX wms_products_company_active_id ON wms_products(company_id,is_active,id);

CREATE TABLE wms_batches (
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL, product_id TEXT NOT NULL, code TEXT NOT NULL,
  production_date DATE, expiry_date DATE, is_quarantined BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  UNIQUE(company_id,id), UNIQUE(company_id,product_id,id), UNIQUE(company_id,product_id,code),
  FOREIGN KEY(company_id,product_id) REFERENCES wms_products(company_id,id) ON DELETE RESTRICT,
  CHECK (production_date IS NULL OR expiry_date IS NULL OR expiry_date>production_date)
);
CREATE INDEX wms_batches_company_product_expiry ON wms_batches(company_id,product_id,expiry_date,id);
CREATE INDEX wms_batches_company_expiry ON wms_batches(company_id,expiry_date,id);

CREATE TABLE wms_warehouse_access (
  company_id TEXT NOT NULL, warehouse_id TEXT NOT NULL, user_id TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  PRIMARY KEY(company_id,warehouse_id,user_id),
  FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,user_id) REFERENCES users(company_id,id) ON DELETE RESTRICT
);
CREATE INDEX wms_access_company_user_warehouse ON wms_warehouse_access(company_id,user_id,warehouse_id);

CREATE TABLE wms_positions (
  company_id TEXT NOT NULL, warehouse_id TEXT NOT NULL, batch_id TEXT NOT NULL,
  physical NUMERIC(24,6) NOT NULL DEFAULT 0, reserved NUMERIC(24,6) NOT NULL DEFAULT 0,
  quarantined NUMERIC(24,6) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  PRIMARY KEY(company_id,warehouse_id,batch_id),
  FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,batch_id) REFERENCES wms_batches(company_id,id) ON DELETE RESTRICT,
  CHECK (physical>=0 AND reserved>=0 AND quarantined>=0 AND reserved+quarantined<=physical)
);

CREATE TABLE wms_movements (
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL, warehouse_id TEXT NOT NULL, batch_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('OPENING','REVERSAL')),
  quantity NUMERIC(24,6) NOT NULL CHECK (quantity<>0),
  quarantine_delta NUMERIC(24,6) NOT NULL DEFAULT 0,
  input_quantity NUMERIC(24,6) NOT NULL, input_unit TEXT NOT NULL,
  conversion_factor INTEGER NOT NULL, reference TEXT NOT NULL, reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL, command JSONB NOT NULL,
  reversal_of TEXT, actor_id TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  UNIQUE(company_id,id), UNIQUE(company_id,idempotency_key), UNIQUE(company_id,reversal_of),
  UNIQUE(company_id,warehouse_id,batch_id,kind,reference),
  FOREIGN KEY(company_id,warehouse_id,batch_id) REFERENCES wms_positions(company_id,warehouse_id,batch_id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,reversal_of) REFERENCES wms_movements(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,actor_id) REFERENCES users(company_id,id) ON DELETE RESTRICT,
  CHECK ((kind='OPENING' AND quantity>0 AND reversal_of IS NULL) OR
         (kind='REVERSAL' AND quantity<0 AND reversal_of IS NOT NULL)),
  CHECK (length(reference) BETWEEN 1 AND 80 AND length(reason) BETWEEN 3 AND 300)
);
CREATE INDEX wms_movements_company_warehouse_created ON wms_movements(company_id,warehouse_id,created_at DESC,id DESC);
CREATE INDEX wms_movements_company_batch ON wms_movements(company_id,batch_id);

CREATE FUNCTION wms_immutable_movement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'WMS_LEDGER_IMMUTABLE' USING ERRCODE='23514'; END $$;
CREATE TRIGGER wms_movement_no_update_delete BEFORE UPDATE OR DELETE ON wms_movements
  FOR EACH ROW EXECUTE FUNCTION wms_immutable_movement();

-- Also protects tracking/packaging against alternate future mutation paths.
CREATE FUNCTION wms_protect_master() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.base_unit,NEW.pieces_per_carton,NEW.track_batches,NEW.track_expiry)
     IS DISTINCT FROM (OLD.base_unit,OLD.pieces_per_carton,OLD.track_batches,OLD.track_expiry)
     AND (EXISTS(SELECT 1 FROM wms_batches WHERE company_id=OLD.company_id AND product_id=OLD.id))
  THEN RAISE EXCEPTION 'WMS_PACKAGING_LOCKED' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER wms_product_protect BEFORE UPDATE ON wms_products FOR EACH ROW EXECUTE FUNCTION wms_protect_master();
CREATE FUNCTION wms_protect_batch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM wms_movements WHERE company_id=OLD.company_id AND batch_id=OLD.id)
  THEN RAISE EXCEPTION 'WMS_BATCH_POSTED' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER wms_batch_protect BEFORE UPDATE OR DELETE ON wms_batches FOR EACH ROW EXECUTE FUNCTION wms_protect_batch();

-- Date boundary is UTC date-only, independent of connection/session timezone.
CREATE VIEW wms_inventory_state AS
SELECT s.company_id,s.warehouse_id,s.batch_id,b.product_id,p.base_unit,
  s.physical,s.reserved,s.quarantined,
  CASE WHEN b.expiry_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date OR b.is_quarantined OR NOT p.is_active
    THEN 0::numeric ELSE s.physical-s.reserved-s.quarantined END AS available,
  CASE WHEN b.expiry_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date THEN s.physical ELSE 0::numeric END AS expired,
  b.expiry_date-(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AS days_remaining,
  CASE WHEN b.production_date IS NOT NULL AND b.expiry_date IS NOT NULL
    THEN LEAST(100::numeric,GREATEST(0::numeric,ROUND(100.0 *
      ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date-b.production_date)/(b.expiry_date-b.production_date),2)))
    ELSE NULL END AS life_consumed_pct
FROM wms_positions s JOIN wms_batches b ON b.company_id=s.company_id AND b.id=s.batch_id
JOIN wms_products p ON p.company_id=b.company_id AND p.id=b.product_id;

-- Future issue/reservation paths must call this inside their locked transaction.
CREATE FUNCTION wms_assert_issuable(c TEXT,w TEXT,b TEXT,q NUMERIC) RETURNS void LANGUAGE plpgsql AS $$
DECLARE eligible NUMERIC;
BEGIN
  PERFORM 1 FROM wms_positions WHERE company_id=c AND warehouse_id=w AND batch_id=b FOR UPDATE;
  SELECT available INTO eligible FROM wms_inventory_state WHERE company_id=c AND warehouse_id=w AND batch_id=b;
  IF q IS NULL OR q<=0 OR eligible IS NULL OR eligible<q THEN
    RAISE EXCEPTION 'WMS_STOCK_NOT_ISSUABLE' USING ERRCODE='23514';
  END IF;
END $$;

CREATE FUNCTION wms_post_opening(c TEXT,w TEXT,p TEXT,b TEXT,q NUMERIC,u TEXT,hold BOOLEAN,
  ref TEXT,k TEXT,why TEXT,actor TEXT,new_id TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE prod wms_products; lot wms_batches; old wms_movements; cmd JSONB; qty NUMERIC; factor INTEGER; lot_id TEXT;
BEGIN
  cmd=jsonb_build_object('warehouse',w,'product',p,'batch',b,'quantity',q,'unit',u,'hold',hold,'reference',ref,'reason',why);
  PERFORM pg_advisory_xact_lock(hashtextextended(c || ':' || k,0));
  SELECT * INTO old FROM wms_movements WHERE company_id=c AND idempotency_key=k;
  IF FOUND THEN
    IF old.kind<>'OPENING' OR old.command<>cmd THEN RAISE EXCEPTION 'WMS_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
    RETURN old.id;
  END IF;
  PERFORM 1 FROM warehouses WHERE company_id=c AND id=w AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WMS_WAREHOUSE_NOT_FOUND' USING ERRCODE='23514'; END IF;
  SELECT * INTO prod FROM wms_products WHERE company_id=c AND id=p FOR UPDATE;
  IF NOT FOUND OR NOT prod.is_active THEN RAISE EXCEPTION 'WMS_PRODUCT_NOT_FOUND' USING ERRCODE='23514'; END IF;
  IF q IS NULL OR q<=0 OR q>=1000000000000 OR q<>trunc(q,6) OR u NOT IN ('BASE','CARTON')
    OR (u='CARTON' AND prod.base_unit<>'PIECE') THEN RAISE EXCEPTION 'WMS_INVALID_QUANTITY' USING ERRCODE='23514'; END IF;
  factor=CASE WHEN u='CARTON' THEN prod.pieces_per_carton ELSE 1 END; qty=q*factor;
  IF prod.base_unit='PIECE' AND qty<>trunc(qty) THEN RAISE EXCEPTION 'WMS_FRACTIONAL_PIECE' USING ERRCODE='23514'; END IF;
  IF prod.track_batches THEN
    SELECT * INTO lot FROM wms_batches WHERE company_id=c AND product_id=p AND id=b FOR SHARE;
    IF NOT FOUND OR (prod.track_expiry AND lot.expiry_date IS NULL) THEN RAISE EXCEPTION 'WMS_BATCH_REQUIRED' USING ERRCODE='23514'; END IF;
    lot_id=lot.id;
  ELSE
    IF b IS NOT NULL THEN RAISE EXCEPTION 'WMS_BATCH_NOT_ALLOWED' USING ERRCODE='23514'; END IF;
    lot_id='untracked-' || p;
    INSERT INTO wms_batches(id,company_id,product_id,code) VALUES(lot_id,c,p,'__UNTRACKED__') ON CONFLICT DO NOTHING;
  END IF;
  IF lot.production_date > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'WMS_FUTURE_PRODUCTION' USING ERRCODE='23514'; END IF;
  INSERT INTO wms_positions(company_id,warehouse_id,batch_id) VALUES(c,w,lot_id) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM wms_positions WHERE company_id=c AND warehouse_id=w AND batch_id=lot_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM wms_movements m WHERE m.company_id=c AND m.warehouse_id=w AND m.batch_id=lot_id
    AND m.kind='OPENING' AND NOT EXISTS(SELECT 1 FROM wms_movements r WHERE r.company_id=c AND r.reversal_of=m.id))
  THEN RAISE EXCEPTION 'WMS_OPENING_EXISTS' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM wms_positions WHERE company_id=c AND warehouse_id=w AND batch_id=lot_id
    AND (physical<>0 OR reserved<>0 OR quarantined<>0)) THEN RAISE EXCEPTION 'WMS_NONZERO_POSITION' USING ERRCODE='23514'; END IF;
  INSERT INTO wms_movements(id,company_id,warehouse_id,batch_id,kind,quantity,quarantine_delta,input_quantity,input_unit,
    conversion_factor,reference,reason,idempotency_key,command,actor_id)
  VALUES(new_id,c,w,lot_id,'OPENING',qty,CASE WHEN hold OR COALESCE(lot.is_quarantined,false) THEN qty ELSE 0 END,
    q,u,factor,ref,why,k,cmd,actor);
  UPDATE wms_positions SET physical=qty,quarantined=CASE WHEN hold OR COALESCE(lot.is_quarantined,false) THEN qty ELSE 0 END,
    updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE company_id=c AND warehouse_id=w AND batch_id=lot_id;
  RETURN new_id;
END $$;

CREATE FUNCTION wms_reverse_opening(c TEXT,w TEXT,original TEXT,k TEXT,why TEXT,actor TEXT,new_id TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE old wms_movements; existing wms_movements; cmd JSONB; product TEXT;
BEGIN
  cmd=jsonb_build_object('warehouse',w,'reversalOf',original,'reason',why);
  PERFORM pg_advisory_xact_lock(hashtextextended(c || ':' || k,0));
  SELECT * INTO existing FROM wms_movements WHERE company_id=c AND idempotency_key=k;
  IF FOUND THEN
    IF existing.kind<>'REVERSAL' OR existing.command<>cmd THEN RAISE EXCEPTION 'WMS_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
    RETURN existing.id;
  END IF;
  SELECT * INTO old FROM wms_movements WHERE company_id=c AND warehouse_id=w AND id=original AND kind='OPENING';
  IF NOT FOUND THEN RAISE EXCEPTION 'WMS_MOVEMENT_NOT_FOUND' USING ERRCODE='23514'; END IF;
  SELECT product_id INTO product FROM wms_batches WHERE company_id=c AND id=old.batch_id;
  PERFORM 1 FROM wms_products WHERE company_id=c AND id=product FOR UPDATE;
  PERFORM 1 FROM wms_positions WHERE company_id=c AND warehouse_id=w AND batch_id=old.batch_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM wms_movements WHERE company_id=c AND reversal_of=original) THEN
    RAISE EXCEPTION 'WMS_ALREADY_REVERSED' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM wms_positions WHERE company_id=c AND warehouse_id=w AND batch_id=old.batch_id
    AND physical=old.quantity AND reserved=0 AND quarantined=old.quarantine_delta)
  THEN RAISE EXCEPTION 'WMS_REVERSAL_STOCK_CHANGED' USING ERRCODE='23514'; END IF;
  INSERT INTO wms_movements(id,company_id,warehouse_id,batch_id,kind,quantity,quarantine_delta,input_quantity,input_unit,
    conversion_factor,reference,reason,idempotency_key,command,reversal_of,actor_id)
  VALUES(new_id,c,w,old.batch_id,'REVERSAL',-old.quantity,-old.quarantine_delta,-old.input_quantity,old.input_unit,
    old.conversion_factor,old.reference,why,k,cmd,original,actor);
  UPDATE wms_positions SET physical=0,quarantined=0,updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    WHERE company_id=c AND warehouse_id=w AND batch_id=old.batch_id;
  RETURN new_id;
END $$;

INSERT INTO permissions(id,code,description) VALUES
 ('perm-wms-read','wms.read','Read authorized operational warehouses'),
 ('perm-wms-products','wms.products.manage','Create and edit operational products and lots'),
 ('perm-wms-opening','wms.opening.post','Post and reverse documented opening stock'),
 ('perm-wms-access','wms.access.manage','Assign company warehouse access')
ON CONFLICT(code) DO NOTHING;
