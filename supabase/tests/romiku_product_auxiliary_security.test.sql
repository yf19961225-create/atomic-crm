begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,raw_user_meta_data) values
 ('ee080000-0000-0000-0000-000000000001','aux-a@example.test','{}'),
 ('ee080000-0000-0000-0000-000000000002','aux-b@example.test','{}'),
 ('ee080000-0000-0000-0000-000000000003','aux-disabled@example.test','{}'),
 ('ee080000-0000-0000-0000-000000000004','aux-outsider@example.test','{}');
insert into sales(user_id,email,administrator,disabled) values
 ('ee080000-0000-0000-0000-000000000001','aux-a@example.test',false,false),
 ('ee080000-0000-0000-0000-000000000002','aux-b@example.test',false,false),
 ('ee080000-0000-0000-0000-000000000003','aux-disabled@example.test',false,true)
 on conflict(user_id) do update set disabled=excluded.disabled;
delete from sales where user_id='ee080000-0000-0000-0000-000000000004';
insert into romiku_suppliers(id,name) values ('ee081000-0000-0000-0000-000000000001','TEST Auxiliary Supplier'),('ee081000-0000-0000-0000-000000000002','TEST Replacement');
insert into romiku_product_extensions(id,sku,internal_notes) values ('ee082000-0000-0000-0000-000000000001','TEST-AUX','original');
insert into romiku_product_suppliers(id,sku,supplier_id,notes) values ('ee083000-0000-0000-0000-000000000001','TEST-AUX','ee081000-0000-0000-0000-000000000001','original');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ee080000-0000-0000-0000-000000000001',true);
select lives_ok($$insert into romiku_product_extensions(sku) values ('TEST-AUX-ACTIVE-1')$$,'active 1: create extension');
select lives_ok($$update romiku_product_extensions set internal_notes='active' where sku='TEST-AUX'$$,'active 1: update extension');
select lives_ok($$insert into romiku_product_suppliers(sku,supplier_id) values ('TEST-AUX-ACTIVE-1','ee081000-0000-0000-0000-000000000001')$$,'active 1: create relation');
select lives_ok($$update romiku_product_suppliers set notes='active' where sku='TEST-AUX'$$,'active 1: update relation');
select lives_ok($$insert into romiku_procurement_cost_history(product_supplier_id,cost,currency,effective_date,source_type) values ('ee083000-0000-0000-0000-000000000001',10,'CNY',date '2026-11-08','manual')$$,'active 1: create cost');
select lives_ok($$delete from romiku_product_extensions where sku='TEST-AUX-ACTIVE-1'$$,'active 1: delete extension');
select is(romiku_save_product_supplier('ee083000-0000-0000-0000-000000000001','active',1,2,false,null,null,null,null,null,null,'active')->>'ok','true','active RPC save');
select set_config('request.jwt.claim.sub','ee080000-0000-0000-0000-000000000002',true);
select lives_ok($$insert into romiku_product_extensions(sku) values ('TEST-AUX-ACTIVE-2')$$,'active 2: create extension');
select lives_ok($$update romiku_product_extensions set internal_notes='active' where sku='TEST-AUX'$$,'active 2: update extension');
select lives_ok($$insert into romiku_product_suppliers(sku,supplier_id) values ('TEST-AUX-ACTIVE-2','ee081000-0000-0000-0000-000000000001')$$,'active 2: create relation');
select lives_ok($$update romiku_product_suppliers set notes='active' where sku='TEST-AUX'$$,'active 2: update relation');
select lives_ok($$insert into romiku_procurement_cost_history(product_supplier_id,cost,currency,effective_date,source_type) values ('ee083000-0000-0000-0000-000000000001',10,'CNY',date '2026-11-08','manual')$$,'active 2: create cost');
select lives_ok($$delete from romiku_product_extensions where sku='TEST-AUX-ACTIVE-2'$$,'active 2: delete extension');
select is(romiku_save_product_supplier('ee083000-0000-0000-0000-000000000001','active',1,2,false,null,null,null,null,null,null,'active')->>'ok','true','active RPC save');
reset role; update romiku_product_extensions set internal_notes='original' where sku='TEST-AUX'; update romiku_product_suppliers set notes='original' where sku='TEST-AUX'; set local role authenticated;
select set_config('request.jwt.claim.sub','ee080000-0000-0000-0000-000000000003',true);
select throws_ok($$insert into romiku_product_extensions(sku) values ('TEST-DENIED')$$,'42501',null,'disabled: extension insert denied');
select throws_ok($$insert into romiku_product_suppliers(sku,supplier_id) values ('TEST-DENIED','ee081000-0000-0000-0000-000000000001')$$,'42501',null,'disabled: relation insert denied');
select throws_ok($$insert into romiku_procurement_cost_history(product_supplier_id,cost,currency,effective_date,source_type) values ('ee083000-0000-0000-0000-000000000001',1,'CNY',current_date,'manual')$$,'42501',null,'disabled: cost insert denied');
with changed as (update romiku_product_extensions set internal_notes='unauthorized' where sku='TEST-AUX' returning 1) select is(count(*),0::bigint,'disabled: romiku_product_extensions update affects no rows') from changed;
with changed as (update romiku_product_suppliers set notes='unauthorized' where sku='TEST-AUX' returning 1) select is(count(*),0::bigint,'disabled: romiku_product_suppliers update affects no rows') from changed;
with changed as (delete from romiku_product_extensions where sku='TEST-AUX' returning 1) select is(count(*),0::bigint,'disabled: extension delete affects no rows') from changed;
select is(romiku_save_product_supplier('ee083000-0000-0000-0000-000000000001','bad',1,2,false,null,null,null,null,null,null,'bad')->>'code','UNAUTHENTICATED','disabled: RPC save denied before data access');
select is(romiku_replace_product_supplier('ee083000-0000-0000-0000-000000000001','ee081000-0000-0000-0000-000000000002',false)->>'code','UNAUTHENTICATED','disabled: RPC replace denied before data access');
select is(romiku_delete_product_supplier('ee083000-0000-0000-0000-000000000001')->>'code','UNAUTHENTICATED','disabled: RPC delete denied before data access');
select is(romiku_preview_bulk_product_suppliers('[]'::jsonb,ARRAY[]::uuid[],null)->>'code','UNAUTHENTICATED','disabled: RPC preview bulk denied before data access');
select is(romiku_apply_bulk_product_suppliers('[]'::jsonb,ARRAY[]::uuid[],null,'invalid')->>'code','UNAUTHENTICATED','disabled: RPC apply bulk denied before data access');
select throws_ok($$delete from romiku_product_suppliers where sku='TEST-AUX'$$,'42501',null,'direct relation delete stays denied');
select throws_ok($$update romiku_procurement_cost_history set cost=0$$,'42501',null,'cost update stays denied');
select throws_ok($$delete from romiku_procurement_cost_history$$,'42501',null,'cost delete stays denied');
select set_config('request.jwt.claim.sub','ee080000-0000-0000-0000-000000000004',true);
select throws_ok($$insert into romiku_product_extensions(sku) values ('TEST-DENIED')$$,'42501',null,'outsider: extension insert denied');
select throws_ok($$insert into romiku_product_suppliers(sku,supplier_id) values ('TEST-DENIED','ee081000-0000-0000-0000-000000000001')$$,'42501',null,'outsider: relation insert denied');
select throws_ok($$insert into romiku_procurement_cost_history(product_supplier_id,cost,currency,effective_date,source_type) values ('ee083000-0000-0000-0000-000000000001',1,'CNY',current_date,'manual')$$,'42501',null,'outsider: cost insert denied');
with changed as (update romiku_product_extensions set internal_notes='unauthorized' where sku='TEST-AUX' returning 1) select is(count(*),0::bigint,'outsider: romiku_product_extensions update affects no rows') from changed;
with changed as (update romiku_product_suppliers set notes='unauthorized' where sku='TEST-AUX' returning 1) select is(count(*),0::bigint,'outsider: romiku_product_suppliers update affects no rows') from changed;
with changed as (delete from romiku_product_extensions where sku='TEST-AUX' returning 1) select is(count(*),0::bigint,'outsider: extension delete affects no rows') from changed;
select is(romiku_save_product_supplier('ee083000-0000-0000-0000-000000000001','bad',1,2,false,null,null,null,null,null,null,'bad')->>'code','UNAUTHENTICATED','outsider: RPC save denied before data access');
select is(romiku_replace_product_supplier('ee083000-0000-0000-0000-000000000001','ee081000-0000-0000-0000-000000000002',false)->>'code','UNAUTHENTICATED','outsider: RPC replace denied before data access');
select is(romiku_delete_product_supplier('ee083000-0000-0000-0000-000000000001')->>'code','UNAUTHENTICATED','outsider: RPC delete denied before data access');
select is(romiku_preview_bulk_product_suppliers('[]'::jsonb,ARRAY[]::uuid[],null)->>'code','UNAUTHENTICATED','outsider: RPC preview bulk denied before data access');
select is(romiku_apply_bulk_product_suppliers('[]'::jsonb,ARRAY[]::uuid[],null,'invalid')->>'code','UNAUTHENTICATED','outsider: RPC apply bulk denied before data access');
select throws_ok($$delete from romiku_product_suppliers where sku='TEST-AUX'$$,'42501',null,'direct relation delete stays denied');
select throws_ok($$update romiku_procurement_cost_history set cost=0$$,'42501',null,'cost update stays denied');
select throws_ok($$delete from romiku_procurement_cost_history$$,'42501',null,'cost delete stays denied');
reset role;
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$insert into romiku_product_extensions default values$$,'42501',null,'anon romiku_product_extensions insert denied');
select throws_ok($$update romiku_product_extensions set id=id$$,'42501',null,'anon romiku_product_extensions update denied');
select throws_ok($$delete from romiku_product_extensions$$,'42501',null,'anon romiku_product_extensions delete denied');
select throws_ok($$insert into romiku_product_suppliers default values$$,'42501',null,'anon romiku_product_suppliers insert denied');
select throws_ok($$update romiku_product_suppliers set id=id$$,'42501',null,'anon romiku_product_suppliers update denied');
select throws_ok($$delete from romiku_product_suppliers$$,'42501',null,'anon romiku_product_suppliers delete denied');
select throws_ok($$insert into romiku_procurement_cost_history default values$$,'42501',null,'anon romiku_procurement_cost_history insert denied');
select throws_ok($$update romiku_procurement_cost_history set id=id$$,'42501',null,'anon romiku_procurement_cost_history update denied');
select throws_ok($$delete from romiku_procurement_cost_history$$,'42501',null,'anon romiku_procurement_cost_history delete denied');
reset role;
select is((select internal_notes from romiku_product_extensions where sku='TEST-AUX'),'original','denied edits preserved extension');
select is((select notes from romiku_product_suppliers where id='ee083000-0000-0000-0000-000000000001'),'original','denied edits preserved relation');
select is((select count(*) from romiku_procurement_cost_history where product_supplier_id='ee083000-0000-0000-0000-000000000001'),2::bigint,'cost history unchanged by denied writes');
set local role service_role;
select lives_ok($$insert into romiku_product_extensions(sku) values ('TEST-AUX-SERVICE')$$,'existing trusted service role write remains available');
reset role;
select * from finish();
rollback;
