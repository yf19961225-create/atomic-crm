# Preview Commercial Operations UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the high-frequency customer, production, packing, and product-library workflows dense, searchable, snapshot-safe, and Preview-only.

**Architecture:** Reuse existing directory views, workflow helpers, document snapshots, and procurement overlays. Add one additive database migration for nullable Production suppliers; UI changes are isolated into shared selector/grid/catalog components rather than duplicating per page.

**Tech Stack:** React, TypeScript, ra-core DataProvider, TanStack Query, Supabase/PostgreSQL, pgTAP, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-preview-commercial-operations-ux-design.md`

## Global Constraints

- Do not deploy or migrate Production; target only `romiku-crm-preview` after local verification.
- Do not modify Production Supabase, `crm2.romiku.com`, or Sanity.
- Do not change document conversion, numbering, payment, or historical snapshot semantics.
- Do not front-load a finite customer list and then filter it client-side.

## Review Focus

- Customer search must return a result beyond the first server page and preserve keyboard selection.
- Supplier-less Production must still validate items and quantities while retaining P numbering.
- Packing quantity/cartons/Qty-per-carton mismatch must warn but never mutate another input or block Save.
- Packing and Production edits must not refresh historical product snapshots from Product Library.
- Product Library must choose supplier packing values in preferred/sole/fallback order without Sanity writes.

### Task 1: Shared searchable Formal Customer selector

**Files:**
- Modify: `src/components/romiku/commercial/FormalCustomerSelector.tsx`
- Modify: `src/components/romiku/commercial/FormalCustomerSelector.test.tsx`
- Modify consumers only as needed in Quote/PI/Order document pages.

- [ ] Write failing tests for debounced server query, page append, keyboard Enter selection, and unlinked selection.
- [ ] Implement `FormalCustomerCombobox` with controlled query, debounce, server-filtered page loading, roving active option, and snapshot selection.
- [ ] Replace direct creation consumers with the shared component and run its focused tests.
- [ ] Commit the selector change.

### Task 2: Nullable Production suppliers

**Files:**
- Create: `supabase/migrations/20260921100000_production_supplier_optional.sql`
- Modify: `src/components/romiku/production/productionWorkflow.ts`
- Modify: `src/components/romiku/production/ProductionCreate.tsx`
- Modify: `src/components/romiku/production/FulfillmentDetail.tsx` or its supplier editor
- Modify: `src/components/romiku/production/productionWorkflow.test.ts`
- Modify: `supabase/tests/romiku_core.test.sql`

- [ ] Add a failing workflow test for an unspecified supplier group and a supplier snapshot update.
- [ ] Add the additive nullable migration and pgTAP assertion; replay locally.
- [ ] Implement nullable grouping, optional create controls, and later supplier update without recreating documents.
- [ ] Run focused workflow/pgTAP tests and commit.

### Task 3: Staged Packing grid

**Files:**
- Create: `src/components/romiku/packing/PackingItemsGrid.tsx`
- Modify: `src/components/romiku/production/FulfillmentDetail.tsx`
- Modify: `src/components/romiku/packing/packingWorkflow.ts`
- Modify: `src/components/romiku/packing/packingWorkflow.test.ts`
- Create or modify: packing grid component tests.

- [ ] Write failing tests for independent quantity/cartons/Qty-per-carton, derived CBM/weight, Save/Cancel staging, and snapshot seed values.
- [ ] Implement the requested column order, numeric alignment, thumbnail, mismatch warning, totals, and explicit batch Save/Cancel.
- [ ] Preserve existing server-side overpacking validation and run focused tests.
- [ ] Commit the grid change.

### Task 4: Compact Product Library catalog

**Files:**
- Modify: `src/components/romiku/products/ProductLibrary.tsx`
- Modify: `src/components/romiku/products/SanityCatalogList.tsx`
- Create: `src/components/romiku/products/productProcurementDisplay.ts`
- Create/modify: Product Library tests.

- [ ] Write failing display-helper/component tests for preferred, sole supplier, Sanity carton quantity fallback, no-dimension placeholder, CBM formatting, supplier `+N`, and modal close behavior.
- [ ] Implement a compact eight-column catalog and Drawer access to full supplier detail; retain existing read-only Sanity access.
- [ ] Run focused tests and commit.

### Task 5: Integration verification and Preview-only deployment

**Files:**
- Test-only changes as required by discovered regressions.

- [ ] Run local migration replay and all pgTAP tests.
- [ ] Run frontend suite, typecheck, lint, and build.
- [ ] Deploy only `codex/commercial-line-items-v2` Preview with the Preview environment variables.
- [ ] Manually accept the four flows on `romiku-crm-preview`; record the Preview URL and commit SHA.
