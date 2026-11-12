-- Dedicated UPDATE guard must not trim/reallocate legacy identities.
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
\ir helpers/document_atomic.sql
select no_plan();
insert into auth.users(id,email,raw_user_meta_data) values ('ac270000-0000-0000-0000-000000000099','number-guard@example.test','{}');
-- Historical fixture setup only, privileged and transaction rolled back.
alter table romiku_quotes disable trigger romiku_number;
alter table romiku_pis disable trigger romiku_number;
alter table romiku_orders disable trigger romiku_number;
insert into romiku_quotes(id,document_number) values ('ac270000-0000-0000-0000-000000000001',' Legacy RFQ 1234567890 ');
insert into romiku_pis(id,document_number) values ('ac270000-0000-0000-0000-000000000002',' Legacy PI 1234567890 ');
insert into romiku_orders(id,document_number) values ('ac270000-0000-0000-0000-000000000003',' Legacy OD 1234567890 ');
alter table romiku_quotes enable trigger romiku_number;
alter table romiku_pis enable trigger romiku_number;
alter table romiku_orders enable trigger romiku_number;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ac270000-0000-0000-0000-000000000099',true);
-- Fixture arrangement under the local test owner; public writes are tested through the atomic RPC.
RESET ROLE;

update romiku_quotes set document_name='Name' where id='ac270000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

-- Fixture arrangement under the local test owner; public writes are tested through the atomic RPC.
RESET ROLE;

update romiku_pis set document_name='Name' where id='ac270000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;

-- Fixture arrangement under the local test owner; public writes are tested through the atomic RPC.
RESET ROLE;

update romiku_orders set document_name='Name' where id='ac270000-0000-0000-0000-000000000003';
SET LOCAL ROLE authenticated;

select is((select document_number from romiku_quotes where id='ac270000-0000-0000-0000-000000000001'),' Legacy RFQ 1234567890 ','legacy Quote verbatim');
select is((select document_number from romiku_pis where id='ac270000-0000-0000-0000-000000000002'),' Legacy PI 1234567890 ','legacy PI verbatim');
select is((select document_number from romiku_orders where id='ac270000-0000-0000-0000-000000000003'),' Legacy OD 1234567890 ','legacy Order verbatim');
select throws_ok($$update romiku_quotes set document_number=btrim(document_number) where id='ac270000-0000-0000-0000-000000000001'$$,'42501',null,'even normalization of existing number blocked');
select throws_ok($$update romiku_pis set document_number=null where id='ac270000-0000-0000-0000-000000000002'$$,'42501',null,'NULL replacement blocked');
select throws_ok($$update romiku_orders set document_number='' where id='ac270000-0000-0000-0000-000000000003'$$,'42501',null,'blank replacement blocked');
select lives_ok($$select pg_temp.document_patch('order','ac270000-0000-0000-0000-000000000003','{"document_name":null}')$$,'atomic name clear leaves existing number untouched');
select * from finish();
rollback;
