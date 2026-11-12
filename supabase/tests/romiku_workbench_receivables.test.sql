begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
-- Test convenience only: SECURITY INVOKER preserves authenticated RPC/permission checks.
create function pg_temp.save_order(doc uuid, header jsonb default '{}', items jsonb default null) returns jsonb language sql as $$
 select public.romiku_save_document('order',doc,coalesce((select revision from public.romiku_orders where id=doc),0),gen_random_uuid(),header,items)
$$;

insert into auth.users(id,email,raw_user_meta_data) values('eb040000-0000-0000-0000-000000000001','wb-read@example.test','{}');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','eb040000-0000-0000-0000-000000000001',true);
create temporary table cases(label text,id uuid default gen_random_uuid(),percent numeric,paid numeric,phase text,amount numeric);
insert into cases(label,percent,paid,phase,amount) values
 ('no receipt',30,0,'deposit',2211),('partial deposit',30,1000,'deposit',1211),
 ('deposit complete',30,2211,'balance',5159),('balance partial',30,4211,'balance',3159),
 ('fully paid',30,7370,null,null),('prepayment',100,1000,'prepayment',6370),
 ('custom 20',20,1000,'deposit',474),('no deposit',0,1000,'balance',6370);
select pg_temp.save_order(id,jsonb_build_object('status','confirmed','freight',7370,'deposit_percent',percent,'currency','CNY')) from cases;
insert into romiku_payments(order_id,kind,amount) select id,'deposit',least(paid,7370*percent/100) from cases where least(paid,7370*percent/100)>0;
insert into romiku_payments(order_id,kind,amount) select id,'balance',paid-7370*percent/100 from cases where paid>7370*percent/100;
select is(romiku_workbench_verification_list(1,0)->>'total','7','unknown total independent of page size');
select is(jsonb_array_length(romiku_workbench_verification_list(1,1)->'rows'),1,'second page visible');
select is((romiku_workbench_verification_list()->'potential_receivables'->0->>'amount')::numeric,(select sum(7370-paid) from cases),'unknown potential amount sums all pages');
select romiku_workbench_action('customer_confirmation',id,0,gen_random_uuid(),'{"state":"confirmed"}','QA customer') from cases;
select is((select r->>'phase' from jsonb_array_elements(romiku_workbench_receivables()->'rows') r where (r->>'id')::uuid=c.id),c.phase,c.label||' phase') from cases c;
select is((select (r->>'amount')::numeric from jsonb_array_elements(romiku_workbench_receivables()->'rows') r where (r->>'id')::uuid=c.id),c.amount,c.label||' amount') from cases c;
select is(romiku_workbench_receivables()->>'total','7','paid order disappears');
select is((select count(distinct r->>'id')::int from jsonb_array_elements(romiku_workbench_receivables()->'rows') r),7,'one action per UUID');
select pg_temp.save_order(id,'{"status":"draft"}') from cases where label='no receipt';
select is(romiku_workbench_receivables()->>'total','6','draft excluded from normal collection');
select romiku_workbench_action('customer_confirmation',id,1,gen_random_uuid(),'{"state":"unconfirmed"}','QA unconfirmed') from cases where label='custom 20';
select is(romiku_workbench_receivables()->>'total','5','explicit unconfirmed excluded');
select romiku_workbench_action('customer_confirmation',id,1,gen_random_uuid(),'{"state":"unknown"}','QA unknown draft') from cases where label='no receipt';
select is(romiku_workbench_verification_list()->>'total','1','unknown draft stays in actionable verification');
-- Caller-RLS removes both rows and potential-receivables totals.
reset role;
alter policy romiku_read on romiku_orders using(false);
set local role authenticated;
select is(romiku_workbench_verification_list()->>'total','0','verification honors parent visibility');
select is(jsonb_array_length(romiku_workbench_verification_list()->'potential_receivables'),0,'hidden orders not leaked by sum');
reset role;
update public.sales set disabled=true where user_id='eb040000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$select romiku_workbench_receivables()$$,'42501','FORBIDDEN','disabled read RPC denied');
select throws_ok($$select romiku_workbench_verification_list()$$,'42501','FORBIDDEN','disabled verification RPC denied');
select throws_ok($$select romiku_workbench_action('collection_follow_up',gen_random_uuid(),0,gen_random_uuid(),'{"needs_follow_up":true}','QA')$$,'42501','FORBIDDEN','disabled mutation denied');
reset role;
select * from finish();
rollback;
