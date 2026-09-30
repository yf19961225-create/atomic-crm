# PI XLSX Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Preview-only PI XLSX export using the fixed PI template, saved PI snapshots, prefix-safe PI numbering, and no PDF work.

**Architecture:** PI adds a pure normalized export model and PI-specific template adapter on top of behavior-preserving Order XLSX package utilities. The database stores all PI export defaults in existing JSONB snapshots, while a prefix-scoped daily number allocator safely separates historical RPI counters from the new PI series.

**Tech Stack:** React/TypeScript, RA Core, Vitest Browser, ExcelJS, JSZip/OOXML package manipulation, Supabase/PostgreSQL, pgTAP.

**Spec:** `docs/superpowers/specs/2026-09-30-pi-xlsx-export-design.md`

## Global Constraints

- Operate only in the `codex/commercial-line-items-v2` worktree and use Node `v22.23.2`.
- Preview-only: database migration and write validation target only Supabase project `ciwaibtotispazfviims`.
- Never deploy Production, modify Production Supabase, `crm2.romiku.com`, or Sanity.
- Do not alter the accepted Order template or change `renderOrderXlsx()` behavior.
- Use the sole fixed PI template, `templateKey = "pi"`; `document_language` remains stored for compatibility but is hidden from PI UI and does not select a template.
- The XLSX renderer consumes saved PI, item, customer, seller, terms and bank snapshots only. It never queries product, customer, seller, bank-master or Sanity data.
- Use PI rows and merge ranges read from the actual PI template. Write only the top-left cell of every merge.
- Do not export Other Expenses or Discount rows and do not implement PDF.

## Review Focus

- A same-day historical `RPI...` counter must not make the first new `PI...` number skip `001`; Task 1 pgTAP proves prefix-scoped allocation.
- A manual PI document number matching the automatic pattern must remain table-unique but must not advance the PI counter; Task 1 covers it.
- A converted Quote with legacy Terms or an empty bank snapshot must receive PI defaults without losing source snapshot keys; Task 2 covers it.
- A PI export with both Terms and Banking hidden must terminate Print Area at Balance without residual rows or merged-cell values; Task 5 covers it.
- A product image URL unavailable at export must leave only that PHOTO cell empty and must preserve the Logo and other product drawings; Task 5 covers it.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/assets/pi-templates/ROMIKU_PI_模板.xlsx` | Immutable fixed PI template asset copied from the approved user file. |
| `src/components/romiku/orders/xlsxTemplatePackage.ts` | Shared, private package-preserving utilities extracted without changing Order output behavior. |
| `src/components/romiku/orders/piExportSnapshot.ts` | PI seller, Terms, Banking visibility/default snapshot adapter. |
| `src/components/romiku/orders/piExportModel.ts` | Pure saved-snapshot-to-export-model conversion. |
| `src/components/romiku/orders/piXlsxRenderer.ts` | PI layout planner and renderer that consume only `PiExportModel`. |
| `src/components/romiku/orders/PiExportDetails.tsx` | PI-specific Document Details editor for Seller, Buyer, Terms, Banking and visibility flags. |
| `src/components/romiku/orders/DocumentPages.tsx` | Saved-PI XLSX download action, PI export details mounting and hidden PI language selector. |
| `src/components/romiku/orders/documentWorkflow.ts` | Direct PI snapshot initialization. |
| `supabase/migrations/<timestamp>_pi_export_snapshot_and_number_prefix.sql` | Prefix-scoped counters and atomic PI conversion/default initialization. |
| `supabase/schemas/01_tables.sql`, `02_functions.sql`, `04_triggers.sql` | Declarative mirror of the migration. |
| `supabase/tests/romiku_core.test.sql`, `supabase/tests/romiku_concurrency.mjs` | pgTAP and concurrent allocator proof. |

## Tasks

### Task 1: Prefix-scoped PI allocator migration

**Files:**
- Create: `supabase/migrations/<timestamp>_pi_export_snapshot_and_number_prefix.sql`
- Modify: `supabase/schemas/01_tables.sql`
- Modify: `supabase/schemas/02_functions.sql`
- Modify: `supabase/schemas/04_triggers.sql`
- Modify: `supabase/tests/romiku_core.test.sql`
- Modify: `supabase/tests/romiku_concurrency.mjs`

**Interfaces:**
- Consumes: existing `romiku_document_daily_counters`, `romiku_assign_number()` and PI unique constraint.
- Produces: `romiku_next_daily_document_number('pi', 'PI') -> text`, using `(document_kind, business_date, number_prefix)` state.

- [ ] **Step 1: Write failing pgTAP and concurrency cases for PI prefix separation.**

Add assertions that an RPI row and a stale RPI counter today do not prevent the first PI allocation from returning `PIYYMMDD001`; two concurrent PI inserts produce distinct sequential PI numbers; a rollback leaves no committed allocation; a manual PI number does not alter the next automatic number.

- [ ] **Step 2: Run database tests to verify failure before the migration.**

Run: repository's existing local Supabase pgTAP command plus `node supabase/tests/romiku_concurrency.mjs`.

Expected: PI prefix-separation assertions fail because the current allocator uses `RPI` and a counter key without prefix.

- [ ] **Step 3: Implement the atomic prefix-scoped allocator migration.**

Add `number_prefix` to the counter identity, retain pre-existing PI rows as `RPI`, update the primary key to include the prefix, and update allocator advisory-lock/upsert/high-watermark logic. Change only new PI automatic allocations to prefix `PI`; preserve Quote `RFQ` and Order `OD` behavior. Keep server-generated insert, manual-update validation, table uniqueness and rollback semantics.

- [ ] **Step 4: Mirror the final schema/function/trigger definitions.**

Update declarative schema files so a fresh database and the migrated Preview database have the same allocator contract.

- [ ] **Step 5: Re-run pgTAP and concurrency tests.**

Expected: all new and existing number tests pass, including stale-counter self-heal and rollback.

- [ ] **Step 6: Commit.**

```bash
git add supabase/migrations supabase/schemas supabase/tests
git commit -m "feat: allocate PI numbers by prefix"
```

### Task 2: PI export snapshots at creation and conversion

**Files:**
- Create: `src/components/romiku/orders/piExportSnapshot.ts`
- Create: `src/components/romiku/orders/piExportSnapshot.test.ts`
- Modify: `src/components/romiku/orders/documentWorkflow.ts`
- Modify: `src/components/romiku/orders/documentWorkflow.test.ts`
- Modify: migration from Task 1
- Modify: `supabase/tests/romiku_core.test.sql`

**Interfaces:**
- Produces: `defaultPiExportSnapshot()`, `piExportSnapshot(value)`, and `withPiExportSnapshot(existing, snapshot)`.
- Produces: structured `PiBankSnapshot` with all six template fields and `bank_information_visible: true`.

- [ ] **Step 1: Write failing TypeScript and pgTAP tests for PI snapshot ownership.**

Test direct PI creation initializes exact Seller, eight template Terms, Banking values and visible flags; editing the returned PI snapshot does not mutate defaults; Quote-to-PI retains source keys and atomically adds missing `pi_export` and bank defaults; PI-to-Order continues copying PI snapshots unchanged.

- [ ] **Step 2: Run the targeted tests to verify missing PI export initialization.**

Run: `CI=1 npx vitest --project app src/components/romiku/orders/piExportSnapshot.test.ts src/components/romiku/orders/documentWorkflow.test.ts` and local pgTAP.

Expected: direct/converted PI snapshot assertions fail before implementation.

- [ ] **Step 3: Implement the PI snapshot adapter and direct-create initialization.**

Keep defaults literal and test-pinned from the approved PI template. Store PI export details under `terms_snapshot.pi_export`; store six structured values in existing `bank_snapshot`; do not add a bank master, table, RLS policy or selector.

- [ ] **Step 4: Add atomic conversion initialization in the migration.**

Amend `romiku_convert_document` only to merge missing PI defaults when the target is PI. It must preserve copied customer, commercial, Terms and bank keys and never query a current master.

- [ ] **Step 5: Re-run focused snapshot and conversion tests.**

Expected: direct and converted PI snapshots are stable and independent.

- [ ] **Step 6: Commit.**

```bash
git add src/components/romiku/orders/piExportSnapshot* src/components/romiku/orders/documentWorkflow* supabase
git commit -m "feat: snapshot PI export details"
```

### Task 3: Extract shared package-preserving XLSX utilities without Order regression

**Files:**
- Create: `src/components/romiku/orders/xlsxTemplatePackage.ts`
- Create: `src/components/romiku/orders/xlsxTemplatePackage.test.ts`
- Modify: `src/components/romiku/orders/orderXlsxRenderer.ts`
- Modify: `src/components/romiku/orders/orderXlsxRenderer.test.ts`
- Modify: `api/order-export-image.ts` only if a neutral export-image endpoint name is required
- Modify: `src/server/order-export-image.test.ts` only if endpoint behavior changes

**Interfaces:**
- Produces: image preparation, natural-dimension contain anchor creation, source drawing/page setup preservation, cell-style capture/copy and merged-region utility functions.
- Preserves: `renderOrderXlsx(model, template): Promise<ArrayBuffer>` unchanged.

- [ ] **Step 1: Add a regression test that inspects accepted Order package invariants.**

Assert preserved Logo crop/extent, print settings, existing drawing relationship, product-image media and aspect-correct anchor for a representative Order output.

- [ ] **Step 2: Run Order renderer tests before extraction.**

Run: `CI=1 npx vitest --project app src/components/romiku/orders/orderXlsxRenderer.test.ts src/server/order-export-image.test.ts`.

Expected: PASS establishes the frozen baseline.

- [ ] **Step 3: Extract only pure shared helpers.**

Move implementation without changing Order layout coordinates, template input, output contract or image scaling math. Keep Order-specific layout and renderer code in `orderXlsxRenderer.ts`.

- [ ] **Step 4: Re-run Order package and renderer regression tests.**

Expected: PASS; inspect affected package metadata rather than relying on rendered browser output alone.

- [ ] **Step 5: Commit.**

```bash
git add src/components/romiku/orders/xlsxTemplatePackage* src/components/romiku/orders/orderXlsxRenderer* api/order-export-image.ts src/server/order-export-image.test.ts
git commit -m "refactor: share xlsx package utilities"
```

### Task 4: PI normalized export model

**Files:**
- Create: `src/components/romiku/orders/piExportModel.ts`
- Create: `src/components/romiku/orders/piExportModel.test.ts`

**Interfaces:**
- Produces: `normalizePiExportModel(pi: Record<string, unknown>, items: CommercialItem[]): PiExportModel`.
- Consumes: `piExportSnapshot`, structured `bank_snapshot`, saved `counterparty_snapshot`, and saved PI items.

- [ ] **Step 1: Write failing model tests.**

Assert sort order is `position ASC, id ASC`; `items[].amount` equals saved quantity × saved unit price; image/specification come from the saved item snapshot; Buyer/Seller/Bank stay snapshot-derived; USD/CNY are normalized; Deposit/Balance reflect non-30% input; no Other Expenses or Discount rows exist; hidden Terms/Bank emit no region entries.

- [ ] **Step 2: Run the model test before implementation.**

Run: `CI=1 npx vitest --project app src/components/romiku/orders/piExportModel.test.ts`.

Expected: FAIL because the PI model does not exist.

- [ ] **Step 3: Implement the pure model.**

Use named fields, never positional arrays, and do not fetch. Use the saved PI total for the exported Total Amount while rendering no extra expense/discount lines.

- [ ] **Step 4: Re-run the model test.**

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/components/romiku/orders/piExportModel*
git commit -m "feat: normalize PI export snapshots"
```

### Task 5: PI package-preserving renderer and layout planner

**Files:**
- Create: `src/assets/pi-templates/ROMIKU_PI_模板.xlsx`
- Create: `src/components/romiku/orders/piXlsxRenderer.ts`
- Create: `src/components/romiku/orders/piXlsxRenderer.test.ts`

**Interfaces:**
- Produces: `buildPiTemplateLayout(itemCount, termsVisible, bankVisible): PiTemplateLayout`.
- Produces: `renderPiXlsx(model: PiExportModel, template: ArrayBuffer): Promise<ArrayBuffer>`.

- [ ] **Step 1: Add failing layout and package tests.**

Cover 1, 3 and 20 saved items; dynamic Summary/Terms/Bank shifts; true/false combinations of Terms and Banking; Print Area ending at the last visible block; correct merges and top-left-only values; unchanged Logo package metadata; one or more embedded product drawings with aspect-preserving D-column anchors; an unavailable image warning that leaves that cell empty only.

- [ ] **Step 2: Run the PI renderer test before implementation.**

Run: `CI=1 npx vitest --project app src/components/romiku/orders/piXlsxRenderer.test.ts`.

Expected: FAIL because renderer and PI template asset are absent.

- [ ] **Step 3: Copy the approved PI template asset unchanged and implement the PI layout planner.**

Read row roles, merge boundaries and semantic heights from the PI template. Use product start 9, summary after `max(1, itemCount)`, and exactly the fixed Summary rows in the spec.

- [ ] **Step 4: Implement package-preserving PI rendering.**

Reuse Task 3 utilities. Preserve static template text/labels; clear sample values/formulas only in the dynamic region; write only saved model data into merge top-left cells; use structured Banking fields; preserve template worksheet name and page setup.

- [ ] **Step 5: Re-run PI renderer tests and Order renderer regression.**

Run: `CI=1 npx vitest --project app src/components/romiku/orders/piXlsxRenderer.test.ts src/components/romiku/orders/orderXlsxRenderer.test.ts`.

Expected: PASS, including package-level drawing assertions.

- [ ] **Step 6: Commit.**

```bash
git add src/assets/pi-templates src/components/romiku/orders/piXlsxRenderer*
git commit -m "feat: render PI xlsx from saved snapshots"
```

### Task 6: PI Document Details and XLSX export action

**Files:**
- Create: `src/components/romiku/orders/PiExportDetails.tsx`
- Create: `src/components/romiku/orders/PiExportDetails.test.tsx`
- Modify: `src/components/romiku/orders/DocumentPages.tsx`
- Modify: `src/components/romiku/orders/documents.test.tsx`

**Interfaces:**
- Consumes: `PiExportSnapshot`, `normalizePiExportModel`, `renderPiXlsx`, saved PI item retrieval, and existing edit-session state.
- Produces: a PI-only `导出信息 / Document Details` editor and `导出 XLSX` action with filename `<document_number>.xlsx`.

- [ ] **Step 1: Write failing browser tests.**

Verify PI hides the document-language selector, while Quote behavior remains untouched; Terms and Banking visibility default checked; staged Seller/Buyer/Terms/Bank edits only update PI snapshots; save is required before export; export calls `normalizePiExportModel(record, savedItems)` then `renderPiXlsx` and uses the saved document number as filename.

- [ ] **Step 2: Run targeted browser tests before implementation.**

Run: `CI=1 npx vitest --project app src/components/romiku/orders/PiExportDetails.test.tsx src/components/romiku/orders/documents.test.tsx`.

Expected: FAIL because PI export surface does not exist.

- [ ] **Step 3: Implement PI Document Details.**

Reuse the Order panel's staged edit-session pattern but keep PI snapshot names separate. Do not add a bank account selector, master mutation or language selector.

- [ ] **Step 4: Add the PI XLSX download action.**

Fetch only the local approved PI template asset. Export from the saved `record` and saved items when not editing; do not re-query external business sources.

- [ ] **Step 5: Re-run focused browser tests.**

Expected: PASS; Quote and Order tests remain unaffected.

- [ ] **Step 6: Commit.**

```bash
git add src/components/romiku/orders/PiExportDetails* src/components/romiku/orders/DocumentPages.tsx src/components/romiku/orders/documents.test.tsx
git commit -m "feat: export PI xlsx from document snapshots"
```

### Task 7: Local database migration and Preview-only validation

**Files:**
- Modify: tests from Tasks 1–2 only when migration evidence identifies a gap.

**Interfaces:**
- Consumes: completed migration and local Supabase session-pooler procedure.
- Produces: verified Preview schema/migration status for `ciwaibtotispazfviims` only.

- [ ] **Step 1: Apply the migration to local Supabase and run pgTAP.**

Verify the fresh/migrated local schema is identical to declarative definitions before any remote action.

- [ ] **Step 2: Verify target before Preview write.**

Use only the existing secure Preview Session Pooler procedure. Confirm its project reference is exactly `ciwaibtotispazfviims`; otherwise stop without writes.

- [ ] **Step 3: Apply only the new PI migration to Preview and verify migration status.**

Do not run blanket migrations or touch Production.

- [ ] **Step 4: Create Preview test PIs and validate allocation behavior.**

Create at least three Preview PIs; verify `PIYYMMDD001...`, no collision with RPI history, manual edit uniqueness, and stale-counter recovery. Record only identifiers and non-sensitive verification evidence.

- [ ] **Step 5: Commit any narrowly required test correction.**

```bash
git add supabase/tests
git commit -m "test: verify PI preview numbering"
```

### Task 8: Final quality gate and Preview XLSX acceptance

**Files:**
- Modify: only files required by verified review findings.

- [ ] **Step 1: Run focused browser and renderer suites under Node v22.23.2.**

Run PI snapshot/model/renderer/Document Details tests, Commercial Line Items regression, and frozen Order renderer regression using `CI=1 npx vitest --project app ...`.

- [ ] **Step 2: Run database and migration suites.**

Run pgTAP, allocator concurrency tests, direct-PI and conversion snapshot regression, and migration status verification.

- [ ] **Step 3: Run application gates.**

Run: `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:unit:app`.

Expected: all commands pass; preserve user-owned `.gitignore` and `output/` changes outside the staged scope.

- [ ] **Step 4: Request and address an independent review.**

Review snapshot isolation, merge top-left writes, image package drawings, print area, terms/banking hidden combinations, prefix counter integrity, unchanged Order output and absence of PDF work. Fix only confirmed findings and rerun affected tests.

- [ ] **Step 5: Push only `codex/commercial-line-items-v2` and create a project-associated Preview.**

Do not merge or deploy Production. Confirm the deployed runtime targets Preview Supabase `ciwaibtotispazfviims`.

- [ ] **Step 6: Perform manual Preview acceptance with a real PI.**

Create a PI, select a customer, add real saved-product items, save currency/cartons/quantity/unit prices/deposit percentage, edit and hide/show Terms and Banking, export XLSX, and inspect the actual downloaded workbook for Logo, PI.NO, Seller, Buyer, images, totals, visibility behavior and Print Area.

- [ ] **Step 7: Commit final verified corrections.**

```bash
git add <only verified PI implementation files>
git commit -m "fix: complete PI xlsx export verification"
```
