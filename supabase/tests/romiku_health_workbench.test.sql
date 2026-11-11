begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,raw_user_meta_data) values('ab110000-0000-0000-0000-000000000001','health-workbench@example.test','{}');
set local role authenticated;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='ab110000-0000-0000-0000-000000000001';
create temp table health_cases(id uuid default gen_random_uuid(),state text,remind boolean);
insert into health_cases(state,remind) values('draft',false),('confirmed',true),('in_production',true),('ready_to_ship',true),('shipped',false),('awaiting_payment',false),('completed',false),('cancelled',false),('voided',false);
insert into romiku_orders(id,status,document_name,expected_delivery_at) select id,case when state='voided' then 'confirmed' else state end,'HEALTH-DELIVERY-'||state,now()-interval '1 day' from health_cases;
select romiku_void_order(id,'QA state matrix') from health_cases where state='voided';
select is(exists(select 1 from romiku_calendar where source_id=c.id and event_type='order_delivery'),c.remind,'calendar delivery stage '||c.state) from health_cases c order by state;
select is((select count(*)::int from jsonb_array_elements(romiku_workbench_feed('all','','order_delivery','',100,0)->'rows') r where r->>'source_id'=health_cases.id::text),case when remind then 1 else 0 end,'feed delivery stage '||state) from health_cases order by state;
update romiku_orders set actual_delivery_at=now() where id=(select id from health_cases where state='confirmed');
select is((select count(*)::int from jsonb_array_elements(romiku_workbench_feed('all','','order_delivery','',100,0)->'rows') r where r->>'source_id'=(select id::text from health_cases where state='confirmed')),0,'actual delivery also suppresses task');
-- A terminal paid order has no delivery or collection action.
select is((select count(*)::int from jsonb_array_elements(romiku_workbench_feed('all','','order_delivery','',100,0)->'rows') r where r->>'source_id'=(select id::text from health_cases where state='completed')),0,'completed zero-balance order absent from recent');
-- Independent confirmation remains the sole pending-verification signal.
insert into romiku_orders(id,status,freight,currency,document_name) values
('ab111000-0000-0000-0000-000000000001','draft',100,'CNY','HEALTH-VERIFY-unknown'),
('ab111000-0000-0000-0000-000000000002','confirmed',200,'USD','HEALTH-VERIFY-unconfirmed'),
('ab111000-0000-0000-0000-000000000003','shipped',300,'USD','HEALTH-VERIFY-confirmed');
select romiku_workbench_action('customer_confirmation','ab111000-0000-0000-0000-000000000002',0,gen_random_uuid(),'{"state":"unconfirmed"}','QA');
select romiku_workbench_action('customer_confirmation','ab111000-0000-0000-0000-000000000003',0,gen_random_uuid(),'{"state":"confirmed"}','QA');
select is(romiku_workbench_feed('all','HEALTH-VERIFY-','verification','',100,0)->>'total','1','only unknown in verification including historical draft');
select is(romiku_workbench_feed('collection','HEALTH-VERIFY-','','',100,0)->>'total','1','only independently confirmed non-draft is collection');
select is(romiku_workbench_feed('all','HEALTH-VERIFY-unconfirmed','deferred','',100,0)->>'total','1','explicit unconfirmed remains searchable in deferred');
select ok(not exists(select 1 from jsonb_array_elements(romiku_workbench_verification_list(100,0)->'rows') x where x->>'id'='ab111000-0000-0000-0000-000000000002'),'unconfirmed excluded from verification RPC');
select is((select x->>'phase' from jsonb_array_elements(romiku_workbench_receivables(100,0)->'rows') x where x->>'id'='ab111000-0000-0000-0000-000000000003'),'deposit','shipped actual balance retains independent phase');
update romiku_orders set archived_at=now() where id='ab111000-0000-0000-0000-000000000001';
select is(romiku_workbench_feed('all','HEALTH-VERIFY-','verification','',100,0)->>'total','0','archived unknown excluded');
-- Cancelled/archived parent orders must not leak production group tasks.
insert into romiku_production_orders(id,order_id) values
('ab112000-0000-0000-0000-000000000001',(select id from health_cases where state='cancelled')),
('ab112000-0000-0000-0000-000000000002','ab111000-0000-0000-0000-000000000001');
select is(romiku_workbench_feed('all','HEALTH-DELIVERY-cancelled','production','',100,0)->>'total','0','cancelled parent excluded from production reminders');
select is(romiku_workbench_feed('all','HEALTH-VERIFY-unknown','production','',100,0)->>'total','0','archived parent excluded from production reminders');
insert into romiku_production_orders(id,order_id,status,anomaly_flags) values
('ab112000-0000-0000-0000-000000000003',(select id from health_cases where state='in_production'),'received',array['QA issue']),
('ab112000-0000-0000-0000-000000000004',(select id from health_cases where state='in_production'),'cancelled',array['QA issue']);
select is((select count(*)::int from romiku_workbench where event_type='production_anomaly' and source_id in ('ab112000-0000-0000-0000-000000000003','ab112000-0000-0000-0000-000000000004')),0,'received or cancelled production has no actionable anomaly reminder');
-- Manual/inquiry terminal lifecycle remains independently filtered.
insert into romiku_manual_tasks(id,title,due_at) values('ab113000-0000-0000-0000-000000000001','HEALTH-MANUAL',now());
select is(romiku_workbench_feed('recent','HEALTH-MANUAL','task','',100,0)->>'total','1','unfinished dated manual task is recent');
update romiku_manual_tasks set completed_at=now() where id='ab113000-0000-0000-0000-000000000001';
select is(romiku_workbench_feed('recent','HEALTH-MANUAL','task','',100,0)->>'total','0','completed manual task leaves recent');
insert into romiku_website_inquiries(id,customer_name,status) values('ab114000-0000-0000-0000-000000000001','HEALTH-INQUIRY','pending_screening');
select is((select count(*)::int from jsonb_array_elements(romiku_workbench_feed('all','','inquiry','',100,0)->'rows') r where r->>'source_id'='ab114000-0000-0000-0000-000000000001'),1,'pending inquiry is visible');
update romiku_website_inquiries set status='won' where id='ab114000-0000-0000-0000-000000000001';
select is((select count(*)::int from jsonb_array_elements(romiku_workbench_feed('all','','inquiry','',100,0)->'rows') r where r->>'source_id'='ab114000-0000-0000-0000-000000000001'),0,'won inquiry leaves pending tasks');
update romiku_website_inquiries set status='invalid' where id='ab114000-0000-0000-0000-000000000001';
select is((select count(*)::int from jsonb_array_elements(romiku_workbench_feed('all','','inquiry','',100,0)->'rows') r where r->>'source_id'='ab114000-0000-0000-0000-000000000001'),0,'invalid inquiry leaves pending tasks');
select * from finish();
rollback;
