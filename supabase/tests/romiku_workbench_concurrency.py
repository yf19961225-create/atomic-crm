#!/usr/bin/env python3
# coding: utf-8
"""Local-only disposable database concurrency checks. Never accepts a remote URL."""
import concurrent.futures
import subprocess
import json

CONTAINER = 'supabase_db_romiku-supplier-sql-20261020'
DB = 'romiku_workbench_race_20261104'
BASE = 'romiku_workbench_release_20261104'

def sql(query, database=DB):
    result = subprocess.run(['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-U', 'supabase_admin', '-d', database, '-v', 'ON_ERROR_STOP=1', '-At'], input=query, text=True, capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError(result.stderr[-1200:])
    return result.stdout

actor = "set role authenticated; set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='ec040000-0000-0000-0000-000000000001';"
order = 'ec041000-0000-0000-0000-000000000001'
payment = 'ec042000-0000-0000-0000-000000000001'
results = []
try:
    sql('CREATE DATABASE '+DB+' TEMPLATE '+BASE+';', 'postgres')
    sql("insert into auth.users(id,email,raw_user_meta_data) values('ec040000-0000-0000-0000-000000000001','race@example.test','{}'),('ec040000-0000-0000-0000-000000000002','race-b@example.test','{}');")
    sql(actor + "insert into romiku_orders(id,status,freight,currency) values('"+order+"','confirmed',10000,'CNY'); insert into romiku_payments(id,order_id,kind,amount) values('"+payment+"','"+order+"','deposit',2913); select romiku_workbench_action('customer_confirmation','"+order+"',0,gen_random_uuid(),'{\"state\":\"confirmed\"}','QA');")
    # A stale-snapshot transaction must never reach acceptance, even after B commits.
    proc = subprocess.Popen(['docker','exec','-i',CONTAINER,'psql','-X','-U','supabase_admin','-d',DB,'-v','ON_ERROR_STOP=1','-At'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    proc.stdin.write(actor+"begin isolation level repeatable read; select romiku_workbench_order_snapshot('"+order+"'); select 'SNAPSHOT_READY';\n"); proc.stdin.flush()
    while True:
        line=proc.stdout.readline()
        if not line: raise RuntimeError('Snapshot barrier not reached')
        if line.strip()=='SNAPSHOT_READY': break
    sql(actor+"update romiku_payments set amount=2914 where id='"+payment+"';")
    proc.stdin.write("select romiku_workbench_action('deposit_accept','"+order+"',1,gen_random_uuid(),jsonb_build_object('fingerprint',romiku_workbench_order_snapshot('"+order+"')->>'fingerprint'),'QA'); commit;\n")
    proc.stdin.close(); proc.wait(timeout=30)
    assert proc.returncode != 0 and 'READ_COMMITTED_REQUIRED' in proc.stderr.read()
    assert sql("select deposit_override from romiku_order_collection_state where order_id='"+order+"';").strip()=='none'
    results.append('repeatable-read stale evidence rejected: PASS')
    # Hold the confirmation transaction open; a concurrent payment change waits on parent lock.
    confirm = actor + "begin; select romiku_workbench_action('deposit_accept','"+order+"',1,gen_random_uuid(),jsonb_build_object('fingerprint',romiku_workbench_order_snapshot('"+order+"')->>'fingerprint'),'QA'); select 'CONFIRM_LOCKED'; select pg_sleep(1); commit;"
    proc = subprocess.Popen(['docker','exec','-i',CONTAINER,'psql','-X','-U','supabase_admin','-d',DB,'-v','ON_ERROR_STOP=1','-At'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    proc.stdin.write(confirm); proc.stdin.close()
    while True:
        line=proc.stdout.readline()
        if not line: raise RuntimeError('Confirmation barrier not reached')
        if line.strip()=='CONFIRM_LOCKED': break
    update = sql(actor+"update romiku_payments set amount=2912 where id='"+payment+"';")
    proc.wait(timeout=30)
    if proc.returncode: raise RuntimeError(proc.stderr.read()[-1000:])
    assert sql("select deposit_override from romiku_order_collection_state where order_id='"+order+"';").strip()=='invalidated'
    results.append('confirmation/payment race: PASS')
    revision=sql("select revision from romiku_order_collection_state where order_id='"+order+"';").strip()
    request='ec044000-0000-0000-0000-000000000001'
    same=actor+"select romiku_workbench_action('collection_follow_up','"+order+"',"+revision+",'"+request+"','{\"needs_follow_up\":true}','QA');"
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        outputs=list(pool.map(sql,[same,same]))
    assert sql("select count(*) from romiku_workbench_events where request_id='"+request+"';").strip()=='1'
    results.append('concurrent identical request: PASS')
    sql(actor+"insert into romiku_production_orders(id,order_id) values('ec045000-0000-0000-0000-000000000001','"+order+"');")
    def change_date(day):
        try:
            sql((actor if day=='10' else actor.replace('ec040000-0000-0000-0000-000000000001','ec040000-0000-0000-0000-000000000002'))+"select romiku_workbench_action('production_due','ec045000-0000-0000-0000-000000000001',0,gen_random_uuid(),'{\"classification\":\"confirmed\",\"date_mode\":\"set\",\"date\":\"2026-11-"+day+"\",\"needs_follow_up\":false}','QA');")
            return 'success'
        except RuntimeError as error:
            if 'STALE_REVISION' in str(error): return 'conflict'
            raise
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        outcomes=list(pool.map(change_date,['10','11']))
    assert sorted(outcomes)==['conflict','success'],outcomes
    results.append('two users/date revision race: PASS')
    print(json.dumps({'results':results},ensure_ascii=False))
finally:
    # Only this script's disposable database; never the baseline or any cloud project.
    if DB != 'romiku_workbench_race_20261104': raise RuntimeError('cleanup guard')
    sql('DROP DATABASE IF EXISTS '+DB+' WITH (FORCE);','postgres')
