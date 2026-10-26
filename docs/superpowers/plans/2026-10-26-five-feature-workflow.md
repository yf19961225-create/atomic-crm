# Five Feature Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the five approved improvements together and validate one final Preview SHA.

**Architecture:** Shared commercial-row navigation, shared ranked GROQ catalog query, read-only RLS production parent aggregation, shared semantic calendar controls. Preserve current document persistence and exports unless a reproduced failure requires a minimal fix.

**Tech Stack:** React 19, TypeScript, Vitest Chromium, PostgreSQL/Supabase, GROQ, Vite.

**Spec:** docs/superpowers/specs/2026-10-26-five-feature-workflow-design.md

## Global Constraints

- Baseline 036594bac9a8f54746339c418832bffefe98ca8c; branch codex/five-feature-workflow-optimization.
- Preview ciwaibtotispazfviims only; no Production database access, migration, deployment or env change.
- Sanity read-only; no history rewrite, order status mutation or XLSX layout changes.
- One final same-SHA Preview; no repeated design approval needed.
- DATE preserves calendar date; datetime preserves instant/time; factory due date preserves Shanghai end-of-day rules.

## Review Focus

- Rapid Enter while state updates must not duplicate draft rows (Task 1).
- Punctuation-only queries and mismatched cursor must remain bounded (Task 2).
- RLS-hidden children must not leak counts, supplier names or parent membership (Task 3).
- Unchanged datetime seconds/offset and DST transitions must not mutate stored instants (Task 4).
- Duplicate document number rejection must preserve UUID and saved export identity (Task 5).

---

### Task 1: Stable continuous commercial row entry

**Files:** Modify src/components/romiku/commercial/CommercialLineItemsTable.tsx; test CommercialLineItemsTable.test.tsx and commercialLineDisplay.test.ts.
**Interfaces:** Consumes commercialDisplayRows/items/draftRows; produces stable ID focus requests after render, preserving existing onItemsChange and entered-price contracts.

- [ ] Step 1: Run clean baseline `npm run test:unit:app -- --run`, recording Node/npm/install and output. Expected: no unexplained failure.
- [ ] Step 2: Add browser tests for final-field Enter in Quote CBM and PI/Order unit price: 5/10/20 entries, existing next row, existing blank, repeated key, IME and blank payload exclusion. Assert next SKU focus and exactly one draft.
- [ ] Step 3: Run `npm run test:unit:app -- --run src/components/romiku/commercial/CommercialLineItemsTable.test.tsx`. Expected: new tests FAIL for missing next draft/focus.
- [ ] Step 4: Replace index/timer navigation with visible-row stable keys and post-render focus; add final CBM Enter handler, prevent default and ignore composing/repeat.
- [ ] Step 5: Run the same targeted test plus commercialLineDisplay tests. Expected: PASS. Commit task.

### Task 2: Shared ranked canonical Sanity search

**Files:** Create shared/productCatalogQuery.ts and tests; modify api/product-catalog.ts, src/components/romiku/products/sanityCatalogSource.ts and their tests.
**Interfaces:** buildProductCatalogQuery({search,after,pageSize}) returns GROQ/params; cursor binds normalized search and rank/sku/id. Page size 50, upstream 51.

- [ ] Step 1: Add tests asserting canonical query on both stored SKU and input, exact/prefix/substring/name rank, stable bounded cursor, invalid cursor/search rejection, punctuation-only query and name languages retained.
- [ ] Step 2: Run catalog API/source/query targeted tests. Expected: new ranking/canonical assertions FAIL.
- [ ] Step 3: Implement shared query and cursor validation, wire both sources, preserve original projection and image exact matching.
- [ ] Step 4: Run same targeted tests. Expected: PASS. Read-only real Sanity query for XSUV-704, XSUV704, xsuv 704, SUV704, SUNSF20MAXR; record matching IDs/latency/page bounds; honestly report absent catalog SKU. Commit task.

### Task 3: Order-level production management

**Files:** Create production/ProductionOrderGroups.tsx, productionOrderGroups.ts and tests; modify production/FulfillmentPages.tsx; create supabase/schemas/14_production_order_groups.sql, supabase/migrations/20261026100000_production_order_groups.sql and supabase/tests/romiku_production_order_groups.test.sql.
**Interfaces:** romiku_list_production_order_groups(p_search text,p_view text,p_page integer,p_page_size integer,p_order_id uuid) returns JSON {rows,total}; row includes parent fields and visible child aggregate counts. SECURITY INVOKER, empty search_path, authenticated only, SELECT only. UI fetches bounded complete child history per expansion.

- [ ] Step 1: Add SQL tests for cross-page children, all four statuses, canceled denominator, search by parent/child/supplier/customer, RLS-hidden rows, authenticated permissions, invalid parameters, zero-result page and order filter. Add UI tests for default ongoing, expand/full history, parent pagination and child-only selection reset.
- [ ] Step 2: Run SQL and UI tests locally. Expected: new function/module absent FAIL, not infrastructure error.
- [ ] Step 3: Implement read-only aggregate before filter/page, stable latest child/UUID sorting, bounded page size; UI separate from packing. Never change order status or writes.
- [ ] Step 4: Run SQL/UI tests. Expected: PASS. Explain migration dependency and inspect EXPLAIN before adding any index. Commit task.

### Task 4: Semantic business date controls and all existing integrations

**Files:** Create shared/RomikuDatePicker.tsx, businessDate.ts and tests; modify DocumentHeaderSummary.tsx, outbound/WorkflowFields.tsx, RelatedRecords.tsx, orders/DocumentPages.tsx, payments/OrderPayments.tsx, calendar/ManualTasks.tsx, products/ProductSupplierInputs.tsx, products/ProcurementCostInputs.tsx, products/SanityProductDrawer.tsx, production/ProductionWorkbench.tsx and relevant tests.
**Interfaces:** RomikuDatePicker value/onChange date-only string, nullable clear, required; RomikuDateTimePicker ISO value/onChange retaining unchanged instant and local time. Existing factory-due helpers remain conversion authority.

- [ ] Step 1: Add tests calendar select/month/year/today/clear/required/original positioning, leap days, zones UTC/Shanghai/Los Angeles, DST invalid/ambiguous times, unchanged seconds; factory date roundtrip. Assert explicit existing-field coverage from spec inventory.
- [ ] Step 2: Run new shared date tests and existing factory due tests. Expected: new calendar tests FAIL.
- [ ] Step 3: Implement common controlled calendar popover with accessible month/year and time controls, preserve raw invalid/unchanged values and null semantics; wire every existing editable business date, no new schema-only entries. Integrate admin useInput without global admin behavior change.
- [ ] Step 4: Run date and affected module tests. Expected: PASS. Produce field-by-field coverage report with storage type/conversion. Commit task.

### Task 5: Saved document identity/export regression

**Files:** Test orders/documentWorkflow.test.ts, orders/orderExportModel.test.ts, orders/orderXlsxRenderer.test.ts, orders/DocumentPages.test.tsx (use actual existing test names if located elsewhere). Production files only if failing test proves a bug.
**Interfaces:** Existing documentHeaderWrite/document save model.documentNumber/J1/filename contract unchanged.

- [ ] Step 1: Add regression verifying edited document_number persisted, refreshed record drives model/J1/filename, UUID/relations unchanged, duplicate rejection leaves saved state; Quote/PI regression.
- [ ] Step 2: Run relevant tests. Expected: existing correct behavior PASS; if FAIL diagnose then minimal fix, no template edits.
- [ ] Step 3: Commit tests and any proven minimal fix. Preview real marked QA order rename/save/reopen/XLSX verification performed in Task 6.

### Task 6: Unified release candidate verification and Preview

**Files:** Update plan progress, acceptance report and date inventory under docs/superpowers; no unrelated changes.
**Interfaces:** All five tasks integrated at one committed SHA; sole additive read-only migration from Task 3.

- [ ] Step 1: Run full `npm run test:unit:app -- --run`, local SQL tests, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:pwa-cache`, all five XLSX regression suites. Expected: PASS with skips named, no unexplained baseline differences.
- [ ] Step 2: Fresh whole-branch code review against spec/plan and rulings; important fixes require failing regression then green full suite. Expected: no unresolved important finding.
- [ ] Step 3: Preview read-only preflight ledger/schema/RLS/status conflicts and approved migration dependencies; STOP on missing dependency/history conflict. If safe apply only reviewed Preview migration; verify no existing business data rewrite.
- [ ] Step 4: Push exact candidate and deploy branch-scoped Preview with URLs ciwaibtotispazfviims, verify version.json/crm-build same SHA, never Production env.
- [ ] Step 5: Same Preview desktop/390px: Quote/PI/Order 5/10/20 entry, real canonical queries, production groups/filter/page/history, complete calendar coverage, marked QA number save/reopen/XLSX. Track all test IDs, restore only known test records/clean own removable fixtures, keep append-only artifacts safe.
- [ ] Step 6: Clear Network, repeat read-only flow and count Preview/Production; Sanity write0, Production request0, no new fatal console. Report exact evidence gaps honestly. Final candidate SHA, URL, migration, suites, screenshots, cleanup and isolation report; NO Production publication.
