#!/usr/bin/env python3
"""Local-only ownership regression. Requires an isolated restored baseline.
No remote URLs; refuses networked containers. Migration executor is postgres,
not the bootstrap superuser used to create/drop disposable test databases.
"""
import json, pathlib, subprocess, uuid
C = 'romiku-preview-owner-fix-20261104'
BASE = 'owner_baseline'
DB = 'owner_test_' + uuid.uuid4().hex[:12]
ROOT = pathlib.Path(__file__).resolve().parents[1]
M1 = (ROOT/'migrations/20261104100000_workbench_state_and_audit.sql').read_text()
M2 = (ROOT/'migrations/20261104110000_workbench_actions_and_invalidation.sql').read_text()
def run(q, db=DB, user='postgres', check=True):
    p = subprocess.run(['docker','exec','-i',C,'psql','-X','-h','/restore','-U',user,'-d',db,'-v','ON_ERROR_STOP=1','-At'],input=q,text=True,capture_output=True,timeout=60)
    if check and p.returncode: raise RuntimeError(p.stderr[-1200:])
    return p
info=json.loads(subprocess.check_output(['docker','inspect',C]))[0]
assert info['HostConfig']['NetworkMode']=='none' and not info['HostConfig']['PortBindings']
assert run("select count(*) from pg_roles where rolname='romiku_workbench_executor'",BASE).stdout.strip()=='0'
created=False
try:
    run('CREATE DATABASE '+DB+' WITH TEMPLATE '+BASE+' OWNER postgres;', 'postgres','supabase_admin'); created=True
    assert run("select current_user=session_user and current_user='postgres' and not rolsuper and rolcreaterole from pg_roles where rolname=current_user").stdout.strip()=='t'
    run('BEGIN;\n'+M1+'\nCOMMIT;')
    membership="select pg_get_userbyid(grantor),admin_option,inherit_option,set_option from pg_auth_members where roleid='romiku_workbench_executor'::regrole and member='postgres'::regrole order by 1"
    before=run(membership).stdout
    assert before.strip()=='supabase_admin|t|f|f'
    # Inject failure after each actual owner transfer; transaction must undo DDL AND grants.
    needle=' owner to romiku_workbench_executor;'
    offsets=[]; start=0
    while (at:=M2.find(needle,start))>=0:
        offsets.append(at+len(needle)); start=at+len(needle)
    assert len(offsets)==4
    for end in offsets:
        p=run("BEGIN;\n"+M2[:end]+"\nDO $$ BEGIN RAISE EXCEPTION 'QA_OWNER_FAILURE'; END $$;",check=False)
        assert p.returncode!=0 and 'QA_OWNER_FAILURE' in p.stderr, p.stderr[-1000:]
        assert run(membership).stdout==before
        assert run("select has_schema_privilege('romiku_workbench_executor','public','CREATE')").stdout.strip()=='f'
        assert run("select to_regprocedure('public.romiku_workbench_action(text,uuid,bigint,uuid,jsonb,text)') is null").stdout.strip()=='t'
    print('4 injected failures: transaction and grants rollback PASS')
    run('BEGIN;\n'+M2+'\nCOMMIT;')
    assert run(membership).stdout==before
    assert run("select pg_has_role('postgres','romiku_workbench_executor','SET'),pg_has_role('postgres','romiku_workbench_executor','USAGE'),has_schema_privilege('romiku_workbench_executor','public','CREATE')").stdout.strip()=='f|f|f'
    assert run("select count(*) from pg_proc where proname in ('romiku_workbench_action','romiku_wb_invalidate','romiku_wb_financial_change','romiku_wb_source_deleted') and proowner='romiku_workbench_executor'::regrole").stdout.strip()=='4'
    assert run("select rolcanlogin or rolsuper or rolbypassrls from pg_roles where rolname='romiku_workbench_executor'").stdout.strip()=='f'
    assert run("select pg_has_role('authenticated','romiku_workbench_executor','MEMBER') or pg_has_role('anon','romiku_workbench_executor','MEMBER')").stdout.strip()=='f'
    print('M1/M2 non-superuser migration; owners; temporary permissions; original admin grant: PASS')
finally:
    if created:
        run('DROP DATABASE '+DB+';', 'postgres','supabase_admin')
        run('DROP ROLE IF EXISTS romiku_workbench_executor;', 'postgres','supabase_admin')
