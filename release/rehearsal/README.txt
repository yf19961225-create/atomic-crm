ROMIKU replacement release candidate — isolated rehearsal tooling

Scope
- Replaces frozen RC 8096a101ec99bcd1123a24bb462128d8018f0465 for the 26-ledger Production baseline.
- No Production migration, deployment, credentials, business rows or backup archive is included here.
- The actual verified backup is private and separate. These regression tests are NOT a backup/restore implementation or a Production runner.
- Six pending SQL files changed intentionally. migration-hash-delta.json records old/new hashes; migration-SHA256SUMS.txt lists all 32 in execution order.
- Do not replay changed files on Preview or any database where their versions already exist; do not rewrite existing migration ledgers to conceal hash differences.

Environment prerequisites
- Python 3.9+; install exact dependencies from requirements.txt in an isolated virtual environment.
- PostgreSQL 17.6 / Supabase postgres image 17.6.1.166; no-egress Docker network.
- Fresh actual backup restore with original 26-entry ledger, verified data fingerprints, roles, memberships (including grantor/INHERIT/SET), ACLs, sequences and extensions.
- Restore with the original supabase_admin bootstrap role to preserve grantors; run migrations as nonsuperuser postgres.
- Match the read-only audited Production supautils session preload and policy_grants (including postgres -> storage.objects). Never change Production settings/ownership/privileges to manufacture a pass.
- Fixed local TCP proxy 127.0.0.1:55440 to the isolated container only. DB romiku_rehearsal; database comment ROMIKU_ISOLATED_RCFIX_20261009.
- Tests accept no remote DSN/secret. Guard rejects any other host/port/database/marker.

Commands from this directory
  python3 test_migration_guard.py
  python3 test_prefix_regressions.py --output-dir /private/tmp/romiku-local-regression-results

The prefix integration test consumes a fresh isolated restored database and ends at ledger 58.
For each migration, it first forces a ledger unique conflict AFTER the SQL body and proves rows/schema/triggers/indexes/constraints/grants/Storage policies/sequences roll back, then applies the migration and ledger atomically.
At six changed backfills it creates rollback-only fixtures to exercise empty-in-Production tables, proves all four historical audit fields unchanged, and confirms normal authenticated updates still stamp each affected table.
Fixture tests can consume nontransactional sequence values. They must use a separate test copy. Final real-data success was independently established on another fresh restore with no fixtures; all original sequence states were identical before/after.

Transaction policy
- Exactly one transaction per migration, including ledger insert. Stop on first error.
- Source migrations 12/13 retain their original outer BEGIN/COMMIT. The AST-checked execution copy removes only those two outer statements. Other transaction controls are refused; nested function bodies remain unchanged.
- No successful migration is replayed at the next version; ledger is written only by the same successful transaction, never repaired manually.
- Altering migration SQL invalidates the old hash inventory and requires a new RC and full fresh-backup rehearsal.

Official references
https://supabase.com/docs/guides/storage/security/access-control
https://github.com/supabase/supautils#table-ownership-bypass

See REPORT.txt and validation-summary.json for findings and release conditions.
