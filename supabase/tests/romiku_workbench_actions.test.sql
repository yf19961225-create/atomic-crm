begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
-- Test convenience only: SECURITY INVOKER preserves authenticated RPC/permission checks.
create function pg_temp.save_order(doc uuid, header jsonb default '{}', items jsonb default null) returns jsonb language sql as $$
 select public.romiku_save_document('order',doc,coalesce((select revision from public.romiku_orders where id=doc),0),gen_random_uuid(),header,items)
$$;
create function pg_temp.order_lines(doc uuid) returns jsonb language sql as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'sku',sku,'quantity',quantity,'unit_price',unit_price) order by id),'[]') from public.romiku_order_items where order_id=doc
$$;

select has_function('public','romiku_workbench_action',array['text','uuid','bigint','uuid','jsonb','text'],'controlled action RPC');
select has_function('public','romiku_workbench_order_snapshot',array['uuid'],'read evidence snapshot');
select has_function('public','romiku_workbench_verification_list',array['integer','integer'],'historical verification query');

insert into auth.users(id,email,raw_user_meta_data) values ('ea040000-0000-0000-0000-000000000001','wb-action@example.test','{}');
insert into public.sales(user_id,email,administrator,disabled) values ('ea040000-0000-0000-0000-000000000001','wb-action@example.test',false,false) on conflict(user_id) do nothing;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea040000-0000-0000-0000-000000000001',true);
-- Historical fixtures are seeded as admin; tested mutations below remain authenticated.
reset role;
insert into romiku_orders(id,status,currency,deposit_percent) values('ea041000-0000-0000-0000-000000000001','confirmed','CNY',30);
insert into romiku_order_items(id,order_id,sku,quantity,unit_price) values('ea042000-0000-0000-0000-000000000001','ea041000-0000-0000-0000-000000000001','QA',1,10000);
set local role authenticated;
insert into romiku_payments(id,order_id,kind,amount) values('ea043000-0000-0000-0000-000000000001','ea041000-0000-0000-0000-000000000001','deposit',2913);
select is(romiku_workbench_verification_list(1,0)->>'total','1','historical unknown remains visible');
select is(romiku_workbench_verification_list(1,0)->'potential_receivables'->0->>'amount','7087.00','potential receivables includes unknown');
select lives_ok($$select romiku_workbench_action('customer_confirmation','ea041000-0000-0000-0000-000000000001',0,'ea044000-0000-0000-0000-000000000001','{"state":"confirmed"}','Customer QA confirmed')$$,'customer confirmation accepted');
select lives_ok($$select romiku_workbench_action('customer_confirmation','ea041000-0000-0000-0000-000000000001',0,'ea044000-0000-0000-0000-000000000001','{"state":"confirmed"}','Customer QA confirmed')$$,'same request retry returns first result');
select is((select revision::int from romiku_order_collection_state),1,'retry does not increment revision');
select throws_ok($$select romiku_workbench_action('customer_confirmation','ea041000-0000-0000-0000-000000000001',0,'ea044000-0000-0000-0000-000000000001','{"state":"unknown"}','Customer QA confirmed')$$,'PT409','REQUEST_CONFLICT','same ID different payload refused');
select throws_ok($$select romiku_workbench_action('deposit_accept','ea041000-0000-0000-0000-000000000001',1,gen_random_uuid(),'{"fingerprint":"stale"}','QA')$$,'PT409','STALE_EVIDENCE','stale preview refused');
select lives_ok($$select romiku_workbench_action('deposit_accept','ea041000-0000-0000-0000-000000000001',1,'ea044000-0000-0000-0000-000000000002',jsonb_build_object('fingerprint',romiku_workbench_order_snapshot('ea041000-0000-0000-0000-000000000001')->>'fingerprint'),'2913 accepted,87 retained')$$,'deposit completion with actual receipt');
select is((select deposit_override from romiku_order_collection_state),'accepted','override accepted');
select is((select remaining_amount::text from romiku_order_totals where id='ea041000-0000-0000-0000-000000000001'),'7087.00','balance still contains 87 difference');
select is((select amount::text from romiku_payments),'2913.00','actual payment unchanged');
select is((select count(*)::int from romiku_deposit_evidence),1,'receipt linked as evidence');
select lives_ok($$select romiku_workbench_action('customer_confirmation','ea041000-0000-0000-0000-000000000001',2,'ea044000-0000-0000-0000-000000000003','{"state":"unknown"}','Customer needs verification')$$,'customer state change invalidates deposit');
select is((select count(*)::int from romiku_workbench_events where request_id='ea044000-0000-0000-0000-000000000003'),2,'one operation generates two distinct events');
select lives_ok($$select romiku_workbench_action('customer_confirmation','ea041000-0000-0000-0000-000000000001',2,'ea044000-0000-0000-0000-000000000003','{"state":"unknown"}','Customer needs verification')$$,'multi-event request retry safe');
select is((select count(*)::int from romiku_workbench_events where request_id='ea044000-0000-0000-0000-000000000003'),2,'no duplicate audit events');
select romiku_workbench_action('customer_confirmation','ea041000-0000-0000-0000-000000000001',3,gen_random_uuid(),'{"state":"confirmed"}','QA reverified');
create function pg_temp.accept_deposit() returns jsonb language sql as $$
 select romiku_workbench_action('deposit_accept','ea041000-0000-0000-0000-000000000001',
 (select revision from romiku_order_collection_state where order_id='ea041000-0000-0000-0000-000000000001'),gen_random_uuid(),
 jsonb_build_object('fingerprint',romiku_workbench_order_snapshot('ea041000-0000-0000-0000-000000000001')->>'fingerprint'),'QA accept')
$$;
select pg_temp.accept_deposit();
update romiku_payments set amount=2912 where id='ea043000-0000-0000-0000-000000000001';
select is((select deposit_override from romiku_order_collection_state),'invalidated','ordinary payment UPDATE invalidates atomically');
select pg_temp.accept_deposit();
select pg_temp.save_order('ea041000-0000-0000-0000-000000000001','{}',(select jsonb_agg(x||jsonb_build_object('unit_price',10001)) from jsonb_array_elements(pg_temp.order_lines('ea041000-0000-0000-0000-000000000001')) x));
select is((select deposit_override from romiku_order_collection_state),'invalidated','item amount update invalidates');
select pg_temp.accept_deposit();
select pg_temp.save_order('ea041000-0000-0000-0000-000000000001','{"freight":1}');
select is((select deposit_override from romiku_order_collection_state),'invalidated','header total change invalidates');
select pg_temp.accept_deposit();
update romiku_payments set received_at=received_at+interval '1 hour' where id='ea043000-0000-0000-0000-000000000001';
select is((select deposit_override from romiku_order_collection_state),'invalidated','evidence received_at invalidates');
select pg_temp.accept_deposit();
update romiku_payments set proof='["QA-receipt"]'::jsonb where id='ea043000-0000-0000-0000-000000000001';
select is((select deposit_override from romiku_order_collection_state),'invalidated','evidence proof invalidates');
select pg_temp.accept_deposit();
update romiku_payments set payment_account='QA account' where id='ea043000-0000-0000-0000-000000000001';
select is((select deposit_override from romiku_order_collection_state),'invalidated','evidence payment_account invalidates');
select pg_temp.accept_deposit();
update romiku_payments set payment_reference='QA ref' where id='ea043000-0000-0000-0000-000000000001';
select is((select deposit_override from romiku_order_collection_state),'invalidated','evidence payment_reference invalidates');
select pg_temp.accept_deposit();
update romiku_payments set kind='balance' where id='ea043000-0000-0000-0000-000000000001';
select is((select deposit_override from romiku_order_collection_state),'invalidated','payment kind change invalidates');
update romiku_payments set kind='deposit' where id='ea043000-0000-0000-0000-000000000001';
select pg_temp.accept_deposit();
select pg_temp.save_order('ea041000-0000-0000-0000-000000000001','{"discount":1}');
select is((select deposit_override from romiku_order_collection_state),'invalidated','order discount invalidates');
select pg_temp.accept_deposit();
select pg_temp.save_order('ea041000-0000-0000-0000-000000000001','{"other_expenses":1}');
select is((select deposit_override from romiku_order_collection_state),'invalidated','order other_expenses invalidates');
select pg_temp.accept_deposit();
select pg_temp.save_order('ea041000-0000-0000-0000-000000000001','{"deposit_percent":35}');
select is((select deposit_override from romiku_order_collection_state),'invalidated','order deposit_percent invalidates');
select pg_temp.accept_deposit();
select throws_ok($$select pg_temp.save_order('ea041000-0000-0000-0000-000000000001','{"currency":"USD"}')$$,null,'Order currency is immutable after payments exist','existing currency immutability retained');
select is((select deposit_override from romiku_order_collection_state),'accepted','rejected currency write leaves acceptance unchanged');
select romiku_workbench_action('deposit_revoke','ea041000-0000-0000-0000-000000000001',(select revision from romiku_order_collection_state),gen_random_uuid(),'{}','QA reset');
select pg_temp.accept_deposit();
select pg_temp.save_order('ea041000-0000-0000-0000-000000000001','{}',(select jsonb_agg(x||jsonb_build_object('quantity',2)) from jsonb_array_elements(pg_temp.order_lines('ea041000-0000-0000-0000-000000000001')) x));
select is((select deposit_override from romiku_order_collection_state),'invalidated','item quantity invalidates');
select pg_temp.accept_deposit();
select pg_temp.save_order('ea041000-0000-0000-0000-000000000001','{}',pg_temp.order_lines('ea041000-0000-0000-0000-000000000001')||'[{"id":"ea042000-0000-0000-0000-000000000002","sku":"QA-extra","quantity":1,"unit_price":1}]');
select is((select deposit_override from romiku_order_collection_state),'invalidated','item insert invalidates');
select pg_temp.accept_deposit();
select pg_temp.save_order('ea041000-0000-0000-0000-000000000001','{}',(select jsonb_agg(x) from jsonb_array_elements(pg_temp.order_lines('ea041000-0000-0000-0000-000000000001')) x where x->>'id'<>'ea042000-0000-0000-0000-000000000002'));
select is((select deposit_override from romiku_order_collection_state),'invalidated','item deletion invalidates');
select pg_temp.accept_deposit();
select romiku_workbench_action('deposit_revoke','ea041000-0000-0000-0000-000000000001',(select revision from romiku_order_collection_state),gen_random_uuid(),'{}','QA revoke');
select is((select deposit_override from romiku_order_collection_state),'revoked','manual revoke preserved as new state');
select ok((select bool_and(reverses_event_id is not null) from romiku_workbench_events where action='deposit_revoke'),'revoke links original event');
select pg_temp.accept_deposit();
select is(romiku_void_payment('ea043000-0000-0000-0000-000000000001','QA void')->>'ok','true','existing void RPC still succeeds');
select is((select deposit_override from romiku_order_collection_state),'invalidated','void invalidates accepted proof');
select throws_ok($$delete from romiku_payments where id='ea043000-0000-0000-0000-000000000001'$$,'42501',null,'payment delete remains prohibited');
insert into romiku_production_orders(id,order_id) values('ea045000-0000-0000-0000-000000000001','ea041000-0000-0000-0000-000000000001');
select throws_ok($$update romiku_production_orders set factory_due_at='2026-11-10T15:59:59.999Z' where id='ea045000-0000-0000-0000-000000000001'$$,'42501',null,'old date PATCH rejected');
select lives_ok($$update romiku_production_orders set notes='QA ordinary edit',factory_due_at=null where id='ea045000-0000-0000-0000-000000000001'$$,'unchanged date ordinary edit allowed');
select lives_ok($$select romiku_workbench_action('production_due','ea045000-0000-0000-0000-000000000001',0,gen_random_uuid(),'{"classification":"confirmed","date_mode":"set","date":"2026-11-10","needs_follow_up":false}','QA due')$$,'controlled date change succeeds');
select is((select factory_due_at at time zone 'Asia/Shanghai' from romiku_production_orders where id='ea045000-0000-0000-0000-000000000001'),'2026-11-10 23:59:59.999'::timestamp,'Shanghai date preserved');
select throws_ok($$select romiku_workbench_action('production_due','ea045000-0000-0000-0000-000000000001',0,gen_random_uuid(),'{"classification":"confirmed","date_mode":"set","date":"2026-11-11","needs_follow_up":false}','QA stale')$$,'PT409','STALE_REVISION','stale due revision rejected');

select is(romiku_save_production_workspace(null,o.id,'{"factory_due_at":"2026-12-01T15:59:59.999Z"}',
 jsonb_build_array(jsonb_build_object('source_order_item_id','ea042000-0000-0000-0000-000000000001','quantity',1,'product_snapshot','{}'::jsonb,'packaging_snapshot','{}'::jsonb)),
 jsonb_build_object('order_updated_at',o.updated_at))->>'ok','true','existing create-workspace path can initialize a date')
from romiku_orders o where o.id='ea041000-0000-0000-0000-000000000001';

insert into romiku_payments(order_id,kind,amount) values('ea041000-0000-0000-0000-000000000001','deposit',2913);
select pg_temp.accept_deposit();
reset role;
set constraints all immediate;
alter table romiku_workbench_events add constraint qa_audit_failure check(reason<>'order_terms_changed') not valid;
set local role authenticated;
select throws_ok($$select pg_temp.save_order('ea041000-0000-0000-0000-000000000001','{"freight":2}')$$,'23514',null,'audit failure rolls back source business write');
select is((select freight from romiku_orders where id='ea041000-0000-0000-0000-000000000001'),1::numeric,'source amount unchanged after failed audit');
select is((select deposit_override from romiku_order_collection_state),'accepted','failed transaction does not half-invalidate state');
reset role;
alter table romiku_workbench_events drop constraint qa_audit_failure;
set local role authenticated;
select * from finish();
rollback;
