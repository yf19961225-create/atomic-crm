"""Local-only integration: audit backfills and migration/ledger atomicity.
Run against a fresh isolated real-backup restore (26 ledger rows).
No remote DSN or credential arguments are accepted.
"""
import sys,json,re,uuid
from pathlib import Path
import psycopg
from psycopg import sql
import migration_guard as guard
import isolated_support as backup
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--output-dir',type=Path,required=True);args=parser.parse_args()
B=args.output_dir;B.mkdir(parents=True,exist_ok=True);R=Path(__file__).resolve().parents[2]
c=psycopg.connect(host='127.0.0.1',port=55440,user='postgres',dbname='romiku_rehearsal',autocommit=True);guard.require_local(c);c.execute('SET search_path=public,extensions')
assert c.execute('SELECT count(*) FROM supabase_migrations.schema_migrations').fetchone()[0]==26
inventory=json.loads((R/'release/rc/migration-inventory.json').read_text());guard.frozen_copies(R,B/'execution-copies')
results={'atomicity':[],'audit_backfills':[]}
def state():
 return {'rows':backup.fingerprints(c),'catalog':{k:c.execute(q).fetchone()[0] for k,q in backup.checks.CATALOG.items()},'triggers':c.execute(backup.checks.SUPPLEMENT['triggers']).fetchall(),'grants':c.execute(backup.checks.SUPPLEMENT['grants']).fetchall(),'policies':c.execute("SELECT policyname,qual,with_check FROM pg_policies WHERE schemaname='storage' ORDER BY 1").fetchall(),'sequences':backup.sequences(c),'indexes':c.execute(backup.checks.SUPPLEMENT['indexes']).fetchall(),'constraints':c.execute(backup.checks.SUPPLEMENT['constraints']).fetchall()}
def audit_rows():
 return {t:c.execute(sql.SQL('SELECT id,created_at,created_by,updated_at,updated_by FROM {} ORDER BY id').format(sql.Identifier('public',t))).fetchall() for t in ('romiku_orders','romiku_quotes','romiku_packing_lists','romiku_production_orders','romiku_production_items','romiku_website_inquiries')}
for n,item in enumerate(inventory,1):
 body=(B/'execution-copies'/item['filename']).read_text();before=state()
 try:guard.apply_one(c,body,'20240730075029','deliberate_duplicate_ledger_test')
 except psycopg.Error as e:assert e.sqlstate=='23505'
 else:raise AssertionError('Ledger duplicate did not fail')
 assert state()==before, 'Atomic rollback changed schema/data/trigger/grant/sequence state'
 results['atomicity'].append({'order':n,'ledger_failure_rolls_back_whole_migration':True})
 if n in (6,12,17,18,26,30):
  c.execute('BEGIN');actor=str(uuid.uuid4());c.execute("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(%s,'audit-regression@example.test','{}')",(actor,));c.execute("SELECT set_config('request.jwt.claim.sub',%s,true)",(actor,))
  order=c.execute('SELECT id FROM romiku_orders ORDER BY id LIMIT 1').fetchone()[0]
  if n==12:c.execute('INSERT INTO romiku_packing_lists(order_id) VALUES(%s)',(order,))
  if n in (17,26):
   production=c.execute('INSERT INTO romiku_production_orders(order_id) VALUES(%s) RETURNING id',(order,)).fetchone()[0]
   source=c.execute('SELECT id FROM romiku_order_items WHERE order_id=%s LIMIT 1',(order,)).fetchone()[0]
   c.execute("INSERT INTO romiku_production_items(production_order_id,order_id,source_order_item_id,sku,quantity) VALUES(%s,%s,%s,'AUDIT-FIXTURE',1)",(production,order,source))
  if n==26:c.execute("INSERT INTO romiku_website_inquiries(customer_name,email,raw_payload) VALUES('Audit fixture','audit@example.test','{}')")
  if n==30:c.execute("INSERT INTO romiku_quotes(status) VALUES('sent')")
  # New synthetic records have non-null audit actor. Preserve both non-null and
  # existing-null audit fields while simulating the unauthenticated runner.
  old=audit_rows();c.execute("SELECT set_config('request.jwt.claim.sub','',true)");c.execute(body)
  assert audit_rows()==old,'Backfill changed historical audit fields'
  assert c.execute("SELECT count(*) FROM pg_trigger WHERE tgname='romiku_audit' AND tgenabled<>'O'").fetchone()[0]==0
  if n==12:assert c.execute("SELECT count(*) FROM romiku_packing_lists WHERE seller_snapshot<>'{}' AND buyer_snapshot<>'{}'").fetchone()[0]>0
  if n==17:assert c.execute('SELECT min(position) FROM romiku_production_items').fetchone()[0]>=1
  if n==18:assert c.execute("SELECT count(*) FROM romiku_orders WHERE production_defaults_snapshot#>>'{source,kind}'='legacy_order'").fetchone()[0]==2
  if n==26:assert c.execute("SELECT count(*) FROM romiku_production_orders WHERE status='pending'").fetchone()[0]==0
  if n==30:assert c.execute("SELECT count(*) FROM romiku_quotes WHERE status='sent'").fetchone()[0]==0
  # Runtime audit still stamps ordinary edits after every backfill.
  c.execute("SELECT set_config('request.jwt.claim.sub',%s,true)",(actor,));c.execute('SET LOCAL ROLE authenticated')
  affected={6:['romiku_orders'],12:['romiku_packing_lists'],17:['romiku_production_items'],18:['romiku_orders'],26:['romiku_quotes','romiku_production_orders','romiku_website_inquiries'],30:['romiku_quotes']}[n]
  for table in affected:
   key,previous_time=c.execute(sql.SQL('SELECT id,updated_at FROM {} ORDER BY id LIMIT 1').format(sql.Identifier('public',table))).fetchone()
   changed_by,changed_at=c.execute(sql.SQL('UPDATE {} SET id=id WHERE id=%s RETURNING updated_by,updated_at').format(sql.Identifier('public',table)),(key,)).fetchone()
   assert str(changed_by)==actor and changed_at>previous_time
  c.execute('ROLLBACK');results['audit_backfills'].append({'order':n,'audit_preserved':True,'runtime_audit_restored':True,'runtime_tables_tested':affected})
 guard.apply_one(c,body,item['version'],item['filename'][15:-4])
 print('PASS prefix',n,flush=True)
results['ledger']=c.execute('SELECT count(*) FROM supabase_migrations.schema_migrations').fetchone()[0];assert results['ledger']==58
(B/'prefix-regressions.json').write_text(json.dumps(results,indent=2));c.close()
