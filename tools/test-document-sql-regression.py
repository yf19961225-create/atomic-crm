#!/usr/bin/env python3
"""Run transaction-rolled-back SQL regression only in an isolated local Docker DB."""
import argparse,json,pathlib,re,subprocess
p=argparse.ArgumentParser();p.add_argument('--database',required=True);p.add_argument('--container',default='romiku-prod-backup-restore-20261106b');p.add_argument('--output',required=True);a=p.parse_args()
if not a.database.startswith('atomic_save_'):raise SystemExit('Only isolated atomic_save_* databases are allowed')
root=pathlib.Path(__file__).resolve().parents[1];tests=root/'supabase/tests';out=pathlib.Path(a.output);out.mkdir(parents=True,exist_ok=True)
cmd=['docker','exec','-i',a.container,'psql','-X','-h','/tmp','-U','supabase_admin','-d',a.database,'-v','ON_ERROR_STOP=1','-At']
def expand(path):
 text=path.read_text()
 def include(m):
  child=(path.parent/m.group(1)).resolve()
  if not child.is_relative_to(tests):raise RuntimeError('Unexpected SQL include')
  return expand(child)
 return re.sub(r'^\\ir\s+(\S+)\s*$',include,text,flags=re.M)
results=[]
for path in sorted(tests.glob('*.test.sql')):
 sql=expand(path)
 if not re.search(r'^begin;',sql,re.M|re.I) or not re.search(r'(?:^|;)\s*rollback;',sql,re.M|re.I):raise RuntimeError('Test requires explicit rollback: '+path.name)
 run=subprocess.run(cmd,input=sql,capture_output=True,text=True,timeout=120);log=run.stdout+run.stderr;(out/(path.name+'.log')).write_text(log)
 failures=[line for line in log.splitlines() if line.startswith('not ok') or 'ERROR:' in line or 'Looks like you' in line]
 result={'file':path.name,'exit':run.returncode,'pass':len(re.findall(r'^ok \d+',log,re.M)),'fail':failures};results.append(result)
 print(path.name,result['pass'],'PASS' if not failures and run.returncode==0 else 'FAIL',flush=True)
(out/'summary.json').write_text(json.dumps(results,indent=2))
raise SystemExit(1 if any(r['exit'] or r['fail'] for r in results) else 0)
