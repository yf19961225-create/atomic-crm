begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
select ok(to_regprocedure('public.romiku_list_production_order_groups(text,text,integer,integer,uuid)') is not null,
  'read-only production parent aggregation exists');
select ok(not has_function_privilege('anon','public.romiku_list_production_order_groups(text,text,integer,integer,uuid)','EXECUTE'),'anonymous access denied');
select ok(has_function_privilege('authenticated','public.romiku_list_production_order_groups(text,text,integer,integer,uuid)','EXECUTE'),'authenticated access granted');
select ok((select not prosecdef and provolatile='s' from pg_proc where oid='public.romiku_list_production_order_groups(text,text,integer,integer,uuid)'::regprocedure),'stable security invoker');
insert into auth.users(id,email,raw_user_meta_data) values ('fe260000-0000-0000-0000-000000000001','five-feature-local@example.test','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.romiku_list_production_order_groups()$$,'42501',null,'missing session denied');
select set_config('request.jwt.claim.sub','fe260000-0000-0000-0000-000000000001',true);
insert into public.romiku_suppliers(id,name) values ('fe260000-0000-0000-0000-000000000002','QA GROUP SUPPLIER');
insert into public.romiku_orders(id,counterparty_snapshot,status)
select ('fe261000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
 jsonb_build_object('name','Buyer ' || n),'confirmed' from generate_series(1,4) n;
update public.romiku_orders set document_name='QA-GROUP-' || right(id::text,1);
insert into public.romiku_production_orders(name,order_id,supplier_id,status,factory_due_at,created_at)
select 'QA-A-' || n,'fe261000-0000-0000-0000-000000000001','fe260000-0000-0000-0000-000000000002',
 case when n<=20 then 'scheduled' else 'received' end,'2026-10-31T15:59:59.999Z','2026-10-26'::timestamptz + n * interval '1 minute'
from generate_series(1,65) n;
insert into public.romiku_production_orders(name,order_id,status) values
 ('QA-B-RECEIVED','fe261000-0000-0000-0000-000000000002','received'),
 ('QA-B-CANCELLED','fe261000-0000-0000-0000-000000000002','cancelled'),
 ('QA-C-CANCELLED','fe261000-0000-0000-0000-000000000003','cancelled'),
 ('QA-HIDDEN','fe261000-0000-0000-0000-000000000004','pending_send');
select is(public.romiku_list_production_order_groups('', 'all')->>'total','4','all parents counted');
select is(public.romiku_list_production_order_groups('', 'ongoing')->>'total','2','ongoing includes any pending or scheduled');
select is(public.romiku_list_production_order_groups('', 'received')->>'total','1','received with canceled child retained');
select is(public.romiku_list_production_order_groups('', 'cancelled')->>'total','1','all-canceled separate');
select is(public.romiku_list_production_order_groups((select document_number from public.romiku_production_orders where name='QA-A-1'),'all')->'rows'->0->>'production_count','65','child match aggregates ALL children beyond25');
select is(public.romiku_list_production_order_groups((select document_number from public.romiku_production_orders where name='QA-A-1'),'all')->'rows'->0->>'received_count','45','whole visible history received count');
select is(public.romiku_list_production_order_groups('QA-GROUP-2','all')->'rows'->0->>'effective_count','1','canceled excluded denominator');
select is(public.romiku_list_production_order_groups('QA-GROUP-2','all')->'rows'->0->>'cancelled_count','1','canceled counted separately');
select is(public.romiku_list_production_order_groups('Buyer 3','all')->>'total','1','customer search');
select is(public.romiku_list_production_order_groups('QA GROUP SUPPLIER','all')->>'total','1','supplier search');
select is(jsonb_array_length(public.romiku_list_production_order_groups('', 'all',1,2)->'rows'),2,'parent pagination page size');
select is(public.romiku_list_production_order_groups('', 'all',2,2)->>'total','4','count independent of page');
select is(public.romiku_list_production_order_groups('', 'all',9,2)->'rows','[]'::jsonb,'out of range page empty');
select is(public.romiku_list_production_order_groups('absent','all')->>'total','0','zero result total');
select is(public.romiku_list_production_order_groups('', 'all',1,25,'fe261000-0000-0000-0000-000000000002')->>'total','1','order history filter');
select throws_ok($$select public.romiku_list_production_order_groups('', 'invalid')$$,'22023',null,'view validated');
select throws_ok($$select public.romiku_list_production_order_groups('', 'all',0)$$,'22023',null,'page validated');
select throws_ok($$select public.romiku_list_production_order_groups('', 'all',1,1000)$$,'22023',null,'page size bounded');
select throws_ok($$select public.romiku_list_production_order_groups(repeat('x',201))$$,'22023',null,'search bounded');
reset role;
create temporary table hidden_child as select id,document_number from public.romiku_production_orders where name='QA-HIDDEN';
grant select on hidden_child to authenticated;
alter policy romiku_read on public.romiku_production_orders using(name not in ('QA-HIDDEN','QA-A-30'));
set local role authenticated;
select is(public.romiku_list_production_order_groups('', 'all')->>'total','3','RLS-hidden only-child parent not leaked');
select is(public.romiku_list_production_order_groups((select document_number from public.romiku_production_orders where name='QA-A-1'),'all')->'rows'->0->>'production_count','64','RLS-hidden child excluded counts');
select is(public.romiku_list_production_order_groups((select document_number from hidden_child),'all')->>'total','0','RLS-hidden child not searchable');
select is((select status from public.romiku_orders where document_name='QA-GROUP-1'),'confirmed','order status unchanged');
select is(public.romiku_list_production_order_groups('QA GROUP SUPPLIER','all')->'rows'->0->>'matched_child_count','64','visible matching child count is retained');
select is(jsonb_array_length(public.romiku_list_production_order_groups('QA GROUP SUPPLIER','all')->'rows'->0->'matched_children'),50,'visible search child identities are returned');
reset role;
alter policy romiku_read on public.romiku_orders using(id<>'fe261000-0000-0000-0000-000000000003'::uuid);
alter policy romiku_read on public.romiku_suppliers using(name<>'QA GROUP SUPPLIER');
set local role authenticated;
select is(public.romiku_list_production_order_groups('', 'all')->>'total','2','RLS-hidden parent excluded even when children visible');
select is(public.romiku_list_production_order_groups('Buyer 3','all')->>'total','0','RLS-hidden parent name not searchable');
select is(public.romiku_list_production_order_groups('QA GROUP SUPPLIER','all')->>'total','0','RLS-hidden current supplier name not leaked by search');
explain (analyze,buffers) select public.romiku_list_production_order_groups('', 'all');
select * from finish();
rollback;
