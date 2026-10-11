# ROMIKU Manual Search Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every active remote text search in ROMIKU CRM 2.0 run only on explicit Enter or 搜索, then accept the exact commit on Preview.

**Architecture:** A reusable manual search control owns input, submit, clear, and IME handling; each list owns its committed query and pagination. Existing query keys and data providers continue to fetch, with prior visible rows retained through transitions. Server-backed selectors get explicit submission; local selectors keep local filtering.

**Tech Stack:** React 19, TypeScript, ra-core, TanStack Query, Vitest browser, Vercel Preview.

**Spec:** `docs/operations/manual-search-preview-spec.md`

## Global Constraints

- Preview only; no Production deployment or Production database/environment modification.
- No migration, backend RPC/index/ranking change, Namecheap, Website Inquiry ingestion, Sanity write, or XLSX template/layout change.
- Existing structured filters may continue immediate execution; only text search becomes manual.
- Main list labels are 搜索 and 清空; IME composition Enter never commits.
- Preserve rows through searches and failures; retry uses committed text.

## Review Focus

- Empty and whitespace submissions must return to the default list only when explicitly submitted.
- A stale response arriving after a newer committed query must not replace newer rows.
- A list on page 4 must stay there while typing and reset to page 1 on submit.
- Website Inquiry polling or manual refresh while draft input differs must still use committed text.
- Error then retry must not accidentally submit a newer uncommitted draft.

---

### Task 1: Shared manual search state and control

**Files:** Create `src/components/romiku/search/ManualSearchInput.tsx`; test `src/components/romiku/search/ManualSearchInput.test.tsx`.

**Interfaces:** `ManualSearchInput({label,value,onChange,onSubmit,onClear,busy})` owns only control events. Parent owns committed text and page. Enter ignores `nativeEvent.isComposing` and keyCode 229.

- [ ] Write browser tests for typing without submit, Enter, button, clear, edit during busy, and IME Enter.
- [ ] Run focused test and confirm expected failures.
- [ ] Implement the control with 搜索/清空 buttons and accessible status.
- [ ] Run focused test to green and commit.

### Task 2: Shared ROMIKU module lists

**Files:** Modify `src/components/romiku/search/useBusinessSearch.ts`, `src/components/romiku/quotes/QuotePages.tsx`, `src/components/romiku/orders/DocumentPages.tsx`, `src/components/romiku/production/FulfillmentPages.tsx`; extend `src/components/romiku/search/ModuleSearch.test.tsx`.

**Interfaces:** `useModuleSearch(type,resource,committedSearch,page,filters)` queries immediately for committed text; list components pass only committed text. PI/Order and Production/Packing remain shared implementations.

- [ ] Write tests for all five modules: no typed RPC, Enter/button/clear, page/filter, rows during fetch/error, race.
- [ ] Run focused tests red.
- [ ] Replace debounced direct input with staged and committed state; keep prior rows while fetching.
- [ ] Run focused tests green and commit.

### Task 3: WorkflowPage searches

**Files:** Modify `src/components/romiku/outbound/WorkflowPage.tsx`; extend `src/components/romiku/inquiries/InquiryFreshness.test.tsx` and `src/components/romiku/outbound/WorkflowPage.test.tsx`.

**Interfaces:** WorkflowPage's shared input serves Inquiry, Outbound, Formal Customer. Its existing polling hook receives committed search; owner/status filters remain immediate.

- [ ] Write tests for no typed query, explicit submit/clear, retained filter, polling/refresh with committed text, error/race.
- [ ] Run focused tests red.
- [ ] Implement shared manual control and stable rows.
- [ ] Run focused tests green and commit.

### Task 4: Product Library and Global Search

**Files:** Modify `src/components/romiku/products/SanityCatalogList.tsx`, `src/components/romiku/search/GlobalSearch.tsx`; extend their existing tests.

**Interfaces:** Product Library fetches on committed text and retains products, overlay, and images until successful replacement. Global Search URL `q` tracks committed text and result groups are keyed to it.

- [ ] Write tests for typed no-request, submit/clear, loading/error row preservation, race, IME.
- [ ] Run focused tests red.
- [ ] Implement state and display changes without changing search semantics.
- [ ] Run focused tests green and commit.

### Task 5: Customer 360 and selectors

**Files:** Modify `src/components/romiku/customers/Customer360.tsx`, `src/components/romiku/commercial/FormalCustomerSelector.tsx`, `src/components/romiku/commercial/ProductLibraryLookup.tsx` only as needed; extend their existing tests.

**Interfaces:** Customer 360 commits history query on Enter/button; formal customer combobox Enter first submits changed text then Enter can select a result. Product selector stays explicit; supplier selector stays local.

- [ ] Write tests for server query suppression and selector keyboard/IME behavior.
- [ ] Run focused tests red.
- [ ] Implement manual committed queries and preserve explicit selection behavior.
- [ ] Run focused tests green and commit.

### Task 6: Supplier and legacy active search inputs

**Files:** Modify `src/components/romiku/suppliers/SupplierLists.tsx`, `src/components/admin/search-input.tsx`, any required frontend supplier query adapter; add focused tests.

**Interfaces:** Supplier search is server-side via existing data provider filters. Shared admin search stages locally, then writes its committed value to FilterLiveForm only on explicit action.

- [ ] Write tests for Supplier and Contacts/Companies/Deals/Sales no per-character request, submit, clear, pagination.
- [ ] Run focused tests red.
- [ ] Implement supplier search and shared admin search control.
- [ ] Run focused tests green and commit.

### Task 7: Full audit, regression, Preview release

**Files:** Create `docs/operations/manual-search-preview-results.md`; no backend files.

- [ ] Run source audit for every active search input and classify server/local/no-search surfaces.
- [ ] Run full frontend tests, typecheck, lint, build, and five XLSX regressions; fix only failures caused by this change.
- [ ] Review diff for migration/backend/XLSX/Sanity/Production changes and commit final SHA.
- [ ] Deploy exact SHA to Preview with Preview-scoped variables; verify runtime target and Production alias/env unchanged.
- [ ] Run read-only Preview browser acceptance for main modules and selectors; record PASS/FAIL and remaining limitations.
