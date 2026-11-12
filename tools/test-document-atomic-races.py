#!/usr/bin/env python3
"""LOCAL ONLY: real independent PostgreSQL connections in an explicit test clone.
Uses Docker's local Unix socket, never reads application env or remote config.
"""
import argparse, json, subprocess, uuid
p=argparse.ArgumentParser();p.add_argument('--container',default='romiku-prod-backup-restore-20261106b');p.add_argument('--database',required=True);a=p.parse_args()
if not a.database.startswith('atomic_save_'): raise SystemExit('Only isolated atomic_save_* databases permitted')
cmd=['docker','exec','-i',a.container,'psql','-h','/tmp','-U','supabase_admin','-d',a.database,'-X','-Atq','-v','ON_ERROR_STOP=1']
actor=str(uuid.uuid4()); results=[]
def lit(x): return "'"+str(x).replace("'","''")+"'"
def sql(s,check=True):
 r=subprocess.run(cmd,input=s,text=True,capture_output=True,timeout=30)
 if check and r.returncode: raise AssertionError(r.stderr)
 return r
prefix=f"SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL request.jwt.claim.sub={lit(actor)}; SET LOCAL statement_timeout='10s'; "
def auth(s): return 'BEGIN;'+prefix+s+';COMMIT;'
def value(s): return json.loads(sql(auth(s)).stdout.strip().splitlines()[-1])
def save(k,d,rev,r,h,items):
 return 'SELECT public.romiku_save_document('+','.join([lit(k),lit(d),str(rev),lit(r),lit(json.dumps(h)), 'NULL' if items is None else lit(json.dumps(items))])+')'
def check(name,condition):
 if not condition: raise AssertionError(name)
 results.append({'case':name,'passed':True})
def race(first,second):
 # First connection commits only after the second has started its statement.
 # READY is emitted after all first transaction writes/locks have completed.
 proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 proc.stdin.write('BEGIN;'+prefix+first+";SELECT 'READY';SELECT pg_sleep(0.8);COMMIT;\n");proc.stdin.close()
 first_lines=[]
 while True:
  line=proc.stdout.readline()
  if not line: raise AssertionError(proc.stderr.read())
  if line.strip()=='READY':break
  first_lines.append(line.strip())
 other=sql(auth(second),check=False)
 rest=proc.stdout.read();err=proc.stderr.read();proc.wait(timeout=15)
 if proc.returncode:raise AssertionError(err)
 return json.loads(first_lines[-1]),other
sql(f"INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES({lit(actor)},{lit('qa-races-'+actor+'@example.test')},'{{}}');")
for kind in ['quote','pi','order','packing']:
 doc=str(uuid.uuid4()); request=str(uuid.uuid4()); line=str(uuid.uuid4()); items=[{'id':line,'sku':'RACE','quantity':2}]
 statement=save(kind,doc,0,request,{'notes':'once'},items)
 first,other=race(statement,statement)
 check(kind+' duplicate concurrent create returns identical receipt',other.returncode==0 and json.loads(other.stdout.strip())==first)
 rev=first['revision']; r1=str(uuid.uuid4());r2=str(uuid.uuid4())
 first,other=race(save(kind,doc,rev,r1,{'notes':'winner'},None),save(kind,doc,rev,r2,{'notes':'loser'},None))
 check(kind+' two writers same revision exactly one wins',other.returncode!=0 and 'STALE_REVISION' in other.stderr)
 first,other=race(save(kind,doc,first['revision'],str(uuid.uuid4()),{'notes':'complete'},[{'id':line,'sku':'COMPLETE','quantity':3}]),f'SELECT public.romiku_document_snapshot({lit(kind)},{lit(doc)})')
 check(kind+' snapshot waits and returns coherent header/items/revision',other.returncode==0 and json.loads(other.stdout.strip())==first)
# Two independent Packing Lists compete for the same Order item capacity.
od=str(uuid.uuid4());oi=str(uuid.uuid4())
order=value(save('order',od,0,str(uuid.uuid4()),{},[{'id':oi,'sku':'CAPACITY','quantity':10}]))
def packing(q): return save('packing',str(uuid.uuid4()),0,str(uuid.uuid4()),{'order_id':od},[{'id':str(uuid.uuid4()),'order_id':od,'source_order_item_id':oi,'sku':'CAPACITY','quantity':q}])
first,other=race(packing(6),packing(6))
check('shared Order item never overpacks under concurrent saves',other.returncode!=0 and 'Packed quantity exceeds remaining ordered quantity' in other.stderr)
# Order reduction and packing serialize on the same Order parent lock.
first,other=race(save('packing',first['document_id'],first['revision'],str(uuid.uuid4()),{},[{'id':first['items'][0]['id'],'order_id':od,'source_order_item_id':oi,'sku':'CAPACITY','quantity':7}]),save('order',od,order['revision'],str(uuid.uuid4()),{},[{'id':oi,'sku':'CAPACITY','quantity':5}]))
check('concurrent Order reduction cannot fall below newly committed packing',other.returncode!=0 and 'Order quantity cannot fall below packed quantity' in other.stderr)
print(json.dumps({'database':a.database,'connections':'independent psql processes','tests':results},indent=2))
