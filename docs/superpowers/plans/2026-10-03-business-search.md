# Business Search and Production Delete Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. User authorized continuous implementation and Preview acceptance.

**Goal:** Complete Production controlled deletion and unified historical business search across eight resources.
**Architecture:** Indexed per-row stored generated business text feeds a static invoker RPC. Shared frontend search consumes grouped pages; module hydration preserves RPC ordering. Existing delete RPC gains Production.
**Tech Stack:** PostgreSQL/Supabase, pg_trgm, React/React Query/ra-core, Vitest, pgTAP.
**Spec:** ../specs/2026-10-03-business-search-design.md

## Global Constraints
- Preview only ciwaibtotispazfviims, Vercel romiku-crm-prod, existing branch/origin.
- SECURITY INVOKER search and SECURITY DEFINER delete; fixed whitelists, authenticated-only, RLS for search.
- Frozen XLSX, no Sanity or production; preserve excluded uncommitted files.
- Use real DB pgTAP; no client all-record filtering; maintain saved snapshots and rank order.

## Review Focus
- Short/empty/escaped and phone-looking queries must not widen matches unexpectedly (Task 2).
- Source Order contains another product: Production/Packing must not match it (Task 2).
- RPC hydration arrives in reversed order: visible rank must remain unchanged (Task 3).
- Changing query during Load More must not append stale results (Task 3).
- Followup failure/deletion must roll back and preserve manual tasks and source data (Task 1).

### Task 1: Production controlled deletion
**Files:** migration 20261003100000_production_controlled_delete.sql; supabase/tests/romiku_production_delete.test.sql; shared/RecordDelete.tsx and test; production/FulfillmentPages.tsx; QuotePages.tsx; DocumentPages.tsx; declarative functions/grants.
**Interface:** existing RPC adds kind production; HAS_DOWNSTREAM dependencies.production_followups=N. UI small title-row ellipsis; redirect /production.
- [x] Write pgTAP tests for missing record, 2 followups block, manual link detach, source preservation, counter retention, rollback, direct delete denied; run RED.
- [x] Implement static RPC branch with parent lock, count, detach, item/header delete; run GREEN.
- [x] Add UI Production detail test, run RED; integrate shared delete kind and align title row for five details; run GREEN.
- [x] Review scoped changes; commit tested task.

### Task 2: Indexed server search
**Files:** migration 20261003110000_business_search.sql; supabase/tests/romiku_search.test.sql; declarative schema files (search-specific file allowed; do not overlap Task 1 functions until coordinator sync).
**Interface:** exact RPC/response/filters/group pagination from Spec. Defaults query '', resource_types null=>all, limit25,offset0,filters{}. Rank 0 exact number/SKU,1 identity/phone exact,2 prefix,3 partial.
- [x] Write pgTAP fixtures proving field coverage, all eight resources, >25 pagination, phone, historic snapshots, false-positive exclusion, archived, ranking/dedup, permissions/RLS and literal escaping; run RED before implementation.
- [x] Implement explicit immutable extraction helpers, stored generated searchable columns and GIN indexes, relationship indexes, static match union and invoker grouped RPC. Empty query returns empty groups; malformed args reject safely.
- [x] Apply only local migration, run GREEN; inspect EXPLAIN for selective trigram matching on substantial fixture data.
- [x] Review scoped changes and provide schema sync/report; commit through coordinator.

### Task 3: Search frontend and navigation
**Files:** new src/components/romiku/search/{search.ts,useBusinessSearch.ts,GlobalSearch.tsx,SearchInput.tsx} and tests; QuotePages.tsx,DocumentPages.tsx,FulfillmentPages.tsx; routes/navigation.ts,RomikuRoutes.tsx.
**Interface:** exact Task2 RPC response. Single resource query module; filters status/order_id. Empty input preserves current normal list. Query key romiku-search. At most 2 requests: RPC then getMany/batch ID filter on existing view; reorder by RPC ids.
- [x] Add failing tests showing sorted hydration, server pagination/count, per-resource independent load more, query change reset/stale isolation, readable errors, navigation.
- [x] Implement shared typed API/hook/input with debounce300ms and global page eight groups limit5; integrate five module search fields.
- [x] Preserve existing non-search behavior, filters and deletion count/page navigation; run affected frontend suites GREEN.
- [x] Review scoped changes and report changed files/test output; commit through coordinator.

### Task 4: Integrate, review and verify
- [x] Synchronize declarative schema with local applied migrations; pg_dump format for functions.
- [x] Run whole frontend suite, all pgTAP, relevant concurrency checks, typecheck/lint/build; fix actual regressions.
- [x] Independent whole-branch review for security, snapshot correctness, rank/order, reactive counts; resolve findings.
- [ ] Commit only intended files; push current branch to existing origin.

### Task 5: Preview migration, deployment and browser acceptance
- [ ] Use validated Session Pooler/getpass to audit Preview migration state and apply only these two migrations; run isolated rollback pgTAP.
- [ ] Inspect branch Preview on existing Vercel project and exact Supabase URL.
- [ ] Create only disposable Preview QA fixtures; browser exercise fields, all five document SKU matches, multi-page/per-group Load More, historical independence, normalized phone, Production blocked/success deletion and immediate search count refresh.
- [ ] Verify source/task preservation and cleanup fixtures; report SHA, migrations, automated tests, Preview URL, browser results and untouched Production.
