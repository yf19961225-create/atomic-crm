#!/usr/bin/env python3
"""Local-only exact-owner DDL/rollback rehearsal; never reads remote configuration."""
import argparse,hashlib,json,pathlib,re,subprocess
p=argparse.ArgumentParser();p.add_argument('--database',required=True);p.add_argument('--container',default='romiku-prod-backup-restore-20261106b');p.add_argument('--output',required=True);a=p.parse_args()
if not a.database.startswith('atomic_save_preview_'):raise SystemExit('Only isolated atomic_save_preview_* databases permitted')
out=pathlib.Path(a.output);out.mkdir(parents=True,exist_ok=True)
cmd=['docker','exec','-i',a.container,'psql','-h','/tmp','-U','postgres','-d',a.database,'-X','-Atq','-v','ON_ERROR_STOP=1']
def run(sql,ok=True):
 r=subprocess.run(cmd,input=sql,text=True,capture_output=True,timeout=60)
 if ok and r.returncode:raise AssertionError(r.stderr)
 return r
migration=pathlib.Path('supabase/migrations/20261111120000_document_atomic_save.sql').read_text()
assert run("SELECT to_regclass('public.romiku_document_save_requests') IS NULL;").stdout.strip()=='t'
fingerprint="""CREATE TEMP TABLE atomic_fingerprints(name text,rows bigint,hash text);
DO $$ DECLARE t record; BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LOOP
EXECUTE format('INSERT INTO atomic_fingerprints SELECT %L,count(*),md5(coalesce(string_agg((to_jsonb(t)-''revision'')::text,'''' ORDER BY (to_jsonb(t)-''revision'')::text),'''')) FROM public.%I t',t.tablename,t.tablename);END LOOP;END $$;
SELECT jsonb_object_agg(name,jsonb_build_object('rows',rows,'hash',hash)) FROM atomic_fingerprints;"""
before=json.loads(run(fingerprint).stdout.strip());(out/'business-before.json').write_text(json.dumps(before,indent=2))
role_query="""SELECT jsonb_build_object('memberships',(SELECT jsonb_agg(jsonb_build_object('member',m.rolname,'grantor',g.rolname,'admin',a.admin_option,'inherit',a.inherit_option,'set',a.set_option) ORDER BY m.rolname,g.rolname) FROM pg_auth_members a JOIN pg_roles m ON m.oid=a.member JOIN pg_roles g ON g.oid=a.grantor WHERE a.roleid='romiku_document_executor'::regrole),'postgres_set',pg_has_role('postgres','romiku_document_executor','SET'),'postgres_usage',pg_has_role('postgres','romiku_document_executor','USAGE'),'authenticated_set',pg_has_role('authenticated','romiku_document_executor','SET'),'anon_set',pg_has_role('anon','romiku_document_executor','SET'),'schema_create',has_schema_privilege('romiku_document_executor','public','CREATE'));"""
role_before=json.loads(run(role_query).stdout.strip());(out/'role-before.json').write_text(json.dumps(role_before,indent=2))
probe=migration.replace('romiku_document_executor','romiku_document_owner_probe')
owner_lines=[x for x in probe.splitlines() if x.startswith('ALTER FUNCTION') and 'OWNER TO romiku_document_owner_probe' in x]
failures=[]
for i,line in enumerate(owner_lines,1):
 sql='BEGIN;\n'+probe.replace(line,line+'\nSELECT 1/0;',1)+'\nCOMMIT;'
 r=run(sql,False);(out/f'owner-rollback-{i}.log').write_text(r.stdout+r.stderr)
 assert r.returncode and 'division by zero' in r.stderr,r.stderr
 state=run("SELECT to_regclass('public.romiku_document_save_requests') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='romiku_document_owner_probe');").stdout.strip()
 assert state=='t',state
 assert json.loads(run(role_query).stdout.strip())==role_before
 failures.append({'after_owner_transfer':i,'rolled_back':True,'role_and_temporary_grants_absent':True})
r=run('BEGIN;\n'+probe+"\nSELECT pg_has_role('postgres','romiku_document_owner_probe','SET'),pg_has_role('postgres','romiku_document_owner_probe','USAGE'),has_schema_privilege('romiku_document_owner_probe','public','CREATE');\nROLLBACK;")
(out/'fresh-role-success-rollback.log').write_text(r.stdout+r.stderr)
assert r.stdout.strip().endswith('f|f|f') and not r.stderr,r.stderr
r=run('BEGIN;\n'+migration+'\nCOMMIT;');(out/'migration-apply.log').write_text(r.stdout+r.stderr);assert not r.stderr,r.stderr
role_after=json.loads(run(role_query).stdout.strip());(out/'role-after.json').write_text(json.dumps(role_after,indent=2));assert role_after==role_before
assert all(not role_after[k] for k in ['postgres_set','postgres_usage','authenticated_set','anon_set','schema_create'])
after=json.loads(run(fingerprint).stdout.strip());(out/'business-after.json').write_text(json.dumps(after,indent=2))
assert all(after.get(k)==v for k,v in before.items()),'Business data changed'
assert set(after)-set(before)=={'romiku_document_save_requests'} and after['romiku_document_save_requests']['rows']==0
summary={'database':a.database,'executed_as':'postgres (not superuser)','migration_sha256':hashlib.sha256(migration.encode()).hexdigest(),'business_tables_unchanged':len(before),'new_journal_rows':0,'role_before_equals_after':True,'fresh_role_creation_cleanup_verified':True,'owner_failure_rollbacks':failures}
(out/'rehearsal-summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary,indent=2))
