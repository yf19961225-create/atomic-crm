# Local test stack only: newest migrations and tests run inside BEGIN/ROLLBACK.
from pathlib import Path
import re,subprocess
root=Path(__file__).resolve().parents[1]
parts=['begin;']
for name in ['20261003150000_production_marking_snapshot.sql','20261003180000_production_instruction_inheritance.sql','20261004160000_customer_business_history.sql','20261004190000_production_workbench.sql','20261004220000_production_allocation_guard.sql','20261005100000_production_sync_verification.sql','20261005120000_production_item_small_labels.sql','20261005150000_production_barcodes.sql','20261006100000_order_cascade_delete.sql','20261006130000_workflow_status.sql','20261006131000_financial_workflow.sql','20261006132000_bulk_workflow.sql','20261006133000_controlled_inquiry_delete.sql','20261006150000_quote_inquiry_workflow.sql','20261006170000_status_history.sql','20261006190000_inquiry_quote_snapshots.sql']:
 p=root/'supabase/migrations'/name
 if p.exists():parts.append(p.read_text())
import sys
files=sorted((root/'supabase/tests').glob('*.sql'))
for p in files:
 s=p.read_text().strip();s=re.sub(r'^begin\s*;','',s,count=1,flags=re.I|re.M);s=re.sub(r'rollback\s*;\s*\Z','',s,count=1,flags=re.I|re.M)
 parts.extend(['savepoint one_test;',s,'rollback to one_test;'])
parts.append('rollback;')
r=subprocess.run(['docker','exec','-i','supabase_db_atomic-crm-demo','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-X','-q','-A','-t'],input='\n'.join(parts),text=True,capture_output=True)
print(r.stdout); print(r.stderr)
raise SystemExit(r.returncode or (1 if 'not ok' in r.stdout else 0))
