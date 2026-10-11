# ROMIKU manual search Preview specification

Source of requirements: the user's 2026-10-11 pasted search interaction rules. This document records implementation decisions for the existing frontend.

## Outcome and boundary

Every active text search that can cause a remote query keeps an editable `searchInput` separate from `committedSearch`. Typing and IME composition change only the input. Enter outside composition or the visible **搜索** button commits the trimmed text and resets pagination to page 1. **清空** clears both values and returns to the default list immediately. Existing structured filters continue to apply on selection. Existing local combobox filtering remains immediate. Deploy and accept only on Preview; no Production, database, migration, environment, Namecheap, ingestion, Sanity write, or XLSX changes.

## Inventory and treatment

| Surface | Existing behavior | Decision |
| --- | --- | --- |
| Product Library | Sanity fetch on every input; whole list replaced by loading | Manual commit; retain rows and overlay through fetch/error |
| Global Search | 300 ms debounce RPC; input also updates URL | Manual commit; URL `q` represents committed query only |
| Website Inquiry, Outbound, Formal Customer | Shared `WorkflowPage`; input directly changes RPC or list filter | Shared manual control; polling and refresh use committed query |
| Quote, PI, Order, Production, Packing | Shared `useModuleSearch` debounces direct input | Shared manual control and direct committed query; retain displayed rows |
| Supplier | No main list search input | Add manual server-side name/region search without changing supplier data |
| Customer 360 | 300 ms debounce RPC | Change only its text trigger to manual commit; preserve history/documents behavior |
| Formal Customer selector | 200 ms debounce server directory | Enter submits text when not composing; selection remains an explicit second action |
| Product selector | `ProductLibraryLookup` already submits search on Enter; typing does not request | Preserve behavior; add composition guard if needed |
| Supplier selector | `ReferenceInput` / `SelectInput` has no remote typed search | Preserve immediate local option filtering, if present |
| Legacy Contacts, Companies, Deals, Sales lists | Shared admin `SearchInput` in `FilterLiveForm` submits each keystroke | Make shared input stage text locally and commit to filter form on Enter/button |
| Workbench / Calendar | No main text search | No search UI added |

## Data and display rules

- Search requests and query keys depend only on committed text, current page, and current structured filters. A later committed request cannot be overwritten by an older response; retain current query architecture cancellation or key isolation.
- Initial no-data loading may show a loading paragraph. Once rows exist, keep them visible while a new search fetches; show a small **搜索中…** indicator. On error keep prior rows and offer **重试**, using committed text.
- The input remains editable during loading. A second query starts only after another explicit commit. Clear starts the default-list query immediately.
- Pagination resets only on commit, clear, or an existing structured-filter change; typing alone does not alter page or selection.
- Website Inquiry 30-second polling, focus refresh, and last-refresh display continue, using the committed query. Manual refresh never commits draft input.
- Main list controls display **搜索** and **清空**. IME composition Enter never submits. Product/customer/supplier selection UX keeps its smaller existing layout where appropriate.

## Acceptance

Test no query on typing `B`→`BQ`→`BQV`→`BQV10`; one query on Enter/button; edit during fetch; second explicit commit; clear; page/filter behavior; retained rows on fetch/error; old-request race; IME Enter. Run all frontend tests, typecheck, lint, build, five XLSX regressions, and read-only Preview browser checks. Record each module and selector separately. The release is incomplete if any active main list still requests on each typed character.
