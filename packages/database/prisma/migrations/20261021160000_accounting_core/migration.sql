-- Phase 1 only. No mode activation, role grants, financial opening/import or
-- WMS/Canonical mutations. One currency (SAR), exact 2-decimal manual journals.
CREATE TABLE accounting_books (
 company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE RESTRICT,
 currency TEXT NOT NULL DEFAULT 'SAR' CHECK(currency='SAR'), closed_through DATE
);
CREATE TABLE accounting_accounts (
 company_id TEXT NOT NULL REFERENCES accounting_books(company_id) ON DELETE RESTRICT,
 code TEXT NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
 type TEXT NOT NULL CHECK(type IN('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
 PRIMARY KEY(company_id,code)
);
CREATE TABLE accounting_journals (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES accounting_books(company_id) ON DELETE RESTRICT,
 entry_date DATE NOT NULL, reference TEXT NOT NULL CHECK(length(reference) BETWEEN 1 AND 80),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 300),
 kind TEXT NOT NULL CHECK(kind IN('MANUAL','REVERSAL','CORRECTION')),
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','POSTED')),
 reversal_of TEXT, correction_of TEXT, actor_id TEXT NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 UNIQUE(company_id,id), UNIQUE(company_id,reference), UNIQUE(company_id,reversal_of), UNIQUE(company_id,correction_of),
 FOREIGN KEY(company_id,actor_id) REFERENCES users(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,reversal_of) REFERENCES accounting_journals(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,correction_of) REFERENCES accounting_journals(company_id,id) ON DELETE RESTRICT,
 CHECK((kind='MANUAL' AND reversal_of IS NULL AND correction_of IS NULL) OR
       (kind='REVERSAL' AND reversal_of IS NOT NULL AND correction_of IS NULL AND reversal_of<>id) OR
       (kind='CORRECTION' AND correction_of IS NOT NULL AND reversal_of IS NULL AND correction_of<>id))
);
CREATE INDEX accounting_journals_company_date ON accounting_journals(company_id,entry_date DESC,id DESC);
CREATE TABLE accounting_lines (
 company_id TEXT NOT NULL, journal_id TEXT NOT NULL, line_no INTEGER NOT NULL CHECK(line_no BETWEEN 1 AND 100),
 account_code TEXT NOT NULL, debit NUMERIC NOT NULL, credit NUMERIC NOT NULL,
 memo TEXT NOT NULL DEFAULT '' CHECK(length(memo)<=200),
 PRIMARY KEY(company_id,journal_id,line_no),
 FOREIGN KEY(company_id,journal_id) REFERENCES accounting_journals(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,account_code) REFERENCES accounting_accounts(company_id,code) ON DELETE RESTRICT,
 CHECK(debit>=0 AND credit>=0 AND debit<100000000000000 AND credit<100000000000000
   AND debit=round(debit,2) AND credit=round(credit,2) AND ((debit>0 AND credit=0) OR(credit>0 AND debit=0)))
);
CREATE TABLE accounting_commands (
 company_id TEXT NOT NULL REFERENCES accounting_books(company_id) ON DELETE RESTRICT, idempotency_key TEXT NOT NULL,
 payload JSONB NOT NULL, result JSONB NOT NULL, actor_id TEXT NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 PRIMARY KEY(company_id,idempotency_key),
 FOREIGN KEY(company_id,actor_id) REFERENCES users(company_id,id) ON DELETE RESTRICT
);
CREATE FUNCTION accounting_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ACC_IMMUTABLE' USING ERRCODE='23514'; END $$;
CREATE TRIGGER accounting_accounts_immutable BEFORE UPDATE OR DELETE ON accounting_accounts FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
CREATE TRIGGER accounting_commands_immutable BEFORE UPDATE OR DELETE ON accounting_commands FOR EACH ROW EXECUTE FUNCTION accounting_immutable();

CREATE FUNCTION accounting_protect_book() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR NEW.company_id<>OLD.company_id OR NEW.currency<>OLD.currency OR
 (OLD.closed_through IS NOT NULL AND (NEW.closed_through IS NULL OR NEW.closed_through<OLD.closed_through))
 THEN RAISE EXCEPTION 'ACC_BOOK_IMMUTABLE' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER accounting_book_protect BEFORE UPDATE OR DELETE ON accounting_books FOR EACH ROW EXECUTE FUNCTION accounting_protect_book();
CREATE FUNCTION accounting_protect_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cutoff DATE;
BEGIN
 IF TG_OP<>'INSERT' THEN
   IF TG_OP='DELETE' OR OLD.status='POSTED' OR NEW.status<>'POSTED' OR
      (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status')
   THEN RAISE EXCEPTION 'ACC_IMMUTABLE' USING ERRCODE='23514'; END IF;
 ELSE
   -- One short transaction per book: serializes retry/reversal/close races.
   SELECT closed_through INTO cutoff FROM accounting_books WHERE company_id=NEW.company_id FOR UPDATE;
   IF cutoff IS NOT NULL AND NEW.entry_date<=cutoff THEN RAISE EXCEPTION 'ACC_PERIOD_CLOSED' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER accounting_journal_protect BEFORE INSERT OR UPDATE OR DELETE ON accounting_journals FOR EACH ROW EXECUTE FUNCTION accounting_protect_journal();
CREATE FUNCTION accounting_protect_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE state TEXT;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'ACC_IMMUTABLE' USING ERRCODE='23514'; END IF;
 SELECT status INTO state FROM accounting_journals WHERE company_id=NEW.company_id AND id=NEW.journal_id FOR UPDATE;
 IF state='POSTED' THEN RAISE EXCEPTION 'ACC_IMMUTABLE' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER accounting_line_protect BEFORE INSERT OR UPDATE OR DELETE ON accounting_lines FOR EACH ROW EXECUTE FUNCTION accounting_protect_line();

-- A draft, empty, unbalanced or forged reversal cannot survive COMMIT even if
-- an alternative writer bypasses the HTTP schemas. No floating point money.
CREATE FUNCTION accounting_assert_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j accounting_journals; original accounting_journals; n INTEGER; dr NUMERIC; cr NUMERIC;
BEGIN
 SELECT * INTO j FROM accounting_journals WHERE company_id=NEW.company_id AND id=NEW.id;
 SELECT count(*),sum(debit),sum(credit) INTO n,dr,cr FROM accounting_lines WHERE company_id=j.company_id AND journal_id=j.id;
 IF j.status<>'POSTED' OR n<2 OR n>100 OR dr IS NULL OR dr<>cr OR dr<=0 THEN RAISE EXCEPTION 'ACC_UNBALANCED' USING ERRCODE='23514'; END IF;
 IF j.kind IN('REVERSAL','CORRECTION') THEN
   SELECT * INTO original FROM accounting_journals WHERE company_id=j.company_id AND id=coalesce(j.reversal_of,j.correction_of);
   IF original.status<>'POSTED' OR original.kind='REVERSAL' OR j.entry_date<original.entry_date THEN RAISE EXCEPTION 'ACC_INVALID_SOURCE' USING ERRCODE='23514'; END IF;
   IF j.kind='REVERSAL' AND EXISTS(
     (SELECT line_no,account_code,debit,credit,memo FROM accounting_lines WHERE company_id=j.company_id AND journal_id=j.id
      EXCEPT SELECT line_no,account_code,credit,debit,memo FROM accounting_lines WHERE company_id=j.company_id AND journal_id=original.id)
     UNION ALL
     (SELECT line_no,account_code,credit,debit,memo FROM accounting_lines WHERE company_id=j.company_id AND journal_id=original.id
      EXCEPT SELECT line_no,account_code,debit,credit,memo FROM accounting_lines WHERE company_id=j.company_id AND journal_id=j.id)
   ) THEN RAISE EXCEPTION 'ACC_REVERSAL_MISMATCH' USING ERRCODE='23514'; END IF;
   IF j.kind='CORRECTION' AND NOT EXISTS(SELECT 1 FROM accounting_journals WHERE company_id=j.company_id AND reversal_of=original.id AND entry_date=j.entry_date)
   THEN RAISE EXCEPTION 'ACC_CORRECTION_REQUIRES_REVERSAL' USING ERRCODE='23514'; END IF;
 END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER accounting_journal_balanced AFTER INSERT OR UPDATE ON accounting_journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accounting_assert_balanced();

CREATE FUNCTION accounting_write_journal(c TEXT, actor TEXT, jid TEXT, d DATE, ref TEXT, why TEXT, k TEXT, original TEXT, lines JSONB)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE line JSONB; idx INTEGER:=0; dr NUMERIC; cr NUMERIC;
BEGIN
 IF jsonb_typeof(lines)<>'array' OR jsonb_array_length(lines) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'ACC_INVALID_LINES' USING ERRCODE='23514'; END IF;
 INSERT INTO accounting_journals(id,company_id,entry_date,reference,reason,kind,reversal_of,correction_of,actor_id)
 VALUES(jid,c,d,ref,why,k,CASE WHEN k='REVERSAL' THEN original END,CASE WHEN k='CORRECTION' THEN original END,actor);
 FOR line IN SELECT value FROM jsonb_array_elements(lines) LOOP
   idx:=idx+1; dr:=(line->>'debit')::numeric; cr:=(line->>'credit')::numeric;
   INSERT INTO accounting_lines(company_id,journal_id,line_no,account_code,debit,credit,memo)
   VALUES(c,jid,idx,line->>'accountCode',dr,cr,coalesce(line->>'memo',''));
 END LOOP;
 IF (SELECT sum(debit)<>sum(credit) FROM accounting_lines WHERE company_id=c AND journal_id=jid) THEN RAISE EXCEPTION 'ACC_UNBALANCED' USING ERRCODE='23514'; END IF;
 UPDATE accounting_journals SET status='POSTED' WHERE company_id=c AND id=jid;
END $$;
CREATE FUNCTION accounting_post_command(c TEXT, actor TEXT, key TEXT, action TEXT, target TEXT, body JSONB, jid TEXT, rid TEXT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE prior accounting_commands; original accounting_journals; payload JSONB; result JSONB; lines JSONB; reverse_lines JSONB; d DATE;
BEGIN
 -- Lock the book before checking keys, business references or source state.
 PERFORM 1 FROM accounting_books WHERE company_id=c FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACC_BOOK_REQUIRED' USING ERRCODE='23514'; END IF;
 IF action NOT IN('POST','REVERSE','CORRECT') OR key IS NULL OR length(key)>80 THEN RAISE EXCEPTION 'ACC_INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 d:=(body->>'date')::date; lines:=body->'lines';
 IF action<>'REVERSE' THEN
   IF jsonb_typeof(lines)<>'array' OR jsonb_array_length(lines) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'ACC_INVALID_LINES' USING ERRCODE='23514'; END IF;
   -- Normalize monetary representations for equivalent retries.
   SELECT jsonb_agg(jsonb_build_object('accountCode',x->>'accountCode','debit',(x->>'debit')::numeric,'credit',(x->>'credit')::numeric,'memo',coalesce(x->>'memo','')) ORDER BY n)
   INTO lines FROM jsonb_array_elements(lines) WITH ORDINALITY AS v(x,n);
   body:=jsonb_set(body,'{lines}',lines);
   IF body->>'reference' LIKE 'REV:%' THEN RAISE EXCEPTION 'ACC_RESERVED_REFERENCE' USING ERRCODE='23514'; END IF;
 END IF;
 payload:=jsonb_build_object('action',action,'target',target,'body',body);
 SELECT * INTO prior FROM accounting_commands WHERE company_id=c AND idempotency_key=key;
 IF FOUND THEN
   IF prior.payload<>payload THEN RAISE EXCEPTION 'ACC_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
   RETURN prior.result;
 END IF;
 IF action<>'POST' THEN
   SELECT * INTO original FROM accounting_journals WHERE company_id=c AND id=target FOR UPDATE;
   IF NOT FOUND OR original.kind='REVERSAL' OR original.status<>'POSTED' OR d<original.entry_date THEN RAISE EXCEPTION 'ACC_INVALID_SOURCE' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM accounting_journals WHERE company_id=c AND reversal_of=target) THEN RAISE EXCEPTION 'ACC_ALREADY_REVERSED' USING ERRCODE='23514'; END IF;
   SELECT jsonb_agg(jsonb_build_object('accountCode',account_code,'debit',credit,'credit',debit,'memo',memo) ORDER BY line_no)
   INTO reverse_lines FROM accounting_lines WHERE company_id=c AND journal_id=target;
   PERFORM accounting_write_journal(c,actor,rid,d,'REV:'||rid,body->>'reason','REVERSAL',target,reverse_lines);
 END IF;
 IF action<>'REVERSE' THEN
   PERFORM accounting_write_journal(c,actor,jid,d,body->>'reference',body->>'reason',CASE WHEN action='POST' THEN 'MANUAL' ELSE 'CORRECTION' END,target,lines);
   result:=jsonb_build_object('journalId',jid);
   IF action='CORRECT' THEN result:=result||jsonb_build_object('reversalId',rid); END IF;
 ELSE result:=jsonb_build_object('journalId',rid); END IF;
 INSERT INTO accounting_commands(company_id,idempotency_key,payload,result,actor_id) VALUES(c,key,payload,result,actor);
 RETURN result;
END $$;

INSERT INTO permissions(id,code,description) VALUES
 ('permission-accounting-read','accounting.read','Read company chart, journals and trial balance'),
 ('permission-accounting-accounts','accounting.accounts.manage','Create company accounting accounts'),
 ('permission-accounting-post','accounting.journal.post','Post balanced manual journals'),
 ('permission-accounting-reverse','accounting.journal.reverse','Reverse or correct posted journals with reason'),
 ('permission-accounting-close','accounting.period.close','Advance financial closed-through date')
ON CONFLICT(code) DO NOTHING;
