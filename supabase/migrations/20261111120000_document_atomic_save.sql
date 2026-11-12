-- LOCAL REVIEW CANDIDATE. Apply only after deployment approval.
-- Request ownership is public.romiku_document_actor(); privileged write authority is a NOLOGIN role,
-- never a client-set GUC. Existing trusted definer workflows remain available.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='romiku_document_executor') THEN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='romiku_document_executor' AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolinherit)) THEN RAISE EXCEPTION 'Unsafe document executor role'; END IF;
 ELSE
  CREATE ROLE romiku_document_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
END $$;
GRANT USAGE ON SCHEMA public, extensions TO romiku_document_executor;
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'romiku_search_%' OR proname IN ('romiku_build_instruction_snapshot','romiku_valid_instruction_labels')) LOOP
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO romiku_document_executor',f);
 END LOOP;
END $$;
-- postgres cannot grant USAGE on Supabase's auth schema. These two fixed,
-- read-only definer helpers expose only this request's UID/active membership.
-- No authenticated role inheritance or schema permission escalation is needed.
CREATE FUNCTION public.romiku_document_actor() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT auth.uid() $$;
CREATE FUNCTION public.romiku_document_active() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT public.romiku_wb_active() $$;
REVOKE ALL ON FUNCTION public.romiku_document_actor(),public.romiku_document_active() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.romiku_document_actor(),public.romiku_document_active() TO authenticated,romiku_document_executor;
-- Bodies unchanged: these trigger-only functions stamp audit fields/check active
-- membership, never accept relation names or perform caller-directed mutations.
ALTER FUNCTION public.romiku_audit() SECURITY DEFINER;
ALTER FUNCTION public.romiku_require_active_business_writer() SECURITY DEFINER;

CREATE TABLE public.romiku_document_save_requests (
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 request_id uuid NOT NULL,
 payload_hash text NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,request_id)
);
ALTER TABLE public.romiku_document_save_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.romiku_document_save_requests FROM anon, authenticated;
GRANT SELECT,INSERT ON public.romiku_document_save_requests TO romiku_document_executor;
CREATE POLICY atomic_request_actor ON public.romiku_document_save_requests TO romiku_document_executor
 USING (actor_id=public.romiku_document_actor() AND public.romiku_document_active())
 WITH CHECK (actor_id=public.romiku_document_actor() AND public.romiku_document_active());
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['romiku_quotes','romiku_pis','romiku_orders','romiku_packing_lists'] LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK(revision>0)',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['romiku_quotes','romiku_pis','romiku_orders','romiku_packing_lists','romiku_quote_items','romiku_pi_items','romiku_order_items','romiku_packing_items'] LOOP
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO romiku_document_executor',t);
  EXECUTE format('CREATE POLICY atomic_executor ON public.%I TO romiku_document_executor USING(public.romiku_document_active()) WITH CHECK(public.romiku_document_active())',t);
 END LOOP;
 -- Read dependencies of existing invoker triggers; no write authority granted.
 FOREACH t IN ARRAY ARRAY['romiku_formal_customers','romiku_payments','romiku_website_inquiry_items'] LOOP
  EXECUTE format('GRANT SELECT ON public.%I TO romiku_document_executor',t);
  EXECUTE format('CREATE POLICY atomic_executor_read ON public.%I FOR SELECT TO romiku_document_executor USING(public.romiku_document_active())',t);
 END LOOP;
END $$;

-- Executor policies must not widen a future authenticated RLS restriction.
-- Only the currently audited unconditional CRM policy shape is accepted;
-- any additional applicable restriction fails closed until reviewed.
CREATE FUNCTION public.romiku_atomic_access_allowed(p_table regclass,p_action text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT public.romiku_document_active()
 AND has_table_privilege('authenticated',p_table,p_action)
 AND EXISTS(SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid=p_table
  AND p.polcmd IN ('*',CASE p_action WHEN 'SELECT' THEN 'r' WHEN 'INSERT' THEN 'a' WHEN 'UPDATE' THEN 'w' WHEN 'DELETE' THEN 'd' END::"char")
  AND p.polpermissive AND coalesce(pg_get_expr(p.polqual,p.polrelid),'true')='true'
  AND coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'true')='true'
  AND (0=ANY(p.polroles) OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE r.oid=ANY(p.polroles) AND pg_has_role('authenticated',r.oid,'USAGE'))))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid=p_table
  AND p.polcmd IN ('*',CASE p_action WHEN 'SELECT' THEN 'r' WHEN 'INSERT' THEN 'a' WHEN 'UPDATE' THEN 'w' WHEN 'DELETE' THEN 'd' END::"char")
  AND (0=ANY(p.polroles) OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE r.oid=ANY(p.polroles) AND pg_has_role('authenticated',r.oid,'USAGE')))
  AND (NOT p.polpermissive OR coalesce(pg_get_expr(p.polqual,p.polrelid),'true')<>'true' OR coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'true')<>'true'))
$$;
REVOKE ALL ON FUNCTION public.romiku_atomic_access_allowed(regclass,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.romiku_atomic_access_allowed(regclass,text) TO authenticated,romiku_document_executor;

CREATE FUNCTION public.romiku_atomic_write_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF current_user IN ('authenticated','anon') THEN
  RAISE EXCEPTION 'Use atomic document save' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_NARGS=0 THEN
  IF TG_OP='INSERT' THEN NEW.revision:=1; ELSE NEW.revision:=OLD.revision+1; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.romiku_atomic_item_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE doc uuid;
BEGIN
 doc:=(CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END->>TG_ARGV[1])::uuid;
 -- Header lock serializes item writes with snapshots and saves; trusted legacy
 -- conversions also invalidate a previously captured editor baseline.
 EXECUTE format('UPDATE public.%I SET revision=revision+1 WHERE id=$1',TG_ARGV[0]) USING doc;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.romiku_atomic_write_guard(), public.romiku_atomic_item_revision() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE k text; pt text; it text; fk text; BEGIN
 FOREACH k IN ARRAY ARRAY['quote','pi','order','packing'] LOOP
  pt:=CASE k WHEN 'packing' THEN 'romiku_packing_lists' ELSE 'romiku_'||k||'s' END;
  it:='romiku_'||k||'_items'; fk:=CASE k WHEN 'packing' THEN 'packing_list_id' ELSE k||'_id' END;
  EXECUTE format('CREATE TRIGGER aa_atomic_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.romiku_atomic_write_guard()',pt);
  EXECUTE format('CREATE TRIGGER aa_atomic_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.romiku_atomic_write_guard(''item'')',it);
  EXECUTE format('CREATE TRIGGER ab_atomic_parent_revision BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.romiku_atomic_item_revision(%L,%L)',it,pt,fk);
 END LOOP;
END $$;

CREATE FUNCTION public.romiku_document_snapshot(p_kind text,p_document_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pt text; it text; fk text; h jsonb; items jsonb;
BEGIN
 IF NOT public.romiku_document_active() THEN RAISE EXCEPTION 'Active CRM membership required' USING ERRCODE='42501'; END IF;
 IF p_kind NOT IN ('quote','pi','order','packing') OR p_kind IS NULL THEN RAISE EXCEPTION 'Invalid document kind' USING ERRCODE='22023'; END IF;
 pt:=CASE p_kind WHEN 'packing' THEN 'romiku_packing_lists' ELSE 'romiku_'||p_kind||'s' END;
 it:='romiku_'||p_kind||'_items';fk:=CASE p_kind WHEN 'packing' THEN 'packing_list_id' ELSE p_kind||'_id' END;
 IF NOT public.romiku_atomic_access_allowed(('public.'||pt)::regclass,'SELECT') OR NOT public.romiku_atomic_access_allowed(('public.'||it)::regclass,'SELECT') THEN RAISE EXCEPTION 'Document access policy changed' USING ERRCODE='42501'; END IF;
 -- Lock parent until transaction completion: every item mutation locks/updates it.
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR SHARE',pt) INTO h USING p_document_id;
 IF h IS NULL THEN RETURN NULL; END IF;
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY position NULLS LAST,id),''[]''::jsonb) FROM public.%I t WHERE %I=$1',it,fk) INTO items USING p_document_id;
 RETURN jsonb_build_object('kind',p_kind,'document_id',p_document_id,'revision',h->'revision','header',h,'items',items);
END $$;
CREATE FUNCTION public.romiku_document_save_result(p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved jsonb; pt text; it text;
BEGIN
 IF NOT public.romiku_document_active() THEN RAISE EXCEPTION 'Active CRM membership required' USING ERRCODE='42501'; END IF;
 SELECT result INTO saved FROM public.romiku_document_save_requests WHERE actor_id=public.romiku_document_actor() AND request_id=p_request_id;
 IF saved IS NULL THEN RETURN NULL; END IF;
 pt:=CASE saved->>'kind' WHEN 'packing' THEN 'romiku_packing_lists' ELSE 'romiku_'||(saved->>'kind')||'s' END;it:='romiku_'||(saved->>'kind')||'_items';
 IF NOT public.romiku_atomic_access_allowed(('public.'||pt)::regclass,'SELECT') OR NOT public.romiku_atomic_access_allowed(('public.'||it)::regclass,'SELECT') THEN RAISE EXCEPTION 'Document access policy changed' USING ERRCODE='42501'; END IF;
 RETURN saved;
END $$;

CREATE FUNCTION public.romiku_save_document(p_kind text,p_document_id uuid,p_expected_revision bigint,p_request_id uuid,p_header jsonb,p_items jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 pt text; it text; fk text; h jsonb; rowdata jsonb; oldh jsonb; result jsonb; prior record;
 digest text; cols text; vals text; assignments text; col text; allowed text[]; item_allowed text[];
 orderid uuid; lineid uuid; oldparent uuid; existing boolean; olditems jsonb; item jsonb; olditem jsonb;
BEGIN
 IF NOT public.romiku_document_active() OR public.romiku_document_actor() IS NULL THEN RAISE EXCEPTION 'Active CRM membership required' USING ERRCODE='42501'; END IF;
 IF p_kind NOT IN ('quote','pi','order','packing') OR p_kind IS NULL OR p_document_id IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 THEN
  RAISE EXCEPTION 'Invalid save identity' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_header) IS DISTINCT FROM 'object' OR (p_items IS NOT NULL AND jsonb_typeof(p_items)<>'array') THEN RAISE EXCEPTION 'Invalid save payload' USING ERRCODE='22023'; END IF;
 digest:=encode(extensions.digest(jsonb_build_array(p_kind,p_document_id,p_expected_revision,p_header,p_items)::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(public.romiku_document_actor()::text||':'||p_request_id::text,0));
 SELECT * INTO prior FROM public.romiku_document_save_requests WHERE actor_id=public.romiku_document_actor() AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.payload_hash<>digest THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409'; END IF;
  RETURN public.romiku_document_save_result(p_request_id);
 END IF;
 pt:=CASE p_kind WHEN 'packing' THEN 'romiku_packing_lists' ELSE 'romiku_'||p_kind||'s' END;
 it:='romiku_'||p_kind||'_items'; fk:=CASE p_kind WHEN 'packing' THEN 'packing_list_id' ELSE p_kind||'_id' END;
 -- Serialize competing creates too, before a row exists. Order-parent first for
 -- all packing writers avoids inversion with Order quantity updates/deletion.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_kind||':'||p_document_id::text,1));
 IF p_kind='packing' THEN
  SELECT order_id INTO orderid FROM public.romiku_packing_lists WHERE id=p_document_id;
  IF NOT FOUND THEN orderid:=(p_header->>'order_id')::uuid; END IF;
  IF orderid IS NOT NULL THEN PERFORM 1 FROM public.romiku_orders WHERE id=orderid FOR UPDATE; END IF;
 END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',pt) INTO oldh USING p_document_id;
 existing:=oldh IS NOT NULL;
 IF NOT public.romiku_atomic_access_allowed(('public.'||pt)::regclass,CASE WHEN existing THEN 'UPDATE' ELSE 'INSERT' END) THEN RAISE EXCEPTION 'Document write policy changed' USING ERRCODE='42501'; END IF;
 IF p_items IS NOT NULL AND (NOT public.romiku_atomic_access_allowed(('public.'||it)::regclass,'INSERT') OR NOT public.romiku_atomic_access_allowed(('public.'||it)::regclass,'UPDATE') OR NOT public.romiku_atomic_access_allowed(('public.'||it)::regclass,'DELETE')) THEN RAISE EXCEPTION 'Document write policy changed' USING ERRCODE='42501'; END IF;
 IF (existing AND (oldh->>'revision')::bigint<>p_expected_revision) OR (NOT existing AND p_expected_revision<>0) THEN
  RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='PT409'; END IF;
 allowed:=ARRAY['document_name','status','counterparty_snapshot','bank_snapshot','terms_snapshot','currency','document_language','document_date','follow_up_at','due_at','freight','discount','other_expenses','deposit_percent','deposit_due_at','balance_due_at','price_term','shipment_method','notes','archived_at','source_website_inquiry_id','outbound_company_id','formal_customer_id','valid_until','fx_enabled','usd_cny_rate','source_quote_id','source_pi_id','expected_delivery_at','actual_delivery_at','co_owner_id','purchase_order_number','production_defaults_snapshot'];
 IF p_kind='packing' THEN allowed:=ARRAY['name','status','order_id','packing_at','shipping_mark','batch_label','notes','seller_snapshot','buyer_snapshot','archived_at']; END IF;
 FOR col IN SELECT jsonb_object_keys(p_header) LOOP
  IF NOT col=ANY(allowed) OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=('public.'||pt)::regclass AND attname=col AND attnum>0 AND NOT attisdropped) THEN
   RAISE EXCEPTION 'Unsupported header field: %',col USING ERRCODE='22023'; END IF;
 END LOOP;
 IF NOT existing AND ((p_header->>'source_quote_id') IS NOT NULL OR (p_header->>'source_pi_id') IS NOT NULL OR (p_header->>'source_website_inquiry_id') IS NOT NULL) THEN RAISE EXCEPTION 'Use source creation workflow' USING ERRCODE='23514'; END IF;
 IF existing THEN
  FOREACH col IN ARRAY ARRAY['source_website_inquiry_id','source_quote_id','source_pi_id','outbound_company_id'] LOOP
   IF p_header ? col AND p_header->col IS DISTINCT FROM oldh->col THEN RAISE EXCEPTION 'Document source is immutable' USING ERRCODE='23514'; END IF;
  END LOOP;
 END IF;
 IF p_kind='order' AND p_header->>'status'='voided' AND (NOT existing OR oldh->>'status'<>'voided') THEN
  RAISE EXCEPTION 'Use controlled order void' USING ERRCODE='P4202'; END IF;
 IF p_kind='packing' AND existing AND p_header ? 'order_id' AND p_header->'order_id' IS DISTINCT FROM oldh->'order_id' THEN RAISE EXCEPTION 'Packing order is immutable' USING ERRCODE='23514'; END IF;
 h:=p_header||jsonb_build_object('id',p_document_id);
 SELECT string_agg(format('%I',key),',' ORDER BY key),string_agg(format('r.%I',key),',' ORDER BY key),string_agg(format('%1$I=r.%1$I',key),',' ORDER BY key) INTO cols,vals,assignments FROM jsonb_object_keys(h) key WHERE key<>'id';
 IF existing THEN
  IF assignments IS NOT NULL THEN EXECUTE format('UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I,$1) r WHERE t.id=$2',pt,assignments,pt) USING h,p_document_id; END IF;
 ELSE
  EXECUTE format('INSERT INTO public.%I(id%s) SELECT r.id%s FROM jsonb_populate_record(NULL::public.%I,$1) r',pt,CASE WHEN cols IS NULL THEN '' ELSE ','||cols END,CASE WHEN vals IS NULL THEN '' ELSE ','||vals END,pt) USING h;
 END IF;
 IF p_items IS NOT NULL THEN
  item_allowed:=ARRAY['id','sanity_product_id','sku','product_snapshot','packing_snapshot','quantity','unit_price','unit_price_entered','source_cny_unit_price','requirement','customer_code','notes','position','source_website_inquiry_item_id','source_quote_item_id','source_pi_item_id','requested_quantity_snapshot'];
  IF p_kind='packing' THEN item_allowed:=ARRAY['id','order_id','source_order_item_id','sanity_product_id','sku','product_snapshot','quantity','cartons','qty_per_carton','length_cm','width_cm','height_cm','carton_weight_kg','remark','position']; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x WHERE jsonb_typeof(x)<>'object') THEN RAISE EXCEPTION 'Invalid line payload' USING ERRCODE='22023'; END IF;
  -- Allocate absent IDs once, inside the durable request transaction.
  SELECT coalesce(jsonb_agg(CASE WHEN x ? 'id' THEN x ELSE x||jsonb_build_object('id',gen_random_uuid()) END),'[]') INTO p_items FROM jsonb_array_elements(p_items) x;
  IF p_kind='packing' THEN
   SELECT coalesce(jsonb_agg(CASE WHEN x ? 'order_id' THEN x ELSE x||jsonb_build_object('order_id',orderid) END),'[]') INTO p_items FROM jsonb_array_elements(p_items) x;
   SELECT coalesce(jsonb_agg(CASE WHEN coalesce((x->>'cartons')::numeric,0)>0 AND coalesce((x->>'qty_per_carton')::numeric,0)>0 THEN x||jsonb_build_object('quantity',round((x->>'cartons')::numeric*(x->>'qty_per_carton')::numeric,4)) ELSE x END),'[]') INTO p_items FROM jsonb_array_elements(p_items) x;
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x GROUP BY x->>'id' HAVING count(*)>1) OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x WHERE x->>'id' IS NULL) THEN RAISE EXCEPTION 'Duplicate or null line ID' USING ERRCODE='22023'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   FOR col IN SELECT jsonb_object_keys(item) LOOP
    IF NOT col=ANY(item_allowed) OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=('public.'||it)::regclass AND attname=col AND attnum>0 AND NOT attisdropped) THEN RAISE EXCEPTION 'Unsupported item field: %',col USING ERRCODE='22023'; END IF;
   END LOOP;
   lineid:=(item->>'id')::uuid;
   EXECUTE format('SELECT %I FROM public.%I WHERE id=$1',fk,it) INTO oldparent USING lineid;
   IF oldparent IS NOT NULL AND oldparent<>p_document_id THEN RAISE EXCEPTION 'Item belongs to another document' USING ERRCODE='42501'; END IF;
   EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',it) INTO olditem USING lineid;
   IF p_kind<>'packing' THEN
    FOREACH col IN ARRAY ARRAY['source_website_inquiry_item_id','source_quote_item_id','source_pi_item_id','requested_quantity_snapshot'] LOOP
     IF item ? col AND item->col IS DISTINCT FROM coalesce(olditem->col,'null'::jsonb) THEN RAISE EXCEPTION 'Document item source is immutable' USING ERRCODE='23514'; END IF;
    END LOOP;
   END IF;
   IF p_kind='packing' AND ((item->>'order_id')::uuid IS DISTINCT FROM orderid OR (orderid IS NOT NULL AND item->>'source_order_item_id' IS NULL) OR (orderid IS NULL AND item->>'source_order_item_id' IS NOT NULL)) THEN RAISE EXCEPTION 'Packing source must match header' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF p_kind='packing' AND orderid IS NOT NULL THEN
   PERFORM i.id FROM public.romiku_order_items i WHERE i.order_id=orderid ORDER BY i.id FOR UPDATE;
  END IF;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t)),''[]'') FROM public.%I t WHERE %I=$1',it,fk) INTO olditems USING p_document_id;
  -- Delete omitted IDs, retaining referenced IDs and immutable provenance.
  EXECUTE format('DELETE FROM public.%I t WHERE %I=$1 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements($2) x WHERE (x->>''id'')::uuid=t.id)',it,fk) USING p_document_id,p_items;
  -- Reductions before increases avoid false transient packing over-allocation.
  FOR item IN SELECT x FROM jsonb_array_elements(p_items) x ORDER BY
   coalesce((x->>'quantity')::numeric,0)-coalesce((SELECT (o->>'quantity')::numeric FROM jsonb_array_elements(olditems) o WHERE o->>'id'=x->>'id'),0),x->>'id' LOOP
   rowdata:=item||jsonb_build_object(fk,p_document_id);
   IF p_kind='packing' AND coalesce((item->>'cartons')::numeric,0)>0 AND coalesce((item->>'qty_per_carton')::numeric,0)>0 THEN rowdata:=rowdata||jsonb_build_object('quantity',round((item->>'cartons')::numeric*(item->>'qty_per_carton')::numeric,4)); END IF;
   SELECT string_agg(format('%I',key),',' ORDER BY key),string_agg(format('r.%I',key),',' ORDER BY key),string_agg(format('%1$I=r.%1$I',key),',' ORDER BY key) INTO cols,vals,assignments FROM jsonb_object_keys(rowdata) key WHERE key<>'id' AND key<>fk;
   lineid:=(item->>'id')::uuid;
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id=$1)',it) INTO existing USING lineid;
   IF existing THEN
    EXECUTE format('UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I,$1) r WHERE t.id=$2 AND t.%I=$3',it,assignments,it,fk) USING rowdata,lineid,p_document_id;
   ELSE
    EXECUTE format('INSERT INTO public.%I(id,%I,%s) SELECT r.id,r.%I,%s FROM jsonb_populate_record(NULL::public.%I,$1) r',it,fk,cols,fk,vals,it) USING rowdata;
   END IF;
  END LOOP;
 END IF;
 result:=public.romiku_document_snapshot(p_kind,p_document_id);
 INSERT INTO public.romiku_document_save_requests(actor_id,request_id,payload_hash,result) VALUES(public.romiku_document_actor(),p_request_id,digest,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.romiku_document_snapshot(text,uuid),public.romiku_document_save_result(uuid),public.romiku_save_document(text,uuid,bigint,uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.romiku_document_snapshot(text,uuid),public.romiku_document_save_result(uuid),public.romiku_save_document(text,uuid,bigint,uuid,jsonb,jsonb) TO authenticated;

-- Existing invoker conversion implementations run only under the executor via
-- this journaled entry point. Direct legacy calls fail at the write guard.
GRANT EXECUTE ON FUNCTION public.romiku_convert_document(text,uuid,text),public.romiku_quote_from_inquiry(uuid,uuid[]) TO romiku_document_executor;
GRANT SELECT,UPDATE ON public.romiku_website_inquiries TO romiku_document_executor;
CREATE POLICY atomic_executor_inquiry_source ON public.romiku_website_inquiries TO romiku_document_executor
 USING(public.romiku_document_active()) WITH CHECK(public.romiku_document_active());
CREATE FUNCTION public.romiku_create_document_from_source(p_request_id uuid,p_source_kind text,p_source_id uuid,p_target_kind text,p_selected_item_ids uuid[] DEFAULT NULL,p_expected_source_revision bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE fingerprint text; prior record; doc uuid; result jsonb; actual_revision bigint;
BEGIN
 IF NOT public.romiku_document_active() OR public.romiku_document_actor() IS NULL THEN RAISE EXCEPTION 'Active CRM membership required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_source_id IS NULL THEN RAISE EXCEPTION 'Invalid create identity' USING ERRCODE='22023'; END IF;
 fingerprint:=encode(extensions.digest(jsonb_build_array('from_source',p_source_kind,p_source_id,p_target_kind,p_selected_item_ids,p_expected_source_revision)::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(public.romiku_document_actor()::text||':'||p_request_id::text,0));
 SELECT * INTO prior FROM public.romiku_document_save_requests WHERE actor_id=public.romiku_document_actor() AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.payload_hash<>fingerprint THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409'; END IF;
  RETURN public.romiku_document_save_result(p_request_id);
 END IF;
 IF p_target_kind NOT IN ('quote','pi','order') OR p_target_kind IS NULL THEN RAISE EXCEPTION 'Unsupported document conversion' USING ERRCODE='23514'; END IF;
 IF NOT public.romiku_atomic_access_allowed(('public.romiku_'||p_target_kind||'s')::regclass,'INSERT') OR NOT public.romiku_atomic_access_allowed(('public.romiku_'||p_target_kind||'_items')::regclass,'INSERT') THEN RAISE EXCEPTION 'Document write policy changed' USING ERRCODE='42501'; END IF;
 IF p_source_kind='website_inquiry' AND p_target_kind='quote' THEN
  IF p_selected_item_ids IS NULL OR cardinality(p_selected_item_ids)=0 THEN RAISE EXCEPTION 'Select inquiry items' USING ERRCODE='23514'; END IF;
  IF NOT public.romiku_atomic_access_allowed('public.romiku_website_inquiries','SELECT') OR NOT public.romiku_atomic_access_allowed('public.romiku_website_inquiries','UPDATE') OR NOT public.romiku_atomic_access_allowed('public.romiku_website_inquiry_items','SELECT') THEN RAISE EXCEPTION 'Document access policy changed' USING ERRCODE='42501'; END IF;
  doc:=public.romiku_quote_from_inquiry(p_source_id,p_selected_item_ids);
 ELSIF (p_source_kind='quote' AND p_target_kind IN ('pi','order')) OR (p_source_kind='pi' AND p_target_kind='order') THEN
  IF p_selected_item_ids IS NOT NULL THEN RAISE EXCEPTION 'Conversion does not accept selected items' USING ERRCODE='22023'; END IF;
  IF NOT public.romiku_atomic_access_allowed(('public.romiku_'||p_source_kind||'s')::regclass,'SELECT') OR NOT public.romiku_atomic_access_allowed(('public.romiku_'||p_source_kind||'s')::regclass,'UPDATE') OR NOT public.romiku_atomic_access_allowed(('public.romiku_'||p_source_kind||'_items')::regclass,'SELECT') THEN RAISE EXCEPTION 'Document access policy changed' USING ERRCODE='42501'; END IF;
  EXECUTE format('SELECT revision FROM public.%I WHERE id=$1 FOR UPDATE',CASE p_source_kind WHEN 'quote' THEN 'romiku_quotes' ELSE 'romiku_pis' END) INTO actual_revision USING p_source_id;
  IF p_expected_source_revision IS NULL OR actual_revision IS DISTINCT FROM p_expected_source_revision THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='PT409'; END IF;
  doc:=public.romiku_convert_document(p_source_kind,p_source_id,p_target_kind);
 ELSE RAISE EXCEPTION 'Unsupported document conversion' USING ERRCODE='23514'; END IF;
 result:=public.romiku_document_snapshot(p_target_kind,doc);
 INSERT INTO public.romiku_document_save_requests(actor_id,request_id,payload_hash,result) VALUES(public.romiku_document_actor(),p_request_id,fingerprint,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.romiku_create_document_from_source(uuid,text,uuid,text,uuid[],bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.romiku_create_document_from_source(uuid,text,uuid,text,uuid[],bigint) TO authenticated;

-- Narrow existing bulk action; active membership checked before work.
create or replace function public.romiku_archive_orders(ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare v uuid; label text; success jsonb:='[]'; failed jsonb:='[]';
begin
 if not public.romiku_document_active() then raise exception 'Active CRM membership required' using errcode='42501'; end if;
 if public.romiku_document_actor() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if ids is null or cardinality(ids) not between 1 and 100 or array_position(ids,null) is not null then return jsonb_build_object('ok',false,'code','INVALID_ARGUMENT','message','请选择 1 至 100 张订单。'); end if;
 for v in select distinct unnest(ids) order by 1 loop
  begin
   IF NOT public.romiku_atomic_access_allowed('public.romiku_orders','UPDATE') THEN RAISE EXCEPTION 'Document write policy changed' USING ERRCODE='42501'; END IF;
   update public.romiku_orders set archived_at=coalesce(archived_at,now()) where id=v returning document_number into label;
   if not found then failed:=failed||jsonb_build_array(jsonb_build_object('id',v,'label','订单不存在','message','订单不存在或无权操作。'));
   else success:=success||jsonb_build_array(jsonb_build_object('id',v,'label',label)); end if;
  exception when others then failed:=failed||jsonb_build_array(jsonb_build_object('id',v,'label',coalesce(label,'订单'),'message','归档失败，请刷新后重试。')); end;
 end loop;
 return jsonb_build_object('ok',true,'succeeded',success,'failed',failed);
end $$;

-- Narrow existing bulk action; active membership checked before work.
create or replace function public.romiku_batch_status(kind text,ids uuid[],target_status text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v uuid; label text; success jsonb:='[]'; failed jsonb:='[]'; allowed text[]; previous_source text;
begin
 if not public.romiku_document_active() then raise exception 'Active CRM membership required' using errcode='42501'; end if;
if public.romiku_document_actor() is null or coalesce(nullif(current_setting('role',true),'none'),session_user)<>'authenticated' then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','请先登录。'); end if;if ids is null or cardinality(ids) not between 1 and 100 or array_position(ids,null) is not null then return jsonb_build_object('ok',false,'code','INVALID_ARGUMENT','message','请选择 1 至 100 条记录。'); end if;
 case kind
 when 'formal_customer' then allowed:=array['active','inactive'];
 when 'quote' then allowed:=array['pending_quote','quoted','following_up','customer_no_reply','won','invalid'];
 when 'pi' then allowed:=array['draft','sent','confirmed','cancelled'];
 when 'production' then allowed:=array['pending_send','scheduled','received','cancelled'];
 when 'packing' then allowed:=array['draft','incomplete','completed','sent'];
 when 'website_inquiry' then allowed:=array['pending_screening','pending_contact','pending_quote','quoted','following_up','customer_no_reply','won','invalid'];
 when 'outbound' then allowed:=array['to_develop','contacted','no_reply','replied','communicating','purchase_intent','to_quote','quoted','sampling','paused','invalid'];
 else return jsonb_build_object('ok',false,'code','UNSUPPORTED_KIND','message','该类型不支持批量修改状态。'); end case;
 if target_status is null or not target_status=any(allowed) then return jsonb_build_object('ok',false,'code','INVALID_STATUS','message','不支持的目标状态。'); end if;
 IF NOT public.romiku_atomic_access_allowed((CASE kind WHEN 'formal_customer' THEN 'public.romiku_formal_customers' WHEN 'packing' THEN 'public.romiku_packing_lists' WHEN 'production' THEN 'public.romiku_production_orders' WHEN 'website_inquiry' THEN 'public.romiku_website_inquiries' WHEN 'outbound' THEN 'public.romiku_outbound_companies' ELSE 'public.romiku_'||kind||'s' END)::regclass,'UPDATE') THEN RAISE EXCEPTION 'Document write policy changed' USING ERRCODE='42501'; END IF;
 previous_source:=current_setting('romiku.status_change_source',true);
 perform set_config('romiku.status_change_source','batch',true);
 for v in select distinct unnest(ids) order by 1 loop
  label:=null;
  begin
   select w.label into label from public.romiku_workflow_records w where w.kind=romiku_batch_status.kind and w.id=v;
   case kind
    when 'formal_customer' then update public.romiku_formal_customers set status=target_status where id=v;
    when 'quote' then update public.romiku_quotes set status=target_status where id=v;
    when 'pi' then update public.romiku_pis set status=target_status where id=v;
    when 'production' then update public.romiku_production_orders set status=target_status where id=v;
    when 'packing' then update public.romiku_packing_lists set status=target_status where id=v;
    when 'website_inquiry' then update public.romiku_website_inquiries set status=target_status where id=v;
    when 'outbound' then update public.romiku_outbound_companies set status=target_status where id=v;
   end case;
   if not found then failed:=failed||jsonb_build_array(jsonb_build_object('id',v,'label',coalesce(label,'记录不存在'),'code','NOT_FOUND','message','记录不存在或无权操作。'));
   else success:=success||jsonb_build_array(jsonb_build_object('id',v,'label',label)); end if;
  exception when sqlstate 'P4201' then failed:=failed||jsonb_build_array(jsonb_build_object('id',v,'label',coalesce(label,'生产单'),'code','OVER_ALLOCATED','message',sqlerrm));
  when others then failed:=failed||jsonb_build_array(jsonb_build_object('id',v,'label',coalesce(label,'记录'),'code','UPDATE_FAILED','message','状态修改失败，记录未被更改。请刷新后重试。')); end;
 end loop;
 perform set_config('romiku.status_change_source',coalesce(previous_source,''),true);
 return jsonb_build_object('ok',true,'succeeded',success,'failed',failed);
end $$;

-- Preserve the existing token-confirmed customer archival workflow.
create or replace function public.romiku_confirm_customer_archive(order_id uuid,customer_id uuid,include_history boolean,expected_token text,new_customer_name text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare plan jsonb; doc jsonb; target uuid:=customer_id; changed integer; expected_count integer;
begin
 if not public.romiku_document_active() then raise exception 'Active CRM membership required' using errcode='42501'; end if;
 if public.romiku_document_actor() is null then raise exception '请先登录。' using errcode='42501'; end if;
 if include_history is null or expected_token is null then raise exception '请先预览并确认归档范围。' using errcode='22023'; end if;
 if (customer_id is null)=(nullif(btrim(new_customer_name),'') is null) then raise exception '请选择已有客户或明确填写新客户名称。' using errcode='22023'; end if;
 perform 1 from public.romiku_orders o where o.id=order_id for update;
 plan:=public.romiku_customer_archive_plan(order_id);
 perform 1 from public.romiku_pis p where p.id in (select (d->>'id')::uuid from jsonb_array_elements(plan->'documents') d where d->>'resource_type'='pi') order by p.id for update;
 perform 1 from public.romiku_quotes q where q.id in (select (d->>'id')::uuid from jsonb_array_elements(plan->'documents') d where d->>'resource_type'='quote') order by q.id for update;
 plan:=public.romiku_customer_archive_plan(order_id);
 if plan->>'token'<>expected_token then raise exception '来源或客户关联已变化，请重新预览后确认。' using errcode='40001'; end if;
 if target is null then
  if length(btrim(new_customer_name))>200 then raise exception '客户名称过长。' using errcode='22023'; end if;
  IF NOT public.romiku_atomic_access_allowed('public.romiku_formal_customers','INSERT') THEN RAISE EXCEPTION 'Document write policy changed' USING ERRCODE='42501'; END IF;
  insert into public.romiku_formal_customers(name) values(btrim(new_customer_name)) returning id into target;
 else
  perform 1 from public.romiku_formal_customers c where c.id=target for key share;
  if not found then raise exception '客户不存在或无权访问。' using errcode='42501'; end if;
 end if;
 for doc in select d from jsonb_array_elements(plan->'documents') d where include_history or d->>'resource_type'='order' loop
  IF NOT public.romiku_atomic_access_allowed(('public.romiku_'||(doc->>'resource_type')||'s')::regclass,'UPDATE') THEN RAISE EXCEPTION 'Document write policy changed' USING ERRCODE='42501'; END IF;
  if doc->>'formal_customer_id' is not null and (doc->>'formal_customer_id')::uuid<>target then raise exception '来源链已有单据关联其他客户，不能自动覆盖。' using errcode='23514'; end if;
  if doc->>'resource_type' in ('quote','pi') and exists(select 1 from public.romiku_orders o left join public.romiku_pis p on p.id=o.source_pi_id where o.formal_customer_id is not null and o.formal_customer_id<>target and ((doc->>'resource_type'='pi' and o.source_pi_id=(doc->>'id')::uuid) or (doc->>'resource_type'='quote' and ((doc->>'id')::uuid=o.source_quote_id or (doc->>'id')::uuid=p.source_quote_id)))) then raise exception '来源单据还关联其他客户的订单，不能自动归档。' using errcode='23514'; end if;
  case doc->>'resource_type'
   when 'order' then update public.romiku_orders set formal_customer_id=target where id=(doc->>'id')::uuid;
   when 'pi' then update public.romiku_pis set formal_customer_id=target where id=(doc->>'id')::uuid;
   when 'quote' then update public.romiku_quotes set formal_customer_id=target where id=(doc->>'id')::uuid;
  end case;
  get diagnostics changed=row_count;
  if changed<>1 then raise exception '无权更新来源链，归档已全部撤销。' using errcode='42501'; end if;
 end loop;
 return jsonb_build_object('ok',true,'customer_id',target);
end $$;

-- Ignore executor-only policies when auditing authenticated Workbench access.
create or replace function public.romiku_wb_manage(entity_type text,entity_id uuid) returns boolean
 language sql stable security invoker set search_path='' as $$
 select public.romiku_wb_visible(entity_type,entity_id)
 and has_table_privilege('authenticated',case entity_type when 'order' then 'public.romiku_orders' else 'public.romiku_production_orders' end,'UPDATE')
 -- Fail closed if the audited UPDATE policy changes. Never infer UPDATE from SELECT.
 and exists(select 1 from pg_catalog.pg_policy p where p.polrelid=
  (case entity_type when 'order' then 'public.romiku_orders'::regclass else 'public.romiku_production_orders'::regclass end)
  and p.polcmd='w' and p.polpermissive and pg_get_expr(p.polqual,p.polrelid)='true'
  and pg_get_expr(p.polwithcheck,p.polrelid)='true'
  and (select oid from pg_catalog.pg_roles where rolname='authenticated')=any(p.polroles))
 and not exists(select 1 from pg_catalog.pg_policy p where p.polrelid=
  (case entity_type when 'order' then 'public.romiku_orders'::regclass else 'public.romiku_production_orders'::regclass end)
  and (0=any(p.polroles) or exists(select 1 from pg_catalog.pg_roles r where r.oid=any(p.polroles) and pg_has_role('authenticated',r.oid,'USAGE')))
  and p.polcmd in ('w','*') and (not p.polpermissive or coalesce(pg_get_expr(p.polqual,p.polrelid),'true')<>'true'
   or coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'true')<>'true'))
$$;

-- Finish ACL/trigger setup while postgres still owns the functions. PostgreSQL 16+
-- gives role creators ADMIN without SET/INHERIT. Preserve that bootstrap grant;
-- add and remove only the temporary membership granted by postgres itself.
-- Supabase: /kb/troubleshooting/cant-revoke-a-role-membership-granted-by-supabase_admin
DO $ownership_gate$
BEGIN
 if current_user <> 'postgres' or session_user <> 'postgres' then
  raise exception 'DOCUMENT_MIGRATION_EXECUTOR_MISMATCH';
 end if;
 if pg_has_role('postgres','romiku_document_executor','SET')
    or pg_has_role('postgres','romiku_document_executor','USAGE')
    or has_schema_privilege('romiku_document_executor','public','CREATE')
    or exists(select 1 from pg_auth_members where roleid='romiku_document_executor'::regrole
      and member='postgres'::regrole and grantor='postgres'::regrole) then
  raise exception 'DOCUMENT_TEMPORARY_PRIVILEGE_BASELINE_CHANGED';
 end if;
END $ownership_gate$;
grant romiku_document_executor to postgres with admin false, inherit false, set true granted by postgres;
grant create on schema public to romiku_document_executor;
ALTER FUNCTION public.romiku_document_snapshot(text,uuid) OWNER TO romiku_document_executor;
ALTER FUNCTION public.romiku_document_save_result(uuid) OWNER TO romiku_document_executor;
ALTER FUNCTION public.romiku_save_document(text,uuid,bigint,uuid,jsonb,jsonb) OWNER TO romiku_document_executor;
ALTER FUNCTION public.romiku_create_document_from_source(uuid,text,uuid,text,uuid[],bigint) OWNER TO romiku_document_executor;
revoke create on schema public from romiku_document_executor;
revoke romiku_document_executor from postgres granted by postgres;
DO $ownership_verified$
BEGIN
 if pg_has_role('postgres','romiku_document_executor','SET')
    or pg_has_role('postgres','romiku_document_executor','USAGE')
    or has_schema_privilege('romiku_document_executor','public','CREATE')
    or exists(select 1 from pg_auth_members where roleid='romiku_document_executor'::regrole
      and member='postgres'::regrole and grantor='postgres'::regrole) then
  raise exception 'DOCUMENT_TEMPORARY_PRIVILEGE_NOT_REVOKED';
 end if;
END $ownership_verified$;
