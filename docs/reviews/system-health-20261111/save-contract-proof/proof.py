"""Local SQLite transaction proof only; no app schema, migrations or network.
Run: python3 docs/reviews/system-health-20261111/save-contract-proof/proof.py
"""
import concurrent.futures
import json
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path


class Conflict(Exception):
    pass


def save(path, request, expected_revision, header, lines, fail_after_line=None):
    payload = json.dumps([expected_revision, header, lines], sort_keys=True)
    db = sqlite3.connect(path, timeout=10)
    try:
        # PostgreSQL implementation needs a document row lock + unique request key.
        db.execute("BEGIN IMMEDIATE")
        prior = db.execute("SELECT payload, response FROM requests WHERE id=?", (request,)).fetchone()
        if prior:
            if prior[0] != payload:
                raise Conflict("request reused with different payload")
            db.commit()
            return json.loads(prior[1])
        revision = db.execute("SELECT revision FROM header").fetchone()[0]
        if revision != expected_revision:
            raise Conflict("stale revision")
        db.execute("UPDATE header SET text=?, revision=revision+1", (header,))
        db.execute("DELETE FROM lines")
        for index, line in enumerate(lines):
            db.execute("INSERT INTO lines VALUES (?,?)", (line[0], line[1]))
            if index == fail_after_line:
                raise RuntimeError("injected line failure")
        response = {"revision": revision + 1, "ids": [line[0] for line in lines]}
        db.execute("INSERT INTO requests VALUES (?,?,?)", (request, payload, json.dumps(response)))
        db.commit()
        return response
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


class ContractProof(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = str(Path(self.tmp.name) / "local.db")
        with sqlite3.connect(self.path) as db:
            db.executescript("""
                CREATE TABLE header(text TEXT, revision INTEGER);
                INSERT INTO header VALUES ('original', 0);
                CREATE TABLE lines(id TEXT PRIMARY KEY, quantity INTEGER);
                INSERT INTO lines VALUES ('old', 1);
                CREATE TABLE requests(id TEXT PRIMARY KEY, payload TEXT, response TEXT);
            """)

    def state(self):
        with sqlite3.connect(self.path) as db:
            return [db.execute("SELECT * FROM " + table).fetchall() for table in ("header", "lines", "requests")]

    def test_header_lines_and_request_rollback_together(self):
        before = self.state()
        with self.assertRaisesRegex(RuntimeError, "injected"):
            save(self.path, "r1", 0, "changed", [("new", 3), ("other", 4)], 0)
        self.assertEqual(self.state(), before)
        self.assertEqual(save(self.path, "r1", 0, "changed", [("new", 3)])["revision"], 1)

    def test_lost_response_retry_returns_same_commit(self):
        # Discard first result to simulate a committed transaction losing its reply.
        save(self.path, "r1", 0, "changed", [("new", 3)])
        before = self.state()
        retry = save(self.path, "r1", 0, "changed", [("new", 3)])
        self.assertEqual(retry, {"revision": 1, "ids": ["new"]})
        self.assertEqual(self.state(), before)
        with self.assertRaisesRegex(Conflict, "different payload"):
            save(self.path, "r1", 0, "other", [("new", 3)])

    def test_concurrent_stale_editor_cannot_overwrite_winner(self):
        gate = threading.Barrier(2)
        def attempt(request):
            gate.wait()
            try:
                return save(self.path, request, 0, request, [(request, 3)])
            except Conflict:
                return "conflict"
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            results = list(pool.map(attempt, ["a", "b"]))
        self.assertEqual(results.count("conflict"), 1)
        headers, lines, requests = self.state()
        self.assertEqual(headers[0][1], 1)
        self.assertEqual(len(lines), 1)
        self.assertEqual(len(requests), 1)
        self.assertEqual(headers[0][0], lines[0][0])


if __name__ == "__main__":
    unittest.main(verbosity=2)
