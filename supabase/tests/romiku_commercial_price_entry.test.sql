-- Run after the commercial_unit_price_entered migration. All fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

create temporary table price_test_ids (kind text primary key, id uuid);
insert into romiku_quotes(id) values ('c0000000-0000-0000-0000-000000000001');
insert into romiku_quote_items(quote_id,sku,quantity,unit_price,unit_price_entered)
values ('c0000000-0000-0000-0000-000000000001','UNFILLED',1,0,false);
insert into romiku_quote_items(quote_id,sku,quantity,unit_price)
values ('c0000000-0000-0000-0000-000000000001','LEGACY-ZERO',1,0);
insert into romiku_quote_items(quote_id,sku,quantity,unit_price)
values ('c0000000-0000-0000-0000-000000000001','PRICED',2,5.50);

select is((select unit_price_entered from romiku_quote_items where sku='UNFILLED'),false,
  'a new unfilled price is distinct from zero');
select is((select unit_price_entered from romiku_quote_items where sku='LEGACY-ZERO'),true,
  'a legacy zero price retains entered semantics');
select is((select amount from romiku_quote_items where sku='UNFILLED'),0::numeric,
  'unfilled price still contributes zero to the existing amount formula');

insert into price_test_ids
select 'pi',romiku_convert_document('quote','c0000000-0000-0000-0000-000000000001','pi');
insert into price_test_ids
select 'order',romiku_convert_document('pi',(select id from price_test_ids where kind='pi'),'order');
insert into price_test_ids
select 'direct_order',romiku_convert_document('quote','c0000000-0000-0000-0000-000000000001','order');

select is((select unit_price_entered from romiku_pi_items where sku='UNFILLED'),false,
  'Quote to PI retains the blank-price marker');
select is((select unit_price_entered from romiku_order_items where sku='UNFILLED'
  and order_id=(select id from price_test_ids where kind='order')),false,
  'PI to Order retains the blank-price marker');
select is((select unit_price_entered from romiku_order_items where sku='UNFILLED'
  and order_id=(select id from price_test_ids where kind='direct_order')),false,
  'Quote to Order retains the blank-price marker');
select is((select count(*) from romiku_order_items where sku='LEGACY-ZERO' and unit_price_entered),2::bigint,
  'both Order conversion paths retain explicit or historical zero');
select is((select sum(amount) from romiku_pi_items),11::numeric,
  'existing amount calculation remains unchanged');

select * from finish();
rollback;
