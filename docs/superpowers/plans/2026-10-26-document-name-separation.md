# Document Name Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Independent editable document names and stable formal numbers for Quote, PI and Order.
**Architecture:** Nullable header columns; database UPDATE protection; existing RLS search and conversion extended; shared header UI and display helper; XLSX remains number-based.
**Tech Stack:** React, TypeScript, PostgreSQL, pgTAP, Vitest.
**Spec:** User-approved document-name separation instructions dated 2026-10-26, superseding feature 5 of docs/superpowers/specs/2026-10-26-five-feature-workflow-design.md.

## Global Constraints
- Baseline 6e509f09c9b5bdb31c478cfae0921ceadc2b99dd; same codex/five-feature-workflow-optimization branch.
- No Production access, deployment, environment changes, data writes or Sanity writes.
- No Preview migration until separate authorization after read-only preflight. No dependent Preview deployment.
- No historical names backfill, number regeneration or brand overwrite. Existing four features preserved.

## Review Focus
- Legacy unusual numbers survive unrelated edits verbatim.
- Names containing T, Unicode, whitespace and search wildcard characters remain text.
- Repeated names do not collapse pagination identities or UUID links.
- Conversion preserves unit_price_entered and all previous snapshot/lineage semantics.
- Database number protection also catches direct UPDATE, without blocking initial INSERT numbering.

### Task 1: Database contract
Files: schemas/01_tables.sql, 02_functions.sql, 08_business_search.sql, 23_production_order_groups.sql; migration20261026150000_commercial_document_names.sql; tests/romiku_document_names.test.sql.
- [ ] Add failing pgTAP tests for nullable names, stable numbers, conversion, name search/RLS/paging and production parent names.
- [ ] Verify RED against isolated local database.
- [ ] Add nullable columns without defaults/backfill; protect number updates only on three header tables; extend conversion explicit copy list.
- [ ] Add name-only search UNION branches to existing hits pipeline (no generated column/table rewrite); preserve dedupe/filter/rank/total. Extend parent RPC only name output/search.
- [ ] Verify GREEN and adapt old tests that deliberately rename numbers to new approved contract.

### Task 2: Shared UI and persistence
Files: DocumentHeaderSummary, quoteWorkflow, QuotePages, DocumentPages, productionOrderGroupsQuery, ProductionOrderGroups; new commercial/documentIdentity.ts; corresponding tests.
- [ ] RED tests for name save/clear, readonly number, preserved brand, title/fallback and list UUID links.
- [ ] Implement independent name field, remove number from ordinary save payload, shared title helper, parent name+number.
- [ ] GREEN component and workflow tests; keep numbering, date, price, Enter and search UI unchanged.

### Task 3: Export and regression
- [ ] Replace prior number-renaming acceptance tests with name rename tests asserting unchanged export number/filename/brand.
- [ ] Run Quote/PI/Order XLSX, all five XLSX suites, frontend full, all SQL, typecheck, lint, build, PWA cache.
- [ ] Fresh final code review; address substantive findings with RED/GREEN.
- [ ] Commit tested candidate without deploying.

### Task 4: Preview read-only preflight
- [ ] Inspect Preview ledger, schema, RLS, current functions/triggers and migration dependencies; no mutation.
- [ ] Report exact candidate, local results and preflight; wait for separate Preview migration authorization.
- [ ] Real page/XLSX acceptance deferred until migration and deployment authorized.

## 2026-10-27 compatibility amendment

See `2026-10-27-document-name-function-compatibility-audit.md`. Preview function audit found historical allocator/schema divergence. Preserve both installed allocator functions byte-for-byte; commercial INSERT triggers retain their original arguments and UPDATE moves to a dedicated immutable-number guard. Converter has equivalent behavior in both audited baselines; add only the name projections and reject unreviewed definitions before DDL. Both local baseline suites must pass. Remote migration/deployment remains pending separate authorization.
