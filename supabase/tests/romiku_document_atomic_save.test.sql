-- Local transaction tests. Every fixture is rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();
SELECT has_function('public','romiku_save_document',ARRAY['text','uuid','bigint','uuid','jsonb','jsonb'],'atomic save RPC exists');
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ('f1120000-0000-0000-0000-000000000001','qa-atomic@example.test','{}');
CREATE FUNCTION pg_temp.atomic_cases(k text) RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE d uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); line uuid:=gen_random_uuid(); result jsonb; again jsonb; items jsonb; h jsonb; pt text; it text; fk text; n bigint;
BEGIN
 items:=jsonb_build_array(jsonb_build_object('id',line,'sku','TEST','quantity',2)); h:='{"notes":"original"}';
 result:=public.romiku_save_document(k,d,0,r,h,items);
 RETURN NEXT ok(result->'header'->>'notes'='original' AND jsonb_array_length(result->'items')=1,k||' creates complete header and items');
 again:=public.romiku_save_document(k,d,0,r,h,items);
 RETURN NEXT is(again,result,k||' durable identical retry');
 RETURN NEXT is(public.romiku_document_save_result(r),result,k||' lost-response lookup');
 RETURN NEXT throws_ok(format('select public.romiku_save_document(%L,%L,0,%L,''{"notes":"changed"}'',%L)',k,d,r,items),'PT409','REQUEST_CONFLICT',k||' same UUID changed payload rejected');
 RETURN NEXT throws_ok(format('select public.romiku_save_document(%L,%L,0,%L,''{}'',null)',k,d,gen_random_uuid()),'PT409','STALE_REVISION',k||' stale revision rejected');
 result:=public.romiku_save_document(k,d,(result->>'revision')::bigint,gen_random_uuid(),'{"notes":"patched"}',null);
 RETURN NEXT ok(result->'header'->>'notes'='patched' AND result->'items'->0->>'id'=line::text,k||' header-only patch preserves items');
 RETURN NEXT is(public.romiku_document_snapshot(k,d),result,k||' coherent snapshot matches commit');
 pt:=case k when 'packing' then 'romiku_packing_lists' else 'romiku_'||k||'s' end;
 it:='romiku_'||k||'_items';fk:=case k when 'packing' then 'packing_list_id' else k||'_id' end;
 RETURN NEXT throws_ok(format('update public.%I set notes=''legacy'' where id=%L',pt,d),'42501','Use atomic document save',k||' legacy header blocked');
 RETURN NEXT throws_ok(format('delete from public.%I where %I=%L',it,fk,d),'42501','Use atomic document save',k||' legacy items blocked');
 RETURN NEXT throws_ok(format('select public.romiku_save_document(%L,%L,%s,%L,''{"notes":"must rollback"}'',''[{"sku":"INVALID","quantity":-1}]'')',k,d,result->>'revision',gen_random_uuid()),'23514',null,k||' invalid line rejects transaction');
 RETURN NEXT is(public.romiku_document_snapshot(k,d),result,k||' invalid line rolls header/items/revision back');
END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='f1120000-0000-0000-0000-000000000001';
SELECT * FROM pg_temp.atomic_cases('quote');
SELECT * FROM pg_temp.atomic_cases('pi');
SELECT * FROM pg_temp.atomic_cases('order');
SELECT * FROM pg_temp.atomic_cases('packing');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
