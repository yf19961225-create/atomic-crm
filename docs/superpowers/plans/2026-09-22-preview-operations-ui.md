# Preview Operations UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver safe, dense Preview-only operations UI for Packing, Production, numeric inputs, Calendar, and Product Library.

**Architecture:** Retain existing Supabase resources and snapshots. Use canonical UI column definitions for Packing and Product Library; change Production creation from supplier grouping to one document; add an app-level numeric wheel guard; replace the calendar list with FullCalendar backed by `romiku_calendar`.

**Tech Stack:** React 19, React Router 7, TanStack Query, React Admin data provider, Tailwind CSS 4, Vitest Browser/Playwright, FullCalendar React with day-grid, time-grid, and interaction plugins.

**Spec:** `docs/superpowers/specs/2026-09-22-preview-operations-ui-design.md`

## Global Constraints

- Preview-only: never deploy or migrate Production, mutate Production Supabase, change `crm2.romiku.com`, or write to Sanity.
- Do not commit `.gitignore`, `.vitest-attachments/`, `.env`, credentials, or secrets.
- Do not change historical Production supplier values; new Production headers use null supplier fields.
- No schema migration is expected.

## Review Focus

- Wheel on focused number input blurs it without stopping normal page scrolling or altering its value.
- One multi-product Production submit creates exactly one header and all selected snapshots under it.
- Packing row remains exactly fourteen cells with CBM before editable carton weight.
- Week/day Calendar clicks retain local date and time in a new manual task.
- Long or absent Product Library note does not shift preceding columns.

### Task 1: Shared numeric input guard

**Files:**
- Create: `src/components/romiku/shared/numericInputGuard.ts`
- Create: `src/components/romiku/shared/numericInputGuard.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/index.css`

**Interfaces:**
- `installNumericInputWheelGuard(root: Document): () => void` blurs only a focused native number input upon wheel.
- `App` installs the guard once and cleans it up on unmount.

- [ ] Write the failing test: focus an input containing `12.5`, dispatch a cancelable `WheelEvent`, assert its value is still `12.5`, it is blurred, and `defaultPrevented === false`. Also assert decimal text, Tab focus advancement, and Enter dispatch are unaffected.
- [ ] Run:
  ~~~sh
  npx vitest --config vitest.config.ts --run --project app src/components/romiku/shared/numericInputGuard.test.tsx
  ~~~
  Expected: FAIL because the module is absent.
- [ ] Implement the capture listener. It checks `target instanceof HTMLInputElement && target.type === "number" && root.activeElement === target`, then calls `target.blur()`; it must never call `preventDefault()`. Add browser-specific spinner suppression to `src/index.css`.
- [ ] Re-run the focused test. Expected: PASS.
- [ ] Commit:
  ~~~sh
  git add src/App.tsx src/index.css src/components/romiku/shared/numericInputGuard.ts src/components/romiku/shared/numericInputGuard.test.tsx
  git commit -m "fix: guard CRM numeric inputs from wheel changes"
  ~~~

### Task 2: Canonical Packing grid columns

**Files:**
- Modify: `src/components/romiku/packing/PackingItemsGrid.tsx`
- Create: `src/components/romiku/packing/PackingItemsGrid.test.tsx`
- Modify: `src/components/romiku/packing/packingWorkflow.test.ts`

**Interfaces:**
- A `packingColumns` definition controls `colgroup`, header, row order, and footer.
- Existing staged `savePackingItem` and Cancel behavior remain unchanged.

- [ ] Write the failing component regression: render one row with quantity 23, cartons 2, Qty/Ctn 12, dimensions 50/40/30, weight 12.5. Assert the values after height are exactly `0.060 m³`, `0.120 m³`, editable `12.5`, and `25.00 kg`; neither CBM field is an input and mismatch warning does not disable Save.
- [ ] Run:
  ~~~sh
  npx vitest --config vitest.config.ts --run --project app src/components/romiku/packing/PackingItemsGrid.test.tsx
  ~~~
  Expected: FAIL because carton weight currently renders before the two calculated CBM cells.
- [ ] Split editable fields around derived cells and render the exact fourteen-column order:
  `No. | SKU | Product name | Image | Total quantity | Cartons | Qty/Ctn | Length | Width | Height | Per-carton CBM | Total CBM | Carton weight | Total weight`.
  Add matching fixed `<colgroup>` widths. CBM and total-weight cells are text only.
- [ ] Add formula-level workflow assertions for 0.060, 0.120, and 25.00 without altering snapshot and overpacking tests.
- [ ] Run:
  ~~~sh
  npx vitest --config vitest.config.ts --run --project app src/components/romiku/packing/PackingItemsGrid.test.tsx src/components/romiku/packing/packingWorkflow.test.ts
  ~~~
  Expected: PASS.
- [ ] Commit:
  ~~~sh
  git add src/components/romiku/packing/PackingItemsGrid.tsx src/components/romiku/packing/PackingItemsGrid.test.tsx src/components/romiku/packing/packingWorkflow.test.ts
  git commit -m "fix: align packing calculation columns"
  ~~~

### Task 3: One-Production creation workflow

**Files:**
- Modify: `src/components/romiku/production/ProductionCreate.tsx`
- Modify: `src/components/romiku/production/productionWorkflow.ts`
- Modify: `src/components/romiku/production/productionWorkflow.test.ts`
- Modify: `src/components/romiku/production/FulfillmentPages.tsx`
- Modify: `src/components/romiku/production/fulfillment.test.tsx`

**Interfaces:**
- `ProductionSelection` has only `itemId` and `quantity`.
- `createProductionOrders(provider, orderId, selections)` returns exactly one new Production with all selected items.

- [ ] Replace supplier-group tests with three source items and assert one new header, null supplier fields, and three related production items. Add UI assertions for exactly `选择 | SKU / 产品 | 订单数量 | 生产数量` and no supplier controls. Assert a historical record's supplier fields are not present in an edit payload for another detail field.
- [ ] Run:
  ~~~sh
  npx vitest --config vitest.config.ts --run --project app src/components/romiku/production/productionWorkflow.test.ts src/components/romiku/production/fulfillment.test.tsx
  ~~~
  Expected: FAIL because current code queries and groups suppliers.
- [ ] Remove supplier query, controls, and explanatory copy from create; validate all items belong to the order before creating one `status: "pending"` header with null supplier fields; write all selected item snapshots under it. Remove Production supplier UI from list/detail and exclude supplier fields from details update data. Do not alter numbering.
- [ ] Re-run focused tests. Expected: PASS.
- [ ] Commit:
  ~~~sh
  git add src/components/romiku/production/ProductionCreate.tsx src/components/romiku/production/productionWorkflow.ts src/components/romiku/production/productionWorkflow.test.ts src/components/romiku/production/FulfillmentPages.tsx src/components/romiku/production/fulfillment.test.tsx
  git commit -m "feat: create one production per selected batch"
  ~~~

### Task 4: FullCalendar visual calendar

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/components/romiku/calendar/RomikuCalendar.tsx`
- Modify: `src/components/romiku/calendar/ManualTasks.tsx`
- Create: `src/components/romiku/calendar/RomikuCalendar.test.tsx`
- Modify: `src/components/romiku/workbench/actionCenter.test.tsx`

**Interfaces:**
- Adds `@fullcalendar/react`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, and `@fullcalendar/interaction`.
- Calendar maps every `SourceEvent` to FullCalendar event data with local start/all-day semantics and an existing detail URL.
- New manual tasks accept an optional local ISO `due` query value.

- [ ] Write failing FullCalendar-mock tests asserting `initialView: "dayGridMonth"`, `firstDay: 1`, day/week/month plugins, previous/next/today controls, `dayMaxEvents`, owner/source filtering, source navigation on event click, month date prefill, and week/day local datetime prefill.
- [ ] Run:
  ~~~sh
  npx vitest --config vitest.config.ts --run --project app src/components/romiku/calendar/RomikuCalendar.test.tsx
  ~~~
  Expected: FAIL because the FullCalendar integration is absent.
- [ ] Install:
  ~~~sh
  npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
  ~~~
  Expected: only the four calendar dependencies and lockfile change.
- [ ] Replace current date/list sections with FullCalendar, preserving owner/source filters and refresh. Configure Monday-first month default, week/day switch, overflow `+N more`, local all-day/timed mapping, source navigation, and dateClick navigation. In `ManualTaskPage`, apply `due` only when creating a new task, never when editing.
- [ ] Run:
  ~~~sh
  npx vitest --config vitest.config.ts --run --project app src/components/romiku/calendar/RomikuCalendar.test.tsx src/components/romiku/workbench/actionCenter.test.tsx
  ~~~
  Expected: PASS.
- [ ] Commit:
  ~~~sh
  git add package.json package-lock.json src/components/romiku/calendar/RomikuCalendar.tsx src/components/romiku/calendar/ManualTasks.tsx src/components/romiku/calendar/RomikuCalendar.test.tsx src/components/romiku/workbench/actionCenter.test.tsx
  git commit -m "feat: show calendar events in a visual grid"
  ~~~

### Task 5: Product Library column contract

**Files:**
- Modify: `src/components/romiku/products/SanityCatalogList.tsx`
- Modify: `src/components/romiku/products/SanityCatalogList.test.tsx`
- Modify: `src/components/romiku/products/productProcurementOverlay.test.ts`

**Interfaces:**
- `catalogColumns` drives `colgroup`, headers, and the eight body cells.
- Existing preferred-or-single supplier overlay remains the source of procurement data.

- [ ] Add failing tests for eight `<col>` elements and exact ordered header/body semantics. Add preferred, single-supplier, Sanity-cartonQty-only, missing-dimension/weight, and CBM-from-dimensions-only cases.
- [ ] Run:
  ~~~sh
  npx vitest --config vitest.config.ts --run --project app src/components/romiku/products/SanityCatalogList.test.tsx src/components/romiku/products/productProcurementOverlay.test.ts
  ~~~
  Expected: FAIL because no shared physical column layout exists.
- [ ] Add a fixed-width `<colgroup>`: image/SKU/numeric columns narrow, dimensions/CBM/weight medium, supplier wider, note flexible. Derive header and body order from same metadata and preserve right numeric alignment. Do not persist CBM or duplicate Sanity source data.
- [ ] Re-run focused tests. Expected: PASS.
- [ ] Commit:
  ~~~sh
  git add src/components/romiku/products/SanityCatalogList.tsx src/components/romiku/products/SanityCatalogList.test.tsx src/components/romiku/products/productProcurementOverlay.test.ts
  git commit -m "fix: align compact product library columns"
  ~~~

### Task 6: Verification and Preview-only acceptance

**Files:**
- Modify only scoped task files if a verification failure exposes a defect.

- [ ] Run full browser/app suite serially:
  ~~~sh
  npx vitest --config vitest.config.ts --run --project app --maxWorkers=1 --no-file-parallelism --testTimeout=15000 --hookTimeout=15000 --reporter=verbose
  ~~~
  Expected: PASS without a hanging worker.
- [ ] Run schema suite:
  ~~~sh
  npx --no-install supabase test db
  ~~~
  Expected: PASS; no migrations are created or applied.
- [ ] Run:
  ~~~sh
  npm run typecheck && npm run lint && npm run build
  ~~~
  Expected: PASS.
- [ ] Commit only scoped verification fixes if needed.
- [ ] Push only `codex/commercial-line-items-v2`, wait for its Vercel Preview, and do not promote it.
- [ ] Manually verify Preview: exact Packing formula cell placement; one multi-item Production and P-sequence; spinner-free wheel-safe fields with normal scrolling; Calendar toolbar/overflow/filter/click routes; and Product Library alignment, precedence, and image modal.

