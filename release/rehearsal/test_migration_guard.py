import unittest
from pathlib import Path
import migration_guard as m
class Tests(unittest.TestCase):
    def test_embedded_function_preserved(self):
        source="begin;\n-- 中文\nCREATE FUNCTION x() RETURNS void LANGUAGE plpgsql AS $$BEGIN PERFORM 1; END;$$;\ncommit;"
        body=m.prepare(source,12)
        self.assertIn('$$BEGIN PERFORM 1; END;$$',body)
        self.assertIn('-- 中文',body)
        self.assertNotIn('commit;',body)
    def test_no_wrapper_other_migrations(self):
        with self.assertRaises(m.GuardError):m.prepare('BEGIN; SELECT 1; COMMIT;',1)
    def test_nested_commit_rejected(self):
        with self.assertRaises(m.GuardError):m.prepare('BEGIN; SELECT 1; COMMIT; SELECT 2; COMMIT;',12)
    def test_rollback_rejected(self):
        with self.assertRaises(m.GuardError):m.prepare('BEGIN; SELECT 1; ROLLBACK;',13)
    def test_transaction_free_sql_unchanged(self):
        s="-- commit;\nDO $$BEGIN PERFORM 'COMMIT;'; END;$$;"
        self.assertEqual(m.prepare(s,1),s)
    def test_fixed_target(self):
        c=type('C',(),{'info':type('I',(),{'host':'production','port':5432,'dbname':'postgres'})()})()
        with self.assertRaises(m.GuardError):m.require_local(c)
    def test_all_frozen_migrations(self):
        import json,hashlib
        root=Path(__file__).resolve().parents[2]
        for i,x in enumerate(json.loads((root/'release/rc/migration-inventory.json').read_text()),1):
            source=(root/'supabase/migrations'/x['filename']).read_bytes()
            self.assertEqual(hashlib.sha256(source).hexdigest(),x['sha256'])
            m.prepare(source.decode(),i)
if __name__=='__main__':unittest.main()
