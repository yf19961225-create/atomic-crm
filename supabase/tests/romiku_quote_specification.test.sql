begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values('de710000-0000-0000-0000-000000000001','spec-normalization@test.example');
set local role authenticated;
select set_config('request.jwt.claim.sub','de710000-0000-0000-0000-000000000001',true);
create temporary table spec_cases(n integer,raw text,expected text);
insert into spec_cases values
(1,E'Specifications: 48W\n24LEDS',E'48W\n24LEDS'),
(2,' specification : 5MM ','5MM'),(3,'Specs: Rechargeable','Rechargeable'),
(4,'48W 24LEDS','48W 24LEDS'),(5,'Special Specifications: ABC','Special Specifications: ABC'),
(6,'Product Specifications: ABC','Product Specifications: ABC'),(7,null,null),(8,'',''),
(9,E'\tSpEcIfIcAtIoNs\t:  First\n  Second\t',E'First\n  Second');
create temporary table spec_ids as select gen_random_uuid() inquiry;
insert into romiku_website_inquiries(id,customer_name,email,raw_payload) select inquiry,'Specification QA','spec@test.example','{"preserve":true}' from spec_ids;
insert into romiku_website_inquiry_items(inquiry_id,sku,quantity,position,product_snapshot)
select inquiry,'SPEC-'||n,120,n,jsonb_build_object('name','Saved product','specification',raw,'unit','PCS','cartonQty',24) from spec_cases cross join spec_ids;
create temporary table spec_before as select id,product_snapshot from romiku_website_inquiry_items where inquiry_id=(select inquiry from spec_ids);
create temporary table spec_quote as select romiku_quote_from_inquiry((select inquiry from spec_ids),array(select id from romiku_website_inquiry_items where inquiry_id=(select inquiry from spec_ids) order by position)) id;
select is((select product_snapshot->>'specification' from romiku_quote_items where quote_id=(select id from spec_quote) and position=n),expected,'new Quote saved normalized specification case '||n) from spec_cases order by n;
select is((select count(*) from romiku_website_inquiry_items i join spec_before b using(id) where i.product_snapshot=b.product_snapshot),9::bigint,'original Inquiry snapshots unchanged');
select is((select count(*) from romiku_quote_items where quote_id=(select id from spec_quote) and quantity=120 and requested_quantity_snapshot=120 and product_snapshot->>'unit'='PCS' and packing_snapshot->>'qty_per_carton'='24'),9::bigint,'quantity, saved request quantity, unit and packing remain unchanged');
select is((select source_website_inquiry_id from romiku_quotes where id=(select id from spec_quote)),(select inquiry from spec_ids),'Quote provenance preserved');
select throws_ok($$select romiku_quote_from_inquiry((select inquiry from spec_ids),array[]::uuid[])$$,'23514',null,'invalid selection remains rejected atomically');
select is((select count(*) from romiku_quotes where source_website_inquiry_id=(select inquiry from spec_ids)),1::bigint,'invalid conversion does not create an extra Quote');
reset role;
select * from finish();
rollback;
