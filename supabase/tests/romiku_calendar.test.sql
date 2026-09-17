-- Task8 aggregation is read from real source rows; no calendar event copy exists.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
insert into auth.users(id,email,raw_user_meta_data) values
('81000000-0000-0000-0000-000000000001','calendar-one@example.test','{}'),
('81000000-0000-0000-0000-000000000002','calendar-two@example.test','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000001',true);
insert into romiku_website_inquiries(id,customer_name,next_follow_up_at,owner_id) values
('82000000-0000-0000-0000-000000000001','Calendar inquiry','2026-09-17T10:00:00Z','81000000-0000-0000-0000-000000000001');
insert into romiku_outbound_companies(id,name,next_follow_up_at,owner_id) values
('82000000-0000-0000-0000-000000000002','Calendar outbound','2026-09-17T11:00:00Z','81000000-0000-0000-0000-000000000002');
insert into romiku_quotes(id,follow_up_at,due_at) values ('82000000-0000-0000-0000-000000000003','2026-09-17T12:00:00Z','2026-09-18T12:00:00Z');
insert into romiku_pis(id,follow_up_at,due_at) values ('82000000-0000-0000-0000-000000000004','2026-09-17T13:00:00Z','2026-09-18T13:00:00Z');
insert into romiku_orders(id,expected_delivery_at) values ('82000000-0000-0000-0000-000000000005','2026-09-19T12:00:00Z');
insert into romiku_suppliers(id,name) values ('82000000-0000-0000-0000-000000000006','Calendar supplier');
insert into romiku_production_orders(id,order_id,supplier_id,factory_due_at) values ('82000000-0000-0000-0000-000000000007','82000000-0000-0000-0000-000000000005','82000000-0000-0000-0000-000000000006','2026-09-18T10:00:00Z');
insert into romiku_packing_lists(id,order_id,packing_at) values ('82000000-0000-0000-0000-000000000008','82000000-0000-0000-0000-000000000005','2026-09-19T10:00:00Z');
insert into romiku_manual_tasks(id,title,due_at,quote_id) values ('82000000-0000-0000-0000-000000000009','Calendar manual task','2026-09-17T14:00:00Z','82000000-0000-0000-0000-000000000003');
select is((select count(*) from romiku_calendar where owner_id in ('81000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000002')),10::bigint,'all eight source types aggregate with separate quote/PI follow-up and due events');
select is((select count(distinct source_table) from romiku_calendar where source_id::text like '82000000-%'),8::bigint,'calendar covers exactly eight source types');
select is((select count(*) from romiku_calendar where source_id::text like '82000000-%'),(select count(distinct id) from romiku_calendar where source_id::text like '82000000-%'),'derived event ids are unique');
select is((select count(*) from romiku_calendar where owner_id='81000000-0000-0000-0000-000000000002'),1::bigint,'owner filter selects auth user UUID');
select is((select count(*) from romiku_workbench where event_type='inquiry_new' and source_id='82000000-0000-0000-0000-000000000001'),1::bigint,'Website new action remains separate from outbound');
select is((select count(*) from romiku_workbench where event_type='outbound_follow_up' and source_id='82000000-0000-0000-0000-000000000002'),1::bigint,'Outbound action remains separate from Website');
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000002',true);
select is((select count(*) from romiku_calendar where source_id::text like '82000000-%'),10::bigint,'second user shares all source events irrespective of owner');
update romiku_quotes set due_at='2026-09-22T12:00:00Z' where id='82000000-0000-0000-0000-000000000003';
select is((select due_at from romiku_calendar where id='quote_due:82000000-0000-0000-0000-000000000003'),'2026-09-22T12:00:00Z'::timestamptz,'second user source edit reflects immediately in calendar');
select is((select count(*) from romiku_calendar where source_id='82000000-0000-0000-0000-000000000003'),2::bigint,'moving date does not append duplicate stored events');
update romiku_quotes set due_at=null where id='82000000-0000-0000-0000-000000000003';
select is((select count(*) from romiku_calendar where source_id='82000000-0000-0000-0000-000000000003'),1::bigint,'clearing due date preserves only the independent follow-up event');
update romiku_manual_tasks set completed_at=now() where id='82000000-0000-0000-0000-000000000009';
select is((select count(*) from romiku_calendar where source_id='82000000-0000-0000-0000-000000000009'),0::bigint,'completed manual task leaves calendar');
update romiku_manual_tasks set completed_at=null,due_at=null where id='82000000-0000-0000-0000-000000000009';
select is((select count(*) from romiku_calendar where source_id='82000000-0000-0000-0000-000000000009'),0::bigint,'unscheduled manual task is retained outside calendar');
select is((select count(*) from romiku_manual_tasks where id='82000000-0000-0000-0000-000000000009'),1::bigint,'task source survives date clearing');
select throws_ok($$update romiku_manual_tasks set order_id='82000000-0000-0000-0000-000000000005' where id='82000000-0000-0000-0000-000000000009'$$,'23514',null,'existing quote link prevents a second task relationship');
update romiku_production_orders set status='completed' where id='82000000-0000-0000-0000-000000000007';
update romiku_website_inquiries set status='processed' where id='82000000-0000-0000-0000-000000000001';
update romiku_outbound_companies set status='paused' where id='82000000-0000-0000-0000-000000000002';
select is((select count(*) from romiku_calendar where source_id in ('82000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000002','82000000-0000-0000-0000-000000000007')),0::bigint,'terminal source statuses remove actionable events');
update romiku_packing_lists set archived_at=now() where id='82000000-0000-0000-0000-000000000008';
select is((select count(*) from romiku_calendar where source_id='82000000-0000-0000-0000-000000000008'),0::bigint,'archived packing source leaves calendar');
reset role;
select is((select relkind::text from pg_class where oid='public.romiku_calendar'::regclass),'v','calendar is a view rather than duplicate event storage');
select ok((select reloptions @> array['security_invoker=true'] from pg_class where oid='public.romiku_calendar'::regclass),'calendar honors underlying RLS');
set local role anon;
select throws_ok($$select * from romiku_calendar$$,'42501',null,'anonymous calendar reads denied');
select throws_ok($$select * from romiku_workbench$$,'42501',null,'anonymous action center reads denied');
reset role;
select * from finish();
rollback;
