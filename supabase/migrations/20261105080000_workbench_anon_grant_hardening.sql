-- Preview-audited least privilege repair; no row, RLS, function or default ACL changes.
-- Execute together with its ledger insertion in one transaction.
DO $hardening$
declare before_acl jsonb; after_acl jsonb;
begin
 if current_user <> 'postgres' or session_user <> 'postgres' then
  raise exception 'WORKBENCH_HARDENING_IDENTITY_MISMATCH';
 end if;
 if exists(select 1 from pg_class where oid in ('public.romiku_orders'::regclass,'public.romiku_document_daily_counters'::regclass) and not relrowsecurity) then
  raise exception 'WORKBENCH_HARDENING_RLS_MISMATCH';
 end if;
 select jsonb_agg(to_jsonb(a) order by a.table_name,a.grantee,a.privilege_type) into before_acl
 from (select c.relname table_name,x.* from pg_class c cross join lateral aclexplode(c.relacl) x
 where c.oid in ('public.romiku_orders'::regclass,'public.romiku_document_daily_counters'::regclass)
 and x.grantee <> 'anon'::regrole) a;
 revoke select,insert,update on public.romiku_orders from anon;
 revoke select,insert,update,delete on public.romiku_document_daily_counters from anon;
 select jsonb_agg(to_jsonb(a) order by a.table_name,a.grantee,a.privilege_type) into after_acl
 from (select c.relname table_name,x.* from pg_class c cross join lateral aclexplode(c.relacl) x
 where c.oid in ('public.romiku_orders'::regclass,'public.romiku_document_daily_counters'::regclass)
 and x.grantee <> 'anon'::regrole) a;
 if before_acl is distinct from after_acl then raise exception 'WORKBENCH_HARDENING_OTHER_ROLE_CHANGED'; end if;
 if has_table_privilege('anon','public.romiku_orders','SELECT,INSERT,UPDATE,DELETE')
 or has_table_privilege('anon','public.romiku_document_daily_counters','SELECT,INSERT,UPDATE,DELETE') then
  raise exception 'WORKBENCH_HARDENING_ANON_STILL_AUTHORIZED';
 end if;
end $hardening$;
