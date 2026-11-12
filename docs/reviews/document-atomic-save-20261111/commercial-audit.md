# Commercial atomic-save audit (local only)

Audited local baseline 04dbc592 on 2026-11-11. No remote calls or migrations. Paths below are repository relative. This document is evidence/recommendation, not an implementation claim.

## Write entry points

| Entry | Evidence | Current behavior / required adaptation |
|---|---|---|
| Quote direct / outbound / customer create | `src/components/romiku/quotes/quoteWorkflow.ts:43`, `:81`; `QuoteCreate.tsx:63` | Provider create, no persistent request ID; response loss can duplicate. Source read and insert are separate requests. |
| Inquiry → Quote | `quoteWorkflow.ts:23`; `supabase/schemas/02_functions.sql:740` | Existing transaction copies selected inquiry rows and header, but request is not idempotent. Keep selection validation and server source snapshots; put behind request protocol. |
| PI / Order direct create | `src/components/romiku/orders/documentWorkflow.ts:69`; `DocumentPages.tsx:377` | Provider header create; same duplicate-on-retry risk. |
| Quote / PI / Order edit | `QuotePages.tsx:432`; `DocumentPages.tsx:602`; `commercial/commercialLineItems.ts:190` | Header commits first; then sequential delete/update/create lines. A line failure leaves partial save. Replace orchestration with one atomic RPC without changing UI layout. |
| Quote → PI / Order; PI → Order | `orders/documentWorkflow.ts:46`; `02_functions.sql:797` | Existing transaction and source parent FOR UPDATE at :827, but no revision or persistent request ID. Old converter must be revoked/wrapped; keeping callable unversioned converter allows stale creation / duplicate retries. |
| Order list inline delivery | `orders/InlineOrderDeliveryDate.tsx:40`, `:54` | Header-only update. Must carry revision captured in list row, with patch semantics; do not read fresh revision and silently overwrite another edit. |
| Shared table legacy direct branch | `commercial/CommercialLineItemsTable.tsx:195`, `:331`, `:360`; `commercialLineItems.ts:77` | Direct update, copy/create, reorder when onItemsChange absent. Current detail pages supply staged mode at QuotePages:624 / DocumentPages:885. Retire direct branch or adapt to versioned patch RPC; retain deny at DB even if unreachable today. |
| Legacy item editor | `quotes/QuoteItems.tsx:118` | Direct delete/update/create. Must not retain privileged bypass even if current detail route does not render it. |
| Batch status / archive / void / controlled delete | `supabase/schemas/17_bulk_workflow.sql:81`, `:103`; `16_financial_workflow.sql:33`, `:45`; `02_functions.sql:1030` | Status/archival changes touch same header and must advance document revision. Preserve specialized actions; any privileged bypass must be narrowly scoped. Batch status currently SECURITY INVOKER and will fail after table write revoke unless adapted. |

## Exact header / line allowlists

Existing browser header builders are `quotes/quoteWorkflow.ts:160` and `orders/documentWorkflow.ts:104`. Enforce on server, reject unknown fields rather than unrestricted jsonb_populate_record.

Common editable header: `status, counterparty_snapshot, formal_customer_id, bank_snapshot, terms_snapshot, currency, document_name, document_language, document_date, follow_up_at, due_at, freight, discount, other_expenses, price_term, shipment_method, notes`.

Quote additionally: `fx_enabled, usd_cny_rate, valid_until`. PI/Order additionally: `deposit_percent, deposit_due_at, balance_due_at`; Order additionally: `expected_delivery_at, actual_delivery_at, purchase_order_number`. PI/Order do not have FX columns even though their browser builder reuses Quote helper: explicit per-kind allowlist is essential.

Common editable line: `sanity_product_id, sku, product_snapshot, packing_snapshot, quantity, unit_price, unit_price_entered, requirement, customer_code, notes, position`. Quote additionally `source_cny_unit_price`. Existing `quoteItemWrite` at `quoteWorkflow.ts:239` excludes sanity_product_id; other table paths set it using verified product selection, so preserve this legitimate field with type checks and SKU change clearing behavior.

Server-owned / prohibited user payload: `id` (except existing-line identity selector), parent FK, `document_number`, `amount`, ownership/audit timestamps and actor IDs, `status_changed_at`, `revision`, `archived_at`, all `voided_*` / `void_reason`, `source_quote_id`, `source_pi_id`, `source_website_inquiry_id`, `outbound_company_id`, item source FKs and `requested_quantity_snapshot`. Creation may accept explicit verified source *operation* parameters; server derives lineage. Formal customer association remains intentionally editable. Existing source IDs on edited rows must remain untouched; do not delete/reinsert all lines or break downstream FKs. New draft/copy rows must not inherit source lineage merely because UI copied an entire row object.

All existing IDs must belong to the selected parent; reject duplicate line IDs and foreign IDs, reject nonexistent existing IDs, assign new UUIDs server-side. Return canonical header and lines (real IDs and revisions) from transaction. Reusing browser `session.items` after commit retains temporary IDs (`commercialLineItems.ts:172`) and makes the next baseline inaccurate.

## Database invariants and real risks

- Tables: `01_tables.sql:381` Quote, :417 Quote lines, :456 PI, :490 PI lines, :513 Order, :566 Order lines. Money columns have checks and generated per-line `round(quantity*unit_price,2)` amounts. Totals/receipts are views (`03_views.sql:162`); never accept total/received/remaining money as header input. Preserve exact SQL numeric calculation rather than JS totals. Existing numeric checks alone do not express JSON finite-number and object-shape validation; reject malformed/null/NaN inputs explicitly at RPC boundary.
- Formal numbering server generated and immutable: `02_functions.sql:537`, :569 and `04_triggers.sql:135`. Do not disable these triggers or reserve numbers in browser.
- Parent locking and immutable parent FK: `02_functions.sql:668`; triggers `04_triggers.sql:123-125`. This serializes concurrent child writes but supplies no stale-write check. No document revision exists in these base header schemas.
- Authenticated table writes remain wide open within active membership: `06_grants.sql:210-232`, `05_policies.sql:118-149`. `33_active_business_writes.sql:4` enforces active membership, not revision. Merely adding revision to new RPC cannot stop old REST clients overwriting data or source lineage.
- Source header/item FKs are simple references (`01_tables.sql:406`, :482, :539-540, :493, :569-570); no commercial source immutability trigger was found. A direct writer can change provenance today; new gate and allowlist must close this path.
- Financial history guard uses `current_user='authenticated'` (`16_financial_workflow.sql:6`, :11). A new SECURITY DEFINER save changes current_user and can silently bypass void protections unless it independently rejects prohibited void writes. Existing specialized void RPCs intentionally exploit definer authority. Allow existing voided status unchanged if needed, never transition to voided through ordinary save; reject editing protected void metadata.
- Existing order currency freezes when any payment exists (`02_functions.sql:887`); retain trigger. Order quantity reduction checks packing (`02_functions.sql:725`) and allocation protections elsewhere; avoid dropping constraints/triggers or replacing identities.
- Collection acceptance invalidates on money/status/archive/line changes (`30_workbench_actions.sql:132-162`). Preserve triggers and run within atomic save so invalidation/events roll back with failed line changes. Workbench collection revision is a separate domain; do not reuse it as document edit revision.

## Minimal compatible strategy

1. Dedicated NOLOGIN executor role, narrowly granted DML + explicit RLS policies, fixed search_path, active-member check and authenticated caller check in each public RPC. Revoke direct authenticated INSERT/UPDATE on protected headers and INSERT/UPDATE/DELETE on lines; retain reads. Revoke legacy unversioned converter/create EXECUTE, or replace wrappers with an explicit upgrade-required error. Old clients should fail closed with a clear refresh-required error; silently making them compatible cannot provide expected-revision semantics they never send.
2. Expose one create/save/conversion protocol carrying request UUID, kind, entity ID, expected revision, canonical payload. Persist actor-scoped request hash and successful result in same DB transaction; lock request before lookup, check hash before expected revision so replay returns original success even after later revisions. UUID/hash mismatch is explicit conflict. No durable success record on rolled-back mutation.
3. Lock parent, compare expected revision, apply allowlisted header/line diff, advance revision exactly once for document save, read final canonical header/lines/totals, persist result. Other authorized specialized writes must invalidate old document drafts by advancing its revision; do not let grants or an arbitrary caller-set GUC act as a bypass.
4. Persist client request envelope before dispatch. On timeout/network ambiguity query result by request+actor+hash, keep original payload/revision until reconciled; identical retry only. Definitive no-result cannot prove request is not in flight, so query/retry protocol must share server locking. Preserve request through refresh; no automatic fresh ID on retry.
5. Conversion should check source revision under the same parent lock and capture complete source snapshot within transaction. Preserve existing line ordering and unit_price_entered, but do not copy Quote FX fields into schemas lacking them. Inquiry conversion likewise validates selected IDs and snapshots under source lock.
6. Adapt inline/list/legacy entry points and batch actions in same release, or explicitly fail closed. New revision-bearing reads must include totals views used by current UI. Do not clear drafts until committed response or resolved result has been applied.

Recommended local tests: partial line failure rolls back header/lines/invalidation; double request commits once; same UUID changed payload conflicts; stale draft rejected after inline edit; direct REST writes rejected for active member; old converters rejected; void fields rejected under definer role; currency change with receipt rejected; foreign/duplicate line IDs rejected; lineage remains unchanged; post-save canonical line IDs are returned; result lookup cannot expose another actor's request. No production verification was attempted.


## Commercial client implementation follow-up

The parent task subsequently authorized implementation in the same local tree. Quote/PI/Order detail editors now load coherent snapshots and submit a single atomic save; creation persists its client UUID; conversion captures the source revision when the confirmation dialog opens; inquiry and commercial conversion use the durable source operation. Successful writes apply canonical returned IDs/revision. Save/create errors expose result lookup without creating a second write. Existing forms, calculations and export snapshots remain in place.

Verification on 2026-11-11: `npx tsc --noEmit -p tsconfig.app.json` passed; six targeted browser suites (`quoteWorkflow`, `documentWorkflow`, `QuoteEditReadiness`, `DocumentEditReadiness`, `quotes`, `documents`) passed 101 tests. Added stale-draft revision coverage and converted old partial-REST-save tests to committed-response-loss recovery tests. Browser providers explicitly opt into the test atomic adapter; database rollback/security claims require the independent SQL tests. No remote operations were performed.


### Recovery follow-up

Confirmed a P1 during review: resolving request A after the user edited draft B would replace B with A. Detail editors now compare the submitted draft signature before applying a resolved snapshot. Changed drafts remain dirty and visible; the user can explicitly discard them and load the saved result. Direct creation similarly retains changed buyer inputs and shows a link to the created document instead of navigating automatically. Added six real browser regressions across Quote/PI/Order detail and creation. Four affected browser suites passed 88 tests; TypeScript and diff whitespace checks passed.

### Legacy workbench SQL compatibility

Updated authenticated workbench business writes to invoke the atomic document RPC through temporary SECURITY INVOKER test helpers. Historical action fixtures alone use admin setup; permission assertions remain authenticated/anon. Currency immutability, payment invalidation, audit-failure rollback and refresh notifications retain their original assertions. Feed queries scope to their QA fixture because the restored local clone contains unrelated manual tasks.

The first adapted run exposed a real integration defect: `romiku_wb_manage` inspected policies for all roles, so the new executor-only active-member policy made ordinary workbench actions return FORBIDDEN. Reported to the server implementer for a role-aware production fix; existing security assertions were not weakened.

After the role-aware server fix was applied to the local clone, all six workbench SQL suites passed (160 assertions). Evidence: `workbench-sql/summary.json` and six per-suite logs. All suites rolled back fixtures; no remote database was used.


### Final Preview clone legacy regression (2026-11-12)

Ran all 38 legacy SQL suites against `atomic_save_preview_final_20261111`, including `romiku_health_workbench`, `romiku_production_workbench`, and all six `romiku_workbench_*` suites. All 1,575 pgTAP assertions passed. Evidence is in `sql-regression/summary.json` and 38 logs.

Remaining changes were test-contract adaptations, not removed assertions: legacy direct protected writes now expect `42501`; FX/rates, amounts, packing capacity, production allocation, provenance and void-restoration invariants execute through actual atomic RPCs with SECURITY INVOKER test adapters. Disabled/outsider batch calls now assert permission errors. Health permission tests retain all direct-write denials and add authenticated atomic positive controls for both actors. Customer history compares saved business fields while excluding the newly incremented revision. Commercial price-conversion tests now authenticate an active fixture user. The broad core numbering test isolates restored commercial fixtures with transaction-local TRUNCATE/CASCADE before setup; the transaction rolls back all cleanup and fixture changes.

Shared SQL helper includes use `\ir helpers/document_atomic.sql` relative to each test file, compatible with normal `psql -f` execution; the local Docker stdin runner expands that include before dispatch. No remote host or production database was accessed.
