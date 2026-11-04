begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
select has_table('public','romiku_workbench_requests','request ledger exists');
select has_table('public','romiku_workbench_events','events exist');
select has_table('public','romiku_order_collection_state','order state exists');
select has_table('public','romiku_production_due_state','production state exists');
select has_table('public','romiku_deposit_evidence','evidence links exist');
select has_function('public','romiku_wb_active',array[]::text[],'active user guard exists');

insert into auth.users(id,email,raw_user_meta_data) values
 ('ee040000-0000-0000-0000-000000000001','wb-a@example.test','{}'),
 ('ee040000-0000-0000-0000-000000000002','wb-b@example.test','{}'),
 ('ee040000-0000-0000-0000-000000000003','wb-disabled@example.test','{}'),
 ('ee040000-0000-0000-0000-000000000004','wb-outsider@example.test','{}');
insert into public.sales(user_id,email,administrator,disabled) values
 ('ee040000-0000-0000-0000-000000000001','wb-a@example.test',false,false),
 ('ee040000-0000-0000-0000-000000000002','wb-b@example.test',false,false),
 ('ee040000-0000-0000-0000-000000000003','wb-disabled@example.test',false,true)
 on conflict(user_id) do update set disabled=excluded.disabled;
insert into romiku_orders(id) values ('ee041000-0000-0000-0000-000000000001');
insert into romiku_order_collection_state(order_id) values ('ee041000-0000-0000-0000-000000000001');
select is((select rolcanlogin or rolbypassrls or rolsuper from pg_roles where rolname='romiku_workbench_executor'),false,'executor nonlogin and no bypass');
select is(pg_has_role('authenticated','romiku_workbench_executor','MEMBER'),false,'client cannot assume executor');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ee040000-0000-0000-0000-000000000001',true);
select ok(romiku_wb_active(),'active user A');
select ok(romiku_wb_manage('order','ee041000-0000-0000-0000-000000000001'),'A can manage permitted order');
select is((select count(*)::int from romiku_order_collection_state),1,'A reads state');
select throws_ok($$update romiku_order_collection_state set customer_confirmation='confirmed'$$,'42501',null,'direct state mutation denied');
select throws_ok($$delete from romiku_workbench_events$$,'42501',null,'audit delete denied');
select throws_ok($$update romiku_workbench_requests set result='{}'$$,'42501',null,'request tampering denied');
select set_config('request.jwt.claim.sub','ee040000-0000-0000-0000-000000000002',true);
select ok(romiku_wb_active(),'active user B');
select is((select count(*)::int from romiku_order_collection_state),1,'B same permitted visibility');
select set_config('request.jwt.claim.sub','ee040000-0000-0000-0000-000000000003',true);
select is(romiku_wb_active(),false,'disabled rejected by guard');
select is((select count(*)::int from romiku_order_collection_state),0,'disabled direct table read hidden');
select set_config('request.jwt.claim.sub','ee040000-0000-0000-0000-000000000099',true);
select is(romiku_wb_active(),false,'no CRM membership rejected');
reset role;
alter policy romiku_read on romiku_orders using(false);
set local role authenticated;
select set_config('request.jwt.claim.sub','ee040000-0000-0000-0000-000000000001',true);
select is((select count(*)::int from romiku_order_collection_state),0,'parent RLS preserved');
select is(romiku_wb_manage('order','ee041000-0000-0000-0000-000000000001'),false,'invisible parent unmanageable');
reset role;
alter policy romiku_read on romiku_orders using(true);
alter policy romiku_update on romiku_orders using(false);
set local role authenticated;
select is(romiku_wb_manage('order','ee041000-0000-0000-0000-000000000001'),false,'readable but UPDATE restricted is rejected');
reset role;
set local role anon;
select throws_ok($$select * from romiku_order_collection_state$$,'42501',null,'anon denied');
reset role;
select * from finish();
rollback;
