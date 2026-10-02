# Packing List XLSX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a Preview-only, snapshot-only Packing List XLSX export and editable Packing document details without changing accepted Order, PI, or Quote XLSX behavior.

**Architecture:** Packing List-owned Seller and Buyer JSON snapshots provide stable header data, while existing saved Packing Item fields and `product_snapshot` provide all rows. A pure normalizer passes a 16-column model to a fixed-template renderer, which uses the established package-preserving image/drawing infrastructure and a parameterized row-style helper that retains its existing default behavior for frozen exports.

**Tech Stack:** React/TypeScript, Vitest Browser, ExcelJS, JSZip, Supabase/PostgreSQL, pgTAP.

**Spec:** `docs/superpowers/specs/2026-10-02-packing-list-xlsx-design.md`

## Global Constraints

- Preview-only. Apply migrations only to `ciwaibtotispazfviims` through the verified Session Pooler; never use Direct Postgres host, Production, Production Supabase, `crm2.romiku.com`, or Sanity.
- Add exactly `seller_snapshot` and `buyer_snapshot` to `romiku_packing_lists`; backfill only empty snapshots and never overwrite existing saved values.
- Use saved Packing List and Packing Item data only at export time. Never query source Orders, Formal Customer, Product Library, ProductSupplier, or Sanity in the normalizer or renderer.
- Keep Unit in `product_snapshot.unit`; do not add a standalone Unit database field or dynamically backfill historical blank Units.
- Worksheet name is `PACKING LIST`; product rows start at 9; footer starts after the actual last product row; Print Area is `A1:P<last-summary-row>`.
- CBM and Total CBM remain numeric cells with `0.000`; Weight and Total Weight remain numeric cells with `0.00`; do not embed units in cell values.
- Write Seller/Buyer values only to the top-left cells of their real template merged ranges.
- Reuse package-level drawing/logo/image helpers. Preserve current Order/PI/Quote default helper behavior and accepted XLSX output.
- No Packing PDF.

## Review Focus

- Existing non-empty Seller or Buyer snapshots must survive migration unchanged; only truly empty JSON values are eligible for backfill.
- A new Packing List must retain source Order Buyer snapshot even after source Order/Customer edits; a Unit unavailable in source snapshot must remain blank.
- Missing dimensions must not cause an export-time catalog lookup or fabricated CBM; saved/generated values remain the sole source.
- One, four, and twenty product rows must maintain A:P borders/styles, footer positioning, image drawing anchors, and a print area ending at the final footer.
- Exported images must originate only from saved `product_snapshot.image_url`, and frozen Quote/PI/Order renderer tests must remain byte-contract compatible.

### Task 1: Packing snapshot schema and safe historical backfill

**Files:**
- Modify: `supabase/schemas/01_tables.sql`
- Create: `supabase/migrations/20261002100000_packing_export_snapshot.sql`
- Modify: `supabase/tests/romiku_core.test.sql`

**Interfaces:**
- Produces `romiku_packing_lists.seller_snapshot` and `buyer_snapshot`, both non-null JSON objects used by creation, editing, and normalization.

- [ ] **Step 1: Write failing pgTAP assertions**

Assert both columns exist with `{}` defaults; backfill inserts the exact ROMIKU template Seller only for empty Seller JSON; Buyer copies only an empty row's linked Order `counterparty_snapshot`; non-empty values are unchanged.

- [ ] **Step 2: Run pgTAP migration/schema test to verify RED**

Run: `npm run test:db -- supabase/tests/romiku_core.test.sql`

Expected: failure because the new columns/backfill contract does not exist.

- [ ] **Step 3: Implement declarative columns and migration**

Add the two schema columns. Write migration `20261002100000_packing_export_snapshot.sql` with `jsonb_typeof(...) = 'object' AND value = '{}'::jsonb` empty checks; seed Seller from the approved template values and copy Buyer only from `romiku_orders.counterparty_snapshot`. Preserve non-empty values and leave source-less Buyer empty.

- [ ] **Step 4: Run focused pgTAP verification**

Run: `npm run test:db -- supabase/tests/romiku_core.test.sql`

Expected: PASS.

- [ ] **Step 5: Commit schema task**

```bash
git add supabase/schemas/01_tables.sql supabase/migrations/20261002100000_packing_export_snapshot.sql supabase/tests/romiku_core.test.sql
git commit -m "feat: snapshot packing export parties"
```

### Task 2: Packing snapshot creation, document details, and saved Unit editing

**Files:**
- Create: `src/components/romiku/packing/packingExportSnapshot.ts`
- Create: `src/components/romiku/packing/PackingExportDetails.tsx`
- Modify: `src/components/romiku/packing/PackingCreate.tsx`
- Modify: `src/components/romiku/packing/PackingItemsGrid.tsx`
- Modify: `src/components/romiku/packing/packingWorkflow.ts`
- Modify: `src/components/romiku/production/FulfillmentPages.tsx`
- Create/modify tests: `src/components/romiku/packing/packingExportSnapshot.test.ts`, `src/components/romiku/packing/PackingExportDetails.test.tsx`, `src/components/romiku/packing/PackingItemsGrid.test.tsx`, `src/components/romiku/production/fulfillment.test.tsx`

**Interfaces:**
- Consumes the Task 1 snapshot columns.
- Produces `defaultPackingSellerSnapshot()`, `packingContactSnapshot(value)`, and `withPackingItemUnit(productSnapshot, unit)` for the export and UI tasks.

- [ ] **Step 1: Write failing tests**

Assert new Packing creation sends a cloned source Order Buyer snapshot and template Seller snapshot; Document Details edits only Packing-owned Seller/Buyer values; adding an item copies source `product_snapshot.unit` or blank; manual Unit editing saves only `packing_items.product_snapshot.unit`.

- [ ] **Step 2: Run focused component/workflow tests to verify RED**

Run: `npx vitest --config vitest.config.ts --run --project app src/components/romiku/packing/packingExportSnapshot.test.ts src/components/romiku/packing/PackingExportDetails.test.tsx src/components/romiku/packing/PackingItemsGrid.test.tsx src/components/romiku/production/fulfillment.test.tsx`

Expected: failure because snapshot helpers, panel, and Unit persistence do not exist.

- [ ] **Step 3: Implement snapshot-owned UI and persistence**

Create the pure snapshot helper with the five template contact fields. Make `PackingCreate` create both snapshots from the fetched Order's saved values. Add the low-frequency Document Details panel to Packing detail and persist edits through the normal Packing List update path. Extend the Packing draft/save payload to merge only `product_snapshot.unit`; keep existing source/supplier behavior as add-time defaults only.

- [ ] **Step 4: Run focused component/workflow tests**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 5: Commit snapshot UI task**

```bash
git add src/components/romiku/packing src/components/romiku/production/FulfillmentPages.tsx src/components/romiku/production/fulfillment.test.tsx
git commit -m "feat: add packing export details"
```

### Task 3: Snapshot-only normalized model and fixed-template renderer

**Files:**
- Create: `src/components/romiku/packing/packingExportModel.ts`
- Create: `src/components/romiku/packing/packingExportModel.test.ts`
- Create: `src/components/romiku/packing/packingXlsxRenderer.ts`
- Create: `src/components/romiku/packing/packingXlsxRenderer.test.ts`
- Modify: `src/components/romiku/orders/orderXlsxRenderer.ts`
- Add asset: `src/assets/packing-templates/ROMIKU_装箱单_模板.xlsx`

**Interfaces:**
- Consumes Task 2 saved snapshot shapes.
- Produces `normalizePackingExportModel(packingList, packingItems): PackingExportModel`, `buildPackingTemplateLayout(itemCount)`, and `renderPackingXlsx(model, template): Promise<ArrayBuffer>`.

- [ ] **Step 1: Write failing model and renderer tests**

Assert the normalized model reads no external data and maps only saved fields; decimal dimensions compute carton CBM; saved generated row totals aggregate correctly. Cover one/four/twenty row layouts, `PACKING LIST` name, `P1` number/date, Seller `C3:C7`, Buyer `I3:I7`, numeric `0.000` CBM and `0.00` weight formats, footer moves, dynamic Print Area, and saved-image package drawing preservation.

- [ ] **Step 2: Run focused export tests to verify RED**

Run: `npx vitest --config vitest.config.ts --run --project app src/components/romiku/packing/packingExportModel.test.ts src/components/romiku/packing/packingXlsxRenderer.test.ts`

Expected: failure because Packing model, layout, renderer, and template asset do not exist.

- [ ] **Step 3: Implement normalized model and renderer**

Create the pure model and 16-column renderer. Replace template rows 9–12, preserve the A:P first/middle/last row styles, recreate/shift footer merges, write only merged-range top-left contact cells, and set numeric formats. Parameterize `captureStyle`/`applyStyle` with an optional column count whose default remains 10; pass 16 only from Packing. Reuse `prepareProductImage` and `preserveTemplatePackage` with header row 8.

- [ ] **Step 4: Run focused export tests**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 5: Commit renderer task**

```bash
git add src/components/romiku/packing src/components/romiku/orders/orderXlsxRenderer.ts src/assets/packing-templates
git commit -m "feat: render packing list xlsx"
```

### Task 4: Packing export action and frozen-document regressions

**Files:**
- Modify: `src/components/romiku/production/FulfillmentPages.tsx`
- Modify/create tests: `src/components/romiku/production/fulfillment.test.tsx`, `src/components/romiku/orders/orderXlsxRenderer.test.ts`, `src/components/romiku/orders/piXlsxRenderer.test.ts`, `src/components/romiku/quotes/quoteXlsxRenderer.test.ts`

**Interfaces:**
- Consumes `normalizePackingExportModel` and `renderPackingXlsx` from Task 3.
- Produces the Packing detail XLSX download named `<document_number>.xlsx`.

- [ ] **Step 1: Write failing page/export regression tests**

Assert Packing detail reads only its Packing List and Packing Items for export, downloads the saved document number, and does not surface a PDF action. Pin existing Order/PI/Quote renderer suite expectations while invoking the parameterized style helper through its unchanged defaults.

- [ ] **Step 2: Run export and frozen regression tests to verify RED**

Run: `npx vitest --config vitest.config.ts --run --project app src/components/romiku/production/fulfillment.test.tsx src/components/romiku/orders/orderXlsxRenderer.test.ts src/components/romiku/orders/piXlsxRenderer.test.ts src/components/romiku/quotes/quoteXlsxRenderer.test.ts`

Expected: failure because Packing export action is absent; frozen renderer tests remain green until the new action test is added.

- [ ] **Step 3: Implement detail-page export action**

Fetch only `romiku_packing_items` keyed to the displayed Packing List, normalize, render the imported fixed template, and download the saved document number. Keep all document/page behavior outside Packing untouched.

- [ ] **Step 4: Run export and frozen regression tests**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 5: Commit export integration task**

```bash
git add src/components/romiku/production/FulfillmentPages.tsx src/components/romiku/production/fulfillment.test.tsx src/components/romiku/orders/orderXlsxRenderer.test.ts src/components/romiku/orders/piXlsxRenderer.test.ts src/components/romiku/quotes/quoteXlsxRenderer.test.ts
git commit -m "feat: export packing list xlsx"
```

### Task 5: Preview-only validation and release preparation

**Files:** No product-code changes expected.

- [ ] **Step 1: Run complete local verification**

Run focused Packing tests, full Vitest, typecheck, lint, build, pgTAP, and existing concurrency checks. Record any unrelated baseline failures separately.

- [ ] **Step 2: Verify Preview migration target and apply it**

Use migration status through the verified Session Pooler route, confirm ref `ciwaibtotispazfviims`, then apply only `20261002100000_packing_export_snapshot.sql`. Do not use the Direct host or linked migration route.

- [ ] **Step 3: Push and verify existing-project Preview**

Push `codex/commercial-line-items-v2`, wait for the existing `romiku-crm-prod` branch Preview deployment, and verify that branch-scoped `VITE_SUPABASE_URL` points to `https://ciwaibtotispazfviims.supabase.co`. Do not create a Vercel project or modify Production variables.

- [ ] **Step 4: Prepare manual acceptance**

Provide the Preview URL and release commit, with the Packing manual check list: saved Seller/Buyer, Unit, quantity/cartons/QtyCtn, dimensions, decimal CBM, weight, totals, images, page setup, dynamic Print Area, and filename.
