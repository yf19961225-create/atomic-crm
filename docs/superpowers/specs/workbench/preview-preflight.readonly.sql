-- READ ONLY. Intended ONLY for ciwaibtotispazfviims after checking project identity.
-- No migration execution, no business rows or credentials returned.
begin read only;
-- Required again before executing the revised M2; these are queries, never grants.
select session_user,current_user,current_database(),current_setting('server_version'),
 current_setting('transaction_read_only'),current_setting('createrole_self_grant',true);
select datname,pg_get_userbyid(datdba) as owner from pg_database where datname=current_database();
select rolname,rolsuper,rolcreaterole,rolinherit,rolbypassrls,rolcanlogin from pg_roles
where rolname in ('postgres','romiku_workbench_executor');
select pg_get_userbyid(roleid) as role,pg_get_userbyid(member) as member,
 pg_get_userbyid(grantor) as grantor,admin_option,inherit_option,set_option
from pg_auth_members where member='postgres'::regrole
 or roleid in (select oid from pg_roles where rolname='romiku_workbench_executor')
order by 1,2,3;
select nspname,pg_get_userbyid(nspowner) as owner,nspacl,
 has_schema_privilege(current_user,oid,'CREATE') as caller_create
from pg_namespace where nspname in ('public','auth');
select count(*) as ledger_count,array_agg(version order by version) as ledger_versions from supabase_migrations.schema_migrations;
select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns
where table_schema='public' and table_name in ('romiku_orders','romiku_order_items','romiku_payments','romiku_production_orders','sales') order by table_name,ordinal_position;
select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('romiku_orders','romiku_order_items','romiku_payments','romiku_production_orders','sales');
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename in ('romiku_orders','romiku_order_items','romiku_payments','romiku_production_orders','sales') order by tablename,policyname;
select p.oid::regprocedure::text as signature,p.prosecdef,p.proconfig,p.proacl,
 md5(pg_get_functiondef(p.oid)) as definition_md5,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('romiku_save_production_workspace','romiku_void_payment','romiku_delete_record','romiku_convert_document') order by signature;
select c.relname,t.tgname,pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal and c.relname in ('romiku_orders','romiku_order_items','romiku_payments','romiku_production_orders') order by c.relname,t.tgname;
select c.relname,con.conname,pg_get_constraintdef(con.oid) from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('romiku_orders','romiku_order_items','romiku_payments','romiku_production_orders');
select to_regclass('public.romiku_workbench_requests') as new_requests,to_regclass('public.romiku_order_collection_state') as new_collection,to_regclass('public.romiku_production_due_state') as new_due;
select rolname,rolcanlogin,rolbypassrls from pg_roles where rolname='romiku_workbench_executor';
select pubname,schemaname,tablename from pg_publication_tables where pubname='supabase_realtime' order by schemaname,tablename;
select count(*) filter(where not disabled) as active_crm_users,count(*) filter(where disabled) as disabled_crm_users from public.sales;
select 'orders' as entity,count(*) as rows,md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by id),'')) as content_md5 from public.romiku_orders t
union all select 'items',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by id),'')) from public.romiku_order_items t
union all select 'payments',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by id),'')) from public.romiku_payments t
union all select 'production',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by id),'')) from public.romiku_production_orders t;
rollback;
