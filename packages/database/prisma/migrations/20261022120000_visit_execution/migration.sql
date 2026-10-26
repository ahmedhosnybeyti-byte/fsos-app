-- Additive operational state. No canonical/Excel facts or role grants change.
CREATE TABLE visit_executions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  rep_id TEXT NOT NULL,
  customer_code TEXT NOT NULL CHECK (length(customer_code) BETWEEN 1 AND 120),
  customer_name TEXT NOT NULL,
  rep_name TEXT NOT NULL,
  entry_source TEXT NOT NULL CHECK (entry_source IN ('VISIT_COPILOT','NEW_CUSTOMER','DISCOVERY','OPPORTUNITY_RADAR')),
  source_reference TEXT,
  request_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED')),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  goal TEXT NOT NULL DEFAULT 'FOLLOW_UP' CHECK (goal IN ('SALES','COLLECTION','RETURN','FOLLOW_UP','MARKET_DOCUMENTATION')),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 4000),
  outcome TEXT CHECK (outcome IN ('ACHIEVED','NOT_ACHIEVED','FOLLOW_UP')),
  failure_reason TEXT CHECK (failure_reason IN ('CUSTOMER_ABSENT','CLOSED','PRICE_REJECTED','NOT_INTERESTED','SUFFICIENT_STOCK','DECISION_MAKER_ABSENT','OTHER')),
  reason_detail TEXT NOT NULL DEFAULT '' CHECK (length(reason_detail) <= 500),
  last_command_key TEXT,
  last_command_hash TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  FOREIGN KEY (company_id,rep_id) REFERENCES users(company_id,id) ON DELETE RESTRICT,
  UNIQUE (company_id,id),
  UNIQUE (company_id,rep_id,id),
  UNIQUE (company_id,rep_id,request_key),
  CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL)),
  CHECK (status <> 'COMPLETED' OR outcome IS NOT NULL),
  CHECK (outcome IS DISTINCT FROM 'NOT_ACHIEVED' OR failure_reason IS NOT NULL),
  CHECK (outcome IS NOT DISTINCT FROM 'NOT_ACHIEVED' OR (failure_reason IS NULL AND reason_detail = '')),
  CHECK (failure_reason IS DISTINCT FROM 'OTHER' OR length(btrim(reason_detail)) > 0)
);
CREATE UNIQUE INDEX visit_executions_one_open ON visit_executions(company_id,rep_id,lower(btrim(customer_code))) WHERE status='OPEN';
CREATE INDEX visit_executions_history ON visit_executions(company_id,rep_id,customer_code,started_at DESC,id);
-- Remember every start retry key, including keys that resumed an open visit.
CREATE TABLE visit_execution_starts (
  company_id TEXT NOT NULL,
  rep_id TEXT NOT NULL,
  request_key TEXT NOT NULL,
  visit_id TEXT NOT NULL,
  PRIMARY KEY(company_id,rep_id,request_key),
  FOREIGN KEY(company_id,rep_id) REFERENCES users(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,rep_id,visit_id) REFERENCES visit_executions(company_id,rep_id,id) ON DELETE RESTRICT
);
CREATE TABLE visit_execution_photos (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  visit_id TEXT NOT NULL,
  request_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('SHELF','COOLER','PLANOGRAM')),
  object_key TEXT NOT NULL UNIQUE,
  content_hash TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 8388608),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(company_id,visit_id) REFERENCES visit_executions(company_id,id) ON DELETE RESTRICT,
  UNIQUE(company_id,visit_id,request_key)
);
CREATE INDEX visit_execution_photos_visit ON visit_execution_photos(company_id,visit_id,created_at,id);
INSERT INTO permissions(id,code,description) VALUES ('permission-visits-execute','visits.execute','Execute own scoped customer visits and market photos') ON CONFLICT(code) DO NOTHING;
