begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
-- Scope feed assertions to this fixture; local restored databases may contain unrelated tasks.
-- Test convenience only: SECURITY INVOKER preserves authenticated RPC/permission checks.
create function pg_temp.save_order(doc uuid, header jsonb default '{}', items jsonb default null) returns jsonb language sql as $$
 select public.romiku_save_document('order',doc,coalesce((select revision from public.romiku_orders where id=doc),0),gen_random_uuid(),header,items)
$$;

insert into auth.users(id,email,raw_user_meta_data) values('ef040000-0000-0000-0000-000000000001','feed@example.test','{}');
set local role authenticated;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='ef040000-0000-0000-0000-000000000001';
select pg_temp.save_order('ef041000-0000-0000-0000-000000000001','{"status":"confirmed","freight":10000,"document_name":"QA historical"}');
select is(romiku_workbench_feed('all','QA historical','','',8,0)->>'unknown_total','1','unknown history always counted');
select is(romiku_workbench_feed('recent','QA historical','','',8,0)->>'total','0','undated historical item is not recent');
insert into romiku_production_orders(id,order_id) values('ef042000-0000-0000-0000-000000000001','ef041000-0000-0000-0000-000000000001'),('ef042000-0000-0000-0000-000000000002','ef041000-0000-0000-0000-000000000001');
select is(romiku_workbench_feed('arrange','QA historical','production','',8,0)->>'total','1','two children grouped before pagination');
select is(romiku_workbench_feed('arrange','QA historical','production','',8,0)->'rows'->0->>'child_count','2','group counts all children');
select is(romiku_workbench_feed('all','QA historical','verification','',8,0)->>'total','1','name search preserves historical record');
select romiku_workbench_action('customer_confirmation','ef041000-0000-0000-0000-000000000001',0,gen_random_uuid(),'{"state":"confirmed"}','QA');
select is(romiku_workbench_feed('collection','QA historical','','',8,0)->>'total','1','confirmed order one collection item');
select is(romiku_workbench_feed('recent','QA historical','collection','',8,0)->>'total','0','undated receivable not urgent');
select is(romiku_workbench_feed('all','QA historical','','',1,0)->>'total','2','count is before pagination');
select is(jsonb_array_length(romiku_workbench_feed('all','QA historical','','',1,0)->'rows'),1,'page size enforced');
select throws_ok($$select romiku_workbench_feed('all','QA historical','','',101,0)$$,null,'INVALID_PAGE','bounded page');
-- Seven-day window is Shanghai today through today+6, plus overdue.
select romiku_workbench_action('collection_follow_up','ef041000-0000-0000-0000-000000000001',1,gen_random_uuid(),jsonb_build_object('needs_follow_up',false,'next_follow_up_on',(now() at time zone 'Asia/Shanghai')::date+6),'QA');
select is(romiku_workbench_feed('recent','QA historical','collection','',8,0)->>'total','0','future collection follow-up is not immediate');
select romiku_workbench_action('collection_follow_up','ef041000-0000-0000-0000-000000000001',2,gen_random_uuid(),jsonb_build_object('needs_follow_up',false,'next_follow_up_on',(now() at time zone 'Asia/Shanghai')::date+7),'QA');
select is(romiku_workbench_feed('recent','QA historical','collection','',8,0)->>'total','0','day seven excluded');
select romiku_workbench_action('production_due','ef042000-0000-0000-0000-000000000001',0,gen_random_uuid(),jsonb_build_object('classification','needs_confirmation','date_mode','keep','needs_follow_up',false,'next_follow_up_on',(now() at time zone 'Asia/Shanghai')::date+2),'QA');
select is(romiku_workbench_feed('recent','QA historical','production','',8,0)->>'total','1','explicit future production follow-up is recent');
select romiku_workbench_action('collection_follow_up','ef041000-0000-0000-0000-000000000001',3,gen_random_uuid(),jsonb_build_object('needs_follow_up',false,'next_follow_up_on',(now() at time zone 'Asia/Shanghai')::date),'QA');
select is(romiku_workbench_feed('recent','QA historical','collection','',8,0)->>'total','1','today collection follow-up included');
select romiku_workbench_action('collection_follow_up','ef041000-0000-0000-0000-000000000001',4,gen_random_uuid(),'{"needs_follow_up":false,"next_follow_up_on":null}','QA');
select pg_temp.save_order('ef041000-0000-0000-0000-000000000001',jsonb_build_object('deposit_percent',100,'deposit_due_at',now()-interval '1 day','balance_due_at',null));
select is(romiku_workbench_feed('recent','QA historical','collection','',8,0)->>'total','1','overdue 100 percent prepayment uses deposit due date');
select is(romiku_workbench_feed('collection','QA historical','','',8,0)->'rows'->0->>'amount','10000.00','prepayment full remaining unchanged');
insert into romiku_manual_tasks(title,due_at) values('QA day six',(((now() at time zone 'Asia/Shanghai')::date+6)::timestamp at time zone 'Asia/Shanghai')),('QA day seven',(((now() at time zone 'Asia/Shanghai')::date+7)::timestamp at time zone 'Asia/Shanghai'));
select is(romiku_workbench_feed('recent','QA day','task','',8,0)->>'total','1','Shanghai day six included / day seven excluded');
reset role;
update sales set disabled=true where user_id='ef040000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$select romiku_workbench_feed('all','QA historical','','',8,0)$$,'42501','FORBIDDEN','disabled user denied');
select * from finish();
rollback;
