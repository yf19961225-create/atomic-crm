#!/usr/bin/env python3
"""Preparation only. Run after explicit authorization to restore and read Production."""
import argparse,getpass,json,sys,warnings
from pathlib import Path
from urllib.parse import urlparse,unquote
TARGET='vddjodsbmuarshnytyvb'
ROOT=Path(__file__).resolve().parents[2]
def validate_target(value):
    p=urlparse(value)
    if (p.scheme not in ('postgres','postgresql') or unquote(p.username or '')!='postgres.'+TARGET or not p.password or not p.hostname or not p.hostname.endswith('.pooler.supabase.com') or p.port!=5432 or p.path!='/postgres' or p.query or p.fragment):
        raise ValueError('Only the named Production Session Pooler on port 5432 is allowed')
    return TARGET

def compare(expected,actual):
    return {section:{'missing':sorted(set(values)-set(actual.get(section,{}))), 'changed':sorted(k for k,v in values.items() if k in actual.get(section,{}) and v!=actual[section][k]), 'extra':sorted(set(actual.get(section,{}))-set(values))} for section,values in expected.items()}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--authorized-read',action='store_true');parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    if not args.authorized_read or not sys.stdin.isatty() or not sys.stderr.isatty():raise RuntimeError('Explicit authorization and an interactive hidden-input terminal are required')
    with warnings.catch_warnings():
        warnings.simplefilter('error',getpass.GetPassWarning)
        url=getpass.getpass('Production Session Pooler URL (hidden): ')
    validate_target(url);print('Validated Production target: '+TARGET,flush=True)
    import psycopg
    from psycopg import sql
    # Server enforces read-only for every transaction; no migration runner is imported.
    conn=psycopg.connect(url,sslmode='require',connect_timeout=15,options='-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000');url=''
    try:
        if conn.execute("SELECT current_setting('transaction_read_only')").fetchone()[0]!='on':raise RuntimeError('Read-only enforcement missing')
        server_ref=conn.execute("SELECT current_setting('supabase.project_ref',true)").fetchone()[0]
        if server_ref and server_ref!=TARGET:raise RuntimeError('Live project ref mismatch')
        # Pooler username is the authenticated project routing identity when the server setting is absent.
        ledger_exists=conn.execute("SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL").fetchone()[0]
        ledger=[str(r[0]) for r in conn.execute('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version')] if ledger_exists else []
        actual=conn.execute((ROOT/'release/preflight/catalog.sql').read_text()).fetchone()[0]
        expected=json.loads((ROOT/'release/rc/expected-schema.json').read_text())
        inventory=json.loads((ROOT/'release/rc/migration-inventory.json').read_text())
        counts={}
        for name,meta in actual['relations'].items():
            if meta['kind'] in ('r','p'):
                counts[name]=conn.execute(sql.SQL('SELECT count(*) FROM public.{}').format(sql.Identifier(name))).fetchone()[0]
        report={'target_ref':TARGET,'read_only':True,'identity_basis':'authenticated Session Pooler project username','ledger_exists':ledger_exists,'ledger':ledger,'missing_migrations':[r['filename'] for r in inventory if r['version'] not in ledger],'schema_drift':compare(expected,actual),'record_counts':counts,'actual_catalog':actual,'note':'Missing ledger entry is not permission to apply: reconcile drift/manual changes first.'}
        args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,indent=2));args.output.chmod(0o600)
        print('Read-only report saved; no DDL/DML performed.')
    finally:conn.rollback();conn.close()
if __name__=='__main__':
    try:main()
    except Exception as e:print('Preflight stopped: '+type(e).__name__+' (details suppressed; no credentials logged)',file=sys.stderr);sys.exit(1)
