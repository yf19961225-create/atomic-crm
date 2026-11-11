# Document save failure follow-up — local only

Baseline: 4ba87c3b. No Production access, remote SQL/RPC, schema edits or migration files. Local Chromium + FakeRest exercise actual application helpers/components; SQLite proof below models a proposed transaction contract, not Supabase.

## Reproduced failures

`commercial/documentSaveFailures.test.ts` runs the real `commitCommercialItems` for Quote, PI and Order, against FakeRest with injected provider failures:

- A deletion and update commit before a later create rejects. Deleted line remains absent and updated quantity remains changed.
- Create commits, then its response is lost. A second call with the same draft produces two different persisted IDs for the same SKU. This is a direct helper retry characterization, not an automatic app retry.
- Two editors start from the same row. A deferred first writer completes after another writer changed quantity to 9. The first writer's full stale row restores quantity to 1 while changing SKU. `previousData` is not a compare-and-swap condition.
- Real `savePackingItem` commits the first standalone line before the next line fails validation. Lost create response followed by a helper retry also produces duplicate rows.

The browser tests exercise actual Quote/PI/Order save handlers: header name changes, a new line commits, the provider throws after commit, and both persisted header and row are inspected. Packing browser test changes cartons, commits its update, then loses the response. Original PI/Order/Packing save buttons reenabled after these errors. The initial Quote test fixture had an invalid Quote status/incorrect blur target, so its first failure is NOT evidence of a product bug.

## Local frontend mitigation

`useDocumentSaveAttempt` uses a synchronous ref gate so a second same-editor invocation cannot enter before React rerenders. On any save error it leaves the gate closed and disables Save. Error copy explicitly says partial or complete writes may already exist and asks the user to preserve the draft, refresh, and reconcile saved content. Draft inputs stay present. Normal complete success releases the gate.

This intentionally errs on the side of reconciliation even for a rejected write, because the existing provider error contract cannot reliably distinguish rejection from a committed write with a lost response. The gate lasts until editor remount; it is not persisted, not a cross-tab lock, and not server idempotency. Refresh requires manual preservation of wanted draft changes. It does not undo writes or prevent stale concurrent clients, external API writes, or retry after remount. No rollback or automatic retry is added. Existing quantities, prices, save ordering and provider contracts are unchanged.

## Minimal remaining backend authorization

A true fix requires a separately approved database contract change, beyond the two already authorized migrations. No additional migration has been created. Proposed review scope:

1. One authenticated transaction RPC dispatching the four allowlisted document kinds (or four narrow functions), accepting document ID, expected revision, stable request UUID and full header/line intent with client line IDs. Never accept arbitrary table/column names.
2. A per-document revision and row lock covering header and all line membership/data mutations. Every competing writer must participate in the lock/revision protocol; otherwise a revision check on this RPC alone cannot stop existing CRUD overwrites. Validate membership, source lineage, permissions, quantities and financial rules inside the transaction; preserve existing triggers.
3. A durable request ledger, unique by actor/document/request ID, storing canonical payload hash and resulting persisted IDs/revision. Identical retries return the first committed result; the same key with different intent fails. Ledger and header/lines commit together. Lock ordering must serialize identical concurrent requests; do not rely on a separate client read-before-create check.
4. Stale revision returns a conflict with current revision, not silent merge. Client preserves its draft for comparison. Fresh intent gets a new request UUID; an uncertain retry retains exactly the old UUID and payload. Ownership/RLS and approved grants must be reviewed, including the choice of invoker/definer and fixed search_path.
5. PostgreSQL integration gates before rollout: failure at every mutation boundary rolls back header/lines/ledger; lost reply and concurrent same-key retries return identical IDs once; concurrent different edits reject the stale revision; cross-tenant IDs reject; packing trigger capacity/order linkage remain enforced; all legacy writer paths are covered. Local frontend gate remains useful but is not the server guarantee.

`save-contract-proof/proof.py` is a runnable standard-library SQLite transaction proof: full rollback, same-key retry after discarded success response, changed-payload rejection and two concurrent stale editors. It creates only a temporary local database and deletes it after tests. All three tests pass (`save-contract-proof.log`). SQLite BEGIN IMMEDIATE serializes writers globally; production PostgreSQL row locks, RLS, real schema/triggers and RPC grants are NOT validated by this model.

Run locally:

```sh
python3 docs/reviews/system-health-20261111/save-contract-proof/proof.py
npx vitest run --project app src/components/romiku/orders/documents.test.tsx src/components/romiku/packing/PackingItemsGrid.interaction.test.tsx src/components/romiku/commercial/documentSaveFailures.test.ts src/components/romiku/commercial/useDocumentSaveAttempt.test.tsx src/components/romiku/quotes/quotes.test.tsx src/components/romiku/commercial/commercialLineItems.test.ts
```

## Logs

Logs are retained outside the deployment source in `system-health-preview-final-20261111/evidence/save/`.

- `save-retry-red.log`: original 3 valid retry-button failures plus the invalid Quote fixture failure.
- `save-retry-green.log`: misleading filename, an intermediate pre-fix run caused by an edit-script indentation failure; NOT green evidence.
- `save-retry-verified.log`: intermediate 88 passed/1 failed, Quote fixture still invalid; NOT final evidence.
- `save-retry-final.log`: final targeted Chromium result: **6 files / 89 tests passed**, including 11 backend-gap characterization tests, 4 actual save-handler lost-response cases, and the synchronous gate test.
- `save-typecheck.log`: application TypeScript check, exit 0.
- `save-lint.log`: 0 errors; 4 preexisting PackingItemsGrid Fast Refresh warnings plus ESLintIgnoreWarning. `git diff --check` passed.
- `save-contract-proof.log`: 3 local transaction-model tests passed.
