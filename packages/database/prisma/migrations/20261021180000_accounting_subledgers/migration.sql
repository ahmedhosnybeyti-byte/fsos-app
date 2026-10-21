-- Additive AR/AP. No customer/history import or activation. Balances come from
-- the existing GL, never from a mutable second balance or historical invoices.
CREATE TABLE accounting_parties (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN('CUSTOMER','SUPPLIER')),
 code TEXT NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'), name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
 account_code TEXT NOT NULL, UNIQUE(company_id,id),UNIQUE(company_id,kind,code),UNIQUE(company_id,account_code),
 FOREIGN KEY(company_id,account_code) REFERENCES accounting_accounts(company_id,code) ON DELETE RESTRICT
);
CREATE INDEX accounting_parties_company_kind_code ON accounting_parties(company_id,kind,code);
CREATE TABLE accounting_treasury (
 company_id TEXT NOT NULL,account_code TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN('CASH','BANK')),
 PRIMARY KEY(company_id,account_code),
 FOREIGN KEY(company_id,account_code) REFERENCES accounting_accounts(company_id,code) ON DELETE RESTRICT
);
CREATE TABLE accounting_vouchers (
 id TEXT PRIMARY KEY,company_id TEXT NOT NULL,party_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('OPENING','RECEIPT','PAYMENT','REVERSAL')),
 entry_date DATE NOT NULL,reference TEXT NOT NULL CHECK(length(reference) BETWEEN 1 AND 60),
 amount NUMERIC NOT NULL CHECK(amount>0 AND amount<100000000000000 AND amount=round(amount,2)),
 counter_account_code TEXT NOT NULL,journal_id TEXT NOT NULL,reversal_of TEXT,
 origin TEXT NOT NULL CHECK(origin IN('EXPLICIT_OPENING','MANUAL_VOUCHER')),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 300),actor_id TEXT NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 UNIQUE(company_id,id),UNIQUE(company_id,reference),UNIQUE(company_id,journal_id),UNIQUE(company_id,reversal_of),
 FOREIGN KEY(company_id,party_id) REFERENCES accounting_parties(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,counter_account_code) REFERENCES accounting_accounts(company_id,code) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,journal_id) REFERENCES accounting_journals(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,reversal_of) REFERENCES accounting_vouchers(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,actor_id) REFERENCES users(company_id,id) ON DELETE RESTRICT,
 CHECK((kind='REVERSAL')=(reversal_of IS NOT NULL)),CHECK(reversal_of IS NULL OR reversal_of<>id),
 CHECK(kind<>'OPENING' OR origin='EXPLICIT_OPENING')
);
CREATE UNIQUE INDEX accounting_vouchers_one_opening ON accounting_vouchers(company_id,party_id) WHERE kind='OPENING';
CREATE INDEX accounting_vouchers_party_date ON accounting_vouchers(company_id,party_id,entry_date DESC,created_at DESC,id DESC);
CREATE INDEX accounting_lines_company_account_journal ON accounting_lines(company_id,account_code,journal_id);
CREATE TABLE accounting_voucher_commands (
 company_id TEXT NOT NULL,idempotency_key TEXT NOT NULL,payload JSONB NOT NULL,result JSONB NOT NULL,
 PRIMARY KEY(company_id,idempotency_key),
 FOREIGN KEY(company_id,idempotency_key) REFERENCES accounting_commands(company_id,idempotency_key) ON DELETE RESTRICT
);
CREATE TRIGGER accounting_parties_immutable BEFORE UPDATE OR DELETE ON accounting_parties FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
CREATE TRIGGER accounting_treasury_immutable BEFORE UPDATE OR DELETE ON accounting_treasury FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
CREATE TRIGGER accounting_vouchers_immutable BEFORE UPDATE OR DELETE ON accounting_vouchers FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
CREATE TRIGGER accounting_voucher_commands_immutable BEFORE UPDATE OR DELETE ON accounting_voucher_commands FOR EACH ROW EXECUTE FUNCTION accounting_immutable();

CREATE FUNCTION accounting_validate_subledger_account() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account_type TEXT;
BEGIN
 -- Same lock order as posting/closure. Cannot register the same account as both
 -- treasury and receivable/payable during concurrent requests.
 PERFORM 1 FROM accounting_books WHERE company_id=NEW.company_id FOR UPDATE;
 SELECT type INTO account_type FROM accounting_accounts WHERE company_id=NEW.company_id AND code=NEW.account_code;
 IF TG_TABLE_NAME='accounting_treasury' THEN
  IF account_type IS DISTINCT FROM 'ASSET' OR EXISTS(SELECT 1 FROM accounting_parties WHERE company_id=NEW.company_id AND account_code=NEW.account_code)
  THEN RAISE EXCEPTION 'ACC_INVALID_TREASURY_ACCOUNT' USING ERRCODE='23514';END IF;
 ELSE
  IF account_type IS DISTINCT FROM (CASE WHEN NEW.kind='CUSTOMER' THEN 'ASSET' ELSE 'LIABILITY' END)
   OR EXISTS(SELECT 1 FROM accounting_treasury WHERE company_id=NEW.company_id AND account_code=NEW.account_code)
   OR EXISTS(SELECT 1 FROM accounting_lines WHERE company_id=NEW.company_id AND account_code=NEW.account_code)
  THEN RAISE EXCEPTION 'ACC_PARTY_ACCOUNT_REQUIRES_UNUSED_MATCHING_TYPE' USING ERRCODE='23514';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER accounting_party_account_validate BEFORE INSERT ON accounting_parties FOR EACH ROW EXECUTE FUNCTION accounting_validate_subledger_account();
CREATE TRIGGER accounting_treasury_account_validate BEFORE INSERT ON accounting_treasury FOR EACH ROW EXECUTE FUNCTION accounting_validate_subledger_account();

-- A manual GL correction/reversal must not bypass the party/voucher boundary.
-- The voucher function sets a transaction-local journal ID, then restores it.
CREATE FUNCTION accounting_protect_party_line() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM accounting_parties WHERE company_id=NEW.company_id AND account_code=NEW.account_code)
 AND current_setting('murshidak.voucher_journal',true) IS DISTINCT FROM NEW.journal_id
 THEN RAISE EXCEPTION 'ACC_USE_PARTY_VOUCHER' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER accounting_party_line_protect BEFORE INSERT ON accounting_lines FOR EACH ROW EXECUTE FUNCTION accounting_protect_party_line();

CREATE FUNCTION accounting_post_voucher(c TEXT,actor TEXT,key TEXT,party TEXT,k TEXT,body JSONB,vid TEXT,jid TEXT,target TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE p accounting_parties;original accounting_vouchers;prior accounting_voucher_commands;
 payload JSONB;result JSONB;gl JSONB;lines JSONB;d DATE;amt NUMERIC;counter TEXT;balance NUMERIC;cash NUMERIC;last_date DATE;sign INTEGER;direction INTEGER;previous_context TEXT;
BEGIN
 PERFORM 1 FROM accounting_books WHERE company_id=c FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACC_BOOK_REQUIRED' USING ERRCODE='23514';END IF;
 SELECT * INTO p FROM accounting_parties WHERE company_id=c AND id=party;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACC_PARTY_NOT_FOUND' USING ERRCODE='23514';END IF;
 IF k IS NULL OR k NOT IN('OPENING','RECEIPT','PAYMENT','REVERSAL') THEN RAISE EXCEPTION 'ACC_INVALID_COMMAND' USING ERRCODE='23514';END IF;
 IF body ? 'amount' THEN body:=jsonb_set(body,'{amount}',to_jsonb((body->>'amount')::numeric));END IF;
 payload:=jsonb_build_object('partyId',party,'kind',k,'target',target,'body',body);
 SELECT * INTO prior FROM accounting_voucher_commands WHERE company_id=c AND idempotency_key=key;
 IF FOUND THEN
  IF prior.payload<>payload THEN RAISE EXCEPTION 'ACC_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514';END IF;
  RETURN prior.result;
 END IF;
 IF EXISTS(SELECT 1 FROM accounting_commands WHERE company_id=c AND idempotency_key=key)
 THEN RAISE EXCEPTION 'ACC_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514';END IF;
 d:=(body->>'date')::date;amt:=(body->>'amount')::numeric;
 sign:=CASE WHEN p.kind='CUSTOMER' THEN 1 ELSE -1 END;
 IF k='REVERSAL' THEN
  SELECT * INTO original FROM accounting_vouchers WHERE company_id=c AND party_id=party AND id=target;
  IF NOT FOUND OR original.kind='REVERSAL' OR EXISTS(SELECT 1 FROM accounting_vouchers WHERE company_id=c AND reversal_of=target)
  THEN RAISE EXCEPTION 'ACC_INVALID_VOUCHER_REVERSAL' USING ERRCODE='23514';END IF;
  amt:=original.amount;counter:=original.counter_account_code;
 ELSE
  IF amt IS NULL OR amt<=0 OR amt>=100000000000000 OR amt<>round(amt,2) THEN RAISE EXCEPTION 'ACC_INVALID_AMOUNT' USING ERRCODE='23514';END IF;
  counter:=coalesce(body->>'treasuryAccountCode',body->>'equityAccountCode');
  IF k='OPENING' THEN
   IF EXISTS(SELECT 1 FROM accounting_vouchers WHERE company_id=c AND party_id=party)
    OR EXISTS(SELECT 1 FROM accounting_lines WHERE company_id=c AND account_code=p.account_code)
   THEN RAISE EXCEPTION 'ACC_OPENING_EXISTS' USING ERRCODE='23514';END IF;
   IF NOT EXISTS(SELECT 1 FROM accounting_accounts WHERE company_id=c AND code=counter AND type='EQUITY')
   THEN RAISE EXCEPTION 'ACC_OPENING_EQUITY_REQUIRED' USING ERRCODE='23514';END IF;
  ELSE
   IF (k='RECEIPT' AND p.kind<>'CUSTOMER') OR(k='PAYMENT' AND p.kind<>'SUPPLIER')
   THEN RAISE EXCEPTION 'ACC_VOUCHER_PARTY_MISMATCH' USING ERRCODE='23514';END IF;
   IF NOT EXISTS(SELECT 1 FROM accounting_treasury WHERE company_id=c AND account_code=counter)
   THEN RAISE EXCEPTION 'ACC_INVALID_TREASURY_ACCOUNT' USING ERRCODE='23514';END IF;
  END IF;
 END IF;
 -- New settlement dates cannot precede an existing party/treasury movement.
 -- This avoids spending future receipts or creating negative historical debt.
 SELECT max(j.entry_date),coalesce(sum(CASE WHEN l.account_code=p.account_code THEN sign*(l.debit-l.credit) ELSE 0 END),0),
  coalesce(sum(CASE WHEN l.account_code=counter THEN l.debit-l.credit ELSE 0 END),0)
 INTO last_date,balance,cash FROM accounting_lines l JOIN accounting_journals j ON j.company_id=c AND j.id=l.journal_id
 WHERE l.company_id=c AND (l.account_code=p.account_code OR
  (k<>'OPENING' AND (k<>'REVERSAL' OR original.kind<>'OPENING') AND l.account_code=counter)) AND j.status='POSTED';
 IF last_date IS NOT NULL AND d<last_date THEN RAISE EXCEPTION 'ACC_VOUCHER_BACKDATED' USING ERRCODE='23514';END IF;
 IF k IN('RECEIPT','PAYMENT') AND amt>balance THEN RAISE EXCEPTION 'ACC_AMOUNT_EXCEEDS_DUE' USING ERRCODE='23514';END IF;
 IF k='PAYMENT' AND amt>cash THEN RAISE EXCEPTION 'ACC_INSUFFICIENT_FUNDS' USING ERRCODE='23514';END IF;
 IF k='REVERSAL' AND original.kind='OPENING' AND amt>balance THEN RAISE EXCEPTION 'ACC_OPENING_HAS_SETTLEMENTS' USING ERRCODE='23514';END IF;
 IF k='REVERSAL' AND original.kind='RECEIPT' AND amt>cash THEN RAISE EXCEPTION 'ACC_INSUFFICIENT_FUNDS' USING ERRCODE='23514';END IF;
 previous_context:=current_setting('murshidak.voucher_journal',true);
 PERFORM set_config('murshidak.voucher_journal',jid,true);
 IF k='REVERSAL' THEN
  gl:=accounting_post_command(c,actor,key,'REVERSE',original.journal_id,body,jid,jid);
 ELSE
  direction:=CASE WHEN k='OPENING' THEN sign ELSE -sign END;
  lines:=jsonb_build_array(jsonb_build_object('accountCode',p.account_code,'debit',CASE WHEN direction=1 THEN amt ELSE 0 END,'credit',CASE WHEN direction=-1 THEN amt ELSE 0 END,'memo',p.code),
   jsonb_build_object('accountCode',counter,'debit',CASE WHEN direction=-1 THEN amt ELSE 0 END,'credit',CASE WHEN direction=1 THEN amt ELSE 0 END,'memo',p.code));
  gl:=accounting_post_command(c,actor,key,'POST',NULL,jsonb_build_object('date',d,'reference','V:'||(body->>'reference'),'reason',body->>'reason','lines',lines),jid,jid);
 END IF;
 PERFORM set_config('murshidak.voucher_journal',coalesce(previous_context,''),true);
 INSERT INTO accounting_vouchers(id,company_id,party_id,kind,entry_date,reference,amount,counter_account_code,journal_id,reversal_of,origin,reason,actor_id)
 VALUES(vid,c,party,k,d,CASE WHEN k='REVERSAL' THEN 'REV:'||vid ELSE body->>'reference' END,amt,counter,gl->>'journalId',target,
  CASE WHEN k='OPENING' OR(k='REVERSAL' AND original.origin='EXPLICIT_OPENING') THEN 'EXPLICIT_OPENING' ELSE 'MANUAL_VOUCHER' END,body->>'reason',actor);
 result:=jsonb_build_object('voucherId',vid,'journalId',gl->>'journalId');
 INSERT INTO accounting_voucher_commands(company_id,idempotency_key,payload,result) VALUES(c,key,payload,result);
 RETURN result;
END $$;

-- A tagged GL journal must acquire its immutable source voucher before commit.
CREATE FUNCTION accounting_assert_voucher_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM accounting_parties WHERE company_id=NEW.company_id AND account_code=NEW.account_code)
 AND NOT EXISTS(SELECT 1 FROM accounting_vouchers v JOIN accounting_parties p ON p.company_id=v.company_id AND p.id=v.party_id
  WHERE v.company_id=NEW.company_id AND v.journal_id=NEW.journal_id AND p.account_code=NEW.account_code)
 THEN RAISE EXCEPTION 'ACC_VOUCHER_SOURCE_REQUIRED' USING ERRCODE='23514';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER accounting_line_voucher_source AFTER INSERT ON accounting_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accounting_assert_voucher_source();

CREATE FUNCTION accounting_assert_voucher_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p accounting_parties;j accounting_journals;original accounting_vouchers;direction INTEGER;expected_origin TEXT;
BEGIN
 SELECT * INTO p FROM accounting_parties WHERE company_id=NEW.company_id AND id=NEW.party_id;
 SELECT * INTO j FROM accounting_journals WHERE company_id=NEW.company_id AND id=NEW.journal_id;
 direction:=CASE WHEN p.kind='CUSTOMER' THEN 1 ELSE -1 END;
 expected_origin:=CASE WHEN NEW.kind='OPENING' THEN 'EXPLICIT_OPENING' ELSE 'MANUAL_VOUCHER' END;
 IF NEW.kind='REVERSAL' THEN
  SELECT * INTO original FROM accounting_vouchers WHERE company_id=NEW.company_id AND id=NEW.reversal_of;
  IF original.kind='REVERSAL' OR original.party_id<>NEW.party_id OR original.counter_account_code<>NEW.counter_account_code OR original.amount<>NEW.amount
   OR j.reversal_of IS DISTINCT FROM original.journal_id OR j.kind<>'REVERSAL'
  THEN RAISE EXCEPTION 'ACC_VOUCHER_JOURNAL_MISMATCH' USING ERRCODE='23514';END IF;
  expected_origin:=original.origin;
  IF original.kind='OPENING' THEN direction:=-direction;END IF;
 ELSE
  IF NEW.kind<>'OPENING' THEN direction:=-direction;END IF;
  IF j.kind<>'MANUAL' OR j.reference IS DISTINCT FROM 'V:'||NEW.reference
   OR(NEW.kind='RECEIPT' AND p.kind<>'CUSTOMER') OR(NEW.kind='PAYMENT' AND p.kind<>'SUPPLIER')
  THEN RAISE EXCEPTION 'ACC_VOUCHER_JOURNAL_MISMATCH' USING ERRCODE='23514';END IF;
 END IF;
 IF j.status<>'POSTED' OR j.entry_date<>NEW.entry_date OR j.actor_id<>NEW.actor_id OR j.reason<>NEW.reason OR NEW.origin<>expected_origin
  OR (SELECT count(*) FROM accounting_lines WHERE company_id=NEW.company_id AND journal_id=NEW.journal_id)<>2
  OR NOT EXISTS(SELECT 1 FROM accounting_lines WHERE company_id=NEW.company_id AND journal_id=NEW.journal_id AND account_code=p.account_code
    AND debit=CASE WHEN direction=1 THEN NEW.amount ELSE 0 END AND credit=CASE WHEN direction=-1 THEN NEW.amount ELSE 0 END)
  OR NOT EXISTS(SELECT 1 FROM accounting_lines WHERE company_id=NEW.company_id AND journal_id=NEW.journal_id AND account_code=NEW.counter_account_code
    AND debit=CASE WHEN direction=-1 THEN NEW.amount ELSE 0 END AND credit=CASE WHEN direction=1 THEN NEW.amount ELSE 0 END)
 THEN RAISE EXCEPTION 'ACC_VOUCHER_JOURNAL_MISMATCH' USING ERRCODE='23514';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER accounting_voucher_journal_validate AFTER INSERT ON accounting_vouchers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accounting_assert_voucher_journal();

INSERT INTO permissions(id,code,description) VALUES
 ('permission-accounting-ar-read','accounting.ar.read','Read company customer receivables'),
 ('permission-accounting-ap-read','accounting.ap.read','Read company supplier payables'),
 ('permission-accounting-parties','accounting.parties.manage','Register customer/supplier accounting accounts'),
 ('permission-accounting-receipts','accounting.receipts.post','Approve and post customer receipt vouchers'),
 ('permission-accounting-disbursements','accounting.payments.post','Approve and post supplier payment vouchers'),
 ('permission-accounting-opening','accounting.opening.post','Post explicit opening balances separately from historical invoices'),
 ('permission-accounting-treasury-read','accounting.treasury.read','Read company registered cash and bank accounts'),
 ('permission-accounting-treasury','accounting.treasury.manage','Register cash/bank classification for existing asset accounts')
ON CONFLICT(code) DO NOTHING;
