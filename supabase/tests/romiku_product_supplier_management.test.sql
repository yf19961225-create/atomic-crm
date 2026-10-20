begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

select ok(to_regprocedure('public.romiku_save_product_supplier(uuid,text,numeric,integer,boolean,numeric,numeric,numeric,numeric,numeric,date,text)') is not null,
  'procurement edit has a controlled function');
select ok(to_regprocedure('public.romiku_replace_product_supplier(uuid,uuid,boolean)') is not null,
  'supplier replacement has a controlled function');
select ok(to_regprocedure('public.romiku_delete_product_supplier(uuid)') is not null,
  'relation deletion has a controlled function');
select ok(not has_table_privilege('authenticated','public.romiku_product_suppliers','DELETE'),
  'authenticated cannot directly delete a product supplier relation');
select ok(not has_function_privilege('anon','public.romiku_replace_product_supplier(uuid,uuid,boolean)','EXECUTE'),
  'anonymous callers cannot replace product suppliers');

insert into auth.users(id,email,raw_user_meta_data)
values ('de820000-0000-0000-0000-000000000001','product-supplier-management-qa@example.test','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select is(public.romiku_delete_product_supplier(gen_random_uuid())->>'code','UNAUTHENTICATED',
  'a missing session cannot delete a relation');
select set_config('request.jwt.claim.sub','de820000-0000-0000-0000-000000000001',true);

create temporary table supplier_ids(kind text primary key,id uuid default gen_random_uuid());
insert into supplier_ids(kind) values ('source'),('new'),('inactive'),('already'),('empty');
insert into public.romiku_suppliers(id,name)
select id,'QA product supplier ' || kind from supplier_ids;
insert into public.romiku_product_suppliers(sku,sanity_product_id,supplier_id,supplier_item_number,moq,lead_days,active,preferred)
select 'QA-SUPPLIER-MANAGEMENT-NEW','sanity-new',id,'OLD-SKU',24,12,true,true
from supplier_ids where kind='source';
insert into public.romiku_product_suppliers(sku,sanity_product_id,supplier_id,supplier_item_number,moq,lead_days,active,preferred)
select 'QA-SUPPLIER-MANAGEMENT-INACTIVE','sanity-inactive',id,'OLD-INACTIVE',10,7,true,false
from supplier_ids where kind='source';
insert into public.romiku_product_suppliers(sku,sanity_product_id,supplier_id,supplier_item_number,moq,lead_days,active,preferred)
select 'QA-SUPPLIER-MANAGEMENT-INACTIVE','sanity-inactive',id,'TARGET-HISTORY',5,3,false,false
from supplier_ids where kind='inactive';
insert into public.romiku_product_suppliers(sku,sanity_product_id,supplier_id,active,preferred)
select 'QA-SUPPLIER-MANAGEMENT-ALREADY','sanity-already',id,true,false
from supplier_ids where kind in ('source','already');
insert into public.romiku_product_suppliers(sku,sanity_product_id,supplier_id,active)
select 'QA-SUPPLIER-MANAGEMENT-DELETE','sanity-delete',id,true
from supplier_ids where kind='empty';
insert into public.romiku_procurement_cost_history(product_supplier_id,cost,currency,effective_date,source_type)
select id,11,'USD',date '2026-10-20','manual' from public.romiku_product_suppliers
where sku='QA-SUPPLIER-MANAGEMENT-NEW';
insert into public.romiku_procurement_cost_history(product_supplier_id,cost,currency,effective_date,source_type)
select id,9,'USD',date '2026-10-20','manual' from public.romiku_product_suppliers
where sku='QA-SUPPLIER-MANAGEMENT-INACTIVE' and active=false;

select throws_ok($$update public.romiku_product_suppliers
set supplier_id=(select id from supplier_ids where kind='new')
where sku='QA-SUPPLIER-MANAGEMENT-INACTIVE' and active=true$$,
  '23514',null,'relation identity is immutable even without cost history');
select throws_ok($$delete from public.romiku_product_suppliers where false$$,
  '42501',null,'direct authenticated delete is denied');

select is(public.romiku_save_product_supplier(
  (select id from public.romiku_product_suppliers where sku='QA-SUPPLIER-MANAGEMENT-NEW'),
  'EDITED',30,14,true,null,null,null,null,null,null,null)->>'ok','true',
  'procurement edit succeeds through controlled RPC');
select is((select count(*) from public.romiku_product_suppliers where sku='QA-SUPPLIER-MANAGEMENT-NEW'),
  1::bigint,'edit does not create a second relation');
select is((select supplier_item_number from public.romiku_product_suppliers where sku='QA-SUPPLIER-MANAGEMENT-NEW'),
  'EDITED','edit changes only procurement data');

select is(public.romiku_replace_product_supplier(
  (select id from public.romiku_product_suppliers where sku='QA-SUPPLIER-MANAGEMENT-ALREADY'
    and supplier_id=(select id from supplier_ids where kind='source')),
  (select id from supplier_ids where kind='already'),false)->>'code',
  'ALREADY_LINKED','active target blocks replacement');
select is((select count(*) from public.romiku_product_suppliers where sku='QA-SUPPLIER-MANAGEMENT-ALREADY' and active),
  2::bigint,'blocked replacement leaves both rows unchanged');

select is(public.romiku_replace_product_supplier(
  (select id from public.romiku_product_suppliers where sku='QA-SUPPLIER-MANAGEMENT-NEW'),
  (select id from supplier_ids where kind='new'),false)->>'ok','true',
  'replacement to a new supplier succeeds');
select is((select count(*) from public.romiku_product_suppliers where sku='QA-SUPPLIER-MANAGEMENT-NEW' and active),
  1::bigint,'new target is sole active relation after replacement');
select is((select count(*) from public.romiku_procurement_cost_history h
  join public.romiku_product_suppliers r on r.id=h.product_supplier_id
  where r.sku='QA-SUPPLIER-MANAGEMENT-NEW' and r.active=false),
  1::bigint,'source cost remains on inactive source relation');
select is((select supplier_item_number from public.romiku_product_suppliers
  where sku='QA-SUPPLIER-MANAGEMENT-NEW' and active),null::text,
  'new supplier does not inherit old supplier item number');
select is((select count(*) from public.romiku_product_suppliers
  where sku='QA-SUPPLIER-MANAGEMENT-NEW' and active and preferred),
  1::bigint,'source preferred status transfers to new target');

select is(public.romiku_replace_product_supplier(
  (select id from public.romiku_product_suppliers where sku='QA-SUPPLIER-MANAGEMENT-INACTIVE' and active),
  (select id from supplier_ids where kind='inactive'),false)->>'reactivated','true',
  'historic inactive relation is reactivated');
select is((select supplier_item_number from public.romiku_product_suppliers
  where sku='QA-SUPPLIER-MANAGEMENT-INACTIVE' and active),
  'TARGET-HISTORY','reactivated relation retains its own procurement fields');
select is((select count(*) from public.romiku_procurement_cost_history h
  join public.romiku_product_suppliers r on r.id=h.product_supplier_id
  where r.sku='QA-SUPPLIER-MANAGEMENT-INACTIVE' and r.active),
  1::bigint,'reactivated target retains its own cost history');

select is(public.romiku_delete_product_supplier(
  (select id from public.romiku_product_suppliers where sku='QA-SUPPLIER-MANAGEMENT-NEW' and active=false)
  )->>'code','HAS_COST_HISTORY','cost history blocks relation deletion');
select is((select count(*) from public.romiku_product_suppliers where sku='QA-SUPPLIER-MANAGEMENT-NEW'),
  2::bigint,'blocked deletion retains the source relation');
select is(public.romiku_delete_product_supplier(
  (select id from public.romiku_product_suppliers where sku='QA-SUPPLIER-MANAGEMENT-DELETE')
  )->>'ok','true','dependency-free relation can be deleted');
select is((select count(*) from public.romiku_product_suppliers where sku='QA-SUPPLIER-MANAGEMENT-DELETE'),
  0::bigint,'only selected relation is removed');
select is((select count(*) from public.romiku_suppliers where id=(select id from supplier_ids where kind='empty')),
  1::bigint,'Supplier Master survives relation deletion');

select ok(to_regprocedure('public.romiku_preview_bulk_product_suppliers(jsonb,uuid[],uuid)') is not null,
  'bulk plan has a controlled function');
select ok(to_regprocedure('public.romiku_apply_bulk_product_suppliers(jsonb,uuid[],uuid,text)') is not null,
  'bulk apply has a controlled function');
insert into public.romiku_product_suppliers(sku,sanity_product_id,supplier_id,active,preferred,moq)
select 'QA-SUPPLIER-BULK-A','sanity-bulk-a',id,true,true,17
from supplier_ids where kind='source';
insert into public.romiku_product_suppliers(sku,sanity_product_id,supplier_id,active,preferred,moq)
select 'QA-SUPPLIER-BULK-A','sanity-bulk-a',id,false,false,23
from supplier_ids where kind='inactive';
create temporary table bulk_input(products jsonb, supplier_ids uuid[], preferred_id uuid);
insert into bulk_input values (
  '[{"sku":"QA-SUPPLIER-BULK-A","sanity_product_id":"sanity-bulk-a"},
    {"sku":"QA-SUPPLIER-BULK-B","sanity_product_id":"sanity-bulk-b"}]'::jsonb,
  array[(select id from supplier_ids where kind='source'),
        (select id from supplier_ids where kind='inactive')],
  (select id from supplier_ids where kind='inactive'));
select is((public.romiku_preview_bulk_product_suppliers(products,supplier_ids,preferred_id)->>'newCount')::int,
  2,'plan counts genuinely missing relations') from bulk_input;
select is((public.romiku_preview_bulk_product_suppliers(products,supplier_ids,preferred_id)->>'reactivateCount')::int,
  1,'plan counts inactive relation separately') from bulk_input;
select is((public.romiku_preview_bulk_product_suppliers(products,supplier_ids,preferred_id)->>'skipCount')::int,
  1,'plan counts active relation as skipped') from bulk_input;
select is(public.romiku_apply_bulk_product_suppliers(products,supplier_ids,preferred_id,
  public.romiku_preview_bulk_product_suppliers(products,supplier_ids,preferred_id)->>'planToken')->>'ok',
  'true','bulk plan applies atomically') from bulk_input;
select is((select count(*) from public.romiku_product_suppliers where sku like 'QA-SUPPLIER-BULK-%'),
  4::bigint,'two products have two relations each without duplicates');
select is((select moq from public.romiku_product_suppliers
  where sku='QA-SUPPLIER-BULK-A' and supplier_id=(select id from supplier_ids where kind='inactive')),
  23::numeric,'reactivation retains the historic target MOQ');
select is((select count(*) from public.romiku_product_suppliers
  where sku like 'QA-SUPPLIER-BULK-%' and active and preferred),
  2::bigint,'one preferred relation per selected SKU');
select is(public.romiku_apply_bulk_product_suppliers(products,supplier_ids,preferred_id,
  public.romiku_preview_bulk_product_suppliers(products,supplier_ids,preferred_id)->>'planToken')->>'ok',
  'true','repeating bulk apply succeeds idempotently') from bulk_input;
select is((select count(*) from public.romiku_product_suppliers where sku like 'QA-SUPPLIER-BULK-%'),
  4::bigint,'bulk retry produces no duplicate relations');

create temporary table stale_token as
select public.romiku_preview_bulk_product_suppliers(
  '[{"sku":"QA-SUPPLIER-BULK-STALE","sanity_product_id":"sanity-stale"}]'::jsonb,
  array[(select id from supplier_ids where kind='source')],null)->>'planToken' as token;
insert into public.romiku_product_suppliers(sku,sanity_product_id,supplier_id)
select 'QA-SUPPLIER-BULK-STALE','sanity-stale',id from supplier_ids where kind='already';
select is(public.romiku_apply_bulk_product_suppliers(
  '[{"sku":"QA-SUPPLIER-BULK-STALE","sanity_product_id":"sanity-stale"}]'::jsonb,
  array[(select id from supplier_ids where kind='source')],null,(select token from stale_token))->>'code',
  'PREVIEW_STALE','changed relationship invalidates an old plan');
select is((select count(*) from public.romiku_product_suppliers where sku='QA-SUPPLIER-BULK-STALE'),
  1::bigint,'stale plan makes zero writes');
select is((public.romiku_preview_bulk_product_suppliers(
  '[{"sku":"","sanity_product_id":"bad"},{"sku":"QA-DUP","sanity_product_id":"one"},{"sku":"QA-DUP","sanity_product_id":"two"}]'::jsonb,
  array[(select id from supplier_ids where kind='source')],null)->>'validProductCount')::int,
  1,'invalid and duplicate SKU inputs are excluded');
select is(public.romiku_preview_bulk_product_suppliers(
  (select jsonb_agg(jsonb_build_object('sku','SKU-' || n,'sanity_product_id','id-' || n))
   from generate_series(1,51) n),
  array[(select id from supplier_ids where kind='source')],null)->>'code',
  'INVALID_PRODUCT_COUNT','more than one catalog page is rejected');

select * from finish();
rollback;
