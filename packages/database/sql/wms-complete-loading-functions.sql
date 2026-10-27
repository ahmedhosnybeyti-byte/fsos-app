-- Loading orders have no product/allocation-count ceiling. Preserve the same
-- transaction, permissions, FEFO, quantity checks and replay ledgers. No data
-- backfill, ledger writes, tenant activation or role grants.
DO $patch$
DECLARE definition TEXT; needle TEXT; replacement TEXT;
BEGIN
 definition=pg_get_functiondef('wms_loading_command(text,text,text,jsonb,text,text,text)'::regprocedure);
 definition=replace(definition,E'\r\n',E'\n');
 needle=$old$jsonb_array_length(body->'lines') NOT BETWEEN 1 AND 20$old$;
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'WMS_LOADING_FUNCTION_CHANGED'; END IF;
 definition=replace(definition,needle,$new$jsonb_array_length(body->'lines')<1$new$);
 needle=$old$count_alloc=count_alloc+1;IF count_alloc>100 THEN RAISE EXCEPTION 'WMS_ALLOCATION_LIMIT' USING ERRCODE='23514'; END IF;$old$;
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'WMS_LOADING_FUNCTION_CHANGED'; END IF;
 definition=replace(definition,needle,'count_alloc=count_alloc+1;');
 -- Resolve submitted quantities once, rather than scanning the entire JSON
 -- array for each allocation when preparing a large complete order.
 needle=$old$total_picked NUMERIC=0;$old$;
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'WMS_LOADING_FUNCTION_CHANGED'; END IF;
 definition=replace(definition,needle,$new$total_picked NUMERIC=0;pick_quantities JSONB;$new$);
 needle=$old$      FOR allocation IN SELECT * FROM wms_allocations WHERE company_id=c AND load_id=d ORDER BY product_id,batch_id FOR UPDATE LOOP
        SELECT (value->>'quantity')::numeric INTO actual FROM jsonb_array_elements(body->'allocations') WHERE value->>'id'=allocation.id;$old$;
 replacement=$new$      SELECT jsonb_object_agg(value->>'id',value->>'quantity') INTO pick_quantities FROM jsonb_array_elements(body->'allocations');
      FOR allocation IN SELECT * FROM wms_allocations WHERE company_id=c AND load_id=d ORDER BY product_id,batch_id FOR UPDATE LOOP
        actual=(pick_quantities->>allocation.id)::numeric;$new$;
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'WMS_LOADING_FUNCTION_CHANGED'; END IF;
 EXECUTE replace(definition,needle,replacement);
 definition=pg_get_functiondef('wms_core_execute(text,text,text,jsonb,text,text,text)'::regprocedure);
 definition=replace(definition,E'\r\n',E'\n');
 needle=$old$jsonb_array_length(body->'lines') NOT BETWEEN 1 AND 20$old$;
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'WMS_CORE_FUNCTION_CHANGED'; END IF;
 EXECUTE replace(definition,needle,$new$jsonb_array_length(body->'lines')<1$new$);
END $patch$;
