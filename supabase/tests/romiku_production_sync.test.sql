begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,raw_user_meta_data) values('de700000-0000-0000-0000-000000000001','sync@example.test','{}');
create temporary table sy_ids(kind text primary key,id uuid default gen_random_uuid());
insert into sy_ids(kind) values('order'),('source'),('p06'),('p07'),('completed'),('received'),('cancelled'),('archived');
create temporary table sy_result(value jsonb);
create temporary table sy_before(id uuid, snapshot jsonb);
grant all on sy_ids,sy_result,sy_before to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','de700000-0000-0000-0000-000000000001',true);
insert into romiku_orders(id) select id from sy_ids where kind='order';
insert into romiku_order_items(id,order_id,sku,quantity) select s.id,o.id,'SUN5',100 from sy_ids s cross join sy_ids o where s.kind='source' and o.kind='order';
insert into romiku_production_orders(id,order_id,status,archived_at,marking_snapshot)
select p.id,o.id,case when p.kind='p07' then 'in_production' when p.kind in ('p06','archived') then 'pending' else p.kind end,
case when p.kind='archived' then now() end,
case when p.kind='p07' then '{}'::jsonb else '{"production_requirements":"Own before sync"}'::jsonb end
from sy_ids p cross join sy_ids o where o.kind='order' and p.kind not in ('order','source');
insert into romiku_production_items(production_order_id,order_id,source_order_item_id,sku,quantity,marking_override)
select p.id,o.id,s.id,'SUN5',1,case when p.kind='p06' then '{"mode":"append","labels":[{"mode":"text","text":"Barcode"}]}'::jsonb else '{"mode":"inherit"}'::jsonb end
from sy_ids p cross join sy_ids o cross join sy_ids s where p.kind in ('p06','p07') and o.kind='order' and s.kind='source';
insert into sy_before select id,marking_snapshot from romiku_production_orders where order_id=(select id from sy_ids where kind='order');
select is(romiku_sync_order_production_defaults((select id from sy_ids where kind='order'))->>'code','EMPTY_DEFAULTS','empty saved Order is blocked before confirmation');
select is(romiku_sync_order_production_defaults((select id from sy_ids where kind='order'),'{"token":"anything"}')->>'message','当前订单尚未设置统一生产要求，请先设置订单的生产要求 / 唛头与标签。','empty confirmed source cannot pretend success');
select is((select count(*) from romiku_production_orders p join sy_before b using(id) where p.marking_snapshot=b.snapshot),6::bigint,'empty sync preserves all previous snapshots');
update romiku_orders set production_defaults_snapshot=production_defaults_snapshot||'{"front_mark":{"mode":"text","text":"云裳"},"small_label":{"mode":"text","text":"Made in China"},"production_requirements":"外套编织袋","labeling_requirements":"四面贴","notes":"shared note","additional_labels":[{"mode":"text","text":"Common barcode"}]}' where id=(select id from sy_ids where kind='order');
insert into sy_result select romiku_sync_order_production_defaults((select id from sy_ids where kind='order'));
select is((select value->'source_snapshot' from sy_result),(select production_defaults_snapshot from romiku_orders where id=(select id from sy_ids where kind='order')),'confirmation includes exact saved Order snapshot');
select is((select value->>'order_document_number' from sy_result),(select document_number from romiku_orders where id=(select id from sy_ids where kind='order')),'confirmation identifies saved source Order');
select is((select jsonb_array_length(value->'productions') from sy_result),2,'only pending and in_production are eligible');
select is(romiku_sync_order_production_defaults((select id from sy_ids where kind='order'),(select value from sy_result))->>'count','2','actual updated count is two');
-- Read persisted rows independently; never accept RPC success alone.
select is((select marking_snapshot-'source'-'initialized_at' from romiku_production_orders where id=(select id from sy_ids where kind='p06')),(select production_defaults_snapshot-'source'-'initialized_at' from romiku_orders where id=(select id from sy_ids where kind='order')),'re-fetch P06 all shared fields match Order');
select is((select marking_snapshot-'source'-'initialized_at' from romiku_production_orders where id=(select id from sy_ids where kind='p07')),(select production_defaults_snapshot-'source'-'initialized_at' from romiku_orders where id=(select id from sy_ids where kind='order')),'re-fetch P07 all shared fields match Order');
select is((select marking_override from romiku_production_items where production_order_id=(select id from sy_ids where kind='p06')),'{"mode":"append","labels":[{"mode":"text","text":"Barcode"}]}'::jsonb,'P06 Barcode override retained exactly');
select is((select marking_override from romiku_production_items where production_order_id=(select id from sy_ids where kind='p07')),'{"mode":"inherit"}'::jsonb,'P07 inherit retained exactly');
select is((select count(*) from romiku_production_orders p join sy_before b using(id) where p.marking_snapshot=b.snapshot),4::bigint,'completed received cancelled archived untouched');
truncate sy_before;insert into sy_before select id,marking_snapshot from romiku_production_orders where order_id=(select id from sy_ids where kind='order');
update romiku_orders set production_defaults_snapshot=jsonb_set(production_defaults_snapshot,'{production_requirements}','"Changed"') where id=(select id from sy_ids where kind='order');
select is(romiku_sync_order_production_defaults((select id from sy_ids where kind='order'),(select value from sy_result))->>'ok','false','stale source confirmation rejected');
truncate sy_result;insert into sy_result select romiku_sync_order_production_defaults((select id from sy_ids where kind='order'));
reset role;
create function pg_temp.sy_fail() returns trigger language plpgsql as $$begin if new.id=(select id from sy_ids where kind='p07') then raise exception 'private FK detail';end if;return new;end$$;
create trigger sy_failure before update on romiku_production_orders for each row execute function pg_temp.sy_fail();
set local role authenticated;
select is(romiku_sync_order_production_defaults((select id from sy_ids where kind='order'),(select value from sy_result))->>'ok','false','one target failure fails entire sync');
select is((select count(*) from romiku_production_orders p join sy_before b using(id) where p.marking_snapshot=b.snapshot),6::bigint,'failure rolls back all persisted targets');
reset role;drop trigger sy_failure on romiku_production_orders;
-- A trigger silently changing content must also fail persisted verification.
create function pg_temp.sy_corrupt() returns trigger language plpgsql as $$begin new.marking_snapshot='{}';return new;end$$;
create trigger sy_corruption before update on romiku_production_orders for each row execute function pg_temp.sy_corrupt();
set local role authenticated;
select is(romiku_sync_order_production_defaults((select id from sy_ids where kind='order'),(select value from sy_result))->>'ok','false','readback catches successful UPDATE with wrong persisted content');
select is((select count(*) from romiku_production_orders p join sy_before b using(id) where p.marking_snapshot=b.snapshot),6::bigint,'readback failure rolls back all targets');
reset role;drop trigger sy_corruption on romiku_production_orders;
select ok(not has_function_privilege('anon','public.romiku_sync_order_production_defaults(uuid,jsonb)','execute'),'anon forbidden');
select is((select prosecdef from pg_proc where oid='public.romiku_sync_order_production_defaults(uuid,jsonb)'::regprocedure),false,'invoker RLS retained');
select ok(not romiku_has_production_instructions(v),'ignores empty/hidden/invalid effective content: '||v::text) from (values
 ('{}'::jsonb), ('{"schema_version":2,"initialized_at":"2026-10-05","source":{"kind":"manual"}}'),
 ('{"front_mark":{"mode":"none","text":"hidden"}}'), ('{"production_requirements":"  ","notes":""}'),
 ('{"small_label":{"mode":"image","image_asset":{"bucket":"other","path":"x.png"}}}')
) t(v);
select ok(romiku_has_production_instructions(v),'recognizes effective content: '||v::text) from (values
 ('{"front_mark":{"mode":"text","text":"云裳"}}'::jsonb), ('{"side_mark":{"text":"Legacy side"}}'),
 ('{"small_label":{"mode":"text","text":"Made in China"}}'),
 ('{"front_mark":{"mode":"image","image_asset":{"bucket":"romiku-marking-assets","path":"immutable/v1.png"}}}'),
 ('{"additional_labels":[{"mode":"text","text":"Barcode"}]}'),
 ('{"labeling_requirements":"四面贴"}'), ('{"production_requirements":"外套编织袋"}'), ('{"notes":"Internal note"}')
) t(v);
create policy sy_deny_target on romiku_production_orders as restrictive for update to authenticated using (id<>(select id from sy_ids where kind='p07'));
set local role authenticated;
select is(romiku_sync_order_production_defaults((select id from sy_ids where kind='order'),(select value from sy_result))->>'ok','false','RLS target denial fails sync');
select is((select count(*) from romiku_production_orders p join sy_before b using(id) where p.marking_snapshot=b.snapshot),6::bigint,'RLS target denial leaves all persisted rows unchanged');
reset role;drop policy sy_deny_target on romiku_production_orders;
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select is(romiku_sync_order_production_defaults((select id from sy_ids where kind='order'))->>'ok','false','authenticated role without uid cannot sync');
reset role;
select * from finish();
rollback;
