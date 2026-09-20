-- Real PostgreSQL integration tests: removing RLS, snapshot copies, locks or
-- quantity/financial constraints must break these behaviors. Rolled back per run.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
select has_table('public', 'romiku_website_inquiries', 'ROMIKU inbound is independent');
select has_table('public', 'romiku_outbound_companies', 'ROMIKU outbound is independent');
select has_table('public', 'romiku_formal_customers', 'ROMIKU customers are independent');

insert into auth.users(id, email, raw_user_meta_data) values
('10000000-0000-0000-0000-000000000001','romiku-one@example.test','{}'),
('10000000-0000-0000-0000-000000000002','romiku-two@example.test','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
insert into romiku_outbound_companies(id,name) values ('20000000-0000-0000-0000-000000000001','Outbound only');
select is((select owner_id::text from romiku_outbound_companies limit 1),'10000000-0000-0000-0000-000000000001','business owner defaults to actor');
select is((select created_by::text from romiku_outbound_companies limit 1),'10000000-0000-0000-0000-000000000001','created audit actor');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select is((select count(*) from romiku_outbound_companies),1::bigint,'second authenticated user has shared read');
update romiku_outbound_companies set notes='Second user edited', created_by='10000000-0000-0000-0000-000000000002';
select is((select updated_by::text from romiku_outbound_companies limit 1),'10000000-0000-0000-0000-000000000002','shared update audits actual second user');
select is((select created_by::text from romiku_outbound_companies limit 1),'10000000-0000-0000-0000-000000000001','creator cannot be spoofed by update');

insert into romiku_website_inquiries(id,customer_name,email,raw_payload) values
('30000000-0000-0000-0000-000000000001','Inbound','buyer@example.test','{"original":true}');
insert into romiku_website_inquiry_items(id,inquiry_id,sku,quantity,requirement) values
('31000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','SUNS15',100,'White packaging'),
('31000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','UNKNOWN-SKU',20,'Original note');
select is((select owner_id from romiku_website_inquiries limit 1),null::uuid,'inquiry starts unassigned');
select is((select count(*) from romiku_formal_customers),0::bigint,'inbound and outbound never create a customer');
select is((select count(*) from romiku_outbound_companies),1::bigint,'inbound never creates outbound');
select throws_ok($$update romiku_website_inquiry_items set quantity=240 where sku='SUNS15'$$,'23514',null,'original inquiry quantity protected');
select throws_ok($$update romiku_website_inquiries set raw_payload='{}'$$,'23514',null,'raw website payload protected');
select lives_ok($$update romiku_website_inquiry_items set product_snapshot='{"name":"Enriched name"}',match_status='matched' where sku='SUNS15'$$,'enrichment may update independently');
create temporary table test_ids (kind text primary key,id uuid);
insert into test_ids select 'quote', romiku_quote_from_inquiry('30000000-0000-0000-0000-000000000001',array['31000000-0000-0000-0000-000000000001']::uuid[]);
select is((select count(*) from romiku_quote_items),1::bigint,'only confirmed inquiry items copied');
select is((select requirement from romiku_quote_items limit 1),'White packaging','requirement copied');
update romiku_quote_items set quantity=240,unit_price=2,product_snapshot='{"name":"Quoted name"}';
update romiku_quotes set freight=20,discount=10,other_expenses=15,counterparty_snapshot='{"name":"Buyer snapshot"}',bank_snapshot='{"bank":"Historical bank"}';
select is((select total from romiku_quote_totals),505.00::numeric,'total = 480 + 20 + 15 - 10');
select is((select quantity from romiku_website_inquiry_items where sku='SUNS15'),100::numeric,'quote changes never rewrite inquiry');
select is((select status from romiku_website_inquiries limit 1),'new','conversion does not advance inquiry status');
select matches((select document_number from romiku_quotes limit 1),'^Q-[0-9]+$','server generates readable quote number');
select throws_ok($$update romiku_quotes set document_number='Q-FORGED'$$,'23514',null,'document numbers cannot change');
select throws_ok($$insert into romiku_quotes(document_number) values ('FORGED')$$,'23514',null,'clients cannot choose document numbers');
select throws_ok($$select romiku_quote_from_inquiry('30000000-0000-0000-0000-000000000001',array['ffffffff-ffff-ffff-ffff-ffffffffffff']::uuid[])$$,'23514',null,'invalid selection fails atomically');
select is((select count(*) from romiku_quotes),1::bigint,'failed conversion leaves no partial document');

insert into test_ids select 'pi',romiku_convert_document('quote',(select id from test_ids where kind='quote'),'pi');
insert into test_ids select 'order',romiku_convert_document('pi',(select id from test_ids where kind='pi'),'order');
insert into test_ids select 'direct_order',romiku_convert_document('quote',(select id from test_ids where kind='quote'),'order');
select is((select total from romiku_pi_totals),505.00::numeric,'PI financial inputs copied');
select is((select total from romiku_order_totals where id=(select id from test_ids where kind='order')),505.00::numeric,'order financial inputs copied');
update romiku_quote_items set product_snapshot='{"name":"Later quote edit"}',quantity=999;
select is((select product_snapshot->>'name' from romiku_pi_items limit 1),'Quoted name','PI has independent product snapshot');
update romiku_pi_items set quantity=888,product_snapshot='{"name":"Later PI edit"}';
select is((select quantity from romiku_order_items where order_id=(select id from test_ids where kind='order')),240::numeric,'order item snapshot independent from PI');
select is((select product_snapshot->>'name' from romiku_order_items where order_id=(select id from test_ids where kind='direct_order')),'Quoted name','direct Quote to Order snapshot independent');
select is((select bank_snapshot->>'bank' from romiku_orders where id=(select id from test_ids where kind='order')),'Historical bank','bank snapshot copied');
select is((select count(*) from romiku_formal_customers),0::bigint,'all conversions leave customer archive unchanged');
select is((select status from romiku_quotes limit 1),'draft','source quote status remains manual');

insert into romiku_suppliers(id,name) values ('40000000-0000-0000-0000-000000000001','Factory A'),('40000000-0000-0000-0000-000000000002','Factory B');
select throws_ok($$insert into romiku_production_orders(order_id) select id from test_ids where kind='order'$$,'23502',null,'production must have exactly one supplier');
insert into romiku_production_orders(id,order_id,supplier_id,supplier_snapshot) select '41000000-0000-0000-0000-000000000001',id,'40000000-0000-0000-0000-000000000001','{"name":"Factory A"}' from test_ids where kind='order';
insert into romiku_production_items(production_order_id,order_id,source_order_item_id,sku,quantity,product_snapshot)
select '41000000-0000-0000-0000-000000000001',order_id,id,sku,100,product_snapshot from romiku_order_items where order_id=(select id from test_ids where kind='order');
select throws_ok($$insert into romiku_production_items(production_order_id,order_id,source_order_item_id,sku,quantity) select '41000000-0000-0000-0000-000000000001',order_id,id,sku,10 from romiku_order_items where order_id=(select id from test_ids where kind='direct_order')$$,'23503',null,'production cannot attach another order item');
update romiku_suppliers set name='Changed factory';
select is((select supplier_snapshot->>'name' from romiku_production_orders limit 1),'Factory A','supplier edits never rewrite production snapshot');
insert into romiku_product_suppliers(id,sku,sanity_product_id,supplier_id)
values ('42000000-0000-0000-0000-000000000001','SUNS15','sanity-original','40000000-0000-0000-0000-000000000001');
insert into romiku_procurement_cost_history(product_supplier_id,cost,currency,effective_date,source_type)
values ('42000000-0000-0000-0000-000000000001',12.5,'USD','2026-01-01','supplier_quote');
select throws_ok($$update romiku_product_suppliers set supplier_id='40000000-0000-0000-0000-000000000002' where id='42000000-0000-0000-0000-000000000001'$$,'23514',null,'cost history prevents supplier identity changes');
select throws_ok($$update romiku_product_suppliers set sku='OTHER-SKU' where id='42000000-0000-0000-0000-000000000001'$$,'23514',null,'cost history prevents SKU identity changes');
select throws_ok($$update romiku_product_suppliers set sanity_product_id='sanity-other' where id='42000000-0000-0000-0000-000000000001'$$,'23514',null,'cost history prevents Sanity identity changes');
select is((select p.sku || ':' || p.sanity_product_id || ':' || p.supplier_id::text from romiku_procurement_cost_history h join romiku_product_suppliers p on p.id=h.product_supplier_id),'SUNS15:sanity-original:40000000-0000-0000-0000-000000000001','historical cost still identifies the original product and supplier');
select lives_ok($$update romiku_product_suppliers set notes='Revised lead time notes' where id='42000000-0000-0000-0000-000000000001'$$,'nonidentity supplier attributes remain editable');
select is((select unallocated_quantity from romiku_order_item_remaining where order_id=(select id from test_ids where kind='order')),140::numeric,'active production initially consumes allocation');
update romiku_production_orders set status='cancelled' where id='41000000-0000-0000-0000-000000000001';
select is((select production_quantity from romiku_order_item_remaining where order_id=(select id from test_ids where kind='order')),0::numeric,'cancelled production no longer consumes active allocation');
select is((select unallocated_quantity from romiku_order_item_remaining where order_id=(select id from test_ids where kind='order')),240::numeric,'cancellation restores the full quantity for reallocation');
insert into romiku_production_orders(id,order_id,supplier_id)
select '41000000-0000-0000-0000-000000000002',id,'40000000-0000-0000-0000-000000000002' from test_ids where kind='order';
insert into romiku_production_items(production_order_id,order_id,source_order_item_id,sku,quantity)
select '41000000-0000-0000-0000-000000000002',order_id,id,sku,240 from romiku_order_items where order_id=(select id from test_ids where kind='order');
select is((select unallocated_quantity from romiku_order_item_remaining where order_id=(select id from test_ids where kind='order')),0::numeric,'replacement production uses the released allocation once');
select is((select quantity from romiku_production_items where production_order_id='41000000-0000-0000-0000-000000000001'),100::numeric,'cancelled production remains retained for history');

insert into romiku_packing_lists(id,order_id) select '50000000-0000-0000-0000-000000000001',id from test_ids where kind='order';
insert into romiku_packing_lists(id,order_id) select '50000000-0000-0000-0000-000000000002',id from test_ids where kind='order';
insert into romiku_packing_items(id,packing_list_id,order_id,source_order_item_id,sku,quantity,cartons,length_cm,width_cm,height_cm,carton_weight_kg)
select '51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',order_id,id,sku,100,2,50,40,30,10 from romiku_order_items where order_id=(select id from test_ids where kind='order');
select is((select remaining_quantity from romiku_order_item_remaining where order_id=(select id from test_ids where kind='order')),140::numeric,'partial shipment leaves 140');
select throws_ok($$insert into romiku_packing_items(packing_list_id,order_id,source_order_item_id,sku,quantity) select '50000000-0000-0000-0000-000000000002',order_id,id,sku,141 from romiku_order_items where order_id=(select id from test_ids where kind='order')$$,'23514',null,'cannot exceed remaining across packing lists');
select throws_ok($$update romiku_order_items set quantity=99 where order_id=(select id from test_ids where kind='order')$$,'23514',null,'cannot reduce ordered quantity below already packed');
insert into romiku_packing_items(packing_list_id,order_id,source_order_item_id,sku,quantity) select '50000000-0000-0000-0000-000000000002',order_id,id,sku,140 from romiku_order_items where order_id=(select id from test_ids where kind='order');
select is((select remaining_quantity from romiku_order_item_remaining where order_id=(select id from test_ids where kind='order')),0::numeric,'second partial shipment uses remaining');
select throws_ok($$update romiku_packing_items set quantity=101 where id='51000000-0000-0000-0000-000000000001'$$,'23514',null,'packing updates also enforce cap');
select is((select quantity from romiku_order_items where order_id=(select id from test_ids where kind='order')),240::numeric,'packing never changes order quantity');
select is((select total_cbm from romiku_packing_totals where id='50000000-0000-0000-0000-000000000001'),0.12::numeric,'CBM derived with cm to cubic metre conversion');
select is((select total_weight_kg from romiku_packing_totals where id='50000000-0000-0000-0000-000000000001'),20::numeric,'weight uses carton count');

insert into romiku_payments(id,order_id,kind,amount)
select '52000000-0000-0000-0000-000000000001',id,'deposit',100
from test_ids where kind='order';
select is(
  (select payment_account from romiku_payments where id='52000000-0000-0000-0000-000000000001'),
  null::text,
  'historical payment account remains nullable'
);
select is(
  (select payment_reference from romiku_payments where id='52000000-0000-0000-0000-000000000001'),
  null::text,
  'historical payment reference remains nullable'
);
select is((select remaining_amount from romiku_order_totals where id=(select id from test_ids where kind='order')),405::numeric,'actual payment reduces receivable');
insert into romiku_payments(order_id,kind,amount,payment_account,payment_reference)
select id,'other',5,'HSBC USD','TT-001' from test_ids where kind='order';
select is(
  (select payment_account from romiku_payments where payment_reference='TT-001'),
  'HSBC USD',
  'payment account is retained on an existing payment record'
);
select is(
  (select payment_reference from romiku_payments where payment_reference='TT-001'),
  'TT-001',
  'payment reference is retained on an existing payment record'
);
select is((select remaining_amount from romiku_order_totals where id=(select id from test_ids where kind='order')),400::numeric,'payment metadata does not change receivable aggregation');
select throws_ok($$update romiku_orders set currency='EUR' where id=(select id from test_ids where kind='order')$$,'23514',null,'orders with payments cannot reinterpret the payment currency');
select is((select currency from romiku_orders where id=(select id from test_ids where kind='order')),'USD','payment remains denominated in its original order currency');
select lives_ok($$update romiku_orders set currency='EUR' where id=(select id from test_ids where kind='direct_order')$$,'unpaid order currency remains editable');
select throws_ok($$update romiku_payments set order_id=(select id from test_ids where kind='direct_order') where order_id=(select id from test_ids where kind='order')$$,'23514',null,'payment cannot move to a different order and currency');
update romiku_outbound_companies set next_follow_up_at=now()-interval '1 day';
select is((select count(*) from romiku_calendar where event_type='outbound_follow_up'),1::bigint,'calendar derives outbound dates');
select is((select count(*) from romiku_workbench where event_type='outbound_follow_up' and is_overdue),1::bigint,'workbench derives overdue work');
update romiku_outbound_companies set next_follow_up_at=null;
select is((select count(*) from romiku_calendar where event_type='outbound_follow_up'),0::bigint,'clearing source date removes calendar entry without duplicate cleanup');
select throws_ok($$insert into romiku_manual_tasks(title,outbound_company_id) values ('invalid','ffffffff-ffff-ffff-ffff-ffffffffffff')$$,'23503',null,'manual task relation references a real CRM record');
select lives_ok($$select romiku_publish_quote_version((select id from test_ids where kind='quote'))$$,'publishing creates retained quote version');
select is((select version from romiku_quote_versions limit 1),1,'first version numbered one');
update romiku_quote_items set notes='Later draft edit';
select is((select items_snapshot->0->>'notes' from romiku_quote_versions limit 1),null::text,'published version isolated from draft edits');
select throws_ok($$update romiku_quote_versions set version=99$$,'42501',null,'business users cannot overwrite published versions');
select throws_ok($$delete from romiku_quotes$$,'42501',null,'core documents must be archived');
insert into romiku_manual_tasks(id,title) values ('60000000-0000-0000-0000-000000000001','Shared task');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select lives_ok($$delete from romiku_manual_tasks where id='60000000-0000-0000-0000-000000000001'$$,'second user can delete an ordinary shared task');
select is((select count(*) from romiku_manual_tasks),0::bigint,'shared CRUD deletes task');
select throws_ok($$insert into romiku_manual_tasks(title,outbound_company_id,quote_id) select 'ambiguous','20000000-0000-0000-0000-000000000001',id from test_ids where kind='quote'$$,'23514',null,'manual task has at most one real relation');
select throws_ok($$update romiku_quotes set other_expenses=-1$$,'23514',null,'negative expenses rejected');
select throws_ok($$select romiku_convert_document('order',(select id from test_ids where kind='order'),'quote')$$,'23514',null,'reverse mutation is not a conversion');
insert into romiku_numbering_rules(document_kind,prefix,min_digits) values ('quote','CUSTOM',4);
insert into romiku_quotes(notes) values ('numbering configuration test');
select matches((select document_number from romiku_quotes where notes='numbering configuration test'),'^CUSTOM-[0-9]+$','first user numbering configuration applied server side');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select lives_ok($$insert into romiku_numbering_rules(document_kind,prefix) values ('pi','TEAM')$$,'second authenticated user can create numbering settings');
update romiku_numbering_rules set prefix='SHARED' where document_kind='quote';
select is((select prefix from romiku_numbering_rules where document_kind='quote'),'SHARED','second authenticated user can update shared numbering settings');
delete from romiku_numbering_rules where document_kind='quote';
select is((select count(*) from romiku_numbering_rules where document_kind='quote'),0::bigint,'second authenticated user can delete shared numbering settings');



reset role;
select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'romiku_%' and c.relkind='r' and not c.relrowsecurity),'RLS enabled on every ROMIKU table');
select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'romiku_%' and c.relkind='v' and not coalesce(c.reloptions @> array['security_invoker=true'],false)),'all ROMIKU derived views use security invoker');
select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'romiku_%' and c.relkind in ('r','v') and has_table_privilege('anon',c.oid,'SELECT')),'anon has no ROMIKU table or view grants');
select ok(not exists(select 1 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'romiku_%' and has_function_privilege('anon',p.oid,'EXECUTE')),'anon has no ROMIKU function execution grants');
set local role anon;
select throws_ok($$select * from romiku_website_inquiries$$,'42501',null,'anon cannot read inbound');
select throws_ok($$select * from romiku_calendar$$,'42501',null,'anon cannot read derived events');
select throws_ok($$select romiku_convert_document('quote','ffffffff-ffff-ffff-ffff-ffffffffffff','pi')$$,'42501',null,'anon cannot invoke conversion RPC');
select throws_ok($$insert into romiku_website_inquiries(customer_name) values ('bad')$$,'42501',null,'anon cannot perform intake');
reset role;
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
insert into romiku_website_inquiries(customer_name,raw_payload) values ('Server intake','{"items":[{"sku":"not-in-sanity","quantity":2}]}');
select is((select owner_id from romiku_website_inquiries where customer_name='Server intake'),null::uuid,'service-role intake stays unassigned');
select is((select created_by from romiku_website_inquiries where customer_name='Server intake'),null::uuid,'service intake does not invent an authenticated actor');
reset role;
select * from finish();
rollback;
