# Atomic document save — local review candidate

No remote migration, deployment, business write, or ledger write was performed by this work. The new migration and declarative source are byte-identical:

- `supabase/migrations/20261111120000_document_atomic_save.sql`
- `supabase/schemas/34_document_atomic_save.sql`
- SHA-256: `187854b764ba5e24e29079c338d4f5a5ca30dfadd9a86c67300ce02ab98010a6`

## API

`romiku_save_document(p_kind text, p_document_id uuid, p_expected_revision bigint, p_request_id uuid, p_header jsonb, p_items jsonb)` returns `{kind, document_id, revision, header, items}`.

- Kinds: `quote`, `pi`, `order`, `packing`.
- Create: stable client document UUID, expected revision `0`. Existing rows begin at revision `1`.
- Update: use the revision captured with the editing snapshot, never fetch a fresh revision just before saving an old draft.
- Header is a patch containing only explicitly allowed writable fields. Server IDs, numbering, ownership/audit fields, generated columns, revision and void metadata cannot be supplied.
- Items is the complete desired item list. Existing IDs are updated in place; omitted IDs are deleted subject to existing foreign keys; new UUIDs are inserted. `NULL` preserves existing items; on creation it means no items. `[]` explicitly removes all items.
- Item IDs remain stable across retries. Foreign-parent IDs, duplicate IDs and provenance rewrites are rejected. New commercial provenance is written only by the source-creation workflow.
- Packing item `order_id` may be omitted: it is derived from the locked header. Explicit mismatch is rejected. Linked and independent item/header sources must agree. Configured carton quantity is normalized before reductions/increases are ordered.
- The revision is monotonic, not necessarily `old + 1`. Each header/item mutation invalidates old snapshots, including trusted conversion, status, archive and deletion workflows.

`romiku_document_snapshot(p_kind text, p_document_id uuid)` returns the same envelope, or SQL NULL when the document does not exist. It holds a parent SHARE lock while reading the header and items; all item mutations lock/update that parent. This prevents combining a new header with old items.

`romiku_document_save_result(p_request_id uuid)` returns the actor's immutable committed receipt or SQL NULL. A missing receipt is not proof that an in-flight transaction has failed; retry the same request and payload. The `(actor_id, request_id)` journal is durable and has no automatic expiry in this change.

`romiku_create_document_from_source(p_request_id uuid, p_source_kind text, p_source_id uuid, p_target_kind text, p_selected_item_ids uuid[] DEFAULT NULL, p_expected_source_revision bigint DEFAULT NULL)` returns the same envelope. Source kinds are `website_inquiry`, `quote`, `pi`. Quote/PI conversion requires the source revision captured by the UI and compares it under a source UPDATE lock. Inquiry creation requires selected item IDs; existing requested-quantity snapshot behavior is retained. The existing converter generates the new document UUID; its exact target and response are journaled.

An identical actor/request/payload replay returns the original committed response, even after later document edits. Changed payload with the same request UUID raises SQLSTATE `PT409` / `REQUEST_CONFLICT`. A stale edit/source revision raises `PT409` / `STALE_REVISION`. Payload hashes are computed server-side using SHA-256 over PostgreSQL's JSONB representation, including the operation, identities, expected revision and payload. Failed transactions leave no receipt, header/item partial state or revision change.

## Authorization and compatibility

The executor is NOLOGIN, NOINHERIT, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB and NOCREATEROLE. It does not inherit `authenticated`, cannot assume that role, and has no USAGE on the `auth` schema. Its table grants are limited to the eight document tables, receipt journal and explicit existing trigger/source-read dependencies. Clients cannot assume it.

Supabase's `postgres` cannot grant USAGE on `auth`. Two fixed postgres-owned helpers return only the current request's UID and active CRM membership boolean. Existing `romiku_audit()` and `romiku_require_active_business_writer()` become SECURITY DEFINER with their bodies unchanged. These are trigger-only functions, contain no caller-directed SQL, and retain their existing client execution restrictions. Audit/default behavior was tested with the executor lacking auth-schema access.

The direct-write guard is SECURITY INVOKER and rejects `current_user` authenticated/anon on all eight document tables. No session GUC authorizes a write. A client can neither supply the executor identity nor bypass the guard by setting a custom flag. Trusted existing definer workflows still execute and bump revisions.

The executor has active-user RLS policies. `romiku_atomic_access_allowed` additionally checks authenticated table privileges and the currently audited applicable policy shape. Any applicable restrictive or non-unconditional policy fails closed, including changes to SELECT. Executor-only policies are excluded from authenticated Workbench policy auditing. This preserves the original Workbench and customer-archive RLS-denial tests.

Existing bulk status, order archive and token-confirmed customer archive functions are narrowly promoted to SECURITY DEFINER, with explicit active membership and applicable authenticated policy checks. Their allowed fields/statuses and original token validations remain. Legacy unjournaled converter entry points remain invoker and fail at the document guard; the new source wrapper calls their implementations under the executor.

Old frontend clients that still write headers/items directly fail closed. The backend and new client must be released together; rolling the frontend back to the old direct-write implementation is not an operational rollback plan.

## Object changes

- One role; one actor-scoped receipt table; four positive bigint revision columns.
- Nine new functions; thirteen policies; twelve document guard/revision triggers.
- Six existing functions change: the two trigger execution contexts above; bulk status, order archive and customer archive gates; Workbench's applicable-policy audit.
- Eleven existing pure helper/source-converter function ACLs gain executor EXECUTE. No existing client grants are broadened.
- Explicit executor table grants cover eight document tables plus SELECT dependencies on formal customers, payments and inquiry items; inquiry header SELECT/UPDATE is required by the existing source row lock.
- No migration business DML, no historical status/financial backfill, and no changed numbering, financial generated expressions or foreign keys.

The detailed existing-object diff is `post-migration-existing-object-diff.json`; new object/role metadata is `final-rehearsal/new-object-catalog.json`.

## Local evidence

The original local baseline differed from captured Preview metadata in three places: the active-writer function owner/ACL, eight daily-counter grants, and an extra local Order export-default trigger. A separate clone was aligned to the already-captured Preview metadata; the original baseline was not modified. Before the candidate migration, comparisons found **zero differences** across 91 functions, 230 columns, 821 grants, 125 policies, 314 constraints and 109 triggers. See `preview-aligned-baseline-diff.json`.

All migration DDL ran as the actual non-superuser `postgres` role in `atomic_save_preview_final_20261111`. The captured Preview ledger has 77 rows. The restored local baseline ledger remains 72 because preceding local health DDL was not entered into that ledger; this rehearsal did not advance either ledger.

- **129 pgTAP assertions pass** across four atomic-save SQL files: core 45, security/failure injection 57, business invariants 25, restrictive policy behavior 2.
- **14 real independent-connection races pass**: duplicate concurrent creation, competing writers with one revision, and coherent snapshots for all four kinds; shared packing capacity; packing versus Order quantity reduction.
- The tests cover create/edit, header-only saves, durable lookup/replay, changed-payload rejection, stale document/source revisions, stable referenced line IDs, amount precision, explicit void/currency guards, independent/linked packing parity, multirow allocation, actor isolation, disabled/anonymous denial, forged ownership/revision/provenance and client GUC spoofing.
- Test-only rollback triggers inject failures after header writes, item deletes and item inserts for all four kinds. No failpoint is present in the migration.
- Fresh-role creation and successful temporary privilege cleanup were exercised in a rollback probe. Four separate failure injections immediately after each owner transfer fully rolled back schema/role changes.
- All **49 existing public tables** retained exact row counts and sorted JSON hashes through migration; the new journal started empty.
- The original `supabase_admin`-granted postgres ADMIN membership is unchanged (ADMIN true, INHERIT false, SET false). Only the migration's temporary membership explicitly GRANTED BY postgres is removed. No SET/USAGE path, public CREATE privilege or client membership remains.

The original SQL suite was also run before fixture adaptation and all failures were retained in `sql-suite/`. Its legacy direct-write fixtures require authorized setup or real new RPC calls; they are not evidence that production direct writes should be reopened. Final adapted regression logs are recorded separately by the integration run.

## Rollback and release gate

Execute a reviewed migration only as one transaction, including its eventual ledger entry. The candidate uses the previously validated M2 ownership-transfer pattern: grant temporary SET (not INHERIT) explicitly GRANTED BY postgres, grant temporary public CREATE, transfer the four RPC owners, revoke only those temporary grants, and assert cleanup. Automatic bootstrap ADMIN membership is preserved.

Before commit, any error rolls back the entire DDL transaction; the four owner-transfer failure probes verify this behavior. After commit, prefer a reviewed forward fix. Preserve durable request receipts while any client might retry a saved request. Do not delete the journal, reset revisions, or reopen legacy direct writes as an ad hoc rollback. A coordinated restore would require pausing writes, preserving receipts, reviewing the saved six previous function definitions/ACLs and original trigger/policy catalog, and an explicit separate approval. None of those recovery actions were executed.

No remote deployment is authorized by this document. Before any later approval, recheck the actual Preview ledger, object absence, schema/ACL fingerprints, exact migration hash, readable backup, client compatibility and the complete final regression result. Historical M1/M2 files were not changed.
