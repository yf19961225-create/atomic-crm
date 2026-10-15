begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

insert into auth.users(id,email,raw_user_meta_data)
values ('da100000-0000-0000-0000-000000000001','relation-delete-test@example.test','{}');
insert into public.romiku_suppliers(id,name)
values ('da200000-0000-0000-0000-000000000001','Retained supplier');
insert into public.romiku_product_extensions(id,sku,qty_per_carton)
values ('da300000-0000-0000-0000-000000000001','REL-A',24);
insert into public.romiku_product_suppliers(id,sku,supplier_id)
values
  ('da400000-0000-0000-0000-000000000001','REL-A','da200000-0000-0000-0000-000000000001'),
  ('da400000-0000-0000-0000-000000000002','REL-B','da200000-0000-0000-0000-000000000001');
insert into public.romiku_procurement_cost_history(product_supplier_id,cost,currency,effective_date,source_type)
values ('da400000-0000-0000-0000-000000000002',12.5,'USD','2026-10-15','manual');

select ok(has_function_privilege('authenticated','public.romiku_delete_product_supplier(uuid)','execute'), 'authenticated can call controlled delete');
select ok(not has_function_privilege('anon','public.romiku_delete_product_supplier(uuid)','execute'), 'anon cannot call controlled delete');
select ok(not has_table_privilege('authenticated','public.romiku_product_suppliers','delete'), 'authenticated cannot delete arbitrary relation rows');
select ok(prosecdef and proconfig @> array['search_path=""'], 'controlled delete has fixed search path')
from pg_proc where oid='public.romiku_delete_product_supplier(uuid)'::regprocedure;

set local role authenticated;
select is(romiku_delete_product_supplier('da400000-0000-0000-0000-000000000001')->>'code','UNAUTHENTICATED','missing user rejected');
select set_config('request.jwt.claim.sub','da100000-0000-0000-0000-000000000001',true);
select is(romiku_delete_product_supplier('da400000-0000-0000-0000-000000000002')->>'code','HAS_COST_HISTORY','historical relation blocked');
select ok((romiku_delete_product_supplier('da400000-0000-0000-0000-000000000001')->>'ok')::boolean, 'history-free relation deleted');
reset role;

select ok(not exists(select 1 from public.romiku_product_suppliers where id='da400000-0000-0000-0000-000000000001'), 'only selected relation removed');
select ok(exists(select 1 from public.romiku_product_suppliers where id='da400000-0000-0000-0000-000000000002'), 'other product relation retained');
select ok(exists(select 1 from public.romiku_procurement_cost_history where product_supplier_id='da400000-0000-0000-0000-000000000002'), 'cost history retained');
select ok(exists(select 1 from public.romiku_suppliers where id='da200000-0000-0000-0000-000000000001'), 'supplier master retained');
select is((select qty_per_carton from public.romiku_product_extensions where sku='REL-A'),24::numeric,'product packing default retained');
select * from finish();
rollback;
