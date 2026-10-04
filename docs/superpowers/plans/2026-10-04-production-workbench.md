# Production Workbench Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task by task.

**Goal:** Make Order the visible parent and edit one Production in one atomic session.
**Architecture:** Preserve existing tables, saved snapshots, numbering and XLSX. Add invoker transactional save/sync RPCs, a shared draft workbench, and parent-aware navigation. Keep global Production table pagination/search by document; show Order number first plus saved customer, avoiding misleading groups split across pages. Order detail shows all its children in a collapsible section.
**Tech Stack:** Existing React, React Query, Supabase/PostgreSQL, pgTAP/Vitest.
**Spec:** User's 2026-10-04 Production UX request, audit recorded below.

## Global Constraints
Preview ciwaibtotispazfviims only, existing branch/project, all five XLSX frozen, no supplier splitting, no source Order mutation, no customer lookup for Production defaults, preserve item overrides during explicit sync. Do not commit .gitignore or generated output.

## Read-only audit
- order_id is NOT NULL FK; composite item FK enforces the same Order. Counter scoped by Order.
- Preview P02/P03/P04 of OD261004002 share order_id 4e582836-c6f6-4c22-a661-b93a9cc23068. A manually named record 唯一电器 belongs to the same Order; do not infer/repair historical P01.
- ProductionCreate currently creates header then rows individually; FulfillmentItems opens one form per row; shared editor/item override separately write. No atomic document edit.
- Existing item fields support product_snapshot name/specification/image_url, packaging_snapshot cartons/qty_per_carton, quantity, production_note_zh, marking_override.
- createProductionOrders already copies Order saved defaults; no Customer lookup. Order detail only links a filtered production list. Global list/detail interpolate UUID directly.
- Current production quantity is independent from cartons*qty_per_carton; retain split quantities and show mismatch warning, not Packing formula.

## Task 1: Transactional operations
Files: schemas/11_production_workbench.sql, migration 20261004190000_production_workbench.sql, tests/romiku_production_workbench.test.sql.
Interfaces: romiku_save_production_workspace(production_id uuid, source_order_id uuid, header jsonb, items jsonb, expected jsonb) returns jsonb {ok,id,message,code}; romiku_sync_order_production_defaults(source_order_id uuid, expected jsonb default null) returns preview {ok,token,productions} or confirmed result. Null expected previews sync.
- [ ] Write pgTAP for create/Order-scoped numbering, source snapshots unchanged, full session save, stale version rejection, invalid foreign rows, auth/RLS, rollback, explicit sync excludes completed/received/cancelled/archived and retains overrides.
- [ ] Run on local DB: expected missing-function RED, implement SQL and re-run PASS.
- [ ] Save locks Order then header/items; compares expected header/item updated_at and full item set. New rows copy source snapshot server-side, apply whitelisted edits only. Reject unknown patch keys. Updates only existing rows or explicit new Order items; no implicit deletes. Return safe errors. Warn before over-assignment; explicit acknowledgement required.
- [ ] Sync locks Order then candidates; token covers saved defaults + eligible header versions; confirmation rechecks token, no automatic synchronization.

## Task 2: Workbench and hierarchy
Files: ProductionWorkbench.tsx, ProductionInstructionsFields.tsx, productionWorkspace.ts, OrderProductionPanel.tsx, ProductionCreate.tsx, FulfillmentPages.tsx, DocumentPages.tsx.
- [ ] Browser component tests RED: staged create no writes; source locked; multi-row/shared/override edits submit once; Cancel restores; no UUID; Chinese modes; inherited summaries; sync cancellation.
- [ ] Implement local draft Step 1 then same workbench Step 2, one Save. Existing detail edit/save/cancel uses same component; retain exporter code path unchanged, disabled during edit.
- [ ] Production global list batches parent reads, displays Order number/customer; keeps server-side relevance order and pagination. Order detail lists children, create locked to Order.
- [ ] Shared instructions once above grid; ordinary rows show inheritance/effective labels; on-demand override fields use resolveProductionItemMarking only. Preserve immutable asset uploads and XLSX warning. Include navigation discard guard.
- [ ] Run targeted UI/unit tests PASS; adapt replaced legacy-flow tests without removing coverage.

## Task 3: Verify and Preview
- [ ] Full frontend, pgTAP, typecheck/lint/build, frozen renderer diff check.
- [ ] Fresh review of transaction locks, RLS, stale writes, mixed update/create, upload in flight, unrecognized historical numbers.
- [ ] Preview getpass Session Pooler migration, rollback-only DB tests, branch push, existing Vercel Preview and env verification.
- [ ] Browser read-only real records; edit/cancel. Persist only dedicated authorized QA records; request exact authorization if automatic review requires it.

## Review Focus
Concurrent edits/sync must not overwrite stale snapshots; hidden RLS rows must not yield partial save; unknown historical statuses/numbers never relabel silently; failed loads must not enable empty overwrite; image upload race must block Save/Cancel until references settle.

## Execution record

- Implemented Tasks 1–2 and passed full frontend: 928 PASS / 2 existing skips; local pgTAP 568 PASS; typecheck and build PASS.
- Independent review found two P2s: history Back could bypass discard guard, and replace-only marks were incomplete in read mode. Both reproduced RED and fixed GREEN with data-router navigation blocking and resolved mark/image rendering. No deferred reviewer findings.
- Preview migration 20261004190000 applied to ciwaibtotispazfviims; 327 Preview pgTAP PASS (38 workbench + 289 regression), fixtures rolled back.
- ESLint PASS. Full repository Prettier has pre-existing formatting warnings in three Product Library files and two excluded output JSON files; these unrelated files remain unchanged. Changed-file formatting passes.
- Global table retained to preserve server-side relevance and page boundaries; Order detail lists all children. Existing manually changed Production numbers retained verbatim, never guessed or renumbered.
- Browser and deployment verification follow the committed change; final evidence saved under excluded output/production-workbench-20261004/.
