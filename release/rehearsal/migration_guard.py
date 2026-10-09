"""Local rehearsal SQL preparation. No remote connection support."""
import hashlib, json, sys
from pathlib import Path
from pglast import parse_sql, ast

class GuardError(Exception): pass

def prepare(source, order):
    tree=parse_sql(source)
    controls=[(i,x) for i,x in enumerate(tree) if isinstance(x.stmt,ast.TransactionStmt)]
    if order in (12,13):
        if len(controls)!=2 or controls[0][0]!=0 or controls[1][0]!=len(tree)-1:
            raise GuardError('UNEXPECTED_TRANSACTION_BOUNDARIES')
        if str(controls[0][1].stmt.kind)!='TransactionStmtKind.TRANS_STMT_BEGIN' or str(controls[1][1].stmt.kind)!='TransactionStmtKind.TRANS_STMT_COMMIT':
            raise GuardError('UNEXPECTED_TRANSACTION_TYPE')
        if controls[0][1].stmt.options or controls[1][1].stmt.chain:
            raise GuardError('UNEXPECTED_TRANSACTION_OPTIONS')
        raw=source
        # pglast 7.10 translates parser offsets to Python string indices.
        # Non-ASCII fixtures below protect against byte/character confusion.
        for _,statement in reversed(controls):
            start=statement.stmt_location;end=start+statement.stmt_len
            if statement.stmt_len<=0:raise GuardError('INVALID_STATEMENT_LENGTH')
            if raw[end:end+1]==';':end+=1
            raw=raw[:start]+' '*(end-start)+raw[end:]
        body=raw
    elif controls:
        raise GuardError('UNEXPECTED_TRANSACTION_CONTROL')
    else:body=source
    after=parse_sql(body)
    if any(isinstance(x.stmt,ast.TransactionStmt) for x in after):raise GuardError('TRANSACTION_CONTROL_REMAINS')
    for x in after:
        if isinstance(x.stmt,ast.AlterSystemStmt):raise GuardError('ALTER_SYSTEM_FORBIDDEN')
        if isinstance(x.stmt,ast.IndexStmt) and x.stmt.concurrent:raise GuardError('NONATOMIC_INDEX_FORBIDDEN')
    return body

def frozen_copies(root,destination):
    items=json.loads((root/'release/rc/migration-inventory.json').read_text())
    if len(items)!=32:raise GuardError('EXPECTED_32_MIGRATIONS')
    destination.mkdir(mode=0o700,parents=True,exist_ok=True)
    result=[]
    for order,item in enumerate(items,1):
        raw=(root/'supabase/migrations'/item['filename']).read_bytes()
        if hashlib.sha256(raw).hexdigest()!=item['sha256']:raise GuardError('FROZEN_HASH_MISMATCH')
        body=prepare(raw.decode(),order)
        (destination/item['filename']).write_text(body)
        result.append({'order':order,'filename':item['filename'],'source_sha256':item['sha256'],'execution_sha256':hashlib.sha256(body.encode()).hexdigest(),'wrapper_removed':order in (12,13)})
    return result

def require_local(conn):
    if conn.info.host!='127.0.0.1' or conn.info.port!=55440 or conn.info.dbname not in ('romiku_rehearsal','romiku_guard_tests'):
        raise GuardError('LOCAL_RESTORE_TARGET_REQUIRED')
    # The database marker is installed only in the new no-egress container.
    actual=conn.execute("SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()").fetchone()[0]
    if actual!='ROMIKU_ISOLATED_RCFIX_20261009':raise GuardError('LOCAL_DATABASE_MARKER_REQUIRED')

def apply_one(conn,body,version,name):
    require_local(conn)
    conn.execute('BEGIN')
    try:
        conn.execute(body)
        conn.execute('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES(%s,%s,%s)',(version,name,[body]))
        conn.execute('COMMIT')
    except BaseException:
        conn.execute('ROLLBACK')
        raise
