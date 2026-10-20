# Product Supplier Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Product Library safe edit, replace, delete, and current-page bulk supplier actions while preserving relation identity and procurement history.

**Architecture:** Preview-only PostgreSQL RPCs own cross-row transactions, dependency checks, idempotence, and preferred uniqueness. React separates the three single-product actions and adds a current-page bulk dialog with a server-calculated preview. Existing Sanity catalog reads remain read-only.

**Tech Stack:** React 19, TypeScript, Vitest, Supabase/PostgreSQL, pgTAP, Vite.

**Spec:** `docs/superpowers/specs/2026-10-20-product-supplier-management-design.md`

## Global Constraints

- Base SHA: `8600933d6bf95aa898fb2e8866b6f0ebfb69d1f8`; branch: `codex/product-supplier-management`.
- Preview only. Do not access Production Supabase, deploy Production, or execute a Production migration.
- Never write Sanity, cost history, product packing defaults, historical documents, or XLSX template/layout.
- Replace always deactivates the source; an inactive target is reactivated and preserves its own fields; an active target returns `ALREADY_LINKED`.
- Bulk affects at most 50 loaded SKUs and inserts/reactivates only. Explicit preferred selection is the sole allowed update to existing active associations.
- No fuzzy SKU matching or implicit supplier identity edits.

## Review Focus

- A concurrent first cost insert during replacement must leave the original relation and cost linked; Task 1 tests this.
- An inactive target with its own MOQ/cost must be reactivated without inheriting source fields; Task 1 tests this.
- A stale bulk preview after another user changes links must cause zero writes; Task 2 tests this.
- Search/page transitions must clear selection before another bulk action; Task 4 tests this.
- A supplier already active for the SKU must not be duplicated or silently overwritten; Tasks 1 and 2 test this.

---

### Task 1: Safe single-relation database operations

**Files:**
- Create: `supabase/migrations/20261020100000_product_supplier_management.sql`
- Create: `supabase/schemas/22_product_supplier_management.sql`
- Modify: `supabase/schemas/04_triggers.sql`, `supabase/schemas/06_grants.sql`
- Create: `supabase/tests/romiku_product_supplier_management.test.sql`

**Interfaces:**
- `romiku_save_product_supplier(relation_id uuid, supplier_item_number text, moq numeric, lead_days integer, preferred boolean, qty_per_carton numeric, length_cm numeric, width_cm numeric, height_cm numeric, carton_weight_kg numeric, reference_date date, notes text) returns jsonb` edits procurement fields and preferred, never identity.
- `romiku_replace_product_supplier(source_relation_id uuid, target_supplier_id uuid, make_preferred boolean) returns jsonb` returns `ok`, source/target relation IDs, or `ALREADY_LINKED`/safe error code.
- `romiku_delete_product_supplier(relation_id uuid) returns jsonb` returns dependency counts or successful deletion.
- These signatures are internal design targets; if existing `ProductSupplierInputs` cannot supply every optional field, the RPC still preserves omitted fields rather than nulling them.

- [ ] **Step 1: Write failing pgTAP cases** for missing/anonymous auth, immutable identity, edit without a second row, replacement to new/inactive/active target, cost history preserved during replacement and concurrent insert, preferred transfer, blocked delete with cost count, dependency-free delete, and direct authenticated DELETE denied.
- [ ] **Step 2: Run `npx supabase test db` against local Supabase** and verify the new cases fail because the RPCs/guards do not yet exist; do not use a linked remote project.
- [ ] **Step 3: Inspect Preview read-only schema and ledger** for any existing Preview-only product-supplier delete function/grants and active preferred duplicates. Record exact conflicts; stop migration if a conflict cannot be safely resolved without business data edits.
- [ ] **Step 4: Implement the migration and declarative schema** with fixed `search_path`, authenticated-only execution, server-side locks, identity-update guard, cost FK preflight, direct DELETE revoke, and an active-preferred unique index. Do not change table columns or historic rows.
- [ ] **Step 5: Re-run the local pgTAP suite**; expected: all new and existing supplier tests PASS.
- [ ] **Step 6: Commit the SQL and tests** with one focused commit.

### Task 2: Preview and apply current-page bulk assignment

**Files:**
- Modify: `supabase/migrations/20261020100000_product_supplier_management.sql` and `supabase/schemas/22_product_supplier_management.sql` before the Task 1 migration is deployed
- Test: `supabase/tests/romiku_product_supplier_management.test.sql`

**Interfaces:**
- `romiku_preview_bulk_product_suppliers(products jsonb, supplier_ids uuid[], preferred_supplier_id uuid) returns jsonb` returns counts, invalid SKUs, and a plan token without writes.
- `romiku_apply_bulk_product_suppliers(products jsonb, supplier_ids uuid[], preferred_supplier_id uuid, expected_plan_token text) returns jsonb` returns actual inserted/reactivated/skipped/preferred counts or `PREVIEW_STALE` without writes.
- Each product input is `{sku:string,sanity_product_id:string}` from the loaded catalog page; max 50 distinct valid SKUs. The server rejects oversize input and preferred IDs outside the selected supplier set.

- [ ] **Step 1: Add failing pgTAP cases** for two suppliers × several products, active skip, inactive reactivation preserving target data, repeat idempotence, no/duplicate SKU, oversize input, stale preview, concurrent duplicate/preferred attempts, and no preferred override when none chosen.
- [ ] **Step 2: Run local database tests**; expected: these cases fail before bulk functions exist.
- [ ] **Step 3: Implement preview/apply functions** using deterministic per-SKU transaction locks, existing `(sku,supplier_id)` uniqueness, full server-side plan recomputation, and atomic preferred updates. Cap supplier count and total pairs; return explicit safe errors.
- [ ] **Step 4: Run local database tests**; expected: all bulk and Task 1 cases PASS.
- [ ] **Step 5: Commit the completed migration/schema/test change**; if Task 1 was committed already, this commit extends that same as-yet-unapplied Preview migration, never a Production migration.

### Task 3: Typed CRM client and single-product UI

**Files:**
- Create: `src/components/romiku/products/productSupplierManagementClient.ts`
- Test: `src/components/romiku/products/productSupplierManagementClient.test.ts`
- Modify: `src/components/romiku/products/SanityProductDrawer.tsx`, `src/components/romiku/products/SanityProductDrawer.test.tsx`
- Modify: `src/components/romiku/products/ProductSupplierInputs.tsx`, `src/components/romiku/products/ProductForms.tsx`
- Modify: `src/components/romiku/products/productProcurementOverlay.ts` and its test

**Interfaces:**
- `ProductSupplierManagementClient` exposes typed `save`, `replace`, `remove`, `previewBulk`, and `applyBulk` methods wrapping the Task 1–2 RPCs.
- Existing drawer `client` injection remains usable in tests; new methods may be supplied through a separate optional management client prop to avoid breaking read mocks.

- [ ] **Step 1: Write failing client and component tests** for fixed supplier identity during edit, separate replace/delete controls, inactive-history display, duplicate-target message, cost-history delete block, cancel/dirty lifecycle, and active-only overlay summaries.
- [ ] **Step 2: Run targeted Vitest tests**; expected: new cases fail on current behavior.
- [ ] **Step 3: Implement RPC adapter and Drawer actions**; refresh overlay only after success, never navigate to Supplier Master, and preserve unsaved form on failure.
- [ ] **Step 4: Restrict standalone `ProductSupplierEdit` identity fields** and route its saves through the same management client. Keep create behavior explicit and free of implicit replacement.
- [ ] **Step 5: Run targeted Vitest and typecheck**; expected: PASS.
- [ ] **Step 6: Commit the typed client and single-product UI.**

### Task 4: Current-page catalog selection and bulk dialog

**Files:**
- Create: `src/components/romiku/products/BulkSupplierDialog.tsx` and test
- Modify: `src/components/romiku/products/SanityCatalogList.tsx`, `SanityCatalogList.test.tsx`
- Reuse: `sanityCatalogSource.ts` cursor interface, Task 3 management client

**Interfaces:**
- Dialog props: selected `SanityCatalogProduct[]`, `SupplierOption[]`, `onApplied(): Promise<void>`, `onClose(): void`, and `ProductSupplierManagementClient`.
- Selection state is a set of loaded product IDs, reset on committed search and cursor change. Next/previous cursor navigation displays no more than 50 products.

- [ ] **Step 1: Write failing UI tests** for row checkbox, current-page select all, 50-item boundary, toolbar count/clear, search/page reset, multi-supplier selection, optional single preferred, preview counts, second confirmation, and errors without writes.
- [ ] **Step 2: Run targeted Vitest tests**; expected: new cases fail.
- [ ] **Step 3: Implement page cursor navigation and selection** without changing manual-search submission behavior.
- [ ] **Step 4: Implement the dialog** using server preview and expected plan token; display inserted/reactivated/skipped/invalid counts and preferred exception before confirmation.
- [ ] **Step 5: Run targeted Vitest and typecheck**; expected: PASS.
- [ ] **Step 6: Commit catalog bulk UI.**

### Task 5: Regression and Preview acceptance

**Files:**
- Add only focused test fixes proven necessary by a regression; do not change unrelated business code.

**Interfaces:**
- Task 1–4 commits and one Preview-only migration produce a fixed candidate SHA.

- [ ] **Step 1: Run `npm ci` in the isolated worktree**, then `npm run test:unit:app -- --run`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:pwa-cache`; record counts and errors.
- [ ] **Step 2: Run `npx supabase test db` locally**; expected: supplier management and existing SQL suites PASS.
- [ ] **Step 3: Run five XLSX renderer regressions** with `npm run test:unit:app -- --run src/components/romiku/quotes/quoteXlsxRenderer.test.ts src/components/romiku/orders/piXlsxRenderer.test.ts src/components/romiku/orders/orderXlsxRenderer.test.ts src/components/romiku/production/productionXlsxRenderer.test.ts src/components/romiku/packing/packingXlsxRenderer.test.ts`; expected: all PASS and template/layout unchanged.
- [ ] **Step 4: Inspect candidate diff and Git status**; ensure no unrelated features or extra migrations and commit the final reviewed candidate.
- [ ] **Step 5: Apply the sole new migration to Preview only** after Preview ledger/schema preflight, then deploy the exact candidate SHA to a Preview branch environment whose Supabase ref is `ciwaibtotispazfviims`.
- [ ] **Step 6: Perform real Preview acceptance** with explicitly marked disposable product/supplier fixtures: edit, replace to new/inactive/active, dependency block, dependency-free relation delete, multi-select/bulk preview/apply/retry, preferred uniqueness, refresh, and zero Sanity or Production requests. Clean up only fixtures created in this run.
- [ ] **Step 7: Report candidate SHA, Preview URL, migration and ledger, tests, functional outcomes, and Production unchanged.**
