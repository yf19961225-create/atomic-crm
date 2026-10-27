-- Local migration rehearsal only: run on a pre-name schema, for BOTH audited
-- function baselines. This transaction never commits schema or fixture data.
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
create temporary table number_functions_before as
select oid,pg_get_functiondef(oid) definition,proacl,proconfig,prosecdef
from pg_proc where oid in ('public.romiku_assign_number()'::regprocedure,
 'public.romiku_next_daily_document_number(text,text)'::regprocedure);
-- Real INSERT numbering probes on a disposable table using the existing trigger.
-- Sequence state is explicitly restored: PostgreSQL sequence changes do not roll back.
create temporary table sequence_before as select last_value,is_called from romiku_document_number_seq;
create temporary table number_probe (document_number text);
create trigger probe_number before insert on number_probe for each row execute function public.romiku_assign_number('packing','PL');
create temporary table number_results (phase text, scenario text, result text);
select setval('public.romiku_document_number_seq',7,false);
insert into number_probe default values;
insert into number_results select 'before','short',document_number from number_probe;
truncate number_probe;
select setval('public.romiku_document_number_seq',1234567890,false);
insert into number_probe default values;
insert into number_results select 'before','long',document_number from number_probe;
truncate number_probe;
select setval('public.romiku_document_number_seq',last_value,is_called) from sequence_before;
insert into romiku_quotes(id,counterparty_snapshot) values ('ac270000-0000-0000-0000-000000000001','{"brand":"Preserved brand"}');
insert into romiku_pis(id,counterparty_snapshot) values ('ac270000-0000-0000-0000-000000000002','{"brand":"Preserved brand"}');
insert into romiku_orders(id,counterparty_snapshot) values ('ac270000-0000-0000-0000-000000000003','{"brand":"Preserved brand"}');
create temporary table views_before as select oid,relacl,reloptions from pg_class where oid in ('romiku_quote_totals'::regclass,'romiku_pi_totals'::regclass,'romiku_order_totals'::regclass);
create temporary table conversion_before as select oid,proacl,proconfig,prosecdef from pg_proc where oid='public.romiku_convert_document(text,uuid,text)'::regprocedure;
create temporary table commercial_before as
select 'quote' kind,id,to_jsonb(t) data from romiku_quotes t
union all select 'pi',id,to_jsonb(t) from romiku_pis t
union all select 'order',id,to_jsonb(t) from romiku_orders t;
\ir ../../migrations/20261026150000_commercial_document_names.sql
select is(pg_get_functiondef(b.oid),b.definition,'number function remains byte-identical: '||b.oid::regprocedure) from number_functions_before b;
select ok(p.proacl is not distinct from b.proacl and p.proconfig is not distinct from b.proconfig and p.prosecdef=b.prosecdef,'number function security unchanged: '||b.oid::regprocedure) from number_functions_before b join pg_proc p on p.oid=b.oid;
select is((select count(*)::int from (select 'quote' kind,id,to_jsonb(t)-'document_name' data from romiku_quotes t union all select 'pi',id,to_jsonb(t)-'document_name' from romiku_pis t union all select 'order',id,to_jsonb(t)-'document_name' from romiku_orders t) a full join commercial_before b using(kind,id) where a.data is distinct from b.data),0,'all existing header data unchanged');
select is((select count(*)::int from pg_trigger where tgname='romiku_number' and tgrelid in ('romiku_quotes'::regclass,'romiku_pis'::regclass,'romiku_orders'::regclass) and tgtype=7),3,'commercial numbering remains BEFORE INSERT only');
select is((select count(*)::int from pg_trigger where tgname='romiku_document_number_immutable' and tgrelid in ('romiku_quotes'::regclass,'romiku_pis'::regclass,'romiku_orders'::regclass) and tgtype=19),3,'separate BEFORE UPDATE guards on exactly three commercial headers');
select setval('public.romiku_document_number_seq',7,false);
insert into number_probe default values;
insert into number_results select 'after','short',document_number from number_probe;
truncate number_probe;
select setval('public.romiku_document_number_seq',1234567890,false);
insert into number_probe default values;
insert into number_results select 'after','long',document_number from number_probe;
select setval('public.romiku_document_number_seq',last_value,is_called) from sequence_before;
select is(a.result,b.result,'existing noncommercial numbering unchanged: '||a.scenario) from number_results a join number_results b using(scenario) where a.phase='after' and b.phase='before';
select ok(v.relacl is not distinct from b.relacl and v.reloptions is not distinct from b.reloptions,'view grants and invoker security retained: '||v.relname) from views_before b join pg_class v on v.oid=b.oid;
select ok(p.proacl is not distinct from b.proacl and p.proconfig is not distinct from b.proconfig and p.prosecdef=b.prosecdef,'converter remains invoker with identical grants and search_path') from conversion_before b join pg_proc p on p.oid=b.oid;
select * from finish();
rollback;
