begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

insert into auth.users(id,email,raw_user_meta_data)
values ('de500000-0000-0000-0000-000000000001','supplier-delete-test@example.test','{}');

select ok(not has_function_privilege('anon','public.romiku_delete_supplier(uuid)','execute'),'anonymous callers cannot delete suppliers');
select ok(not has_table_privilege('authenticated','public.romiku_suppliers','DELETE'),'authenticated callers cannot bypass controlled delete');
select is((select array_agg(conrelid::regclass::text order by conrelid::regclass::text)
  from pg_constraint where contype='f' and confrelid='public.romiku_suppliers'::regclass),
  array['romiku_manual_tasks','romiku_product_suppliers','romiku_production_orders','romiku_supplier_contacts'],
  'dependency audit includes every direct supplier FK');
set local role authenticated;
select is(romiku_delete_supplier(gen_random_uuid())->>'code','UNAUTHENTICATED','delete requires a logged-in user');
select set_config('request.jwt.claim.sub','de500000-0000-0000-0000-000000000001',true);
select is(romiku_delete_supplier(gen_random_uuid())->>'code','NOT_FOUND','missing supplier is safe');
select throws_ok($$delete from public.romiku_suppliers where false$$,'42501',null,'direct supplier delete is denied');

create temporary table supplier_delete_ids(kind text primary key,id uuid default gen_random_uuid());
insert into supplier_delete_ids(kind) values ('empty'),('product'),('production'),('contact'),('task'),('combined'),('order');
insert into romiku_suppliers(id,name)
select id,'QA controlled delete ' || kind from supplier_delete_ids where kind <> 'order';
insert into romiku_orders(id,counterparty_snapshot)
select id,'{"name":"Supplier delete QA buyer"}' from supplier_delete_ids where kind='order';
insert into romiku_product_suppliers(sku,supplier_id)
select 'QA-SUPPLIER-DELETE-' || kind,id from supplier_delete_ids where kind in ('product','combined');
insert into romiku_procurement_cost_history(product_supplier_id,cost,currency,effective_date,source_type)
select id,10,'USD',date '2026-10-19','manual' from romiku_product_suppliers
where sku='QA-SUPPLIER-DELETE-combined';
insert into romiku_production_orders(order_id,supplier_id)
select o.id,s.id from supplier_delete_ids o cross join supplier_delete_ids s
where o.kind='order' and s.kind in ('production','combined');
insert into romiku_supplier_contacts(supplier_id,name)
select id,'QA contact' from supplier_delete_ids where kind in ('contact','combined');
insert into romiku_manual_tasks(supplier_id,title)
select id,'QA task' from supplier_delete_ids where kind in ('task','combined');

select is(romiku_delete_supplier(id)->>'code','HAS_DOWNSTREAM',kind || ' dependency blocks delete')
from supplier_delete_ids where kind in ('product','production','contact','task','combined');
select is(romiku_delete_supplier((select id from supplier_delete_ids where kind='combined'))->'dependencies',
  '{"products":1,"production_orders":1,"contacts":1,"manual_tasks":1}'::jsonb,
  'all four dependency counts are returned');
select is(romiku_delete_supplier((select id from supplier_delete_ids where kind='combined'))->>'message',
  '该供应商已关联 1 个产品、1 张生产单、1 个联系人、1 个手动任务，无法删除。',
  'blocked message names concrete counts');
select is((select count(*) from romiku_suppliers where id in
  (select id from supplier_delete_ids where kind in ('product','production','contact','task','combined'))),
  5::bigint,'all blocked suppliers are retained');
select is((select count(*) from romiku_procurement_cost_history where product_supplier_id in
  (select id from romiku_product_suppliers where sku='QA-SUPPLIER-DELETE-combined')),
  1::bigint,'cost history under a blocked product relation is retained');
reset role;
create function pg_temp.fail_supplier_delete() returns trigger language plpgsql as $$
begin raise exception 'private supplier delete failure'; end $$;
create trigger qa_supplier_delete_failure before delete on romiku_suppliers for each row
when (old.name='QA controlled delete empty') execute function pg_temp.fail_supplier_delete();
set local role authenticated;
select is(romiku_delete_supplier((select id from supplier_delete_ids where kind='empty'))->>'code',
  'DELETE_FAILED','late database failure returns a safe error');
select is((select count(*) from romiku_suppliers where id=(select id from supplier_delete_ids where kind='empty')),
  1::bigint,'late failure leaves supplier intact');
reset role;
drop trigger qa_supplier_delete_failure on romiku_suppliers;
set local role authenticated;
select is(romiku_delete_supplier((select id from supplier_delete_ids where kind='empty'))->>'ok','true','unreferenced supplier is deleted');
select is((select count(*) from romiku_suppliers where id=(select id from supplier_delete_ids where kind='empty')),
  0::bigint,'only the unreferenced supplier was removed');
select * from finish();
rollback;
