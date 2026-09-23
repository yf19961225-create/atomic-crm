# Order Fixed Template Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a stable, fixed-template Order export pipeline using only saved Order data and snapshots.

**Architecture:** Persist Seller and Terms at `terms_snapshot.order_export`; keep Buyer in the existing `counterparty_snapshot`; normalize saved Order and ordered item snapshots into one renderer-neutral model. A later renderer consumes that model for both XLSX and PDF with the single `order` template.

**Tech Stack:** React, TypeScript, React Admin data provider, Supabase PostgreSQL JSONB migrations, Vitest browser tests, pgTAP, `@oai/artifact-tool` for future XLSX editing.

**Spec:** `docs/superpowers/specs/2026-09-23-order-export-fixed-template-design.md`

## Global Constraints

- Preview-only. Do not modify Production Supabase, Sanity, `crm2.romiku.com`, or deploy Production.
- Use only template key `order`; `document_language` does not select templates.
- Export only saved Order/item/customer/export snapshots; never re-query masters.
- Preserve item ordering as `position ASC, id ASC`.
- Do not add a second Customer, Product, Payment, or Seller master model.
- Renderer work begins only after this plan is approved and the fixed template remains the visual reference.

## Review Focus

- Legacy Order without export JSON receives defaults once and stays stable after defaults change.
- Zero versus positive Other Expenses and Discount changes row count without blanks.
- A hidden payment term preserves its text and closes the Terms gap.
- An Order with 50 items moves all totals and Terms without overwriting images or merges.
- Manual Order number/date edits are reflected from saved values, not template samples.

---

### Task 1: Persist Order export snapshots

**Files:**
- Create: `supabase/migrations/<timestamp>_order_export_snapshot.sql`
- Modify: `src/components/romiku/orders/documentWorkflow.ts`
- Modify: `src/components/romiku/orders/documentWorkflow.test.ts`
- Test: `supabase/tests/romiku_core.test.sql`

**Interfaces:**
- Produces `terms_snapshot.order_export` with `template_key`, Seller, and eight Terms.
- Existing Buyer snapshot remains `counterparty_snapshot`.

- [ ] Write a failing workflow test asserting an Order create payload includes a complete `order_export` snapshot and does not duplicate Buyer.
- [ ] Run `vitest ... documentWorkflow.test.ts`; expect the new assertion to fail.
- [ ] Write the local migration that backfills only Orders without `terms_snapshot.order_export`, using the template Seller/Terms defaults and `payment.visible = true`.
- [ ] Add creation logic that copies the same defaults into new direct and converted Orders.
- [ ] Add pgTAP assertions for legacy backfill, JSON shape, and preserved `counterparty_snapshot`.
- [ ] Run local `supabase db reset --local`, pgTAP, and focused workflow tests; expect all pass.
- [ ] Commit `feat: snapshot order export details`.

### Task 2: Edit Order export details without master writes

**Files:**
- Create: `src/components/romiku/orders/OrderExportDetails.tsx`
- Create: `src/components/romiku/orders/orderExportSnapshot.ts`
- Test: `src/components/romiku/orders/OrderExportDetails.test.tsx`
- Modify: `src/components/romiku/orders/DocumentPages.tsx`

**Interfaces:**
- Consumes `OrderExportSnapshot`, `counterparty_snapshot`, `onSave(values)`.
- Produces a document-session update for `counterparty_snapshot` and `terms_snapshot.order_export`.

- [ ] Write browser tests for Seller save/cancel, Buyer save without Formal Customer writes, Terms save/cancel, and payment visibility preservation.
- [ ] Run the new test; expect it to fail because the details component does not exist.
- [ ] Implement a Drawer/collapsible editor with explicit Save and Cancel, using the existing Order edit session rather than per-keystroke provider updates.
- [ ] Add an Order-page entry point labelled `导出信息 / Document Details` without moving high-frequency line-item or payment controls.
- [ ] Re-run focused tests and `documents.test.tsx`; expect pass.
- [ ] Commit `feat: edit order export snapshots`.

### Task 3: Align Order grid columns

**Files:**
- Modify: `src/components/romiku/commercial/CommercialLineItemsTable.tsx`
- Test: `src/components/romiku/orders/documents.test.tsx`

**Interfaces:**
- For `kind="order"`, produces exactly the ten canonical Order columns.
- Keeps customer code persisted but omitted by default.

- [ ] Write a browser assertion for Order column order: No., SKU, name, image, specification, cartons, Qty/Ctn, quantity, unit price, amount.
- [ ] Write an assertion that customer code is absent by default and PI behavior remains unchanged.
- [ ] Run focused tests; expect the order assertion to fail if any column sequence differs.
- [ ] Make the minimal shared-table conditional change for Order only.
- [ ] Re-run Quote/PI/Order browser regressions; expect pass.
- [ ] Commit `feat: align order table with fixed template`.

### Task 4: Normalize saved Order export data

**Files:**
- Create: `src/components/romiku/orders/orderExportModel.ts`
- Create: `src/components/romiku/orders/orderExportModel.test.ts`

**Interfaces:**
- `normalizeOrderExportModel(order, items): OrderExportModel`.
- `OrderExportModel` contains header, Seller, Buyer, sorted items, monetary totals, and visible Terms.

- [ ] Write failing unit tests for sorted items, image/specification snapshot usage, positive-only optional rows, negative Discount display value, deposit/balance rounding, and hidden payment term.
- [ ] Run the unit test; expect it to fail because `normalizeOrderExportModel` is undefined.
- [ ] Implement the pure model builder without data-provider, Supabase, or Product Library imports.
- [ ] Re-run the model test; expect pass.
- [ ] Add a conversion regression proving a converted Order normalizes copied snapshots without a master-data read.
- [ ] Commit `feat: normalize saved order export data`.

### Task 5: Fixed-template XLSX renderer

**Files:**
- Create: `src/components/romiku/orders/orderXlsxRenderer.ts`
- Create: `src/components/romiku/orders/orderXlsxRenderer.test.ts`
- Add: fixed template asset only if the user authorizes copying it into the repository

**Interfaces:**
- Consumes `OrderExportModel` and the fixed `order` template asset.
- Produces an XLSX buffer whose worksheet is named `ORDER`.

- [ ] Obtain explicit confirmation for the repository location of the final template asset before copying it.
- [ ] Write failing renderer tests for 1, 18, and 50 item rows; tests must inspect row values, shifted totals/Terms, merged ranges, and absence of legacy formulas.
- [ ] Implement row cloning from the row-9 style anchor, write numeric amounts, add only positive Other Expenses/Discount rows, shift merges/images/print area, and rename the output worksheet `ORDER`.
- [ ] Render representative workbook ranges and visually compare Seller/Buyer, product, totals, and Terms regions against the supplied template.
- [ ] Re-run renderer tests, formula-error scan, and visual checks; expect pass.
- [ ] Commit `feat: render fixed order xlsx template`.

### Task 6: Shared PDF path and export UI

**Files:**
- Create: `src/components/romiku/orders/orderPdfRenderer.ts`
- Modify: `src/components/romiku/orders/DocumentPages.tsx`
- Test: `src/components/romiku/orders/orderExportActions.test.tsx`

**Interfaces:**
- Both renderers consume `OrderExportModel` only.
- Produces user-visible XLSX/PDF actions after the renderer is approved.

- [ ] Write a test proving XLSX and PDF actions invoke normalization once per export and do not call master-data APIs.
- [ ] Implement export actions that first reload the saved Order/items, normalize them, then call the selected renderer.
- [ ] Implement PDF from structured export data rather than a screenshot.
- [ ] Re-run export-action and Order regression tests; expect pass.
- [ ] Commit `feat: export order xlsx and pdf from snapshots`.

### Task 7: Final local quality gate and Preview

**Files:**
- Modify: affected browser/unit/pgTAP tests only

- [ ] Run local migration reset, pgTAP, Order export unit/browser tests, Quote/PI/Order conversion regressions, typecheck, lint, build, and full app suite.
- [ ] Request independent review for snapshot boundaries, dynamic row shifts, optional money rows, and template preservation.
- [ ] Fix review findings and repeat affected verification.
- [ ] Push the feature branch and create a Vercel Preview only; do not run database migration or write records against a production-connected Preview.
- [ ] Commit only verified source, migration, asset, and test changes.

## Self-review

- Every requested Order field maps to a saved source or a fixed template label.
- Other Expenses and Discount have explicit conditional row behavior.
- Seller, Buyer, Terms, and payment visibility have document-level persistence rules.
- The template's row anchor, totals shift, Terms shift, worksheet output name, and formula prohibition are covered.
- This plan deliberately defers the renderer until the user approves execution and authorizes the template asset location.
