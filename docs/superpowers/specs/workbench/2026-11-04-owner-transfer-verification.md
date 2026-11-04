# Preview M2 ownership correction — pending renewed migration authorization

## Actual read-only Preview evidence

2026-11-04 13:24:58 Asia/Shanghai, project `ciwaibtotispazfviims`.
TLS verify-full, REPEATABLE READ READ ONLY. Session/current user both `postgres`;
PostgreSQL 17.6; not superuser, CREATEROLE, database owner postgres.
`public` owner pg_database_owner; caller USAGE/CREATE true. Auth USAGE true,
CREATE false. `createrole_self_grant` empty. Ledger 68; M1/M2 absent;
executor role and workbench functions absent. Existing memberships are granted by
supabase_admin. No remote writes or migrations performed.

Protected evidence: `/private/tmp/romiku-workbench-preflight-20261104/role-audit-20261104T052502279417Z.json`.
It contains no passwords or role password hashes. Original backups unchanged.

## Cause and exact fix

PostgreSQL 16+ automatically grants the role creator ADMIN with INHERIT=false,
SET=false, from the bootstrap superuser. ADMIN alone cannot transfer function
ownership. Local reproduction using the audited non-superuser postgres failed
before the deliberate test failure with `must be able to SET ROLE`.

M1 remains byte-for-byte unchanged. M2 moves its existing four ALTER FUNCTION OWNER
statements to the end, after ACL, trigger and publication setup. This avoids losing
owner privileges while configuring function ACLs. Function bodies, client grants,
RLS policies, triggers and business behavior are unchanged.

M2 now fails closed unless session_user/current_user are postgres and there is no
pre-existing SET/USAGE, executor schema CREATE, or postgres-granted self-membership.
Within the caller's single migration transaction:

1. postgres grants itself executor membership: ADMIN=false, INHERIT=false, SET=true,
   explicitly GRANTED BY postgres.
2. Temporarily grant executor CREATE on public.
3. Transfer all four functions: action, invalidate, financial_change, source_deleted.
4. Revoke schema CREATE and only the membership GRANTED BY postgres.
5. Assert SET=false, USAGE=false, CREATE=false and no temporary grant remains.

The supabase_admin-granted ADMIN membership is retained, not edited or revoked.
No client gets membership. NOLOGIN/NOSUPERUSER/NOBYPASSRLS remains unchanged.
Migration must be executed as one transaction, with ledger insertion in that same
transaction. No remote executor or automatic push is authorized by this document.

References:
- https://supabase.com/kb/troubleshooting/cant-revoke-a-role-membership-granted-by-supabase_admin
- https://www.postgresql.org/docs/17/sql-alterfunction.html

## Local validation

New no-network, no-port PostgreSQL 17.6 container `romiku-preview-owner-fix-20261104`.
Original dump mounted read-only; restored database owned by postgres. Roles and
membership grantor/ADMIN/INHERIT/SET options reconstructed from actual Preview
report. Bootstrap supabase_admin is used only to initialize/reset local fixtures;
**both migrations execute as non-superuser postgres**, separate transactions.

- New regression `supabase/tests/romiku_workbench_owner_transfer.py`: RED on old
  M2, GREEN on corrected M2. Four failure injections after each owner transfer:
  rollback restores M1-only state, schema grants and exact original membership.
- Successful M1/M2: all four owners correct; temporary grants absent; automatic
  ADMIN membership identical; authenticated/anon cannot assume executor.
- Complete restored-data clone: all 81 original tables' counts and sorted row MD5
  unchanged after migrations. Original archive unchanged. Local ledger is not
  advanced by this SQL-file test; remote ledger remains last-read 68.
- SQL regression: **355 PASS / 0 FAIL**, comprising security23, actions49,
  receivables29, feed18, production workspace38, production allocation31,
  controlled delete48, order cascade delete56, status history63.
- Four original concurrency scenarios PASS: stale snapshot rejection,
  confirmation/payment race invalidation, identical request deduplication,
  two-user date revision conflict.
- First regression run on populated restored data exposed empty-fixture assumptions
  (global counts/subqueries); legacy production test also required JWT role setting.
  Rerun used a NEW empty-data database with the successfully migrated schema and
  original assertions, setting authenticated JWT role as in the prior runner.
  No assertions were weakened, no restore data cleared. Security tests also passed
  against the populated restore (23/23).

Logs and summaries: `/private/tmp/romiku-owner-fix-evidence-20261104/`.
Concurrency runner changes only local container, socket and template database;
all original assertions retained. No UI changes; frontend suite not repeated.

## Superseding file hashes

M1 `20261104100000_workbench_state_and_audit.sql`:
`7eaf071409b6951c70df963c6745ba5ba79f4283e6bae9dd4965aed8d152c0d3`

M2 `20261104110000_workbench_actions_and_invalidation.sql`:
`bdfbc644572c9b0b6329b520af38031a3bbb9c5908ad41f25a97df726a7b00e1`

Old M2 `9df5aa1f...` is historical, not authorization for this revision.
The old external preflight helper intentionally still rejects the revised hash;
its execution allowlist must only be updated after the new version is approved.
Repository read-only preflight now includes actual execution identity, database/
schema ownership and full grantor/ADMIN/INHERIT/SET metadata.

## Gate

Ready to request renewed Preview migration approval; NOT authorization to execute.
Before execution recheck exact commit/hashes, ledger68, object absence, permissions,
schema drift, readable encrypted backup and current business fingerprints.
Backup remains PARTIAL for complete hosted project recovery (24 Storage object
bodies absent). No Production access, cloud migration, UI deployment, or QA writes
in this correction. No remote identity was altered.
