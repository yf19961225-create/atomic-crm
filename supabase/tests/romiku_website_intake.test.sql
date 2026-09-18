-- Transactional intake contract. All fixtures and fault injection roll back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
select has_function('public', 'romiku_submit_website_inquiry', array['jsonb'], 'atomic intake RPC exists');
create temporary table intake_payload as select '{"customerName":"  Original Buyer  ","email":"buyer@example.test","whatsapp":"+57 123","country":"Colombia","message":"Original message","items":[{"sku":"UNKNOWN-SKU","quantity":20,"requirement":"White packaging","extra":"retained"},{"sku":"UNKNOWN-SKU","quantity":1.25,"requirement":""}],"extra":{"source":"website"},"owner_id":"ffffffff-ffff-ffff-ffff-ffffffffffff","status":"processed"}'::jsonb as value;
create temporary table intake_before as select
  (select count(*) from romiku_website_inquiries) as inquiries,
  (select count(*) from romiku_website_inquiry_items) as items,
  (select count(*) from romiku_outbound_companies) as outbound,
  (select count(*) from romiku_formal_customers) as customers,
  (select count(*) from romiku_quotes) as quotes;
grant select on intake_payload, intake_before to service_role, anon, authenticated;
set local role anon;
select throws_ok($$select romiku_submit_website_inquiry('{}')$$,'42501',null,'anon cannot call intake');
reset role;
set local role authenticated;
select throws_ok($$select romiku_submit_website_inquiry('{}')$$,'42501',null,'authenticated cannot call intake');
reset role;
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
create temporary table intake_result as select * from romiku_submit_website_inquiry((select value from intake_payload));
select matches((select document_number from intake_result),'^WI-[0-9]+$','returns generated inquiry number');
select is((select count(*) from romiku_website_inquiries),(select inquiries+1 from intake_before),'one submission creates one header');
select is((select count(*) from romiku_website_inquiry_items),(select items+2 from intake_before),'all original items persisted separately even with duplicate SKU');
select is((select raw_payload from romiku_website_inquiries where id=(select id from intake_result)),(select value from intake_payload),'raw business JSON including unknown fields preserved');
select is((select customer_name from romiku_website_inquiries where id=(select id from intake_result)),'  Original Buyer  ','original customer name is not normalized');
select is((select company from romiku_website_inquiries where id=(select id from intake_result)),null::text,'legacy payload needs no company');
select is((select owner_id from romiku_website_inquiries where id=(select id from intake_result)),null::uuid,'untrusted owner ignored and inquiry unassigned');
select is((select status from romiku_website_inquiries where id=(select id from intake_result)),'new','untrusted status ignored');
select is((select created_by from romiku_website_inquiries where id=(select id from intake_result)),null::uuid,'server intake has no invented user');
select is((select requirement from romiku_website_inquiry_items where inquiry_id=(select id from intake_result) and quantity=20),'White packaging','original item requirement retained');
select lives_ok($$select romiku_submit_website_inquiry((select value from intake_payload))$$,'identical submission accepted again');
select is((select count(*) from romiku_website_inquiries),(select inquiries+2 from intake_before),'repeated submissions remain independent');
select lives_ok($$select romiku_submit_website_inquiry((select value || '{"company":"  Company Original  "}' from intake_payload))$$,'optional company accepted');
select is((select company from romiku_website_inquiries where company='  Company Original  '),'  Company Original  ','company source text preserved');
select is((select count(*) from romiku_outbound_companies),(select outbound from intake_before),'never creates Outbound');
select is((select count(*) from romiku_formal_customers),(select customers from intake_before),'never creates Formal Customer');
select is((select count(*) from romiku_quotes),(select quotes from intake_before),'never creates Quote');
select throws_ok($$update romiku_website_inquiries set raw_payload='{}' where id=(select id from intake_result)$$,'23514',null,'raw payload remains immutable');
select throws_ok($$update romiku_website_inquiry_items set quantity=999 where inquiry_id=(select id from intake_result)$$,'23514',null,'original items remain immutable');
select throws_ok($$select romiku_submit_website_inquiry(null)$$,'22023',null,'SQL null rejected');
select throws_ok($$select romiku_submit_website_inquiry('[]')$$,'22023',null,'array payload rejected');
select throws_ok($$select romiku_submit_website_inquiry((select value - 'email' from intake_payload))$$,'22023',null,'missing required field rejected');
select throws_ok($$select romiku_submit_website_inquiry((select value || '{"customerName":"\t\n"}' from intake_payload))$$,'22023',null,'whitespace-only identity rejected by RPC');
select throws_ok($$select romiku_submit_website_inquiry((select jsonb_set(value,'{items,1,sku}','"\t"') from intake_payload))$$,'22023',null,'whitespace-only SKU rejected by RPC');
select throws_ok($$select romiku_submit_website_inquiry((select value || '{"email":"invalid"}' from intake_payload))$$,'22023',null,'invalid email rejected');
select throws_ok($$select romiku_submit_website_inquiry((select value || '{"company":12}' from intake_payload))$$,'22023',null,'nonstring company rejected');
select throws_ok($$select romiku_submit_website_inquiry((select value || '{"items":[]}' from intake_payload))$$,'22023',null,'empty item list rejected');
select throws_ok($$select romiku_submit_website_inquiry((select jsonb_set(value,'{items,1,quantity}','0') from intake_payload))$$,'22023',null,'zero quantity rejected');
select throws_ok($$select romiku_submit_website_inquiry((select jsonb_set(value,'{items,1,quantity}','0.00001') from intake_payload))$$,'22023',null,'quantity cannot silently round');
select throws_ok($$select romiku_submit_website_inquiry((select jsonb_set(value,'{items,1,quantity}','100000000000000') from intake_payload))$$,'22023',null,'quantity overflow rejected');
select throws_ok($$select romiku_submit_website_inquiry((select jsonb_set(value,'{items,1,quantity}','"1"') from intake_payload))$$,'22023',null,'string quantity rejected');
select throws_ok($$select romiku_submit_website_inquiry((select jsonb_set(value,'{items,1,sku}','" "') from intake_payload))$$,'22023',null,'blank SKU rejected');
select throws_ok($$select romiku_submit_website_inquiry((select jsonb_set(value,'{items,1,requirement}','null') from intake_payload))$$,'22023',null,'requirement must be a string');
select is((select count(*) from romiku_website_inquiries),(select inquiries+3 from intake_before),'invalid submissions leave no headers');
-- Force a real late failure after the header and first item insert. Validation
-- alone cannot establish transaction rollback, so inject an item trigger.
reset role;
create function pg_temp.reject_second_intake_item() returns trigger language plpgsql as $$begin
  if new.quantity=1.25 then raise exception 'injected item failure' using errcode='23514'; end if;
  return new;
end;$$;
create trigger intake_test_failure before insert on romiku_website_inquiry_items for each row execute function pg_temp.reject_second_intake_item();
set local role service_role;
select throws_ok($$select romiku_submit_website_inquiry((select value from intake_payload))$$,'23514','injected item failure','late item failure propagates');
select is((select count(*) from romiku_website_inquiries),(select inquiries+3 from intake_before),'late failure rolls header back');
select is((select count(*) from romiku_website_inquiry_items),(select items+6 from intake_before),'late failure rolls all earlier items back');
reset role;
select * from finish();
rollback;
