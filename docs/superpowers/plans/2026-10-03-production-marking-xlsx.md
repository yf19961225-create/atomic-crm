# Production Marking and XLSX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Customer marking defaults copied into independently editable Production snapshots, exported with the approved XLSX.

**Architecture:** Dedicated versioned profile/snapshot JSON and immutable private Storage objects. Snapshot-only normalization and shared package-preserving image renderer. Existing production numbering and independent quantity semantics remain.

**Tech Stack:** React, TypeScript, Supabase/Postgres/Storage, ExcelJS, JSZip, Vitest, pgTAP.

**Spec:** ../specs/2026-10-03-production-marking-xlsx-audit.md plus user attached request.

## Global Constraints

- Preview-only ciwaibtotispazfviims and existing romiku-crm-prod project.
- No PDF, Sanity, Production or crm2.romiku.com.
- Freeze Order/PI/Quote/Packing output and preserve shared defaults.
- Do not commit .gitignore, .vitest-attachments, output.
- Native execution continues without design reconfirmation per user authorization.

## Review Focus

- Missing/invalid/expired image references fail clearly without blank successful export.
- Replacement/removal cannot mutate images referenced by old Production.
- Quantity can intentionally differ from carton plan.
- Long notes/labels and 25+ products preserve readable template regions.
- Source/customer changes after creation never enter export or overwrite saved fields.

### Task 1: Snapshot model, workflow, migration

Files: new marking/markingProfile.ts and tests; productionWorkflow.ts/tests; productionExportModel.ts/tests; new migration and pgTAP; matching schemas.
Interfaces: normalizeMarkingProfile(unknown), createProductionMarkingSnapshot(order,customer), normalizeProductionExportModel(production,items).
- [x] Add failing historical copy/independent quantity/normalization tests and run targeted Vitest.
- [x] Implement model/workflow using saved snapshots, stable item positions and empty legacy defaults.
- [x] Add schema+Preview migration, private immutable Storage policies and pgTAP regression.
- [x] Verify targeted tests and migration against local database if available.

### Task 2: Marking editor and Storage

Files: new marking/markingAssets.ts, MarkingProfileEditor.tsx, tests; customers/CustomerPage.tsx; production/FulfillmentPages.tsx and FulfillmentItems.tsx.
Interfaces: uploadMarkingImage(file): Promise<ImageAsset>, resolveMarkingImage(asset): Promise<string>; editor resource+record prop with independent save.
- [x] Write failing customer/Production isolated edit tests and upload validation tests.
- [x] Implement upload/preview/replace/remove, modes, labeling/requirements and save/errors.
- [x] Add saved Production carton/qty-per-carton/specification inputs and mismatch warning.
- [x] Run targeted frontend tests.

### Task 3: Template renderer

Files: assets/production-templates/ROMIKU生产单模板.xlsx; productionXlsxRenderer.ts/tests; shared orderXlsxRenderer.ts additive optional support.
Interfaces: renderProductionXlsx(model,template): Promise<ArrayBuffer>, shared PreparedProductImage optional column.
- [x] Add failing 1/5/25 row tests, all marking modes, missing-image failure and image geometry/package tests.
- [x] Extend shared image helper defaults preserving frozen callers; create missing drawing relationships only when absent.
- [x] Render original template, relocate footer/requirements, clone styles, set dynamic Print Area.
- [x] Add saved-only Production export UI and filename.
- [x] Run all five exporter suites.

### Task 4: Verification, Preview rollout

- [ ] Run full frontend tests, typecheck, lint, build and pgTAP; address failures.
- [ ] Apply migration only through validated Preview Session Pooler Python getpass.
- [ ] Review diff/independent review; commit only intended files and push current branch.
- [ ] Verify Vercel branch env and current commit READY on existing project.
- [ ] Browser acceptance with disposable Preview fixtures, actual downloads and historical snapshot checks.
- [ ] Report exact checks, SHA, migration result and latest Preview.

## Verification ledger

- Implementation tasks 1–3 complete: snapshot/workflow tests red→green; immutable upload/editor tests; 1/5/25 row renderer tests; shared four-exporter regressions.
- Fresh review found long E2 labeling text not wrapping and empty migrated customer profiles bypassing legacy defaults. Both fixed with observed failing tests before fixes; explicitly cleared versioned profiles stay cleared.
- Full frontend: 903 PASS, 2 skipped. Local full pgTAP: 451 PASS in rolled-back transactions. Typecheck, lint, build PASS.
- Preview migration requested only after these checks; browser rollout/acceptance remains pending.
