-- Security regression: inactive CRM identities must never mutate business records.
-- Run only in an isolated local DB; fixtures and all writes are rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
\ir helpers/document_atomic.sql
select no_plan();
create function pg_temp.attempt(q text) returns text language plpgsql as $$
declare n bigint;
begin execute q; get diagnostics n=row_count; return 'allowed:'||n;
exception when insufficient_privilege then return 'denied';
end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('ee091111-0000-0000-0000-000000000001','health-disabled@example.test','{}'),
 ('ee091111-0000-0000-0000-000000000002','health-outsider@example.test','{}');
insert into sales(user_id,email,administrator,disabled) values ('ee091111-0000-0000-0000-000000000001','health-disabled@example.test',false,true)
 on conflict(user_id) do update set disabled=true;
delete from sales where user_id='ee091111-0000-0000-0000-000000000002';
insert into romiku_orders(id) values ('ee091111-0000-0000-0000-000000000010');
insert into romiku_quotes(id) values ('ee091111-0000-0000-0000-000000000011');
insert into romiku_pis(id) values ('ee091111-0000-0000-0000-000000000012');
insert into romiku_suppliers(id,name) values ('ee091111-0000-0000-0000-000000000013','TEST HEALTH');
insert into romiku_production_orders(id,order_id) values ('ee091111-0000-0000-0000-000000000014','ee091111-0000-0000-0000-000000000010');
insert into romiku_packing_lists(id) values ('ee091111-0000-0000-0000-000000000015');
insert into romiku_website_inquiries(id,customer_name) values ('ee091111-0000-0000-0000-000000000016','TEST HEALTH');
insert into romiku_quote_items(id,quote_id,sku,quantity) select v::uuid,'ee091111-0000-0000-0000-000000000011','TEST HEALTH',1 from unnest(array['ee091111-0000-0000-0000-000000000001','ee091111-0000-0000-0000-000000000002']) v;
create temporary table hp_cases(label text,q text);
insert into hp_cases values
 ('quote item INSERT','insert into romiku_quote_items(quote_id,sku,quantity) values (''ee091111-0000-0000-0000-000000000011'',''TEST HEALTH'',1)'),
 ('quote item UPDATE','update romiku_quote_items set unit_price=2 where id=auth.uid()'),
 ('quote item DELETE','delete from romiku_quote_items where id=auth.uid()'),
 ('order INSERT','insert into romiku_orders default values'),
 ('quote INSERT','insert into romiku_quotes default values'),
 ('PI INSERT','insert into romiku_pis default values'),
 ('supplier INSERT','insert into romiku_suppliers(name) values (''TEST HEALTH blocked'')'),
 ('packing INSERT','insert into romiku_packing_lists default values'),
 ('inquiry INSERT','insert into romiku_website_inquiries(customer_name) values (''TEST HEALTH'')'),
 ('payment INSERT','insert into romiku_payments(order_id,kind,amount) values (''ee091111-0000-0000-0000-000000000010'',''deposit'',1)'),
 ('production INSERT','insert into romiku_production_orders(order_id) values (''ee091111-0000-0000-0000-000000000010'')'),
 ('product auxiliary INSERT','insert into romiku_product_extensions(sku) values (gen_random_uuid()::text)');
insert into hp_cases select t||' UPDATE',format('update %I set notes=''unauthorized'' where id=%L',t,id) from (values
 ('romiku_orders','ee091111-0000-0000-0000-000000000010'),('romiku_quotes','ee091111-0000-0000-0000-000000000011'),
 ('romiku_pis','ee091111-0000-0000-0000-000000000012'),('romiku_suppliers','ee091111-0000-0000-0000-000000000013'),
 ('romiku_production_orders','ee091111-0000-0000-0000-000000000014'),('romiku_packing_lists','ee091111-0000-0000-0000-000000000015'),
 ('romiku_website_inquiries','ee091111-0000-0000-0000-000000000016')) s(t,id);
update hp_cases set q=replace(q, $$notes='unauthorized'$$, $$status='pending_contact'$$) where label='romiku_website_inquiries UPDATE';
grant select on hp_cases to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ee091111-0000-0000-0000-000000000001',true);
select is(romiku_wb_active(),false,'disabled is not active');
select ok(pg_temp.attempt(q) in ('denied','allowed:0'),'disabled denied '||label) from hp_cases;
select throws_ok($$select romiku_workbench_action('customer_confirmation','ee091111-0000-0000-0000-000000000010',0,gen_random_uuid(),'{}','test')$$,'42501',null,'disabled workbench action denied');
select throws_ok($$select romiku_batch_status('quote',array['ee091111-0000-0000-0000-000000000011'::uuid],'quoted')$$,'42501',null,'disabled bulk quote UPDATE RPC no success');
select set_config('request.jwt.claim.sub','ee091111-0000-0000-0000-000000000002',true);
select is(romiku_wb_active(),false,'outsider is not active');
select ok(pg_temp.attempt(q) in ('denied','allowed:0'),'outsider denied '||label) from hp_cases;
select throws_ok($$select romiku_batch_status('quote',array['ee091111-0000-0000-0000-000000000011'::uuid],'following_up')$$,'42501',null,'outsider bulk quote UPDATE RPC no success');
select is(romiku_delete_supplier('ee091111-0000-0000-0000-000000000013')->>'ok','false','outsider supplier DELETE RPC denied');
select is(romiku_delete_record('pi','ee091111-0000-0000-0000-000000000012')->>'ok','false','outsider PI DELETE RPC denied');
select set_config('request.jwt.claim.sub','ee091111-0000-0000-0000-000000000001',true);
select is(romiku_delete_supplier('ee091111-0000-0000-0000-000000000013')->>'ok','false','disabled supplier DELETE RPC denied');
select is(romiku_delete_record('pi','ee091111-0000-0000-0000-000000000012')->>'ok','false','disabled PI DELETE RPC denied');
reset role;
-- Positive controls: both existing test identities are now active CRM members.
insert into sales(user_id,email,administrator,disabled) values
 ('ee091111-0000-0000-0000-000000000002','health-outsider@example.test',false,false);
update sales set disabled=false where user_id='ee091111-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','ee091111-0000-0000-0000-000000000001',true);
select is(pg_temp.attempt(q),case when q ~ '(romiku_(orders|quotes|pis|packing_lists|quote_items))' then 'denied' else 'allowed:1' end,'active A legacy write policy '||label) from hp_cases;
select lives_ok(format('select pg_temp.document_patch(%L,%L,''{"notes":"Active A atomic edit"}'')',kind,id),'active A atomic edit '||kind) from (values ('order','ee091111-0000-0000-0000-000000000010'),('quote','ee091111-0000-0000-0000-000000000011'),('pi','ee091111-0000-0000-0000-000000000012'),('packing','ee091111-0000-0000-0000-000000000015')) v(kind,id);
select lives_ok($$select romiku_save_document('quote',gen_random_uuid(),0,gen_random_uuid(),'{}','[{"sku":"Active A","quantity":1}]')$$,'active A atomic creation with line retained');
select lives_ok($$select pg_temp.document_item_patch('quote',auth.uid(),'{"unit_price":2}')$$,'active A atomic item edit retained');
select ok(romiku_wb_manage('order','ee091111-0000-0000-0000-000000000010'),'active A workbench manage retained');
select set_config('request.jwt.claim.sub','ee091111-0000-0000-0000-000000000002',true);
select is(pg_temp.attempt(q),case when q ~ '(romiku_(orders|quotes|pis|packing_lists|quote_items))' then 'denied' else 'allowed:1' end,'active B legacy write policy '||label) from hp_cases;
select lives_ok(format('select pg_temp.document_patch(%L,%L,''{"notes":"Active B atomic edit"}'')',kind,id),'active B atomic edit '||kind) from (values ('order','ee091111-0000-0000-0000-000000000010'),('quote','ee091111-0000-0000-0000-000000000011'),('pi','ee091111-0000-0000-0000-000000000012'),('packing','ee091111-0000-0000-0000-000000000015')) v(kind,id);
select lives_ok($$select romiku_save_document('quote',gen_random_uuid(),0,gen_random_uuid(),'{}','[{"sku":"Active B","quantity":1}]')$$,'active B atomic creation with line retained');
select lives_ok($$select pg_temp.document_item_patch('quote',auth.uid(),'{"unit_price":2}')$$,'active B atomic item edit retained');
select ok(romiku_wb_manage('order','ee091111-0000-0000-0000-000000000010'),'active B workbench manage retained');
select is(romiku_delete_supplier('ee091111-0000-0000-0000-000000000013')->>'ok','true','active supplier DELETE RPC allowed');
select is(romiku_delete_record('pi','ee091111-0000-0000-0000-000000000012')->>'ok','true','active PI DELETE RPC allowed');
reset role;
grant select on hp_cases to anon;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);
select is(pg_temp.attempt(q),'denied','anon denied '||label) from hp_cases;
reset role;
set local role service_role;
select lives_ok($$insert into romiku_quotes default values$$,'service role insert remains permitted');
reset role;
select * from finish();
rollback;
