BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('f1130000-0000-0000-0000-000000000001','qa-atomic-advanced@example.test','{}'),
 ('f1130000-0000-0000-0000-000000000002','qa-atomic-other@example.test','{}');
-- Failure injection exists only in this rollback test, never in the migration.
CREATE FUNCTION pg_temp.atomic_inject() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('test.atomic_fail',true)=TG_ARGV[0] THEN RAISE EXCEPTION 'TEST_INJECTED'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DO $$ DECLARE k text; pt text; it text; BEGIN
 FOREACH k IN ARRAY ARRAY['quote','pi','order','packing'] LOOP
 pt:=CASE k WHEN 'packing' THEN 'romiku_packing_lists' ELSE 'romiku_'||k||'s' END;it:='romiku_'||k||'_items';
 EXECUTE format('CREATE TRIGGER test_fail_header AFTER UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION pg_temp.atomic_inject(''header'')',pt);
 EXECUTE format('CREATE TRIGGER test_fail_delete AFTER DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION pg_temp.atomic_inject(''delete'')',it);
 EXECUTE format('CREATE TRIGGER test_fail_insert AFTER INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION pg_temp.atomic_inject(''insert'')',it);
 END LOOP;
END $$;
CREATE FUNCTION pg_temp.advanced_cases(k text) RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE d uuid:=gen_random_uuid(); r uuid; line uuid:=gen_random_uuid(); stage text; result jsonb; items jsonb;
BEGIN
 items:=jsonb_build_array(jsonb_build_object('id',line,'sku','OLD','quantity',3));
 result:=public.romiku_save_document(k,d,0,gen_random_uuid(),'{"notes":"before"}',items);
 FOREACH stage IN ARRAY ARRAY['header','delete','insert'] LOOP
  r:=gen_random_uuid();PERFORM set_config('test.atomic_fail',stage,true);
  RETURN NEXT throws_ok(format('select public.romiku_save_document(%L,%L,%s,%L,''{"notes":"after"}'',''[{"sku":"NEW","quantity":1}]'')',k,d,result->>'revision',r),'P0001','TEST_INJECTED',k||' injected '||stage||' failure');
  PERFORM set_config('test.atomic_fail','',true);
  RETURN NEXT is(public.romiku_document_snapshot(k,d),result,k||' full rollback after '||stage);
  RETURN NEXT is(public.romiku_document_save_result(r),NULL::jsonb,k||' no receipt after '||stage);
 END LOOP;
 RETURN NEXT throws_ok(format('select public.romiku_save_document(%L,%L,%s,%L,''{"revision":500}'',null)',k,d,result->>'revision',gen_random_uuid()),'22023','Unsupported header field: revision',k||' cannot inject revision');
 RETURN NEXT throws_ok(format('select public.romiku_save_document(%L,%L,%s,%L,''{"owner_id":"f1130000-0000-0000-0000-000000000002"}'',null)',k,d,result->>'revision',gen_random_uuid()),'22023','Unsupported header field: owner_id',k||' cannot inject ownership');
END $$;
CREATE FUNCTION pg_temp.conversion_case() RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE q jsonb; p jsonb; o jsonb; plan jsonb; r uuid:=gen_random_uuid(); src uuid:=gen_random_uuid();
BEGIN
 q:=public.romiku_save_document('quote',src,0,gen_random_uuid(),'{"notes":"source"}','[{"sku":"Q","quantity":2,"unit_price":8}]');
 p:=public.romiku_create_document_from_source(r,'quote',src,'pi',null,(q->>'revision')::bigint);
 RETURN NEXT ok(p->'header'->>'source_quote_id'=src::text AND jsonb_array_length(p->'items')=1,'conversion preserves header and line lineage');
 RETURN NEXT is(public.romiku_create_document_from_source(r,'quote',src,'pi',null,(q->>'revision')::bigint),p,'conversion lost reply replays same target');
 RETURN NEXT throws_ok(format('select public.romiku_create_document_from_source(%L,''quote'',%L,''order'',null,%s)',r,src,q->>'revision'),'PT409','REQUEST_CONFLICT','conversion changed request rejected');
 RETURN NEXT is(public.romiku_document_save_result(r),p,'conversion shares durable recovery lookup');
 RETURN NEXT throws_ok(format('select public.romiku_save_document(''pi'',%L,%s,%L,''{}'',%L)',p->>'document_id',p->>'revision',gen_random_uuid(),jsonb_build_array(jsonb_build_object('id',p->'items'->0->>'id','sku','Q','quantity',2,'source_quote_item_id',null))),'23514','Document item source is immutable','line lineage cannot be removed by atomic save');
 RETURN NEXT throws_ok(format('select public.romiku_save_document(''pi'',%L,0,%L,%L,''[]'')',gen_random_uuid(),gen_random_uuid(),jsonb_build_object('source_quote_id',src)),'23514','Use source creation workflow','manual create cannot forge conversion provenance');
 RETURN NEXT ok((public.romiku_batch_status('pi',ARRAY[(p->>'document_id')::uuid],'sent')->>'ok')::boolean,'trusted batch status remains available');
 RETURN NEXT ok((public.romiku_document_snapshot('pi',(p->>'document_id')::uuid)->>'revision')::bigint>(p->>'revision')::bigint,'batch status invalidates editor revision');
 o:=public.romiku_save_document('order',gen_random_uuid(),0,gen_random_uuid(),'{}','[]');
 plan:=public.romiku_customer_archive_plan((o->>'document_id')::uuid);
 RETURN NEXT ok((public.romiku_confirm_customer_archive((o->>'document_id')::uuid,null,false,plan->>'token','Atomic Customer')->>'ok')::boolean,'trusted customer archival remains available');
 RETURN NEXT ok((public.romiku_archive_orders(ARRAY[(o->>'document_id')::uuid])->'succeeded') @> jsonb_build_array(jsonb_build_object('id',o->>'document_id')),'trusted order archive remains available');
END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='f1130000-0000-0000-0000-000000000001';
SELECT * FROM pg_temp.advanced_cases('quote');
SELECT * FROM pg_temp.advanced_cases('pi');
SELECT * FROM pg_temp.advanced_cases('order');
SELECT * FROM pg_temp.advanced_cases('packing');
SELECT * FROM pg_temp.conversion_case();
RESET ROLE;
UPDATE public.sales SET disabled=true WHERE user_id='f1130000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT throws_ok('select public.romiku_save_document(''quote'',gen_random_uuid(),0,gen_random_uuid(),''{}'',null)','42501','Active CRM membership required','disabled actor save denied');
SELECT throws_ok('select public.romiku_document_save_result(gen_random_uuid())','42501','Active CRM membership required','disabled actor recovery denied');
SELECT throws_ok('select public.romiku_document_snapshot(''quote'',gen_random_uuid())','42501','Active CRM membership required','disabled actor snapshot denied');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
