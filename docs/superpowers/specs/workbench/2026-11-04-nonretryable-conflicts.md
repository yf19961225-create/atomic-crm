# Preview workbench conflict response correction

## Evidence and cause

- Preview M1/M2 succeeded: ledger 70. They remain immutable.
- Read-only audit 2026-11-04T06:05:45Z: postgres identity/TLS verified;
  two authenticator workbench calls remained active, no blocking PIDs,
  no lock wait, deadlock count zero. No customer data was queried in diagnosis.
- The action RPC used serialization SQLSTATE `40001` for four **business**
  conflicts: request reuse, order revision, evidence fingerprint, production revision.
- Official Supabase guidance documents PostgREST 14 retrying this SQLSTATE:
  https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions
- Independent local PostgreSQL 17.6 + official PostgREST 14.1, network none:
  old RPC stale revision timed out at 5.062 seconds; corrected RPC returned
  HTTP 409 / PT409 / STALE_REVISION in 0.043 seconds. No timeout extension.
  Schema cache readiness is explicitly awaited before each request.
- Local in-flight check: replacing the function while an old request retries
  caused HTTP409 in 0.589 seconds, without backend cancellation.

## Minimal correction

M3 `20261104140000_workbench_nonretryable_conflicts.sql` changes only those
four `errcode='40001'` clauses to `errcode='PT409'`. All messages, version
checks, lock order, idempotency, RLS, audit, receipt invalidation remain intact.
The frontend already translates STALE/CONFLICT messages and retains failed
form input; it needs no behavior change for this database correction.

M3 checks the exact prior function body and executor. Temporary SET membership
and schema CREATE are transaction-scoped by explicit grant/revoke, preserving
the system ADMIN grant. CREATE OR REPLACE runs as the current function owner.
Owner, ACL and other object definitions remain unchanged. Execute M3 and ledger
in one transaction, never re-run M1/M2 or use db push.

## Validation

- Existing SQL assertions first failed RED: expected PT409, received40001.
- 378 SQL assertions PASS (workbench/security/receivables/feed, order/production
  controlled deletion, production allocation, status history).
- 4 dual-connection concurrency cases PASS.
- Failure injection after SET ROLE, after function replacement, and at migration
  end: rollback restores exact function/roles/schema grants each time.
- Complete frontend: 1415 PASS, 3 pre-existing skipped; typecheck/lint/build/PWA PASS.
- Local evidence: /private/tmp/romiku-workbench-preview-20261104/.
- No Production access, no remote M3 execution yet at time of this commit.

## Preview execution and recovery

Use fixed Preview ref ciwaibtotispazfviims, TLS verify-full, ledger70 exact,
M1/M2/M3 hashes and candidate exact, full prior catalog comparison, encrypted
archive SHA validation, current fingerprints and encrypted state/audit capture.
Do not cancel pooled backends by PID: a pooled connection is not a request
identity. Read-only activity evidence is retained; no backend is terminated.
Lock business tables for the brief migration; compare fingerprints and all catalog
objects before commit; ledger71 must be atomic. On failure stop without retries.
Preserve exact post-commit metadata and function diff. No destructive down migration.
Safe fallback frontend remains compatible with PT409 and leaves state/audit intact.
Full Supabase disaster recovery remains PARTIAL (24 Storage bodies unbacked up).

## Remaining gates

Actual Preview HTTP409 timing/concurrency, all browser flows, two users/Realtime,
real safe rollback deployment, QA controlled cleanup and final approval report.
Local PASS alone does not satisfy these gates.
